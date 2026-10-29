import { createHash } from 'node:crypto';
import { HttpError } from './errors.js';

export interface Actor {
  id: string;
  name: string;
  tenantId: string;
  department: string;
  role: string;
}

export const DEMO_ACTOR: Readonly<Actor> = Object.freeze({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Chuyên viên mẫu',
  tenantId: 'demo',
  department: 'Phòng thẩm định mẫu',
  role: 'officer',
});

export function runtimeMode(): 'demo' | 'cloud' {
  const mode = process.env.APPRAISAL_MODE || (process.env.VERCEL ? 'cloud' : 'demo');
  if (mode === 'supabase' || mode === 'cloud') return 'cloud';
  if (mode !== 'demo' || process.env.VERCEL) throw new Error('Invalid appraisal runtime mode.');
  return 'demo';
}

export async function remote(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new HttpError(503, 'Thiếu cấu hình Supabase phía máy chủ.');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Supabase path.');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', token);
  let response: Response;
  try {
    response = await fetch(base.replace(/\/$/, '') + path, {
      ...init,
      headers,
      redirect: 'error',
      signal: init.signal || AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError(503, 'Không thể kết nối dữ liệu Supabase.');
  }
  if (!response.ok) {
    throw new HttpError(
      response.status === 409 ? 409 : [401, 403].includes(response.status) ? 403 : 503,
      'Không thể truy cập dữ liệu Supabase. Kiểm tra quyền và migration.',
    );
  }
  return response;
}

const actors = new Map<string, { until: number; actor: Actor }>();

function expiry(token: string): number {
  try {
    const value = JSON.parse(Buffer.from(token.slice(7).split('.')[1], 'base64url').toString()).exp;
    return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Auth verifies the token; the decoded expiry only shortens the cache lifetime. */
export async function actorFor(token: string): Promise<Actor> {
  if (runtimeMode() === 'demo') return { ...DEMO_ACTOR };
  if (!/^Bearer [^\s]+$/.test(token)) throw new HttpError(401, 'Vui lòng đăng nhập bằng tài khoản được phân quyền.');
  const key = createHash('sha256').update(token).digest('hex');
  const cached = actors.get(key);
  const now = Date.now();
  if (cached && cached.until > now) return { ...cached.actor };
  const user = (await (await remote('/auth/v1/user', token)).json()) as { id: string };
  const params = new URLSearchParams({
    id: `eq.${user.id}`,
    select: 'id,full_name,role,province_id,department,is_active',
    limit: '1',
  });
  const rows = (await (await remote(`/rest/v1/profiles?${params}`, token)).json()) as Array<{
    id: string;
    full_name: string;
    role: string;
    province_id: string;
    department: string;
    is_active: boolean;
  }>;
  const p = rows[0];
  if (!p?.is_active || !p.province_id || !p.department)
    throw new HttpError(403, 'Tài khoản chưa được gán tỉnh, phòng ban hoặc đang ngừng hoạt động.');
  const actor: Actor = { id: p.id, name: p.full_name, tenantId: p.province_id, department: p.department, role: p.role };
  const ttl = Math.max(0, Math.min(60, Number(process.env.APPRAISAL_ACTOR_CACHE_SECONDS || 60)));
  const until = Math.min(now + ttl * 1000, expiry(token));
  if (actors.size > 2000) actors.clear();
  if (until > now) actors.set(key, { until, actor });
  return { ...actor };
}

export function writable(actor: Actor): void {
  if (!['officer', 'head_of_department', 'director', 'admin'].includes(actor.role)) {
    throw new HttpError(403, 'Tài khoản không có quyền sửa hồ sơ.');
  }
}

export function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
