import { isSupabaseConfigured } from './supabase';

export type DataMode = 'live' | 'demo';

/**
 * Nguồn dữ liệu của ứng dụng:
 * - `live`: đọc/ghi Supabase (mặc định khi đã cấu hình biến môi trường).
 * - `demo`: bộ dữ liệu mẫu offline trong src/data (tải động, không nằm trong bundle chính).
 * Ép chế độ bằng VITE_DATA_MODE=demo|live.
 */
function resolveDataMode(): DataMode {
  const forced = import.meta.env.VITE_DATA_MODE;
  if (forced === 'demo') return 'demo';
  if (forced === 'live' && isSupabaseConfigured()) return 'live';
  return isSupabaseConfigured() ? 'live' : 'demo';
}

export const DATA_MODE: DataMode = resolveDataMode();
export const isDemoMode = DATA_MODE === 'demo';
