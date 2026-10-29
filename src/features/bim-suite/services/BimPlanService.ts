// 5D of a project (phase B5, migration 20261027130000): norms, unit prices, bids, estimates, cash flow and EVM. Norms
// come from the BuildSIA construction norm library (/api/construction-norms, TT12/2021); schedule functions live in
// BimScheduleService.
import { legacyDb } from '../lib/bimDb';
import { apiRequest } from '@/services/apiClient';
import type { BidImportRow } from '../lib/planImport';
import type { BidLine } from '../lib/bidCompare';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) fail(error, context);
  return data as T;
}

/** Work item of the BuildSIA norm library (search result). */
export interface Norm {
  id: string;
  book: string;
  code: string;
  title: string;
  unit: string;
  resourceCount: number;
}
export interface NormBook {
  id: string;
  label: string;
}
export interface EstimateRef {
  id: string;
  name: string;
  status: 'draft' | 'approved';
  tax_percent: number;
  created_at: string;
  approved_at: string | null;
}
export interface CashFlow {
  bac: number;
  phan_bo: number;
  chua_phan_bo: number;
  bat_dau: string | null;
  ket_thuc: string | null;
  thang: { thang: string; ke_hoach: number; luy_ke_ke_hoach: number }[];
  pv_hom_nay: number;
  ev_hien_tai: number;
  ngay: string;
}
export interface EvmResult {
  ngay: string;
  bac: number;
  pv: number;
  ev: number;
  ac: number | null;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  sv: number;
  cv: number | null;
  canh_bao: string[];
}
export interface EvmPeriod extends Omit<EvmResult, 'ngay'> {
  id: string;
  project_id: string;
  estimate_id: string;
  ngay_chot: string;
  nguon_ac: 'nhap_tay' | 'hop_dong' | null;
  ghi_chu: string | null;
  created_at: string;
}
export interface PriceRow {
  id: string;
  project_id: string;
  loai_cau_kien: string;
  vat_lieu: string | null;
  ma_dinh_muc: string | null;
  don_vi: string;
  don_gia: number;
}
export type PackBidLine = BidLine & { goi_thau: string };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const BimPlanService = {
  /** Search the BuildSIA norm library (TT12/2021 and other loaded books). */
  async norms(search: string, book?: string): Promise<{ items: Norm[]; books: NormBook[] }> {
    const params = new URLSearchParams({ q: search.trim().slice(0, 200), page: '1' });
    if (book) params.set('book', book);
    const data = await apiRequest<{ items: Norm[]; books: NormBook[] }>('/bim/norms?' + params);
    return { items: data.items ?? [], books: data.books ?? [] };
  },

  async priceRows(projectId: string): Promise<PriceRow[]> {
    const { data, error } = await legacyDb
      .from('bim_don_gia')
      .select('id, project_id, loai_cau_kien, vat_lieu, ma_dinh_muc, don_vi, don_gia')
      .eq('project_id', projectId)
      .order('loai_cau_kien');
    if (error) fail(error, 'Lỗi tải đơn giá');
    return ((data ?? []) as PriceRow[]).map((r) => ({ ...r, don_gia: Number(r.don_gia) }));
  },
  async setPriceNorm(id: string, code: string | null): Promise<void> {
    const { data, error } = await legacyDb.from('bim_don_gia').update({ ma_dinh_muc: code }).eq('id', id).select('id');
    if (error) fail(error, 'Không gắn được mã định mức');
    if (!data?.length) throw new Error('Không có quyền sửa đơn giá của dự án này.');
  },
  importPrices: (projectId: string, rows: Record<string, unknown>[]) =>
    rpc<number>('bim_import_unit_prices', { p_project: projectId, p_rows: rows }, 'Không nhập được đơn giá'),

  async bids(projectId: string): Promise<PackBidLine[]> {
    const { data, error } = await legacyDb
      .from('bim_gia_du_thau')
      .select('goi_thau, nha_thau, stt, ma_hieu, ten_cong_viec, don_vi, khoi_luong, don_gia')
      .eq('project_id', projectId)
      .order('goi_thau')
      .order('stt');
    if (error) fail(error, 'Lỗi tải giá dự thầu');
    return ((data ?? []) as PackBidLine[]).map((r) => ({
      ...r,
      khoi_luong: num(r.khoi_luong),
      don_gia: num(r.don_gia),
    }));
  },
  importBids: (projectId: string, pack: string, bidder: string, rows: BidImportRow[]) =>
    rpc<number>(
      'bim_gia_du_thau_nhap',
      { p_project: projectId, p_goi_thau: pack, p_nha_thau: bidder, p_rows: rows },
      'Không nhập được giá dự thầu',
    ),
  deleteBidder: (projectId: string, pack: string, bidder: string) =>
    rpc<number>(
      'bim_gia_du_thau_xoa',
      { p_project: projectId, p_goi_thau: pack, p_nha_thau: bidder },
      'Không xóa được',
    ),

  async estimates(projectId: string): Promise<EstimateRef[]> {
    const { data, error } = await legacyDb
      .from('bim_cost_estimates')
      .select('id, name, status, tax_percent, created_at, approved_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Lỗi tải dự toán');
    return (data ?? []) as EstimateRef[];
  },
  cashFlow: async (estimateId: string): Promise<CashFlow> => {
    const r = await rpc<CashFlow>('bim_5d_dong_tien', { p_estimate: estimateId }, 'Không tính được dòng tiền');
    return {
      ...r,
      bac: Number(r.bac),
      phan_bo: Number(r.phan_bo),
      chua_phan_bo: Number(r.chua_phan_bo),
      pv_hom_nay: Number(r.pv_hom_nay),
      ev_hien_tai: Number(r.ev_hien_tai),
      thang: (r.thang ?? []).map((m) => ({
        ...m,
        ke_hoach: Number(m.ke_hoach),
        luy_ke_ke_hoach: Number(m.luy_ke_ke_hoach),
      })),
    };
  },
  evm: (estimateId: string, date: string, ac: number | null) =>
    rpc<EvmResult>('bim_evm_tinh', { p_estimate: estimateId, p_ngay: date, p_ac: ac }, 'Không tính được EVM'),
  closePeriod: (estimateId: string, date: string, ac: number | null, source: 'nhap_tay' | 'hop_dong', note?: string) =>
    rpc<EvmPeriod>(
      'bim_evm_chot',
      { p_estimate: estimateId, p_ngay: date, p_ac: ac, p_nguon_ac: source, p_ghi_chu: note ?? null },
      'Không chốt được kỳ EVM',
    ),
  async periods(projectId: string): Promise<EvmPeriod[]> {
    const { data, error } = await legacyDb
      .from('bim_evm_ky')
      .select('*')
      .eq('project_id', projectId)
      .order('ngay_chot', { ascending: false });
    if (error) fail(error, 'Lỗi tải kỳ EVM');
    return (data ?? []) as EvmPeriod[];
  },
};
