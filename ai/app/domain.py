"""Appraisal vocabulary shared by ingestion, rules and sample generation."""

from datetime import datetime, timezone
from uuid import uuid4


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


REQUIREMENTS = [
    ('TTR', 'Tờ trình thẩm định BCNCKT', 'Tiếp nhận'),
    ('PL01', 'Thông báo 81-TB/TW về trường xã biên giới', 'Pháp lý'),
    ('PL02', 'Nghị quyết 298/NQ-CP', 'Pháp lý'),
    ('PL03', 'Kế hoạch 564/KH-UBND của Hà Tĩnh', 'Pháp lý'),
    ('PL04', 'Quyết định 539/QĐ-UBND giao chủ đầu tư', 'Pháp lý'),
    ('PL05', 'Văn bản 1989/BGDĐT-KHTC', 'Pháp lý'),
    ('PL06', 'Quyết định 119/QĐ-BQLDA và đề cương', 'Pháp lý'),
    ('PL07', 'Văn bản 545/UBND-KT và tổng mặt bằng', 'Pháp lý'),
    ('KT01', 'Hồ sơ khảo sát địa hình', 'Khảo sát'),
    ('KT02', 'Hồ sơ khảo sát địa chất', 'Khảo sát'),
    ('KT03', 'Thuyết minh BCNCKT', 'Thiết kế'),
    ('KT04', 'Hồ sơ thiết kế cơ sở', 'Thiết kế'),
    ('KT05', 'Tổng mức đầu tư và bảng tính', 'Chi phí'),
    ('NL01', 'Năng lực tổ chức và nhân sự chủ chốt', 'Năng lực'),
]
COSTS = [
    ('land', 'Chi phí GPMB'),
    ('construction', 'Chi phí xây dựng'),
    ('equipment', 'Chi phí thiết bị'),
    ('management', 'Chi phí quản lý dự án'),
    ('consulting', 'Chi phí tư vấn'),
    ('other', 'Chi phí khác'),
    ('contingency', 'Chi phí dự phòng'),
]
FIELDS = {
    'total': ('Tổng mức đầu tư', 'VNĐ'),
    'land_area': ('Diện tích khu đất', 'm²'),
    'footprint': ('Diện tích xây dựng', 'm²'),
    'floor_area': ('Tổng diện tích sàn', 'm²'),
    'density': ('Mật độ xây dựng', '%'),
    'far': ('Hệ số sử dụng đất', 'lần'),
    'class_count': ('Tổng số lớp', 'lớp'),
    'primary_classes': ('Số lớp tiểu học', 'lớp'),
    'secondary_classes': ('Số lớp THCS', 'lớp'),
    'tank_capacity': ('Dung tích bể hữu ích', 'm³'),
    'tank_length': ('Chiều dài ngoài bể', 'm'),
    'tank_width': ('Chiều rộng ngoài bể', 'm'),
    'tank_height': ('Chiều cao ngoài bể', 'm'),
    'max_floors': ('Số tầng tối đa', 'tầng'),
    'mep_certificate': ('Chứng chỉ chủ trì MEP', ''),
    'survey_certificate': ('Chứng chỉ chủ trì khảo sát', ''),
    'project_name': ('Tên dự án', ''),
    'province': ('Địa phương công trình', ''),
    'building_grade': ('Cấp công trình', ''),
    'standard_primary': ('Tiêu chuẩn trường tiểu học', ''),
    'standard_secondary': ('Tiêu chuẩn trường trung học', ''),
}
for key, label in COSTS:
    FIELDS['cost.' + key] = (label, 'VNĐ')
for key in ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B', 'C', 'D', 'G1', 'G2']:
    FIELDS['floor.' + key] = ('Diện tích sàn ' + key, 'm²')


def new_case(
    name,
    province,
    actor,
    legal_date,
    project_id=None,
    sample=False,
    school_template=False,
    procedure='bcnckt',
    project_name=None,
    project_code=None,
):
    reqs = (
        REQUIREMENTS
        if school_template
        else [
            ('TTR', 'Tờ trình và danh mục hồ sơ gửi kèm', 'Tiếp nhận'),
            ('KT01', 'Hồ sơ khảo sát địa hình', 'Khảo sát'),
            ('KT02', 'Hồ sơ khảo sát địa chất', 'Khảo sát'),
            ('KT03', 'Thuyết minh BCNCKT', 'Thiết kế'),
            ('KT04', 'Hồ sơ thiết kế cơ sở', 'Thiết kế'),
            ('KT05', 'Tổng mức đầu tư', 'Chi phí'),
            ('NL01', 'Năng lực tổ chức và nhân sự', 'Năng lực'),
        ]
    )
    if procedure != 'bcnckt':
        reqs = [
            ('APPLICATION', 'Đơn / văn bản đề nghị', 'Tiếp nhận'),
            ('ATTACHMENTS', 'Tài liệu gửi kèm', 'Tiếp nhận'),
            ('DRAWINGS', 'Bản vẽ', 'Tiếp nhận'),
            ('RESULTS', 'Văn bản xử lý và kết quả', 'Xử lý'),
        ]
    return {
        'procedure': procedure,
        'projectName': project_name,
        'projectCode': project_code,
        'id': uid(),
        'projectId': project_id,
        'name': name,
        'province': province,
        'tenantId': actor['tenantId'],
        'department': actor['department'],
        'assignee': actor['name'],
        'createdAt': now(),
        'updatedAt': now(),
        'legalDate': legal_date,
        'sample': sample,
        'revision': 1,
        'legalContext': {
            'submissionDate': legal_date,
            'scope': 'construction',
            'stage': 'original',
            'priorStatus': 'unknown',
            'note': '',
            'confirmedBy': None,
        },
        'legalRequirements': {},
        'requirements': [
            {
                'id': c,
                'name': n,
                'category': g,
                'required': procedure == 'bcnckt' and (school_template or c != 'KT05'),
                'status': 'missing',
                'note': '',
                'verifiedBy': None,
            }
            for c, n, g in reqs
        ],
        'documents': [],
        'facts': [],
        'runs': [],
        'consultations': [],
        'audit': [],
        'status': 'intake',
        'finalReview': None,
    }


def audit(case, actor, action, detail):
    case['audit'].append({'id': uid(), 'at': now(), 'actor': actor['name'], 'action': action, 'detail': detail})


def invalidate(case):
    if case.get('procedureReview'):
        case.setdefault('procedureReviewHistory', []).append(case['procedureReview'])
        case['procedureReview'] = None
    if case.get('job', {}).get('status') == 'running':
        case['job']['status'] = 'cancelled'
    case['finalReview'] = None
    for run in case['runs']:
        run['stale'] = True


def latest_documents(case, mode='intake'):
    result = {}
    for doc in case['documents']:
        if doc['role'] == 'reference' and mode == 'intake':
            continue
        result[(doc['requirementId'], doc['role'])] = doc
    return list(result.values())
