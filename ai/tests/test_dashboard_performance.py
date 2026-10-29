"""Role dashboards: 30-day KPIs, SLA states per assignee and the actor's own work (U5)."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.domain import audit, new_case
from app.store import DEMO_ACTOR, Store

OFFICER = DEMO_ACTOR
OTHER = {**DEMO_ACTOR, 'id': '00000000-0000-4000-8000-000000000002', 'name': 'Chuyên viên khác'}
HEAD = {
    **DEMO_ACTOR,
    'id': '00000000-0000-4000-8000-000000000009',
    'name': 'Trưởng phòng',
    'role': 'head_of_department',
}


def case(name, assignee, state, procedure='bcnckt'):
    c = new_case(name, 'Điện Biên', DEMO_ACTOR, '2026-09-01', None, procedure=procedure)
    c['workflow'] = {'state': state, 'assigneeId': assignee['id'] if assignee else None}
    c['assignee'] = assignee['name'] if assignee else 'Chưa phân công'
    audit(c, DEMO_ACTOR, 'Tạo', 'Kiểm thử')
    return c


class PerformanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.patch = patch('app.store.DATA_DIR', Path(self.tmp.name))
        self.patch.start()
        store = Store(actor=DEMO_ACTOR)
        for c in [
            case('A', OFFICER, 'processing'),
            case('B', OFFICER, 'pending_review'),
            case('C', OTHER, 'processing', 'gpxd'),
            case('D', None, 'received'),
        ]:
            store.save(c)

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def test_shape_and_received_in_current_period(self):
        result = Store(actor=OFFICER).performance()
        self.assertEqual(result['period']['days'], 30)
        self.assertEqual(result['period']['current']['received'], 4)
        self.assertEqual(result['period']['previous']['received'], 0)
        self.assertIsNone(result['period']['current']['onTimeRate'])

    def test_officers_grouped_by_assignee(self):
        names = {o['name'] for o in Store(actor=OFFICER).performance()['officers']}
        self.assertEqual(names, {OFFICER['name'], OTHER['name'], 'Chưa phân công'})

    def test_officer_queue_is_own_open_dossiers(self):
        mine = Store(actor=OFFICER).performance()['mine']
        self.assertEqual(mine['bcnckt']['queue'], 1)
        self.assertEqual(mine.get('gpxd', {}).get('queue', 0), 0)

    def test_leader_queue_is_pending_review(self):
        mine = Store(actor=HEAD).performance()['mine']
        self.assertEqual(mine['bcnckt']['queue'], 1)
        self.assertEqual(mine['bcnckt']['ownQueue'], 0)


if __name__ == '__main__':
    unittest.main()
