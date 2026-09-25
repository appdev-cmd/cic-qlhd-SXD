import { createClient } from '@supabase/supabase-js';

// Các biến môi trường Supabase: được cấu hình trong file .env hoặc .env.local
const env = (import.meta as any).env || {};
const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || '';

// Tạo client Supabase duy nhất cho toàn bộ ứng dụng
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
});

// Helper kiểm tra xem Supabase đã được kết nối hay đang chạy chế độ Mock Local
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co');
};
