"""Staging regression for catalog writes and actual queued OCR; exact-ID cleanup."""
from runtime_endpoints import API_BASE
import hashlib
import json
import os
from pathlib import Path
import time
from uuid import UUID, uuid4
import httpx
from supabase_admin import query


def main():
    root = Path(__file__).resolve().parents[1]
    for path in [root/'.env.local', Path.home()/'.config/buildappraisal/runtime.env']:
        for line in path.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1); os.environ.setdefault(key, value.strip('"\''))
    base = API_BASE
    client = httpx.Client(timeout=90)
    assert client.get(base+'/runtime').json()['environment']=='staging'
    sessions = {}
    for role in ('officer', 'head_of_department', 'director', 'admin'):
        response = client.post(base+'/test-login', json={'role': role}); assert response.status_code==200
        sessions[role] = {'Authorization': 'Bearer '+response.json()['access_token']}
    def req(role, method, path, body=None, status=200):
        response = client.request(method, base+path, headers=sessions[role], json=body)
        assert response.status_code==status, f'{method} {path}: {response.status_code}, expected {status}'
        return response.json()
    created = []; objects = []; case_id = None; results = {}; head = 'head_of_department'; officer = 'officer'
    try:
        from app.catalog import FIELDS
        for kind in ('organizations', 'personnel', 'material_prices'):
            seed = req(head, 'GET', '/catalog/'+kind+'?limit=1')['items'][0]
            values = {k: v for k, v in seed.items() if k in FIELDS[kind]}
            suffix = uuid4().hex[:12]
            values['code'] = 'QA-'+suffix
            if kind=='personnel':
                values.update(full_name='QA cá nhân '+suffix, id_card='QA'+suffix, cert_number='QA-'+suffix)
                values['org_id'] = created[0][1]
            else: values['name'] = 'QA danh mục '+suffix
            if kind=='organizations': values.update(tax_code=None, cert_number='QA-'+suffix)
            body = {'values': values}
            for role in (officer, 'director'): req(role, 'POST', '/catalog/'+kind, body, 403)
            req(head, 'POST', '/catalog/'+kind, {'values': {**values, 'province_code': 'XX'}}, 422)
            if kind=='material_prices':
                req(head, 'POST', '/catalog/'+kind, {'values': {**values, 'market_price': -1}}, 422)
            row = req(head, 'POST', '/catalog/'+kind, body); created.append((kind, row['id']))
            assert row['revision']==1 and 'id_card' not in row
            key = 'full_name' if kind=='personnel' else 'name'; values[key] += ' đã sửa'
            if kind=='personnel': values['id_card']=''
            updated = req(head, 'PATCH', '/catalog/'+kind+'/'+row['id'], {'revision': 1, 'values': values})
            assert updated['revision']==2 and updated[key]==values[key]
            req(head, 'PATCH', '/catalog/'+kind+'/'+row['id'], {'revision': 1, 'values': values}, 409)
            audit = req(officer, 'GET', '/catalog/'+kind+'/'+row['id']+'/history')['items']
            assert len(audit)>=2 and all(a['actor'] and a['action'] in ('insert', 'update') for a in audit)
            assert any(key in a['changed_fields'] for a in audit if a['action']=='update')
            results[kind] = {'create_update': True, 'role_denial': True, 'scope_injection_denied': True,
                             'revision_conflict': True, 'audit': True}

        project = req(officer, 'GET', '/projects?limit=1')['items'][0]
        case = req(officer, 'POST', '/cases', dict(name='QA OCR — hồ sơ tạm kiểm tra', province='Điện Biên',
                   legalDate='2026-09-27', projectId=project['id'], procedure='gpxd'))
        case_id = case['id']; data = (root/'output/appraisal/gpxd-nghiem-thu/ho-so-scan-mau.pdf').read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        upload = req(officer, 'POST', f'/cases/{case_id}/uploads', dict(revision=case['revision'],
            requirementId=case['requirements'][0]['id'], name='qa-ocr-scan.pdf', size=len(data), sha256=digest, role='submission'))
        objects.append(upload['path']); url=os.environ['SUPABASE_URL']; key=os.environ['SUPABASE_ANON_KEY']
        sent=client.put(url+'/storage/v1/object/upload/sign/appraisal-originals/'+upload['path'],
            params={'token':upload['token']}, headers={'apikey':key, **sessions[officer], 'Content-Type':'application/pdf'}, content=data)
        assert sent.status_code==200
        case=req(officer, 'POST', f'/cases/{case_id}/uploads/{upload["id"]}/finalize', {})
        assert not case['documents'][0]['segments'], 'Upload must not run OCR inline'
        spec=req(officer,'GET',f'/cases/{case_id}/procedure-review')
        review=dict(revision=case['revision'],subtype=spec['subtype'],conclusion='pending',
                    checks=[dict(id=c['id']) for c in spec['checks']])
        case=req(officer,'POST',f'/cases/{case_id}/procedure-review',review)
        started=time.monotonic()
        case=req(officer,'POST',f'/cases/{case_id}/documents/{upload["id"]}/ocr',{'revision':case['revision']})
        job_id=case['job']['id']
        while time.monotonic()-started<100:
            case=req(officer,'GET',f'/cases/{case_id}')
            if case['job']['status']!='running': break
            time.sleep(1)
        assert case['job']['status']=='completed', 'Queued OCR did not complete'
        doc=case['documents'][0]; text=' '.join(s['text'] for s in doc['segments'])
        assert '25.000.000.000' in text and 'Công trình trường học mô phỏng' in text
        assert doc['hash']==digest and case['procedureReview'] is None and case['procedureReviewHistory']
        assert case['facts'] and all(f['reviewStatus']=='pending' for f in case['facts'])
        spool=Path(os.environ['APPRAISAL_OCR_SPOOL'])/(str(UUID(job_id))+'.pdf')
        assert not spool.exists(), 'Completed OCR spool was not cleaned'
        downloaded=client.get(base+f'/cases/{case_id}/documents/{upload["id"]}',headers=sessions[officer])
        assert downloaded.status_code==200 and downloaded.content==data
        results['ocr']={'queued':True,'seconds':round(time.monotonic()-started,1),'segments':len(doc['segments']),
            'unconfirmed_facts':len(case['facts']),'key_values_recognized':True,'original_preserved':True,
            'review_invalidated':True,'spool_cleaned':True}
        output=root/'output/appraisal/new-features-regression.json'
        output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(results,ensure_ascii=False),flush=True)
    finally:
        if case_id:
            safe=str(UUID(case_id))
            query(f"begin; delete from public.appraisal_upload_sessions where case_id='{safe}'; delete from public.appraisal_jobs where case_id='{safe}'; delete from public.appraisal_ai_logs where case_id='{safe}'; delete from public.appraisal_audit_logs where case_id='{safe}'; delete from public.appraisal_cases where id='{safe}' and payload->>'name'='QA OCR — hồ sơ tạm kiểm tra'; delete from public.appraisal_dossiers where id='{safe}' and not exists(select 1 from public.appraisal_cases where dossier_id='{safe}'); commit;",False)
        for kind, id in reversed(created):
            assert kind in ('organizations','personnel','material_prices'); safe=str(UUID(id))
            query(f"begin; delete from public.{kind} where id='{safe}' and code like 'QA-%'; delete from public.audit_logs where table_name='{kind}' and record_id='{safe}'; commit;",False)
        if objects:
            keys=client.get(f'https://api.supabase.com/v1/projects/{os.environ["SUPABASE_PROJECT_REF"]}/api-keys',headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']}).json()
            service=next(k['api_key'] for k in keys if k['name']=='service_role')
            removed=client.request('DELETE',os.environ['SUPABASE_URL']+'/storage/v1/object/appraisal-originals',headers={'apikey':service,'Authorization':'Bearer '+service},json={'prefixes':objects})
            assert removed.status_code==200
        print('Temporary catalog rows, OCR case and uploaded objects cleaned.',flush=True)


if __name__=='__main__': main()
