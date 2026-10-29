import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from app.store import Store, DEMO_ACTOR
from app import bim
from app.routes.bim import ModelInput, Note


class BimTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        scoped = patch('app.store.DATA_DIR', self.directory)
        scoped.start(); self.addCleanup(scoped.stop)
        (self.directory / 'projects.json').write_text(json.dumps([{'id': 'demo-project', 'name': 'Dự án BIM'}]), encoding='utf-8')
        self.s = Store(actor=DEMO_ACTOR)
        self.files = {'ifc': b'ISO-10303-21;BIM TEST', 'frag': b'FRAG-TEST'}

    def create(self, previous=None):
        return bim.create(self.s, 'demo-project', ModelInput(file_name='architecture.ifc', discipline='KIEN_TRUC',
            previous_id=previous, files={kind: {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for kind, data in self.files.items()}, element_count=3))

    def finish(self, m):
        for kind, data in self.files.items():
            bim.put_chunk(self.s, m['id'], kind, 0, base64.b64encode(data).decode())
        bim.put_elements(self.s, m['id'], [dict(express_id=i, global_id=f'guid-{i}', ten_cau_kien=f'Tường tầng {i}', loai_cau_kien='IFCWALL', phan_doan_tang=f'Tầng {i}', the_tich_be_tong=1.5 if i != 3 else None, dien_tich=3, chieu_dai=None) for i in range(1,4)])
        return bim.finalize(self.s, m['id'])

    def test_complete_persisted_import_search_pagination_quantities(self):
        m = self.finish(self.create())
        self.assertEqual(m['status'], 'ready')
        self.assertEqual(bim.file_content(self.s, m['id'], 'ifc'), self.files['ifc'])
        self.assertEqual(bim.elements(self.s, m['id'], search='tuong tang')['total'], 3)
        self.assertEqual(bim.elements(self.s, m['id'], search='%')['total'], 0)
        self.assertEqual(bim.elements(self.s, m['id'], category='IFCWALL', storey='Tầng 2')['total'], 1)
        first = bim.elements(self.s, m['id'], limit=2)
        second = bim.elements(self.s, m['id'], limit=2, offset=2)
        self.assertEqual(len(first['items']), 2)
        self.assertEqual(second['items'][0]['express_id'], 3)
        quantities = bim.summary(self.s, m['id'])
        self.assertEqual(sum(q['count'] for q in quantities), 3)
        self.assertEqual(sum(q['missing_volume'] for q in quantities), 1)
        self.assertEqual(bim.list_models(Store(actor=DEMO_ACTOR), 'demo-project')[0]['element_count'], 3)

    def test_hash_missing_chunks_and_locked_ready_model(self):
        m = self.create()
        with self.assertRaises(HTTPException) as raised:
            bim.finalize(self.s, m['id'])
        self.assertEqual(raised.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            bim.put_chunk(self.s, m['id'], 'ifc', 1, 'Zg==')
        bim.put_chunk(self.s, m['id'], 'ifc', 0, base64.b64encode(b'X' * len(self.files['ifc'])).decode())
        with self.assertRaises(HTTPException):
            bim.finalize(self.s, m['id'])
        ready = self.finish(m)
        with self.assertRaises(HTTPException):
            bim.put_elements(self.s, ready['id'], [])

    def test_notes_conflict_versions_history_and_archive(self):
        first = self.finish(self.create())
        second = self.finish(self.create(first['id']))
        self.assertEqual(second['phien_ban'], 2)
        n = bim.save_note(self.s, second['id'], Note(kind='issue', name='Kiểm tra cửa', viewpoint={'camera': {}}))
        saved = bim.notes(self.s, second['id'])[0]
        bim.save_note(self.s, second['id'], Note(**{**saved, 'status': 'resolved'}))
        with self.assertRaises(HTTPException) as raised:
            bim.save_note(self.s, second['id'], Note(**saved))
        self.assertEqual(raised.exception.status_code, 409)
        events = bim.history(self.s, 'demo-project')['items']
        self.assertTrue(any(e['detail'] == 'Kiểm tra cửa' for e in events))
        self.assertTrue(all(e['actor'] == DEMO_ACTOR['name'] for e in events))
        bim.archive(self.s, first['id'], first['revision'])
        self.assertEqual(len(bim.list_models(self.s, 'demo-project')), 1)

    def test_scope_and_role_reject_foreign_project_and_readonly_write(self):
        with self.assertRaises(HTTPException):
            bim.list_models(self.s, 'foreign-project')
        m = self.finish(self.create())
        readonly = Store(actor={**DEMO_ACTOR, 'role': 'viewer'})
        with self.assertRaises(HTTPException) as raised:
            bim.save_note(readonly, m['id'], Note(kind='view', name='Không được lưu'))
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == '__main__':
    unittest.main()
