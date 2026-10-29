/** Danh sách có giới hạn: mọi API danh sách BIM trả tổng số, số đã tải và cờ cắt bớt để giao diện báo rõ. */
export interface BoundedList<T> {
  rows: T[];
  /** Tổng số dòng thỏa điều kiện ở máy chủ */
  total: number;
  /** Số dòng đã tải về (= rows.length) */
  loaded: number;
  /** true khi total > loaded: giao diện phải báo "đang hiển thị loaded/total" */
  truncated: boolean;
}

export const boundedList = <T>(rows: T[], total: number = rows.length): BoundedList<T> => ({
  rows,
  total: Math.max(total, rows.length),
  loaded: rows.length,
  truncated: total > rows.length,
});

/** Chuẩn hóa kết quả RPC dạng {rows|items,total,loaded,truncated} của máy chủ. */
export function boundedFromRpc<T>(value: unknown, field: 'rows' | 'items' = 'rows'): BoundedList<T> {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rows = Array.isArray(data[field]) ? (data[field] as T[]) : [];
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length;
  return boundedList(rows, total);
}

/** Trang trả về từ PostgREST; dòng được ép về kiểu miền T ở ranh giới (kiểu DB sinh từ HUD có thể rộng hơn). */
type Page<_T> = PromiseLike<{
  data: unknown;
  count?: number | null;
  error?: { message: string } | null;
}>;

/**
 * Đọc trọn một danh sách tham chiếu NHỎ (hợp đồng, đơn giá, công trình…). PostgREST giới hạn mỗi lượt trả;
 * hàm không bao giờ trả về một báo cáo bị cắt âm thầm. Không dùng cho cấu kiện mô hình: dùng RPC tổng hợp
 * hoặc BimWorkspaceService.elementIndex (có giới hạn và cờ cắt bớt).
 */
export async function readAllRows<T>(
  readPage: (from: number, to: number, count: boolean) => Page<T>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (;;) {
    const page = await readPage(rows.length, rows.length + pageSize - 1, rows.length === 0);
    if (page.error) throw new Error(page.error.message);
    if (rows.length === 0 && page.count != null) expected = page.count;
    const batch = (Array.isArray(page.data) ? page.data : []) as T[];
    rows.push(...batch);
    if (expected !== null && rows.length === expected) return rows;
    if (expected !== null && (rows.length > expected || batch.length === 0)) {
      throw new Error(`Dữ liệu thay đổi hoặc chưa tải đủ (${rows.length}/${expected} dòng). Vui lòng tải lại.`);
    }
    if (expected === null && batch.length < pageSize) return rows;
    if (rows.length > 1_000_000) throw new Error('Phạm vi dữ liệu quá lớn; hãy chọn ít mô hình hơn.');
  }
}

/** Đọc một trang (offset) kèm tổng số; dùng cho danh sách phân trang như vướng mắc. */
export async function readPage<T>(
  read: (from: number, to: number) => Page<T>,
  offset: number,
  limit: number,
): Promise<BoundedList<T> & { offset: number; hasMore: boolean }> {
  const page = await read(offset, offset + limit - 1);
  if (page.error) throw new Error(page.error.message);
  const rows = (Array.isArray(page.data) ? page.data : []) as T[];
  const total = page.count ?? offset + rows.length;
  return { ...boundedList(rows, Math.max(0, total - offset)), total, offset, hasMore: offset + rows.length < total };
}
