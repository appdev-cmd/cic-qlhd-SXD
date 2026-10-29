/** Runs only against an empty, disposable loopback database; never loads runtime.env. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const dsn = process.env.BASELINE_TEST_DATABASE_URL;
if (!dsn) throw new Error('BASELINE_TEST_DATABASE_URL is required.');
const parsed = new URL(dsn);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  !parsed.pathname.startsWith('/appraisal_baseline_test')
) {
  throw new Error('Chỉ chạy trên database appraisal_baseline_test cục bộ cách ly.');
}
const client = new pg.Client({ connectionString: dsn, ssl: false });
await client.connect();
try {
  assert.equal(
    (await client.query("select 1 from pg_tables where schemaname in ('public','auth','storage')")).rowCount,
    0,
    'Test database must be empty.',
  );
  await client.query(readFileSync('scripts/sql/supabase_test_prerequisites.sql', 'utf8'));
  await client.query(readFileSync('supabase/baselines/20260928.sql', 'utf8'));
  const count = async (sql: string) => Number((await client.query(sql)).rows[0].n);
  assert.equal(await count("select count(*) as n from pg_tables where schemaname='public'"), 22);
  assert.equal(await count("select count(*) as n from pg_policies where schemaname in ('public','storage')"), 33);
  assert.equal(await count("select count(*) as n from pg_sequences where schemaname='public'"), 5);
  assert.equal(
    await count(
      "select count(*) as n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity",
    ),
    0,
  );
  assert.equal(
    (await client.query("select has_table_privilege('anon','public.projects','select') as allowed")).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await client.query(
        "select has_function_privilege('authenticated','public.save_project_images(text,integer,jsonb)','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await client.query(
        "select has_function_privilege('appraisal_backend','public.save_project_images(text,integer,jsonb)','execute') as allowed",
      )
    ).rows[0].allowed,
    true,
  );
  assert.equal(await count('select count(*) as n from storage.buckets where public'), 0);
  assert.equal((await client.query("select public.f_unaccent('Điện Biên') as value")).rows[0].value, 'Dien Bien');
  assert.equal(
    (await client.query("select public.add_working_days('2026-09-25'::date,1)::text as value")).rows[0].value,
    '2026-09-28',
  );
  assert.equal(
    (await client.query("select rolbypassrls or rolsuper as unsafe from pg_roles where rolname='appraisal_backend'"))
      .rows[0].unsafe,
    false,
  );
  for (const { tablename } of (
    await client.query("select tablename from pg_tables where schemaname='public' and tablename<>'schema_migrations'")
  ).rows) {
    assert.match(tablename, /^[a-z_]+$/);
    assert.equal(await count(`select count(*) as n from public."${tablename}"`), 0);
  }
  await client.query(readFileSync('supabase/migrations/20261029040000_node_appraisal_jobs.sql', 'utf8'));
  for (const signature of [
    'set_node_appraisal_input(uuid,jsonb)',
    'claim_node_appraisal_job(uuid,text)',
    'checkpoint_node_appraisal_job(uuid,text,jsonb,boolean)',
    'retry_node_appraisal_job(uuid,text)',
  ]) {
    assert.equal(
      (
        await client.query("select has_function_privilege($1,$2,'execute') as allowed", [
          'authenticated',
          'public.' + signature,
        ])
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await client.query("select has_function_privilege($1,$2,'execute') as allowed", [
          'appraisal_backend',
          'public.' + signature,
        ])
      ).rows[0].allowed,
      true,
    );
  }
  assert.equal(
    (
      await client.query('select count(*) as n from public.claim_node_appraisal_job($1,$2)', [
        '00000000-0000-4000-8000-000000000001',
        'test-worker',
      ])
    ).rows[0].n,
    '0',
  );
  console.log(
    JSON.stringify({
      baselineReplayed: true,
      tables: 22,
      policies: 33,
      sequences: 5,
      rls: true,
      anonymousDenied: true,
      nodeQueueMigration: 'passed',
    }),
  );
  await client.query(readFileSync('supabase/migrations/20261029040500_bim_assistant_log_feature.sql', 'utf8'));
  await client.query('BEGIN');
  await client.query('insert into public.ai_logs(feature,input_text) values($1,$2)', [
    'bim_assistant',
    'Isolated fixture',
  ]);
  await client.query('ROLLBACK');
  console.log(JSON.stringify({ bimAssistantAuditFeature: 'passed' }));
} finally {
  await client.end();
}
