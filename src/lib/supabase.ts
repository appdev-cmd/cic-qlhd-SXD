import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env;
const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || '';

const PLACEHOLDER_URL = 'https://your-project.supabase.co';

export const isSupabaseConfigured = (): boolean =>
  Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== PLACEHOLDER_URL);

/**
 * Mã cán bộ đang thao tác — gửi kèm mọi request qua header `x-actor-id`
 * để trigger audit_logs ở DB ghi nhận đúng người thực hiện.
 */
let currentActorId = 'system';

export function setCurrentActorId(actorId: string) {
  currentActorId = actorId || 'system';
}

const actorFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('x-actor-id', currentActorId);
  return fetch(input, { ...init, headers });
};

/** Client Supabase duy nhất; `null` khi chưa cấu hình (ứng dụng chạy chế độ demo). */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: 'public' },
      global: { fetch: actorFetch },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Chưa cấu hình Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  return supabase;
}
