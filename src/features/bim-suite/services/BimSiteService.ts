// Planning limits and cost rate of the project site (bim_project_site), floor area by storey and saved metric runs.
import { legacyDb } from '../lib/bimDb';
import type { CostChoice, PlanningLimits } from '../lib/siteMetrics';

export interface PlanningProfile extends PlanningLimits, CostChoice {
  can_cu_quy_hoach: string | null;
  /** Floor area kept on the site profile (read by the sustainability indicators). */
  dien_tich_san: number | null;
}
export interface FloorAreaResult {
  tong: number;
  nguon: 'san_ket_cau' | 'tat_ca_san';
  mo_hinh: string[];
  so_san: number;
  theo_tang: { tang: string; dien_tich: number; so_san: number }[];
}
export interface MetricsRun {
  id: string;
  model_ids: string[];
  dien_tich_san: number | null;
  dien_tich_chiem_dat: number | null;
  chieu_cao: number | null;
  hsdd: number | null;
  mat_do: number | null;
  khai_toan: number | null;
  chi_tiet: Record<string, unknown>;
  created_at: string;
}

export const EMPTY_PLANNING: PlanningProfile = {
  dien_tich_khu_dat: null,
  mat_do_toi_da: null,
  hsdd_toi_da: null,
  chieu_cao_toi_da: null,
  can_cu_quy_hoach: null,
  suat_von: null,
  suat_von_nguon: null,
  dien_tich_san: null,
};
const COLS =
  'dien_tich_khu_dat,mat_do_toi_da,hsdd_toi_da,chieu_cao_toi_da,can_cu_quy_hoach,suat_von,suat_von_nguon,dien_tich_san';
const missing = (e: { code?: string } | null) =>
  !!e && ['42703', 'PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(e.code ?? '');
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
export class SiteNotInstalledError extends Error {
  constructor() {
    super('CSDL chưa có bảng chỉ số quy hoạch của dự án.');
  }
}

async function upsertSite(projectId: string, patch: Record<string, unknown>, context: string) {
  const { error } = await legacyDb
    .from('bim_project_site')
    .upsert({ project_id: projectId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
  if (error) {
    if (missing(error)) throw new SiteNotInstalledError();
    throw new Error(`${context}: ${error.message}`);
  }
}

export const BimSiteService = {
  async getPlanning(projectId: string): Promise<PlanningProfile | null> {
    const { data, error } = await legacyDb
      .from('bim_project_site')
      .select(COLS)
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) {
      if (missing(error)) throw new SiteNotInstalledError();
      throw new Error(`Lỗi tải thông số quy hoạch: ${error.message}`);
    }
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      dien_tich_khu_dat: num(r.dien_tich_khu_dat),
      mat_do_toi_da: num(r.mat_do_toi_da),
      hsdd_toi_da: num(r.hsdd_toi_da),
      chieu_cao_toi_da: num(r.chieu_cao_toi_da),
      can_cu_quy_hoach: text(r.can_cu_quy_hoach),
      suat_von: num(r.suat_von),
      suat_von_nguon: text(r.suat_von_nguon),
      dien_tich_san: num(r.dien_tich_san),
    };
  },

  savePlanning: (projectId: string, p: PlanningProfile) =>
    upsertSite(projectId, { ...p }, 'Không lưu được thông số quy hoạch'),

  /** Keep the computed floor area on the site profile. */
  saveFloorArea: (projectId: string, area: number) =>
    upsertSite(projectId, { dien_tich_san: area }, 'Không lưu được diện tích sàn'),

  async floorArea(projectId: string, modelIds?: string[]): Promise<FloorAreaResult> {
    const { data, error } = await legacyDb.rpc('bim_quy_hoach_dien_tich_san', {
      p_project: projectId,
      p_model_ids: modelIds?.length ? modelIds : null,
    });
    if (error) {
      if (missing(error)) throw new SiteNotInstalledError();
      throw new Error(`Lỗi tính diện tích sàn: ${error.message}`);
    }
    const r = data as FloorAreaResult;
    return {
      ...r,
      tong: Number(r.tong),
      mo_hinh: r.mo_hinh ?? [],
      theo_tang: (r.theo_tang ?? []).map((t) => ({ ...t, dien_tich: Number(t.dien_tich) })),
    };
  },

  /** GlobalIds marked out of scope in the field verification log, by model (empty when unavailable). */
  async outOfScope(projectId: string): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await legacyDb
        .from('bim_xac_minh_hien_truong')
        .select('model_id,global_id')
        .eq('project_id', projectId)
        .eq('ket_qua', 'ngoai_pham_vi')
        .order('model_id')
        .order('global_id')
        .range(from, from + 999);
      if (error) break;
      for (const r of (data ?? []) as { model_id: string; global_id: string }[])
        (out[r.model_id] ??= []).push(r.global_id);
      if (!data || data.length < 1000) break;
    }
    return out;
  },

  async saveRun(
    projectId: string,
    row: Omit<MetricsRun, 'id' | 'created_at'> & { ghi_chu?: string },
  ): Promise<MetricsRun> {
    const { data, error } = await legacyDb.rpc('bim_quy_hoach_luu', { p_project: projectId, p_row: row });
    if (error) {
      if (missing(error)) throw new SiteNotInstalledError();
      throw new Error(`Không lưu được lần tính: ${error.message}`);
    }
    return data as MetricsRun;
  },

  async history(projectId: string): Promise<MetricsRun[]> {
    const { data, error } = await legacyDb
      .from('bim_chi_so_quy_hoach')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []) as MetricsRun[];
  },
};
