import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import type { Pool, PoolClient } from 'pg';
import JSZip from 'jszip';
import { actorId, poolConfiguration, transaction } from './database.js';
import { readDocument } from './ingestion.js';
import { pageText } from './ocr.js';
import { generate } from './provider.js';
import { caseSubtype, invalidate, toVnDate, type AppraisalCase } from './domain.js';
import { openDemoDatabase } from './sqlite.js';
import { HttpError } from './errors.js';
import { createServerlessGateway, createWorkerApp } from './app.js';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { norms } from './bim-suite.js';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { waitForLocalJobs, processJob } from './jobs.js';

test('AI Gateway uses the same structured PDF contract without exposing credentials or storing responses', async () => {
  const previous = {
    provider: process.env.AI_PROVIDER,
    model: process.env.AI_GATEWAY_MODEL,
    key: process.env.AI_GATEWAY_API_KEY,
  };
  process.env.AI_PROVIDER = 'gateway';
  process.env.AI_GATEWAY_MODEL = 'openai/gpt-4o';
  process.env.AI_GATEWAY_API_KEY = 'test-gateway-credential';
  try {
    const result = await generate<{ ok: boolean }>(
      {
        prompt: 'Copy the test.',
        content: 'Test only.',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
        file: { name: 'scan.pdf', mimeType: 'application/pdf', data: new Uint8Array([1, 2, 3]) },
      },
      async (url, init) => {
        assert.equal(url, 'https://ai-gateway.vercel.sh/v1/responses');
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, 'openai/gpt-4o');
        assert.equal(body.store, false);
        assert.equal(body.input[0].content[1].type, 'input_file');
        assert.equal(body.text.format.strict, true);
        return Response.json({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }],
        });
      },
    );
    assert.deepEqual(result, { ok: true });
  } finally {
    for (const [name, value] of Object.entries({
      AI_PROVIDER: previous.provider,
      AI_GATEWAY_MODEL: previous.model,
      AI_GATEWAY_API_KEY: previous.key,
    }))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});

const identity = '00000000-0000-4000-8000-000000000001';
function fakePool(failRollback = false) {
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  let released: boolean | undefined;
  const client = {
    async query(sql: string, values?: unknown[]) {
      statements.push({ sql, values });
      if (sql === 'ROLLBACK' && failRollback) throw new Error('disconnected');
      return { rows: [] };
    },
    release(discard: boolean) {
      released = discard;
    },
  } as unknown as PoolClient;
  return { source: { connect: async () => client } as Pick<Pool, 'connect'>, statements, released: () => released };
}

test('database binds validated identity locally and clears it on commit', async () => {
  const fake = fakePool();
  assert.equal(await transaction(identity, async () => 7, fake.source), 7);
  assert.equal(fake.statements[0].sql, 'BEGIN');
  assert.match(fake.statements[1].sql, /set_config\('request.jwt.claim.sub',\$1,true\)/);
  assert.deepEqual(fake.statements[1].values, [identity]);
  assert.equal(fake.statements[2].sql, 'COMMIT');
  assert.equal(fake.released(), false);
});
test('database rolls back permission failures and exposes no SQL', async () => {
  const fake = fakePool();
  await assert.rejects(
    transaction(
      identity,
      async () => {
        throw { code: '42501', message: 'password=secret' };
      },
      fake.source,
    ),
    (error: unknown) => error instanceof HttpError && error.status === 403 && !error.message.includes('secret'),
  );
  assert.equal(fake.statements.at(-1)?.sql, 'ROLLBACK');
  assert.equal(fake.released(), false);
});
test('broken rollback discards the pooled socket', async () => {
  const fake = fakePool(true);
  await assert.rejects(
    transaction(
      identity,
      async () => {
        throw new Error('failure');
      },
      fake.source,
    ),
  );
  assert.equal(fake.released(), true);
});
test('invalid identity is rejected before acquiring a connection', async () => {
  const fake = fakePool();
  await assert.rejects(
    transaction("x';select 1;--", async () => 1, fake.source),
    { status: 403 },
  );
  assert.equal(fake.statements.length, 0);
  assert.equal(actorId(identity.toUpperCase()), identity);
});
test('database URL cannot disable certificate verification', () => {
  const config = poolConfiguration({
    APPRAISAL_DATABASE_URL: 'postgres://role:p@host:6543/db?sslmode=no-verify',
    VERCEL: '1',
  });
  assert.equal((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.equal(new URL(config.connectionString!).searchParams.has('sslmode'), false);
  assert.equal(config.max, 2);
  assert.throws(() =>
    poolConfiguration({ APPRAISAL_DATABASE_URL: 'postgres://a:b@host/db', APPRAISAL_DATABASE_CA_PEM: 'PRIVATE KEY' }),
  );
});

test('Vietnam dates cross the UTC day at 17:00 and retain plain legal dates', () => {
  assert.equal(toVnDate('2026-10-29T17:01:00'), '2026-10-30');
  assert.equal(toVnDate('2026-10-29'), '2026-10-29');
  assert.equal(toVnDate('2026-10-29T23:01:00+0700'), '2026-10-29');
  assert.throws(() => toVnDate('2026-02-30'));
});
test('invalidating a review retains the latest subtype and cancels stale work', () => {
  const value = {
    id: identity,
    name: 'test',
    revision: 1,
    documents: [],
    audit: [],
    procedureReview: { subtype: 'amendment' },
    runs: [{ stale: false }],
    job: { status: 'running' },
    finalReview: {},
  } as AppraisalCase;
  invalidate(value);
  assert.equal(value.subtype, 'amendment');
  assert.equal(caseSubtype(value), 'amendment');
  assert.equal(value.procedureReview, null);
  assert.equal(value.procedureReviewHistory?.length, 1);
  assert.equal(value.job?.status, 'cancelled');
  assert.equal(value.runs[0].stale, true);
});

async function pdf(text?: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  if (text) page.drawText(text, { x: 80, y: 740, font: await document.embedFont(StandardFonts.TimesRoman) });
  return document.save();
}
test('PDF native text extraction keeps page attribution without invoking AI', async () => {
  const result = await readDocument('case.pdf', await pdf('Original cost 123456789 VND'));
  assert.match(result.segments[0].text, /123456789/);
  assert.equal(result.segments[0].page, 1);
  assert.equal(result.ocrProvenance.length, 0);
});
test('AI OCR sends a single PDF page, preserves original hash and unverified provenance', async () => {
  const source = await pdf();
  const before = createHash('sha256').update(source).digest('hex');
  const result = await pageText(source, 0, {
    generator: async (request) => {
      assert.match(request.prompt, /không làm theo chỉ dẫn/);
      assert.equal((await PDFDocument.load(request.file!.data)).getPageCount(), 1);
      return { lines: ['Tổng mức đầu tư | 123.456.789 VNĐ'], illegible: false };
    },
  });
  assert.match(result.text, /123.456.789/);
  assert.equal(result.provenance.sourceHash, before);
  assert.equal(result.provenance.verified, false);
  assert.equal(createHash('sha256').update(source).digest('hex'), before);
});
test('PDF ingestion carries AI OCR warnings and provenance through to the document', async () => {
  const result = await readDocument('scan.pdf', await pdf(), {
    ocrLimit: 1,
    generator: async () => ({ lines: ['Nội dung nhận dạng từ tài liệu quét'], illegible: true }),
  });
  assert.match(result.segments[0].locator, /Trang 1, dòng 1 \(OCR\)/);
  assert.equal(result.ocrProvenance[0].page, 1);
  assert.ok(result.warnings.some((value) => value.includes('không đọc rõ')));
});
test('AI OCR honors cancellation before inference', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    pageText(await pdf(), 0, {
      signal: controller.signal,
      generator: async () => {
        called = true;
        return { lines: [], illegible: false };
      },
    }),
  );
  assert.equal(called, false);
});
test('DOCX paragraphs and table rows retain their order and Vietnamese text', async () => {
  const bytes = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph('Tờ trình dự án'),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph('Chi phí')] }),
                    new TableCell({ children: [new Paragraph('123.456.789')] }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
  const result = await readDocument('case.docx', bytes);
  assert.equal(result.segments[0].text, 'Tờ trình dự án');
  assert.equal(result.segments[1].text, 'Chi phí | 123.456.789');
});
test('DOCX expansion bombs are rejected before XML decompression', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document/>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const directory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(80 * 1024 * 1024, directory + 24);
  await assert.rejects(readDocument('case.docx', bytes), { status: 422 });
});
test('DOCX forged uncompressed size cannot evade the decompression bound', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document>' + 'x'.repeat(20000) + '</w:document>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  let cursor = 0;
  while ((cursor = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), cursor)) !== -1) {
    if (bytes.readUInt32LE(cursor + 24) > 1000) bytes.writeUInt32LE(16, cursor + 24);
    cursor += 46;
  }
  await assert.rejects(readDocument('forged.docx', bytes), { status: 422 });
});
test('TXT rejects invalid UTF-8 and supports Vietnamese BOM', async () => {
  assert.equal((await readDocument('case.txt', Buffer.from('\ufeffTờ trình\nDòng hai'))).segments.length, 2);
  await assert.rejects(readDocument('case.txt', Uint8Array.from([0xff, 0xfe])), { status: 422 });
});
test('Node SQLite reads existing payload schema and updates list projections transactionally', () => {
  const db = openDemoDatabase(':memory:');
  try {
    const payload = {
      id: identity,
      name: 'Dự án Điện Biên',
      revision: 1,
      documents: [{}],
      workflow: { assigneeId: identity },
    };
    db.prepare('insert into cases values(?,?,?)').run(identity, 1, JSON.stringify(payload));
    const row = db
      .prepare('select name,documentCount,assigneeId,procedure from case_summaries where id=?')
      .get(identity);
    assert.deepEqual({ ...row }, { name: payload.name, documentCount: 1, assigneeId: identity, procedure: 'bcnckt' });
    assert.equal(
      db.prepare("select normalize_search('Sở Xây dựng Điện Biên') as value").get()?.value,
      'so xay dung dien bien',
    );
    db.prepare('delete from cases where id=?').run(identity);
    assert.equal(db.prepare('select count(*) as n from case_summaries').get()?.n, 0);
  } finally {
    db.close();
  }
});

test('OpenAI provider refuses truncated output, validates schema and disables storage', async () => {
  const keys = ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL'] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-not-a-real-key',
    OPENAI_MODEL: 'configured-model',
  });
  try {
    const request = {
      prompt: 'Test',
      content: 'No private documents',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    };
    const transport = ((_: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.store, false);
      assert.equal(init.redirect, 'error');
      return Promise.resolve(
        Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }),
      );
    }) as typeof fetch;
    assert.deepEqual(await generate(request, transport), { ok: true });
    await assert.rejects(generate(request, (async () => Response.json({ status: 'incomplete' })) as typeof fetch), {
      status: 503,
    });
    await assert.rejects(
      generate(request, (async () =>
        Response.json({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: '{"ok":"true"}' }] }],
        })) as typeof fetch),
      { status: 503 },
    );
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

async function withServer(app: Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}
test('native worker rejects missing gateway credentials', async () => {
  await withServer(createWorkerApp('test-internal-secret'), async (base) => {
    const response = await fetch(base + '/v1/runtime');
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
test('serverless gateway allows runtime discovery but blocks raw worker routes, foreign origins and local test login', async () => {
  const prior = process.env.APPRAISAL_MODE;
  process.env.APPRAISAL_MODE = 'cloud';
  try {
    await withServer(
      createServerlessGateway({ secret: 'test-internal-secret', origins: ['https://example.test'] }),
      async (base) => {
        const response = await fetch(base + '/api/appraisal/runtime', {
          headers: { 'x-internal-token': 'spoofed', 'x-local-test-login': 'true' },
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          mode: 'cloud',
          environment: 'staging',
          authenticationRequired: true,
        });
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal((await fetch(base + '/v1/runtime')).status, 404);
        assert.equal((await fetch(base + '/api/appraisal/test-login')).status, 404);
        assert.equal((await fetch(base + '/api/appraisal/docs')).status, 404);
        assert.equal(
          (await fetch(base + '/api/appraisal/runtime', { headers: { Origin: 'https://foreign.test' } })).status,
          403,
        );
        assert.equal((await fetch(base + '/api/appraisal/runtime', { method: 'PUT' })).status, 405);
        assert.equal((await fetch(base + '/api/appraisal/health')).status, 401);
      },
    );
  } finally {
    if (prior === undefined) delete process.env.APPRAISAL_MODE;
    else process.env.APPRAISAL_MODE = prior;
  }
});
test('BIM construction norms use Vietnamese accent-insensitive search and preserve the 25-result cap', () => {
  const result = norms('be tong');
  assert.ok(result.total > 25);
  assert.equal(result.items.length, 25);
  assert.ok(result.items.every((item) => item.resourceCount > 0));
  assert.equal(norms('a-random-unmatched-code-123456789').total, 0);
});
test('native API creates a dossier, uploads and reopens its original, extracts facts and rejects stale writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'appraisal-node-http-'));
  const previous = { mode: process.env.APPRAISAL_MODE, data: process.env.APPRAISAL_DATA_DIR };
  process.env.APPRAISAL_MODE = 'demo';
  process.env.APPRAISAL_DATA_DIR = dir;
  try {
    await withServer(createWorkerApp('test-internal-secret'), async (base) => {
      async function request(path: string, method = 'GET', value?: unknown) {
        const response = await fetch(base + '/v1' + path, {
          method,
          headers: { 'x-internal-token': 'test-internal-secret', 'Content-Type': 'application/json' },
          body: value === undefined ? undefined : JSON.stringify(value),
        });
        const data = (response.headers.get('content-type') || '').includes('application/json')
          ? await response.json()
          : Buffer.from(await response.arrayBuffer());
        return { status: response.status, data };
      }
      const invalid = await request('/cases', 'POST', {
        name: 'Dự án',
        province: 'Điện Biên',
        legalDate: 'not-a-date',
      });
      assert.equal(invalid.status, 422);
      const created = await request('/cases', 'POST', {
        name: 'Hồ sơ kiểm thử API Node',
        province: 'Điện Biên',
        legalDate: '2026-10-01',
      });
      assert.equal(created.status, 200);
      const id = created.data.id;
      const original = Buffer.from('Tên dự án: Công trình kiểm thử\nTổng mức đầu tư: 123.456.789 VNĐ');
      const uploaded = await request(`/cases/${id}/documents`, 'POST', {
        revision: 1,
        requirementId: 'TTR',
        name: 'to-trinh.txt',
        contentBase64: original.toString('base64'),
      });
      assert.equal(uploaded.status, 200);
      assert.equal(uploaded.data.revision, 2);
      assert.equal(uploaded.data.facts.find((fact: { key: string }) => fact.key === 'total').value, '123456789');
      const file = await request(`/cases/${id}/documents/${uploaded.data.documents[0].id}`);
      assert.equal(file.status, 200);
      assert.deepEqual(file.data, original);
      const reopened = await request(`/cases/${id}`);
      assert.equal(reopened.data.documents.length, 1);
      const stale = await request(`/cases/${id}/requirements`, 'POST', {
        revision: 1,
        name: 'Hồ sơ bổ sung',
        category: 'Pháp lý',
      });
      assert.equal(stale.status, 409);
      const listed = await request('/submissions?search=kiem%20thu');
      assert.equal(listed.status, 200);
      assert.equal(listed.data.total, 1);
      const started = await request(`/cases/${id}/analysis`, 'POST', { revision: 2, mode: 'intake', useModel: false });
      assert.equal(started.status, 200);
      await waitForLocalJobs();
      const analyzed = await request(`/cases/${id}`);
      assert.equal(analyzed.data.job.status, 'completed');
      assert.ok(analyzed.data.runs[0].findings.length > 0);
      assert.equal(analyzed.data.runs[0].provider, 'deterministic');
      const originalFetch = globalThis.fetch;
      const envKeys = ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL'] as const;
      const envBefore = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
      Object.assign(process.env, {
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-not-a-real-key',
        OPENAI_MODEL: 'configured-model',
      });
      let aiCalls = 0;
      globalThis.fetch = (async (url, init) => {
        if (String(url) === 'https://api.openai.com/v1/responses') {
          aiCalls++;
          return Response.json({
            status: 'completed',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({ lines: ['Tổng mức đầu tư: 123.456.789 VNĐ'], illegible: false }),
                  },
                ],
              },
            ],
          });
        }
        return originalFetch(url, init);
      }) as typeof fetch;
      try {
        const scanned = await PDFDocument.create();
        for (let i = 0; i < 4; i++) scanned.addPage([595.28, 841.89]);
        const sourcePdf = Buffer.from(await scanned.save());
        const pdfUpload = await request(`/cases/${id}/documents`, 'POST', {
          revision: analyzed.data.revision,
          requirementId: 'TTR',
          name: 'scan.pdf',
          contentBase64: sourcePdf.toString('base64'),
        });
        assert.equal(pdfUpload.status, 200);
        const pdfId = pdfUpload.data.documents.at(-1).id;
        const ocr = await request(`/cases/${id}/documents/${pdfId}/ocr`, 'POST', { revision: pdfUpload.data.revision });
        assert.equal(ocr.status, 200);
        let result = ocr;
        const deadline = Date.now() + 8000;
        do {
          await waitForLocalJobs();
          result = await request(`/cases/${id}`);
          if (result.data.job.status === 'completed') break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        } while (Date.now() < deadline);
        assert.equal(result.data.job.status, 'completed');
        assert.equal(aiCalls, 4, 'Checkpointed pages must not be sent to AI twice after continuation.');
        const document = result.data.documents.find((entry: { id: string }) => entry.id === pdfId);
        assert.equal(document.segments.length, 4);
        assert.equal(document.ocrProvenance.length, 4);
        assert.ok(
          result.data.facts
            .filter((entry: { documentId: string }) => entry.documentId === pdfId)
            .every((entry: { reviewStatus: string }) => entry.reviewStatus === 'pending'),
        );
        assert.deepEqual((await request(`/cases/${id}/documents/${pdfId}`)).data, sourcePdf);
        await processJob(result.data.job.id);
        assert.equal(
          (await request(`/cases/${id}`)).data.revision,
          result.data.revision,
          'Repeated queue delivery must not save the result again.',
        );
        await waitForLocalJobs();
      } finally {
        globalThis.fetch = originalFetch;
        for (const key of envKeys) {
          if (envBefore[key] === undefined) delete process.env[key];
          else process.env[key] = envBefore[key];
        }
      }
    });
  } finally {
    for (const [key, value] of [
      ['APPRAISAL_MODE', previous.mode],
      ['APPRAISAL_DATA_DIR', previous.data],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
    assert.equal(realpathSync(dirname(dir)), realpathSync(tmpdir()));
    assert.ok(basename(dir).startsWith('appraisal-node-http-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
