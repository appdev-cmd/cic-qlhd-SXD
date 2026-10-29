// Chuyển từ cic-hud (services/BimOpsService.ts), chỉ giữ phần mẫu bộ chọn dùng chung (migration
// 20261027100000_bim_selection_views). Vận hành 7D, đợt phát hành từ điển và khóa add-in được thêm lại cùng các giai
// đoạn B4/B7 tương ứng.
import { legacyDb } from '../lib/bimDb';

export const OPS_MIGRATION = '20261027100000';
export class OpsNotInstalledError extends Error {
  constructor() {
    super(`CSDL chưa có chức năng này. Cần áp migration ${OPS_MIGRATION}.`);
  }
}
type DbError = { code?: string; message: string } | null;
// Bảng/hàm chưa có (42P01, 42883, PGRST202, PGRST205).
const isMissingObject = (error: DbError) =>
  !!error && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '');
const fail = (error: DbError, context: string): never => {
  if (isMissingObject(error)) throw new OpsNotInstalledError();
  throw new Error(`${context}: ${error?.message}`);
};
async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) fail(error, context);
  return data as T;
}

/** Mẫu bộ chọn dùng chung trong đơn vị (bim_bo_chon_mau). */
export interface SmartSetTemplate {
  id: string;
  organization_id: string;
  ten: string;
  mo_ta: string | null;
  dieu_kien: unknown[];
  nhom_dieu_kien: unknown[] | null;
  mau: string | null;
  nguon_project_id: string | null;
  nguoi_tao: string | null;
  ten_nguoi_tao: string | null;
  created_at: string;
}

export const BimOpsService = {
  async templates(): Promise<SmartSetTemplate[]> {
    const { data, error } = await legacyDb
      .from('bim_bo_chon_mau')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Lỗi tải mẫu bộ chọn');
    return (data ?? []) as SmartSetTemplate[];
  },
  shareSet: (setId: string, description?: string) =>
    rpc<SmartSetTemplate>(
      'bim_bo_chon_chia_se',
      { p_set: setId, p_mo_ta: description ?? null },
      'Không chia sẻ được bộ chọn',
    ),
  applyTemplate: (templateId: string, projectId: string) =>
    rpc<string>('bim_bo_chon_tu_mau', { p_mau: templateId, p_project: projectId }, 'Không dùng được mẫu'),
  deleteTemplate: (templateId: string) => rpc<void>('bim_bo_chon_mau_xoa', { p_mau: templateId }, 'Không xóa được mẫu'),
};
