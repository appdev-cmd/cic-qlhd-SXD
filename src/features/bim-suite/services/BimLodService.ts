// LOD 500: field verification log and as-built evaluation per model (migration 20261027120000).
import { legacyDb } from '../lib/bimDb';
import type { VerificationRow } from '../lib/lod500';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};

export interface LodCriterion {
  ma: 'hinh_hoc' | 'xac_minh' | 'dung_sai' | 'bien_ban';
  ten: string;
  ty_le: number | null;
  nguong: number;
  mo_ta: string;
  guid_chua_xac_minh?: string[];
  so_sai_lech?: number;
}
export interface LodResult {
  id: string;
  model_id: string;
  project_id: string;
  muc_lod: number;
  dat: boolean;
  tieu_chi: LodCriterion[];
  so_cau_kien: number;
  so_trong_pham_vi: number;
  so_ngoai_pham_vi: number;
  created_at: string;
}

export const BimLodService = {
  /** Kết quả mới nhất của từng mô hình. */
  async latest(projectId: string): Promise<LodResult[]> {
    const q = legacyDb
      .from('bim_lod_danh_gia')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(2000);
    const { data, error } = await q;
    if (error) fail(error, 'Lỗi tải đánh giá LOD 500');
    const seen = new Set<string>();
    return ((data ?? []) as LodResult[]).filter((r) => (seen.has(r.model_id) ? false : (seen.add(r.model_id), true)));
  },

  async evaluate(modelId: string): Promise<LodResult> {
    const { data, error } = await legacyDb.rpc('bim_lod500_danh_gia', { p_model: modelId });
    if (error) fail(error, 'Không đánh giá được LOD 500');
    return data as LodResult;
  },

  async importVerification(modelId: string, rows: VerificationRow[]): Promise<number> {
    const { data, error } = await legacyDb.rpc('bim_xac_minh_ghi', { p_model: modelId, p_rows: rows });
    if (error) fail(error, 'Không nhập được sổ xác minh');
    return Number(data ?? 0);
  },
};
