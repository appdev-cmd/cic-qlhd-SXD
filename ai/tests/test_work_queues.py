"""List work queues: 'mine' (assigned to me) and 'queue' (waiting for my action)."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.domain import audit, new_case
from app.store import DEMO_ACTOR, Store

OFFICER = DEMO_ACTOR
OTHER = {**DEMO_ACTOR, 'id': '00000000-0000-4000-8000-000000000002', 'name': 'Chuyên viên khác'}
HEAD = {**DEMO_ACTOR, 'id': '00000000-0000-4000-8000-000000000009', 'name': 'Trưởng phòng', 'role': 'head_of_department'}


def case(name, assignee, state):
    c = new_case(name, 'Điện Biên', DEMO_ACTOR, '2026-09-01', None)
    c['workflow'] = {'state': state, 'assigneeId': assignee['id'] if assignee else None}
    c['assignee'] = assignee['name'] if assignee else 'Chưa phân công'
    audit(c, DEMO_ACTOR, 'Tạo', 'Kiểm thử')
    return c


class WorkQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch('app.store.DATA_DIR', Path(self.tmp.name))
        self.patch.start()
        store = Store(actor=DEMO_ACTOR)
        for c in [
            case('A — của tôi, đang xử lý', OFFICER, 'processing'),
            case('B — của tôi, chờ rà soát', OFFICER, 'pending_review'),
            case('C — của tôi, đã xong', OFFICER, 'reviewed'),
            case('D — người khác, đang xử lý', OTHER, 'processing'),
            case('E — chưa phân công', None, 'received'),
        ]:
            store.save(c)

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def names(self, actor, scope):
        page = Store(actor=actor).page(limit=50, scope=scope, sort='name', direction='asc')
        return [row['name'][0] for row in page['items']]

    def test_mine_lists_everything_assigned_to_me(self):
        self.assertEqual(self.names(OFFICER, 'mine'), ['A', 'B', 'C'])

    def test_officer_queue_is_my_open_dossiers(self):
        self.assertEqual(self.names(OFFICER, 'queue'), ['A'])

    def test_leader_queue_is_pending_review(self):
        self.assertEqual(self.names(HEAD, 'queue'), ['B'])

    def test_no_scope_lists_all_and_exposes_assignee(self):
        page = Store(actor=OFFICER).page(limit=50, sort='name', direction='asc')
        self.assertEqual(len(page['items']), 5)
        self.assertEqual(page['items'][0]['assignee'], OFFICER['name'])
        self.assertEqual(page['items'][0]['assigneeId'], OFFICER['id'])


if __name__ == '__main__':
    unittest.main()
