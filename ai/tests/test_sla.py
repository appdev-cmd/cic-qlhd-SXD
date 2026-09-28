import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from app import sla
from app.domain import new_case, audit
from app.store import Store, DEMO_ACTOR
from app.workflow import derive_status, TRANSITIONS


def calendar(*holidays):
    return sla.Calendar([(date.fromisoformat(d), kind, True) for d, kind in holidays] +
                        [(date(2026, 1, 1), 'le_tet', True), (date(2027, 1, 1), 'le_tet', True)], 'test')


class LegalPeriodTests(unittest.TestCase):
    def test_feasibility_periods_follow_article_37(self):
        self.assertEqual(sla.legal_period('bcnckt', 'A', 'I')['days'], 25)
        self.assertEqual(sla.legal_period('bcnckt', 'A', 'II')['days'], 20)
        self.assertEqual(sla.legal_period('bcnckt', 'B', 'DB')['days'], 20)
        self.assertEqual(sla.legal_period('bcnckt', 'B', 'III')['days'], 16)
        self.assertEqual(sla.legal_period('bcnckt', 'C', 'I')['days'], 15)
        self.assertEqual(sla.legal_period('bcnckt', 'C', 'IV')['days'], 12)
        national = sla.legal_period('bcnckt', 'QG', None)
        self.assertEqual((national['days'], national['unit']), (60, 'calendar'))
        self.assertIn('Điều 37', sla.legal_period('bcnckt', 'B', 'II')['basis'])
        self.assertIn('missing', sla.legal_period('bcnckt', None, 'II'))
        self.assertIn('missing', sla.legal_period('bcnckt', 'B', None))

    def test_permit_and_inspection_periods(self):
        self.assertEqual(sla.legal_period('gpxd', None, None, 'house')['days'], 7)
        self.assertEqual(sla.legal_period('gpxd', None, None, 'new')['days'], 10)
        self.assertEqual(sla.legal_period('gpxd', None, None, 'repair')['days'], 9)
        self.assertEqual(sla.legal_period('gpxd', None, None, 'reissue')['days'], 5)
        self.assertEqual(sla.legal_period('nghiem_thu', None, 'I')['days'], 16)
        self.assertEqual(sla.legal_period('nghiem_thu', None, 'III')['days'], 12)

    def test_normalization(self):
        self.assertEqual(sla.normalize_group('Nhóm B'), 'B')
        self.assertEqual(sla.normalize_grade('Cấp II'), 'II')
        self.assertEqual(sla.normalize_grade('Đặc biệt'), 'DB')
        self.assertIsNone(sla.normalize_group('X'))


class CalendarTests(unittest.TestCase):
    def test_add_skips_weekends_holidays_and_counts_makeup_days(self):
        cal = calendar(('2026-04-30', 'le_tet'), ('2026-05-01', 'le_tet'))
        # Tue 28/4 + 3 working days: Wed 29, (Thu 30, Fri 1 off), (weekend), Mon 4, Tue 5.
        self.assertEqual(cal.add(date(2026, 4, 28), 3), date(2026, 5, 5))
        worked = calendar(('2026-05-02', 'lam_bu'))
        self.assertEqual(worked.add(date(2026, 5, 1), 1), date(2026, 5, 2))
        self.assertEqual(cal.between(date(2026, 4, 28), date(2026, 5, 5)), 3)

    def test_unconfirmed_or_uncovered_calendar_is_flagged(self):
        cal = sla.Calendar([(date(2026, 2, 17), 'le_tet', False)], 'test')
        self.assertFalse(cal.confirmed(date(2026, 2, 1), date(2026, 3, 1)))
        self.assertTrue(cal.confirmed(date(2026, 3, 1), date(2026, 3, 30)))
        self.assertFalse(cal.confirmed(date(2026, 12, 1), date(2027, 1, 30)))


class ComputeTests(unittest.TestCase):
    def case(self, **extra):
        case = new_case('Hồ sơ', 'Điện Biên', DEMO_ACTOR, '2026-09-01', 'project')
        case.update(extra)
        return case

    def test_due_date_and_states(self):
        cal = calendar()
        facts = sla.compute(self.case(), cal, {'group': 'Nhóm B', 'grade': 'II'}, today=date(2026, 9, 1))
        # Tue 1/9 + 16 working days = Wed 23/9 (no holidays in this test calendar).
        self.assertEqual(facts['legalDueDate'], '2026-09-23')
        self.assertEqual((facts['dueKind'], facts['policyStatus']), ('legal', 'requires_confirmation'))
        self.assertEqual(sla.evaluate(facts, cal, today=date(2026, 9, 10))['state'], 'on_track')
        self.assertEqual(sla.evaluate(facts, cal, today=date(2026, 9, 21))['state'], 'due_soon')
        late = sla.evaluate(facts, cal, today=date(2026, 9, 25))
        self.assertEqual((late['state'], late['remainingWorkingDays']), ('overdue', -2))
        self.assertEqual(sla.evaluate(facts, cal, superseded=True, today=date(2026, 9, 25))['state'], 'superseded')

    def test_supplement_pause_extends_deadline(self):
        cal = calendar()
        history = [{'from': 'processing', 'to': 'awaiting_supplement', 'at': '2026-09-03T08:00:00+00:00'},
                   {'from': 'awaiting_supplement', 'to': 'processing', 'at': '2026-09-08T08:00:00+00:00'}]
        facts = sla.compute(self.case(workflow={'state': 'processing', 'history': history}), cal,
                            {'group': 'B', 'grade': 'II'}, today=date(2026, 9, 10))
        self.assertEqual(facts['pausedDays'], 3)
        self.assertEqual(facts['legalDueDate'], '2026-09-28')
        paused = sla.compute(self.case(workflow={'state': 'awaiting_supplement', 'history': history[:1]}), cal,
                             {'group': 'B', 'grade': 'II'}, today=date(2026, 9, 10))
        self.assertTrue(paused['paused'])
        self.assertEqual(sla.evaluate(paused, cal, today=date(2026, 12, 1))['state'], 'paused')

    def test_internal_deadline_and_completion(self):
        cal = calendar()
        case = self.case(workflow={'state': 'assigned', 'deadline': '2026-09-15'})
        facts = sla.compute(case, cal, {}, today=date(2026, 9, 2))
        self.assertEqual((facts['dueDate'], facts['dueKind']), ('2026-09-15', 'internal'))
        self.assertIsNotNone(facts['missing'])
        case['finalReview'] = {'decision': 'reviewed', 'at': '2026-09-16T09:00:00+00:00'}
        done = sla.compute(case, cal, {}, today=date(2026, 9, 20))
        self.assertEqual(sla.evaluate(done, cal, today=date(2026, 9, 20))['state'], 'completed_late')
        self.assertEqual(sla.evaluate(sla.compute(self.case(), cal, {}), cal)['state'], 'unconfigured')


class StatusInvariantTests(unittest.TestCase):
    def test_status_follows_workflow_state(self):
        expected = {'awaiting_supplement': 'request_supplement', 'reviewed': 'reviewed'}
        for target in {t for _, t, _ in TRANSITIONS.values()} | {'received'}:
            for runs, fallback in [([], 'intake'), ([{'stale': False}], 'analyzed'), ([{'stale': True}], 'intake')]:
                case = {'workflow': {'state': target}, 'runs': runs}
                self.assertEqual(derive_status(case), expected.get(target, fallback), (target, runs))
        self.assertEqual(derive_status({'runs': [], 'job': {'status': 'running', 'mode': 'intake'}}), 'analyzing')
        self.assertEqual(derive_status({'runs': [], 'job': {'status': 'running', 'mode': 'ocr'}}), 'intake')
        self.assertEqual(derive_status({'runs': [], 'finalReview': {'decision': 'request_supplement'}}), 'request_supplement')


class StoreIntegrationTests(unittest.TestCase):
    def test_save_derives_fields_and_page_filters_by_sla(self):
        project = {'id': 'project', 'projectGroup': 'C', 'buildingGrade': 'III'}
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)), \
                patch.object(Store, 'project', return_value=project):
            store = Store(actor=DEMO_ACTOR)
            old = new_case('Hồ sơ quá hạn', 'Điện Biên', DEMO_ACTOR, '2026-01-05', 'project')
            fresh = new_case('Hồ sơ mới', 'Điện Biên', DEMO_ACTOR, date.today().isoformat(), 'project')
            fresh['status'] = 'reviewed'  # stale client value must be ignored
            for case in (old, fresh):
                audit(case, DEMO_ACTOR, 'Tạo hồ sơ', 'Kiểm thử')
                store.save(case)
            saved = store.get(fresh['id'])
            self.assertEqual(saved['status'], 'intake')
            self.assertEqual(saved['sla']['periodDays'], 12)
            overdue = store.page(sla='overdue')
            self.assertEqual([r['id'] for r in overdue['items']], [old['id']])
            self.assertEqual(overdue['items'][0]['slaState']['state'], 'overdue')
            self.assertEqual(store.page(sla='on_track')['total'] + store.page(sla='due_soon')['total'], 1)
            by_due = store.page(sort='slaDueDate', direction='asc')['items']
            self.assertEqual(by_due[0]['id'], old['id'])
            counts = {row['id']: row['total'] for row in store.sla_counts()}
            self.assertEqual(counts['overdue'], 1)
            self.assertEqual(sum(counts.values()), 2)


if __name__ == '__main__':
    unittest.main()
