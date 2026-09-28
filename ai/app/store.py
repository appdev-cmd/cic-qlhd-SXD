"""Local demo persistence and JWT-scoped Supabase persistence."""
import json
import os
import sqlite3
import unicodedata
from contextlib import contextmanager
from pathlib import Path
import httpx
from fastapi import HTTPException
from .database import connection
from psycopg.types.json import Jsonb

MODE = os.getenv('APPRAISAL_MODE', 'demo')
if MODE=='supabase':MODE='cloud'
if MODE not in ('demo','cloud'):raise RuntimeError('APPRAISAL_MODE must be demo or cloud.')
DATA_DIR = Path(os.getenv('APPRAISAL_DATA_DIR', '.appraisal-data')).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DEMO_ACTOR = {'id':'00000000-0000-4000-8000-000000000001','name':'Chuyên viên mẫu',
              'tenantId':'demo','department':'Phòng thẩm định mẫu','role':'officer'}

@contextmanager
def db():
    con = sqlite3.connect(DATA_DIR / 'appraisal.sqlite', timeout=20)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS files (case_id TEXT, id TEXT PRIMARY KEY, data BLOB NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, actor TEXT NOT NULL, snapshot TEXT NOT NULL, state TEXT NOT NULL DEFAULT \'queued\', attempts INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until REAL, created_at REAL NOT NULL)')
    con.create_function('normalize_search',1,normalize_search)
    from .demo_summary import ensure
    ensure(con)
    try:
        with con:
            yield con
    finally:
        con.close()

def normalize_search(value):
    return ''.join(c for c in unicodedata.normalize('NFD',str(value or '').lower().replace('đ','d'))
                   if unicodedata.category(c)!='Mn')

def remote(path, token, method='GET', **kwargs):
    base = os.getenv('SUPABASE_URL',os.getenv('VITE_SUPABASE_URL','')).rstrip('/')
    key = os.getenv('SUPABASE_ANON_KEY',os.getenv('VITE_SUPABASE_ANON_KEY',''))
    if not base or not key:
        raise HTTPException(503,'Thiếu cấu hình Supabase phía máy chủ.')
    r = httpx.request(method,base+path,headers={'apikey':key,'Authorization':token,**kwargs.pop('headers',{})},timeout=30,**kwargs)
    if r.status_code >= 400:
        # Do not expose database error details or credentials to the browser.
        raise HTTPException(409 if r.status_code==409 else 403 if r.status_code in (401,403) else 503,
                            'Không thể truy cập dữ liệu Supabase. Kiểm tra quyền và migration.')
    return r

def actor_for(token):
    if MODE == 'demo':
        return dict(DEMO_ACTOR)
    if not token.startswith('Bearer '):
        raise HTTPException(401,'Vui lòng đăng nhập bằng tài khoản được phân quyền.')
    user = remote('/auth/v1/user',token).json()
    rows = remote('/rest/v1/profiles',token,params={'id':'eq.'+user['id'],'select':'id,full_name,role,province_id,department,is_active','limit':'1'}).json()
    if not rows or not rows[0].get('is_active') or not rows[0].get('province_id') or not rows[0].get('department'):
        raise HTTPException(403,'Tài khoản chưa được gán tỉnh, phòng ban hoặc đang ngừng hoạt động.')
    p = rows[0]
    return {'id':p['id'],'name':p['full_name'],'tenantId':p['province_id'],'department':p['department'],'role':p['role']}

class Store:
    def __init__(self,token='',actor=None):
        self.token=token
        self.actor=actor or actor_for(token)

    def all(self,offset=0,procedure=None,project_id=None):
        if MODE=='demo':
            clauses=[]; values=[]
            if procedure:
                clauses.append("COALESCE(json_extract(payload,'$.procedure'),'bcnckt')=?")
                values.append(procedure)
            if project_id:
                clauses.append("json_extract(payload,'$.projectId')=?")
                values.append(project_id)
            where=' WHERE '+' AND '.join(clauses) if clauses else ''
            with db() as con:
                return [json.loads(r[0]) for r in con.execute('SELECT payload FROM cases'+where+' ORDER BY rowid DESC LIMIT 100 OFFSET ?',(*values,offset))]
        params={
            'province_id':'eq.'+self.actor['tenantId'],'department':'eq.'+self.actor['department'],
            'select':'payload','order':'created_at.desc','limit':'100','offset':str(offset)}
        if procedure == 'bcnckt':
            params['or']='(payload->>procedure.eq.bcnckt,payload->>procedure.is.null)'
        elif procedure:
            params['payload->>procedure']='eq.'+procedure
        if project_id: params['payload->>projectId']='eq.'+project_id
        return [r['payload'] for r in remote('/rest/v1/appraisal_cases',self.token,params=params).json()]

    def get(self,id):
        if MODE=='demo':
            with db() as con:
                row=con.execute('SELECT payload FROM cases WHERE id=?',(id,)).fetchone()
            if not row:
                raise HTTPException(404,'Không tìm thấy hồ sơ.')
            case=json.loads(row[0])
            if not case.get('dossierId'):
                with db() as con:
                    root=con.execute("""with recursive ancestors(id,previous,depth) as (
                      select id,json_extract(payload,'$.previousSubmissionId'),0 from cases where id=?
                      union all select c.id,json_extract(c.payload,'$.previousSubmissionId'),a.depth+1
                      from cases c join ancestors a on c.id=a.previous where a.depth<1000
                    ) select id,depth from ancestors order by depth desc limit 1""",(id,)).fetchone()
                case.update(dossierId=root[0],submissionRound=root[1]+1)
            return self.with_job_state(case)
        with connection(self.actor['id']) as con:
            rows=con.execute('select payload from public.appraisal_cases where id=%s',(id,)).fetchall()
        if not rows:
            raise HTTPException(404,'Không tìm thấy hồ sơ trong phạm vi quyền.')
        return self.with_job_state(rows[0]['payload'])

    def with_job_state(self,case):
        job=case.get('job') or {}
        if job.get('status')!='running':return case
        if MODE=='demo':
            with db() as con:
                row=con.execute('select state from jobs where id=?',(job['id'],)).fetchone()
                state=row[0] if row else 'stale'
        else:
            with connection(self.actor['id']) as con:
                row=con.execute('select public.read_appraisal_job(%s) as job',(job['id'],)).fetchone()['job']
                state=row['status'] if row else 'stale'
        if state in ('stale','failed','cancelled'):
            from .workflow import derive_status
            case['job']={**job,'status':'interrupted' if state=='stale' else state}
            case['status']=derive_status(case)
        return case

    def calendar(self):
        from .sla import load_calendar
        return load_calendar(self.actor['id'],MODE!='demo')

    def classification(self,case):
        """Project group/grade used for statutory deadlines; empty when unknown."""
        if not case.get('projectId'):return {}
        try:project=self.project(case['projectId'])
        except HTTPException:return {}
        return {'group':project.get('group_type',project.get('projectGroup')),'grade':project.get('grade',project.get('buildingGrade'))}

    def derive(self,case):
        """Recompute derived fields (status, SLA) so every write path stays consistent."""
        from .workflow import derive_status
        from .sla import compute
        case['status']=derive_status(case)
        case['sla']=compute(case,self.calendar(),self.classification(case))
        return case

    def save(self,case,expected=None):
        self.derive(case)
        if MODE=='demo':
            with db() as con:
                con.execute('BEGIN IMMEDIATE')
                if expected is None:
                    predecessor=case.get('previousSubmissionId')
                    if predecessor:
                        row=con.execute('select payload from cases where id=?',(predecessor,)).fetchone()
                        prior=json.loads(row[0]) if row else {}
                        if not prior or any(prior.get(k)!=case.get(k) for k in ['projectId','procedure','tenantId','department','sample']):
                            raise HTTPException(403,'Lần trước không thuộc cùng dự án và phạm vi quyền.')
                        if prior['revision']!=case.get('previousRevision') or con.execute("select 1 from cases where json_extract(payload,'$.previousSubmissionId')=?",(predecessor,)).fetchone():
                            raise HTTPException(409,'Lần trước đã thay đổi hoặc đã có lần bổ sung.')
                        # The API resolves legacy local chains before saving; use that root when absent on disk.
                        case.update(dossierId=prior.get('dossierId',case.get('dossierId',prior['id'])),submissionRound=prior.get('submissionRound',1)+1,previousSubmissionName=prior['name'])
                    else:
                        case.update(dossierId=case['id'],submissionRound=1)
                    con.execute('INSERT INTO cases VALUES (?,?,?)',(case['id'],case['revision'],json.dumps(case,ensure_ascii=False)))
                else:
                    if con.execute("select 1 from cases where json_extract(payload,'$.previousSubmissionId')=?",(case['id'],)).fetchone():
                        raise HTTPException(409,'Lần nộp đã có lần bổ sung; dữ liệu lần trước được giữ nguyên.')
                    cursor=con.execute('UPDATE cases SET revision=?,payload=? WHERE id=? AND revision=?',
                        (case['revision'],json.dumps(case,ensure_ascii=False),case['id'],expected))
                    if cursor.rowcount!=1:
                        raise HTTPException(409,'Hồ sơ đã thay đổi. Tải lại trước khi lưu.')
                job=case.get('job') or {}
                if job.get('status')=='running':
                    import time
                    con.execute('INSERT OR IGNORE INTO jobs(id,case_id,actor,snapshot,created_at) VALUES(?,?,?,?,?)',
                        (job['id'],case['id'],json.dumps(self.actor),json.dumps(case,ensure_ascii=False),time.time()))
                elif job.get('status') in ('completed','cancelled','failed'):
                    con.execute('UPDATE jobs SET state=?,lease_until=NULL WHERE id=?',(job['status'],job['id']))
        else:
            with connection(self.actor['id']) as con:
                case=con.execute('select public.persist_appraisal_case(%s,%s,%s) as payload',
                                 (case['id'],expected,Jsonb(case))).fetchone()['payload']
        job=case.get('job') or {}
        if job.get('mode')=='ocr' and job.get('status') in ('completed','cancelled','failed'):
            from .ocr_jobs import spool
            try:spool(job['id']).unlink(missing_ok=True)
            except OSError:pass
        return case

    def has_successor(self,id):
        if MODE=='demo':
            with db() as con:
                return bool(con.execute("select 1 from cases where json_extract(payload,'$.previousSubmissionId')=? limit 1",(id,)).fetchone())
        with connection(self.actor['id']) as con:
            return bool(con.execute('select 1 from public.appraisal_cases where previous_submission_id=%s limit 1',(id,)).fetchone())

    def lineage(self,id,offset=0):
        case=self.get(id)
        if MODE=='demo':
            with db() as con:
                root=con.execute("""with recursive ancestors(id,previous,depth) as (
                  select id,json_extract(payload,'$.previousSubmissionId'),0 from cases where id=?
                  union all select c.id,json_extract(c.payload,'$.previousSubmissionId'),a.depth+1
                  from cases c join ancestors a on c.id=a.previous where a.depth<1000
                ) select id from ancestors order by depth desc limit 1""",(id,)).fetchone()[0]
        else:root=case['dossierId']
        page=self.page(offset=offset,limit=50,dossier_id=root,sort='submissionRound',direction='asc')
        latest=self.page(limit=1,dossier_id=root,sort='submissionRound',direction='desc')
        page['latestId']=latest['items'][0]['id'] if latest['items'] else id
        return page

    def project(self,id):
        if MODE=='demo':
            path=DATA_DIR/'projects.json'
            projects=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
            project=next((p for p in projects if p['id']==id),None)
        else:
            with connection(self.actor['id']) as con:
                project=con.execute('select * from public.projects where id=%s',(id,)).fetchone()
        if not project: raise HTTPException(404,'Không tìm thấy dự án trong phạm vi quyền.')
        return project

    def projects(self,search='',offset=0,limit=50,stage='',group='',status='',sort='submissionDate',direction='desc'):
        sorts={'name':'title','code':'code','investorName':'investor_name','location':'location_district','totalInvestment':'investment_cost','stage':'stage','slaStatus':'sla_status','submissionDate':'submission_date'}
        sort=sort if sort in sorts else 'submissionDate';direction='asc' if direction=='asc' else 'desc'
        if MODE=='demo':
            path=DATA_DIR/'projects.json'
            rows=json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
            rows=[p for p in rows if normalize_search(search) in normalize_search(' '.join(str(p.get(k,'')) for k in ['name','code','investorName','location']))
                and (not stage or p.get('stage')==stage) and (not group or p.get('projectGroup')==group)
                and (not status or p.get('slaStatus')==status)]
            present=[p for p in rows if p.get(sort) is not None]
            absent=[p for p in rows if p.get(sort) is None]
            present.sort(key=lambda p:(p[sort],p['id']),reverse=direction=='desc')
            absent.sort(key=lambda p:p['id'],reverse=direction=='desc')
            rows=present+absent
            return {'items':rows[offset:offset+limit],'total':len(rows),'offset':offset,'limit':limit}
        clauses=['true']; values=[]
        for column,value in [('stage',stage),("regexp_replace(group_type,'^Nhóm\\s*','','i')",group),('sla_status',status)]:
            if value: clauses.append(column+'=%s'); values.append(value)
        if search:
            clauses.append("public.f_unaccent(lower(concat_ws(' ',title,code,investor_name,location_district))) like %s")
            values.append('%'+normalize_search(search).replace('%','\\%').replace('_','\\_')+'%')
        where=' and '.join(clauses)
        with connection(self.actor['id']) as con:
            total=con.execute('select count(*) as n from public.projects where '+where,values).fetchone()['n']
            rows=con.execute('select id,code,title,lat,lng,field,group_type,grade,investment_cost,investor_id,investor_name,location_district,stage,sla_status,submission_date,deadline,lead_reviewer_name,department,province_code,planning_compliance,standard_compliance,fire_safety_status,estimated_savings,thumbnail_url,images,contractors from public.projects where '+where+' order by '+sorts[sort]+' '+direction+' nulls last,id '+direction+' limit %s offset %s',values+[limit,offset]).fetchall()
        return {'items':rows,'total':total,'offset':offset,'limit':limit}

    def organization_options(self,search=''):
        if MODE=='demo':
            from .catalog import CATALOGS
            from .demo_catalog import page
            return [{'id':r['id'],'name':r['name']} for r in page('organizations',CATALOGS['organizations'],search,'','',0,50,'name','asc')['items']]
        with connection(self.actor['id']) as con:
            return con.execute("select id,name from public.organizations where public.f_unaccent(lower(name)) like %s order by name,id limit 50",
                ('%'+normalize_search(search).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%',)).fetchall()

    def entity(self,kind,id):
        if MODE=='demo':
            from .demo_catalog import entity
            return entity({'organization':'organizations','personnel':'personnel'}[kind],id)
        table={'organization':'organizations','personnel':'personnel'}[kind]
        with connection(self.actor['id']) as con:
            row=con.execute('select * from public.'+table+' where id=%s',(id,)).fetchone()
        if not row:raise HTTPException(404,'Không tìm thấy thực thể trong phạm vi quyền.')
        return row

    def project_audit(self,id,offset=0,limit=50):
        project=self.project(id)
        if MODE=='demo':
            from .gallery import schema
            source=""" from (
              select a.value as event,json_extract(c.payload,'$.name') as name,c.id as case_id
              from cases c,json_each(c.payload,'$.audit') a where json_extract(c.payload,'$.projectId')=?
              union all select json_object('id',id,'at',created_at,'actor',json_extract(actor,'$.name'),
                'action','Bổ sung ảnh','detail',detail),?,null from project_image_audit where project_id=?
            ) events"""
            with db() as con:
                schema(con);values=[id,project.get('name','Dự án'),id]
                total=con.execute('select count(*)'+source,values).fetchone()[0]
                rows=con.execute("select event,name,case_id"+source+" order by json_extract(event,'$.at') desc,json_extract(event,'$.id') limit ? offset ?",values+[limit,offset]).fetchall()
            items=[{**json.loads(r[0]),'caseName':r[1],'caseId':r[2]} for r in rows]
        else:
            source=""" from (
              select a as event,c.payload->>'name' as name,c.id::text as case_id from public.appraisal_cases c
              cross join lateral jsonb_array_elements(c.payload->'audit') a where c.project_id=%s
              union all select jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(u.full_name,'Cán bộ hệ thống'),
                'action',case when a.action='INSERT' then 'Tạo dự án' else 'Cập nhật dự án' end,
                'detail',case when 'images'=any(a.changed_fields) then 'Cập nhật thư viện ảnh' else 'Cập nhật thông tin dự án' end),
                %s,null from public.audit_logs a left join public.staff_users u on u.id=a.actor_id
              where a.table_name='projects' and a.record_id=%s
            ) events"""
            with connection(self.actor['id']) as con:
                values=[id,project['title'],id]
                total=con.execute('select count(*) as n'+source,values).fetchone()['n']
                rows=con.execute("select event,name,case_id"+source+" order by event->>'at' desc,event->>'id' limit %s offset %s",values+[limit,offset]).fetchall()
            items=[{**r['event'],'caseName':r['name'],'caseId':r['case_id']} for r in rows]
        return {'items':items,'total':total,'offset':offset,'limit':limit}

    def _summary_sql(self):
        """Column accessors for the list projection (SQLite summary table or cloud JSONB payload)."""
        nested={'slaDueDate':"payload->'sla'->>'dueDate'",'slaPaused':"(payload->'sla'->>'paused')::boolean",
                'slaCompletedAt':"payload->'sla'->>'completedAt'",'workflowState':"payload->'workflow'->>'state'"}
        if MODE=='demo':
            return (lambda key:'"'+key+'"'),'exists(select 1 from case_summaries n where n."previousSubmissionId"=case_summaries.id)',nested
        return ((lambda key:nested.get(key,"payload->>'"+key+"'")),
                'exists(select 1 from public.appraisal_cases n where n.previous_submission_id=appraisal_cases.id)',nested)

    def _sla_conditions(self,calendar,today):
        """SQL predicate and parameters per SLA state, evaluated against today's date."""
        from .sla import soon_limit
        field,successor,_=self._summary_sql()
        sqlite=MODE=='demo'; mark='?' if sqlite else '%s'
        done=field('slaCompletedAt')+' is not null'
        paused=('coalesce('+field('slaPaused')+',0)=1') if sqlite else 'coalesce('+field('slaPaused')+',false)'
        running='not ('+done+') and not '+successor+' and not '+paused
        due=field('slaDueDate'); soon=soon_limit(calendar,today).isoformat(); now=today.isoformat()
        return {'completed':(done+' and ('+due+' is null or '+field('slaCompletedAt')+'<='+due+')',[]),
            'completed_late':(done+' and '+field('slaCompletedAt')+'>'+due,[]),
            'superseded':('not ('+done+') and '+successor,[]),
            'paused':('not ('+done+') and not '+successor+' and '+paused,[]),
            'unconfigured':(running+' and '+due+' is null',[]),
            'overdue':(running+' and '+due+'<'+mark,[now]),
            'due_soon':(running+' and '+due+'>='+mark+' and '+due+'<='+mark,[now,soon]),
            'on_track':(running+' and '+due+'>'+mark,[soon])}

    def sla_counts(self,kind='all'):
        """Submission counts per SLA state in one aggregate query (dashboard)."""
        from .sla import date
        conditions=self._sla_conditions(self.calendar(),date.today())
        sqlite=MODE=='demo'
        select=','.join('coalesce(sum(case when '+sql+' then 1 else 0 end),0) as n'+str(i) for i,(sql,_) in enumerate(conditions.values()))
        values=[v for _,params in conditions.values() for v in params]
        where=''
        if kind in ('sample','real'):
            where=(' where coalesce(sample,0)='+('1' if kind=='sample' else '0') if sqlite
                   else " where coalesce((payload->>'sample')::boolean,false)="+('true' if kind=='sample' else 'false'))
        if sqlite:
            with db() as con:row=con.execute('select '+select+' from case_summaries'+where,values).fetchone()
        else:
            with connection(self.actor['id']) as con:row=list(con.execute('select '+select+' from public.appraisal_cases'+where,values).fetchone().values())
        return [{'id':key,'total':int(row[i])} for i,key in enumerate(conditions)]

    def page(self,offset=0,limit=50,procedure=None,project_id=None,search='',kind='',status='',date_from='',date_to='',sort='updatedAt',direction='desc',dossier_id=None,sla=''):
        from . import sla as deadlines
        fields=['id','name','province','department','projectId','projectName','projectCode','sample',
                'submissionCode','submissionRound','dossierId','previousSubmissionId','sampleScenario','legalDate','createdAt','updatedAt','status','revision',
                'slaDueDate','slaPaused','slaCompletedAt','workflowState']
        sort=sort if sort in fields+['documentCount','procedure'] else 'updatedAt'
        direction='asc' if direction=='asc' else 'desc'
        sqlite=MODE=='demo'; mark='?' if sqlite else '%s'
        field,successor,nested=self._summary_sql()
        clauses=[]; values=[]
        calendar=self.calendar(); today=deadlines.date.today()
        if sla in deadlines.STATES:
            condition=self._sla_conditions(calendar,today)[sla]
            clauses.append('('+condition[0]+')');values.extend(condition[1])
        if dossier_id:
            if sqlite:
                clauses.append("""id in (with recursive family(id,depth) as (
                  select id,0 from cases where id=? union all
                  select c.id,f.depth+1 from cases c join family f on json_extract(c.payload,'$.previousSubmissionId')=f.id where f.depth<1000
                ) select id from family)""")
            else:clauses.append('dossier_id=%s')
            values.append(dossier_id)
        for key,value in [('procedure',procedure),('projectId',project_id),('status',status)]:
            if value:
                expression="coalesce("+field(key)+",'bcnckt')" if key=='procedure' else field(key)
                clauses.append(expression+'='+mark);values.append(value)
        if kind in ('sample','real'):
            clauses.append(('coalesce('+field('sample')+',0)' if sqlite else "coalesce((payload->>'sample')::boolean,false)")+'='+mark)
            values.append(kind=='sample')
        for value,operator in [(date_from,'>='),(date_to,'<=')]:
            if value: clauses.append(field('legalDate')+operator+mark);values.append(value)
        if search:
            expression=" || ' ' || ".join('coalesce('+field(k)+",'')" for k in ['name','province','projectName','projectCode'])
            norm='normalize_search(searchText)' if sqlite else 'public.f_unaccent(lower('+expression+'))'
            clauses.append(norm+' like '+mark+" escape '\\'")
            values.append('%'+normalize_search(search).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')
        where=' where '+' and '.join(clauses) if clauses else ''
        count_expr='documentCount' if sqlite else "jsonb_array_length(payload->'documents')"
        sort_expr=count_expr if sort=='documentCount' else field(sort)
        if sort=='submissionRound':sort_expr='cast(coalesce('+field(sort)+",'1') as integer)"
        if sqlite:
            projection="json_object("+','.join("'"+k+"',"+field(k) for k in fields)+",'procedure',coalesce("+field('procedure')+",'bcnckt'),'documentCount',"+count_expr+",'hasSuccessor',"+successor+')'
            with db() as con:
                total=con.execute('select count(*) from case_summaries'+where,values).fetchone()[0]
                rows=[json.loads(r[0]) for r in con.execute('select '+projection+' from case_summaries'+where+' order by '+sort_expr+' '+direction+',id '+direction+' limit ? offset ?',values+[limit,offset])]
        else:
            projection="jsonb_build_object("+','.join("'"+k+"',"+(field(k) if k in nested else "payload->'"+k+"'") for k in fields)+",'procedure',coalesce(payload->>'procedure','bcnckt'),'documentCount',"+count_expr+",'hasSuccessor',"+successor+') as summary'
            with connection(self.actor['id']) as con:
                total=con.execute('select count(*) as n from public.appraisal_cases'+where,values).fetchone()['n']
                rows=[r['summary'] for r in con.execute('select '+projection+' from public.appraisal_cases'+where+' order by '+sort_expr+' '+direction+' nulls last,id '+direction+' limit %s offset %s',values+[limit,offset])]
        for row in rows:
            row['slaState']=deadlines.evaluate({'dueDate':row.get('slaDueDate'),'paused':bool(row.get('slaPaused')),
                'completedAt':row.get('slaCompletedAt')},calendar,bool(row.pop('hasSuccessor',False)),today)
        return {'items':rows,'total':total,'offset':offset,'limit':limit}

    def put_file(self,case_id,id,data):
        if MODE=='demo':
            with db() as con:
                con.execute('INSERT INTO files VALUES(?,?,?)',(case_id,id,data))
        else:
            remote('/storage/v1/object/appraisal-originals/'+case_id+'/'+id,self.token,'POST',content=data,
                   headers={'Content-Type':'application/octet-stream','x-upsert':'false'})

    def file(self,case_id,id):
        case=self.get(case_id)
        if not any(d['id']==id for d in case['documents']):
            raise HTTPException(404,'Tệp không thuộc hồ sơ.')
        if MODE=='demo':
            with db() as con:
                row=con.execute('SELECT data FROM files WHERE case_id=? AND id=?',(case_id,id)).fetchone()
            if not row: raise HTTPException(404,'Không tìm thấy bản gốc.')
            return row[0]
        return remote('/storage/v1/object/authenticated/appraisal-originals/'+case_id+'/'+id,self.token).content
