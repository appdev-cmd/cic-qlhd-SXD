"""Transactional curated-demo upgrade through the same scoped, audited persistence RPC."""
import json
import os
from pathlib import Path
from uuid import UUID
from psycopg.types.json import Jsonb
from supabase_admin import query

root=Path(__file__).resolve().parents[1]
private=Path.home()/'.config/buildappraisal'
for config in (root/'.env',root/'.env.local',private/'runtime.env'):
    if not config.exists():continue
    for line in config.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            key,value=line.split('=',1);os.environ[key]=value.strip('"\'')
assert os.environ.get('APPRAISAL_MODE')=='cloud' and os.environ.get('APPRAISAL_ENVIRONMENT')=='staging'
from app.procedure_review import Review, PERMITS, specification, apply
from app.procedure_rules import VERSION
from app.database import connection
from app.domain import audit, now

profile=query("select p.id,p.full_name,p.role,p.province_id,p.department from public.profiles p join auth.users u on u.id=p.id where u.email='appdev@cic.com.vn' and p.is_active and p.role='admin'")[0]
actor={'id':profile['id'],'name':profile['full_name'],'role':profile['role'],'tenantId':profile['province_id'],'department':profile['department']}
targets=json.loads((root/'output/appraisal/procedure-demo-manifest.json').read_text(encoding='utf-8'))['updated']
ids=[UUID(row['id']) for row in targets]
backup=private/'backups/20260927-legal-v2';backup.mkdir(parents=True,exist_ok=True)
results=[];counts={'gpxd':0,'nghiem_thu':0}
with connection(actor['id']) as con:
    rows=con.execute('select id,payload from public.appraisal_cases where id=any(%s)',(ids,)).fetchall()
    cases={str(row['id']):row['payload'] for row in rows}
    for target in targets:
        case=cases[target['id']];review=case.get('procedureReview')
        index=counts[target['procedure']];counts[target['procedure']]+=1
        successor=con.execute('select 1 from public.appraisal_cases where previous_submission_id=%s limit 1',(case['id'],)).fetchone()
        if not case.get('sample') or case.get('readOnly') or successor or case.get('finalReview') or not review:
            results.append({'id':case['id'],'status':'skipped_locked_or_not_sample'});continue
        if review.get('ruleVersion')==VERSION:
            results.append({'id':case['id'],'procedure':case['procedure'],'status':'already_current','subtype':review['subtype']});continue
        if review.get('conclusion')!='pending' or any(c['status']!='pending' for c in review['checks']):
            results.append({'id':case['id'],'status':'skipped_reviewed'});continue
        path=backup/(case['id']+'.json')
        if not path.exists():path.write_text(json.dumps(case,ensure_ascii=False),encoding='utf-8')
        subtype=list(PERMITS)[index%len(PERMITS)] if case['procedure']=='gpxd' else ['complete','conditional','partial'][index%3]
        spec=specification(case,subtype);revision=case['revision']
        body={k:v for k,v in review.items() if k in Review.model_fields}
        body.update(revision=revision,ruleVersion=VERSION,subtype=subtype,conclusion='pending',
            checks=[dict(id=c['id'],status='pending',documentIds=[],note='Kịch bản mô phỏng; đối chiếu điều khoản và tài liệu nộp trước khi xác nhận.') for c in spec['checks']])
        apply(case,actor,Review(**body));case.update(revision=revision+1,updatedAt=now())
        audit(case,actor,'Cập nhật checklist pháp lý mẫu','Bộ 2026-07.v2; giữ bản cũ trong lịch sử và chưa xác nhận kết luận nghiệp vụ.')
        saved=con.execute('select public.persist_appraisal_case(%s,%s,%s) as payload',(case['id'],revision,Jsonb(case))).fetchone()['payload']
        assert saved['procedureReview']['ruleVersion']==VERSION and saved['procedureReviewHistory']
        results.append({'id':case['id'],'procedure':case['procedure'],'subtype':subtype,'status':'updated'})
(root/'output/appraisal/legal-demo-upgrade.json').write_text(json.dumps({'version':VERSION,'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'current':sum(x['status'] in ('updated','already_current') for x in results),'total':len(results)},ensure_ascii=False))
