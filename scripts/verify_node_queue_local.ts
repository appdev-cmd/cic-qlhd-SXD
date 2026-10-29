/** Isolated SQL integration test; all inserted fixtures are rolled back. */
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { newCase, audit } from '../services/appraisal/domain.js';
const url = new URL(process.env.BASELINE_TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/appraisal_baseline_test'))
  throw new Error('Only the isolated loopback test database is allowed.');
const db = new pg.Client({ connectionString: url.toString(), ssl: false });
await db.connect();
try {
  await db.query('BEGIN');
  const actor = {
    id: randomUUID(),
    name: 'Queue integration officer',
    tenantId: 'QUEUE-TEST',
    department: 'Queue test',
    role: 'officer',
  };
  await db.query('insert into auth.users(id) values($1)', [actor.id]);
  await db.query(
    'insert into public.profiles(id,full_name,email,role,province_id,department) values($1,$2,$3,$4,$5,$6)',
    [actor.id, actor.name, 'queue-test@example.test', actor.role, actor.tenantId, actor.department],
  );
  const value = {
    ...newCase('Node queue SQL test', 'Queue', actor, '2026-10-01', { sample: true }),
    job: { id: randomUUID(), engine: 'node', status: 'running', mode: 'ocr' },
  };
  audit(value, actor, 'Create queue test', 'Disposable SQL fixture.');
  await db.query('set local role appraisal_backend');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.id]);
  await db.query('select public.persist_appraisal_case($1,null,$2::jsonb)', [value.id, JSON.stringify(value)]);
  await db.query('select public.set_node_appraisal_input($1,$2::jsonb)', [value.job.id, JSON.stringify({ pages: {} })]);
  assert.equal((await db.query('select * from public.claim_appraisal_job($1)', ['legacy-worker'])).rowCount, 0);
  const first = (await db.query('select * from public.claim_node_appraisal_job($1,$2)', [value.job.id, 'worker-one']))
    .rows[0];
  assert.equal(first.state, 'running');
  assert.equal(first.attempts, 1);
  async function denied(sql: string, params: unknown[], code: string) {
    await db.query('savepoint expected_failure');
    await assert.rejects(db.query(sql, params), (error: unknown) => (error as { code: string }).code === code);
    await db.query('rollback to savepoint expected_failure');
  }
  await denied('select * from public.claim_node_appraisal_job($1,$2)', [value.job.id, 'worker-two'], '40001');
  await denied(
    'select public.checkpoint_node_appraisal_job($1,$2,$3::jsonb,false)',
    [value.job.id, 'wrong-worker', '{}'],
    '40001',
  );
  const checkpoint = { pages: { 1: { lines: ['Checkpoint text'], illegible: false } } };
  await db.query('select public.checkpoint_node_appraisal_job($1,$2,$3::jsonb,true)', [
    value.job.id,
    'worker-one',
    JSON.stringify(checkpoint),
  ]);
  const resumed = (await db.query('select * from public.claim_node_appraisal_job($1,$2)', [value.job.id, 'worker-two']))
    .rows[0];
  assert.deepEqual(resumed.runtime_input, checkpoint);
  assert.equal(resumed.attempts, 1);
  await db.query('select public.retry_node_appraisal_job($1,$2)', [value.job.id, 'worker-two']);
  const retry = (await db.query('select * from public.claim_node_appraisal_job($1,$2)', [value.job.id, 'worker-three']))
    .rows[0];
  assert.equal(retry.attempts, 2);
  await db.query('select public.finish_appraisal_job($1,$2,$3)', [value.job.id, 'worker-three', 'completed']);
  assert.equal(
    (await db.query('select * from public.claim_node_appraisal_job($1,$2)', [value.job.id, 'duplicate-delivery']))
      .rows[0].state,
    'completed',
  );
  console.log(
    JSON.stringify({
      restrictedRole: true,
      legacyIsolation: true,
      exclusiveLease: true,
      checkpoints: true,
      retryAttempts: true,
      duplicateDelivery: true,
    }),
  );
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
