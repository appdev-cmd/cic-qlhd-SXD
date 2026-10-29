// Khóa và phép cộng dùng chung cho 5D. Bộ dựng dòng 5D duy nhất nằm ở costing.buildCostRows;
// phần hoàn thành theo tiến độ WBS tính ở máy chủ (bim_5d_overview), không tải cấu kiện về trình duyệt.
export type { Cost5dRow } from './costing';

export const elementKey = (modelId: string, guid: string) => JSON.stringify([modelId, guid]);
export const quantityKey = (row: {
  model_id?: string;
  loai_cau_kien: string;
  vat_lieu?: string | null;
  phan_doan_tang?: string | null;
}) => JSON.stringify([row.model_id || '', row.loai_cau_kien, row.vat_lieu || '', row.phan_doan_tang || '']);

/** Never add different physical units or silently drop an unpriced part of a group. */
export const sumKnown = (values: (number | null | undefined)[]) =>
  values.length > 0 && values.every((v) => v != null && Number.isFinite(v))
    ? values.reduce<number>((sum, value) => sum + value!, 0)
    : null;
