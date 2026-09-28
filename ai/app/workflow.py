"""Internal review workflow. No action signs or legally issues a document."""
from fastapi import HTTPException
from .domain import now

STATES={'received':'Tiếp nhận','assigned':'Đã phân công','processing':'Đang xử lý',
 'awaiting_supplement':'Chờ bổ sung','pending_review':'Chờ lãnh đạo rà soát',
 'site_visit':'Kiểm tra hiện trường','correction':'Theo dõi khắc phục','reviewed':'Hoàn tất rà soát nội bộ'}
TRANSITIONS={
 'start':(['received','assigned'],'processing',['officer','head_of_department','director']),
 'request_supplement':(['received','assigned','processing','pending_review'],'awaiting_supplement',['officer','head_of_department','director']),
 'submit_review':(['processing','site_visit','correction'],'pending_review',['officer','head_of_department','director']),
 'return':(['pending_review'],'processing',['head_of_department','director']),
 'approve':(['pending_review'],'reviewed',['head_of_department','director']),
 'schedule_visit':(['processing'],'site_visit',['officer','head_of_department','director']),
 'require_correction':(['site_visit'],'correction',['officer','head_of_department','director']),
 'confirm_correction':(['correction'],'processing',['officer','head_of_department','director']),
}
LABELS={'start':'Bắt đầu xử lý','request_supplement':'Yêu cầu bổ sung','submit_review':'Trình lãnh đạo rà soát',
 'return':'Trả chuyên viên xử lý','approve':'Hoàn tất rà soát nội bộ','schedule_visit':'Ghi lịch kiểm tra hiện trường',
 'require_correction':'Yêu cầu khắc phục','confirm_correction':'Xác nhận theo dõi khắc phục'}

def state(case):
    return case.get('workflow',{}).get('state') or ('reviewed' if case.get('finalReview',{} ) and case['finalReview']['decision']=='reviewed' else 'received')

def options(case,actor):
    current=state(case)
    assigned=case.get('workflow',{}).get('assigneeId')
    if assigned and assigned!=actor['id'] and actor['role']=='officer':return []
    return [{'id':key,'label':LABELS[key]} for key,(sources,target,roles) in TRANSITIONS.items()
        if current in sources and actor['role'] in roles
        and (key not in ('schedule_visit','require_correction','confirm_correction') or case.get('procedure')=='nghiem_thu')
        and not case.get('finalReview')]

def apply(case,actor,action,note,visit_date=None):
    if action not in {x['id'] for x in options(case,actor)}:
        raise HTTPException(409,'Thao tác không phù hợp trạng thái hoặc quyền hiện tại.')
    workflow=case.get('workflow') or {};assigned=workflow.get('assigneeId')
    if assigned and assigned!=actor['id'] and actor['role']=='officer':
        raise HTTPException(403,'Hồ sơ đã phân công chuyên viên khác.')
    if action in ('submit_review','approve'):
        if case.get('procedure') in ('gpxd','nghiem_thu'):
            from .procedure_review import validate
            validate(case.get('procedureReview'))
        if not any(d['role']=='submission' for d in case['documents']):
            raise HTTPException(422,'Cần tài liệu đầu vào trước khi trình rà soát.')
        if case.get('procedure','bcnckt')=='bcnckt' and (not case['runs'] or case['runs'][-1].get('stale')):
            raise HTTPException(422,'Cần kết quả kiểm tra còn hiệu lực trước khi trình rà soát.')
    if action=='schedule_visit' and not visit_date:
        raise HTTPException(422,'Nhập ngày kiểm tra hiện trường dự kiến.')
    if action=='confirm_correction':
        review=case.get('procedureReview')
        if not review or not review.get('defects') or any(d['status']!='resolved' for d in review['defects']):
            raise HTTPException(422,'Cần ghi nhận các tồn tại và xác nhận tài liệu khắc phục trong phiếu chuyên môn.')
    if action=='schedule_visit' and visit_date<case['legalDate']:
        raise HTTPException(422,'Ngày kiểm tra không được trước ngày đánh giá của hồ sơ.')
    source=state(case);target=TRANSITIONS[action][1]
    history=workflow.get('history',[])+[{'from':source,'to':target,'action':LABELS[action],'note':note,'actor':actor['name'],'at':now()}]
    case['workflow']={**workflow,'state':target,'history':history}
    if visit_date:case['workflow']['visitDate']=visit_date
    if action=='request_supplement':case['status']='request_supplement'
    if action=='return':case['status']='intake'
    if action=='approve':
        case['status']='reviewed'
        case['finalReview']={'decision':'reviewed','note':note,'actor':actor['name'],'at':now(),'simulation':bool(case.get('sample'))}
    return LABELS[action]
