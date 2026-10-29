import { bimDb, bimRpc, legacyDb } from '../lib/bimDb';
import { boundedFromRpc, readAllRows, type BoundedList } from '../lib/readAllRows';
import type { BoqItem, BoqMappingSummary } from '../lib/boqReconciliation';
import type { BimCostUnit } from '@/features/bim-suite/types/bim.types';

export interface Boq5dItem extends BoqItem {
  thanh_tien: number | null;
  gia_tri_nghiem_thu: number | null;
}
/** Dòng BOQ kèm ánh xạ mô hình và phần đo bóc đã gộp ở máy chủ (bim_boq_overview). */
export interface BoqOverviewItem extends Boq5dItem {
  mapping: (BoqMappingSummary & { id: string; model_id: string }) | null;
}
export interface BoqFacet {
  loai_cau_kien: string;
  phan_doan_tang: string | null;
  so_luong: number;
}
export interface BoqMappingInput {
  project_id: string;
  boq_id: string;
  model_id: string;
  /** Bộ lọc nguồn: loại cấu kiện / tầng (trống = mọi loại / mọi tầng); máy chủ tự tính tập GUID */
  category: string | null;
  floor: string | null;
  unit: BimCostUnit;
  coefficient: number;
  task_id: string | null;
}

/** Element ↔ BOQ line matched by IFC classification code (bim_field_match_boq). */
export interface BoqCodeMatch {
  model_id: string;
  global_id: string;
  ma_boq: string;
  code: string;
  name: string;
  unit: string;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
type Result<T> = PromiseLike<{ data: T[] | null; count?: number | null; error: { message: string } | null }>;

export const BimBoqService = {
  /** Contracts of the project (bim_contracts, small reference list). */
  contracts: (project: string) =>
    readAllRows<{ ma_hop_dong: string; ten_hop_dong: string; trang_thai: string }>(async (from, to, count) => {
      const {
        data,
        error,
        count: total,
      } = await legacyDb
        .from('bim_contracts')
        .select('id, so_hop_dong, ten, trang_thai', count ? { count: 'exact' } : undefined)
        .eq('project_id', project)
        .order('so_hop_dong')
        .range(from, to);
      const rows = ((data ?? []) as { id: string; so_hop_dong: string; ten: string; trang_thai: string }[]).map(
        (c) => ({
          ma_hop_dong: c.id,
          ten_hop_dong: `${c.so_hop_dong} · ${c.ten}`,
          trang_thai: c.trang_thai,
        }),
      );
      return { data: rows, count: total, error };
    }),

  /** Preview of the links an IFC-code match would add (exact code, one BOQ line, supported unit). */
  previewBoq: (project: string, models: string[], contracts: string[]) =>
    readAllRows<BoqCodeMatch>(
      (from, to, count) =>
        legacyDb
          .rpc(
            'bim_field_match_boq',
            { p_project: project, p_models: models, p_contracts: contracts },
            count ? { count: 'exact' } : undefined,
          )
          .order('model_id')
          .order('code')
          .order('global_id')
          .order('ma_boq')
          .range(from, to) as unknown as Result<BoqCodeMatch>,
    ),
  /** Applies the previewed links; the server refuses when the matches changed since the preview. */
  async applyBoq(project: string, models: string[], contracts: string[], expected: BoqCodeMatch[]): Promise<number> {
    const { data, error } = await legacyDb.rpc('bim_field_apply_boq', {
      p_project: project,
      p_models: models,
      p_contracts: contracts,
      p_expected_keys: expected.map((r) => `${r.model_id}:${r.global_id}:${r.ma_boq}`),
    });
    if (error) throw new Error(error.message);
    return Number(data) || 0;
  },

  /**
   * Dòng BOQ của dự án (hoặc một hợp đồng) + ánh xạ + đo bóc mô hình, MỘT yêu cầu.
   * modelIds = null: đo bóc mọi ánh xạ; có giá trị: chỉ đo ánh xạ thuộc các mô hình đó (in_scope).
   */
  async overview(
    project: string,
    options: { modelIds?: string[] | null; contract?: string | null; limit?: number } = {},
  ): Promise<BoundedList<BoqOverviewItem>> {
    const data = await bimRpc(
      'bim_boq_overview',
      {
        p_project: project,
        p_model_ids: options.modelIds ? [...new Set(options.modelIds)].sort() : undefined,
        p_contract: options.contract || undefined,
        p_limit: options.limit ?? 5000,
      },
      'Lỗi tải đối soát BOQ',
    );
    const list = boundedFromRpc<BoqOverviewItem>(data, 'items');
    return {
      ...list,
      rows: list.rows.map((item) => ({
        ...item,
        khoi_luong: num(item.khoi_luong),
        don_gia: num(item.don_gia),
        khoi_luong_nghiem_thu: num(item.khoi_luong_nghiem_thu),
        thanh_tien: num(item.thanh_tien),
        gia_tri_nghiem_thu: num(item.gia_tri_nghiem_thu),
        mapping: item.mapping ? { ...item.mapping, coefficient: Number(item.mapping.coefficient) } : null,
      })),
    };
  },

  /** Loại cấu kiện × tầng của một mô hình (chọn tập nguồn BOQ) — không tải cấu kiện. */
  async facets(model: string): Promise<BoqFacet[]> {
    const rows = await bimRpc('bim_boq_facets', { p_model: model }, 'Lỗi tải nhóm cấu kiện nguồn');
    return (rows || []).map((r) => ({
      loai_cau_kien: String(r.loai_cau_kien ?? ''),
      phan_doan_tang: r.phan_doan_tang ?? null,
      so_luong: Number(r.so_luong) || 0,
    }));
  },

  /** Lưu ánh xạ: máy chủ tính tập GUID từ (mô hình, loại, tầng); quyền ghi theo RLS. */
  async save(input: BoqMappingInput) {
    return bimRpc(
      'bim_boq_save_mapping',
      {
        p_project: input.project_id,
        p_boq: input.boq_id,
        p_model: input.model_id,
        p_category: input.category || '',
        p_floor: input.floor || '',
        p_unit: input.unit,
        p_coefficient: input.coefficient,
        p_task: input.task_id || undefined,
      },
      'Không lưu được ánh xạ',
    );
  },

  /** Cấu kiện của một ánh xạ BOQ để tô sáng trên mô hình. */
  async mappingElements(boqId: string): Promise<{ modelId: string; expressId: number }[]> {
    const rows = await bimRpc('bim_boq_mapping_elements', { p_boq: boqId }, 'Lỗi tìm cấu kiện của ánh xạ');
    return (rows || []).map((r) => ({ modelId: String(r.model_id), expressId: Number(r.express_id) }));
  },

  remove: async (id: string) => {
    const { error } = await bimDb.from('bim_boq_mappings').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
