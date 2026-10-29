"""Building permit lifecycle — NĐ 217/2026 Điều 49, 54 (consultation), 63–66."""

import tempfile
import threading
import time
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app import permits
from app.domain import audit, invalidate, new_case, vn_today
from app.procedure_policy import intake_days
from app.sla import Calendar, compute
from app.store import DEMO_ACTOR, Store

HEAD = {**DEMO_ACTOR, 'id': 'head', 'name': 'Trưởng phòng', 'role': 'head_of_department'}
CALENDAR = Calendar([], 'test')
TODAY = vn_today()


def permit_case(subtype='new', project='p1'):
    case = new_case('GPXD', 'Điện Biên', DEMO_ACTOR, '2026-09-01', project, procedure='gpxd')
    case.update(projectName='Nhà thờ Giáo xứ', projectCode='DA-0208')
    case['procedureReview'] = {
        'subtype': subtype,
        'conclusion': 'eligible',
        'investor': 'Giáo xứ Điện Biên Phủ',
        'location': 'Phường Him Lam',
        'scope': 'Nhà thờ',
        'details': {'buildingClass': 'Cấp II', 'height': '24', 'floors': '2'},
    }
    case['finalReview'] = {'decision': 'reviewed'}
    return case


def command(action, day=TODAY, **extra):
    return permits.PermitCommand(revision=1, action=action, date=day, **extra)


def records(*cases):
    return permits.register(
        [
            {
                'id': c['id'],
                'projectId': c['projectId'],
                'projectName': c['projectName'],
                'projectCode': c['projectCode'],
                'permit': c['permit'],
            }
            for c in cases
            if c.get('permit')
        ],
        CALENDAR,
    )


class ConsultationTests(unittest.TestCase):
    def test_silence_counts_as_consent_after_two_working_days(self):
        case = permit_case()
        case['finalReview'] = None
        sent = CALENDAR.add(TODAY, -0) - timedelta(days=10)
        body = permits.ConsultationCommand(
            revision=1, action='send', agency='Phòng Cảnh sát PCCC', subject='Ý kiến về giải pháp PCCC', date=sent
        )
        permits.consult(case, HEAD, body, CALENDAR)
        body = permits.ConsultationCommand(
            revision=1, action='send', agency='UBND phường Him Lam', subject='Ý kiến về chỉ giới', date=TODAY
        )
        permits.consult(case, HEAD, body, CALENDAR)
        rows = permits.consultations(case, CALENDAR)
        self.assertEqual([r['status'] for r in rows], ['silent_consent', 'waiting'])
        self.assertEqual(rows[1]['dueDate'], CALENDAR.add(TODAY, 2).isoformat())
        reply = permits.ConsultationCommand(
            revision=1, action='respond', id=rows[1]['id'], response='Thống nhất chỉ giới.', date=TODAY
        )
        permits.consult(case, HEAD, reply, CALENDAR)
        self.assertEqual(permits.consultations(case, CALENDAR)[1]['status'], 'responded')
        with self.assertRaises(HTTPException):
            permits.consult(case, HEAD, reply, CALENDAR)

    def test_renewal_review_takes_two_working_days(self):
        self.assertEqual(intake_days('gpxd', 'extension'), 2)
        self.assertEqual(intake_days('gpxd', 'reissue'), 2)
        self.assertEqual(intake_days('gpxd', 'house'), 3)
        self.assertEqual(intake_days('gpxd', 'new'), 5)


class PermitTests(unittest.TestCase):
    def test_issue_number_deadline_and_public_period(self):
        case = permit_case()
        permits.act(case, HEAD, command('issue'), [], CALENDAR)
        permit = case['permit']
        self.assertEqual(permit['number'], f'001/{TODAY.year}/GPXD')
        self.assertEqual(permit['form'], '03')
        self.assertEqual(permit['startDeadline'], permits.add_months(TODAY, 12).isoformat())
        self.assertEqual(permit['content']['investor'], 'Giáo xứ Điện Biên Phủ')
        row = records(case)[0]
        self.assertEqual((row['status'], row['public']), ('valid', True))
        # Only once, only after an eligible, reviewed dossier, only by leaders outside demo.
        with self.assertRaises(HTTPException):
            permits.act(case, HEAD, command('issue'), [], CALENDAR)
        pending = permit_case()
        pending['finalReview'] = None
        with self.assertRaises(HTTPException):
            permits.act(pending, HEAD, command('issue'), [], CALENDAR)
        with self.assertRaises(HTTPException):
            permits.act(permit_case(), DEMO_ACTOR, command('issue'), [], CALENDAR)

    def test_extensions_at_most_twice_and_recorded_on_the_original(self):
        original = permit_case()
        permits.act(original, HEAD, command('issue', TODAY - timedelta(days=400)), [], CALENDAR)
        self.assertEqual(records(original)[0]['status'], 'start_overdue')
        started = permits.register(
            [
                {
                    'id': original['id'],
                    'projectId': 'p1',
                    'projectName': '',
                    'projectCode': '',
                    'permit': original['permit'],
                }
            ],
            CALENDAR,
            starts={original['permit']['number']: (TODAY - timedelta(days=100)).isoformat()},
        )
        self.assertEqual(started[0]['status'], 'started')
        first = permit_case('extension')
        permits.act(first, HEAD, command('issue', basePermit=original['permit']['number']), records(original), CALENDAR)
        row = records(original, first)[0]
        self.assertEqual((row['extensions'], row['status']), (1, 'valid'))
        self.assertEqual(row['startDeadline'], permits.add_months(TODAY, 12).isoformat())
        second = permit_case('extension')
        permits.act(second, HEAD, command('issue', basePermit=row['number']), records(original, first), CALENDAR)
        third = permit_case('extension')
        with self.assertRaises(HTTPException):
            permits.act(
                third, HEAD, command('issue', basePermit=row['number']), records(original, first, second), CALENDAR
            )
        with self.assertRaises(HTTPException):
            permits.act(permit_case('amendment'), HEAD, command('issue', basePermit='999/GPXD'), [], CALENDAR)

    def test_revoke_return_or_cancel_after_ten_working_days(self):
        case = permit_case()
        permits.act(case, HEAD, command('issue', TODAY - timedelta(days=60)), [], CALENDAR)
        with self.assertRaises(HTTPException):
            permits.act(case, HEAD, command('revoke', TODAY - timedelta(days=30)), [], CALENDAR)
        revoked_on = TODAY - timedelta(days=30)
        permits.act(
            case,
            HEAD,
            command('revoke', revoked_on, reason='not_remedied', reference='15/QĐ-SXD'),
            [],
            CALENDAR,
        )
        view = permits.view(case, CALENDAR)
        self.assertEqual(view['status'], 'revoked')
        self.assertEqual(view['returnDueDate'], CALENDAR.add(revoked_on, 5).isoformat())
        self.assertEqual(set(view['actions']), {'return', 'cancel'})
        with self.assertRaises(HTTPException):
            permits.act(case, HEAD, command('cancel', CALENDAR.add(revoked_on, 5), reference='16/QĐ-SXD'), [], CALENDAR)
        permits.act(case, HEAD, command('cancel', reference='16/QĐ-SXD'), [], CALENDAR)
        row = records(case)[0]
        self.assertEqual((row['status'], row['public']), ('cancelled', False))
        self.assertEqual(permits.view(case, CALENDAR)['actions'], [])

    def test_subtype_kept_after_the_review_sheet_is_retired(self):
        case = permit_case('extension')
        case['finalReview'] = None
        self.assertEqual(compute(case, CALENDAR, {})['periodDays'], 5)
        invalidate(case)
        self.assertEqual(case['subtype'], 'extension')
        self.assertEqual(compute(case, CALENDAR, {})['periodDays'], 5)  # not the 10 days of a new permit
        self.assertEqual(permits.view(case, CALENDAR)['subtype'], 'extension')


class PermitNumberTests(unittest.TestCase):
    def test_next_number_is_the_highest_of_the_year_plus_one(self):
        day = date(2026, 10, 29)
        self.assertEqual(permits.next_number([], day), '001/2026/GPXD')
        register = [
            {'number': '001/2026/GPXD'},
            {'number': '007/2026/GPXD'},
            {'number': '012/2025/GPXD'},
            {'number': 'GP-12/2026'},
        ]
        self.assertEqual(permits.next_number(register, day), '008/2026/GPXD')
        self.assertEqual(permits.next_number(register, date(2025, 12, 31)), '013/2025/GPXD')

    def test_numbers_are_never_reused_after_revocation_or_a_gap(self):
        issued = []
        for _ in range(3):
            case = permit_case()
            permits.act(case, HEAD, command('issue'), records(*issued), CALENDAR)
            issued.append(case)
        revoked = issued[1]
        permits.act(
            revoked, HEAD, command('revoke', reason='unlawful', reference='20/QĐ-SXD'), records(*issued), CALENDAR
        )
        manual = permit_case()
        number = f'010/{TODAY.year}/GPXD'
        permits.act(manual, HEAD, command('issue', number=number), records(*issued), CALENDAR)
        issued.append(manual)
        with self.assertRaises(HTTPException):
            permits.act(permit_case(), HEAD, command('issue', number=number), records(*issued), CALENDAR)
        after = permit_case()
        permits.act(after, HEAD, command('issue'), records(*issued), CALENDAR)
        issued.append(after)
        numbers = [c['permit']['number'] for c in issued]
        self.assertEqual(len(set(numbers)), len(numbers))
        self.assertEqual(
            [n.split('/')[0] for n in numbers],
            ['001', '002', '003', '010', '011'],
        )

    def test_issue_lock_serializes_number_allocation(self):
        store = Store(actor=DEMO_ACTOR)
        register = []

        def allocate():
            with store.permit_issue_lock():
                number = permits.next_number(register, TODAY)
                time.sleep(0.01)  # widen the window between reading the register and saving
                register.append({'number': number})

        threads = [threading.Thread(target=allocate) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        numbers = sorted(r['number'] for r in register)
        self.assertEqual(numbers, [f'{i:03d}/{TODAY.year}/GPXD' for i in range(1, 9)])

    def test_concurrent_issues_through_the_api_get_distinct_numbers(self):
        from app.routes.permits import permit_action

        with (
            tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory,
            patch('app.store.DATA_DIR', Path(directory)),
            patch.object(Store, 'project', return_value={'id': 'p1'}),
        ):
            store = Store(actor=DEMO_ACTOR)
            ids = []
            for _ in range(5):
                case = permit_case()
                case['workflow'] = {'state': 'reviewed'}
                audit(case, DEMO_ACTOR, 'Tạo', 'Kiểm thử')
                ids.append(store.save(case)['id'])
            results, errors = [], []

            def issue(id):
                try:
                    body = permits.PermitCommand(revision=1, action='issue', date=TODAY)
                    results.append(permit_action(id, body, Store(actor=DEMO_ACTOR))['permit']['number'])
                except Exception as exc:  # surfaced by the assertion below
                    errors.append(exc)

            threads = [threading.Thread(target=issue, args=(id,)) for id in ids]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            self.assertEqual(errors, [])
            self.assertEqual(sorted(results), [f'{i:03d}/{TODAY.year}/GPXD' for i in range(1, 6)])


if __name__ == '__main__':
    unittest.main()
