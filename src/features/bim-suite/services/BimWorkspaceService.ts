import { bimDb, bimRpc } from '../lib/bimDb';
import { boundedFromRpc, readAllRows, type BoundedList } from '../lib/readAllRows';
import type { Measurement } from '../lib/boqReconciliation';
import type { Bim5dGroup } from '../lib/costing';
import { elementKey } from '../lib/quantity5d';

export interface WorkspaceElement extends Measurement {
  model_id: string;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
  vat_lieu: string | null;
  phan_doan_tang: string | null;
}
export interface WorkspaceWork {
  ma_hang_muc: string;
  ten_hang_muc: string;
}
export interface WorkspaceContractLink {
  ma_cong_trinh: string;
  ma_hop_dong: string;
}
export interface Bim5dOverview {
  groups: Bim5dGroup[];
  /** Tổng số cấu kiện trong các nhóm (để đối chiếu với element_count của mô hình) */
  elementTotal: number;
  computedAt: string | null;
}
export interface QuantityGroupKey {
  model_id: string;
  loai_cau_kien: string;
  vat_lieu: string | null;
  phan_doan_tang: string | null;
}

/** Giới hạn mặc định của bộ đọc cấu kiện; vượt quá thì trả cờ truncated thay vì tải tiếp. */
export const ELEMENT_INDEX_LIMIT = 50_000;

const number = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

/**
 * Dữ liệu dùng chung của bảng 5D / bộ chọn nhanh. Quyền theo RLS của HUD (RPC SECURITY INVOKER);
 * tổng hợp và nối dữ liệu ở máy chủ, trình duyệt không tải toàn bộ cấu kiện của mô hình.
 */
export const BimWorkspaceService = {
  /** Trạng thái nghiệm thu theo (mô hình, GUID), gồm cả liên kết hồ sơ nghiệm thu — một yêu cầu. */
  async acceptance(projectId: string): Promise<Record<string, string>> {
    const rows = await bimRpc('bim_workspace_acceptance', { p_project: projectId }, 'Lỗi tải trạng thái nghiệm thu');
    const result: Record<string, string> = {};
    for (const row of rows || []) {
      if (row.global_id && row.status) result[elementKey(row.model_id || '', row.global_id)] = row.status;
    }
    return result;
  },

  /**
   * Bộ đọc cấu kiện DUY NHẤT của phân hệ: cột gọn (không thuộc tính JSON), một yêu cầu, giới hạn cứng.
   * Chỉ dùng khi giao diện thật sự cần từng cấu kiện (ví dụ bộ chọn nhanh); bảng tổng hợp dùng RPC.
   */
  async elementIndex(modelIds: string[], limit = ELEMENT_INDEX_LIMIT): Promise<BoundedList<WorkspaceElement>> {
    if (!modelIds.length) return { rows: [], total: 0, loaded: 0, truncated: false };
    const data = await bimRpc(
      'bim_element_index',
      { p_model_ids: [...new Set(modelIds)].sort(), p_limit: limit },
      'Lỗi tải chỉ mục cấu kiện',
    );
    return boundedFromRpc<WorkspaceElement>(data, 'rows');
  },

  /** Nhóm khối lượng 5D + khối lượng hoàn thành theo tiến độ WBS, tính ở máy chủ (bim_5d_overview). */
  async fiveD(projectId: string, modelIds: string[]): Promise<Bim5dOverview> {
    if (!projectId || !modelIds.length) return { groups: [], elementTotal: 0, computedAt: null };
    const data = (await bimRpc(
      'bim_5d_overview',
      { p_project: projectId, p_model_ids: [...new Set(modelIds)].sort() },
      'Lỗi tổng hợp 5D',
    )) as {
      groups?: Bim5dGroup[];
      element_total?: number;
      computed_at?: string;
    } | null;
    const groups = (data?.groups || []).map((g) => ({
      ...g,
      vat_lieu: g.vat_lieu ?? '',
      phan_doan_tang: g.phan_doan_tang ?? '',
      so_luong: Number(g.so_luong) || 0,
      tong_the_tich: number(g.tong_the_tich),
      tong_dien_tich: number(g.tong_dien_tich),
      tong_chieu_dai: number(g.tong_chieu_dai),
      tong_trong_luong: number(g.tong_trong_luong),
      lien_ket_tien_do: Number(g.lien_ket_tien_do) || 0,
    }));
    return { groups, elementTotal: Number(data?.element_total) || 0, computedAt: data?.computed_at ?? null };
  },

  /** Mô hình → công trình suy từ liên kết tiến độ (để gom phạm vi theo công trình). */
  async modelWorks(projectId: string): Promise<{ model_id: string; work_id: string }[]> {
    const rows = await bimRpc('bim_model_work_links', { p_project: projectId }, 'Lỗi tải liên kết công trình');
    return (rows || []).filter((r): r is { model_id: string; work_id: string } => !!r.model_id && !!r.work_id);
  },

  /** Cấu kiện của các nhóm khối lượng (tô sáng trên mô hình) — lọc ở máy chủ. */
  async groupElements(groups: QuantityGroupKey[]): Promise<{ modelId: string; expressId: number }[]> {
    if (!groups.length) return [];
    const rows = await bimRpc(
      'bim_quantity_group_elements',
      {
        p_groups: groups.map((g) => ({
          model_id: g.model_id,
          loai_cau_kien: g.loai_cau_kien,
          vat_lieu: g.vat_lieu || '',
          phan_doan_tang: g.phan_doan_tang || '',
        })),
      },
      'Lỗi tìm cấu kiện của nhóm',
    );
    return (rows || []).map((r) => ({ modelId: String(r.model_id), expressId: Number(r.express_id) }));
  },

  works: (projectId: string) =>
    readAllRows<WorkspaceWork>(
      (from, to, count) =>
        bimDb
          .from('hang_muc_cong_trinh')
          .select('ma_hang_muc,ten_hang_muc', count ? { count: 'exact' } : undefined)
          .eq('ma_du_an', projectId)
          .order('ma_hang_muc')
          .range(from, to) as unknown as PromiseLike<{
          data: WorkspaceWork[] | null;
          count?: number | null;
          error: { message: string } | null;
        }>,
    ),
  /**
   * Liên kết hợp đồng ↔ công trình. HUD chưa có bảng hop_dong_cong_trinh (đối chiếu 22/10/2026):
   * trả null để giao diện không lọc hợp đồng theo công trình thay vì báo lỗi.
   */
  contractLinks: async (projectId: string): Promise<WorkspaceContractLink[] | null> => {
    const table = 'hop_dong_cong_trinh' as unknown as 'hop_dong';
    let missing = false;
    const rows = await readAllRows<WorkspaceContractLink>(async (from, to, count) => {
      const page = await (bimDb
        .from(table)
        .select('ma_cong_trinh,ma_hop_dong', count ? { count: 'exact' } : undefined)
        .eq('ma_du_an', projectId)
        .order('ma_hop_dong')
        .range(from, to) as unknown as PromiseLike<{
        data: WorkspaceContractLink[] | null;
        count?: number | null;
        error: { message: string; code?: string } | null;
      }>);
      if (page.error && ['PGRST205', '42P01', 'PGRST200'].includes(page.error.code || '')) {
        missing = true;
        return { data: [], count: 0, error: null };
      }
      return page;
    });
    return missing ? null : rows;
  },
};
