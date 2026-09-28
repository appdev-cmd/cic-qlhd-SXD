import json
from pathlib import Path
import tempfile
import sqlite3
from contextlib import closing
import unittest
from unittest.mock import patch

from app.store import Store, DEMO_ACTOR, db
from app.domain import new_case, audit


class FoundationTests(unittest.TestCase):
    def setUp(self):
        # Isolate storage assertions from daemon consumers started by other test cases.
        queue = patch('app.jobs.claim', return_value=None)
        queue.start()
        self.addCleanup(queue.stop)

    def test_summary_paging_beyond_one_thousand_rows(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            store = Store(actor=DEMO_ACTOR)
            with db() as con:
                for index in range(1007):
                    case = new_case(f'Dự án Điện Biên {index:04d}', 'Điện Biên', DEMO_ACTOR, '2026-09-27', sample=True)
                    case['id'] = f'{index:04d}'
                    case['projectId'] = 'project-a' if index < 1005 else 'project-b'
                    case['documents'] = [{'id': 'document', 'segments': [{'text': 'large source text'}]}]
                    con.execute('insert into cases values(?,?,?)', (case['id'], case['revision'], json.dumps(case)))
            first = store.page(limit=100, project_id='project-a', search='dien bien', sort='name', direction='asc')
            last = store.page(
                offset=1000, limit=100, project_id='project-a', search='dien bien', sort='name', direction='asc'
            )
            self.assertEqual(first['total'], 1005)
            self.assertEqual(len(first['items']), 100)
            self.assertEqual(len(last['items']), 5)
            self.assertFalse(set(r['id'] for r in first['items']) & set(r['id'] for r in last['items']))
            self.assertNotIn('documents', first['items'][0])
            self.assertEqual(first['items'][0]['documentCount'], 1)

    def test_job_snapshot_is_persisted_with_revision(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            store = Store(actor=DEMO_ACTOR)
            case = new_case('Hồ sơ kiểm tra hàng đợi', 'Điện Biên', DEMO_ACTOR, '2026-09-27', sample=True)
            audit(case, DEMO_ACTOR, 'Tạo hồ sơ', 'Kiểm tra giao dịch')
            store.save(case)
            case['revision'] = 2
            case['job'] = {'id': 'durable-job', 'status': 'running', 'mode': 'intake', 'useModel': False}
            store.save(case, 1)
            # A separate connection can recover the immutable input after the writer has closed.
            with db() as con:
                row = con.execute('select snapshot,state from jobs where id=?', ('durable-job',)).fetchone()
            self.assertEqual(json.loads(row[0])['revision'], 2)
            self.assertIn(row[1], ['queued', 'running'])
            case['revision'] = 3
            case['job']['status'] = 'cancelled'
            store.save(case, 2)
            with db() as con:
                self.assertEqual(
                    con.execute('select state from jobs where id=?', ('durable-job',)).fetchone()[0], 'cancelled'
                )

    def test_summary_migrates_legacy_supplement_chain(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            with closing(sqlite3.connect(Path(directory) / 'appraisal.sqlite')) as con, con:
                con.execute('create table cases(id text primary key,revision integer,payload text)')
                for id, previous in [('child', 'root'), ('root', None)]:
                    case = new_case('Hồ sơ cũ', 'Điện Biên', DEMO_ACTOR, '2026-09-28', sample=True)
                    case.update(id=id, previousSubmissionId=previous)
                    con.execute('insert into cases values(?,?,?)', (id, 1, json.dumps(case)))
            from app.catalog import dashboard

            self.assertEqual(dashboard(Store(actor=DEMO_ACTOR), 'sample')['cases']['dossiers'], 1)
            self.assertEqual(Store(actor=DEMO_ACTOR).page()['total'], 2)

    def test_summary_observes_transaction_rollback_update_and_delete(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            store = Store(actor=DEMO_ACTOR)
            case = new_case('Tên hồ sơ ban đầu', 'Điện Biên', DEMO_ACTOR, '2026-09-28', sample=True)
            with db() as con:
                con.execute('insert into cases values(?,?,?)', (case['id'], 1, json.dumps(case)))
            changed = {**case, 'name': 'Tên đã thay đổi', 'revision': 2}
            with self.assertRaises(RuntimeError):
                with db() as con:
                    con.execute('update cases set payload=?,revision=2 where id=?', (json.dumps(changed), case['id']))
                    raise RuntimeError('Rollback')
            self.assertEqual(store.page()['items'][0]['name'], case['name'])
            with db() as con:
                con.execute('update cases set payload=?,revision=2 where id=?', (json.dumps(changed), case['id']))
            self.assertEqual(store.page()['items'][0]['name'], changed['name'])
            with db() as con:
                con.execute('delete from cases where id=?', (case['id'],))
            self.assertEqual(store.page()['total'], 0)

    def test_read_does_not_write_interrupted_state(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            case = new_case('Hồ sơ bị gián đoạn', 'Điện Biên', DEMO_ACTOR, '2026-09-27', sample=True)
            case['job'] = {'id': 'absent-job', 'status': 'running'}
            with db() as con:
                con.execute('insert into cases values(?,?,?)', (case['id'], 1, json.dumps(case)))
            result = Store(actor=DEMO_ACTOR).get(case['id'])
            self.assertEqual(result['job']['status'], 'interrupted')
            with db() as con:
                saved = json.loads(con.execute('select payload from cases where id=?', (case['id'],)).fetchone()[0])
            self.assertEqual(saved['job']['status'], 'running')
            self.assertEqual(saved['revision'], 1)
