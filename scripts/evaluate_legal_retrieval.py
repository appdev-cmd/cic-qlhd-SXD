"""Reproducible source-retrieval evaluation, not professional legal validation."""

import json, time
from pathlib import Path
from app.legal_assistant import retrieve

root = Path(__file__).resolve().parents[1]
cases = json.loads((root / 'ai/evaluation/legal_retrieval.json').read_text(encoding='utf-8'))
results = []
for case in cases:
    start = time.perf_counter()
    sources, manifest = retrieve(case['question'])
    matches = [
        i + 1 for i, s in enumerate(sources) if s['document'] == case['source'] and case['heading'] in s['heading']
    ]
    results.append(
        {
            **case,
            'hit': bool(matches),
            'rank': matches[0] if matches else None,
            'elapsedMs': round((time.perf_counter() - start) * 1000),
            'sources': [{'id': s['id'], 'heading': s['heading'], 'sha256': s['sha256']} for s in sources],
        }
    )
out = root / 'output/appraisal/legal-retrieval-evaluation.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    json.dumps(
        {
            'kind': 'retrieval-only',
            'datasetSize': len(results),
            'hits': sum(r['hit'] for r in results),
            'notice': 'Đánh giá truy hồi điều khoản trong bộ câu hỏi đã công bố. Không suy ra tính đúng đắn của diễn giải AI hoặc kết luận nghiệp vụ từ tỷ lệ truy hồi.',
            'registry': manifest,
            'results': results,
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding='utf-8',
)
print(
    json.dumps(
        {
            'cases': len(results),
            'hits': sum(r['hit'] for r in results),
            'misses': [r['id'] for r in results if not r['hit']],
        },
        ensure_ascii=False,
    )
)
