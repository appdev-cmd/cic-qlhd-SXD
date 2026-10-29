// features/bim/services/BimClashService.ts
// Dữ liệu phụ cho dò va chạm: cặp đã bỏ qua của dự án (ghi nhớ qua mọi phiên dò trong bim_va_cham)
// và tầng của cấu kiện (cột phan_doan_tang của bim_elements) để gom va chạm theo tầng.

import { supabase } from '@/features/bim-suite/adapters/supabase';
import { readAllRows } from '../lib/readAllRows';
import { guidPairKey } from '../lib/clashGrouping';

const db = supabase as any;

export const BimClashService = {
  /**
   * Cặp GUID đã đánh dấu "bỏ qua" ở bất kỳ phiên nào của dự án.
   * Dò lại (kể cả phiên mới, phiên bản mô hình mới) sẽ tự ẩn các cặp này.
   */
  async getDismissedPairs(projectId: string): Promise<Set<string>> {
    const rows = await readAllRows<{ guid_a: string; guid_b: string }>((from, to, count) =>
      db
        .from('bim_va_cham')
        .select('guid_a,guid_b', count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .eq('trang_thai', 'bo_qua')
        .order('id')
        .range(from, to),
    );
    return new Set(rows.map((r) => guidPairKey(r.guid_a, r.guid_b)).filter(Boolean));
  },

  /** Tầng / phân đoạn của các cấu kiện theo GUID (lô 150 GUID/lần để URL không quá dài) */
  async getStoreysForGuids(modelId: string, guids: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const unique = [...new Set(guids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 150) {
      const slice = unique.slice(i, i + 150);
      const { data, error } = await db
        .from('bim_elements')
        .select('global_id,phan_doan_tang')
        .eq('model_id', modelId)
        .in('global_id', slice)
        .limit(slice.length * 2);
      if (error) throw new Error(`Lỗi đọc tầng của cấu kiện: ${error.message}`);
      for (const r of (data as { global_id: string; phan_doan_tang: string | null }[]) || [])
        out.set(r.global_id, r.phan_doan_tang);
    }
    return out;
  },
};
