import { createClient } from '@supabase/supabase-js';

// Các biến môi trường Supabase: được cấu hình trong file .env hoặc .env.local
const env = (import.meta as any).env || {};
const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || '';

const rememberKey = 'buildappraisal-remember-session';
export const remembersSession = () => localStorage.getItem(rememberKey) !== 'false';
export const setRememberSession = (remember: boolean) => localStorage.setItem(rememberKey, String(remember));
const authStorage = {
  getItem: (key: string) => sessionStorage.getItem(key) ?? localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const target = remembersSession() ? localStorage : sessionStorage;
    const other = remembersSession() ? sessionStorage : localStorage;
    other.removeItem(key);
    target.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

// Tạo client Supabase duy nhất cho toàn bộ ứng dụng
export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'local-demo-placeholder',
  {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: 'public',
    },
  },
);

// Helper kiểm tra xem Supabase đã được kết nối hay đang chạy chế độ Mock Local
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co');
};
