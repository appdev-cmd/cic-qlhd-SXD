"""Read-only assertions for the curated legal-demo migration."""

import json
from pathlib import Path
from uuid import UUID
from supabase_admin import query
from app.procedure_review import specification
from app.procedure_rules import VERSION

root = Path(__file__).resolve().parents[1]
targets = json.loads((root / 'output/appraisal/procedure-demo-manifest.json').read_text(encoding='utf-8'))['updated']
ids = ','.join("'" + str(UUID(row['id'])) + "'::uuid" for row in targets)
rows = query('select payload from public.appraisal_cases where id in (' + ids + ')')
assert len(rows) == 52
backup = Path.home() / '.config/buildappraisal/backups/20260927-legal-v2'
subtypes = set()
counts = {}
for row in rows:
    case = row['payload']
    review = case['procedureReview']
    prior = json.loads((backup / (case['id'] + '.json')).read_text(encoding='utf-8'))
    assert review['ruleVersion'] == VERSION and review['conclusion'] == 'pending'
    assert all(c['status'] == 'pending' for c in review['checks'])
    assert case['projectId'] == prior['projectId'] and case['documents'] == prior['documents']
    assert case['audit'][:-1] == prior['audit'] and case['revision'] == prior['revision'] + 1
    assert case['procedureReviewHistory'][-1] == prior['procedureReview']
    assert {c['id'] for c in review['checks']} == {c['id'] for c in specification(case)['checks']}
    subtypes.add(case['procedure'] + ':' + review['subtype'])
    counts[case['procedure']] = counts.get(case['procedure'], 0) + 1
assert len(subtypes) == 13
report = {
    'cases': len(rows),
    'version': VERSION,
    'procedures': counts,
    'subtypes': sorted(subtypes),
    'originalsAndProjectLinksPreserved': True,
    'previousReviewsArchived': True,
    'auditedRevisions': True,
    'conclusions': 'pending',
}
(root / 'output/appraisal/legal-cloud-validation.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8'
)
print(json.dumps(report, ensure_ascii=False))
