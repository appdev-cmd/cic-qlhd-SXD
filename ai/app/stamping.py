"""Stamping, result delivery and archive of a BCNCKT appraisal — khoản 8, 9 Điều 36 NĐ 217/2026; Mẫu số 14.

- Đủ điều kiện: the agency checks and stamps 01 set of design drawings (điểm b khoản 8).
- Chỉ đủ điều kiện sau khi hoàn thiện: the result is returned unstamped; the project preparer submits a stamping
  request with the revised design, the agency checks it against the result notice and stamps (điểm c, d khoản 8).
- Chưa đủ điều kiện: drawings are returned unstamped (điểm c khoản 8).
- The preparer submits a PDF copy of the stamped drawings within 05 working days (điểm b khoản 9).
"""

from datetime import date
from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .domain import now

PDF_COPY_DAYS = 5
STATUSES = {
    'not_started': 'Chưa có kết quả thẩm định',
    'to_stamp': 'Chờ kiểm tra, đóng dấu bản vẽ',
    'awaiting_request': 'Chờ đề nghị đóng dấu kèm hồ sơ đã chỉnh sửa',
    'unstamped': 'Trả hồ sơ không đóng dấu (chưa đủ điều kiện)',
    'stamped': 'Đã đóng dấu; chờ bản chụp PDF',
    'archived': 'Đã nhận bản chụp PDF; lưu trữ',
}
BASIS = {
    'to_stamp': 'Điểm b khoản 8 Điều 36 NĐ 217/2026',
    'awaiting_request': 'Điểm c, d khoản 8 Điều 36 NĐ 217/2026',
    'unstamped': 'Điểm c khoản 8 Điều 36 NĐ 217/2026',
    'stamped': 'Điểm a khoản 8, điểm b khoản 9 Điều 36 NĐ 217/2026; Mẫu số 14 Phụ lục I',
    'archived': 'Khoản 9 Điều 36 NĐ 217/2026',
}
# action: (sources, target)
ACTIONS = {
    'request': (['awaiting_request'], 'to_stamp'),
    'refuse': (['to_stamp'], 'awaiting_request'),
    'stamp': (['to_stamp'], 'stamped'),
    'pdf_received': (['stamped'], 'archived'),
}
LABELS = {
    'request': 'Tiếp nhận đề nghị đóng dấu',
    'refuse': 'Hồ sơ chỉnh sửa chưa đáp ứng; trả lại',
    'stamp': 'Đóng dấu thẩm định bản vẽ (Mẫu số 14)',
    'pdf_received': 'Nhận bản chụp PDF bản vẽ đã đóng dấu',
}
LEADERS = ('head_of_department', 'director', 'admin')


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Drawing(Payload):
    code: str = Field(default='', max_length=60)
    name: str = Field(min_length=2, max_length=300)
    sheets: int = Field(default=1, ge=1, le=2000)


class StampingCommand(Payload):
    revision: int = Field(ge=1)
    action: Literal[tuple(ACTIONS)]
    note: str = Field(default='', max_length=2000)
    reference: str = Field(default='', max_length=200)
    date: date
    noticeReference: str = Field(default='', max_length=200)
    drawings: list[Drawing] = Field(default_factory=list, max_length=300)


def initial(case):
    review = case.get('finalReview') or {}
    if review.get('decision') != 'reviewed':
        return 'not_started'
    conclusion = (case.get('appraisalSheet') or {}).get('conclusion')
    return {'eligible': 'to_stamp', 'eligible_after_revision': 'awaiting_request', 'ineligible': 'unstamped'}.get(
        conclusion, 'not_started'
    )


def status(case):
    record = case.get('stamping') or {}
    return record.get('status') or initial(case)


def archive(case, current):
    """Documents the agency keeps after the appraisal (điểm a khoản 9 Điều 36)."""
    categories = {r['id']: r.get('category') for r in case.get('requirements', [])}
    docs = [d for d in case.get('documents', []) if d['role'] != 'reference']

    def has(*groups):
        return any(d['requirementId'] in groups or categories.get(d['requirementId']) in groups for d in docs)

    reviewed = (case.get('finalReview') or {}).get('decision') == 'reviewed'
    consulted = [c for c in case.get('consultations', []) if c.get('response')]
    return [
        {'name': 'Tờ trình thẩm định', 'state': 'done' if has('TTR') else 'missing'},
        {'name': 'Hồ sơ pháp lý trình thẩm định', 'state': 'done' if has('Tiếp nhận', 'Pháp lý') else 'missing'},
        {
            'name': 'Kết luận của tổ chức, cá nhân tham gia thẩm định (nếu có)',
            'state': 'done' if consulted else 'optional',
        },
        {'name': 'Thông báo kết quả thẩm định (Mẫu số 03)', 'state': 'done' if reviewed else 'missing'},
        {
            'name': 'Bản chụp PDF bản vẽ đã đóng dấu thẩm định',
            'state': 'done' if current == 'archived' else 'optional' if current == 'unstamped' else 'missing',
        },
    ]


def view(case, calendar=None):
    record = case.get('stamping') or {}
    current = status(case)
    stamped = record.get('stampedAt')
    due = record.get('pdfDueDate')
    if stamped and not due and calendar:
        due = calendar.add(date.fromisoformat(stamped), PDF_COPY_DAYS).isoformat()
    return {
        'status': current,
        'label': STATUSES[current],
        'basis': BASIS.get(current),
        'conclusion': (case.get('appraisalSheet') or {}).get('conclusion'),
        'actions': [{'id': a, 'label': LABELS[a]} for a, (sources, _) in ACTIONS.items() if current in sources],
        'drawings': record.get('drawings', []),
        'noticeReference': record.get('noticeReference', ''),
        'stampedAt': stamped,
        'stampedBy': record.get('stampedBy'),
        'pdfDueDate': due,
        'pdfReceivedAt': record.get('pdfReceivedAt'),
        'history': record.get('history', []),
        'archive': archive(case, current),
    }


def apply(case, actor, body, calendar, demo=False):
    if case.get('procedure', 'bcnckt') != 'bcnckt':
        raise HTTPException(422, 'Đóng dấu thẩm định chỉ áp dụng cho hồ sơ BCNCKT.')
    current = status(case)
    sources, target = ACTIONS[body.action]
    if current not in sources:
        raise HTTPException(409, 'Thao tác không phù hợp bước hiện tại: ' + STATUSES[current] + '.')
    if body.action == 'stamp' and not demo and actor['role'] not in LEADERS:
        raise HTTPException(403, 'Chỉ trưởng phòng hoặc lãnh đạo được xác nhận đóng dấu thẩm định.')
    if body.date.isoformat() > date.today().isoformat():
        raise HTTPException(422, 'Ngày không được sau ngày hiện tại.')
    record = dict(case.get('stamping') or {'status': current, 'history': []})
    if body.action == 'request' and not body.reference.strip():
        raise HTTPException(422, 'Nhập số, ngày văn bản đề nghị đóng dấu.')
    if body.action == 'refuse' and len(body.note.strip()) < 5:
        raise HTTPException(422, 'Nêu nội dung chưa đáp ứng yêu cầu tại thông báo kết quả thẩm định.')
    if body.action == 'stamp':
        if not body.drawings:
            raise HTTPException(422, 'Liệt kê các bản vẽ được đóng dấu thẩm định.')
        if not body.noticeReference.strip():
            raise HTTPException(422, 'Nhập số, ngày thông báo kết quả thẩm định ghi trên dấu (Mẫu số 14).')
        if record.get('history') and body.date.isoformat() < record['history'][-1]['date']:
            raise HTTPException(422, 'Ngày đóng dấu không được trước ngày tiếp nhận đề nghị.')
        record.update(
            drawings=[d.model_dump() for d in body.drawings],
            noticeReference=body.noticeReference.strip(),
            stampedAt=body.date.isoformat(),
            stampedBy=actor['name'],
            pdfDueDate=calendar.add(body.date, PDF_COPY_DAYS).isoformat(),
        )
    if body.action == 'pdf_received':
        if body.date.isoformat() < record['stampedAt']:
            raise HTTPException(422, 'Ngày nhận bản chụp không được trước ngày đóng dấu.')
        record['pdfReceivedAt'] = body.date.isoformat()
    entry = {
        'action': body.action,
        'label': LABELS[body.action],
        'from': current,
        'to': target,
        'date': body.date.isoformat(),
        'reference': body.reference.strip(),
        'note': body.note.strip(),
        'actor': actor['name'],
        'at': now(),
    }
    record['history'] = record.get('history', []) + [entry]
    record['status'] = target
    case['stamping'] = record
    return LABELS[body.action]
