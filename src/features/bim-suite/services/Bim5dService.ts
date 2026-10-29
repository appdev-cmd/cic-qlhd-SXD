// 5D quantity groups of the open models with completed quantities from schedule progress (bim_5d_overview), and the
// elements of chosen groups for highlighting (bim_quantity_group_elements). Phase B5, migration 20261027130000.
import { legacyDb } from '../lib/bimDb';
import type { Bim5dGroup } from '../lib/costing';

export interface Bim5dOverview {
  groups: Bim5dGroup[];
  elementTotal: number;
  computedAt: string | null;
}
export interface QuantityGroupKey {
  model_id: string;
  loai_cau_kien: string;
  vat_lieu: string | null;
  phan_doan_tang: string | null;
}
const number = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export type FieldActualState = 'da_nghiem_thu' | 'da_thi_cong' | 'dang_thi_cong' | 'cham' | 'chua_bat_dau';
export interface FieldActualRow {
  model_id: string;
  global_id: string;
  trang_thai: FieldActualState;
}

export const Bim5dService = {
  /** Field progress per element: acceptance first, then the progress of the linked schedule tasks (bim_field_actual). */
  async fieldActual(projectId: string): Promise<FieldActualRow[]> {
    const rows: FieldActualRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await legacyDb
        .rpc('bim_field_actual', { p_project: projectId })
        .order('model_id')
        .order('global_id')
        .range(from, from + 999);
      if (error) throw new Error(`Lỗi tải tiến độ hiện trường: ${error.message}`);
      rows.push(...((data ?? []) as FieldActualRow[]));
      if (!data || data.length < 1000 || rows.length >= 500000) break;
    }
    return rows;
  },
  async overview(projectId: string, modelIds: string[]): Promise<Bim5dOverview> {
    if (!projectId || !modelIds.length) return { groups: [], elementTotal: 0, computedAt: null };
    const { data, error } = await legacyDb.rpc('bim_5d_overview', {
      p_project: projectId,
      p_model_ids: [...new Set(modelIds)].sort(),
    });
    if (error) throw new Error(`Lỗi tổng hợp 5D: ${error.message}`);
    const d = data as { groups?: Bim5dGroup[]; element_total?: number; computed_at?: string } | null;
    const groups = (d?.groups || []).map((g) => ({
      ...g,
      vat_lieu: g.vat_lieu ?? '',
      phan_doan_tang: g.phan_doan_tang ?? '',
      so_luong: Number(g.so_luong) || 0,
      tong_the_tich: number(g.tong_the_tich),
      tong_dien_tich: number(g.tong_dien_tich),
      tong_chieu_dai: number(g.tong_chieu_dai),
      tong_trong_luong: number(g.tong_trong_luong),
      lien_ket_tien_do: Number(g.lien_ket_tien_do) || 0,
    })) as Bim5dGroup[];
    return { groups, elementTotal: Number(d?.element_total) || 0, computedAt: d?.computed_at ?? null };
  },
  async groupElements(groups: QuantityGroupKey[]): Promise<{ modelId: string; expressId: number }[]> {
    if (!groups.length) return [];
    const { data, error } = await legacyDb.rpc('bim_quantity_group_elements', {
      p_groups: groups.map((g) => ({
        model_id: g.model_id,
        loai_cau_kien: g.loai_cau_kien,
        vat_lieu: g.vat_lieu || '',
        phan_doan_tang: g.phan_doan_tang || '',
      })),
    });
    if (error) throw new Error(`Lỗi tìm cấu kiện của nhóm: ${error.message}`);
    return ((data ?? []) as { model_id: string; express_id: number }[]).map((r) => ({
      modelId: String(r.model_id),
      expressId: Number(r.express_id),
    }));
  },
};
