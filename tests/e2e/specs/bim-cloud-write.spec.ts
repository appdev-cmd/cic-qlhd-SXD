import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

test.use({ trace: 'off' });
test('authenticated cloud IFC upload and saved viewpoint survive a full reload', async ({ page, request }) => {
  test.skip(process.env.E2E_ENABLE_CLOUD_WRITES !== '1', 'Explicit opt-in required for real BIM writes.');
  test.setTimeout(420000);
  const root = resolve(process.cwd(), '../..');
  const privateConfig = process.env.APPRAISAL_CONFIG_FILE || resolve(homedir(), '.config/buildappraisal/runtime.env');
  const env = Object.fromEntries(
    [resolve(root, '.env'), resolve(root, '.env.local'), privateConfig]
      .filter(existsSync)
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/),
      )
      .flatMap((line) => {
        const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
        return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
      }),
  );
  const accounts = JSON.parse(
    readFileSync(
      process.env.APPRAISAL_TEST_ACCOUNTS_FILE || resolve(homedir(), '.config/buildappraisal/test-accounts.json'),
      'utf8',
    ),
  );
  const account = accounts.accounts.find((value: { role: string }) => value.role === 'officer');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  expect(new URL(url).hostname.split('.')[0]).toBe(accounts.projectRef);
  const login = await request.post(url + '/auth/v1/token?grant_type=password', {
    headers: { apikey: key },
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  const headers = { apikey: key, Authorization: 'Bearer ' + session.access_token };
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('BrowserIfcConverter')) console.error(message.text());
  });
  await page.addInitScript(
    ({ ref, session }) => {
      sessionStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
      localStorage.setItem('buildappraisal-remember-session', 'false');
    },
    { ref: accounts.projectRef, session },
  );
  const project = '4ef3f2aa-481f-44e2-8774-6aa0282cfe49';
  const nonce = String(Date.now());
  const filename = `CIC_E2E_STR_${nonce}.ifc`;
  const viewName = `E2E BIM ${nonce}`;
  let modelId: string | undefined;
  let viewId: string | undefined;
  const models = async () => {
    const response = await request.get(url + '/rest/v1/bim_models', {
      headers,
      params: {
        project_id: 'eq.' + project,
        file_name: 'eq.' + filename,
        select: 'id,status,element_count,frag_path,ifc_path,error_message',
        deleted_at: 'is.null',
      },
    });
    expect(response.status()).toBe(200);
    return response.json();
  };
  try {
    await page.goto('/bim');
    await expect(page.getByRole('button', { name: 'Tải IFC', exact: true })).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: 'Tải IFC', exact: true }).click();
    const bytes = readFileSync(
      resolve(root, 'public/bim/demo/files/1377ad57-a15b-4e0b-bad8-c4b8516eaf91.ifc'),
      'utf8',
    ).replace('ISO-10303-21;', `ISO-10303-21;\n/* E2E ${nonce} */`);
    await page
      .locator('input[type=file][accept*=".ifc"]')
      .setInputFiles({ name: filename, mimeType: 'application/x-step', buffer: Buffer.from(bytes) });
    const start = page.getByRole('button', { name: 'Bắt đầu chuyển đổi', exact: true });
    await expect(start).toBeEnabled({ timeout: 60000 });
    await start.click();
    await expect
      .poll(
        async () => {
          const rows = await models();
          modelId = rows[0]?.id;
          return rows[0]?.status;
        },
        { timeout: 180000, intervals: [1000, 3000] },
      )
      .toBe('ready');
    const persisted = (await models())[0];
    expect(persisted.element_count).toBeGreaterThan(0);
    expect(persisted.frag_path).toBeTruthy();
    await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
    await page.reload();
    await expect(page.getByText(filename, { exact: false }).first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-bim-loaded-count]')).not.toHaveAttribute('data-bim-loaded-count', '0', {
      timeout: 180000,
    });
    await page.locator('button[data-tooltip="Góc nhìn đã lưu"]').click();
    await page.getByRole('textbox', { name: 'Tên góc nhìn mới', exact: true }).fill(viewName);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    const views = async () => {
      const response = await request.get(url + '/rest/v1/bim_saved_views', {
        headers,
        params: { project_id: 'eq.' + project, name: 'eq.' + viewName, select: 'id,name,state' },
      });
      expect(response.status()).toBe(200);
      return response.json();
    };
    await expect
      .poll(async () => {
        const rows = await views();
        viewId = rows[0]?.id;
        return rows.length;
      })
      .toBe(1);
    expect((await views())[0].state).toBeTruthy();
    await page.reload();
    await page.locator('button[data-tooltip="Góc nhìn đã lưu"]').click();
    await expect(page.getByText(viewName, { exact: true }).first()).toBeVisible({ timeout: 60000 });
    expect((await models())[0].element_count).toBe(persisted.element_count);
    await page.screenshot({ path: resolve(root, 'output/appraisal/qa/bim-cloud-write.png'), fullPage: true });
  } finally {
    if (viewId) {
      const response = await request.delete(url + '/rest/v1/bim_saved_views', {
        headers,
        params: { id: 'eq.' + viewId, name: 'eq.' + viewName },
      });
      expect(response.ok()).toBeTruthy();
    }
    if (modelId) {
      const admin = accounts.accounts.find((value: { role: string }) => value.role === 'admin');
      const cleanupLogin = await request.post(url + '/auth/v1/token?grant_type=password', {
        headers: { apikey: key },
        data: { email: admin.email, password: admin.password },
      });
      expect(cleanupLogin.status()).toBe(200);
      const cleanupHeaders = { apikey: key, Authorization: 'Bearer ' + (await cleanupLogin.json()).access_token };
      const response = await request.post(url + '/rest/v1/rpc/bim_delete_model', {
        headers: cleanupHeaders,
        data: { p_id: modelId },
      });
      expect(response.ok()).toBeTruthy();
    }
  }
});
