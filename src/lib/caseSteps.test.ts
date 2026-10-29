import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseProgress, preSubmitChecklist } from './caseSteps.ts';

const base = { finalReview: null, stamping: null, permit: null };

test('BCNCKT: intake states point at the validity check; supplement waits there', () => {
  assert.equal(caseProgress({ ...base, procedure: 'bcnckt', workflow: { state: 'received' } }).current, 'validity');
  const waiting = caseProgress({ ...base, procedure: 'bcnckt', workflow: { state: 'awaiting_supplement' } });
  assert.deepEqual([waiting.current, waiting.waiting], ['validity', 'Chờ bổ sung hồ sơ']);
});

test('BCNCKT: reviewed moves to stamping and completes when archived', () => {
  assert.equal(caseProgress({ ...base, procedure: 'bcnckt', workflow: { state: 'reviewed' } }).current, 'stamp');
  const archived = caseProgress({
    ...base,
    procedure: 'bcnckt',
    workflow: { state: 'reviewed' },
    stamping: { status: 'archived' },
  });
  assert.equal(archived.completed, true);
});

test('GPXD completes once a permit number is issued', () => {
  const p = { ...base, procedure: 'gpxd' as const, workflow: { state: 'reviewed' } };
  assert.equal(caseProgress(p).current, 'issue');
  assert.equal(caseProgress({ ...p, permit: { number: '001/2026/GPXD' } }).completed, true);
});

test('Nghiệm thu: site visit and correction map to the site step', () => {
  const p = { ...base, procedure: 'nghiem_thu' as const };
  assert.equal(caseProgress({ ...p, workflow: { state: 'site_visit' } }).current, 'site');
  assert.equal(caseProgress({ ...p, workflow: { state: 'correction' } }).waiting, 'Theo dõi khắc phục');
});

test('Rejected and stopped dossiers are blocked', () => {
  assert.equal(caseProgress({ ...base, procedure: 'bcnckt', workflow: { state: 'rejected' } }).blockedAt, 'validity');
  assert.equal(caseProgress({ ...base, procedure: 'gpxd', workflow: { state: 'stopped' } }).blockedAt, 'review');
});

test('Pre-submit checklist reflects documents, analysis, facts, findings and the sheet', () => {
  const finding = (result: string, decided: boolean) => ({
    id: result,
    code: 'X',
    category: 'c',
    title: 't',
    result,
    explanation: '',
    review: decided ? { decision: 'accepted', note: '', actor: 'a', at: '' } : null,
  });
  const d = {
    procedure: 'bcnckt' as const,
    documents: [{ id: 'd1', role: 'submission' }],
    runs: [{ stale: false, findings: [finding('consistent', false), finding('inconsistent', true)] }],
    facts: [{ documentId: 'd1', reviewStatus: 'confirmed' }],
    appraisalSheet: { conclusion: 'eligible' },
    procedureReview: null,
  } as unknown as Parameters<typeof preSubmitChecklist>[0];
  assert.ok(preSubmitChecklist(d).every((i) => i.done));
  const pending = { ...d, facts: [{ documentId: 'd1', reviewStatus: 'pending' }] } as typeof d;
  assert.equal(preSubmitChecklist(pending).find((i) => i.id === 'facts')?.done, false);
});
