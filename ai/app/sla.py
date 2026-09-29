"""Processing deadlines (SLA) for appraisal submissions.

Statutory periods below are transcribed from the legal corpus in
01_phap_ly_quy_chuan/ with their citations. They stay flagged
``requires_confirmation`` until a specialist confirms this policy version, and
the UI shows that flag next to every computed due date.

The due date is stored on the case payload (so lists can filter/sort in the
database); the SLA *state* depends on "today" and is evaluated when reading.
"""

import json
import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path

POLICY_VERSION = 'sla-2026.09.29-nd217-steps'
POLICY_STATUS = 'requires_confirmation'
DUE_SOON_WORKING_DAYS = 3
STATES = {
    'on_track': 'Trong hạn',
    'due_soon': 'Sắp đến hạn',
    'overdue': 'Quá hạn',
    'paused': 'Tạm dừng chờ bổ sung',
    'completed': 'Đã hoàn tất đúng hạn',
    'completed_late': 'Hoàn tất quá hạn',
    'superseded': 'Đã có lần nộp bổ sung',
    'supplement_overdue': 'Quá hạn bổ sung — xem xét dừng',
    'closed': 'Đã dừng / từ chối',
    'unconfigured': 'Chưa xác định hạn',
}

# NĐ 217/2026/NĐ-CP, Điều 54 khoản 1 điểm b — working days by permit subtype.
PERMIT_DAYS = {
    'house': 7,
    'new': 10,
    'stage': 10,
    'group': 10,
    'relocation': 10,
    'temporary': 10,
    'amendment': 9,
    'repair': 9,
    'extension': 5,
    'reissue': 5,
}
# NĐ 217/2026/NĐ-CP, Điều 37 khoản 1 — (grade I or above, other grades, clause point).
FEASIBILITY_DAYS = {'A': (25, 20, 'b'), 'B': (20, 16, 'c'), 'C': (15, 12, 'd')}


def normalize_group(value):
    text = str(value or '').upper().replace('NHÓM', '').strip()
    if text in ('QG', 'QUAN TRỌNG QUỐC GIA'):
        return 'QG'
    return text if text in ('A', 'B', 'C') else None


def normalize_grade(value):
    text = str(value or '').upper().replace('CẤP', '').strip()
    if text in ('DB', 'ĐB', 'ĐẶC BIỆT', 'DAC BIET'):
        return 'DB'
    return text if text in ('I', 'II', 'III', 'IV') else None


# Chế độ chuyển tiếp: hồ sơ trình trước 01/7/2026 đủ điều kiện thẩm định tiếp tục theo NĐ 175/2024
# (khoản 2 Điều 76 NĐ 217/2026); thời hạn của cơ quan chuyên môn theo Điều 59 Luật Xây dựng 2014 (sửa đổi 2020).
LEGACY_FEASIBILITY_DAYS = {'A': 35, 'B': 25, 'C': 15}


def legal_period(procedure, group, grade, subtype=None, regime='nd217'):
    """Return {'days','unit','basis'} or None with the reason in 'missing'."""
    high = grade in ('I', 'DB')
    if procedure == 'bcnckt' and regime == 'nd175':
        if group not in LEGACY_FEASIBILITY_DAYS:
            return {'missing': 'Dự án chưa có nhóm A/B/C (chế độ NĐ 175/2024).'}
        return {
            'days': LEGACY_FEASIBILITY_DAYS[group],
            'unit': 'calendar',
            'basis': 'Khoản 2 Điều 59 Luật Xây dựng 2014 (sửa đổi 2020), áp dụng theo khoản 2 Điều 76 NĐ 217/2026/NĐ-CP',
        }
    if procedure == 'bcnckt':
        if group == 'QG':
            return {'days': 60, 'unit': 'calendar', 'basis': 'Điểm a khoản 1 Điều 37 NĐ 217/2026/NĐ-CP'}
        if group not in FEASIBILITY_DAYS:
            return {'missing': 'Dự án chưa có nhóm A/B/C/QG.'}
        if not grade:
            return {'missing': 'Dự án chưa có cấp công trình.'}
        upper, lower, point = FEASIBILITY_DAYS[group]
        return {
            'days': upper if high else lower,
            'unit': 'working',
            'basis': f'Điểm {point} khoản 1 Điều 37 NĐ 217/2026/NĐ-CP',
        }
    if procedure == 'gpxd':
        days = PERMIT_DAYS.get(subtype or 'new')
        if not days:
            return {'missing': 'Chưa chọn loại thủ tục GPXD.'}
        return {'days': days, 'unit': 'working', 'basis': 'Điểm b khoản 1 Điều 54 NĐ 217/2026/NĐ-CP'}
    if procedure == 'nghiem_thu':
        if not grade:
            return {'missing': 'Dự án chưa có cấp công trình.'}
        return {
            'days': 16 if high else 12,
            'unit': 'working',
            'basis': 'Điều 27 NĐ 207/2026/NĐ-CP (thời hạn ra văn bản thông báo kết quả kiểm tra)',
        }
    return {'missing': 'Loại hồ sơ chưa có quy định thời hạn.'}


class Calendar:
    """Working-day calendar: weekends and holidays off, 'lam_bu' days worked."""

    def __init__(self, days, version):
        self.version = version
        self.off = {d: confirmed for d, kind, confirmed in days if kind != 'lam_bu'}
        self.worked = {d for d, kind, _ in days if kind == 'lam_bu'}
        self.years = {d.year for d, _, _ in days}

    def is_working(self, day):
        if day in self.worked:
            return True
        return day.weekday() < 5 and day not in self.off

    def add(self, start, count):
        """Date of the count-th working day after start (start itself not counted)."""
        day = start
        while count > 0:
            day += timedelta(days=1)
            if self.is_working(day):
                count -= 1
        return day

    def between(self, start, end):
        """Working days in (start, end]."""
        if end <= start:
            return 0
        return sum(1 for n in range(1, (end - start).days + 1) if self.is_working(start + timedelta(days=n)))

    def confirmed(self, start, end):
        """True when every holiday in [start, end] is confirmed and the years are covered."""
        if any(year not in self.years for year in range(start.year, end.year + 1)):
            return False
        return all(ok for day, ok in self.off.items() if start <= day <= end)


_cache = {'calendar': None, 'until': 0.0}
_lock = threading.Lock()
DEMO_CALENDAR = Path(__file__).with_name('data') / 'holidays.json'


def demo_calendar():
    data = json.loads(DEMO_CALENDAR.read_text(encoding='utf-8'))
    return Calendar([(date.fromisoformat(d['date']), d['kind'], d['confirmed']) for d in data['days']], data['version'])


def load_calendar(actor_id=None, cloud=False):
    """Holidays from public.holidays in cloud mode (cached 10 minutes), bundled file in demo."""
    if not cloud:
        return demo_calendar()
    with _lock:
        if _cache['calendar'] and time.monotonic() < _cache['until']:
            return _cache['calendar']
    try:
        from .database import read

        (rows,) = read(actor_id, ('select holiday_date,kind,is_confirmed from public.holidays', None))
        calendar = Calendar([(r['holiday_date'], r['kind'], r['is_confirmed']) for r in rows], 'public.holidays')
    except Exception:
        # Keep deadlines computable; the unconfirmed calendar is surfaced to the user.
        calendar = demo_calendar()
        calendar.version += '+fallback'
    with _lock:
        _cache.update(calendar=calendar, until=time.monotonic() + 600)
    return calendar


def _day(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value)[:10])


def _entered(case, target):
    """Date of the most recent transition into ``target`` (falls back to the last update)."""
    for entry in reversed((case.get('workflow') or {}).get('history', [])):
        if entry.get('to') == target:
            return _day(entry.get('at'))
    return _day(case.get('updatedAt'))


def outcome(case):
    """(outcome, date) for closed submissions: reviewed, rejected at intake, or stopped."""
    final = case.get('finalReview') or {}
    if final.get('decision') == 'reviewed':
        return 'reviewed', _day(final.get('at'))
    current = (case.get('workflow') or {}).get('state')
    if current in ('rejected', 'stopped'):
        return current, _entered(case, current)
    return None, None


def compute(case, calendar, classification, today=None):
    """Deadline facts stored on the case payload (independent of today's date).

    Phases: intake check (before the dossier is accepted as valid), processing (statutory period from
    ``workflow.validAt``, restarted when a supplement is accepted, plus one extension) and waiting for the
    applicant (supplement request or suspension, with its own deadline).
    """
    from .procedure_policy import intake_days, policy, wait_days

    procedure = case.get('procedure', 'bcnckt')
    workflow = case.get('workflow') or {}
    current = workflow.get('state') or 'received'
    group = normalize_group(classification.get('group'))
    grade = normalize_grade(classification.get('grade'))
    subtype = (case.get('procedureReview') or {}).get('subtype')
    regime = 'nd217'
    if procedure == 'bcnckt':
        from .legal import resolve_profile

        regime = resolve_profile(case)['code'] if case.get('legalDate') else 'nd217'
    period = legal_period(procedure, group, grade, subtype, 'nd175' if regime == 'nd175' else 'nd217')
    received = _day((case.get('legalContext') or {}).get('submissionDate') or case.get('legalDate'))
    valid = _day(workflow.get('validAt'))
    start = valid or received
    legal_due = None
    if start and period.get('days'):
        total = period['days'] * (2 if workflow.get('extended') else 1)
        legal_due = start + timedelta(days=total) if period['unit'] == 'calendar' else calendar.add(start, total)
    intake_due = None
    days = intake_days(procedure, subtype)
    if received and days and not valid and current in ('received', 'assigned'):
        intake_due = calendar.add(received, days)
    paused = current in ('awaiting_supplement', 'suspended')
    paused_since = _entered(case, current) if paused else None
    waiting_due = None
    if paused and paused_since:
        wait = wait_days(procedure, 'suspend' if current == 'suspended' else 'supplement', subtype)
        waiting_due = calendar.add(paused_since, wait) if wait else None
    internal_due = _day(workflow.get('deadline'))
    due = intake_due or legal_due or internal_due
    kind = 'intake' if intake_due else 'legal' if legal_due else 'internal' if internal_due else None
    result, finished = outcome(case)
    return {
        'policyVersion': POLICY_VERSION,
        'policyStatus': POLICY_STATUS,
        'calendarVersion': calendar.version,
        'calendarConfirmed': bool(start and due) and calendar.confirmed(start, max(due, start)),
        'basis': period.get('basis'),
        'regime': 'nd175' if regime == 'nd175' else 'nd217',
        'intakeBasis': policy(procedure).get('intakeBasis') if intake_due else None,
        'missing': period.get('missing'),
        'periodDays': period.get('days'),
        'periodUnit': period.get('unit'),
        'extended': bool(workflow.get('extended')),
        'projectGroup': group,
        'projectGrade': grade,
        'receivedDate': received.isoformat() if received else None,
        'startDate': start.isoformat() if start else None,
        'validated': bool(valid),
        'intakeDueDate': intake_due.isoformat() if intake_due else None,
        'legalDueDate': legal_due.isoformat() if legal_due else None,
        'internalDueDate': internal_due.isoformat() if internal_due else None,
        'dueDate': due.isoformat() if due else None,
        'dueKind': kind,
        'paused': paused,
        'pausedSince': paused_since.isoformat() if paused_since else None,
        'waitingDueDate': waiting_due.isoformat() if waiting_due else None,
        'pausedDays': 0,
        'outcome': result,
        'completedAt': finished.isoformat() if finished else None,
    }


def soon_limit(calendar, today=None):
    return calendar.add(today or date.today(), DUE_SOON_WORKING_DAYS)


def evaluate(sla, calendar, superseded=False, today=None):
    """SLA state relative to today; safe for payloads that predate SLA."""
    today = today or date.today()
    sla = sla or {}
    due = _day(sla.get('dueDate'))
    finished = _day(sla.get('completedAt'))
    waiting = _day(sla.get('waitingDueDate'))
    remaining = None
    phase = 'waiting' if sla.get('paused') else sla.get('dueKind') or 'legal'
    if finished:
        if sla.get('outcome') in ('rejected', 'stopped'):
            state = 'closed'
        else:
            state = 'completed_late' if due and finished > due else 'completed'
        phase = 'closed'
    elif superseded:
        state = 'superseded'
    elif sla.get('paused'):
        state = 'supplement_overdue' if waiting and today > waiting else 'paused'
        if waiting:
            remaining = calendar.between(today, waiting) if today <= waiting else -calendar.between(waiting, today)
    elif not due:
        state = 'unconfigured'
    elif today > due:
        state = 'overdue'
        remaining = -calendar.between(due, today)
    else:
        remaining = calendar.between(today, due)
        state = 'due_soon' if due <= soon_limit(calendar, today) else 'on_track'
    return {'state': state, 'label': STATES[state], 'remainingWorkingDays': remaining, 'phase': phase}
