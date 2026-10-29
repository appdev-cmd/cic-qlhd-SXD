// Closeout (migration 20261027150000): gathers handover data, stores the package ZIP in bim-models
// `ban-giao/{project}/…`, records it with its SHA-256 (bim_goi_ban_giao_ghi), and the per-system handover checklist
// items (facility_handover_items) are read and written through FacilityOpsService. cic-hud stored the ZIP in its BIM CDE (bim_cde_tep); BuildSIA keeps it in storage only.
import { supabase } from '@/features/bim-suite/adapters/supabase';
import { legacyDb } from '../lib/bimDb';
import { normalizeHandoverData, type HandoverData } from '../lib/handoverChecklist';
import type { HandoverPackage } from '../lib/handoverPackage';
import { BimService } from './BimService';

export const HANDOVER_MIGRATION = '20261027150000';
export class HandoverNotInstalledError extends Error {
  constructor() {
    super(`CSDL chưa có phần bàn giao. Cần áp migration ${HANDOVER_MIGRATION}_bim_assets_operations.`);
  }
}
type DbError = { code?: string; message: string } | null;
const isMissingObject = (e: DbError) => !!e && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '');
const fail = (error: DbError, context: string): never => {
  if (isMissingObject(error)) throw new HandoverNotInstalledError();
  throw new Error(`${context}: ${error?.message}`);
};

const BUCKET = 'bim-models';

export interface HandoverRecord {
  id: string;
  project_id: string;
  ten: string;
  /** Object path in bim-models (ban-giao/{project}/…). */
  duong_dan: string | null;
  sha256: string;
  kich_thuoc: number;
  so_muc: number;
  so_du: number;
  so_thieu: number;
  muc_luc: { ma: string; trang_thai: string }[];
  nguoi_uid: string | null;
  created_at: string;
}

/** Query key of hooks/useFacilityOps useHandoverItems. */
export const HANDOVER_ITEMS_KEY = (projectId: string) => ['facility-handover', projectId] as const;

export const BimHandoverPackageService = {
  async data(projectId: string): Promise<HandoverData> {
    const { data, error } = await legacyDb.rpc('bim_goi_ban_giao_du_lieu', { p_project: projectId });
    if (error) fail(error, 'Lỗi gom dữ liệu bàn giao');
    const c = await BimService.getDefaultComposition(projectId).catch(() => null);
    const to_hop = c?.active ? [c.active, ...(c.overlay ?? [])] : null;
    return normalizeHandoverData(data, to_hop);
  },

  async list(projectId: string): Promise<HandoverRecord[]> {
    const { data, error } = await legacyDb
      .from('bim_goi_ban_giao')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) fail(error, 'Lỗi tải sổ gói bàn giao');
    return (data ?? []) as HandoverRecord[];
  },

  /** Uploads the ZIP (never overwrites), then records it; removes the upload when the record fails. */
  async publish(projectId: string, pkg: HandoverPackage): Promise<HandoverRecord> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const path = `ban-giao/${projectId}/GOI_BAN_GIAO_${day}_${pkg.sha256.slice(0, 8)}.zip`;
    const blob = new Blob([pkg.zip as BlobPart], { type: 'application/zip' });
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'application/zip', upsert: false });
    if (up.error) throw new Error(`Không tải được gói lên kho: ${up.error.message}`);
    const muc_luc = pkg.checklist.map((r) => ({ ma: r.ma, trang_thai: r.trang_thai }));
    const { data, error } = await legacyDb.rpc('bim_goi_ban_giao_ghi', {
      p_project: projectId,
      p_ten: pkg.ten,
      p_duong_dan: path,
      p_sha256: pkg.sha256,
      p_kich_thuoc: pkg.zip.byteLength,
      p_muc_luc: muc_luc,
      p_so_du: pkg.totals.du,
      p_so_thieu: pkg.totals.chua_co,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      fail(error, 'Không ghi được sổ gói bàn giao');
    }
    return data as HandoverRecord;
  },

  async downloadUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) throw new Error(`Không tạo được liên kết tải gói: ${error?.message ?? 'không rõ lỗi'}`);
    return data.signedUrl;
  },
};
