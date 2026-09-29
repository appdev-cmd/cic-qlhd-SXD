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

POLICY_VERSION = 'sla-2026.09.28'
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


def legal_period(procedure, group, grade, subtype=None):
    """Return {'days','unit','basis'} or None with the reason in 'missing'."""
    high = grade in ('I', 'DB')
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


def pauses(case):
    """(start, end|None) periods spent awaiting a supplement, from workflow history."""
    periods, opened = [], None
    for entry in (case.get('workflow') or {}).get('history', []):
        if entry.get('to') == 'awaiting_supplement' and opened is None:
            opened = _day(entry.get('at'))
        elif entry.get('from') == 'awaiting_supplement' and opened is not None:
            periods.append((opened, _day(entry.get('at'))))
            opened = None
    if opened is None and (case.get('workflow') or {}).get('state') == 'awaiting_supplement':
        opened = _day(case.get('updatedAt'))
    if opened is not None:
        periods.append((opened, None))
    return periods


def completed_at(case):
    final = case.get('finalReview') or {}
    if final.get('decision') == 'reviewed':
        return _day(final.get('at'))
    return None


def compute(case, calendar, classification, today=None):
    """Deadline facts stored on the case payload (independent of today's date)."""
    today = today or date.today()
    group = normalize_group(classification.get('group'))
    grade = normalize_grade(classification.get('grade'))
    subtype = (case.get('procedureReview') or {}).get('subtype')
    period = legal_period(case.get('procedure', 'bcnckt'), group, grade, subtype)
    start = _day((case.get('legalContext') or {}).get('submissionDate') or case.get('legalDate'))
    periods = pauses(case)
    paused = bool(periods and periods[-1][1] is None)
    paused_days = 0
    for begin, end in periods:
        stop = end or today
        paused_days += (
            calendar.between(begin, stop) if period.get('unit') != 'calendar' else max((stop - begin).days, 0)
        )
    legal_due = None
    if start and period.get('days'):
        total = period['days'] + paused_days
        legal_due = start + timedelta(days=total) if period['unit'] == 'calendar' else calendar.add(start, total)
    internal_due = _day((case.get('workflow') or {}).get('deadline'))
    due = legal_due or internal_due
    finished = completed_at(case)
    return {
        'policyVersion': POLICY_VERSION,
        'policyStatus': POLICY_STATUS,
        'calendarVersion': calendar.version,
        'calendarConfirmed': bool(start and due) and calendar.confirmed(start, max(due, start)),
        'basis': period.get('basis'),
        'missing': period.get('missing'),
        'periodDays': period.get('days'),
        'periodUnit': period.get('unit'),
        'projectGroup': group,
        'projectGrade': grade,
        'startDate': start.isoformat() if start else None,
        'legalDueDate': legal_due.isoformat() if legal_due else None,
        'internalDueDate': internal_due.isoformat() if internal_due else None,
        'dueDate': due.isoformat() if due else None,
        'dueKind': 'legal' if legal_due else 'internal' if internal_due else None,
        'paused': paused,
        'pausedSince': periods[-1][0].isoformat() if paused else None,
        'pausedDays': paused_days,
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
    remaining = None
    if finished:
        state = 'completed_late' if due and finished > due else 'completed'
    elif superseded:
        state = 'superseded'
    elif sla.get('paused'):
        state = 'paused'
    elif not due:
        state = 'unconfigured'
    elif today > due:
        state = 'overdue'
        remaining = -calendar.between(due, today)
    else:
        remaining = calendar.between(today, due)
        state = 'due_soon' if due <= soon_limit(calendar, today) else 'on_track'
    return {'state': state, 'label': STATES[state], 'remainingWorkingDays': remaining}
