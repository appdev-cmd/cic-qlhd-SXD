"""Verify private originals and optimistic locking on a test-owned temporary project."""

import base64
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import secrets
import sys
from uuid import UUID, uuid4
from verify_schema import load_environment
from supabase_admin import query


def main():
    load_environment()
    sys.path[:0] = [str(Path('ai/.deps').resolve()), str(Path('ai').resolve())]
    os.environ['APPRAISAL_INTERNAL_TOKEN'] = secrets.token_hex(32)
    from fastapi.testclient import TestClient
    from app.main import app
    from PIL import Image
    import httpx
    from app.store import remote

    accounts = json.loads((Path.home() / '.config/buildappraisal/test-accounts.json').read_text())['accounts']
    headers = {}
    for role in ('officer', 'director'):
        account = next(a for a in accounts if a['role'] == role)
        response = httpx.post(
            os.environ['VITE_SUPABASE_URL'] + '/auth/v1/token?grant_type=password',
            headers={'apikey': os.environ['VITE_SUPABASE_ANON_KEY']},
            json={k: account[k] for k in ('email', 'password')},
            timeout=20,
        )
        assert response.status_code == 200
        headers[role] = {
            'x-internal-token': os.environ['APPRAISAL_INTERNAL_TOKEN'],
            'Authorization': 'Bearer ' + response.json()['access_token'],
        }
    client = TestClient(app)
    project = None
    storage_path = None
    code = 'QA-GALLERY-' + str(uuid4())
    try:
        response = client.post(
            '/v1/projects',
            headers=headers['officer'],
            json={
                'code': code,
                'title': 'Dự án tạm kiểm tra thư viện ảnh',
                'field': 'Dân dụng',
                'group_type': 'C',
                'grade': 'III',
                'investment_cost': 0,
                'location': 'Điện Biên',
            },
        )
        assert response.status_code == 200, f'Project returned {response.status_code}'
        project = response.json()
        path = '/v1/projects/' + project['id'] + '/images'
        image = BytesIO()
        Image.new('RGB', (12, 12), 'blue').save(image, format='PNG')
        original = image.getvalue()
        body = {
            'revision': 1,
            'title': 'Ảnh kiểm thử private',
            'category': 'hien_trang',
            'contentBase64': base64.b64encode(original).decode(),
        }
        assert client.post(path, headers=headers['director'], json=body).status_code == 403
        saved = client.post(path, headers=headers['officer'], json=body)
        assert saved.status_code == 200, f'Gallery returned {saved.status_code}'
        image = saved.json()['images'][0]
        storage_path = image['storagePath']
        assert saved.json()['revision'] == 2 and image['sha256'] == hashlib.sha256(original).hexdigest()
        assert client.get(path, headers=headers['officer']).json() == saved.json()
        download = client.get(path + '/' + image['id'] + '/content', headers=headers['officer'])
        assert download.status_code == 200 and download.content == original
        assert client.post(path, headers=headers['officer'], json=body).status_code == 409
        logs = client.get('/v1/projects/' + project['id'] + '/audit', headers=headers['officer'])
        assert logs.status_code == 200 and any(e['detail'] == 'Cập nhật thư viện ảnh' for e in logs.json()['items'])
        anonymous = httpx.get(
            os.environ['VITE_SUPABASE_URL'] + '/storage/v1/object/public/appraisal-project-images/' + storage_path,
            timeout=20,
        )
        assert anonymous.status_code >= 400
        print(
            json.dumps(
                {
                    'private_original': True,
                    'sha256': True,
                    'reload': True,
                    'cas_conflict': True,
                    'director_denied': True,
                    'audit_actor_resolved': True,
                    'anonymous_image_denied': True,
                }
            )
        )
    finally:
        if storage_path:
            remote(
                '/storage/v1/object/appraisal-project-images',
                headers['officer']['Authorization'],
                'DELETE',
                json={'prefixes': [storage_path]},
            )
        if project:
            safe = str(UUID(project['id']))
            query(
                "begin; delete from public.audit_logs where table_name='projects' and record_id='"
                + safe
                + "'; delete from public.projects where id='"
                + safe
                + "' and code='"
                + code
                + "'; delete from public.audit_logs where table_name='projects' and record_id='"
                + safe
                + "'; commit;",
                False,
            )
        print('Temporary gallery test project and original cleaned.')


if __name__ == '__main__':
    main()
