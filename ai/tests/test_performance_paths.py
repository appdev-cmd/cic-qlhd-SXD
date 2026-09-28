import base64
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app import store as store_module
from app.domain import new_case, audit
from app.store import Store, DEMO_ACTOR


def token(exp):
    body = base64.urlsafe_b64encode(json.dumps({'exp': exp}).encode()).decode().rstrip('=')
    return 'Bearer header.' + body + '.signature'


class ProgressTests(unittest.TestCase):
    def test_progress_reports_revision_and_interrupted_job(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.store.DATA_DIR', Path(directory)):
            store = Store(actor=DEMO_ACTOR)
            case = new_case('Hồ sơ', 'Điện Biên', DEMO_ACTOR, '2026-09-01')
            audit(case, DEMO_ACTOR, 'Tạo hồ sơ', 'Kiểm thử')
            store.save(case)
            self.assertEqual(store.progress(case['id']), {'revision': 1, 'job': None})
            case['job'] = {'id': 'job-1', 'status': 'running', 'mode': 'intake'}
            case['revision'] = 2
            store.save(case, 1)
            self.assertEqual(store.progress(case['id'])['job']['status'], 'running')
            with store_module.db() as con:
                con.execute("update jobs set state='failed' where id='job-1'")
            self.assertEqual(store.progress(case['id']), {'revision': 2, 'job': {'id': 'job-1', 'status': 'failed', 'mode': 'intake'}})


class ActorCacheTests(unittest.TestCase):
    def setUp(self):
        store_module._actors.clear()

    def response(self, payload):
        result = MagicMock()
        result.json.return_value = payload
        return result

    def test_actor_is_cached_until_ttl_and_never_past_token_expiry(self):
        profile = [{'id': 'user-1', 'full_name': 'Chuyên viên', 'role': 'officer', 'province_id': 'DB',
                    'department': 'QLXD', 'is_active': True}]
        calls = []

        def remote(path, *args, **kwargs):
            calls.append(path)
            return self.response({'id': 'user-1'} if path.startswith('/auth') else profile)

        with patch.object(store_module, 'MODE', 'cloud'), patch.object(store_module, 'remote', side_effect=remote):
            valid = token(time.time() + 3600)
            self.assertEqual(store_module.actor_for(valid)['id'], 'user-1')
            self.assertEqual(store_module.actor_for(valid)['tenantId'], 'DB')
            self.assertEqual(len(calls), 2)
            expired = token(time.time() - 5)
            store_module.actor_for(expired)
            store_module.actor_for(expired)
            self.assertEqual(len(calls), 6)
            with patch.object(store_module, 'ACTOR_TTL', 0):
                store_module._actors.clear()
                store_module.actor_for(valid)
                store_module.actor_for(valid)
                self.assertEqual(len(calls), 10)

    def test_inactive_profile_is_rejected_and_not_cached(self):
        inactive = [{'id': 'user-2', 'full_name': 'Ngừng', 'role': 'officer', 'province_id': 'DB', 'department': 'QLXD', 'is_active': False}]
        with patch.object(store_module, 'MODE', 'cloud'), patch.object(
                store_module, 'remote', side_effect=lambda path, *a, **k: self.response({'id': 'user-2'} if path.startswith('/auth') else inactive)):
            for _ in range(2):
                with self.assertRaises(Exception):
                    store_module.actor_for(token(time.time() + 3600))
            self.assertEqual(store_module._actors, {})


if __name__ == '__main__':
    unittest.main()
