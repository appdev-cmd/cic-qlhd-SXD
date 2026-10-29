// features/bim/lib/measureRecords.ts
// Phép đo dạng dữ liệu (lưu cùng góc nhìn / vướng mắc): nhãn, vị trí nhãn, màu, khóa trục.
// Không phụ thuộc three.js để kiểm thử được.

import type { BimMeasurementKind, BimMeasurementRecord } from '@/features/bim/types/bim.types';
import { formatNumber } from '../../../lib/utils';
import {
  Vec3,
  distance,
  polygonArea,
  planArea,
  polygonPerimeter,
  angleAt,
  slope,
  distanceToPlane,
  projectOnPlane,
  centroid,
  fmtLen,
  fmtArea,
  fmtDeg,
} from './measureMath';

export const MEASURE_COLORS: Record<BimMeasurementKind, string> = {
  distance: '#2563eb',
  elevation: '#7c3aed',
  area: '#059669',
  angle: '#db2777',
  slope: '#d97706',
  perpendicular: '#0891b2',
  clearance: '#e11d48',
  bbox: '#0d9488',
};

/** Số điểm cần bấm để hoàn tất một phép đo (diện tích: khép vùng thủ công) */
export const requiredPoints = (kind: BimMeasurementKind): number =>
  kind === 'elevation' ? 1 : kind === 'angle' ? 3 : kind === 'area' ? Infinity : 2;

/** Chân đường vuông góc của phép đo vuông góc (điểm 2 xuống mặt qua điểm 1) */
export const perpendicularFoot = (rec: Pick<BimMeasurementRecord, 'points' | 'normal'>): Vec3 => {
  const [a, b] = rec.points;
  const n: Vec3 = rec.normal && Math.hypot(...rec.normal) > 1e-9 ? rec.normal : [0, 1, 0];
  return projectOnPlane(b, a, n);
};

export const boxDimensions = (min: Vec3, max: Vec3) => ({
  // Fragments: Y hướng lên → X, Z là hai phương ngang
  dx: Math.abs(max[0] - min[0]),
  dy: Math.abs(max[1] - min[1]),
  dz: Math.abs(max[2] - min[2]),
});

const num = (v: number, digits = 2) => formatNumber(v, digits);

/** Nội dung nhãn và vị trí đặt nhãn của một phép đo */
export const describeMeasurement = (rec: BimMeasurementRecord): { text: string; anchor: Vec3 } => {
  const p = rec.points;
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  switch (rec.kind) {
    case 'elevation':
      return { text: `Cao độ: ${fmtLen(p[0][1])}`, anchor: p[0] };
    case 'distance': {
      const [a, b] = p;
      const d = distance(a, b);
      const dy = Math.abs(b[1] - a[1]);
      const dh = Math.hypot(b[0] - a[0], b[2] - a[2]);
      return {
        text: `${fmtLen(d)}${dy > 0.001 ? ` · ΔZ ${fmtLen(dy)} · ngang ${fmtLen(dh)}` : ''}`,
        anchor: mid(a, b),
      };
    }
    case 'slope': {
      const [a, b] = p;
      const s = slope(a, b);
      const text = Number.isFinite(s.percent)
        ? `Độ dốc ${num(s.percent)}% · ${fmtDeg(s.degrees)}${Number.isFinite(s.ratio) ? ` · 1:${num(s.ratio, 1)}` : ''}`
        : `Thẳng đứng · ΔZ ${fmtLen(Math.abs(s.rise))}`;
      return { text, anchor: mid(a, b) };
    }
    case 'angle':
      return { text: `Góc ${fmtDeg(angleAt(p[0], p[1], p[2]))}`, anchor: p[1] };
    case 'perpendicular': {
      const [a, b] = p;
      const n: Vec3 = rec.normal && Math.hypot(...rec.normal) > 1e-9 ? rec.normal : [0, 1, 0];
      const foot = perpendicularFoot(rec);
      return { text: `Vuông góc ${fmtLen(distanceToPlane(b, a, n))}`, anchor: mid(b, foot) };
    }
    case 'area': {
      const area = polygonArea(p);
      const plan = planArea(p);
      return {
        text: `S = ${fmtArea(area)}${Math.abs(area - plan) > 0.01 ? ` · mặt bằng ${fmtArea(plan)}` : ''} · chu vi ${fmtLen(polygonPerimeter(p), 2)}`,
        anchor: centroid(p),
      };
    }
    case 'clearance': {
      const [a, b] = p;
      const d = distance(a, b);
      const text =
        d < 0.0005
          ? 'Hai cấu kiện chạm hoặc giao nhau'
          : `Khoảng hở ${fmtLen(d)}${rec.approximate ? ' (ước tính theo hộp bao)' : ''}`;
      return { text, anchor: mid(a, b) };
    }
    case 'bbox': {
      const { dx, dy, dz } = boxDimensions(p[0], p[1]);
      return {
        text: `Hộp bao ${num(dx)} × ${num(dz)} m · cao ${num(dy)} m`,
        anchor: [(p[0][0] + p[1][0]) / 2, Math.max(p[0][1], p[1][1]), (p[0][2] + p[1][2]) / 2],
      };
    }
  }
};

/** Nhãn tạm khi đang đặt điểm (rubber-band): độ dài đoạn cuối, tổng chiều dài/diện tích tạm */
export const previewText = (kind: BimMeasurementKind, placed: Vec3[], cursor: Vec3): string => {
  const last = placed[placed.length - 1];
  if (!last) return '';
  const seg = distance(last, cursor);
  if (kind === 'area') {
    const pts = [...placed, cursor];
    return pts.length >= 3 ? `${fmtLen(seg)} · S ≈ ${fmtArea(polygonArea(pts))}` : fmtLen(seg);
  }
  if (kind === 'angle' && placed.length === 2) return `Góc ${fmtDeg(angleAt(placed[0], placed[1], cursor))}`;
  if (kind === 'slope') {
    const s = slope(last, cursor);
    return Number.isFinite(s.percent) ? `${num(s.percent)}%` : 'Thẳng đứng';
  }
  return fmtLen(seg);
};

/**
 * Khóa trục (giữ Shift khi đặt điểm): chỉ giữ thành phần chênh lớn nhất so với điểm trước,
 * để đo đúng phương ngang/đứng mà không phải bấm chính xác.
 */
export const axisLock = (prev: Vec3, p: Vec3): { point: Vec3; axis: 'x' | 'y' | 'z' } => {
  const d = [p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]];
  const i =
    Math.abs(d[0]) >= Math.abs(d[1]) && Math.abs(d[0]) >= Math.abs(d[2]) ? 0 : Math.abs(d[1]) >= Math.abs(d[2]) ? 1 : 2;
  const point: Vec3 = [prev[0], prev[1], prev[2]];
  point[i] = p[i];
  return { point, axis: (['x', 'y', 'z'] as const)[i] };
};

const KINDS = new Set<BimMeasurementKind>([
  'distance',
  'elevation',
  'area',
  'angle',
  'slope',
  'perpendicular',
  'clearance',
  'bbox',
]);
const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const MIN_POINTS: Record<BimMeasurementKind, number> = {
  distance: 2,
  elevation: 1,
  area: 3,
  angle: 3,
  slope: 2,
  perpendicular: 2,
  clearance: 2,
  bbox: 2,
};

/** Đọc danh sách phép đo từ góc nhìn đã lưu: bỏ bản ghi hỏng, giới hạn số lượng */
export const sanitizeMeasurements = (raw: unknown, limit = 200): BimMeasurementRecord[] => {
  if (!Array.isArray(raw)) return [];
  const out: BimMeasurementRecord[] = [];
  for (const item of raw) {
    if (out.length >= limit) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<BimMeasurementRecord>;
    if (!r.kind || !KINDS.has(r.kind) || !Array.isArray(r.points)) continue;
    const points = r.points.filter(isVec3).slice(0, 500);
    if (points.length < MIN_POINTS[r.kind]) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `do-${out.length + 1}`,
      kind: r.kind,
      points,
      ...(isVec3(r.normal) ? { normal: r.normal } : {}),
      ...(r.approximate ? { approximate: true } : {}),
    });
  }
  return out;
};

let seq = 0;
export const newMeasurementId = () => `do-${Date.now().toString(36)}-${(seq++).toString(36)}`;
