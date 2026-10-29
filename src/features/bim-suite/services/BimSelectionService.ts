import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/services/BimSelectionService.ts
// Lọc cấu kiện ở máy chủ cho bộ chọn thông minh (nhóm HOẶC) và chọn nhanh (facet đếm bằng GROUP BY).
// Kết quả RPC đọc theo trang (range) để không bị PostgREST cắt ở giới hạn số dòng mỗi phản hồi.

import { supabase } from '@/features/bim-suite/adapters/supabase';
import type { BimElementRef } from '@/features/bim-suite/types/bim.types';
import { rpcConditions, type ConditionGroups } from '../lib/smartSets';

const db = supabase as any;
const PAGE = 1000;
const MAX_ROWS = 200_000;

/** Đọc hết kết quả một RPC trả tập dòng theo trang 1.000 dòng (hàm đã sắp xếp ổn định) */
export async function readRpcPages<T>(fn: string, params: Record<string, unknown>, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db.rpc(fn, params).range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (data as T[]) || [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
  throw new Error(`${label}: phạm vi quá lớn (trên ${formatNumber(MAX_ROWS, 2)} cấu kiện), hãy thu hẹp điều kiện.`);
}

export interface QuickSelectParams {
  modelIds: string[];
  projectId: string;
  floors: string[];
  types: string[];
  materials: string[];
  /** progress_id của gói việc tiến độ thi công */
  pkg: string | null;
  nt: 'all' | 'chua' | 'da';
  /** Khóa "model_id|guid" đã nghiệm thu (đạt / đạt có điều kiện) */
  acceptedKeys: string[];
  /** GUID đã nghiệm thu nhưng hồ sơ không gắn mô hình */
  acceptedGuids: string[];
}

export interface QuickSelectFacets {
  floors: [string, number][];
  types: [string, number][];
  materials: [string, number][];
  pkgs: [string, number][];
  total: number;
  accepted: number;
}

const rpcParams = (p: QuickSelectParams) => ({
  p_model_ids: p.modelIds,
  p_tang: p.floors.length ? p.floors : null,
  p_loai: p.types.length ? p.types : null,
  p_vat_lieu: p.materials.length ? p.materials : null,
  p_project: p.projectId,
  p_goi: p.pkg || null,
  p_nt: p.nt,
  p_nt_keys: p.acceptedKeys.length ? p.acceptedKeys : null,
  p_nt_guids: p.acceptedGuids.length ? p.acceptedGuids : null,
});

/** Gom các dòng facet của RPC thành từng nhóm */
export function facetsFromRows(
  rows: { nhom: string; gia_tri: string | null; so_luong: number | string }[],
): QuickSelectFacets {
  const f: QuickSelectFacets = { floors: [], types: [], materials: [], pkgs: [], total: 0, accepted: 0 };
  for (const r of rows) {
    const n = Number(r.so_luong) || 0;
    if (r.nhom === 'tang') f.floors.push([r.gia_tri ?? '', n]);
    else if (r.nhom === 'loai') f.types.push([r.gia_tri ?? '', n]);
    else if (r.nhom === 'vat_lieu') f.materials.push([r.gia_tri ?? '', n]);
    else if (r.nhom === 'goi') f.pkgs.push([r.gia_tri ?? '', n]);
    else if (r.nhom === 'tong') f.total = n;
    else if (r.nhom === 'da_nt') f.accepted = n;
  }
  return f;
}

export const BimSelectionService = {
  /** Lọc theo bộ chọn nhiều nhóm (HOẶC giữa nhóm, VÀ trong nhóm) */
  filterGroups: (modelIds: string[], groups: ConditionGroups): Promise<BimElementRef[]> =>
    modelIds.length && groups.length
      ? readRpcPages<BimElementRef>(
          'bim_loc_cau_kien',
          { p_model_ids: modelIds, p_dieu_kien: rpcConditions(groups), p_gioi_han: MAX_ROWS },
          'Lỗi lọc cấu kiện',
        )
      : Promise.resolve([]),

  /** Facet chọn nhanh (tầng / loại / vật liệu / gói việc) tính ở máy chủ */
  async quickSelectFacets(p: QuickSelectParams): Promise<QuickSelectFacets> {
    if (!p.modelIds.length) return facetsFromRows([]);
    // Số nhóm facet nhỏ (tầng, loại, vật liệu, gói việc) nên một phản hồi là đủ; vẫn đọc theo trang cho chắc
    const rows = await readRpcPages<{ nhom: string; gia_tri: string | null; so_luong: number }>(
      'bim_chon_nhanh_facet',
      rpcParams(p),
      'Lỗi đếm cấu kiện',
    );
    return facetsFromRows(rows);
  },

  /** Cấu kiện thỏa mọi điều kiện chọn nhanh (để chọn / cô lập / nghiệm thu nhóm) */
  quickSelectElements: (p: QuickSelectParams) =>
    p.modelIds.length
      ? readRpcPages<{ model_id: string; express_id: number; global_id: string; da_nt: boolean }>(
          'bim_chon_nhanh_cau_kien',
          rpcParams(p),
          'Lỗi đọc cấu kiện đã chọn',
        )
      : Promise.resolve([]),
};
