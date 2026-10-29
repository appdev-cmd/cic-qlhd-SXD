// features/bim/lib/measureMath.ts
// Phép tính đo đạc trên mô hình (không phụ thuộc trình xem để kiểm thử được).
// Hệ trục Fragments: Y hướng lên (tương ứng trục Z của IFC).

import { formatNumber } from '../../../lib/utils';
export type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

export const distance = (a: Vec3, b: Vec3) => len(sub(a, b));

/** Diện tích đa giác phẳng (hoặc gần phẳng) trong không gian — công thức Newell */
export const polygonArea = (points: Vec3[]) => {
  if (points.length < 3) return 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1, z1] = points[i];
    const [x2, y2, z2] = points[(i + 1) % points.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
};

/** Chu vi đa giác khép kín */
export const polygonPerimeter = (points: Vec3[]) =>
  points.length < 2 ? 0 : points.reduce((s, p, i) => s + distance(p, points[(i + 1) % points.length]), 0);

/** Diện tích hình chiếu bằng (mặt bằng XZ) — dùng cho diện tích sàn khi các điểm không cùng cao độ */
export const planArea = (points: Vec3[]) => {
  if (points.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a[0] * b[2] - b[0] * a[2];
  }
  return Math.abs(s) / 2;
};

/** Góc tại đỉnh B giữa hai tia BA và BC (độ) */
export const angleAt = (a: Vec3, b: Vec3, c: Vec3) => {
  const u = sub(a, b);
  const v = sub(c, b);
  const lu = len(u);
  const lv = len(v);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, dot(u, v) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
};

/** Độ dốc giữa hai điểm: chênh cao / chiều dài bằng */
export const slope = (a: Vec3, b: Vec3) => {
  const rise = b[1] - a[1];
  const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const degrees = (Math.atan2(Math.abs(rise), run) * 180) / Math.PI;
  return {
    rise,
    run,
    percent: run < 1e-9 ? Infinity : (Math.abs(rise) / run) * 100,
    degrees,
    /** Tỉ lệ 1:n (n = chiều dài bằng / chênh cao) */
    ratio: Math.abs(rise) < 1e-9 ? Infinity : run / Math.abs(rise),
  };
};

/** Khoảng cách vuông góc từ điểm P tới mặt phẳng đi qua O có pháp tuyến n */
export const distanceToPlane = (p: Vec3, origin: Vec3, normal: Vec3) => {
  const ln = len(normal);
  if (ln < 1e-9) return distance(p, origin);
  return Math.abs(dot(sub(p, origin), normal)) / ln;
};

/** Chân đường vuông góc hạ từ P xuống mặt phẳng (O, n) */
export const projectOnPlane = (p: Vec3, origin: Vec3, normal: Vec3): Vec3 => {
  const ln2 = dot(normal, normal);
  if (ln2 < 1e-12) return origin;
  const t = dot(sub(p, origin), normal) / ln2;
  return [p[0] - normal[0] * t, p[1] - normal[1] * t, p[2] - normal[2] * t];
};

/** Tâm hình học các điểm (vị trí đặt nhãn) */
export const centroid = (points: Vec3[]): Vec3 => {
  const n = Math.max(points.length, 1);
  const s = points.reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  return [s[0] / n, s[1] / n, s[2] / n];
};

export type SnapKind = 'dinh' | 'trung_diem' | 'canh' | 'mat';

/**
 * Chọn điểm bắt từ kết quả dò tia có bắt điểm.
 * Ưu tiên đỉnh → trung điểm cạnh (nếu con trỏ gần trung điểm) → cạnh → mặt.
 * `toleranceWorld`: khoảng cách (m) coi là "gần" trung điểm, tính theo cỡ điểm ảnh tại vị trí đó.
 */
export const pickSnap = (
  hits: { kind: 'point' | 'line' | 'face'; point: Vec3; edge?: [Vec3, Vec3]; distance: number }[],
  toleranceWorld: number,
): { kind: SnapKind; point: Vec3 } | null => {
  if (hits.length === 0) return null;
  // Chỉ xét các điểm quanh bề mặt gần nhất — tránh bắt vào đỉnh nằm phía sau
  const nearest = Math.min(...hits.map((h) => h.distance));
  const front = hits.filter((h) => h.distance <= nearest + Math.max(toleranceWorld * 4, 0.05));
  const vertex = front.find((h) => h.kind === 'point');
  if (vertex) return { kind: 'dinh', point: vertex.point };
  const line = front.find((h) => h.kind === 'line');
  if (line) {
    if (line.edge) {
      const mid: Vec3 = [
        (line.edge[0][0] + line.edge[1][0]) / 2,
        (line.edge[0][1] + line.edge[1][1]) / 2,
        (line.edge[0][2] + line.edge[1][2]) / 2,
      ];
      if (distance(mid, line.point) <= toleranceWorld * 1.5) return { kind: 'trung_diem', point: mid };
    }
    return { kind: 'canh', point: line.point };
  }
  const face = front.find((h) => h.kind === 'face') || front[0];
  return { kind: 'mat', point: face.point };
};

export const fmtLen = (m: number, digits = 3) => `${formatNumber(m, digits)} m`;
export const fmtArea = (m2: number) => `${formatNumber(m2, 2)} m²`;
export const fmtDeg = (d: number) => `${formatNumber(d, 1)}°`;
