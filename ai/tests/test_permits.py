"""Building permit lifecycle — NĐ 217/2026 Điều 49, 54 (consultation), 63–66."""

import unittest
from datetime import date, timedelta

from fastapi import HTTPException

from app import permits
from app.domain import new_case
from app.procedure_policy import intake_days
from app.sla import Calendar
from app.store import DEMO_ACTOR

HEAD = {**DEMO_ACTOR, 'id': 'head', 'name': 'Trưởng phòng', 'role': 'head_of_department'}
CALENDAR = Calendar([], 'test')
TODAY = date.today()


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


if __name__ == '__main__':
    unittest.main()
