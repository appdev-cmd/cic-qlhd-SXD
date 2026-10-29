// features/bim/lib/clearance.ts
// Khoảng cách gần nhất giữa hai cấu kiện (khoảng hở thông thủy) trên lưới tam giác thật.
// Tam giác: 9 số/tam giác, toạ độ thế giới. Lọc cặp tam giác bằng khung bao từng tam giác để không phải
// so mọi cặp; vượt ngân sách tính toán thì lùi về khoảng cách giữa hai hộp bao (ghi rõ là gần đúng).

export type Vec3 = [number, number, number];

export interface ClearanceResult {
  distance: number;
  /** Điểm gần nhất trên cấu kiện A và B */
  a: Vec3;
  b: Vec3;
  /** false: tính theo hộp bao vì lưới quá nặng hoặc thiếu */
  exact: boolean;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dist2 = (a: Vec3, b: Vec3) => {
  const d = sub(a, b);
  return dot(d, d);
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Khung bao của một tập tam giác */
export const meshBounds = (tris: Float32Array): { min: Vec3; max: Vec3 } | null => {
  if (tris.length < 9) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
};

/** Khoảng cách và cặp điểm gần nhất giữa hai hộp bao trục song song (0 nếu giao nhau) */
export const boxDistance = (aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3): ClearanceResult => {
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    if (aMax[k] < bMin[k]) {
      a[k] = aMax[k];
      b[k] = bMin[k];
    } else if (bMax[k] < aMin[k]) {
      a[k] = aMin[k];
      b[k] = bMax[k];
    } else {
      // Chồng nhau theo trục này: lấy giữa vùng chồng
      const m = (Math.max(aMin[k], bMin[k]) + Math.min(aMax[k], bMax[k])) / 2;
      a[k] = m;
      b[k] = m;
    }
  }
  return { distance: Math.sqrt(dist2(a, b)), a, b, exact: false };
};

/** Điểm gần nhất trên tam giác ABC tới P (Ericson, Real-Time Collision Detection 5.1.5) */
export const closestPointOnTriangle = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 => {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  if (!Number.isFinite(denom)) return a; // tam giác suy biến
  return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
};

/** Cặp điểm gần nhất giữa hai đoạn thẳng P1Q1 và P2Q2 (Ericson 5.1.9) */
export const closestSegmentSegment = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): [Vec3, Vec3] => {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) return [p1, p2];
  if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return [add(p1, mul(d1, s)), add(p2, mul(d2, t))];
};

/** Đoạn PQ cắt tam giác ABC? Trả giao điểm hoặc null (Möller–Trumbore giới hạn trong đoạn) */
export const segmentTriangleIntersection = (p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 | null => {
  const dir = sub(q, p);
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = sub(p, a);
  const u = inv * dot(s, h);
  if (u < 0 || u > 1) return null;
  const qv = cross(s, e1);
  const v = inv * dot(dir, qv);
  if (v < 0 || u + v > 1) return null;
  const t = inv * dot(e2, qv);
  if (t < 0 || t > 1) return null;
  return add(p, mul(dir, t));
};

const tri = (arr: Float32Array, i: number): [Vec3, Vec3, Vec3] => [
  [arr[i], arr[i + 1], arr[i + 2]],
  [arr[i + 3], arr[i + 4], arr[i + 5]],
  [arr[i + 6], arr[i + 7], arr[i + 8]],
];

/** Khoảng cách nhỏ nhất giữa hai tam giác và cặp điểm tương ứng */
export const triangleTriangleClosest = (
  ta: [Vec3, Vec3, Vec3],
  tb: [Vec3, Vec3, Vec3],
): { d2: number; a: Vec3; b: Vec3 } => {
  // Giao nhau: một cạnh của tam giác này xuyên tam giác kia
  for (let k = 0; k < 3; k++) {
    const hitA = segmentTriangleIntersection(ta[k], ta[(k + 1) % 3], tb[0], tb[1], tb[2]);
    if (hitA) return { d2: 0, a: hitA, b: hitA };
    const hitB = segmentTriangleIntersection(tb[k], tb[(k + 1) % 3], ta[0], ta[1], ta[2]);
    if (hitB) return { d2: 0, a: hitB, b: hitB };
  }
  let best = { d2: Infinity, a: ta[0], b: tb[0] };
  const consider = (a: Vec3, b: Vec3) => {
    const d = dist2(a, b);
    if (d < best.d2) best = { d2: d, a, b };
  };
  for (let k = 0; k < 3; k++) {
    consider(ta[k], closestPointOnTriangle(ta[k], tb[0], tb[1], tb[2]));
    consider(closestPointOnTriangle(tb[k], ta[0], ta[1], ta[2]), tb[k]);
    for (let m = 0; m < 3; m++) {
      const [pa, pb] = closestSegmentSegment(ta[k], ta[(k + 1) % 3], tb[m], tb[(m + 1) % 3]);
      consider(pa, pb);
    }
  }
  return best;
};

const triBoxes = (arr: Float32Array) => {
  const n = Math.floor(arr.length / 9);
  const out = new Float64Array(n * 6);
  for (let t = 0; t < n; t++) {
    const i = t * 9;
    for (let k = 0; k < 3; k++) {
      const a = arr[i + k];
      const b = arr[i + 3 + k];
      const c = arr[i + 6 + k];
      out[t * 6 + k] = Math.min(a, b, c);
      out[t * 6 + 3 + k] = Math.max(a, b, c);
    }
  }
  return out;
};

/** Bình phương khoảng cách giữa hai hộp (cận dưới cho mọi cặp điểm bên trong) */
const boxGap2 = (a: Float64Array, ai: number, b: Float64Array | number[], bi: number) => {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const gap = Math.max(0, b[bi + k] - a[ai + 3 + k], a[ai + k] - b[bi + 3 + k]);
    s += gap * gap;
  }
  return s;
};

/**
 * Khoảng cách gần nhất giữa hai lưới tam giác.
 * `budget`: số cặp tam giác tối đa được phép kiểm tra chi tiết; vượt quá → trả kết quả theo hộp bao (exact = false).
 */
export const meshClearance = (a: Float32Array, b: Float32Array, budget = 1_500_000): ClearanceResult | null => {
  const ba = meshBounds(a);
  const bb = meshBounds(b);
  if (!ba || !bb) return null;
  const approx = boxDistance(ba.min, ba.max, bb.min, bb.max);
  const boxesA = triBoxes(a);
  const boxesB = triBoxes(b);
  const na = boxesA.length / 6;
  const nb = boxesB.length / 6;
  const whole = [...bb.min, ...bb.max];
  const wholeA = [...ba.min, ...ba.max];
  // Thứ tự xét: tam giác gần cấu kiện kia trước → cận trên giảm nhanh, cắt tỉa được nhiều cặp
  const orderA = Array.from({ length: na }, (_, i) => i)
    .map((i) => ({ i, g: boxGap2(boxesA, i * 6, whole, 0) }))
    .sort((x, y) => x.g - y.g);
  const orderB = Array.from({ length: nb }, (_, i) => i)
    .map((i) => ({ i, g: boxGap2(boxesB, i * 6, wholeA, 0) }))
    .sort((x, y) => x.g - y.g);
  let best: { d2: number; a: Vec3; b: Vec3 } | null = null;
  let work = 0;
  for (const { i, g } of orderA) {
    if (best && g >= best.d2) break;
    for (const { i: j, g: gb } of orderB) {
      if (best && gb >= best.d2) break;
      if (best && boxGap2(boxesA, i * 6, boxesB, j * 6) >= best.d2) continue;
      if (++work > budget) return approx;
      const r = triangleTriangleClosest(tri(a, i * 9), tri(b, j * 9));
      if (!best || r.d2 < best.d2) best = r;
      if (best.d2 === 0) return { distance: 0, a: best.a, b: best.b, exact: true };
    }
  }
  if (!best) return approx;
  return { distance: Math.sqrt(best.d2), a: best.a, b: best.b, exact: true };
};
