import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { Store, type CasePayload } from './store.js';
import { newCase, uid } from './domain.js';
import { DEMO_ACTOR } from './auth.js';
import { dashboard } from './analytics.js';

test('Node repository preserves originals, revisions, supplement lineage and SQL-filtered work queues', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'appraisal-node-store-'));
  const previous = { mode: process.env.APPRAISAL_MODE, data: process.env.APPRAISAL_DATA_DIR };
  process.env.APPRAISAL_MODE = 'demo';
  process.env.APPRAISAL_DATA_DIR = dir;
  try {
    const project = { id: uid(), code: 'NODE-TEST', name: 'Dự án kiểm thử', projectGroup: 'B', buildingGrade: 'II' };
    writeFileSync(join(dir, 'projects.json'), JSON.stringify([project]));
    const store = new Store('', { ...DEMO_ACTOR });
    const value = newCase('Hồ sơ kiểm thử Điện Biên', 'Điện Biên', { ...DEMO_ACTOR }, '2026-10-01', {
      projectId: project.id,
    }) as unknown as CasePayload;
    value.workflow = { state: 'assigned', assigneeId: DEMO_ACTOR.id };
    const original = Buffer.from('Bản gốc nguyên vẹn');
    const documentId = uid();
    value.documents.push({ id: documentId, name: 'test.txt', requirementId: 'TTR', role: 'submission', segments: [] });
    await store.save(value);
    await store.putFile(value.id, documentId, original);
    assert.deepEqual(await store.file(value.id, documentId), original);
    assert.equal((await store.get(value.id)).revision, 1);
    assert.equal((await store.page({ search: 'dien bien', scope: 'mine' })).total, 1);
    assert.equal((await store.page({ search: 'không tồn tại' })).total, 0);
    assert.equal((await store.page({ scope: 'queue' })).total, 1);
    assert.equal((await store.page({ scope: 'mine', kind: 'real' })).items[0].documentCount, 1);
    const summary = await dashboard(store);
    assert.equal(summary.cases.total, 1);
    assert.equal(summary.projects.total, 1);
    assert.equal(
      summary.procedures.reduce((n, row) => n + row.total, 0),
      1,
    );
    assert.equal(
      summary.months.reduce((n, row) => n + row.total, 0),
      1,
    );
    assert.equal(
      summary.sla.reduce((n, row) => n + row.total, 0),
      1,
    );
    assert.equal(summary.performance.mine.bcnckt.queue, 1);
    const changed = structuredClone(value);
    changed.revision = 2;
    const results = await Promise.allSettled([
      store.save(structuredClone(changed), 1),
      store.save(structuredClone(changed), 1),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const supplement = newCase('Lần bổ sung', 'Điện Biên', { ...DEMO_ACTOR }, '2026-10-02', {
      projectId: project.id,
    }) as unknown as CasePayload;
    supplement.previousSubmissionId = value.id;
    supplement.previousRevision = 2;
    await store.save(supplement);
    assert.equal(supplement.dossierId, value.id);
    assert.equal(supplement.submissionRound, 2);
    assert.equal(await store.hasSuccessor(value.id), true);
    await assert.rejects(store.save({ ...changed, revision: 3 }, 2), { status: 409 });
    assert.equal((await store.page({ dossierId: value.id })).total, 2);
  } finally {
    for (const [key, prior] of [
      ['APPRAISAL_MODE', previous.mode],
      ['APPRAISAL_DATA_DIR', previous.data],
    ]) {
      if (prior === undefined) delete process.env[key!];
      else process.env[key!] = prior;
    }
    assert.equal(realpathSync(dirname(dir)), realpathSync(tmpdir()));
    assert.ok(basename(dir).startsWith('appraisal-node-store-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
