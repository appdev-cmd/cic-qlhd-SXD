'use client';
// Thay lib/supabase và lib/storageAuth của cic-hud. Client trình duyệt của @supabase/ssr là singleton, dùng phiên
// đăng nhập cookie của BuildSIA nên mọi truy vấn đi qua RLS theo người dùng.
// Không dùng Service Worker gắn token như cic-hud: tệp mô hình đọc bằng signed URL ngắn hạn (kế hoạch BIM, mục 2).
import { supabase as client } from '@/lib/supabase';

const tables: Record<string, string> = {
  documents: 'sxd_bim_documents',
  document_versions: 'sxd_bim_document_versions',
  document_projects: 'sxd_bim_projects',
  workspace_tasks: 'sxd_bim_workspace_tasks',
};
export const supabase = new Proxy(client, {
  get(target, property, receiver) {
    if (property === 'from') return (name: string) => target.from(tables[name] || name);
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Signed URL của Supabase đã mang token; giữ hàm để mã gốc không đổi. */
export const withStorageApiKey = (url: string) => url;
