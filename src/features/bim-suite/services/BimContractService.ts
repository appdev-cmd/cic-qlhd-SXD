// Budget lines, contracts and their BOQ (ACC Cost, phase B5, migration 20261027130000). Budget lines are managed by
// project managers; contracts and BOQ by writers; signing and closing a contract by managers (bim_contract_set_status).
// A signed contract keeps its quantities and prices; only accepted quantities change, other changes go through change
// orders (BimVariationService).
import { legacyDb } from '../lib/bimDb';
import type { BidImportRow } from '../lib/planImport';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type ContractStatus = 'nhap' | 'da_ky' | 'thanh_ly';
export const CONTRACT_STATUS: Record<ContractStatus, string> = {
  nhap: 'Bản nháp',
  da_ky: 'Đã ký',
  thanh_ly: 'Đã thanh lý',
};

export interface BudgetLine {
  id: string;
  ma: string;
  ten: string;
  ngan_sach: number;
  ghi_chu: string | null;
  thu_tu: number;
}
export interface Contract {
  id: string;
  so_hop_dong: string;
  ten: string;
  nha_thau: string | null;
  budget_line_id: string | null;
  ngay_ky: string | null;
  trang_thai: ContractStatus;
  ghi_chu: string | null;
  created_at: string;
}
export interface ContractItem {
  id: string;
  contract_id: string;
  thu_tu: number;
  ma_hieu: string | null;
  ten_cong_viec: string;
  don_vi: string | null;
  khoi_luong: number | null;
  don_gia: number | null;
  thanh_tien: number | null;
  khoi_luong_nghiem_thu: number | null;
}
export interface CostSummary {
  lines: {
    id: string;
    ma: string;
    ten: string;
    ngan_sach: number;
    cam_ket: number;
    du_kien: number;
    thay_doi_duyet: number;
    thay_doi_cho: number;
    con_lai: number;
  }[];
  chua_gan_ngan_sach: { cam_ket: number; thay_doi_duyet: number };
  tong_ngan_sach: number;
}

export const BimContractService = {
  async budgetLines(projectId: string): Promise<BudgetLine[]> {
    const { data, error } = await legacyDb
      .from('bim_budget_lines')
      .select('id, ma, ten, ngan_sach, ghi_chu, thu_tu')
      .eq('project_id', projectId)
      .order('thu_tu')
      .order('ma');
    if (error) fail(error, 'Lỗi tải ngân sách');
    return ((data ?? []) as BudgetLine[]).map((l) => ({ ...l, ngan_sach: Number(l.ngan_sach) || 0 }));
  },
  async saveBudgetLine(projectId: string, line: Partial<BudgetLine> & { id?: string }): Promise<void> {
    const payload = {
      ma: line.ma?.trim(),
      ten: line.ten?.trim(),
      ngan_sach: line.ngan_sach ?? 0,
      ghi_chu: line.ghi_chu || null,
    };
    const { data, error } = line.id
      ? await legacyDb.from('bim_budget_lines').update(payload).eq('id', line.id).select('id')
      : await legacyDb
          .from('bim_budget_lines')
          .insert({ ...payload, project_id: projectId, thu_tu: line.thu_tu ?? 0 })
          .select('id');
    if (error)
      fail(error, /duplicate|unique/i.test(error.message) ? 'Mã ngân sách đã có' : 'Không lưu được dòng ngân sách');
    if (!data?.length) throw new Error('Cần quyền quản lý dự án để sửa ngân sách.');
  },
  async deleteBudgetLine(id: string): Promise<void> {
    const { data, error } = await legacyDb.from('bim_budget_lines').delete().eq('id', id).select('id');
    if (error) fail(error, 'Không xóa được dòng ngân sách');
    if (!data?.length) throw new Error('Cần quyền quản lý dự án để sửa ngân sách.');
  },
  async summary(projectId: string): Promise<CostSummary> {
    const { data, error } = await legacyDb.rpc('bim_cost_summary', { p_project: projectId });
    if (error) fail(error, 'Lỗi tổng hợp chi phí');
    const d = (data ?? {}) as CostSummary;
    return {
      lines: (d.lines ?? []).map((l) => ({
        ...l,
        ngan_sach: Number(l.ngan_sach) || 0,
        cam_ket: Number(l.cam_ket) || 0,
        du_kien: Number(l.du_kien) || 0,
        thay_doi_duyet: Number(l.thay_doi_duyet) || 0,
        thay_doi_cho: Number(l.thay_doi_cho) || 0,
        con_lai: Number(l.con_lai) || 0,
      })),
      chua_gan_ngan_sach: {
        cam_ket: Number(d.chua_gan_ngan_sach?.cam_ket) || 0,
        thay_doi_duyet: Number(d.chua_gan_ngan_sach?.thay_doi_duyet) || 0,
      },
      tong_ngan_sach: Number(d.tong_ngan_sach) || 0,
    };
  },

  async contracts(projectId: string): Promise<Contract[]> {
    const { data, error } = await legacyDb
      .from('bim_contracts')
      .select('id, so_hop_dong, ten, nha_thau, budget_line_id, ngay_ky, trang_thai, ghi_chu, created_at')
      .eq('project_id', projectId)
      .order('so_hop_dong');
    if (error) fail(error, 'Lỗi tải hợp đồng');
    return (data ?? []) as Contract[];
  },
  async saveContract(projectId: string, c: Partial<Contract> & { id?: string }): Promise<string> {
    const payload = {
      so_hop_dong: c.so_hop_dong?.trim(),
      ten: c.ten?.trim(),
      nha_thau: c.nha_thau?.trim() || null,
      budget_line_id: c.budget_line_id || null,
      ghi_chu: c.ghi_chu || null,
    };
    const { data, error } = c.id
      ? await legacyDb.from('bim_contracts').update(payload).eq('id', c.id).select('id')
      : await legacyDb
          .from('bim_contracts')
          .insert({ ...payload, project_id: projectId })
          .select('id');
    if (error) fail(error, /duplicate|unique/i.test(error.message) ? 'Số hợp đồng đã có' : 'Không lưu được hợp đồng');
    if (!data?.length) throw new Error('Không có quyền sửa hợp đồng của dự án này.');
    return (data[0] as { id: string }).id;
  },
  async deleteContract(id: string): Promise<void> {
    const { error } = await legacyDb.from('bim_contracts').delete().eq('id', id);
    if (error) fail(error, 'Không xóa được hợp đồng');
  },
  async setStatus(id: string, status: ContractStatus, signedOn?: string | null): Promise<void> {
    const { error } = await legacyDb.rpc('bim_contract_set_status', {
      p_contract: id,
      p_trang_thai: status,
      p_ngay_ky: signedOn ?? null,
    });
    if (error) fail(error, 'Không đổi được trạng thái hợp đồng');
  },
  async items(contractId: string): Promise<ContractItem[]> {
    const rows: ContractItem[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await legacyDb
        .from('bim_contract_items')
        .select(
          'id, contract_id, thu_tu, ma_hieu, ten_cong_viec, don_vi, khoi_luong, don_gia, thanh_tien, khoi_luong_nghiem_thu',
        )
        .eq('contract_id', contractId)
        .order('thu_tu')
        .order('id')
        .range(from, from + 999);
      if (error) fail(error, 'Lỗi tải BOQ');
      rows.push(
        ...((data ?? []) as ContractItem[]).map((i) => ({
          ...i,
          khoi_luong: num(i.khoi_luong),
          don_gia: num(i.don_gia),
          thanh_tien: num(i.thanh_tien),
          khoi_luong_nghiem_thu: num(i.khoi_luong_nghiem_thu),
        })),
      );
      if (!data || data.length < 1000) break;
    }
    return rows;
  },
  async importItems(contractId: string, rows: BidImportRow[], replace: boolean): Promise<number> {
    const { data, error } = await legacyDb.rpc('bim_contract_items_import', {
      p_contract: contractId,
      p_rows: rows,
      p_replace: replace,
    });
    if (error) fail(error, 'Không nhập được BOQ');
    return Number(data) || 0;
  },
  async setAccepted(itemId: string, quantity: number | null): Promise<void> {
    const { data, error } = await legacyDb
      .from('bim_contract_items')
      .update({ khoi_luong_nghiem_thu: quantity })
      .eq('id', itemId)
      .select('id');
    if (error) fail(error, 'Không ghi được khối lượng nghiệm thu');
    if (!data?.length) throw new Error('Không có quyền sửa BOQ của dự án này.');
  },
  /** Accepted value of the signed contracts of a project (actual cost suggestion for EVM). */
  async acceptedValue(projectId: string): Promise<{ value: number; contracts: number }> {
    const { data, error } = await legacyDb
      .from('bim_contract_items')
      .select('khoi_luong_nghiem_thu, don_gia, contract_id, bim_contracts!inner(trang_thai)')
      .eq('project_id', projectId)
      .neq('bim_contracts.trang_thai', 'nhap')
      .not('khoi_luong_nghiem_thu', 'is', null)
      .limit(20000);
    if (error) fail(error, 'Lỗi tính giá trị nghiệm thu');
    const rows = (data ?? []) as { khoi_luong_nghiem_thu: number; don_gia: number | null; contract_id: string }[];
    return {
      value: rows.reduce((s, r) => s + Number(r.khoi_luong_nghiem_thu) * (Number(r.don_gia) || 0), 0),
      contracts: new Set(rows.map((r) => r.contract_id)).size,
    };
  },
};
