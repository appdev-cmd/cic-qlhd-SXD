// BIM 6D sustainability (migration 20261027140000): emission factors (project or organization library), material
// mapping, element carbon, monthly meters, targets, LCA/LCC assessments.
import { legacyDb } from '../lib/bimDb';
import type { FactorImportRow, MeterImportRow } from '../lib/sustainability';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) fail(error, context);
  return data as T;
}
async function select<T>(build: () => PromiseLike<{ data: unknown; error: DbError }>, context: string): Promise<T[]> {
  const { data, error } = await build();
  if (error) fail(error, context);
  return (data ?? []) as T[];
}

export interface Factor {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  ma_vat_lieu: string;
  ten: string;
  don_vi: string;
  giai_doan: string;
  he_so: number;
  nguon: string;
  phien_ban: string;
  do_tin_cay: string;
  hieu_luc_tu: string | null;
  hieu_luc_den: string | null;
}
export interface MaterialMap {
  id: string;
  project_id: string | null;
  mau_vat_lieu: string;
  loai_cau_kien: string | null;
  ma_vat_lieu: string;
  dai_luong: 'm3' | 'm2' | 'm' | 'kg' | 'cai';
  uu_tien: number;
}
export interface CarbonRow {
  model_id: string;
  express_id: number;
  global_id: string;
  loai_cau_kien: string | null;
  vat_lieu: string | null;
  phan_doan_tang: string | null;
  ma_vat_lieu: string | null;
  he_so_id: string | null;
  he_so: number | null;
  dai_luong: string | null;
  khoi_luong: number | null;
  kgco2e: number | null;
  trang_thai: 'da_tinh' | 'thieu_anh_xa' | 'thieu_he_so' | 'thieu_khoi_luong' | 'khong_ap_dung';
  tinh_luc: string;
}
export interface SustainIndex {
  dien_tich_san: number | null;
  carbon_ngam_kg: number | null;
  so_ck_da_tinh: number;
  so_ck_thieu: number;
  carbon_ngam_m2: number | null;
  dien_kwh_12t: number | null;
  nuoc_m3_12t: number | null;
  tai_tao_kwh_12t: number | null;
  so_thang_dien: number;
  eui: number | null;
  wui: number | null;
  ty_le_tai_tao: number | null;
  carbon_van_hanh_kg_nam: number | null;
  carbon_van_hanh_m2: number | null;
  he_so_luoi_dien: { he_so: number; nguon: string; phien_ban: string } | null;
}
export interface Meter {
  id: string;
  loai: 'dien' | 'nuoc' | 'gas' | 'tai_tao';
  ky: string;
  gia_tri: number;
  don_vi: string;
  nguon: 'hoa_don' | 'nhap_tay';
  ghi_chu: string | null;
}
export interface Target {
  id: string;
  project_id: string;
  chi_so: string;
  gia_tri: number;
  chieu: 'toi_da' | 'toi_thieu';
  khung: string;
  han: string | null;
  ghi_chu: string | null;
}
export interface Assessment {
  id: string;
  project_id: string;
  ten: string;
  tham_so: Record<string, number | null>;
  ket_qua: AssessmentResult;
  trang_thai: 'nhap' | 'da_duyet';
  nguoi_lap_uid: string;
  duyet_luc: string | null;
  created_at: string;
}
export interface AssessmentResult {
  tuoi_tho_nam: number;
  ty_le_chiet_khau: number;
  carbon_ngam_kg: number | null;
  carbon_van_hanh_kg_nam: number | null;
  lca_kg: number | null;
  lca_kg_m2: number | null;
  chi_phi_dau_tu: number | null;
  chi_phi_van_hanh_nam: number | null;
  lcc: number | null;
  he_so_hien_gia: number;
  ghi_chu: string[];
}
export interface CarbonComputeResult {
  tong_kgco2e: number;
  so_cau_kien: number;
  trang_thai: Record<string, number> | null;
  theo_vat_lieu: { ma: string; kg: number; n: number }[];
}

const FACTOR_COLUMNS =
  'id, project_id, organization_id, ma_vat_lieu, ten, don_vi, giai_doan, he_so, nguon, phien_ban, do_tin_cay, hieu_luc_tu, hieu_luc_den';

export const BimSustainService = {
  index: (projectId: string) => rpc<SustainIndex>('bim_6d_chi_so', { p_project: projectId }, 'Lỗi tính chỉ số 6D'),

  /** Factors usable by a project: its own and its organization's library. */
  factors: (projectId: string, organizationId?: string | null) =>
    select<Factor>(() => {
      const scope = organizationId
        ? `project_id.eq.${projectId},organization_id.eq.${organizationId}`
        : `project_id.eq.${projectId}`;
      return legacyDb
        .from('bim_6d_he_so')
        .select(FACTOR_COLUMNS)
        .or(scope)
        .order('ma_vat_lieu')
        .order('giai_doan')
        .limit(2000);
    }, 'Lỗi tải hệ số phát thải'),
  orgFactors: (organizationId: string) =>
    select<Factor>(
      () =>
        legacyDb
          .from('bim_6d_he_so')
          .select(FACTOR_COLUMNS)
          .eq('organization_id', organizationId)
          .order('ma_vat_lieu')
          .order('giai_doan')
          .limit(2000),
      'Lỗi tải thư viện hệ số của đơn vị',
    ),
  /** Exactly one of project / organization: project factors (writers) or the organization library (org admins). */
  importFactors: (scope: { projectId: string } | { organizationId: string }, rows: FactorImportRow[]) =>
    rpc<number>(
      'bim_6d_he_so_nhap',
      'projectId' in scope
        ? { p_project: scope.projectId, p_rows: rows, p_organization: null }
        : { p_project: null, p_rows: rows, p_organization: scope.organizationId },
      'Không nạp được hệ số',
    ),

  maps: (projectId: string) =>
    select<MaterialMap>(
      () =>
        legacyDb
          .from('bim_6d_anh_xa')
          .select('id, project_id, mau_vat_lieu, loai_cau_kien, ma_vat_lieu, dai_luong, uu_tien')
          .eq('project_id', projectId)
          .order('uu_tien')
          .order('mau_vat_lieu'),
      'Lỗi tải ánh xạ vật liệu',
    ),
  saveMaps: (projectId: string, rows: Omit<MaterialMap, 'id' | 'project_id'>[]) =>
    rpc<number>('bim_6d_anh_xa_luu', { p_project: projectId, p_rows: rows, p_thay: true }, 'Không lưu được ánh xạ'),

  compute: (projectId: string, modelIds: string[]) =>
    rpc<CarbonComputeResult>(
      'bim_6d_tinh_carbon',
      { p_project: projectId, p_model_ids: modelIds },
      'Không tính được carbon',
    ),
  carbon: (projectId: string) =>
    select<CarbonRow>(
      () =>
        legacyDb
          .from('bim_6d_carbon')
          .select(
            'model_id, express_id, global_id, loai_cau_kien, vat_lieu, phan_doan_tang, ma_vat_lieu, he_so_id, he_so, dai_luong, khoi_luong, kgco2e, trang_thai, tinh_luc',
          )
          .eq('project_id', projectId)
          .limit(100000),
      'Lỗi tải carbon cấu kiện',
    ),

  meters: (projectId: string) =>
    select<Meter>(
      () =>
        legacyDb
          .from('bim_6d_so_do')
          .select('id, loai, ky, gia_tri, don_vi, nguon, ghi_chu')
          .eq('project_id', projectId)
          .order('ky', { ascending: false })
          .limit(600),
      'Lỗi tải sổ đo',
    ),
  importMeters: (projectId: string, rows: MeterImportRow[]) =>
    rpc<number>('bim_6d_so_do_nhap', { p_project: projectId, p_rows: rows }, 'Không nhập được số đo'),

  targets: (projectId: string) =>
    select<Target>(
      () => legacyDb.from('bim_6d_muc_tieu').select('*').eq('project_id', projectId).order('chi_so'),
      'Lỗi tải mục tiêu',
    ),
  saveTarget: (t: Omit<Target, 'id'>) =>
    rpc<Target>(
      'bim_6d_muc_tieu_luu',
      {
        p_project: t.project_id,
        p_chi_so: t.chi_so,
        p_gia_tri: t.gia_tri,
        p_khung: t.khung,
        p_chieu: t.chieu,
        p_han: t.han,
        p_ghi_chu: t.ghi_chu,
      },
      'Không lưu được mục tiêu',
    ),
  deleteTarget: (id: string) => rpc<void>('bim_6d_muc_tieu_xoa', { p_id: id }, 'Không xóa được mục tiêu'),

  /** Floor area lives on the project's site record (bim_project_site.dien_tich_san). */
  async setFloorArea(projectId: string, area: number | null): Promise<void> {
    const { error } = await legacyDb
      .from('bim_project_site')
      .upsert({ project_id: projectId, dien_tich_san: area }, { onConflict: 'project_id' });
    if (error) fail(error, 'Không lưu được diện tích sàn');
  },

  evaluate: (projectId: string, params: Record<string, number | null>) =>
    rpc<AssessmentResult>(
      'bim_6d_danh_gia_tinh',
      { p_project: projectId, p_tham_so: params },
      'Không tính được LCA/LCC',
    ),
  saveAssessment: (projectId: string, name: string, params: Record<string, number | null>) =>
    rpc<Assessment>(
      'bim_6d_danh_gia_luu',
      { p_project: projectId, p_ten: name, p_tham_so: params },
      'Không lưu được đánh giá',
    ),
  approveAssessment: (id: string) =>
    rpc<Assessment>('bim_6d_danh_gia_duyet', { p_id: id }, 'Không duyệt được đánh giá'),
  assessments: (projectId: string) =>
    select<Assessment>(
      () =>
        legacyDb
          .from('bim_6d_danh_gia')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      'Lỗi tải đánh giá',
    ),
};
