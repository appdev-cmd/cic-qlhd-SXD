import { formatNumber, formatDateTime } from '@/lib/utils';
// Change-order totals per contract and the category colour of each change order on the model.
import type { ContractVariations } from '../services/BimVariationService';

/** Bảng màu phân loại chuẩn (đã kiểm định), gán theo thứ tự phụ lục, không xoay vòng quá 8. */
export const VARIATION_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
];
export const variationColor = (index: number): string | null =>
  index >= 0 && index < VARIATION_COLORS.length ? VARIATION_COLORS[index] : null;

export interface ContractTotals {
  goc: number;
  daKy: number;
  chuaKy: number;
  sauDieuChinh: number;
  duKien: number;
  tyLeDaKy: number | null;
  tyLeDuKien: number | null;
}
export const contractTotals = (c: ContractVariations): ContractTotals => {
  const sauDieuChinh = c.gia_tri_goc + c.phat_sinh_da_ky;
  const duKien = sauDieuChinh + c.phat_sinh_chua_ky;
  return {
    goc: c.gia_tri_goc,
    daKy: c.phat_sinh_da_ky,
    chuaKy: c.phat_sinh_chua_ky,
    sauDieuChinh,
    duKien,
    tyLeDaKy: c.gia_tri_goc > 0 ? c.phat_sinh_da_ky / c.gia_tri_goc : null,
    tyLeDuKien: c.gia_tri_goc > 0 ? (c.phat_sinh_da_ky + c.phat_sinh_chua_ky) / c.gia_tri_goc : null,
  };
};

/** Tiền đồng → "45,0 tỷ" / "850 tr" (dấu thập phân kiểu Việt). */
export const formatMoneyShort = (vnd: number): string => {
  const sign = vnd < 0 ? '−' : '';
  const a = Math.abs(vnd);
  if (a >= 1e9) return `${sign}${formatNumber(a / 1e9, 1)} tỷ`;
  if (a >= 1e6) return `${sign}${formatNumber(Math.round(a / 1e6), 2)} tr`;
  return `${sign}${formatNumber(Math.round(a), 2)} đ`;
};
export const formatPercent = (r: number | null): string => (r === null ? 'chưa có' : `${formatNumber(r * 100, 1)}%`);

/** Chọn hợp đồng mặc định: hợp đồng có phụ lục, giá trị lớn nhất. */
export const defaultContract = (list: ContractVariations[]): ContractVariations | null =>
  [...list].sort(
    (a, b) => Number(b.phu_luc.length > 0) - Number(a.phu_luc.length > 0) || b.gia_tri_goc - a.gia_tri_goc,
  )[0] ?? null;
