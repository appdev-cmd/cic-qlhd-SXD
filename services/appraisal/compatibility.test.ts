import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createWorkerApp } from './app.js';
import { Store, type CasePayload } from './store.js';
import { DEMO_ACTOR } from './auth.js';
import { newCase, uid } from './domain.js';
import { addMonths } from './permits.js';
import { contract } from './validation.js';

test('every documented operation has a native route', () => {
  const routes = new Set<string>();
  for (const file of readdirSync('services/appraisal').filter(
    (f) => f.startsWith('routes-') || ['app.ts', 'permits.ts', 'test-login.ts'].includes(f),
  )) {
    const source = readFileSync('services/appraisal/' + file, 'utf8');
    for (const m of source.matchAll(/(?:router|app)\.(get|post|patch|delete)\(['"]([^'"]+)/g)) {
      let path = m[2];
      if (file === 'test-login.ts') path = '/v1/test-login' + (path === '/' ? '' : path);
      else if (!path.startsWith('/v1')) path = '/v1' + path;
      routes.add(m[1] + ' ' + path.replace(/:[^/]+/g, '{}'));
    }
  }
  for (const [path, operations] of Object.entries(contract.paths))
    for (const method of Object.keys(operations))
      assert.ok(routes.has(method + ' ' + path.replace(/\{[^}]+\}/g, '{}')), `${method} ${path}`);
});
test('permit calendar month addition clamps month ends and leap years', () => {
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});
test('native BIM upload verifies hashes, persists geometry, filters quantities, saves views and protects revisions; permit issuance stays unique', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'appraisal-node-compat-'));
  const env = { ...process.env };
  process.env.APPRAISAL_MODE = 'demo';
  process.env.APPRAISAL_DATA_DIR = directory;
  const server = createWorkerApp('compatibility-test').listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const project = {
      id: uid(),
      code: 'NODE-BIM-TEST',
      name: 'Dự án kiểm thử BIM',
      projectGroup: 'B',
      buildingGrade: 'II',
    };
    writeFileSync(join(directory, 'projects.json'), JSON.stringify([project]));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const request = async (path: string, method = 'GET', data?: unknown) =>
      fetch(base + path, {
        method,
        headers: { 'x-internal-token': 'compatibility-test', 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    const ifc = Buffer.from(
      "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;",
    );
    const frag = Buffer.from('persistent fragments fixture');
    const manifest = (bytes: Buffer) => ({
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    const created = await request(`/bim/projects/${project.id}/models`, 'POST', {
      file_name: 'native.ifc',
      discipline: 'KET_CAU',
      files: { ifc: manifest(ifc), frag: manifest(frag) },
      element_count: 1,
      ifc_schema: 'IFC4',
    });
    assert.equal(created.status, 200);
    const model = await created.json();
    assert.equal((await request(`/bim/models/${model.id}/finalize`, 'POST')).status, 422);
    for (const [kind, bytes] of [
      ['ifc', ifc],
      ['frag', frag],
    ] as const)
      assert.equal(
        (await request(`/bim/models/${model.id}/files/${kind}/0`, 'POST', { data: bytes.toString('base64') })).status,
        200,
      );
    assert.equal(
      (
        await request(`/bim/models/${model.id}/elements`, 'POST', {
          items: [
            {
              express_id: 1,
              global_id: 'fixture-guid',
              ten_cau_kien: 'Cột Điện Biên',
              loai_cau_kien: 'IfcColumn',
              phan_doan_tang: 'Tầng 1',
              the_tich_be_tong: 2.5,
            },
          ],
        })
      ).status,
      200,
    );
    const ready = await request(`/bim/models/${model.id}/finalize`, 'POST');
    assert.equal(ready.status, 200);
    const saved = await ready.json();
    assert.equal(saved.element_count, 1);
    assert.deepEqual(Buffer.from(await (await request(`/bim/models/${model.id}/files/ifc`)).arrayBuffer()), ifc);
    const page = await (await request(`/bim/models/${model.id}/elements?search=cot%20dien&limit=100`)).json();
    assert.equal(page.total, 1);
    assert.equal(page.items[0].the_tich_be_tong, 2.5);
    const summary = await (await request(`/bim/models/${model.id}/summary`)).json();
    assert.equal(summary[0].volume, 2.5);
    assert.equal(
      (
        await request(`/bim/models/${model.id}/notes`, 'POST', {
          kind: 'view',
          name: 'Góc nhìn kiểm thử',
          viewpoint: { camera: [1, 2, 3] },
        })
      ).status,
      200,
    );
    const notes = await (await request(`/bim/models/${model.id}/notes`)).json();
    assert.deepEqual(notes[0].viewpoint, { camera: [1, 2, 3] });
    assert.equal(notes[0].revision, 1);
    assert.equal(
      (
        await request(`/bim/models/${model.id}/notes`, 'POST', {
          id: notes[0].id,
          revision: 99,
          kind: 'view',
          name: 'Stale',
        })
      ).status,
      409,
    );
    assert.equal((await request(`/bim/models/${model.id}/archive`, 'POST', { revision: 1 })).status, 409);
    assert.equal((await request(`/bim/models/${model.id}/archive`, 'POST', { revision: saved.revision })).status, 200);
    assert.deepEqual(await (await request(`/bim/projects/${project.id}/models`)).json(), []);
    const store = new Store('', { ...DEMO_ACTOR });
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const value = newCase('GPXD kiểm thử ' + i, 'Điện Biên', { ...DEMO_ACTOR }, '2026-09-01', {
        procedure: 'gpxd',
        projectId: project.id,
      }) as unknown as CasePayload;
      value.procedureReview = { subtype: 'new', conclusion: 'eligible', details: {}, investor: 'Chủ đầu tư kiểm thử' };
      value.finalReview = { decision: 'reviewed' };
      await store.save(value);
      ids.push(value.id);
    }
    const issued = await Promise.all(
      ids.map((id) => request(`/cases/${id}/permit`, 'POST', { revision: 1, action: 'issue', date: '2026-09-01' })),
    );
    assert.deepEqual(
      issued.map((r) => r.status),
      [200, 200],
    );
    const permits = await Promise.all(issued.map((r) => r.json()));
    assert.equal(new Set(permits.map((p) => p.permit.number)).size, 2);
    assert.equal(permits[0].permit.startDeadline, '2027-09-01');
    const register = await (await request('/permits')).json();
    assert.equal(register.items.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of ['APPRAISAL_MODE', 'APPRAISAL_DATA_DIR'])
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    const target = realpathSync(directory);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith('appraisal-node-compat-'));
    rmSync(target, { recursive: true });
  }
});
