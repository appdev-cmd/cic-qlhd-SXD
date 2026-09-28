"""Enrich only editable synthetic cloud cases; preserve previous rounds and reviews."""
from runtime_endpoints import API_BASE
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import httpx

base=API_BASE
client=httpx.Client(timeout=100)
if client.get(base+'/runtime').json().get('environment')!='staging':raise RuntimeError('Staging only')
login=client.post(base+'/test-login',json={'role':'admin'});login.raise_for_status()
headers={'Authorization':'Bearer '+login.json()['access_token']}
def req(method,path,body=None):
    r=client.request(method,base+path,headers=headers,json=body)
    if r.status_code!=200:raise RuntimeError(f'{method} {path}: {r.status_code}')
    return r.json()
projects={};offset=0
while True:
    page=req('GET',f'/projects?limit=100&offset={offset}')
    projects.update({p['id']:p for p in page['items']})
    offset+=len(page['items'])
    if offset>=page['total'] or not page['items']:break
cases=[]
for procedure in ('gpxd','nghiem_thu'):
    offset=0
    while True:
        page=req('GET',f'/submissions?procedure={procedure}&limit=100&offset={offset}')
        cases.extend(page['items']);offset+=len(page['items'])
        if offset>=page['total'] or not page['items']:break
backup=Path.home()/'.config/buildappraisal/backups/20260927-procedure-reviews-before.json'
if not backup.exists():backup.write_text(json.dumps(cases,ensure_ascii=False),encoding='utf-8')
def enrich(summary):
    case=req('GET','/cases/'+summary['id'])
    if not case.get('sample') or case.get('readOnly') or case.get('finalReview') or case.get('procedureReview'):return None
    spec=req('GET',f'/cases/{case["id"]}/procedure-review');project=projects.get(case.get('projectId'),{})
    checks=[]
    for check in spec['checks']:
        checks.append({'id':check['id'],'status':'pending','documentIds':[],
            'note':'Kịch bản demo: đã có tài liệu mô phỏng trong danh sách nộp; chuyên viên chọn đúng dẫn chứng và vị trí trước khi kết luận.'})
    value={'revision':case['revision'],'subtype':spec['subtype'],'checks':checks,
       'authority':'Cơ quan chuyên môn về xây dựng — cần xác nhận thẩm quyền cụ thể',
       'investor':project.get('investor_name') or 'Chủ đầu tư trong hồ sơ mô phỏng',
       'location':case['province'],'scope':case.get('projectName') or case['name'],
       'parameters':'Số liệu lấy từ hồ sơ mẫu; chuyên viên điền thông số sau khi đối chiếu tài liệu.',
       'designBasis':'Đối chiếu tài liệu thiết kế đã nộp và quyết định phê duyệt theo kịch bản mẫu.',
       'conclusion':'pending','conditions':'Kịch bản độc lập phục vụ demo; chưa xác nhận tính đầy đủ, hợp lệ hoặc điều kiện cấp phép / nghiệm thu.',
       'details':{'buildingClass':project.get('grade') or 'Chưa xác nhận'},'defects':[]}
    if case['procedure']=='nghiem_thu':
        value.update(visitDate='2026-10-01',participants='Đại diện cơ quan kiểm tra, chủ đầu tư và đơn vị liên quan (mô phỏng)',
            observations='Tình huống mẫu: cần đối chiếu hồ sơ hoàn công, chứng từ chất lượng và ghi nhận hiện trạng thực tế.',
            defects=[{'description':'Tình huống demo: chưa có xác nhận đối chiếu đủ hồ sơ hoàn công và kết quả thí nghiệm.',
              'responsible':'Đại diện chủ đầu tư (mô phỏng)','dueDate':'2026-10-08','status':'open','documentIds':[],
              'resolution':'Chưa xác nhận; cần tiếp nhận và đối chiếu tài liệu khắc phục.'}])
    req('POST',f'/cases/{case["id"]}/procedure-review',value)
    return {'id':case['id'],'procedure':case['procedure'],'project':case.get('projectCode')}
with ThreadPoolExecutor(max_workers=3) as executor:updated=[x for x in executor.map(enrich,cases) if x]
path=Path(__file__).resolve().parents[1]/'output/appraisal/procedure-demo-manifest.json'
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps({'updated':updated,'previousRoundsPreserved':True,'conclusions':'pending'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'updated':len(updated),'procedures':{p:sum(x['procedure']==p for x in updated) for p in ('gpxd','nghiem_thu')}},ensure_ascii=False))
