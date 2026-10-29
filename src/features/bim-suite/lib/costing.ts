import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/lib/costing.ts
// Bóc tách chi phí 5D: ghép nhóm khối lượng của mô hình với bảng đơn giá của dự án.
// Bộ dựng dòng 5D DUY NHẤT (buildCostRows): dùng cho bảng 5D, panel chi phí, báo cáo và AI.
// Khối lượng hoàn thành theo tiến độ WBS tính ở máy chủ (RPC bim_5d_overview → hoan_thanh);
// thiếu dữ liệu luôn là NULL, không quy thành 0.

import { BimCostRow, BimCostUnit, BimQuantitySummaryRow, BimUnitPrice } from '@/features/bim-suite/types/bim.types';

export const UNIT_LABELS: Record<BimCostUnit, string> = {
  m3: 'm³',
  m2: 'm²',
  m: 'm dài',
  kg: 'kg',
  cai: 'cái',
};
export const COST_UNITS: BimCostUnit[] = ['m3', 'm2', 'm', 'kg', 'cai'];

/** Nhóm khối lượng 5D: dòng view v_bim_khoi_luong_tong_hop + phần hoàn thành theo tiến độ do máy chủ tính. */
export interface Bim5dGroup extends BimQuantitySummaryRow {
  /** Số cấu kiện trong nhóm có liên kết tiến độ WBS đủ % thực tế */
  lien_ket_tien_do?: number | null;
  /** Khối lượng hoàn thành theo từng đơn vị; NULL nếu chưa đủ liên kết/% thực tế/đại lượng */
  hoan_thanh?: Partial<Record<BimCostUnit, number | null>> | null;
}

export interface Cost5dRow extends BimCostRow {
  completedQuantity: number | null;
  completedValue: number | null;
  progressLinked: number;
}

/** Khối lượng của một dòng tổng hợp theo đơn vị tính của đơn giá */
export const quantityForUnit = (row: BimQuantitySummaryRow, unit: BimCostUnit): number | null => {
  const valid = (value: number | null) => (value !== null && Number.isFinite(value) && value >= 0 ? value : null);
  const missing = {
    m3: row.thieu_the_tich,
    m2: row.thieu_dien_tich,
    m: row.thieu_chieu_dai,
    kg: row.thieu_trong_luong,
    cai: 0,
  }[unit];
  if ((missing ?? 0) > 0) return null;
  switch (unit) {
    case 'm3':
      return valid(row.tong_the_tich);
    case 'm2':
      return valid(row.tong_dien_tich);
    case 'm':
      return valid(row.tong_chieu_dai);
    case 'kg':
      return valid(row.tong_trong_luong);
    case 'cai':
      return valid(row.so_luong);
  }
};

/** Đơn vị phù hợp nhất khi chưa có đơn giá (dùng để gợi ý lập đơn giá) */
export const suggestUnit = (row: BimQuantitySummaryRow): BimCostUnit => {
  if ((row.tong_the_tich ?? 0) > 0) return 'm3';
  if ((row.tong_dien_tich ?? 0) > 0) return 'm2';
  if ((row.tong_chieu_dai ?? 0) > 0) return 'm';
  if ((row.tong_trong_luong ?? 0) > 0) return 'kg';
  return 'cai';
};

const norm = (v?: string | null) => (v || '').trim().toLowerCase();

/**
 * Chọn đơn giá khớp nhất cho một dòng khối lượng.
 * Ưu tiên đơn giá có khai vật liệu (khớp chứa) hơn đơn giá chung của loại cấu kiện.
 */
export const priceCandidates = (row: BimQuantitySummaryRow, prices: BimUnitPrice[]): BimUnitPrice[] => {
  const cat = norm(row.loai_cau_kien);
  const mat = norm(row.vat_lieu);
  const matches = prices.filter(
    (p) => norm(p.loai_cau_kien) === cat && (!norm(p.vat_lieu) || mat.includes(norm(p.vat_lieu))),
  );
  const specificity = Math.max(0, ...matches.map((p) => norm(p.vat_lieu).length));
  return matches.filter((p) => norm(p.vat_lieu).length === specificity);
};
export const matchPrice = (row: BimQuantitySummaryRow, prices: BimUnitPrice[]): BimUnitPrice | null => {
  const matches = priceCandidates(row, prices);
  return matches.length === 1 ? matches[0] : null;
};
export const COST_ISSUES = {
  missing_price: 'Thiếu đơn giá',
  missing_quantity: 'Thiếu khối lượng theo đơn vị',
  ambiguous_price: 'Nhiều đơn giá phù hợp — cần chọn công tác',
  invalid_price: 'Đơn giá không hợp lệ',
};

export interface CostResult {
  rows: Cost5dRow[];
  total: number;
  /** Số dòng khối lượng chưa có đơn giá */
  missing: number;
  missingQuantity: number;
  ambiguousPrice: number;
  coverage: number;
  /** Tổng khối lượng chưa có đơn giá, gom theo loại cấu kiện */
  missingByCategory: { loai_cau_kien: string; so_luong: number; khoi_luong: number; don_vi: BimCostUnit }[];
  /** Có dòng dùng khối lượng ước tính từ hình học */
  hasEstimated: boolean;
}

const finiteOrNull = (value: unknown): number | null =>
  value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export const buildCostRows = (quantities: Bim5dGroup[], prices: BimUnitPrice[]): CostResult => {
  const rows: Cost5dRow[] = [];
  const missingMap = new Map<
    string,
    { loai_cau_kien: string; so_luong: number; khoi_luong: number; don_vi: BimCostUnit }
  >();
  let total = 0;
  let hasEstimated = false;

  for (const q of quantities) {
    const matches = priceCandidates(q, prices);
    const price = matches.length === 1 ? matches[0] : null;
    const unit = price?.don_vi ?? null;
    const khoi_luong = unit ? quantityForUnit(q, unit) : null;
    const issue =
      matches.length > 1
        ? 'ambiguous_price'
        : !price
          ? 'missing_price'
          : !Number.isFinite(Number(price.don_gia)) || Number(price.don_gia) < 0
            ? 'invalid_price'
            : khoi_luong === null
              ? 'missing_quantity'
              : undefined;
    const thanh_tien = !issue && price && khoi_luong !== null ? khoi_luong * Number(price.don_gia) : null;
    if (thanh_tien) total += thanh_tien;
    if (q.co_uoc_tinh_hinh_hoc) hasEstimated = true;

    if (matches.length === 0) {
      const u = suggestUnit(q);
      const prev = missingMap.get(q.loai_cau_kien) || {
        loai_cau_kien: q.loai_cau_kien,
        so_luong: 0,
        khoi_luong: 0,
        don_vi: u,
      };
      prev.so_luong += q.so_luong ?? 0;
      prev.khoi_luong += quantityForUnit(q, prev.don_vi) ?? 0;
      missingMap.set(q.loai_cau_kien, prev);
    }

    // Hoàn thành chỉ có nghĩa khi dòng đã tính được tiền và máy chủ báo đủ dữ liệu cho đúng đơn vị của đơn giá.
    const completedQuantity = !issue && unit && q.hoan_thanh ? finiteOrNull(q.hoan_thanh[unit]) : null;
    rows.push({
      model_id: q.model_id,
      issue,
      loai_cau_kien: q.loai_cau_kien,
      vat_lieu: q.vat_lieu,
      phan_doan_tang: q.phan_doan_tang,
      so_luong: q.so_luong ?? 0,
      khoi_luong,
      don_vi: unit,
      don_gia: price ? Number(price.don_gia || 0) : null,
      ma_dinh_muc: price?.ma_dinh_muc ?? null,
      thanh_tien,
      uoc_tinh_hinh_hoc: !!q.co_uoc_tinh_hinh_hoc,
      progressLinked: Number(q.lien_ket_tien_do) || 0,
      completedQuantity,
      completedValue: completedQuantity !== null && price ? completedQuantity * Number(price.don_gia) : null,
    });
  }

  rows.sort((a, b) => (b.thanh_tien ?? -1) - (a.thanh_tien ?? -1));
  return {
    rows,
    total,
    missing: rows.filter((r) => r.thanh_tien === null).length,
    missingQuantity: rows.filter((r) => r.issue === 'missing_quantity').length,
    ambiguousPrice: rows.filter((r) => r.issue === 'ambiguous_price').length,
    coverage: rows.length ? rows.filter((r) => !r.issue).length / rows.length : 0,
    missingByCategory: [...missingMap.values()].sort((a, b) => b.khoi_luong - a.khoi_luong),
    hasEstimated,
  };
};

export const formatVnd = (value: number): string => {
  if (!value) return '0 ₫';
  if (value >= 1e9) return `${formatNumber(value / 1e9, 2)} tỷ ₫`;
  if (value >= 1e6) return `${formatNumber(value / 1e6, 1)} triệu ₫`;
  return `${formatNumber(value, 0)} ₫`;
};
