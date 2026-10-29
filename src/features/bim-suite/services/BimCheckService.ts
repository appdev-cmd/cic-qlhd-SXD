// Model checking (phase B4): IFC verification scores, organization data standards (IDS files) and add-in upload keys.
// Ported from cic-hud BimCdeService/BimOpsService; the CDE itself lives in the document library (src/lib/documents/cde.ts).
import { legacyDb } from '../lib/bimDb';
import type { BimDataQualityStats, BimModel } from '@/features/bim-suite/types/bim.types';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) fail(error, context);
  return data as T;
}

export interface IfcCriterion {
  ma: string;
  ten: string;
  ty_le: number;
  khuyen_nghi: string | null;
}
export interface IfcGroup {
  ma: string;
  ten: string;
  diem: number;
  trong_so: number;
  toi_thieu: number | null;
  tieu_chi: IfcCriterion[];
}
export interface IfcResult {
  id: string;
  model_id: string;
  project_id: string;
  giai_doan: string;
  diem_tong: number;
  diem_toi_thieu: number;
  dat: boolean;
  ly_do_khong_dat: string[];
  nhom: IfcGroup[];
  so_cau_kien: number;
  created_at: string;
  bim_models?: { file_name?: string | null; discipline?: string | null } | null;
}
export interface IfcConfig {
  giai_doan: string;
  trong_so: Record<string, number>;
  diem_toi_thieu: number;
  nhom_bat_buoc: Record<string, number>;
}
export interface IfcSampleError {
  express_id: number;
  global_id: string;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
}
export interface OpenClash {
  id: string;
  project_id: string;
  phien_id: string;
  guid_a: string;
  guid_b: string;
  ten_a: string | null;
  ten_b: string | null;
  loai_a: string | null;
  loai_b: string | null;
  trang_thai: string;
  do_sau: number | null;
  lan_cuoi: string;
}
export interface CdeModelContainer {
  model_id: string;
  ma_tep: string;
  vung: string;
  ma_phu_hop: string;
  ma_sua_doi: string;
  loi_ten: string | null;
}
export const BIM_STAGES = ['chuan_bi', 'thiet_ke', 'thi_cong', 'ban_giao', 'van_hanh'] as const;
export const BIM_STAGE_LABELS: Record<string, string> = {
  chuan_bi: 'Chuẩn bị dự án',
  thiet_ke: 'Thiết kế',
  thi_cong: 'Thi công',
  ban_giao: 'Bàn giao',
  van_hanh: 'Vận hành',
};

export interface DataStandard {
  id: string;
  organization_id: string;
  ten: string;
  phien_ban: string | null;
  mo_ta: string | null;
  sha256: string;
  created_at: string;
}

export interface AddinToken {
  id: string;
  project_id: string;
  ten: string;
  tien_to: string;
  created_at: string;
  het_han: string;
  thu_hoi_luc: string | null;
  lan_dung_cuoi: string | null;
  so_lan_dung: number;
}

/** Attaches per-model data quality counts (bim_field_quality) to the model rows. */
export function withQuality(models: BimModel[], rows: { model_id: string; chat_luong: BimDataQualityStats }[]) {
  const stats = new Map(rows.map((r) => [r.model_id, r.chat_luong]));
  return models.map((m) => (stats.has(m.id) ? { ...m, chat_luong: stats.get(m.id)! } : m));
}

export const BimCheckService = {
  fieldQuality: (projectId: string) =>
    rpc<{ model_id: string; chat_luong: BimDataQualityStats }[]>(
      'bim_field_quality',
      { p_project: projectId },
      'Lỗi tải chất lượng dữ liệu mô hình',
    ),
  /** Latest IFC verification of each model of the project. */
  async latestScores(projectId: string): Promise<IfcResult[]> {
    const { data, error } = await legacyDb
      .from('bim_ifc_xac_minh')
      .select('*, bim_models(file_name, discipline)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) fail(error, 'Lỗi tải kết quả xác minh IFC');
    const seen = new Set<string>();
    return ((data ?? []) as IfcResult[]).filter((r) => (seen.has(r.model_id) ? false : (seen.add(r.model_id), true)));
  },
  runScore: (modelId: string) => rpc<IfcResult>('bim_ifc_cham_diem', { p_model: modelId }, 'Không chấm được điểm IFC'),
  sampleErrors: (modelId: string, criterion: string) =>
    rpc<IfcSampleError[]>(
      'bim_ifc_mau_loi',
      { p_model: modelId, p_tieu_chi: criterion, p_limit: 50 },
      'Không tải được cấu kiện chưa đạt',
    ),
  async getConfig(): Promise<IfcConfig[]> {
    const { data, error } = await legacyDb.from('bim_ifc_cau_hinh').select('*');
    if (error) fail(error, 'Lỗi tải cấu hình xác minh IFC');
    return ((data ?? []) as IfcConfig[]).sort(
      (a, b) => BIM_STAGES.indexOf(a.giai_doan as never) - BIM_STAGES.indexOf(b.giai_doan as never),
    );
  },
  async projectStage(projectId: string): Promise<string> {
    const { data, error } = await legacyDb
      .from('document_cde_settings')
      .select('giai_doan_bim')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) fail(error, 'Lỗi tải cấu hình dự án');
    return (data?.giai_doan_bim as string | undefined) ?? 'thiet_ke';
  },
  /** CDE container of each model (latest version of a chain). */
  async modelContainers(projectId: string): Promise<CdeModelContainer[]> {
    const { data, error } = await legacyDb
      .from('document_cde_containers')
      .select('model_id, ma_tep, vung, ma_phu_hop, ma_sua_doi, loi_ten')
      .eq('project_id', projectId)
      .eq('loai', 'mo_hinh')
      .not('model_id', 'is', null);
    if (error) fail(error, 'Lỗi tải trạng thái CDE của mô hình');
    return (data ?? []) as CdeModelContainer[];
  },
  /** Unresolved clashes of the project (for the BCF export of the check report). */
  async openClashes(projectId: string): Promise<OpenClash[]> {
    const { data, error } = await legacyDb
      .from('bim_va_cham')
      .select('id, project_id, phien_id, guid_a, guid_b, ten_a, ten_b, loai_a, loai_b, trang_thai, do_sau, lan_cuoi')
      .eq('project_id', projectId)
      .in('trang_thai', ['moi', 'dang_xu_ly'])
      .order('lan_cuoi', { ascending: false })
      .limit(5000);
    if (error) fail(error, 'Lỗi tải va chạm');
    return (data ?? []) as OpenClash[];
  },

  // ── Organization data standards ──
  async standards(organizationId: string): Promise<DataStandard[]> {
    const { data, error } = await legacyDb
      .from('bim_chuan_du_lieu')
      .select('id, organization_id, ten, phien_ban, mo_ta, sha256, created_at')
      .eq('organization_id', organizationId)
      .order('ten');
    if (error) fail(error, 'Lỗi tải chuẩn dữ liệu của đơn vị');
    return (data ?? []) as DataStandard[];
  },
  async standardXml(id: string): Promise<string> {
    const { data, error } = await legacyDb.from('bim_chuan_du_lieu').select('ids_xml').eq('id', id).single();
    if (error) fail(error, 'Không đọc được tệp IDS');
    return data!.ids_xml as string;
  },
  async saveStandard(
    organizationId: string,
    input: { ten: string; phien_ban?: string | null; mo_ta?: string | null; ids_xml: string },
  ) {
    const { error } = await legacyDb.from('bim_chuan_du_lieu').insert({
      organization_id: organizationId,
      ten: input.ten.trim(),
      phien_ban: input.phien_ban?.trim() || null,
      mo_ta: input.mo_ta?.trim() || null,
      ids_xml: input.ids_xml,
      sha256: '-',
    });
    if (error)
      fail(
        error,
        /duplicate|unique/i.test(error.message) ? 'Đơn vị đã có tệp IDS này' : 'Không lưu được chuẩn dữ liệu',
      );
  },
  async deleteStandard(id: string) {
    const { error } = await legacyDb.from('bim_chuan_du_lieu').delete().eq('id', id);
    if (error) fail(error, 'Không xóa được chuẩn dữ liệu');
  },

  // ── Add-in keys ──
  async tokens(projectId: string): Promise<AddinToken[]> {
    const { data, error } = await legacyDb
      .from('bim_addin_token')
      .select('id, project_id, ten, tien_to, created_at, het_han, thu_hoi_luc, lan_dung_cuoi, so_lan_dung')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Lỗi tải khóa add-in');
    return (data ?? []) as AddinToken[];
  },
  createToken: (projectId: string, name: string, days: number) =>
    rpc<string>('bim_addin_tao_khoa', { p_project: projectId, p_ten: name, p_so_ngay: days }, 'Không tạo được khóa'),
  revokeToken: (id: string) => rpc<void>('bim_addin_thu_hoi', { p_id: id }, 'Không thu hồi được khóa'),
};
