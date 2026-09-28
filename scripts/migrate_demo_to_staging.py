"""Copy a consistent local snapshot into the explicitly selected cloud staging workspace."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime,timezone
from uuid import uuid4
from supabase_admin import query


def http(url,headers,body=None,method='GET'):
    request=urllib.request.Request(url,headers=headers,data=body,method=method)
    with urllib.request.urlopen(request,timeout=60) as response:return response.read()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--staging',action='store_true',required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    private=Path.home()/'.config/buildappraisal'
    backup=private/'backups/20260927-g1-local.sqlite'
    if not backup.exists():
        with sqlite3.connect((root/'.appraisal-data/appraisal.sqlite').as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(backup) as target:
            source.backup(target)
    projects={p['id']:p for p in query('select id,title,code,province_code,department from public.projects')}
    admin=json.loads((private/'admin-bootstrap.json').read_text(encoding='utf-8'))
    con=sqlite3.connect(backup.as_uri()+'?mode=ro',uri=True)
    rows=con.execute('select id,payload from cases order by rowid').fetchall()
    invalid=[];file_count=0
    for id,payload in rows:
        case=json.loads(payload)
        if case.get('projectId') and case['projectId'] not in projects:invalid.append(id)
        for doc in case['documents']:
            data=con.execute('select data from files where case_id=? and id=?',(id,doc['id'])).fetchone()
            if not data or hashlib.sha256(data[0]).hexdigest()!=doc['hash']:raise RuntimeError('Local file verification failed.')
            file_count+=1
    if invalid:raise RuntimeError(f'{len(invalid)} project references need manual mapping.')
    print(json.dumps({'snapshot_cases':len(rows),'snapshot_files':file_count,'project_links_valid':True,'apply':args.apply}),flush=True)
    if not args.apply:return
    ref=os.environ['SUPABASE_PROJECT_REF'];base=f'https://{ref}.supabase.co'
    keys=json.loads(http(f'https://api.supabase.com/v1/projects/{ref}/api-keys',{'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']}))
    service=next(k['api_key'] for k in keys if k['name']=='service_role')
    headers={'apikey':service,'Authorization':'Bearer '+service,'Content-Type':'application/octet-stream','x-upsert':'false'}
    quote=lambda value:"'"+str(value).replace("'","''")+"'"
    manifest_path=private/'backups/20260927-g1-import-manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else []
    def upload(item):
        case_id,doc_id,data,digest=item
        path='/storage/v1/object/appraisal-originals/'+case_id+'/'+doc_id
        try:http(base+path,headers,data,'POST')
        except urllib.error.HTTPError as error:
            if error.code not in (400,409):raise RuntimeError('Storage migration failed.') from None
            existing=http(base+'/storage/v1/object/authenticated/appraisal-originals/'+case_id+'/'+doc_id,headers)
            if hashlib.sha256(existing).hexdigest()!=digest:raise RuntimeError('Existing object differs from snapshot.')
        return doc_id
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index,(case_id,source) in enumerate(rows):
            source_hash=hashlib.sha256(source.encode()).hexdigest()
            found=query('select payload->\'migration\' as migration from public.appraisal_cases where id='+quote(case_id)+'::uuid')
            if found:
                if (found[0]['migration'] or {}).get('sourceSha256')!=source_hash:raise RuntimeError('Cloud case conflict; no overwrite performed.')
                continue
            case=json.loads(source)
            files=[(case_id,d['id'],con.execute('select data from files where id=? and case_id=?',(d['id'],case_id)).fetchone()[0],d['hash']) for d in case['documents']]
            list(pool.map(upload,files))
            project=projects.get(case.get('projectId'))
            case['tenantId']='DB';case['department']=project['department'] if project else 'Phòng Quản lý Xây dựng'
            if project:case.update(projectName=project['title'],projectCode=project['code'])
            case.setdefault('procedure','bcnckt')
            case['migration']={'source':'local-demo-snapshot','sourceSha256':source_hash,'sourceRevision':case['revision'],'environment':'staging'}
            case['revision']+=1
            event={'id':str(uuid4()),'at':datetime.now(timezone.utc).isoformat(),'actor':'Quản trị hệ thống',
                   'action':'Di chuyển dữ liệu sang môi trường thử nghiệm',
                   'detail':'Giữ bản gốc, lịch sử và kết quả đã có; hồ sơ mô phỏng không phải kết quả pháp lý.'}
            case['audit'].append(event)
            if (case.get('job') or {}).get('status')=='running':
                case['job']['status']='interrupted';case['status']='intake'
            payload=quote(json.dumps(case,ensure_ascii=False))+'::jsonb'
            project_sql=quote(case['projectId']) if case.get('projectId') else 'null'
            sql=f"""begin;
              insert into public.appraisal_cases(id,province_id,department,revision,payload,project_id,procedure,created_at,updated_at)
              values({quote(case_id)}::uuid,'DB',{quote(case['department'])},{case['revision']},{payload},{project_sql},{quote(case['procedure'])},
                     {quote(case['createdAt'])}::timestamptz,{quote(case['updatedAt'])}::timestamptz);
              insert into public.appraisal_audit_logs(case_id,actor_id,actor_name,revision,event)
              select id,{quote(admin['user_id'])}::uuid,'Quản trị hệ thống',revision,payload->'audit'->-1
              from public.appraisal_cases where id={quote(case_id)}::uuid;
              insert into public.appraisal_ai_logs(case_id,actor_id,run_id,run)
              select id,'00000000-0000-4000-8000-000000000001'::uuid,r->>'id',r
              from public.appraisal_cases c cross join lateral jsonb_array_elements(c.payload->'runs') r
              where c.id={quote(case_id)}::uuid;
              commit;"""
            query(sql,False)
            manifest.append({'caseId':case_id,'sourceSha256':source_hash,'files':[d['id'] for d in case['documents']]})
            manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
            if (index+1)%10==0:print(json.dumps({'migrated':index+1,'total':len(rows)}),flush=True)
    print(json.dumps({'completed':True,'cases':len(rows),'files':file_count}),flush=True)


if __name__=='__main__':main()
