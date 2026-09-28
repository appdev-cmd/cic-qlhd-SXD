"""End-to-end HTTP latency through the Web/API address (Vite proxy -> Core -> Worker -> DB).

    python scripts/benchmark_http.py [--base http://localhost:8208/api/appraisal] [--rounds 12] [--label before]

Cloud staging signs in through the loopback-only test login (role officer); demo needs no token.
Prints p50/p95 per endpoint and writes output/appraisal/benchmark/http-<label>.json.
Read-only: only GET requests after sign-in.
"""

import argparse
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]


def percentile(values, share):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(share * (len(ordered) - 1)))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://localhost:8208/api/appraisal')
    parser.add_argument('--rounds', type=int, default=12)
    parser.add_argument('--label', default=datetime.now().strftime('%Y%m%d-%H%M%S'))
    args = parser.parse_args()
    client = httpx.Client(base_url=args.base, timeout=60, headers={'Origin': args.base.split('/api/')[0]})
    runtime = client.get('/runtime').json()
    if runtime.get('mode') == 'cloud':
        session = client.post('/test-login', json={'role': 'officer'})
        session.raise_for_status()
        client.headers['Authorization'] = 'Bearer ' + session.json()['access_token']
    first = client.get('/submissions', params={'procedure': 'bcnckt', 'limit': 1}).json()['items'][0]['id']
    endpoints = {
        'submissions page': ('/submissions', {'procedure': 'bcnckt', 'limit': 50}),
        'submissions overdue': (
            '/submissions',
            {'procedure': 'bcnckt', 'limit': 50, 'sla': 'overdue', 'sort': 'slaDueDate'},
        ),
        'case detail': ('/cases/' + first, None),
        'case progress': ('/cases/' + first + '/progress', None),
        'projects page': ('/projects', {'limit': 50}),
        'dashboard': ('/dashboard', None),
    }
    results = {}
    for name, (path, params) in endpoints.items():
        timings, size, status = [], 0, None
        for _ in range(args.rounds):
            started = time.perf_counter()
            response = client.get(path, params=params)
            timings.append((time.perf_counter() - started) * 1000)
            size, status = len(response.content), response.status_code
        steady = timings[1:] or timings
        results[name] = {
            'status': status,
            'bytes': size,
            'p50_ms': round(statistics.median(steady)),
            'p95_ms': round(percentile(steady, 0.95)),
            'first_ms': round(timings[0]),
        }
        print(
            f"{name:22} HTTP {status}  p50 {results[name]['p50_ms']:>5} ms  p95 {results[name]['p95_ms']:>5} ms  {size:>8} B"
        )
    target = ROOT / 'output/appraisal/benchmark'
    target.mkdir(parents=True, exist_ok=True)
    (target / f'http-{args.label}.json').write_text(
        json.dumps(
            {
                'label': args.label,
                'at': datetime.now().isoformat(),
                'mode': runtime.get('mode'),
                'rounds': args.rounds,
                'results': results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
