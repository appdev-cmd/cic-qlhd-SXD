/** Explicit opt-in: uses regular Auth and scoped read-only SQL; never prints credentials. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { loadEnvironment } from './environment.mjs';
import { actorFor } from '../services/appraisal/auth.js';
import { closePools, transaction } from '../services/appraisal/database.js';
import { pageText } from '../services/appraisal/ocr.js';
import { configured } from '../services/appraisal/provider.js';
import { scope } from '../services/appraisal/bim-suite.js';
import { Store } from '../services/appraisal/store.js';
import { dashboard } from '../services/appraisal/analytics.js';

if (process.env.APPRAISAL_NODE_CLOUD_VERIFY !== '1') {
  throw new Error('Set APPRAISAL_NODE_CLOUD_VERIFY=1 for the authenticated cloud verification.');
}
loadEnvironment(process.cwd());
process.env.APPRAISAL_MODE = 'cloud';
const privateAccounts = JSON.parse(
  readFileSync(resolve(homedir(), '.config/buildappraisal/test-accounts.json'), 'utf8'),
) as {
  projectRef: string;
  accounts: Array<{ email: string; password: string; role: string }>;
};
const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
assert.ok(base && key, 'Missing server Supabase configuration.');
assert.equal(new URL(base).hostname.split('.')[0], privateAccounts.projectRef, 'Account project mismatch.');
const account = privateAccounts.accounts.find((item) => item.role === 'officer');
assert.ok(account, 'Missing regular officer test account.');
const response = await fetch(base + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  redirect: 'error',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: account.email, password: account.password }),
  signal: AbortSignal.timeout(30_000),
});
assert.equal(response.status, 200, 'Regular Auth login failed.');
const session = (await response.json()) as { access_token: string };
const token = 'Bearer ' + session.access_token;
try {
  const actor = await actorFor(token);
  assert.equal(actor.role, 'officer');
  const project = '4ef3f2aa-481f-44e2-8774-6aa0282cfe49';
  const workspace = await scope({ actor, token }, project);
  assert.equal(workspace.target_project_id, '01e900c5-02a9-410f-828f-7fb9db099157');
  const counts = await transaction(actor.id, async (client) => {
    const secure = (
      await client.query<{ secure: boolean }>(
        'select not (rolsuper or rolbypassrls) as secure from pg_roles where rolname=current_user',
      )
    ).rows[0].secure;
    assert.equal(secure, true, 'Runtime database role must enforce RLS.');
    const identity = (await client.query<{ id: string }>("select current_setting('request.jwt.claim.sub',true) as id"))
      .rows[0].id;
    assert.equal(identity, actor.id);
    return (
      await client.query<{ models: number; elements: number }>(
        "select count(*)::int as models,coalesce(sum(element_count),0)::int as elements from public.bim_models where project_id=$1 and deleted_at is null and status='ready'",
        [project],
      )
    ).rows[0];
  });
  assert.ok(counts.models >= 12 && counts.elements >= 38_739, 'Imported BIM dataset missing.');
  console.log(JSON.stringify({ cloudAuth: 'passed', rls: 'passed', bimWorkspace: 'passed', ...counts }));
  const repository = new Store(token, actor);
  const pageOfCases = await repository.page({ limit: 1 });
  if (pageOfCases.items[0])
    assert.equal((await repository.get(String(pageOfCases.items[0].id))).id, pageOfCases.items[0].id);
  console.log(JSON.stringify({ nodeCaseRepository: 'passed', visibleCases: pageOfCases.total }));
  const summary = await dashboard(repository);
  assert.equal(
    summary.procedures.reduce((n, row) => n + row.total, 0),
    summary.cases.total,
  );
  assert.equal(
    summary.sla.reduce((n, row) => n + row.total, 0),
    summary.cases.total,
  );
  console.log(JSON.stringify({ nodeDashboard: 'passed', scopedCases: summary.cases.total }));
  if (!process.argv.includes('--database-only')) {
    assert.ok(configured(), 'AI provider is not configured for real OCR verification.');
    const document = await PDFDocument.create();
    const page = document.addPage([595.28, 841.89]);
    const font = await document.embedFont(StandardFonts.TimesRoman);
    page.drawText('CIC OCR verification: document code TEST-12345', { x: 80, y: 740, font, size: 14 });
    page.drawText('Total cost: 123456789 VND', { x: 80, y: 710, font, size: 14 });
    const transcript = await pageText(await document.save(), 0);
    assert.match(transcript.text, /TEST-12345/);
    assert.match(transcript.text, /123[.,\s]?456[.,\s]?789/);
    assert.equal(transcript.provenance.verified, false);
    console.log(
      JSON.stringify({ realAiOcr: 'passed', sourcePage: transcript.provenance.page, originalPreserved: true }),
    );
  } else {
    console.log(JSON.stringify({ realAiOcr: 'not_run', reason: 'database-only verification requested' }));
  }
} finally {
  await closePools();
}
