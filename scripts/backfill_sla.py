"""Compute SLA/status for submissions saved before the SLA policy existed.

Demo:  python scripts/backfill_sla.py [--apply]
Cloud: python scripts/backfill_sla.py --cloud [--apply]

Dry-run by default. Demo rows are rewritten in place (derived fields only,
revision unchanged). Cloud rows go through the normal persist path with one
audit event each, acting as the dedicated staging admin account, after a
payload snapshot is written outside the repository.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(ROOT)  # demo data directory is resolved relative to the repository root
os.environ.setdefault('APPRAISAL_INTERNAL_TOKEN', 'backfill-script')


def load_environment():
    for path in [
        ROOT / '.env',
        ROOT / '.env.local',
        Path(os.getenv('APPRAISAL_CONFIG_FILE', Path.home() / '.config/buildappraisal/runtime.env')),
    ]:
        if path.exists():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                if '=' in line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"\''))


def demo(apply):
    os.environ['APPRAISAL_MODE'] = 'demo'
    from app.store import Store, DEMO_ACTOR, db

    store = Store(actor=DEMO_ACTOR)
    with db() as con:
        ids = [r[0] for r in con.execute('select id from cases')]
    changed = 0
    for id in ids:
        case = store.get(id)
        before = (case.get('status'), case.get('sla'))
        store.derive(case)
        if before != (case['status'], case['sla']):
            changed += 1
            if apply:
                with db() as con:
                    con.execute(
                        'update cases set payload=? where id=? and revision=?',
                        (json.dumps(case, ensure_ascii=False), id, case['revision']),
                    )
    print(f'demo: {len(ids)} lần nộp, {changed} cần cập nhật' + (' — đã ghi.' if apply else ' (dry-run).'))


def cloud(apply):
    os.environ['APPRAISAL_MODE'] = 'cloud'
    from app.database import connection
    from app.domain import audit, now
    from app.sla import POLICY_VERSION
    from app.store import Store

    accounts = json.loads((Path.home() / '.config/buildappraisal/test-accounts.json').read_text(encoding='utf-8'))[
        'accounts'
    ]
    admin = next(a for a in accounts if a['role'] == 'admin')
    with connection(admin['user_id']) as con:
        profile = con.execute(
            'select id,full_name,province_id,department,role from public.profiles where id=%s and is_active',
            (admin['user_id'],),
        ).fetchone()
        # Latest submissions whose SLA predates the current policy version (or has none).
        rows = con.execute(
            """select id,payload from public.appraisal_cases c
            where (payload->'sla'->>'policyVersion') is distinct from %s
              and not exists(select 1 from public.appraisal_cases n where n.previous_submission_id=c.id)
            order by created_at""",
            (POLICY_VERSION,),
        ).fetchall()
    actor = {
        'id': str(profile['id']),
        'name': profile['full_name'],
        'tenantId': profile['province_id'],
        'department': profile['department'],
        'role': profile['role'],
    }
    print(f'cloud: {len(rows)} lần nộp mới nhất cần tính lại hạn ({POLICY_VERSION}) trong phạm vi quản trị staging.')
    if not apply or not rows:
        return
    folder = (
        Path.home()
        / '.config/buildappraisal/backups'
        / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-before-sla-backfill')
    )
    folder.mkdir(parents=True)
    data = json.dumps(
        [{'id': str(r['id']), 'payload': r['payload']} for r in rows], ensure_ascii=False, default=str
    ).encode()
    (folder / 'cases.json').write_bytes(data)
    (folder / 'manifest.json').write_text(
        json.dumps({'rows': len(rows), 'sha256': hashlib.sha256(data).hexdigest()}), encoding='utf-8'
    )
    store = Store(actor=actor)
    for row in rows:
        case = store.get(str(row['id']))
        expected = case['revision']
        case['revision'] = expected + 1
        case['updatedAt'] = now()
        audit(
            case,
            actor,
            'Tính hạn xử lý',
            'Tính lại hạn xử lý theo chính sách '
            + POLICY_VERSION
            + ' (NĐ 217/2026, NĐ 207/2026; chờ chuyên viên xác nhận).',
        )
        store.save(case, expected)
    print(f'Đã ghi {len(rows)} lần nộp; bản chụp trước khi ghi: {folder}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--cloud', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    load_environment()
    cloud(args.apply) if args.cloud else demo(args.apply)
