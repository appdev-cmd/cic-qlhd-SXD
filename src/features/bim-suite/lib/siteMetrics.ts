// G1: chỉ số quy hoạch từ mô hình — diện tích chiếm đất và chiều cao (lưới nhìn từ trên xuống), hệ số sử dụng đất,
// mật độ xây dựng, so với giới hạn quy hoạch người dùng nhập; khái toán theo suất vốn người dùng nhập kèm nguồn.
import type { SampleGrid } from './sun/sunHours';

/** Ô cao hơn mặt đất quá ngưỡng (m) là phần công trình chiếm đất. */
export const FOOTPRINT_THRESHOLD = 1;

export interface Footprint {
  /** Diện tích hình chiếu bằng (m²) của phần công trình cao hơn mặt đất. */
  area: number;
  cells: number;
  /** Chiều cao lớn nhất so với mặt đất (m). */
  height: number;
  groundY: number;
  /** 1 tại ô thuộc diện tích chiếm đất (để tô lớp phủ). */
  mask: Uint8Array;
  /** Không thấy mặt sân trong lưới: mật độ có thể sai. */
  noGround: boolean;
}

export function footprintFromGrid(grid: SampleGrid, threshold = FOOTPRINT_THRESHOLD): Footprint {
  const mask = new Uint8Array(grid.count);
  let cells = 0;
  let top = -Infinity;
  let groundCells = 0;
  for (let p = 0; p < grid.count; p++) {
    const y = grid.points[p * 3 + 1];
    if (y - grid.groundY > threshold) {
      mask[p] = 1;
      cells++;
      if (y > top) top = y;
    } else groundCells++;
  }
  return {
    area: Math.round(cells * grid.step * grid.step * 10) / 10,
    cells,
    height: cells ? Math.round((top - grid.groundY) * 10) / 10 : 0,
    groundY: grid.groundY,
    mask,
    noGround: grid.count > 0 && groundCells / grid.count < 0.05,
  };
}

export interface PlanningLimits {
  dien_tich_khu_dat: number | null;
  mat_do_toi_da: number | null;
  hsdd_toi_da: number | null;
  chieu_cao_toi_da: number | null;
}

export interface PlanningCheck {
  key: 'mat_do' | 'hsdd' | 'chieu_cao';
  label: string;
  value: number | null;
  limit: number | null;
  unit: string;
  /** null: chưa đủ dữ liệu để so. */
  ok: boolean | null;
}

export interface PlanningMetrics {
  gfa: number | null;
  footprint: number | null;
  height: number | null;
  /** Hệ số sử dụng đất (lần). */
  hsdd: number | null;
  /** Mật độ xây dựng (%). */
  matDo: number | null;
  checks: PlanningCheck[];
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function planningMetrics(
  gfa: number | null,
  footprint: number | null,
  height: number | null,
  limits: PlanningLimits,
): PlanningMetrics {
  const site = limits.dien_tich_khu_dat && limits.dien_tich_khu_dat > 0 ? limits.dien_tich_khu_dat : null;
  const hsdd = site && gfa !== null ? round(gfa / site, 2) : null;
  const matDo = site && footprint !== null ? round((footprint / site) * 100, 1) : null;
  const check = (
    key: PlanningCheck['key'],
    label: string,
    value: number | null,
    limit: number | null,
    unit: string,
  ): PlanningCheck => ({
    key,
    label,
    value,
    limit,
    unit,
    ok: value === null || limit === null ? null : value <= limit + 1e-9,
  });
  return {
    gfa,
    footprint,
    height,
    hsdd,
    matDo,
    checks: [
      check('mat_do', 'Mật độ xây dựng', matDo, limits.mat_do_toi_da, '%'),
      check('hsdd', 'Hệ số sử dụng đất', hsdd, limits.hsdd_toi_da, 'lần'),
      check('chieu_cao', 'Chiều cao công trình', height, limits.chieu_cao_toi_da, 'm'),
    ],
  };
}

/** Suất vốn (đồng/m² sàn) do người dùng nhập, kèm nguồn (quyết định công bố suất vốn, dự án tương tự, báo giá…). */
export interface CostChoice {
  suat_von: number | null;
  suat_von_nguon: string | null;
}

export interface QuickEstimate {
  /** Đồng. */
  total: number;
  perM2: number;
  basis: string;
}

/** Khái toán = diện tích sàn × suất vốn người dùng nhập. */
export function quickEstimate(gfa: number | null, choice: CostChoice): QuickEstimate | null {
  if (!gfa || gfa <= 0 || !choice.suat_von || choice.suat_von <= 0) return null;
  return {
    total: gfa * choice.suat_von,
    perM2: choice.suat_von,
    basis: choice.suat_von_nguon?.trim() || 'Suất vốn nhập tay (chưa ghi nguồn)',
  };
}

export interface EstimateLike {
  status: string;
  tax_percent: number | string | null;
  rows: { thanh_tien: number | null }[] | null;
  created_at: string;
  approved_at?: string | null;
}

/** Tổng dự toán 5D đã duyệt mới nhất (phần đã tính × (1 + VAT)); null nếu chưa có bản duyệt. */
export function approvedEstimateTotal(
  estimates: EstimateLike[],
): { total: number; missing: number; at: string } | null {
  const approved = estimates
    .filter((e) => e.status === 'approved')
    .sort((a, b) => (b.approved_at ?? b.created_at).localeCompare(a.approved_at ?? a.created_at))[0];
  if (!approved) return null;
  const rows = approved.rows ?? [];
  const subtotal = rows.reduce((s, r) => s + (r.thanh_tien ?? 0), 0);
  return {
    total: subtotal * (1 + (Number(approved.tax_percent) || 0) / 100),
    missing: rows.filter((r) => r.thanh_tien === null).length,
    at: approved.approved_at ?? approved.created_at,
  };
}
