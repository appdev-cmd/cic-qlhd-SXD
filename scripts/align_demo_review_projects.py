"""Replace untouched demo placeholders with metadata from their linked projects."""

from runtime_endpoints import API_BASE
import json
from pathlib import Path
import httpx


def main():
    root = Path(__file__).resolve().parents[1]
    base = API_BASE
    client = httpx.Client(timeout=60)
    assert client.get(base + '/runtime').json()['environment'] == 'staging'
    login = client.post(base + '/test-login', json={'role': 'admin'})
    login.raise_for_status()
    headers = {'Authorization': 'Bearer ' + login.json()['access_token']}

    def req(method, path, body=None):
        response = client.request(method, base + path, headers=headers, json=body)
        assert response.status_code == 200, f'{method} {path}: {response.status_code}'
        return response.json()

    targets = json.loads((root / 'output/appraisal/procedure-demo-manifest.json').read_text(encoding='utf-8'))[
        'updated'
    ]
    projects = {}
    offset = 0
    while True:
        page = req('GET', f'/projects?limit=100&offset={offset}')
        projects.update({p['id']: p for p in page['items']})
        offset += len(page['items'])
        if offset >= page['total'] or not page['items']:
            break
    backup = Path.home() / '.config/buildappraisal/backups/20260927-review-project-alignment'
    backup.mkdir(parents=True, exist_ok=True)
    changed = []
    skipped = []
    from app.procedure_review import Review

    for target in targets:
        case = req('GET', '/cases/' + target['id'])
        review = case.get('procedureReview') or {}
        if (
            not case.get('sample')
            or case.get('readOnly')
            or case.get('finalReview')
            or review.get('investor') != 'Chủ đầu tư trong hồ sơ mô phỏng'
            or review.get('conclusion') != 'pending'
            or any(c['status'] != 'pending' for c in review.get('checks', []))
        ):
            skipped.append(case['id'])
            continue
        project = projects.get(case.get('projectId'))
        if not project or not project.get('investor_name'):
            skipped.append(case['id'])
            continue
        path = backup / (case['id'] + '.json')
        if not path.exists():
            path.write_text(json.dumps(case, ensure_ascii=False), encoding='utf-8')
        values = {k: v for k, v in review.items() if k in Review.model_fields}
        values.update(revision=case['revision'], investor=project['investor_name'])
        if values.get('details', {}).get('buildingClass') == 'Chưa xác nhận' and project.get('grade'):
            values['details'] = {**values['details'], 'buildingClass': project['grade']}
        saved = req('POST', f'/cases/{case["id"]}/procedure-review', values)
        assert (
            saved['procedureReview']['investor'] == project['investor_name']
            and saved['procedureReview']['conclusion'] == 'pending'
        )
        changed.append(case['id'])
    report = {'updated': changed, 'skipped': skipped, 'conclusionsPreserved': True}
    (root / 'output/appraisal/demo-project-alignment.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'updated': len(changed), 'skipped': len(skipped), 'conclusionsPreserved': True}), flush=True)


if __name__ == '__main__':
    main()
