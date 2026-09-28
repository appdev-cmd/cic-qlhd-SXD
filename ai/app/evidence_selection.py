"""Budget whole evidence segments across documents, including their final sections."""

import hashlib
import json

VERSION = 'balanced-whole-segments-v1'


def select(case, run, budget=55_000):
    documents = [d for d in case['documents'] if d['id'] in set(run['documentIds'])]
    cited = {s.get('segmentId') for f in run.get('findings', []) for s in f.get('sources', [])}
    # Give every document a chance before filling the remaining context.
    candidates = []
    for document in documents:
        segments = document['segments']
        for index, segment in enumerate(segments):
            score = 0 if segment['id'] in cited else 1 if index in (0, len(segments) - 1) else 2
            candidates.append((score, index, document, segment))
    # Round-robin at each priority prevents one long document using the entire budget.
    candidates.sort(key=lambda row: (row[0], row[1] if row[0] != 1 else (0 if row[1] == 0 else 1), row[2]['id']))
    selected = []
    used = 0
    for _, _, document, segment in candidates:
        if not segment['text'].strip() or used + len(segment['text']) > budget:
            continue
        selected.append({**segment, 'documentId': document['id']})
        used += len(segment['text'])
    ids = {s['id'] for s in selected}
    coverage = {
        'version': VERSION,
        'budgetCharacters': budget,
        'selectedCharacters': used,
        'totalCharacters': sum(len(s['text']) for d in documents for s in d['segments']),
        'selectedSegments': len(selected),
        'totalSegments': sum(len(d['segments']) for d in documents),
        'documents': [],
    }
    for d in documents:
        accepted = [s for s in d['segments'] if s['id'] in ids]
        coverage['documents'].append(
            {
                'documentId': d['id'],
                'name': d['name'],
                'sha256': d.get('hash'),
                'selectedSegments': len(accepted),
                'totalSegments': len(d['segments']),
                'locators': [s['locator'] for s in accepted[:40]],
                'complete': len(accepted) == len(d['segments']),
            }
        )
    coverage['inputHash'] = hashlib.sha256(
        json.dumps(selected, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    return selected, coverage
