import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Router } from 'express';
import { actorFor, remote, runtimeMode } from './auth.js';
import { HttpError } from './errors.js';
import { body } from './validation.js';
const labels: Record<string, [string, string]> = {
  officer: ['Chuyên viên', 'Tiếp nhận và xử lý hồ sơ'],
  head_of_department: ['Trưởng phòng', 'Rà soát và mở lại hồ sơ'],
  director: ['Lãnh đạo Sở', 'Rà soát kết quả theo thẩm quyền'],
  admin: ['Quản trị', 'Quản lý dữ liệu thử nghiệm'],
};
function accounts() {
  if (
    process.env.VERCEL ||
    process.env.APPRAISAL_ENVIRONMENT !== 'staging' ||
    process.env.APPRAISAL_ENABLE_TEST_LOGIN !== 'true' ||
    runtimeMode() !== 'cloud'
  )
    return [];
  try {
    const data = JSON.parse(
      readFileSync(
        process.env.APPRAISAL_TEST_ACCOUNTS_FILE || resolve(homedir(), '.config/buildappraisal/test-accounts.json'),
        'utf8',
      ),
    );
    if (
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '') !==
      `https://${data.projectRef}.supabase.co`
    )
      return [];
    return (data.accounts as Array<{ role: string; email: string; password: string; user_id: string }>).filter((a) =>
      Object.hasOwn(labels, a.role),
    );
  } catch {
    return [];
  }
}
export function testLoginRouter() {
  const router = Router();
  router.use((req, _res, next) => {
    if (
      process.env.VERCEL ||
      req.get('x-local-test-login') !== 'true' ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
    )
      throw new HttpError(404, 'Đăng nhập thử nghiệm đang tắt.');
    next();
  });
  router.get('/accounts', (_req, res) =>
    res.json({
      accounts: accounts().map((a) => ({ role: a.role, label: labels[a.role][0], description: labels[a.role][1] })),
    }),
  );
  router.post('/', async (req, res) => {
    const input = body('TestLogin', req.body);
    const account = accounts().find((a) => a.role === input.role);
    if (!account) throw new HttpError(404, 'Đăng nhập thử nghiệm đang tắt hoặc vai trò không được cấu hình.');
    const response = await remote('/auth/v1/token?grant_type=password', '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    if (!response.ok) throw new HttpError(503, 'Chưa đăng nhập được tài khoản thử nghiệm.');
    const session = await response.json();
    const actor = await actorFor('Bearer ' + session.access_token);
    if (actor.id !== account.user_id || actor.role !== input.role || !session.user?.app_metadata?.staging_test_account)
      throw new HttpError(403, 'Tài khoản không khớp cấu hình thử nghiệm.');
    res.json({ access_token: session.access_token, refresh_token: session.refresh_token });
  });
  return router;
}
