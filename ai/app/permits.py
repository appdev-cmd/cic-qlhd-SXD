"""Building permit lifecycle after the dossier review — NĐ 217/2026.

- Consultation of related agencies: answer within 02 working days, silence counts as consent
  (điểm c khoản 2, điểm c khoản 3 Điều 54).
- Issued permit: number, content of Điều 49, deadline to start works (12 months from issue or extension,
  khoản 10 Điều 49), publication on the agency website for at least 12 months (khoản 1 Điều 66).
- Amendment / extension (≤ 02 times, 12 months each) / reissue are recorded against the original permit
  (Điều 63, 64); revocation and cancellation follow Điều 65.
The register is derived from the permit records stored on GPXD submissions.
"""

from datetime import date
from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .domain import now, uid

CONSULT_DAYS = 2
RETURN_DAYS = 5  # nộp lại bản gốc sau quyết định thu hồi — điểm c khoản 3 Điều 65
PUBLISH_DAYS = 5  # gửi UBND cấp xã công bố — điểm b khoản 3 Điều 65
CANCEL_AFTER_DAYS = 10  # hủy khi không nộp lại trong 10 ngày làm việc — khoản 2 Điều 65
MAX_EXTENSIONS = 2
FORMS = {
    'new': '03',
    'stage': '03',
    'group': '03',
    'house': '03',
    'repair': '04',
    'relocation': '04',
    'temporary': '05',
}
REVOKE_REASONS = {
    'unlawful': 'Giấy phép được cấp không đúng quy định của pháp luật (điểm a khoản 1 Điều 65)',
    'not_remedied': 'Chủ đầu tư không khắc phục việc xây dựng sai giấy phép trong thời hạn (điểm b khoản 1 Điều 65)',
}
STATUS_LABELS = {
    'valid': 'Còn hiệu lực, chưa khởi công',
    'started': 'Đã khởi công',
    'start_overdue': 'Quá thời hạn khởi công, chưa gia hạn',
    'revoked': 'Đã thu hồi',
    'returned': 'Đã thu hồi, đã nộp lại bản gốc',
    'cancelled': 'Đã hủy',
}


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class ConsultationCommand(Payload):
    revision: int = Field(ge=1)
    action: Literal['send', 'respond']
    id: str = Field(default='', max_length=60)
    agency: str = Field(default='', max_length=300)
    subject: str = Field(default='', max_length=2000)
    date: date
    response: str = Field(default='', max_length=3000)


class PermitCommand(Payload):
    revision: int = Field(ge=1)
    action: Literal['issue', 'revoke', 'return', 'cancel']
    date: date
    number: str = Field(default='', max_length=60)
    basePermit: str = Field(default='', max_length=60)
    reference: str = Field(default='', max_length=200)
    reason: Literal['', 'unlawful', 'not_remedied'] = ''
    note: str = Field(default='', max_length=2000)


def add_months(day, months):
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    for last in (31, 30, 29, 28):
        try:
            return date(year, month, min(day.day, last))
        except ValueError:
            continue


def _require_permit_case(case):
    if case.get('procedure') != 'gpxd':
        raise HTTPException(422, 'Chức năng này dành cho hồ sơ cấp giấy phép xây dựng.')


# ─── Consultation (điểm c khoản 2 Điều 54) ────────────────────────────────────────────────────────
def consultations(case, calendar, today=None):
    today = today or date.today()
    rows = []
    for item in case.get('permitConsultations', []):
        due = calendar.add(date.fromisoformat(item['sentDate']), CONSULT_DAYS)
        if item.get('respondedDate'):
            status = 'responded'
        elif due < today:
            status = 'silent_consent'
        else:
            status = 'waiting'
        rows.append({**item, 'dueDate': due.isoformat(), 'status': status})
    return rows


def consult(case, actor, body, calendar):
    _require_permit_case(case)
    if case.get('finalReview'):
        raise HTTPException(409, 'Hồ sơ đã hoàn tất rà soát.')
    if body.date > date.today():
        raise HTTPException(422, 'Ngày không được sau ngày hiện tại.')
    items = case.setdefault('permitConsultations', [])
    if body.action == 'send':
        if len(body.agency.strip()) < 3 or len(body.subject.strip()) < 5:
            raise HTTPException(422, 'Nhập cơ quan được hỏi ý kiến và nội dung cần ý kiến.')
        items.append(
            {
                'id': uid(),
                'agency': body.agency.strip(),
                'subject': body.subject.strip(),
                'sentDate': body.date.isoformat(),
                'response': '',
                'respondedDate': None,
                'actor': actor['name'],
                'at': now(),
            }
        )
        return 'Gửi văn bản lấy ý kiến: ' + body.agency.strip()
    item = next((x for x in items if x['id'] == body.id), None)
    if not item:
        raise HTTPException(404, 'Không có văn bản lấy ý kiến này.')
    if item.get('respondedDate'):
        raise HTTPException(409, 'Đã ghi nhận ý kiến trả lời.')
    if body.date.isoformat() < item['sentDate'] or len(body.response.strip()) < 3:
        raise HTTPException(422, 'Nhập nội dung trả lời và ngày nhận không trước ngày gửi.')
    item.update(response=body.response.strip(), respondedDate=body.date.isoformat())
    return 'Ghi nhận ý kiến của ' + item['agency']


# ─── Permit records ─────────────────────────────────────────────────────────────────────────────────
def permit_status(permit, calendar=None, today=None):
    today = today or date.today()
    events = [e['type'] for e in permit.get('events', [])]
    if 'cancel' in events:
        return 'cancelled'
    if 'return' in events:
        return 'returned'
    if 'revoke' in events:
        return 'revoked'
    if permit.get('startedAt'):
        return 'started'
    if permit.get('startDeadline') and date.fromisoformat(permit['startDeadline']) < today:
        return 'start_overdue'
    return 'valid'


def view(case, calendar):
    permit = case.get('permit')
    review = case.get('procedureReview') or {}
    eligible = review.get('conclusion') == 'eligible'
    reviewed = (case.get('finalReview') or {}).get('decision') == 'reviewed'
    actions = []
    if not permit and reviewed and eligible:
        actions.append('issue')
    if permit:
        events = {e['type'] for e in permit.get('events', [])}
        if 'revoke' not in events:
            actions.append('revoke')
        elif 'return' not in events and 'cancel' not in events:
            actions += ['return', 'cancel']
    status = permit_status(permit, calendar) if permit else None
    revoked = next((e for e in (permit or {}).get('events', []) if e['type'] == 'revoke'), None)
    return {
        'consultations': consultations(case, calendar),
        'consultDays': CONSULT_DAYS,
        'permit': permit,
        'status': status,
        'statusLabel': STATUS_LABELS.get(status),
        'returnDueDate': calendar.add(date.fromisoformat(revoked['date']), RETURN_DAYS).isoformat()
        if revoked
        else None,
        'cancelFromDate': calendar.add(date.fromisoformat(revoked['date']), CANCEL_AFTER_DAYS).isoformat()
        if revoked
        else None,
        'actions': actions,
        'revokeReasons': REVOKE_REASONS,
        'subtype': review.get('subtype'),
        'eligible': eligible,
        'reviewed': reviewed,
    }


def content(case):
    """Permit content (Điều 49) taken from the confirmed review sheet."""
    review = case.get('procedureReview') or {}
    details = review.get('details') or {}
    keys = (
        'buildingClass',
        'land',
        'elevation',
        'setback',
        'density',
        'landRatio',
        'boundaries',
        'area',
        'floorArea',
        'height',
        'floors',
        'color',
        'depth',
        'route',
        'temporaryTerm',
    )
    return {
        'name': str(case.get('projectName') or case['name']),
        'investor': review.get('investor', ''),
        'location': review.get('location', ''),
        'scope': review.get('scope', ''),
        **{k: details[k] for k in keys if details.get(k)},
    }


def issue(case, actor, body, register, calendar):
    review = case.get('procedureReview') or {}
    subtype = review.get('subtype') or 'new'
    if subtype in ('amendment', 'extension', 'reissue'):
        base = next((p for p in register if p['number'] == body.basePermit.strip()), None)
        if not base:
            raise HTTPException(422, 'Chọn giấy phép gốc trong sổ giấy phép để ghi điều chỉnh, gia hạn, cấp lại.')
        if base['status'] in ('revoked', 'returned', 'cancelled'):
            raise HTTPException(409, 'Giấy phép gốc đã bị thu hồi hoặc hủy.')
        if subtype == 'extension':
            if base['extensions'] >= MAX_EXTENSIONS:
                raise HTTPException(409, 'Mỗi giấy phép chỉ được gia hạn tối đa 02 lần (điểm a khoản 3 Điều 63).')
        number = base['number']
        form = base['form']
    else:
        number = body.number.strip() or next_number(register, body.date)
        if any(p['number'] == number for p in register):
            raise HTTPException(409, 'Số giấy phép đã được sử dụng.')
        form = FORMS.get(subtype, '03')
    record = {
        'id': uid(),
        'number': number,
        'kind': subtype,
        'form': form,
        'issueDate': body.date.isoformat(),
        'issuedBy': actor['name'],
        'content': content(case),
        'note': body.note.strip(),
        'events': [],
    }
    if subtype == 'extension':
        # Each extension adds 12 months to the deadline for starting works.
        base_deadline = date.fromisoformat(base['startDeadline'])
        record['startDeadline'] = add_months(max(base_deadline, body.date), 12).isoformat()
        record['extensionNo'] = base['extensions'] + 1
    elif subtype in ('amendment', 'reissue'):
        record['startDeadline'] = base['startDeadline']
    else:
        record['startDeadline'] = add_months(body.date, 12).isoformat()
    record['publicUntil'] = add_months(body.date, 12).isoformat()
    case['permit'] = record
    return {
        'amendment': 'Ghi điều chỉnh giấy phép số ' + number,
        'extension': 'Gia hạn giấy phép số ' + number,
        'reissue': 'Cấp lại giấy phép số ' + number,
    }.get(subtype, 'Cấp giấy phép xây dựng số ' + number)


def next_number(register, day):
    year = day.year
    used = [p['number'] for p in register if p['number'].endswith(f'/{year}/GPXD')]
    return f'{len(used) + 1:03d}/{year}/GPXD'


def act(case, actor, body, register, calendar, demo=False):
    _require_permit_case(case)
    if body.date > date.today():
        raise HTTPException(422, 'Ngày không được sau ngày hiện tại.')
    if not demo and actor['role'] not in ('head_of_department', 'director', 'admin'):
        raise HTTPException(403, 'Chỉ trưởng phòng hoặc lãnh đạo được cấp, thu hồi, hủy giấy phép.')
    allowed = view(case, calendar)['actions']
    if body.action not in allowed:
        raise HTTPException(409, 'Thao tác không phù hợp tình trạng hồ sơ, giấy phép.')
    if body.action == 'issue':
        return issue(case, actor, body, register, calendar)
    permit = case['permit']
    events = permit.setdefault('events', [])
    if body.action == 'revoke':
        if not body.reason or not body.reference.strip():
            raise HTTPException(422, 'Nêu căn cứ thu hồi (khoản 1 Điều 65) và số, ngày quyết định thu hồi.')
    if body.action == 'cancel':
        revoked = next(e for e in events if e['type'] == 'revoke')
        earliest = calendar.add(date.fromisoformat(revoked['date']), CANCEL_AFTER_DAYS)
        if body.date <= earliest:
            raise HTTPException(
                422, 'Chỉ hủy khi quá 10 ngày làm việc kể từ quyết định thu hồi mà chưa nộp lại giấy phép.'
            )
        if not body.reference.strip():
            raise HTTPException(422, 'Nhập số, ngày quyết định hủy giấy phép.')
    events.append(
        {
            'type': body.action,
            'date': body.date.isoformat(),
            'reference': body.reference.strip(),
            'reason': body.reason,
            'note': body.note.strip(),
            'actor': actor['name'],
            'at': now(),
        }
    )
    return {
        'revoke': 'Thu hồi giấy phép số ' + permit['number'],
        'return': 'Nhận lại bản gốc giấy phép số ' + permit['number'],
        'cancel': 'Hủy giấy phép số ' + permit['number'],
    }[body.action]


def register(cases, calendar, today=None, starts=None):
    """Public register (Điều 66): one row per permit number with its amendments, extensions and reissues.

    ``starts`` maps a permit number to the start date declared in the start notice (thông báo khởi công).
    """
    today = today or date.today()
    starts = starts or {}
    records = sorted(
        (
            {
                **c['permit'],
                'caseId': c['id'],
                'projectId': c.get('projectId'),
                'projectName': c.get('projectName'),
                'projectCode': c.get('projectCode'),
            }
            for c in cases
            if c.get('permit')
        ),
        key=lambda r: (r['issueDate'], r['kind'] not in ('amendment', 'extension', 'reissue')),
    )
    rows = {}
    for record in records:
        row = rows.get(record['number'])
        if record['kind'] in ('amendment', 'extension', 'reissue') and row:
            row['history'].append(record)
            if record['kind'] == 'extension':
                row['extensions'] += 1
                row['startDeadline'] = record['startDeadline']
                row['publicUntil'] = max(row['publicUntil'], record['publicUntil'])
            if record['kind'] == 'amendment':
                row['content'] = record['content']
            row['events'] = row['events'] + record.get('events', [])
            continue
        rows[record['number']] = {
            **record,
            'history': [],
            'extensions': 0,
        }
    result = []
    for row in rows.values():
        row['startedAt'] = row.get('startedAt') or starts.get(row['number'])
        status = permit_status(row, calendar, today)
        result.append(
            {
                'number': row['number'],
                'caseId': row['caseId'],
                'projectId': row['projectId'],
                'projectName': row['projectName'],
                'projectCode': row['projectCode'],
                'form': row['form'],
                'kind': row['kind'],
                'issueDate': row['issueDate'],
                'investor': row['content'].get('investor', ''),
                'location': row['content'].get('location', ''),
                'startDeadline': row['startDeadline'],
                'publicUntil': row['publicUntil'],
                'public': row['publicUntil'] >= today.isoformat() and status not in ('cancelled',),
                'extensions': row['extensions'],
                'startedAt': row.get('startedAt'),
                'history': [
                    {'kind': h['kind'], 'issueDate': h['issueDate'], 'caseId': h['caseId']} for h in row['history']
                ],
                'status': status,
                'statusLabel': STATUS_LABELS[status],
            }
        )
    return sorted(result, key=lambda r: r['issueDate'], reverse=True)
