// QCVN 04-3:2026/BXD design inputs, EDGE baseline, facade WWR and the energy audit log (migration 20261027140000).
import { legacyDb } from '../lib/bimDb';
import {
  ENERGY_CLASSES,
  ENERGY_PSETS,
  energyRowFromElement,
  modelEnergy,
  type AuditType,
  type FacadeWwr,
  type ModelEnergy,
  type ModelEnergyRow,
  type PsetMap,
  type QcvnInputs,
} from '../lib/qcvn043';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};

export interface QcvnRecord extends QcvnInputs {
  project_id: string;
  edge_eui_co_so: number | null;
  edge_wui_co_so: number | null;
  edge_vat_lieu_co_so: number | null;
  wwr_theo_huong: FacadeWwr[] | null;
  wwr_model_ids: string[] | null;
  wwr_tinh_luc: string | null;
  updated_at: string;
}
export interface AuditRecord {
  id: string;
  project_id: string;
  loai: AuditType;
  ky_bao_cao: string | null;
  ngay_thuc_hien: string;
  chu_ky_nam: number;
  don_vi_thuc_hien: string | null;
  toe: number | null;
  eui: number | null;
  tco2e: number | null;
  ket_luan: 'dat' | 'can_khac_phuc' | 'dang_thuc_hien';
  document_id: string | null;
  ghi_chu: string | null;
  created_at: string;
}
const NUM = [
  'shgc_kinh',
  'u_tuong',
  'r0_tuong',
  'u_mai',
  'r0_mai',
  'chiller_cong_suat_kw',
  'chiller_cop',
  'lpd_thiet_ke',
  'edge_eui_co_so',
  'edge_wui_co_so',
  'edge_vat_lieu_co_so',
  'toe',
  'eui',
  'tco2e',
];
const numeric = <T extends object>(row: T): T => {
  const out = { ...row } as Record<string, unknown>;
  for (const k of NUM) if (k in out && out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  return out as T;
};
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

// Only the energy psets are selected (aliases p0.., k0..) so walls and slabs do not ship every property.
const ENERGY_SELECT = [
  'loai_cau_kien',
  'dien_tich',
  'kieu_loai:thuoc_tinh->kieu->>loai',
  'thong_tin:thuoc_tinh->thong_tin',
  ...ENERGY_PSETS.flatMap((p, i) => [`p${i}:thuoc_tinh->psets->${p}`, `k${i}:thuoc_tinh->kieu->psets->${p}`]),
].join(',');
// PostgREST caps a response at 1000 rows by default.
const PAGE = 1000;
const MAX_ROWS = 60000;

export const BimQcvnService = {
  /** Energy parameters stored as standard IFC psets in the project's current models (glazing, walls, roofs,
   * chillers, light fixtures). */
  async modelEnergy(projectId: string): Promise<{ energy: ModelEnergy; model_ids: string[] }> {
    const ids = await legacyDb.rpc('bim_6d_mo_hinh_hien_hanh', { p_project: projectId });
    if (ids.error) fail(ids.error, 'Lỗi tải mô hình hiện hành');
    const modelIds = (ids.data ?? []) as string[];
    if (!modelIds.length) return { energy: modelEnergy([]), model_ids: [] };
    const rows: ModelEnergyRow[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await legacyDb
        .from('bim_elements')
        .select(ENERGY_SELECT)
        .in('model_id', modelIds)
        .in('loai_cau_kien', [...ENERGY_CLASSES])
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) fail(error, 'Lỗi đọc thông số năng lượng của mô hình');
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      for (const r of page) {
        const psets: PsetMap = {};
        const kieu: PsetMap = {};
        ENERGY_PSETS.forEach((p, i) => {
          if (r[`p${i}`]) psets[p] = r[`p${i}`] as Record<string, unknown>;
          if (r[`k${i}`]) kieu[p] = r[`k${i}`] as Record<string, unknown>;
        });
        const info = (r.thong_tin ?? null) as Record<string, string> | null;
        const row = energyRowFromElement({
          loai_cau_kien: String(r.loai_cau_kien),
          dien_tich: num(r.dien_tich),
          psets,
          kieu_psets: kieu,
          kieu_loai: (r.kieu_loai as string | null) ?? null,
          predefined: info?.['Loại định nghĩa sẵn'] ?? null,
        });
        if (row) rows.push(row);
      }
      if (page.length < PAGE) break;
    }
    return { energy: modelEnergy(rows), model_ids: modelIds };
  },
  async get(projectId: string): Promise<QcvnRecord | null> {
    const { data, error } = await legacyDb
      .from('bim_6d_qcvn_dau_vao')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) fail(error, 'Lỗi tải thông số QCVN');
    return data ? numeric(data as QcvnRecord) : null;
  },
  async save(projectId: string, row: Record<string, string | number | null>): Promise<QcvnRecord> {
    const { data, error } = await legacyDb.rpc('bim_6d_qcvn_luu', { p_project: projectId, p_row: row });
    if (error) fail(error, 'Không lưu được thông số');
    return numeric(data as QcvnRecord);
  },
  async saveWwr(projectId: string, facades: FacadeWwr[], modelIds: string[]): Promise<void> {
    const { error } = await legacyDb.rpc('bim_6d_qcvn_luu_wwr', {
      p_project: projectId,
      p_wwr: facades,
      p_model_ids: modelIds,
    });
    if (error) fail(error, 'Không lưu được kết quả WWR');
  },
  async audits(projectId: string): Promise<AuditRecord[]> {
    const { data, error } = await legacyDb
      .from('bim_6d_kiem_toan')
      .select('*')
      .eq('project_id', projectId)
      .order('ngay_thuc_hien', { ascending: false });
    if (error) fail(error, 'Lỗi tải sổ kiểm toán');
    return ((data ?? []) as AuditRecord[]).map(numeric);
  },
  async saveAudit(
    projectId: string,
    id: string | null,
    row: Record<string, string | number | null>,
  ): Promise<AuditRecord> {
    const { data, error } = await legacyDb.rpc('bim_6d_kiem_toan_luu', { p_project: projectId, p_id: id, p_row: row });
    if (error) fail(error, 'Không lưu được bản ghi kiểm toán');
    return numeric(data as AuditRecord);
  },
  async deleteAudit(id: string): Promise<void> {
    const { error } = await legacyDb.rpc('bim_6d_kiem_toan_xoa', { p_id: id });
    if (error) fail(error, 'Không xóa được bản ghi');
  },
};
