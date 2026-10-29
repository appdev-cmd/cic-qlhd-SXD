// features/bim/lib/savedViewsApi.ts
// Đọc một góc nhìn theo mã (liên kết chia sẻ) và cập nhật góc nhìn (trạng thái, ảnh, thẻ).
// Quyền do RLS bim_saved_views quyết định: đọc theo bim_accessible_project_ids, sửa theo bim_writable_project_ids.

import { supabase } from '@/features/bim-suite/adapters/supabase';
import type { BimSavedView, BimViewpoint } from '@/features/bim-suite/types/bim.types';

export interface SavedViewPatch {
  name?: string;
  state?: BimViewpoint;
  thumbnail_url?: string | null;
  tags?: string[];
}

export const fetchSavedView = async (id: string): Promise<BimSavedView | null> => {
  const { data, error } = await (supabase as any).from('bim_saved_views').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Không đọc được góc nhìn: ${error.message}`);
  return (data as BimSavedView) ?? null;
};

export const updateSavedView = async (id: string, patch: SavedViewPatch): Promise<BimSavedView> => {
  const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await (supabase as any)
    .from('bim_saved_views')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Không cập nhật được góc nhìn: ${error.message}`);
  // RLS chặn ghi trả về 0 dòng thay vì lỗi
  if (!data) throw new Error('Bạn không có quyền sửa góc nhìn này hoặc góc nhìn đã bị xoá.');
  return data as BimSavedView;
};
