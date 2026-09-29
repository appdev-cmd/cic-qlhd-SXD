"""Internal processing workflow following NĐ 217/2026 and NĐ 207/2026. No action signs or issues a document.

Procedural events are limited as the decrees require (one supplement request, at most one suspension, one
extension) and every event records its legal basis. ``workflow.validAt`` is the day the dossier was accepted
as complete and valid: the statutory period runs from it and restarts when a supplement is received.
"""

from datetime import date

from fastapi import HTTPException
from .domain import now
from .procedure_policy import policy

STATES = {
    'received': 'Tiếp nhận, kiểm tra hồ sơ',
    'assigned': 'Đã phân công',
    'processing': 'Đang xử lý',
    'awaiting_supplement': 'Chờ bổ sung hồ sơ',
    'suspended': 'Tạm dừng thẩm định',
    'pending_review': 'Chờ lãnh đạo rà soát',
    'site_visit': 'Kiểm tra hiện trường',
    'correction': 'Theo dõi khắc phục',
    'reviewed': 'Hoàn tất rà soát nội bộ',
    'rejected': 'Từ chối tiếp nhận',
    'stopped': 'Dừng xử lý',
}
TERMINAL = ('reviewed', 'rejected', 'stopped')
STAFF = ['officer', 'head_of_department', 'director']
LEADERS = ['head_of_department', 'director']
TRANSITIONS = {
    'start': (['received', 'assigned'], 'processing', STAFF),
    'request_supplement': (['received', 'assigned', 'processing', 'pending_review'], 'awaiting_supplement', STAFF),
    'suspend': (['processing', 'pending_review'], 'suspended', STAFF),
    'resume': (['awaiting_supplement', 'suspended'], 'processing', STAFF),
    'extend': (['processing', 'pending_review'], None, LEADERS),
    'reject_intake': (['received', 'assigned'], 'rejected', LEADERS),
    'stop': (['awaiting_supplement', 'suspended', 'processing'], 'stopped', LEADERS),
    'submit_review': (['processing', 'site_visit', 'correction'], 'pending_review', STAFF),
    'return': (['pending_review'], 'processing', LEADERS),
    'approve': (['pending_review'], 'reviewed', LEADERS),
    'schedule_visit': (['processing'], 'site_visit', STAFF),
    'require_correction': (['site_visit'], 'correction', STAFF),
    'confirm_correction': (['correction'], 'processing', STAFF),
}
LABELS = {
    'start': 'Xác nhận hồ sơ hợp lệ, bắt đầu xử lý',
    'request_supplement': 'Yêu cầu bổ sung hồ sơ',
    'suspend': 'Tạm dừng thẩm định',
    'resume': 'Tiếp nhận hồ sơ bổ sung',
    'extend': 'Gia hạn thẩm định',
    'reject_intake': 'Từ chối tiếp nhận hồ sơ',
    'stop': 'Dừng thẩm định',
    'submit_review': 'Trình lãnh đạo rà soát',
    'return': 'Trả chuyên viên xử lý',
    'approve': 'Hoàn tất rà soát nội bộ',
    'schedule_visit': 'Ghi lịch kiểm tra hiện trường',
    'require_correction': 'Yêu cầu khắc phục',
    'confirm_correction': 'Xác nhận theo dõi khắc phục',
}
PROCEDURE_LABELS = {
    ('gpxd', 'stop'): 'Thông báo không cấp giấy phép',
    ('gpxd', 'request_supplement'): 'Thông báo bổ sung hồ sơ (một lần)',
    ('bcnckt', 'request_supplement'): 'Yêu cầu bổ sung hồ sơ (Mẫu 15)',
    ('bcnckt', 'suspend'): 'Tạm dừng thẩm định (Mẫu 16)',
    ('nghiem_thu', 'stop'): 'Dừng kiểm tra',
}
ONLY_INSPECTION = ('schedule_visit', 'require_correction', 'confirm_correction')


def state(case):
    return case.get('workflow', {}).get('state') or (
        'reviewed' if case.get('finalReview', {}) and case['finalReview']['decision'] == 'reviewed' else 'received'
    )


def label(case, action):
    return PROCEDURE_LABELS.get((case.get('procedure', 'bcnckt'), action), LABELS[action])


def derive_status(case):
    """Single source for the list status: workflow outcome first, then analysis progress."""
    decision = (case.get('finalReview') or {}).get('decision')
    if decision in ('reviewed', 'request_supplement'):
        return decision
    current = state(case)
    if current in ('reviewed', 'rejected', 'stopped', 'suspended'):
        return current
    if current == 'awaiting_supplement':
        return 'request_supplement'
    job = case.get('job') or {}
    if job.get('status') == 'running' and job.get('mode') != 'ocr':
        return 'analyzing'
    runs = case.get('runs') or []
    if runs and not runs[-1].get('stale'):
        return 'analyzed'
    return 'processing' if current in ('processing', 'site_visit', 'correction', 'pending_review') else 'intake'


def counters(case):
    return (case.get('workflow') or {}).get('counters') or {}


def _allowed(case, key, current):
    """Procedure-specific limits from NĐ 217/2026 Điều 36, 37, 54 and NĐ 207/2026 Điều 27."""
    procedure = case.get('procedure', 'bcnckt')
    rules = policy(procedure)
    used = counters(case)
    if key in ONLY_INSPECTION and procedure != 'nghiem_thu':
        return False
    if key == 'request_supplement':
        rule = rules['supplement']
        if rule.get('max') is not None and used.get(key, 0) >= rule['max']:
            return False
        # BCNCKT: the one supplement request belongs to the intake check; later problems use suspension.
        return not (rule.get('phase') == 'intake' and current not in ('received', 'assigned'))
    if key == 'suspend':
        rule = rules.get('suspend')
        return bool(rule) and used.get(key, 0) < rule['max']
    if key == 'extend':
        rule = rules.get('extend')
        return bool(rule) and used.get(key, 0) < rule['max']
    if key == 'stop':
        if procedure == 'gpxd':
            return used.get('request_supplement', 0) >= 1
        if current == 'processing':
            return False
        due = (case.get('sla') or {}).get('waitingDueDate')
        return bool(due) and date.today().isoformat() > due
    return True


def options(case, actor):
    current = state(case)
    assigned = case.get('workflow', {}).get('assigneeId')
    if assigned and assigned != actor['id'] and actor['role'] == 'officer':
        return []
    if case.get('finalReview') or current in TERMINAL:
        return []
    return [
        {'id': key, 'label': label(case, key)}
        for key, (sources, _, roles) in TRANSITIONS.items()
        if current in sources and actor['role'] in roles and _allowed(case, key, current)
    ]


def apply(case, actor, action, note, visit_date=None):
    if action not in {x['id'] for x in options(case, actor)}:
        raise HTTPException(409, 'Thao tác không phù hợp trạng thái, số lần cho phép hoặc quyền hiện tại.')
    workflow = case.get('workflow') or {}
    assigned = workflow.get('assigneeId')
    if assigned and assigned != actor['id'] and actor['role'] == 'officer':
        raise HTTPException(403, 'Hồ sơ đã phân công chuyên viên khác.')
    if action in ('submit_review', 'approve'):
        if case.get('procedure') in ('gpxd', 'nghiem_thu'):
            from .procedure_review import validate

            validate(case.get('procedureReview'))
        if not any(d['role'] == 'submission' for d in case['documents']):
            raise HTTPException(422, 'Cần tài liệu đầu vào trước khi trình rà soát.')
        if case.get('procedure', 'bcnckt') == 'bcnckt' and (not case['runs'] or case['runs'][-1].get('stale')):
            raise HTTPException(422, 'Cần kết quả kiểm tra còn hiệu lực trước khi trình rà soát.')
    if action == 'schedule_visit' and not visit_date:
        raise HTTPException(422, 'Nhập ngày kiểm tra hiện trường dự kiến.')
    if action == 'confirm_correction':
        review = case.get('procedureReview')
        if not review or not review.get('defects') or any(d['status'] != 'resolved' for d in review['defects']):
            raise HTTPException(422, 'Cần ghi nhận các tồn tại và xác nhận tài liệu khắc phục trong phiếu chuyên môn.')
    if action == 'schedule_visit' and visit_date < case['legalDate']:
        raise HTTPException(422, 'Ngày kiểm tra không được trước ngày đánh giá của hồ sơ.')
    source = state(case)
    target = TRANSITIONS[action][1] or source
    rules = policy(case.get('procedure', 'bcnckt'))
    basis = {
        'request_supplement': rules['supplement'].get('basis'),
        'suspend': (rules.get('suspend') or {}).get('basis'),
        'resume': rules.get('restartBasis'),
        'extend': (rules.get('extend') or {}).get('basis'),
        'stop': (rules.get('supplement') or {}).get('basis'),
    }.get(action)
    today = date.today().isoformat()
    entry = {
        'from': source,
        'to': target,
        'action': label(case, action),
        'note': note,
        'actor': actor['name'],
        'at': now(),
    }
    if basis:
        entry['basis'] = basis
    used = dict(counters(case))
    if action in ('request_supplement', 'suspend', 'extend'):
        used[action] = used.get(action, 0) + 1
    case['workflow'] = {**workflow, 'state': target, 'history': workflow.get('history', []) + [entry], 'counters': used}
    if action == 'start' and not workflow.get('validAt'):
        case['workflow']['validAt'] = today
    if action == 'resume':
        # Supplement received and accepted: the statutory period is counted again from the beginning.
        case['workflow']['validAt'] = today
    if action == 'extend':
        case['workflow']['extended'] = True
    if visit_date:
        case['workflow']['visitDate'] = visit_date
    if action == 'approve':
        case['finalReview'] = {
            'decision': 'reviewed',
            'note': note,
            'actor': actor['name'],
            'at': now(),
            'simulation': bool(case.get('sample')),
        }
    return entry['action']
