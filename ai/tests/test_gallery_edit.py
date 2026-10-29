"""Gallery caption edit and image removal (demo SQLite branch)."""

import base64
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from PIL import Image
from app.store import Store, DEMO_ACTOR
from app import gallery
from app.schemas import AddProjectImage, UpdateProjectImage


def png():
    image = BytesIO()
    Image.new('RGB', (8, 8), 'green').save(image, format='PNG')
    return image.getvalue()


class GalleryEdit(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        scoped = patch('app.store.DATA_DIR', directory)
        scoped.start()
        self.addCleanup(scoped.stop)
        (directory / 'projects.json').write_text(
            json.dumps([{'id': 'demo-project', 'name': 'Dự án mẫu', 'images': []}]), encoding='utf-8'
        )
        self.store = Store(actor=DEMO_ACTOR)
        self.original = png()
        saved = gallery.add(
            self.store,
            'demo-project',
            AddProjectImage(
                revision=1,
                title='Ảnh khảo sát',
                category='hien_trang',
                description='Mô tả cũ',
                contentBase64=base64.b64encode(self.original).decode(),
            ),
        )
        self.image = saved['images'][0]

    def test_update_changes_caption_keeps_original_and_audits(self):
        result = gallery.update(
            self.store,
            'demo-project',
            self.image['id'],
            UpdateProjectImage(revision=2, title='  Ảnh phối cảnh  ', category='phoi_canh', description=' Mới '),
        )
        self.assertEqual(result['revision'], 3)
        changed = result['images'][0]
        self.assertEqual(
            (changed['title'], changed['category'], changed['categoryLabel'], changed['description']),
            ('Ảnh phối cảnh', 'phoi_canh', 'Phối cảnh 3D', 'Mới'),
        )
        # Provenance fields are never editable.
        for key in ('id', 'url', 'author', 'date', 'storagePath', 'sha256'):
            self.assertEqual(changed[key], self.image[key])
        self.assertEqual(gallery.read(self.store, 'demo-project'), result)
        self.assertEqual(gallery.content(self.store, 'demo-project', self.image['id']), self.original)
        events = self.store.project_audit('demo-project')['items']
        self.assertEqual({e['action'] for e in events}, {'Bổ sung ảnh', 'Sửa thông tin ảnh'})
        self.assertIn('Sửa thông tin ảnh: Ảnh phối cảnh', {e['detail'] for e in events})

    def test_remove_drops_record_and_original(self):
        result = gallery.remove(self.store, 'demo-project', self.image['id'], 2)
        self.assertEqual(result, {'images': [], 'revision': 3})
        self.assertEqual(gallery.read(self.store, 'demo-project'), result)
        with self.assertRaises(HTTPException) as error:
            gallery.content(self.store, 'demo-project', self.image['id'])
        self.assertEqual(error.exception.status_code, 404)
        actions = {e['action'] for e in self.store.project_audit('demo-project')['items']}
        self.assertEqual(actions, {'Bổ sung ảnh', 'Xóa ảnh'})

    def test_stale_revision_unknown_image_and_forbidden_role(self):
        body = UpdateProjectImage(revision=1, title='Ảnh', category='hien_trang')
        with self.assertRaises(HTTPException) as error:
            gallery.update(self.store, 'demo-project', self.image['id'], body)
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException) as error:
            gallery.remove(self.store, 'demo-project', self.image['id'], 1)
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException) as error:
            gallery.remove(self.store, 'demo-project', 'missing', 2)
        self.assertEqual(error.exception.status_code, 404)
        with self.assertRaises(HTTPException) as error:
            gallery.update(
                self.store, 'demo-project', self.image['id'], body.model_copy(update={'title': '   ', 'revision': 2})
            )
        self.assertEqual(error.exception.status_code, 422)
        director = Store(actor={**DEMO_ACTOR, 'role': 'director'})
        for call in (
            lambda: gallery.update(director, 'demo-project', self.image['id'], body.model_copy(update={'revision': 2})),
            lambda: gallery.remove(director, 'demo-project', self.image['id'], 2),
        ):
            with self.assertRaises(HTTPException) as error:
                call()
            self.assertEqual(error.exception.status_code, 403)
        # Nothing changed after the rejected calls.
        self.assertEqual(gallery.read(self.store, 'demo-project')['revision'], 2)

    def test_routes_are_in_the_contract(self):
        from app.main import app

        operations = app.openapi()['paths']['/v1/projects/{id}/images/{image_id}']
        self.assertEqual(set(operations), {'patch', 'delete'})
        self.assertIn('revision', [p['name'] for p in operations['delete']['parameters']])
        self.assertTrue(operations['patch']['requestBody']['required'])


if __name__ == '__main__':
    unittest.main()
