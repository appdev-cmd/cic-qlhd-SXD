"""Publish the selected NOXH HVT demonstration models, without cloud credentials or user records."""

import gzip
import json
import shutil
from pathlib import Path
from verify_schema import load_environment
from supabase_admin import query

ROOT = Path(__file__).resolve().parents[1]
load_environment()
cache = ROOT / '.appraisal-data/imported-bim/qa-si-xd'
transfer = json.loads((cache / 'transfer.json').read_text(encoding='utf-8'))
project = transfer['bimProjectId']
destination = ROOT / 'public/bim/demo'
(destination / 'files').mkdir(parents=True, exist_ok=True)
(destination / 'elements').mkdir(exist_ok=True)
models = query(
    f"select * from public.bim_models where project_id='{project}' and status='ready' and deleted_at is null order by created_at desc"
)
count = 0
for model in models:
    for private_field in ('nguoi_tao_uid', 'deleted_by', 'properties_path'):
        model.pop(private_field, None)
    source_id = next(k for k, v in transfer['models'].items() if v['targetId'] == model['id'])
    for kind in ('frag', 'ifc'):
        candidates = [cache / (source_id + '.' + kind)]
        if kind == 'ifc':
            candidates.insert(0, cache / (source_id + '.ifczip'))
        source = next(p for p in candidates if p.is_file())
        name = model['id'] + source.suffix
        target = destination / 'files' / name
        if not target.exists() or target.stat().st_size != source.stat().st_size:
            shutil.copyfile(source, target)
        model[kind + '_path'] = '/bim/demo/files/' + name
    exported = destination / 'elements' / (model['id'] + '.json.gz')
    if exported.is_file():
        cached_rows = json.loads(gzip.decompress(exported.read_bytes()))
        if len(cached_rows) == model['element_count']:
            model['uploaded_by'] = 'Mô hình BIM NOXH HVT'
            model.pop('error_message', None)
            count += len(cached_rows)
            continue
    rows = []
    for offset in range(0, model['element_count'], 1000):
        rows.extend(
            query(
                f"select * from public.bim_elements where model_id='{model['id']}' order by id limit 1000 offset {offset}"
            )
        )
    if len(rows) != model['element_count']:
        raise RuntimeError('Incomplete element export')
    # Attribution remains in the private transfer record; no account or organization metadata is published.
    model['uploaded_by'] = 'Mô hình BIM NOXH HVT'
    model.pop('error_message', None)
    with gzip.GzipFile(filename=str(destination / 'elements' / (model['id'] + '.json.gz')), mode='wb', mtime=0) as f:
        f.write(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode())
    count += len(rows)
manifest = {
    'project': {'id': transfer['targetProjectId'], 'code': 'BIM-QA-NOXH-HVT', 'title': 'Mô hình BIM NOXH HVT'},
    'scope': {
        'id': project,
        'organizationId': query(f"select organization_id from public.sxd_bim_projects where id='{project}'")[0][
            'organization_id'
        ],
    },
    'models': models,
    'elementCount': count,
}
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Exported {len(models)} demonstration models, {count} elements.')
