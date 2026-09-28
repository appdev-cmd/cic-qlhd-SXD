import base64
import hashlib
import os
from pathlib import Path
from typing import Literal
from datetime import date
from uuid import UUID
import json
from fastapi import FastAPI, Depends, Header, HTTPException, Response, Query
from pydantic import BaseModel, ConfigDict, Field
from .domain import new_case, uid, now, audit, invalidate, FIELDS
from .ingestion import read_document, extract_facts, number, checklist_candidates
from .rules import analyze, RULE_VERSION
from .store import Store, actor_for, MODE
from .provider import configured, semantic_notes, provider_id, model_name, status as provider_status, check_connection, record_connection
from .vertex import VertexError
from .legal import legal_overview, resolve_profile, legal_checklist

app=FastAPI(title='BuildAppraisal worker',docs_url=None,redoc_url=None)
SECRET=os.getenv('APPRAISAL_INTERNAL_TOKEN','')
if not SECRET:
    raise RuntimeError('APPRAISAL_INTERNAL_TOKEN is required. Use pnpm dev:appraisal.')

class Payload(BaseModel):
    model_config=ConfigDict(extra='forbid')

class TestLogin(Payload):
    role:Literal['officer','head_of_department','director','admin']

class LegalQuestion(Payload):
    question:str=Field(min_length=5,max_length=2000)
    useModel:bool=True

class CatalogMutation(Payload):
    revision:int=Field(default=1,ge=1)
    values:dict=Field(max_length=30)

class CreateCase(Payload):
    name:str=Field(min_length=3,max_length=300)
    province:str=Field(min_length=2,max_length=100)
    legalDate:date
    projectId:str|None=None
    procedure:Literal['bcnckt','gpxd','nghiem_thu']='bcnckt'
    projectName:str|None=Field(default=None,max_length=500)
    projectCode:str|None=Field(default=None,max_length=100)

class CreateProject(Payload):
    code:str=Field(min_length=3,max_length=100)
    title:str=Field(min_length=3,max_length=500)
    field:str=Field(min_length=2,max_length=100)
    group_type:Literal['A','B','C','QG']
    grade:Literal['I','II','III','IV','DB']
    investment_cost:int=Field(ge=0,le=9_000_000_000_000_000)
    investor_id:str|None=Field(default=None,max_length=100)
    location:str=Field(min_length=2,max_length=300)

class Mutation(Payload):
    revision:int=Field(ge=1)

class Supplement(Mutation):
    requestId:UUID
    name:str=Field(min_length=3,max_length=300)
    legalDate:date
    reason:str=Field(min_length=10,max_length=3000)

class ProjectLink(Mutation):
    projectId:str=Field(min_length=1,max_length=100)
    projectName:str=Field(min_length=3,max_length=500)
    projectCode:str=Field(min_length=1,max_length=100)

class Upload(Mutation):
    requirementId:str=Field(max_length=80)
    name:str=Field(min_length=1,max_length=240)
    contentBase64:str=Field(max_length=26_000_000)
    role:Literal['submission','reference']='submission'

class PrepareUpload(Mutation):
    requirementId:str=Field(min_length=1,max_length=80)
    name:str=Field(min_length=1,max_length=240)
    size:int=Field(ge=1,le=18*1024*1024)
    sha256:str=Field(pattern='^[a-f0-9]{64}$')
    role:Literal['submission','reference']='submission'

class FactReview(Mutation):
    decision:Literal['confirmed','rejected']
    value:str=Field(max_length=500)
    note:str=Field(min_length=1,max_length=1500)

class RunRequest(Mutation):
    mode:Literal['intake','comparison']='intake'
    useModel:bool=False

class Review(Mutation):
    decision:Literal['accept','reject','defer']
    note:str=Field(min_length=3,max_length=3000)

class RequirementReview(Mutation):
    status:Literal['submitted','verified','needs_supplement']
    note:str=Field(min_length=3,max_length=2000)

class AddRequirement(Mutation):
    name:str=Field(min_length=3,max_length=200)
    category:str=Field(min_length=2,max_length=80)

class AcceptChecklist(Mutation):
    candidateId:str=Field(max_length=80)

class Consultation(Mutation):
    text:str=Field(min_length=3,max_length=3000)
    response:str=Field(max_length=4000,default='')

class FinalReview(Mutation):
    decision:Literal['request_supplement','reviewed']
    note:str=Field(min_length=3,max_length=3000)

class ReopenReview(Mutation):
    note:str=Field(min_length=10,max_length=3000)

class WorkflowCommand(Mutation):
    action:Literal['start','request_supplement','submit_review','return','approve','schedule_visit','require_correction','confirm_correction']
    note:str=Field(min_length=10,max_length=3000)
    visitDate:date|None=None

class Assignment(Mutation):
    assigneeId:UUID
    note:str=Field(min_length=10,max_length=3000)
    deadline:date|None=None

class LegalContextReview(Mutation):
    submissionDate:date
    scope:Literal['construction','decision_maker','concurrent','unknown']
    stage:Literal['original','amendment','remaining_phase']
    priorStatus:Literal['unknown','eligible_pending','ineligible','result_ineligible','result_eligible']
    note:str=Field(min_length=10,max_length=3000)

class LegalRequirementReview(Mutation):
    applicability:Literal['applicable','not_applicable','unknown']
    requirementIds:list[str]=Field(max_length=30)
    note:str=Field(min_length=10,max_length=3000)

def store(x_internal_token:str=Header(default=''),authorization:str=Header(default='')):
    import hmac
    if not hmac.compare_digest(x_internal_token,SECRET):
        raise HTTPException(403,'Chỉ nhận yêu cầu qua Core API.')
    return Store(authorization,actor_for(authorization))

def require_appraisal(case):
    if case.get('procedure','bcnckt') != 'bcnckt':
        raise HTTPException(422,'Chức năng thẩm định BCNCKT không áp dụng cho loại hồ sơ này.')

def writable(s):
    if s.actor['role'] not in ['officer','head_of_department','director','admin']:
        raise HTTPException(403,'Tài khoản không có quyền sửa hồ sơ.')

def edit(s,id,revision):
    writable(s)
    case=s.get(id)
    if case['revision']!=revision:
        raise HTTPException(409,'Hồ sơ đã thay đổi. Tải lại trước khi lưu.')
    if s.has_successor(id):
        raise HTTPException(409,'Lần nộp này đã có lần bổ sung; mở lần mới nhất để xử lý.')
    assigned=case.get('workflow',{}).get('assigneeId')
    if assigned and assigned!=s.actor['id'] and s.actor['role']=='officer':
        raise HTTPException(403,'Hồ sơ đã phân công chuyên viên khác.')
    if case.get('finalReview'):
        raise HTTPException(409,'Hồ sơ đã khóa sau rà soát. Cần người có thẩm quyền mở lại trước khi sửa.')
    return case

def save(s,case,expected,action,detail):
    case['revision']=expected+1
    case['updatedAt']=now()
    audit(case,s.actor,action,detail)
    return s.save(case,expected)

@app.get('/v1/health')
def health(s:Store=Depends(store)):
    from .ocr import available
    return {'status':'ok','mode':MODE,'modelConfigured':configured(),'modelProvider':provider_status(),'actor':s.actor,
            'formats':['pdf','docx','txt'],'ocrAvailable':available()}

@app.get('/v1/runtime')
def runtime(x_internal_token:str=Header(default='')):
    import hmac
    if not hmac.compare_digest(x_internal_token,SECRET):raise HTTPException(403,'Chỉ nhận yêu cầu qua Core API.')
    return {'mode':MODE,'environment':os.getenv('APPRAISAL_ENVIRONMENT','demo' if MODE=='demo' else 'staging'),'authenticationRequired':MODE!='demo'}

def test_login_guard(token,local):
    import hmac
    if not hmac.compare_digest(token,SECRET) or local!='true':raise HTTPException(403,'Chỉ cho phép đăng nhập thử nghiệm từ máy cục bộ.')

@app.get('/v1/test-login/accounts')
def test_accounts(x_internal_token:str=Header(default=''),x_local_test_login:str=Header(default='')):
    test_login_guard(x_internal_token,x_local_test_login)
    from .test_login import options
    return {'accounts':options()}

@app.post('/v1/test-login')
def login_test_account(body:TestLogin,x_internal_token:str=Header(default=''),x_local_test_login:str=Header(default='')):
    test_login_guard(x_internal_token,x_local_test_login)
    from .test_login import login
    return login(body.role)

@app.get('/v1/projects')
def projects(s:Store=Depends(store),search:str=Query(default='',max_length=200),offset:int=Query(default=0,ge=0),
             limit:int=Query(default=50,ge=1,le=100),stage:str='',group:str='',status:str=''):
    return s.projects(search,offset,limit,stage,group,status)

@app.get('/v1/catalog/{kind}')
def catalog_page(kind:Literal['organizations','personnel','material_prices'],s:Store=Depends(store),
    search:str=Query(default='',max_length=200),category:str='',status:str='',offset:int=Query(default=0,ge=0),
    limit:int=Query(default=50,ge=1,le=100),sort:str='',direction:Literal['asc','desc']='asc'):
    from .catalog import page
    return page(s,kind,search,category,status,offset,limit,sort,direction)

@app.post('/v1/catalog/{kind}')
def create_catalog(kind:Literal['organizations','personnel','material_prices'],body:CatalogMutation,s:Store=Depends(store)):
    from .catalog import write
    return write(s,kind,body)

@app.patch('/v1/catalog/{kind}/{id}')
def update_catalog(kind:Literal['organizations','personnel','material_prices'],id:str,body:CatalogMutation,s:Store=Depends(store)):
    from .catalog import write
    return write(s,kind,body,id)

@app.get('/v1/catalog/{kind}/{id}/history')
def catalog_history(kind:Literal['organizations','personnel','material_prices'],id:str,offset:int=Query(default=0,ge=0),s:Store=Depends(store)):
    from .catalog import history
    return history(s,kind,id,offset)

@app.get('/v1/dashboard')
def dashboard_summary(s:Store=Depends(store),kind:Literal['all','sample','real']='all'):
    from .catalog import dashboard
    return dashboard(s,kind)

@app.post('/v1/legal-assistant')
def ask_legal(body:LegalQuestion,s:Store=Depends(store)):
    from .legal_assistant import ask
    return ask(s,body.question,body.useModel)

@app.get('/v1/legal-assistant/evaluation')
def legal_evaluation(s:Store=Depends(store)):
    from .legal_assistant import evaluation
    return evaluation()

@app.get('/v1/projects/{id}')
def project_detail(id:str,s:Store=Depends(store)):
    return s.project(id)

@app.post('/v1/projects')
def create_project(body:CreateProject,s:Store=Depends(store)):
    writable(s)
    if MODE=='demo':raise HTTPException(422,'Tạo dự án cần môi trường cloud và tài khoản được phân quyền.')
    from .database import connection
    from psycopg.types.json import Jsonb
    with connection(s.actor['id']) as con:
        return con.execute('select public.create_appraisal_project(%s) as project',(Jsonb(body.model_dump()),)).fetchone()['project']

@app.get('/v1/organizations/options')
def organization_options(search:str=Query(default='',max_length=200),s:Store=Depends(store)):
    return s.organization_options(search)

@app.get('/v1/entities/{kind}/{id}')
def entity_detail(kind:Literal['organization','personnel'],id:str,s:Store=Depends(store)):
    return s.entity(kind,id)

@app.get('/v1/projects/{id}/audit')
def project_audit(id:str,offset:int=Query(default=0,ge=0),limit:int=Query(default=50,ge=1,le=100),s:Store=Depends(store)):
    return s.project_audit(id,offset,limit)

@app.get('/v1/submissions')
def submissions(s:Store=Depends(store),offset:int=Query(default=0,ge=0),limit:int=Query(default=50,ge=1,le=100),
        procedure:Literal['bcnckt','gpxd','nghiem_thu']|None=None,projectId:str|None=Query(default=None,max_length=100),
        search:str=Query(default='',max_length=200),kind:str='',status:str='',dateFrom:str='',dateTo:str='',sort:str='updatedAt',direction:str='desc'):
    return s.page(offset,limit,procedure,projectId,search,kind,status,dateFrom,dateTo,sort,direction)

@app.post('/v1/model/check')
def model_check(s:Store=Depends(store)):
    writable(s)
    if provider_id()!='vertex': raise HTTPException(422,'Chưa chọn nhà cung cấp Vertex AI.')
    return check_connection()

@app.post('/v1/cases/{id}/uploads')
def prepare_upload(id:str,body:PrepareUpload,s:Store=Depends(store)):
    from .uploads import prepare
    return prepare(s,edit(s,id,body.revision),body)

@app.post('/v1/cases/{id}/uploads/{upload_id}/finalize')
def finalize_upload(id:str,upload_id:str,s:Store=Depends(store)):
    from .uploads import finalize
    case=s.get(id)
    edit(s,id,case['revision'])
    return finalize(s,case,upload_id,attach,save)

@app.get('/v1/cases')
def cases(s:Store=Depends(store),offset:int=Query(default=0,ge=0),
          procedure:Literal['bcnckt','gpxd','nghiem_thu']|None=None,projectId:str|None=Query(default=None,max_length=100)):
    return [{**{k:c.get(k) for k in ['id','name','province','department','projectId','projectName','projectCode','sample','submissionCode','submissionRound','sampleScenario','legalDate','createdAt','updatedAt','status','revision']},
             'procedure':c.get('procedure','bcnckt'),'documentCount':len(c.get('documents',[]))} for c in s.all(offset,procedure,projectId)]

@app.post('/v1/cases')
def create(body:CreateCase,s:Store=Depends(store)):
    writable(s)
    project=s.project(body.projectId) if body.projectId else None
    if MODE!='demo' and not project:raise HTTPException(422,'Chọn dự án trước khi tạo hồ sơ.')
    case=new_case(body.name,body.province,s.actor,body.legalDate.isoformat(),body.projectId,
                  procedure=body.procedure,project_name=body.projectName,project_code=body.projectCode)
    if project:
        case.update(projectName=project.get('title',project.get('name')),projectCode=project['code'],
                    department=project.get('department',s.actor['department']) if MODE!='demo' else s.actor['department'])
    audit(case,s.actor,'Tạo hồ sơ','Tiếp nhận hồ sơ theo nghiệp vụ và dự án đã chọn.')
    return s.save(case)

@app.post('/v1/cases/{id}/project')
def link_project(id:str,body:ProjectLink,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    old=case.get('projectName') or 'Chưa gắn dự án'
    project=s.project(body.projectId)
    case.update(projectId=project['id'],projectName=project.get('title',project.get('name')),projectCode=project['code'])
    if MODE!='demo':case['department']=project['department']
    invalidate(case)
    return save(s,case,body.revision,'Gắn hồ sơ với dự án',old+' → '+body.projectName+' ('+body.projectCode+'). Cần rà soát lại kết quả sau thay đổi liên kết.')

@app.get('/v1/cases/{id}')
def get_case(id:str,s:Store=Depends(store)):
    case=s.get(id)
    case['readOnly']=s.has_successor(id)
    for run in case['runs']:
        if run['ruleVersion']!=RULE_VERSION:run['stale']=True
    return case

@app.get('/v1/cases/{id}/submissions')
def submission_history(id:str,s:Store=Depends(store),offset:int=Query(default=0,ge=0)):
    return s.lineage(id,offset)

@app.post('/v1/cases/{id}/supplements')
def create_supplement(id:str,body:Supplement,s:Store=Depends(store)):
    writable(s)
    prior=s.get(id)
    fingerprint=hashlib.sha256(json.dumps({'actor':s.actor['id'],'previous':id,
        **body.model_dump(mode='json')},sort_keys=True).encode()).hexdigest()
    try:
        existing=s.get(str(body.requestId))
    except HTTPException as error:
        if error.status_code!=404:raise
    else:
        if existing.get('creationRequest')!=fingerprint:
            raise HTTPException(409,'Yêu cầu tạo lần nộp đã được dùng với nội dung khác.')
        return existing
    if prior['revision']!=body.revision or s.has_successor(id):
        raise HTTPException(409,'Lần nộp đã thay đổi hoặc đã có lần bổ sung. Tải lại hồ sơ.')
    if prior.get('job',{}).get('status')=='running':
        raise HTTPException(409,'Chờ lượt kiểm tra hoàn tất trước khi tạo lần bổ sung.')
    if body.legalDate.isoformat()<prior['legalDate']:
        raise HTTPException(422,'Ngày đánh giá lần bổ sung không được trước lần nộp trước.')
    if not prior.get('projectId'):
        raise HTTPException(422,'Gắn hồ sơ với dự án trước khi tạo lần bổ sung.')
    s.project(prior['projectId'])
    case=new_case(body.name,prior['province'],s.actor,body.legalDate.isoformat(),prior['projectId'],
        sample=prior['sample'],procedure=prior.get('procedure','bcnckt'),
        project_name=prior.get('projectName'),project_code=prior.get('projectCode'))
    case.update(id=str(body.requestId),department=prior['department'],previousSubmissionId=id,
        previousRevision=prior['revision'],previousSubmissionName=prior['name'],
        dossierId=prior.get('dossierId',id),submissionRound=prior.get('submissionRound',1)+1,
        submissionReason=body.reason,creationRequest=fingerprint)
    case['requirements']=[{**r,'status':'missing','note':'','verifiedBy':None} for r in prior['requirements']]
    audit(case,s.actor,'Tạo lần bổ sung',prior['name']+' — '+body.reason)
    return s.save(case)

@app.get('/v1/cases/{id}/legal')
def get_legal(id:str,s:Store=Depends(store)):
    case=s.get(id)
    require_appraisal(case)
    return legal_overview(case)

@app.get('/v1/cases/{id}/workflow')
def workflow_state(id:str,s:Store=Depends(store)):
    from .workflow import state,options,STATES
    case=s.get(id)
    reviewers=[]
    if MODE!='demo':
        from .database import connection
        with connection(s.actor['id']) as con:reviewers=con.execute('select * from public.appraisal_reviewers(%s)',(id,)).fetchall()
    frozen=s.has_successor(id)
    return {'state':state(case),'label':STATES[state(case)],'actions':[] if frozen else options(case,s.actor),
        'reviewers':reviewers,'canAssign':not frozen and not case.get('finalReview') and s.actor['role'] in ('head_of_department','director'),
        'canReopen':not frozen and bool(case.get('finalReview')) and s.actor['role'] in ('head_of_department','director'),
        'workflow':case.get('workflow',{})}

@app.post('/v1/cases/{id}/assignment')
def assign_case(id:str,body:Assignment,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    if s.actor['role'] not in ('head_of_department','director'):raise HTTPException(403,'Chỉ lãnh đạo được phân công.')
    info=workflow_state(id,s)
    target=next((p for p in info['reviewers'] if str(p['id'])==str(body.assigneeId)),None)
    if not target:raise HTTPException(422,'Người được phân công phải đang hoạt động và cùng phạm vi hồ sơ.')
    if body.deadline and body.deadline.isoformat()<case['legalDate']:raise HTTPException(422,'Hạn xử lý không được trước ngày đánh giá.')
    current=case.get('workflow',{});source=info['state']
    case['workflow']={**current,'state':'assigned' if source in ('received','assigned') else source,
        'assigneeId':str(body.assigneeId),'assigneeName':target['full_name'],
        'deadline':body.deadline.isoformat() if body.deadline else None,
        'deadlineBasis':body.note,'history':current.get('history',[])+[{'action':'Phân công','note':target['full_name']+' — '+body.note,'actor':s.actor['name'],'at':now()}]}
    case['assignee']=target['full_name']
    return save(s,case,body.revision,'Phân công xử lý',target['full_name']+' — '+body.note)

@app.post('/v1/cases/{id}/workflow')
def transition_case(id:str,body:WorkflowCommand,s:Store=Depends(store)):
    from .workflow import apply
    case=edit(s,id,body.revision)
    if body.action=='approve' and case.get('procedure','bcnckt')=='bcnckt':validate_final_review(case)
    label=apply(case,s.actor,body.action,body.note,body.visitDate.isoformat() if body.visitDate else None)
    return save(s,case,body.revision,label,body.note)

@app.post('/v1/cases/{id}/legal/context')
def review_legal_context(id:str,body:LegalContextReview,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    require_appraisal(case)
    if body.submissionDate.isoformat()>case['legalDate']:
        raise HTTPException(422,'Ngày trình không được sau ngày đánh giá của hồ sơ.')
    if body.submissionDate.isoformat()>='2026-07-01' and body.priorStatus in ['eligible_pending','ineligible']:
        raise HTTPException(422,'Trạng thái đã trình trước 01/07 không phù hợp ngày trình. Chọn chưa xác định nếu không có hồ sơ chuyển tiếp.')
    case['legalContext']={**body.model_dump(exclude={'revision'},mode='json'),
                          'confirmedBy':s.actor['name'],'confirmedAt':now()}
    invalidate(case)
    return save(s,case,body.revision,'Xác nhận phạm vi pháp lý',body.note)

@app.post('/v1/cases/{id}/legal/requirements/{key}')
def review_legal_requirement(id:str,key:str,body:LegalRequirementReview,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    require_appraisal(case)
    item=next((x for x in legal_checklist(case) if x['id']==key),None)
    if not item:raise HTTPException(404,'Thành phần không thuộc chế độ pháp lý/phạm vi hiện tại.')
    if not item['conditional'] and body.applicability!='applicable':
        raise HTTPException(422,'Thành phần cơ bản không thể đánh dấu không áp dụng.')
    if not set(body.requirementIds).issubset({r['id'] for r in case['requirements']}):
        raise HTTPException(422,'Nhóm tài liệu không thuộc hồ sơ.')
    case.setdefault('legalRequirements',{})[key]={**body.model_dump(exclude={'revision'}),
                                                'reviewedBy':s.actor['name'],'reviewedAt':now()}
    invalidate(case)
    return save(s,case,body.revision,'Đối chiếu thành phần theo pháp luật',item['name']+' — '+body.note)

def attach(s,case,requirement_id,name,data,role='submission',document_id=None,store_file=True):
    req=next((r for r in case['requirements'] if r['id']==requirement_id),None)
    if not req: raise HTTPException(400,'Chọn một thành phần hồ sơ có trong checklist.')
    digest=hashlib.sha256(data).hexdigest()
    if any(d['hash']==digest and d['requirementId']==requirement_id and d['role']==role for d in case['documents']):
        raise HTTPException(409,'Tệp này đã có trong cùng thành phần hồ sơ.')
    segments,warnings,signature=read_document(name,data,ocr_limit=0)
    doc={'id':document_id or uid(),'requirementId':requirement_id,'name':Path(name).name,'role':role,
         'version':1+sum(d['requirementId']==requirement_id and d['role']==role for d in case['documents']),
         'hash':digest,'size':len(data),'uploadedAt':now(),'segments':segments,
         'warnings':warnings,'signature':signature}
    if store_file:s.put_file(case['id'],doc['id'],data)
    case['documents'].append(doc)
    case['facts'].extend(extract_facts(doc))
    if requirement_id=='TTR' and role=='submission':
        case['checklistCandidates']=checklist_candidates(doc)
    if role!='reference':
        req['status']='submitted' if segments and not warnings else 'needs_supplement'
        req['verifiedBy']=None
    invalidate(case)
    return doc

@app.post('/v1/cases/{id}/documents')
def upload(id:str,body:Upload,s:Store=Depends(store)):
    if MODE!='demo':raise HTTPException(422,'Sử dụng phiên tải tài liệu trực tiếp.')
    case=edit(s,id,body.revision)
    try:
        data=base64.b64decode(body.contentBase64,validate=True)
        doc=attach(s,case,body.requirementId,body.name,data,body.role)
    except Exception as exc:
        if isinstance(exc,HTTPException): raise
        raise HTTPException(422,'Không đọc được tệp: '+str(exc)[:200]) from exc
    return save(s,case,body.revision,'Nộp tài liệu',f"{doc['name']} • phiên bản {doc['version']}; bản gốc được giữ nguyên.")

@app.get('/v1/cases/{id}/documents/{doc_id}')
def download(id:str,doc_id:str,s:Store=Depends(store)):
    case=s.get(id)
    doc=next((d for d in case['documents'] if d['id']==doc_id),None)
    if not doc: raise HTTPException(404,'Không có tệp.')
    ext=doc['name'].rsplit('.',1)[-1].lower()
    mime={'pdf':'application/pdf','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','txt':'text/plain; charset=utf-8'}.get(ext,'application/octet-stream')
    return Response(s.file(id,doc_id),media_type=mime,headers={'X-Content-Type-Options':'nosniff'})

@app.post('/v1/cases/{id}/requirements')
def add_requirement(id:str,body:AddRequirement,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    case['requirements'].append({'id':'ADD-'+uid()[:8],'name':body.name,'category':body.category,
        'required':True,'status':'missing','note':'Bổ sung theo danh mục tờ trình/chuyên viên.','verifiedBy':None})
    invalidate(case)
    return save(s,case,body.revision,'Thêm thành phần hồ sơ',body.name)

@app.post('/v1/cases/{id}/checklist/accept')
def accept_checklist(id:str,body:AcceptChecklist,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    candidate=next((c for c in case.get('checklistCandidates',[]) if c['id']==body.candidateId),None)
    if not candidate:raise HTTPException(404,'Không có đề xuất thành phần.')
    if not any(r['id']==candidate['requirementId'] for r in case['requirements']):
        case['requirements'].append({'id':candidate['requirementId'],'name':candidate['name'],'category':candidate['category'],
            'required':True,'status':'missing','note':'Xác nhận từ tờ trình: '+candidate['locator'],'verifiedBy':None})
    candidate['accepted']=True
    invalidate(case)
    return save(s,case,body.revision,'Xác nhận danh mục theo tờ trình',candidate['name'])

@app.patch('/v1/cases/{id}/requirements/{req_id}')
def review_requirement(id:str,req_id:str,body:RequirementReview,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    req=next((r for r in case['requirements'] if r['id']==req_id),None)
    if not req: raise HTTPException(404,'Không có thành phần hồ sơ.')
    if body.status=='verified' and not any(d['requirementId']==req_id and d['role']!='reference' and d['segments'] for d in case['documents']):
        raise HTTPException(422,'Chưa có tài liệu đầu vào để xác nhận.')
    req.update(status=body.status,note=body.note,verifiedBy=s.actor['name'] if body.status=='verified' else None)
    invalidate(case)
    return save(s,case,body.revision,'Kiểm tra thành phần',req['name']+': '+body.note)

@app.patch('/v1/cases/{id}/facts/{fact_id}')
def review_fact(id:str,fact_id:str,body:FactReview,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    fact=next((f for f in case['facts'] if f['id']==fact_id),None)
    if not fact: raise HTTPException(404,'Không có dữ liệu.')
    # UI submits canonical decimal strings, unlike Vietnamese source documents.
    from decimal import Decimal, InvalidOperation
    value=body.value.strip()
    if fact['unit']:
        try:
            n=Decimal(value)
            if not n.is_finite() or abs(n)>=Decimal('1e18'):raise InvalidOperation
            value=str(n)
        except InvalidOperation:raise HTTPException(422,'Nhập số hợp lệ; phần thập phân dùng dấu chấm.')
    if value is None or value=='': raise HTTPException(422,'Giá trị không hợp lệ.')
    old=fact['value']
    fact.update(value=value,reviewStatus=body.decision,reviewedBy=s.actor['name'],reviewNote=body.note)
    invalidate(case)
    return save(s,case,body.revision,'Xác nhận dữ liệu',f"{fact['label']}: {old} → {value}. {body.note}")

def run_analysis(s,id,job_id,mode,use_model,snapshot=None):
    if mode=='ocr':
        from .ocr_jobs import run
        return run(s,id,job_id,snapshot,save)
    try:
        case=snapshot or s.get(id); expected=case['revision']
        result=analyze(case,mode)
        if use_model:
            try:
                result['aiNotes'],result['aiStatus']=semantic_notes(case,result)
                if configured():
                    result['provider']='rules+'+provider_id()
                    result['model']=model_name()
            except Exception as exc:
                message=str(exc) if isinstance(exc,VertexError) else 'Lỗi gọi mô hình hoặc kết quả không hợp lệ.'
                record_connection(False,message)
                result['aiStatus']=message+' Chỉ có kết quả quy tắc; có thể chạy lại.'
        current=s.get(id)
        if current['revision']!=expected or current.get('job',{}).get('id')!=job_id or current.get('job',{}).get('status')!='running':
            return
        current['runs'].append(result);current['status']='analyzed'
        current['job'].update(status='completed',finishedAt=now())
        save(s,current,expected,'Hoàn tất kiểm tra',f"{len(result['findings'])} nhận xét; {result['aiStatus']}")
    except Exception:
        try:
            case=s.get(id)
            if case.get('job',{}).get('id')==job_id:
                expected=case['revision'];case['job']['status']='failed';case['status']='intake'
                save(s,case,expected,'Kiểm tra thất bại','Chưa ghi kết quả mới. Có thể chạy lại.')
        except Exception: pass

@app.on_event('startup')
def start_queue():
    from .jobs import start
    start(run_analysis)

@app.post('/v1/cases/{id}/documents/{doc_id}/ocr')
def start_ocr(id:str,doc_id:str,body:Mutation,s:Store=Depends(store)):
    from .ocr_jobs import prepare
    case=edit(s,id,body.revision)
    path=prepare(s,case,doc_id)
    try:
        result=save(s,case,body.revision,'Đưa tài liệu vào hàng đợi OCR','Đọc trang scan; giữ nguyên bản gốc, dữ liệu trích xuất cần xác nhận lại.')
    except Exception:
        path.unlink(missing_ok=True)
        raise
    start_queue()
    return result

@app.on_event('shutdown')
def stop_queue():
    from .jobs import stop
    stop()

@app.post('/v1/cases/{id}/analysis')
def start_analysis(id:str,body:RunRequest,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    require_appraisal(case)
    if case.get('job',{}).get('status')=='running':
        raise HTTPException(409,'Hồ sơ đang được kiểm tra.')
    job_id=uid()
    case['job']={'id':job_id,'status':'running','startedAt':now(),'mode':body.mode,'useModel':body.useModel};case['status']='analyzing'
    saved=save(s,case,body.revision,'Bắt đầu kiểm tra',f'Phạm vi {body.mode}; mô hình: {body.useModel}')
    start_queue()
    return saved

@app.post('/v1/cases/{id}/cancel')
def cancel(id:str,body:Mutation,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    if case.get('job'): case['job']['status']='cancelled'
    case['status']='intake'
    result=save(s,case,body.revision,'Hủy kiểm tra','Kết quả của lượt đang chạy sẽ không được ghi.')
    if case.get('job',{}).get('mode')=='ocr':
        from .ocr_jobs import spool
        spool(case['job']['id']).unlink(missing_ok=True)
    return result

@app.patch('/v1/cases/{id}/findings/{finding_id}')
def review_finding(id:str,finding_id:str,body:Review,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    if not case['runs'] or case['runs'][-1]['stale']: raise HTTPException(409,'Cần chạy lại kiểm tra trước khi đánh giá.')
    finding=next((f for f in case['runs'][-1]['findings'] if f['id']==finding_id),None)
    if not finding: raise HTTPException(404,'Không có nhận xét trong lượt hiện tại.')
    finding['review']={'decision':body.decision,'note':body.note,'actor':s.actor['name'],'at':now()}
    case['finalReview']=None
    return save(s,case,body.revision,'Đánh giá nhận xét',finding['title']+': '+body.note)

@app.post('/v1/cases/{id}/consultations')
def consultation(id:str,body:Consultation,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    case['consultations'].append({'id':uid(),'text':body.text,'response':body.response,'actor':s.actor['name'],'at':now(),
                                  'status':'responded' if body.response.strip() else 'open'})
    case['finalReview']=None
    return save(s,case,body.revision,'Ghi ý kiến và giải trình',body.text)

def validate_final_review(case):
    if not case['runs'] or case['runs'][-1]['stale'] or case['runs'][-1]['ruleVersion']!=RULE_VERSION:
        raise HTTPException(409,'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.')
    if not resolve_profile(case)['confirmed']:
        raise HTTPException(422,'Cần xác nhận phạm vi và chế độ pháp lý trước khi hoàn tất rà soát.')
    if any(r['applicability']=='unknown' for r in legal_checklist(case)):
        raise HTTPException(422,'Còn thành phần pháp lý chưa xác định điều kiện áp dụng.')
    if any(not f.get('review') or f['review']['decision']=='defer' for f in case['runs'][-1]['findings']):
        raise HTTPException(422,'Còn nhận xét chưa được đánh giá hoặc đang chờ làm rõ.')
    from .domain import latest_documents
    ids={d['id'] for d in latest_documents(case)}
    if any(f['reviewStatus']=='pending' and f['documentId'] in ids for f in case['facts']):
        raise HTTPException(422,'Còn dữ liệu trích xuất chưa được xác nhận.')

@app.post('/v1/cases/{id}/final-review')
def final_review(id:str,body:FinalReview,s:Store=Depends(store)):
    case=edit(s,id,body.revision)
    require_appraisal(case)
    if MODE!='demo' and s.actor['role'] not in ['head_of_department','director']:
        raise HTTPException(403,'Chỉ trưởng phòng hoặc lãnh đạo được hoàn tất rà soát.')
    if not case['runs'] or case['runs'][-1]['stale'] or case['runs'][-1]['ruleVersion']!=RULE_VERSION: raise HTTPException(409,'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.')
    if body.decision=='reviewed':
        validate_final_review(case)
    case['finalReview']={'decision':body.decision,'note':body.note,'actor':s.actor['name'],'at':now(),
                         'simulation':bool(case.get('sample')) or MODE=='demo'}
    case['status']=body.decision
    case['workflow']={**case.get('workflow',{}),'state':'reviewed' if body.decision=='reviewed' else 'awaiting_supplement'}
    return save(s,case,body.revision,'Hoàn tất rà soát nội bộ',body.note)

@app.post('/v1/cases/{id}/reopen')
def reopen_review(id:str,body:ReopenReview,s:Store=Depends(store)):
    writable(s)
    if MODE!='demo' and s.actor['role'] not in ['head_of_department','director']:
        raise HTTPException(403,'Chỉ trưởng phòng hoặc lãnh đạo được mở lại hồ sơ.')
    case=s.get(id)
    if case['revision']!=body.revision:raise HTTPException(409,'Hồ sơ đã thay đổi. Tải lại trước khi lưu.')
    if not case.get('finalReview'):raise HTTPException(409,'Hồ sơ chưa khóa sau rà soát.')
    if s.has_successor(id):raise HTTPException(409,'Mở lần nộp mới nhất để xử lý.')
    case.setdefault('reviewHistory',[]).append(case['finalReview'])
    invalidate(case)
    workflow=case.get('workflow',{})
    case['workflow']={**workflow,'state':'processing','history':workflow.get('history',[])+[
        {'action':'Mở lại để rà soát','actor':s.actor['name'],'at':now(),'note':body.note}]}
    return save(s,case,body.revision,'Mở lại hồ sơ để rà soát',body.note)

@app.get('/v1/cases/{id}/export/{kind}/{format}')
def export_case(id:str,kind:Literal['report','supplement','suspension','notice','decision'],format:Literal['pdf','docx','json'],s:Store=Depends(store)):
    from .reporting import export_document
    case=s.get(id)
    require_appraisal(case)
    if format!='json' and case['runs'] and case['runs'][-1]['ruleVersion']!=RULE_VERSION:
        raise HTTPException(409,'Bộ quy tắc đã cập nhật. Chạy kiểm tra lại trước khi xuất dự thảo.')
    data,mime=export_document(case,kind,format)
    return Response(data,media_type=mime,headers={'Content-Disposition':f'attachment; filename="{kind}.{format}"'})

@app.get('/v1/cases/{id}/internal-record/{format}')
def internal_record(id:str,format:Literal['pdf','docx'],s:Store=Depends(store)):
    from .reporting import document_bytes
    case=s.get(id)
    procedure={'bcnckt':'Thẩm định BCNCKT','gpxd':'Cấp giấy phép xây dựng','nghiem_thu':'Hậu kiểm và nghiệm thu'}[case.get('procedure','bcnckt')]
    blocks=[{'heading':'Thông tin hồ sơ','text':[case['name'],'Dự án: '+str(case.get('projectName') or 'Chưa gắn'),
        'Nghiệp vụ: '+procedure,'Lần nộp: '+str(case.get('submissionRound',1)),'Phòng xử lý: '+case['department'],
        'Phụ trách: '+case.get('assignee','Chưa phân công'),'Phiếu ghi nhận quá trình xử lý nội bộ; chưa ký, chưa cấp số, không thay thế văn bản ban hành.']},
        {'heading':'Danh mục tài liệu','rows':[['STT','Tên tài liệu','Phiên bản']]+[[str(i+1),d['name'],str(d.get('version',1))] for i,d in enumerate(case['documents'])]},
        {'heading':'Quá trình xử lý','rows':[['Thời điểm','Thao tác','Người thực hiện','Nội dung']]+[[date.fromisoformat(a['at'][:10]).strftime('%d/%m/%Y'),a['action'],a['actor'],a['detail']] for a in case['audit']]},
        {'heading':'Ý kiến và giải trình','text':[x['text']+'\nGiải trình: '+(x['response'] or 'Chưa có') for x in case['consultations']]}]
    data=document_bytes('PHIẾU THEO DÕI XỬ LÝ HỒ SƠ',blocks,format,case['sample'])
    return Response(data,media_type='application/pdf' if format=='pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers={'Content-Disposition':f'attachment; filename="phieu-xu-ly.{format}"'})

from .procedure_review import Review as ProcedureReview

@app.get('/v1/cases/{id}/procedure-review')
def procedure_review(id:str,subtype:str|None=None,s:Store=Depends(store)):
    from .procedure_review import specification
    case=s.get(id)
    return {**specification(case,subtype),'review':case.get('procedureReview')}

@app.post('/v1/cases/{id}/procedure-review')
def save_procedure_review(id:str,body:ProcedureReview,s:Store=Depends(store)):
    from .procedure_review import apply
    case=edit(s,id,body.revision);apply(case,s.actor,body)
    return save(s,case,body.revision,'Lưu phiếu rà soát chuyên môn','Đã ghi nhận checklist, dẫn chứng và nội dung theo dõi khắc phục.')

@app.get('/v1/cases/{id}/procedure-review/{kind}/{format}')
def export_procedure_review(id:str,kind:Literal['review','minutes','draft','application'],format:Literal['pdf','docx'],s:Store=Depends(store)):
    from .procedure_review import export_blocks
    from .reporting import document_bytes
    case=s.get(id);title,blocks=export_blocks(case,kind)
    return Response(document_bytes(title,blocks,format,case.get('sample',False)),
        media_type='application/pdf' if format=='pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers={'Content-Disposition':f'attachment; filename="{kind}.{format}"'})

@app.post('/v1/samples/{scenario}')
def import_sample(scenario:Literal['initial','revised'],s:Store=Depends(store)):
    from .samples import sample_documents
    writable(s)
    if MODE!='demo':raise HTTPException(422,'Chỉ nạp bộ mẫu tự động trong môi trường cục bộ.')
    case=new_case('Trường liên cấp Hương Xuân — hồ sơ mô phỏng','Hà Tĩnh',s.actor,'2026-09-27',sample=True,school_template=True)
    audit(case,s.actor,'Tạo bộ hồ sơ mẫu','Dữ liệu mô phỏng; không phải hồ sơ thật hoặc văn bản có giá trị pháp lý.')
    s.save(case)
    try:
        for spec,data in sample_documents(scenario):
            attach(s,case,spec['requirementId'],spec['filename'],data)
        case['runs'].append(analyze(case))
        case['status']='analyzed'
        return save(s,case,1,'Nạp bộ mẫu',f'Kịch bản {scenario}; đọc và kiểm tra lại tài liệu bằng cùng quy trình upload.')
    except Exception as exc:
        raise HTTPException(500,'Không tạo được bộ mẫu; kiểm tra bộ sinh tài liệu.') from exc

@app.get('/v1/samples.zip')
def sample_zip(s:Store=Depends(store)):
    path=Path('output/appraisal/bo-ho-so-mau-bcnckt.zip')
    if not path.exists(): raise HTTPException(404,'Chạy pnpm samples:build để tạo gói tài liệu.')
    return Response(path.read_bytes(),media_type='application/zip',headers={'Content-Disposition':'attachment; filename="bo-ho-so-mau-bcnckt.zip"'})
