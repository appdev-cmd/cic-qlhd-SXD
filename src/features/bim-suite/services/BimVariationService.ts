// Change orders of the project's contracts (ACC Cost, phase B5, migration 20261027130000) linked to model elements
// or floors. Replaces cic-hud's ERP contract appendices; the shapes below keep the names the ported panel reads.
import { legacyDb } from '../lib/bimDb';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};

export type ChangeOrderStatus = 'nhap' | 'de_xuat' | 'da_duyet' | 'tu_choi';
export const CHANGE_ORDER_STATUS: Record<ChangeOrderStatus, string> = {
  nhap: 'Bản nháp',
  de_xuat: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Từ chối',
};
export interface VariationItem {
  /** Change order id. */
  ma_vo: string;
  so: string;
  noi_dung: string | null;
  gia_tri: number;
  thoi_gian: number | null;
  trang_thai: ChangeOrderStatus;
  so_lien_ket: number;
}
export interface ContractVariations {
  /** Contract id. */
  ma_hop_dong: string;
  ten_hop_dong: string | null;
  trang_thai: string;
  gia_tri_goc: number;
  /** Approved change orders. */
  phat_sinh_da_ky: number;
  /** Change orders waiting for approval. */
  phat_sinh_chua_ky: number;
  phu_luc: VariationItem[];
}
export interface VariationLink {
  id: string;
  ma_vo: string;
  model_id: string;
  global_ids: string[];
  tang: string | null;
  ghi_chu: string | null;
  created_at: string;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
type SummaryRow = {
  contract_id: string;
  so_hop_dong: string;
  ten: string;
  trang_thai: string;
  gia_tri_goc: number;
  da_duyet: number;
  cho_duyet: number;
  lenh: {
    id: string;
    so: string;
    tieu_de: string;
    trang_thai: ChangeOrderStatus;
    gia_tri: number;
    ngay: number;
    so_lien_ket: number;
  }[];
};

export const BimVariationService = {
  async summary(projectId: string): Promise<ContractVariations[]> {
    const { data, error } = await legacyDb.rpc('bim_phat_sinh_tong_hop', { p_project: projectId });
    if (error) fail(error, 'Lỗi tải lệnh thay đổi');
    return ((data ?? []) as SummaryRow[]).map((c) => ({
      ma_hop_dong: c.contract_id,
      ten_hop_dong: `${c.so_hop_dong} · ${c.ten}`,
      trang_thai: c.trang_thai,
      gia_tri_goc: num(c.gia_tri_goc),
      phat_sinh_da_ky: num(c.da_duyet),
      phat_sinh_chua_ky: num(c.cho_duyet),
      phu_luc: (c.lenh ?? []).map((o) => ({
        ma_vo: o.id,
        so: o.so,
        noi_dung: o.tieu_de,
        gia_tri: num(o.gia_tri),
        thoi_gian: o.ngay ? Number(o.ngay) : null,
        trang_thai: o.trang_thai,
        so_lien_ket: num(o.so_lien_ket),
      })),
    }));
  },
  async links(projectId: string): Promise<VariationLink[]> {
    const { data, error } = await legacyDb
      .from('bim_phat_sinh_lien_ket')
      .select('id, change_order_id, model_id, global_ids, tang, ghi_chu, created_at')
      .eq('project_id', projectId)
      .order('created_at');
    if (error) fail(error, 'Lỗi tải liên kết lệnh thay đổi');
    return ((data ?? []) as (Omit<VariationLink, 'ma_vo'> & { change_order_id: string })[]).map(
      ({ change_order_id, ...l }) => ({ ...l, ma_vo: change_order_id }),
    );
  },
  /** GlobalIds of a floor (links by floor). */
  async storeyGuids(modelId: string, storey: string): Promise<string[]> {
    const { data, error } = await legacyDb
      .from('bim_elements')
      .select('global_id')
      .eq('model_id', modelId)
      .eq('phan_doan_tang', storey)
      .limit(5000);
    if (error) fail(error, 'Lỗi tải cấu kiện của tầng');
    return ((data ?? []) as { global_id: string }[]).map((r) => r.global_id);
  },
  async attach(changeOrderId: string, modelId: string, guids: string[], storey: string | null, note: string | null) {
    const { data, error } = await legacyDb.rpc('bim_phat_sinh_gan', {
      p_change_order: changeOrderId,
      p_model: modelId,
      p_global_ids: guids,
      p_tang: storey,
      p_ghi_chu: note,
    });
    if (error) fail(error, 'Không gắn được lệnh thay đổi');
    return data;
  },
  async detach(id: string): Promise<void> {
    const { error } = await legacyDb.rpc('bim_phat_sinh_go', { p_id: id });
    if (error) fail(error, 'Không gỡ được liên kết');
  },
  /** New change order proposal on a signed contract (the number is assigned by the server). */
  async create(
    projectId: string,
    contractId: string,
    v: { tieu_de: string; ly_do?: string | null; gia_tri: number; ngay: number },
  ) {
    const { error } = await legacyDb.from('bim_change_orders').insert({
      project_id: projectId,
      contract_id: contractId,
      tieu_de: v.tieu_de,
      ly_do: v.ly_do ?? null,
      gia_tri_dieu_chinh: v.gia_tri,
      thoi_gian_dieu_chinh_ngay: v.ngay,
      trang_thai: 'de_xuat',
    });
    if (error) fail(error, 'Không lập được lệnh thay đổi');
  },
  async decide(id: string, approve: boolean, reason: string | null) {
    const { error } = await legacyDb.rpc('bim_change_order_decide', { p_id: id, p_duyet: approve, p_ly_do: reason });
    if (error) fail(error, 'Không ghi được quyết định');
  },
};
