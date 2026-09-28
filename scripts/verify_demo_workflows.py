"""Run the authorized staging demo checks and clean only this run's temporary case."""
from runtime_endpoints import API_BASE
import hashlib
import io
import json
import os
from pathlib import Path
from uuid import UUID
import httpx
from pypdf import PdfReader
from supabase_admin import query


def main():
    root=Path(__file__).resolve().parents[1]
    for path in [root/'.env.local',Path.home()/'.config/buildappraisal/runtime.env']:
        for line in path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.startswith('#'):
                key,value=line.split('=',1);os.environ.setdefault(key,value.strip('"\''))
    base=API_BASE
    client=httpx.Client(timeout=115)
    assert client.get(base+'/runtime').json()['environment']=='staging'
    sessions={}
    for role in ('officer','head_of_department','director','admin'):
        response=client.post(base+'/test-login',json={'role':role})
        assert response.status_code==200,'Test sign-in failed: '+role
        sessions[role]={'Authorization':'Bearer '+response.json()['access_token']}
    def request(role,method,path,body=None,status=200):
        response=client.request(method,base+path,headers=sessions[role],json=body)
        assert response.status_code==status,f'{method} {path} returned {response.status_code}, expected {status}.'
        return response.json()
    officer='officer';head='head_of_department';objects=[];case_id=None
    results={}
    try:
        for kind in ('organizations','personnel','material_prices'):
            page=request(officer,'GET','/catalog/'+kind+'?limit=2')
            assert page['total']>0 and len(page['items'])==2
            results[kind]=page['total']
        dashboard=request(officer,'GET','/dashboard')
        assert dashboard['cases']['total']>0
        results['dashboard_cases']=dashboard['cases']['total']
        projects=request(officer,'GET','/projects?limit=50')
        assert all('lat' in p and 'lng' in p for p in projects['items'])
        results['scoped_projects']=projects['total']
        project=projects['items'][0]
        case=request(officer,'POST','/cases',{'name':'QA demo — hồ sơ quy trình tạm','province':'Điện Biên','legalDate':'2026-09-27','projectId':project['id'],'procedure':'gpxd'})
        case_id=case['id']
        info=request(head,'GET',f'/cases/{case_id}/workflow')
        assert info['canAssign'] and not request(officer,'GET',f'/cases/{case_id}/workflow')['canAssign']
        actor=request(officer,'GET','/health')['actor']
        assert any(str(r['id'])==actor['id'] for r in info['reviewers'])
        assignment={'revision':case['revision'],'assigneeId':actor['id'],'deadline':'2026-10-10','note':'Phân công kiểm tra luồng demo nội bộ'}
        request(officer,'POST',f'/cases/{case_id}/assignment',assignment,403)
        case=request(head,'POST',f'/cases/{case_id}/assignment',assignment)
        assert case['workflow']['assigneeId']==actor['id']
        data='Tài liệu mô phỏng kiểm tra quy trình GPXD. Không phải hồ sơ chính thức.'.encode('utf-8')
        upload=request(officer,'POST',f'/cases/{case_id}/uploads',{'revision':case['revision'],'requirementId':case['requirements'][0]['id'],'name':'qa-demo.txt','size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'role':'submission'})
        objects.append(upload['path']);url=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_ANON_KEY']
        sent=client.put(url+'/storage/v1/object/upload/sign/appraisal-originals/'+upload['path'],params={'token':upload['token']},headers={'apikey':key,**sessions[officer],'Content-Type':'text/plain'},content=data)
        assert sent.status_code==200
        case=request(officer,'POST',f'/cases/{case_id}/uploads/{upload["id"]}/finalize',{})
        case=request(officer,'POST',f'/cases/{case_id}/consultations',{'revision':case['revision'],'text':'Ghi nhận hồ sơ phục vụ thử nghiệm','response':'Đã cung cấp tài liệu mẫu'})
        spec=request(officer,'GET',f'/cases/{case_id}/procedure-review')
        case=request(officer,'POST',f'/cases/{case_id}/procedure-review',{'revision':case['revision'],'subtype':spec['subtype'],
            'authority':'Cơ quan kiểm tra mô phỏng','scope':'Phạm vi thử nghiệm','conclusion':'supplement',
            'checks':[{'id':c['id'],'status':'missing','note':'Hồ sơ thử nghiệm cần bổ sung dẫn chứng.','documentIds':[]} for c in spec['checks']]})
        for action in ('start','submit_review'):
            case=request(officer,'POST',f'/cases/{case_id}/workflow',{'revision':case['revision'],'action':action,'note':'Kiểm tra chuyển bước xử lý trong bản demo'})
        approve={'revision':case['revision'],'action':'approve','note':'Hoàn tất kiểm tra nội bộ bản demo'}
        request(officer,'POST',f'/cases/{case_id}/workflow',approve,409)
        request('admin','POST',f'/cases/{case_id}/workflow',approve,409)
        case=request(head,'POST',f'/cases/{case_id}/workflow',approve)
        assert case['workflow']['state']=='reviewed'
        request(officer,'POST',f'/cases/{case_id}/consultations',{'revision':case['revision'],'text':'Không sửa sau khi hoàn tất'},409)
        results['assignment_and_role_workflow']=True
        results['frozen_after_review']=True
        assert request(head,'GET',f'/cases/{case_id}/workflow')['canReopen']
        assert not request(officer,'GET',f'/cases/{case_id}/workflow')['canReopen']
        reopen={'revision':case['revision'],'note':'Mở lại hồ sơ thử nghiệm để kiểm tra lưu lịch sử'}
        request(officer,'POST',f'/cases/{case_id}/reopen',reopen,403)
        case=request(head,'POST',f'/cases/{case_id}/reopen',reopen)
        assert case['workflow']['state']=='processing' and case['reviewHistory']
        results['leadership_reopen_preserves_review']=True
        for format in ('pdf','docx'):
            response=client.get(base+f'/cases/{case_id}/internal-record/{format}',headers=sessions[officer])
            assert response.status_code==200
            assert response.content.startswith(b'%PDF' if format=='pdf' else b'PK')
            if format=='pdf':
                pdf=PdfReader(io.BytesIO(response.content))
                assert all(abs(float(p.mediabox.width)-595.28)<1 and abs(float(p.mediabox.height)-841.89)<1 for p in pdf.pages)
        results['pdf_docx_a4']=True
        print(json.dumps(results,ensure_ascii=False),flush=True)
        legal=request(officer,'POST','/legal-assistant',{'question':'Hồ sơ trình thẩm định báo cáo nghiên cứu khả thi gồm những tài liệu nào theo Nghị định 217/2026/NĐ-CP?','useModel':True})
        assert legal['status']=='unverified_ai', 'Legal assistant did not produce a grounded answer: '+legal['status']
        assert legal['paragraphs'] and all(p['citations'] for p in legal['paragraphs'])
        results.update(legal_model=legal['model'],legal_sources=len(legal['sources']),legal_paragraphs=len(legal['paragraphs']))
        print(json.dumps(results,ensure_ascii=False),flush=True)
    finally:
        if case_id:
            safe=str(UUID(case_id))
            query(f"begin; delete from public.appraisal_upload_sessions where case_id='{safe}'; delete from public.appraisal_audit_logs where case_id='{safe}'; delete from public.appraisal_cases where id='{safe}' and payload->>'name'='QA demo — hồ sơ quy trình tạm'; delete from public.appraisal_dossiers where id='{safe}' and not exists(select 1 from public.appraisal_cases where dossier_id='{safe}'); commit;",False)
        if objects:
            keys=client.get('https://api.supabase.com/v1/projects/'+os.environ['SUPABASE_PROJECT_REF']+'/api-keys',headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']}).json()
            service=next(k['api_key'] for k in keys if k['name']=='service_role')
            response=client.request('DELETE',os.environ['SUPABASE_URL']+'/storage/v1/object/appraisal-originals',headers={'apikey':service,'Authorization':'Bearer '+service},json={'prefixes':objects})
            assert response.status_code==200,'Temporary file cleanup failed.'
        print('Temporary demo records cleaned.',flush=True)


if __name__=='__main__':main()
