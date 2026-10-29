import { test } from 'node:test';
import assert from 'node:assert/strict';
import legalCases from './fixtures/legal-parity.json' with { type: 'json' };
import slaCases from './fixtures/sla-parity.json' with { type: 'json' };
import { legalOverview, type LegalCase } from './legal.js';
import { compute, evaluate, demoCalendar, type DeadlineCase } from './sla.js';
import analysisCases from './fixtures/analysis-parity.json' with { type: 'json' };
import workflowCases from './fixtures/workflow-parity.json' with { type: 'json' };
import reviewCases from './fixtures/review-parity.json' with { type: 'json' };
import { analyze, type AnalysisCase } from './rules.js';
import { options } from './workflow.js';
import { specification } from './procedure-review.js';
import procedureDocuments from './fixtures/procedure-document-parity.json' with { type: 'json' };
import { procedureBlocks } from './procedure-documents.js';
import bcncktDocuments from './fixtures/bcnckt-document-parity.json' with { type: 'json' };
import { reportBlocks } from './reporting.js';

test('legal regime and checklist match 96 archived legacy scenarios', () => {
  for (const [i, fixture] of legalCases.entries()) {
    assert.deepEqual(legalOverview(fixture.case as LegalCase), fixture.expected, `legal scenario ${i}`);
  }
});
test('SLA deadline calculations match 360 archived legacy scenarios', () => {
  const calendar = demoCalendar();
  for (const [i, fixture] of slaCases.entries()) {
    assert.deepEqual(
      compute(fixture.case as DeadlineCase, calendar, fixture.classification),
      fixture.expected,
      `deadline scenario ${i}`,
    );
  }
});
test('SLA live status matches 360 archived legacy scenarios', () => {
  const calendar = demoCalendar();
  for (const [i, fixture] of slaCases.entries()) {
    assert.deepEqual(evaluate(fixture.expected, calendar, false, '2026-10-10'), fixture.state, `SLA state ${i}`);
  }
});
test('analysis findings and exact monetary calculations match both legacy sample dossiers', () => {
  for (const fixture of analysisCases) {
    const { id: _id, createdAt: _createdAt, ...run } = analyze(fixture.case as unknown as AnalysisCase);
    const result = {
      ...run,
      documentIds: [...run.documentIds].sort(),
      findings: run.findings.map(({ id: _findingId, ...finding }) => finding),
    };
    assert.deepEqual(result, fixture.expected);
  }
});
test('workflow permissions and one-time procedural limits match 216 legacy scenarios', () => {
  for (const [i, fixture] of workflowCases.entries())
    assert.deepEqual(
      options(fixture.case as DeadlineCase, fixture.actor, fixture.today),
      fixture.expected,
      `workflow ${i}`,
    );
});
test('all permit and inspection checklist variants match the existing contract', () => {
  for (const fixture of reviewCases)
    assert.deepEqual(specification(fixture.case as DeadlineCase, fixture.subtype), fixture.expected);
});
test('all 120 permit and inspection document variants preserve existing content, empty fields, defects and attachments', () => {
  for (const [i, fixture] of procedureDocuments.entries())
    assert.deepEqual(
      procedureBlocks(fixture.case as unknown as AnalysisCase, fixture.kind),
      fixture.expected,
      `document ${i}`,
    );
});
test('BCNCKT reports, decisions, supplement, suspension, notice and stamping preserve legacy document content', () => {
  for (const [i, fixture] of bcncktDocuments.entries())
    assert.deepEqual(
      reportBlocks(fixture.case as unknown as AnalysisCase, fixture.kind),
      fixture.expected,
      `BCNCKT document ${i}`,
    );
});
