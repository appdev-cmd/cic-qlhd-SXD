"""Reproducible isolated 10,000-submission benchmark; never touches cloud storage."""

import json
from pathlib import Path
import statistics
import sys
import tempfile
from time import perf_counter
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
from app.store import Store, DEMO_ACTOR, db
from app.domain import new_case
from app.catalog import dashboard


def measure(action):
    times = []
    for _ in range(7):
        start = perf_counter()
        value = action()
        times.append((perf_counter() - start) * 1000)
    return {'medianMs': round(statistics.median(times), 2), 'maxMs': round(max(times), 2)}, value


def main():
    with (
        tempfile.TemporaryDirectory(prefix='appraisal-benchmark-') as folder,
        patch('app.store.DATA_DIR', Path(folder)),
    ):
        store = Store(actor=DEMO_ACTOR)
        with db() as con:
            for index in range(10_000):
                case = new_case(f'Hồ sơ Điện Biên {index:05d}', 'Điện Biên', DEMO_ACTOR, '2026-09-28', sample=True)
                case.update(id=str(index), dossierId=str(index // 2), projectId='benchmark-project')
                case['documents'] = [{'id': 'source', 'segments': [{'text': 'Trích đoạn bằng chứng mô phỏng. ' * 200}]}]
                con.execute('insert into cases values(?,?,?)', (case['id'], 1, json.dumps(case, ensure_ascii=False)))
        (Path(folder) / 'projects.json').write_text('[{"id":"benchmark-project"}]')
        first, row = measure(lambda: store.page(limit=50, sort='name', direction='asc', search='dien bien'))
        tail, last = measure(
            lambda: store.page(offset=9950, limit=50, sort='name', direction='asc', search='dien bien')
        )
        summary, value = measure(lambda: dashboard(store, 'sample'))
        assert row['total'] == last['total'] == 10_000 and len(last['items']) == 50
        assert value['cases']['dossiers'] == 5000
        assert not set(r['id'] for r in row['items']) & set(r['id'] for r in last['items'])
        assert all('documents' not in r for r in row['items'])
        print(
            json.dumps(
                {
                    'dataset': 'synthetic SQLite; 10000 submissions, 5000 dossiers; 7 repetitions',
                    'firstPage': first,
                    'lastPage': tail,
                    'dashboard': summary,
                    'pagePayloadBytes': len(json.dumps(row, ensure_ascii=False).encode()),
                    'pagingAndCountsVerified': True,
                }
            )
        )


if __name__ == '__main__':
    main()
