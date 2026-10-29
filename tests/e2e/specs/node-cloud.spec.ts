import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

test.use({ trace: 'off' });
test('Vercel Node backend uploads an original, performs real AI OCR, saves facts, analyses and reopens A4 exports', async ({
  request,
}) => {
  test.skip(process.env.E2E_ENABLE_CLOUD_WRITES !== '1', 'Explicit opt-in for live API and AI writes.');
  test.setTimeout(420000);
  const base = new URL(String(test.info().project.use.baseURL));
  if (process.env.E2E_VERCEL_SHARE_TOKEN) {
    expect(base.hostname).toBe(process.env.E2E_VERCEL_SHARE_HOST);
    const access = await request.get(
      base.origin +
        '/api/appraisal/runtime?' +
        new URLSearchParams({ _vercel_share: process.env.E2E_VERCEL_SHARE_TOKEN }),
      { maxRedirects: 0, headers: { 'x-vercel-set-bypass-cookie': 'true' } },
    );
    expect([200, 301, 302, 307, 308]).toContain(access.status());
  }
  const root = resolve(process.cwd(), '../..');
  const config = process.env.APPRAISAL_CONFIG_FILE || resolve(homedir(), '.config/buildappraisal/runtime.env');
  const env = Object.fromEntries(
    [resolve(root, '.env'), resolve(root, '.env.local'), config]
      .filter(existsSync)
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/),
      )
      .flatMap((line) => {
        const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
        return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
      }),
  );
  const accounts = JSON.parse(readFileSync(resolve(homedir(), '.config/buildappraisal/test-accounts.json'), 'utf8'));
  const account = accounts.accounts.find((a: { role: string }) => a.role === 'officer');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  expect(new URL(url).hostname.split('.')[0]).toBe(accounts.projectRef);
  const login = await request.post(url + '/auth/v1/token?grant_type=password', {
    headers: { apikey: key },
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  const headers = { Authorization: 'Bearer ' + session.access_token };
  const api = base.origin + '/api/appraisal';
  const ready = await request.get(api + '/readiness', { headers, maxRedirects: 0 });
  expect(ready.status()).toBe(200);
  expect((await ready.json()).ocrAvailable).toBe(true);
  const created = await request.post(api + '/cases', {
    headers,
    data: {
      name: 'KIỂM THỬ NODE AI OCR ' + new Date().toISOString(),
      province: 'Điện Biên',
      legalDate: '2026-10-01',
      projectId: '01e900c5-02a9-410f-828f-7fb9db099157',
      procedure: 'bcnckt',
    },
  });
  expect(created.status()).toBe(200);
  let value = await created.json();
  const output = resolve(root, 'output/appraisal/qa');
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(output, 'node-cloud-created.json'),
    JSON.stringify({ caseId: value.id, name: value.name, projectId: value.projectId }),
  );
  console.log('Node cloud: dossier created through authenticated API.');
  const png = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="600"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="48" fill="black"><text x="70" y="150">CIC NODE AI OCR TEST</text><text x="70" y="250">Document code: TEST-12345</text><text x="70" y="350">Total investment: 123456789 VND</text><text x="70" y="450">Test data only. Not a real submission.</text></g></svg>',
    ),
  )
    .png()
    .toBuffer();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 20, y: 450, width: 555, height: 238 });
  const original = Buffer.from(await pdf.save());
  const hash = createHash('sha256').update(original).digest('hex');
  const prepare = await request.post(api + `/cases/${value.id}/uploads`, {
    headers,
    data: {
      revision: value.revision,
      requirementId: 'TTR',
      name: 'node-ai-ocr-scan.pdf',
      size: original.length,
      sha256: hash,
      role: 'submission',
    },
  });
  expect(prepare.status()).toBe(200);
  const upload = await prepare.json();
  const sent = await request.put(
    url +
      '/storage/v1/object/upload/sign/appraisal-originals/' +
      upload.path +
      '?' +
      new URLSearchParams({ token: upload.token }),
    { headers: { apikey: key, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, data: original },
  );
  expect(sent.ok()).toBe(true);
  const finalize = await request.post(api + `/cases/${value.id}/uploads/${upload.id}/finalize`, { headers });
  expect(finalize.status(), finalize.status() === 200 ? '' : (await finalize.json()).detail).toBe(200);
  value = await finalize.json();
  expect(value.documents[0].hash).toBe(hash);
  expect(value.documents[0].segments).toHaveLength(0);
  const ocr = await request.post(api + `/cases/${value.id}/documents/${upload.id}/ocr`, {
    headers,
    data: { revision: value.revision },
  });
  expect(ocr.status()).toBe(200);
  value = await ocr.json();
  expect(value.job.engine).toBe('node');
  await expect
    .poll(
      async () => {
        const response = await request.get(api + `/cases/${value.id}/progress`, { headers });
        expect(response.status()).toBe(200);
        return (await response.json()).job?.status;
      },
      { timeout: 270000, intervals: [2000, 5000] },
    )
    .toBe('completed');
  value = await (await request.get(api + `/cases/${value.id}`, { headers })).json();
  const text = value.documents[0].segments.map((s: { text: string }) => s.text).join('\n');
  expect(text).toContain('TEST-12345');
  expect(text.replace(/[.,\s]/g, '')).toContain('123456789');
  expect(value.documents[0].hash).toBe(hash);
  const downloaded = await request.get(api + `/cases/${value.id}/documents/${upload.id}`, { headers });
  expect(
    createHash('sha256')
      .update(await downloaded.body())
      .digest('hex'),
  ).toBe(hash);
  console.log('Node cloud: real scan AI OCR completed through Vercel Queue; original SHA-256 preserved.');
  const analysis = await request.post(api + `/cases/${value.id}/analysis`, {
    headers,
    data: { revision: value.revision, mode: 'intake', useModel: false },
  });
  expect(analysis.status()).toBe(200);
  await expect
    .poll(
      async () => {
        const response = await request.get(api + `/cases/${value.id}/progress`, { headers });
        return (await response.json()).job?.status;
      },
      { timeout: 90000, intervals: [2000] },
    )
    .toBe('completed');
  value = await (await request.get(api + `/cases/${value.id}`, { headers })).json();
  expect(value.runs.length).toBe(1);
  expect(value.audit.some((a: { action: string }) => a.action === 'Hoàn tất AI OCR')).toBe(true);
  for (const format of ['pdf', 'docx']) {
    const exported = await request.get(api + `/cases/${value.id}/internal-record/${format}`, {
      headers,
      timeout: 60000,
    });
    expect(exported.status()).toBe(200);
    const bytes = await exported.body();
    expect(bytes.length).toBeGreaterThan(1000);
    if (format === 'pdf') {
      const result = await PDFDocument.load(bytes);
      expect(result.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
      expect(result.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
    }
    writeFileSync(resolve(output, 'node-cloud-record.' + format), bytes);
  }
  const dashboard = await request.get(api + '/dashboard', { headers });
  expect(dashboard.status()).toBe(200);
  console.log('Node cloud: persisted analysis, audit, dashboard, PDF and DOCX reopen successfully.');
});
