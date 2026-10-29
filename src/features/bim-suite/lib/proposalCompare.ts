// Comparison rows between design options (named model sets). Quantities come from the server (bim_phuong_an_chi_so).
import type { ProposalRow } from '../services/BimProposalService';

export interface CompareMetric {
  key: string;
  label: string;
  unit: string;
  digits: number;
  /** Value per option; null = no data. */
  values: (number | null)[];
  note?: string;
}

const pos = (v: number | null) => (v === null || !Number.isFinite(v) || v <= 0 ? null : v);

/**
 * Metrics per option. With unit prices (rate per m³ of concrete etc.) an indicative cost is added; it is a quick
 * comparison, not an estimate (estimates are made per model in the 5D panel).
 */
export function compareMetrics(
  rows: ProposalRow[],
  rates?: { m3?: number | null; m2?: number | null; kg?: number | null },
): CompareMetric[] {
  const out: CompareMetric[] = [
    { key: 'cau_kien', label: 'Số cấu kiện', unit: '', digits: 0, values: rows.map((p) => p.so_cau_kien) },
    { key: 'tang', label: 'Số tầng', unit: '', digits: 0, values: rows.map((p) => pos(p.so_tang)) },
    { key: 'the_tich', label: 'Thể tích bê tông', unit: 'm³', digits: 1, values: rows.map((p) => pos(p.the_tich)) },
    { key: 'dien_tich', label: 'Diện tích bề mặt', unit: 'm²', digits: 0, values: rows.map((p) => pos(p.dien_tich)) },
    {
      key: 'chieu_dai',
      label: 'Chiều dài cấu kiện tuyến tính',
      unit: 'm',
      digits: 0,
      values: rows.map((p) => pos(p.chieu_dai)),
    },
    {
      key: 'trong_luong',
      label: 'Trọng lượng thép',
      unit: 'tấn',
      digits: 1,
      values: rows.map((p) => (pos(p.trong_luong) === null ? null : p.trong_luong! / 1000)),
    },
    {
      key: 'thieu',
      label: 'Cấu kiện thiếu khối lượng',
      unit: '%',
      digits: 1,
      values: rows.map((p) =>
        p.so_cau_kien > 0 ? Math.round((p.thieu_khoi_luong / p.so_cau_kien) * 1000) / 10 : null,
      ),
      note: 'Tỷ lệ cao làm số liệu so sánh kém tin cậy',
    },
    {
      key: 'carbon',
      label: 'Carbon ngầm (A1–A3)',
      unit: 'tCO₂e',
      digits: 1,
      values: rows.map((p) =>
        p.carbon_kg !== null && p.carbon_cau_kien > 0 ? Math.round(p.carbon_kg / 100) / 10 : null,
      ),
      note: 'Từ lần tính carbon gần nhất ở tab Bền vững',
    },
  ];
  if (rates && (rates.m3 || rates.m2 || rates.kg)) {
    out.push({
      key: 'chi_phi',
      label: 'Chi phí chỉ báo',
      unit: 'triệu đồng',
      digits: 0,
      values: rows.map((p) => {
        const total =
          (p.the_tich ?? 0) * (rates.m3 ?? 0) +
          (p.dien_tich ?? 0) * (rates.m2 ?? 0) +
          (p.trong_luong ?? 0) * (rates.kg ?? 0);
        return total > 0 ? Math.round(total / 1e6) : null;
      }),
      note: 'Theo suất giá nhập ở trên, không thay dự toán',
    });
  }
  return out;
}

/** Bar length (0–1) relative to the largest value of the row. */
export const barShare = (values: (number | null)[], v: number | null) => {
  const max = Math.max(0, ...values.filter((x): x is number => x !== null));
  return v === null || max <= 0 ? 0 : v / max;
};
