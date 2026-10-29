"""Store the procedure subtype on demo submissions that only kept it inside a review sheet.

Usage: python scripts/backfill_subtype.py [--apply]

Before the subtype was persisted on the case, uploading a file or running OCR retired the review sheet
(``procedureReview`` → ``procedureReviewHistory``) and the subtype went with it, so SLA periods, the
in-construction inspection limit and permit start dates fell back to defaults. This copies the subtype
from the current or latest retired review sheet to ``case['subtype']`` and recomputes derived fields
(status, SLA). Revisions are unchanged, like scripts/backfill_sla.py.

Dry-run by default. With --apply a consistent copy of the SQLite file is written next to it first.
Cloud data needs no backfill: queries read the new key and fall back to the review sheet paths.
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(ROOT)  # demo data directory is resolved relative to the repository root
os.environ.setdefault('APPRAISAL_INTERNAL_TOKEN', 'backfill-script')
os.environ['APPRAISAL_MODE'] = 'demo'


def backup(path):
    """Copy the database (including pending WAL pages) with SQLite's online backup API."""
    target = path.with_name(path.stem + '-before-subtype-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite')
    source = sqlite3.connect(path)
    copy = sqlite3.connect(target)
    try:
        source.backup(copy)
    finally:
        copy.close()
        source.close()
    return target


def main(apply):
    from app.domain import case_subtype
    from app.store import DATA_DIR, DEMO_ACTOR, Store, db

    path = DATA_DIR / 'appraisal.sqlite'
    if not path.exists():
        print(f'Không có dữ liệu demo tại {path}.')
        return
    store = Store(actor=DEMO_ACTOR)
    with db() as con:
        rows = con.execute('select id,payload from cases').fetchall()
    updates = []
    for id, payload in rows:
        case = json.loads(payload)
        if case.get('procedure') not in ('gpxd', 'nghiem_thu') or case.get('subtype'):
            continue
        subtype = case_subtype(case)
        if not subtype:
            continue
        case['subtype'] = subtype
        store.derive(case)
        updates.append((id, case))
    print(f'demo: {len(rows)} lần nộp, {len(updates)} cần ghi loại thủ tục' + ('' if apply else ' (dry-run).'))
    if not apply or not updates:
        return
    copy = backup(path)
    with db() as con:
        for id, case in updates:
            con.execute(
                'update cases set payload=? where id=? and revision=?',
                (json.dumps(case, ensure_ascii=False), id, case['revision']),
            )
    print(f'Đã ghi {len(updates)} lần nộp; bản sao trước khi ghi: {copy}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    main(parser.parse_args().apply)
