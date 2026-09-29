"""Structured BCNCKT appraisal sheet — Điều 38 NĐ 217/2026, mục V–VI Mẫu số 03 Phụ lục I.

Each content group gets a level of compliance, an assessment and correction requests; the sheet ends with one of
the three conclusions of Mẫu số 03. Suggestions come from the deterministic findings of the current run; the officer
decides every status and the conclusion (khoản 6 Điều 38).
"""

from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .domain import now

VERSION = 'bcnckt-sheet-2026.09'

PLANNING_BASES = {
    'framework': {
        'label': 'Dự án hạ tầng kỹ thuật khung',
        'basis': 'Điểm a khoản 1 Điều 38 NĐ 217/2026',
        'criteria': ['Định hướng, bố trí hệ thống công trình hạ tầng kỹ thuật so với quy hoạch làm căn cứ lập dự án'],
    },
    'detailed': {
        'label': 'Quy hoạch chi tiết đô thị và nông thôn',
        'basis': 'Điểm b khoản 1 Điều 38 NĐ 217/2026',
        'criteria': [
            'Chức năng sử dụng đất, quy mô dân số (nếu có), diện tích',
            'Chỉ tiêu sử dụng đất quy hoạch: mật độ xây dựng, hệ số sử dụng đất, tầng cao',
            'Yêu cầu tổ chức không gian, kiến trúc cảnh quan',
        ],
    },
    'sector': {
        'label': 'Quy hoạch chi tiết ngành, phương án tuyến hoặc vị trí được chấp thuận',
        'basis': 'Điểm c khoản 1 Điều 38 NĐ 217/2026',
        'criteria': [
            'Vị trí, hướng tuyến, vùng tuyến (công trình theo tuyến)',
            'Thông số kỹ thuật chủ yếu so với quy hoạch ngành hoặc phương án được chấp thuận',
        ],
    },
    'forest': {
        'label': 'Đề án du lịch sinh thái, nghỉ dưỡng, giải trí trong rừng',
        'basis': 'Điểm d khoản 1 Điều 38 NĐ 217/2026',
        'criteria': [
            'Chỉ tiêu mặt bằng, vị trí, quy mô, vật liệu, chiều cao, mật độ, thời gian tồn tại công trình',
            'Định hướng đấu nối hạ tầng kỹ thuật, giao thông; phương án quản lý rừng bền vững (nếu có)',
        ],
    },
}

SECTIONS = [
    {
        'id': 'legal',
        'title': 'Tuân thủ quy định về lập dự án, thiết kế xây dựng; điều kiện năng lực hành nghề',
        'form': 'Mục V.1 Mẫu số 03',
        'basis': 'Khoản 4 Điều 27 Luật Xây dựng 135/2025',
        'categories': [
            'Pháp lý và năng lực',
            'Nhất quán',
            'Thành phần theo pháp luật',
            'Hồ sơ đầu vào',
            'Dữ liệu',
            'Phạm vi thẩm định',
        ],
        'criteria': [
            'Thành phần và tính pháp lý của hồ sơ theo khoản 2 Điều 35 NĐ 217/2026',
            'Nội dung Báo cáo nghiên cứu khả thi, thiết kế xây dựng theo quy định',
            'Năng lực hành nghề của chủ nhiệm, chủ trì (nếu cần thiết)',
        ],
    },
    {
        'id': 'planning',
        'title': 'Sự phù hợp của thiết kế xây dựng với quy hoạch làm căn cứ lập dự án',
        'form': 'Mục V.2 Mẫu số 03',
        'basis': 'Khoản 1 Điều 38 NĐ 217/2026',
        'categories': ['Quy hoạch', 'Thiết kế'],
        'criteria': [],
    },
    {
        'id': 'infrastructure',
        'title': 'Khả năng kết nối hạ tầng kỹ thuật khu vực',
        'form': 'Mục V.3 Mẫu số 03',
        'basis': 'Khoản 2 Điều 38 NĐ 217/2026',
        'categories': ['Hạ tầng'],
        'criteria': ['Danh mục văn bản thỏa thuận hoặc hướng dẫn kết nối với hạ tầng kỹ thuật bên ngoài dự án'],
    },
    {
        'id': 'standards',
        'title': 'Quy chuẩn kỹ thuật, tiêu chuẩn; an toàn xây dựng; giải pháp phòng cháy và chữa cháy',
        'form': 'Mục V.4 Mẫu số 03',
        'basis': 'Khoản 3, 4 Điều 38 NĐ 217/2026',
        'categories': ['Quy chuẩn', 'Khảo sát và kết cấu', 'PCCC và môi trường'],
        'criteria': [
            'Danh mục quy chuẩn kỹ thuật, tiêu chuẩn áp dụng (điểm a khoản 3)',
            'Giải pháp thiết kế tuân thủ quy chuẩn kỹ thuật bắt buộc (điểm b khoản 3)',
            'Nội dung thiết kế theo Điều 20, 21 hoặc 22 và xác nhận an toàn của thẩm tra (điểm a khoản 4)',
            'Hồ sơ thiết kế phòng cháy và chữa cháy tương ứng Báo cáo nghiên cứu khả thi (điểm b khoản 4)',
        ],
    },
    {
        'id': 'cost',
        'title': 'Tuân thủ quy định về quản lý chi phí đầu tư xây dựng',
        'form': 'Mục V.5 Mẫu số 03',
        'basis': 'Khoản 5 Điều 38 NĐ 217/2026; NĐ 206/2026/NĐ-CP',
        'categories': ['Chi phí'],
        'criteria': ['Tổng mức đầu tư của dự án đầu tư công, dự án PPP theo quy định quản lý chi phí'],
    },
]
SECTION_IDS = tuple(s['id'] for s in SECTIONS)

STATUSES = {
    'pending': 'Chưa đánh giá',
    'meets': 'Đáp ứng',
    'revise': 'Đáp ứng sau khi chỉnh sửa, hoàn thiện',
    'fails': 'Không đáp ứng',
    'not_applicable': 'Không áp dụng',
}
# Mục VI.1 Mẫu số 03.
CONCLUSIONS = {
    'eligible': 'Đủ điều kiện để tổng hợp, trình phê duyệt và triển khai các bước tiếp theo',
    'eligible_after_revision': 'Chỉ đủ điều kiện sau khi hoàn thiện các nội dung yêu cầu',
    'ineligible': 'Chưa đủ điều kiện để tổng hợp, trình phê duyệt',
}


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class SectionInput(Payload):
    id: Literal[SECTION_IDS]
    status: Literal[tuple(STATUSES)] = 'pending'
    assessment: str = Field(default='', max_length=4000)
    requirements: list[str] = Field(default_factory=list, max_length=30)
    findingIds: list[str] = Field(default_factory=list, max_length=60)


class SheetInput(Payload):
    revision: int = Field(ge=1)
    planningBasis: Literal['', *PLANNING_BASES] = ''
    sections: list[SectionInput] = Field(max_length=len(SECTIONS))
    conclusion: Literal['pending', *CONCLUSIONS] = 'pending'
    recommendations: str = Field(default='', max_length=4000)


def cost_applies(investment):
    """Khoản 5 Điều 38: tổng mức đầu tư is appraised for public investment and PPP projects only."""
    return investment in ('dau_tu_cong', 'ppp', None, '')


def _findings(case):
    run = case['runs'][-1] if case.get('runs') and not case['runs'][-1].get('stale') else None
    return run['findings'] if run else []


def suggest(section, findings):
    """Proposed status and correction requests from reviewed findings of the section's categories."""
    scoped = [f for f in findings if f['category'] in section['categories']]
    issues = [f for f in scoped if f['result'] != 'consistent']
    open_items = [f for f in issues if not f.get('review') or f['review']['decision'] == 'defer']
    accepted = [
        f
        for f in issues
        if f.get('review') and f['review']['decision'] == 'accept' and f['result'] != 'requires_specialist'
    ]
    requirements = [f['title'] + ': ' + (f['review'].get('note') or f['explanation']) for f in accepted]
    if not scoped:
        status, reason = None, 'Chưa có kết quả kiểm tra thuộc nhóm này; chuyên viên đánh giá trực tiếp.'
    elif open_items:
        status, reason = None, f'Còn {len(open_items)} nhận xét chưa đánh giá hoặc đang chờ làm rõ.'
    elif accepted:
        status, reason = 'revise', f'{len(accepted)} nội dung đã được ghi nhận cần chỉnh sửa, hoàn thiện.'
    else:
        status, reason = 'meets', 'Không còn nội dung cần làm rõ trong phạm vi kiểm tra tự động.'
    return {
        'status': status,
        'reason': reason,
        'requirements': requirements,
        'findings': [
            {
                'id': f['id'],
                'title': f['title'],
                'result': f['result'],
                'decision': (f.get('review') or {}).get('decision'),
            }
            for f in issues
        ],
    }


def suggested_conclusion(statuses):
    if any(s == 'pending' for s in statuses):
        return None
    if any(s == 'fails' for s in statuses):
        return 'ineligible'
    if any(s == 'revise' for s in statuses):
        return 'eligible_after_revision'
    return 'eligible'


def problems(sheet, applicable):
    """Reasons the sheet cannot support a result notice; empty when complete."""
    issues = []
    if not sheet:
        return ['Chưa lập phiếu thẩm định theo Điều 38 NĐ 217/2026.']
    rows = {s['id']: s for s in sheet.get('sections', [])}
    if applicable.get('planning') and not sheet.get('planningBasis'):
        issues.append('Chọn loại quy hoạch làm căn cứ lập dự án (khoản 1 Điều 38).')
    statuses = []
    for spec in SECTIONS:
        if not applicable.get(spec['id']):
            continue
        row = rows.get(spec['id']) or {}
        status = row.get('status', 'pending')
        statuses.append(status)
        if status == 'pending':
            issues.append('Chưa đánh giá: ' + spec['title'] + '.')
            continue
        if status != 'not_applicable' and not (row.get('assessment') or '').strip():
            issues.append('Thiếu nhận xét đánh giá: ' + spec['title'] + '.')
        if status in ('revise', 'fails') and not [r for r in row.get('requirements', []) if r.strip()]:
            issues.append('Nêu yêu cầu chỉnh sửa, hoàn thiện: ' + spec['title'] + '.')
    conclusion = sheet.get('conclusion', 'pending')
    expected = suggested_conclusion(statuses)
    if conclusion == 'pending':
        issues.append('Chưa chọn kết luận (mục VI.1 Mẫu số 03).')
    elif expected and conclusion != expected:
        issues.append(
            'Kết luận "'
            + CONCLUSIONS[conclusion]
            + '" không khớp mức đáp ứng của các nội dung (gợi ý: '
            + CONCLUSIONS[expected].lower()
            + ').'
        )
    return issues


def applicability(investment):
    return {s['id']: (cost_applies(investment) if s['id'] == 'cost' else True) for s in SECTIONS}


def view(case, investment):
    sheet = case.get('appraisalSheet') or {}
    rows = {s['id']: s for s in sheet.get('sections', [])}
    findings = _findings(case)
    applicable = applicability(investment)
    basis = PLANNING_BASES.get(sheet.get('planningBasis') or '')
    sections = []
    for spec in SECTIONS:
        row = rows.get(spec['id']) or {}
        criteria = (basis['criteria'] if basis else []) if spec['id'] == 'planning' else spec['criteria']
        sections.append(
            {
                'id': spec['id'],
                'title': spec['title'],
                'form': spec['form'],
                'basis': (basis['basis'] if basis and spec['id'] == 'planning' else spec['basis']),
                'criteria': criteria,
                'applicable': applicable[spec['id']],
                'status': row.get('status', 'pending' if applicable[spec['id']] else 'not_applicable'),
                'assessment': row.get('assessment', ''),
                'requirements': row.get('requirements', []),
                'findingIds': row.get('findingIds', []),
                'suggestion': suggest(spec, findings),
            }
        )
    statuses = [s['status'] for s in sections if s['applicable']]
    issues = problems(sheet, applicable)
    return {
        'version': VERSION,
        'planningBases': {k: v['label'] for k, v in PLANNING_BASES.items()},
        'statuses': STATUSES,
        'conclusions': CONCLUSIONS,
        'planningBasis': sheet.get('planningBasis', ''),
        'sections': sections,
        'conclusion': sheet.get('conclusion', 'pending'),
        'recommendations': sheet.get('recommendations', ''),
        'suggestedConclusion': suggested_conclusion(statuses),
        'problems': issues,
        'complete': not issues,
        'hasRun': bool(findings),
        'locked': bool(case.get('finalReview')),
        'updatedBy': sheet.get('updatedBy'),
        'updatedAt': sheet.get('updatedAt'),
    }


def apply(case, actor, body, investment):
    if case.get('procedure', 'bcnckt') != 'bcnckt':
        raise HTTPException(422, 'Phiếu thẩm định theo Điều 38 dành cho hồ sơ BCNCKT.')
    if case.get('finalReview'):
        raise HTTPException(409, 'Hồ sơ đã hoàn tất rà soát. Mở lại hồ sơ trước khi sửa phiếu thẩm định.')
    ids = [s.id for s in body.sections]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, 'Mỗi nhóm nội dung chỉ khai một lần.')
    applicable = applicability(investment)
    sections = []
    for row in body.sections:
        data = row.model_dump()
        data['requirements'] = [r.strip() for r in data['requirements'] if r.strip()]
        if not applicable[row.id]:
            data['status'] = 'not_applicable'
        sections.append(data)
    case['appraisalSheet'] = {
        'version': VERSION,
        'planningBasis': body.planningBasis,
        'sections': sections,
        'conclusion': body.conclusion,
        'recommendations': body.recommendations.strip(),
        'updatedBy': actor['name'],
        'updatedAt': now(),
    }
    return case['appraisalSheet']


def require_complete(case, investment):
    issues = problems(case.get('appraisalSheet'), applicability(investment))
    if issues:
        raise HTTPException(422, 'Phiếu thẩm định chưa hoàn chỉnh: ' + ' '.join(issues[:3]))
