"""Explicit staging integration checks; temporary case and objects are cleaned by exact IDs."""
import hashlib
import json
import os
from pathlib import Path
import time
from uuid import uuid4
import httpx
from supabase_admin import query


def main():
    root=Path(__file__).resolve().parents[1]
    for path in [root/'.env.local',Path.home()/'.config/buildappraisal/runtime.env']:
        for line in path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.startswith('#'):
                key,value=line.split('=',1);os.environ.setdefault(key,value.strip('"\''))
    base='http://127.0.0.1:3001/api/appraisal'
    client=httpx.Client(timeout=60)
    runtime=client.get(base+'/runtime').json()
    assert runtime=={'mode':'cloud','environment':'staging','authenticationRequired':True},'Requires cloud staging.'
    credentials=json.loads((Path.home()/'.config/buildappraisal/admin-bootstrap.json').read_text(encoding='utf-8'))
    url=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_ANON_KEY']
    signed=client.post(url+'/auth/v1/token?grant_type=password',headers={'apikey':key},json={k:credentials[k] for k in ('email','password')})
    assert signed.status_code==200,'Sign-in failed.'
    token=signed.json()['access_token'];headers={'Authorization':'Bearer '+token}
    def request(method,path,body=None,status=200):
        response=client.request(method,base+path,headers=headers,json=body)
        assert response.status_code==status,f'{method} {path.split("?")[0]} returned {response.status_code}, expected {status}.'
        return response.json()
    assert client.get(base+'/projects').status_code==401
    assert client.get(base+'/projects',headers={'x-actor-id':credentials['user_id']}).status_code==401
    for role_headers in [{'apikey':key},{'apikey':key,**headers}]:
        denied=client.post(url+'/rest/v1/rpc/save_appraisal_case',headers=role_headers,json={})
        assert denied.status_code>=400,'Legacy aggregate RPC was exposed.'
    anon=client.get(url+'/rest/v1/projects?select=id&limit=1',headers={'apikey':key})
    assert anon.status_code in (401,403),'Anonymous business data was exposed.'
    projects=request('GET','/projects?limit=2')
    assert projects['total']>=26 and len(projects['items'])==2
    project=projects['items'][0]
    summaries=request('GET','/submissions?limit=2&procedure=gpxd')
    assert summaries['total']>=52 and len(summaries['items'])==2
    audit=request('GET','/projects/'+project['id']+'/audit?limit=2')
    assert audit['total']>0 and len(audit['items'])==2
    from app.database import connection
    from psycopg.types.json import Jsonb
    class Rollback(Exception):pass
    try:
        with connection(credentials['user_id']) as con:
            p=con.execute('select public.create_appraisal_project(%s) as p',(Jsonb({'code':'QA-'+str(uuid4()),'title':'Dự án kiểm thử giao dịch','field':'Dân dụng','group_type':'B','grade':'II','investment_cost':1000000000,'location':'Điện Biên'}),)).fetchone()['p']
            assert p['deadline'] is None and p['planning_compliance'] is None
            assert con.execute('select count(*) as n from public.audit_logs where record_id=%s',(p['id'],)).fetchone()['n']>=1
            raise Rollback()
    except Rollback:pass
    # An unknown Auth identity must see no scoped rows, even through the backend role.
    with connection(str(uuid4())) as con:
        assert con.execute('select count(*) as n from public.projects').fetchone()['n']==0
        assert con.execute('select count(*) as n from public.appraisal_cases').fetchone()['n']==0
    case_id=None;child_id=None;objects=[]
    try:
        case=request('POST','/cases',{'name':'QA staging — hồ sơ tạm kiểm tra tích hợp','province':'Điện Biên','legalDate':'2026-09-27','projectId':project['id']})
        case_id=case['id'];old_revision=case['revision']
        assert case['projectName']==project['title']
        data='Tờ trình kiểm tra tích hợp. Dữ liệu kỹ thuật tạm thời.'.encode('utf-8')
        upload=request('POST',f'/cases/{case_id}/uploads',{'revision':case['revision'],'requirementId':case['requirements'][0]['id'],'name':'qa-staging.txt','size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'role':'submission'})
        objects.append(upload['path'])
        sent=client.put(url+'/storage/v1/object/upload/sign/appraisal-originals/'+upload['path'],params={'token':upload['token']},headers={'apikey':key,**headers,'Content-Type':'text/plain'},content=data)
        assert sent.status_code==200,f'Signed upload failed: {sent.status_code}'
        case=request('POST',f'/cases/{case_id}/uploads/{upload["id"]}/finalize',{})
        assert len(case['documents'])==1 and case['documents'][0]['hash']==hashlib.sha256(data).hexdigest()
        duplicate=request('POST',f'/cases/{case_id}/uploads/{upload["id"]}/finalize',{})
        assert duplicate['revision']==case['revision'] and len(duplicate['documents'])==1
        request('POST',f'/cases/{case_id}/consultations',{'revision':old_revision,'text':'Xung đột phiên bản kiểm thử'},409)
        request('POST',f'/cases/{case_id}/final-review',{'revision':case['revision'],'decision':'request_supplement','note':'Quản trị không có quyền duyệt'},403)
        request('POST',f'/cases/{case_id}/analysis',{'revision':case['revision'],'mode':'intake','useModel':False})
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            case=request('GET',f'/cases/{case_id}')
            if case.get('job',{}).get('status')!='running':break
            time.sleep(1)
        assert case['job']['status']=='completed','Durable rule job did not complete.'
        assert len(case['runs'])==1
        doc=client.get(base+f'/cases/{case_id}/documents/{upload["id"]}',headers=headers)
        assert doc.status_code==200 and doc.content==data
        source=request('GET',f'/cases/{case_id}')
        child_id=str(uuid4())
        supplement={'requestId':child_id,'revision':source['revision'],'name':'QA staging — lần bổ sung tạm',
            'legalDate':'2026-09-27','reason':'Kiểm tra chuỗi lần nộp và lưu lịch sử'}
        child=request('POST',f'/cases/{case_id}/supplements',supplement)
        assert child['dossierId']==case_id and child['submissionRound']==2
        assert child['documents']==[] and child['runs']==[] and child['finalReview'] is None
        assert request('POST',f'/cases/{case_id}/supplements',supplement)['id']==child_id
        request('POST',f'/cases/{case_id}/supplements',{**supplement,'requestId':str(uuid4())},409)
        history=request('GET',f'/cases/{child_id}/submissions')
        assert history['total']==2 and history['latestId']==child_id
        frozen=request('GET',f'/cases/{case_id}')
        assert frozen['readOnly'] is True
        assert {k:v for k,v in frozen.items() if k!='readOnly'}=={k:v for k,v in source.items() if k!='readOnly'}
        request('POST',f'/cases/{case_id}/consultations',{'revision':frozen['revision'],'text':'Không sửa lần trước'},409)
        request('POST',f'/cases/{child_id}/consultations',{'revision':child['revision'],'text':'Cập nhật lần bổ sung'})
        print(json.dumps({'auth':True,'anonymous_denied':True,'spoofed_header_denied':True,'unknown_actor_denied':True,
            'project_create_rollback':True,'project_paging':True,'submission_paging':True,'audit':True,
            'signed_upload':True,'hash_verified':True,'finalize_idempotent':True,'revision_conflict':True,
            'admin_review_denied':True,'durable_rules_job':True,'original_download':True,
            'supplement_lineage':True,'supplement_idempotent':True,'prior_immutable':True,'supplement_editable':True}),flush=True)
    finally:
        if case_id:
            # Only test-owned UUIDs are accepted for cleanup; never a project or imported sample.
            from uuid import UUID
            safe=str(UUID(case_id))
            if child_id:
                child_safe=str(UUID(child_id))
                query(f"begin; delete from public.appraisal_audit_logs where case_id='{child_safe}'; delete from public.appraisal_cases where id='{child_safe}' and previous_submission_id='{safe}'; commit;",False)
            query(f"begin; delete from public.appraisal_upload_sessions where case_id='{safe}'; delete from public.appraisal_jobs where case_id='{safe}'; delete from public.appraisal_ai_logs where case_id='{safe}'; delete from public.appraisal_audit_logs where case_id='{safe}'; delete from public.appraisal_cases where id='{safe}' and payload->>'name'='QA staging — hồ sơ tạm kiểm tra tích hợp'; delete from public.appraisal_dossiers where id='{safe}' and not exists(select 1 from public.appraisal_cases where dossier_id='{safe}'); commit;",False)
        if objects:
            ref=os.environ['SUPABASE_PROJECT_REF']
            keys=client.get(f'https://api.supabase.com/v1/projects/{ref}/api-keys',headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']}).json()
            service=next(item['api_key'] for item in keys if item['name']=='service_role')
            removed=client.request('DELETE',url+'/storage/v1/object/appraisal-originals',headers={'apikey':service,'Authorization':'Bearer '+service},json={'prefixes':objects})
            assert removed.status_code==200,'Temporary object cleanup failed.'
        print('Temporary staging test records cleaned.',flush=True)


if __name__=='__main__':main()
