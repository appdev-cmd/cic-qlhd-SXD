// features/bim/lib/sectionCaps.ts
// Nắp cắt: tô kín mặt cắt của từng cấu kiện (thuần, kiểm thử được).
//
// Vì sao không dùng kỹ thuật stencil của three.js: Fragments phát trực tuyến các ô hình học (tile) và vẽ cấu kiện
// ở xa bằng LOD dạng đường/hộp (không phải khối kín), nên phép đếm mặt trước/mặt sau theo stencil cho kết quả sai;
// renderer hậu kỳ (PostproductionRenderer) vẽ cảnh vào render target không có stencil buffer; và mỗi mặt cắt cần
// thêm hai lượt vẽ toàn cảnh mỗi khung hình (hộp cắt 6 mặt = 12 lượt). Thay vào đó, nắp được dựng một lần trên CPU
// khi mặt cắt dừng thay đổi: giao lưới tam giác của cấu kiện với mặt phẳng → nối đoạn thành vòng kín → xác định
// vòng ngoài/lỗ theo độ lồng → tam giác hoá (earcut của three.js). Lưới nắp là mesh thường nên đi qua hậu kỳ,
// có độ sâu đúng và các mặt cắt khác của hộp cắt xén nắp trên GPU (clipping planes toàn cục).

import { ShapeUtils, Vector2 } from 'three';

export type Vec3 = [number, number, number];
export interface CapPlane {
  normal: Vec3;
  constant: number;
}

export interface PlaneBasis {
  /** Pháp tuyến đơn vị */
  n: Vec3;
  /** Hai trục trong mặt phẳng, u × v = n */
  u: Vec3;
  v: Vec3;
  /** Điểm gốc trên mặt phẳng (−constant·n sau chuẩn hoá) */
  origin: Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Hệ trục 2D trên mặt phẳng cắt; null nếu pháp tuyến suy biến */
export const planeBasis = (plane: CapPlane): PlaneBasis | null => {
  const l = len(plane.normal);
  if (!(l > 1e-9)) return null;
  const n: Vec3 = [plane.normal[0] / l, plane.normal[1] / l, plane.normal[2] / l];
  const c = plane.constant / l;
  // Trục phụ ít song song với n nhất
  const ref: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0 = cross(ref, n);
  const lu = len(u0);
  const u: Vec3 = [u0[0] / lu, u0[1] / lu, u0[2] / lu];
  const v = cross(n, u);
  return { n, u, v, origin: [-c * n[0], -c * n[1], -c * n[2]] };
};

/** Toạ độ 2D của điểm (đã nằm trên mặt phẳng) theo hệ trục u, v */
export const toPlane2D = (b: PlaneBasis, p: Vec3): [number, number] => {
  const d: Vec3 = [p[0] - b.origin[0], p[1] - b.origin[1], p[2] - b.origin[2]];
  return [d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2], d[0] * b.v[0] + d[1] * b.v[1] + d[2] * b.v[2]];
};

/** Điểm 3D từ toạ độ 2D, lệch `offset` mét theo pháp tuyến (vào phía giữ lại) */
export const fromPlane2D = (b: PlaneBasis, x: number, y: number, offset = 0): Vec3 => [
  b.origin[0] + b.u[0] * x + b.v[0] * y + b.n[0] * offset,
  b.origin[1] + b.u[1] * x + b.v[1] * y + b.n[1] * offset,
  b.origin[2] + b.u[2] * x + b.v[2] * y + b.n[2] * offset,
];

/**
 * Giao các tam giác (9 số/tam giác) với mặt phẳng, trả các đoạn 2D (4 số/đoạn).
 * Giao điểm trên một cạnh luôn nội suy theo thứ tự đỉnh cố định nên hai tam giác chung cạnh cho cùng một điểm.
 */
export const sliceTriangles = (tris: ArrayLike<number>, b: PlaneBasis): number[] => {
  const out: number[] = [];
  const n = b.n;
  const c = -(n[0] * b.origin[0] + n[1] * b.origin[1] + n[2] * b.origin[2]);
  const P: Vec3[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const d = [0, 0, 0];
  const pts: Vec3[] = [];
  for (let t = 0; t + 8 < tris.length; t += 9) {
    let pos = 0;
    for (let k = 0; k < 3; k++) {
      const x = tris[t + k * 3];
      const y = tris[t + k * 3 + 1];
      const z = tris[t + k * 3 + 2];
      P[k][0] = x;
      P[k][1] = y;
      P[k][2] = z;
      d[k] = n[0] * x + n[1] * y + n[2] * z + c;
      if (d[k] >= 0) pos++;
    }
    if (pos === 0 || pos === 3) continue;
    pts.length = 0;
    for (let k = 0; k < 3; k++) {
      let a = k;
      let e = (k + 1) % 3;
      if (d[a] >= 0 === d[e] >= 0) continue;
      // Thứ tự cố định theo toạ độ để cạnh chung cho kết quả giống hệt nhau
      const A = P[a];
      const E = P[e];
      if (A[0] > E[0] || (A[0] === E[0] && (A[1] > E[1] || (A[1] === E[1] && A[2] > E[2])))) {
        const tmp = a;
        a = e;
        e = tmp;
      }
      const s = d[a] / (d[a] - d[e]);
      pts.push([
        P[a][0] + (P[e][0] - P[a][0]) * s,
        P[a][1] + (P[e][1] - P[a][1]) * s,
        P[a][2] + (P[e][2] - P[a][2]) * s,
      ]);
    }
    if (pts.length !== 2) continue;
    const p = toPlane2D(b, pts[0]);
    const q = toPlane2D(b, pts[1]);
    if (p[0] === q[0] && p[1] === q[1]) continue;
    out.push(p[0], p[1], q[0], q[1]);
  }
  return out;
};

/**
 * Nối các đoạn 2D thành vòng kín (mỗi vòng: mảng phẳng x, y, ...). Đầu mút trùng nhau trong dung sai `tol`
 * được coi là một nút. Chuỗi hở mà hai đầu cách nhau ≤ `closeTol` vẫn được khép; chuỗi hở khác bị bỏ.
 */
export const chainLoops = (segs: number[], tol = 1e-5, closeTol = tol * 20): number[][] => {
  const count = segs.length / 4;
  if (count < 3) return [];
  const keyOf = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const nodes = new Map<string, number[]>();
  const keys: string[] = new Array(count * 2);
  for (let i = 0; i < count; i++) {
    for (let e = 0; e < 2; e++) {
      const key = keyOf(segs[i * 4 + e * 2], segs[i * 4 + e * 2 + 1]);
      keys[i * 2 + e] = key;
      const list = nodes.get(key);
      if (list) list.push(i * 2 + e);
      else nodes.set(key, [i * 2 + e]);
    }
  }
  const used = new Uint8Array(count);
  const loops: number[][] = [];
  for (let start = 0; start < count; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const loop = [segs[start * 4], segs[start * 4 + 1]];
    const startKey = keys[start * 2];
    let endpoint = start * 2 + 1; // đầu mút đang đi tới
    let closed = false;
    for (let guard = 0; guard < count; guard++) {
      const key = keys[endpoint];
      if (key === startKey) {
        closed = true;
        break;
      }
      const seg = endpoint >> 1;
      const end = endpoint & 1;
      loop.push(segs[seg * 4 + end * 2], segs[seg * 4 + end * 2 + 1]);
      const next = nodes.get(key)?.find((h) => !used[h >> 1]);
      if (next === undefined) break;
      used[next >> 1] = 1;
      endpoint = next ^ 1; // đầu còn lại của đoạn kế tiếp
    }
    if (!closed) {
      const n = loop.length;
      if (n < 6 || Math.hypot(loop[n - 2] - loop[0], loop[n - 1] - loop[1]) > closeTol) continue;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
};

/** Diện tích có dấu (dương = ngược chiều kim đồng hồ) */
export const signedArea = (loop: number[]) => {
  let s = 0;
  const n = loop.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    s += loop[i] * loop[j + 1] - loop[j] * loop[i + 1];
  }
  return s / 2;
};

export const pointInLoop = (x: number, y: number, loop: number[]) => {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = loop[i];
    const yi = loop[i + 1];
    const xj = loop[j];
    const yj = loop[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Gom vòng thành đa giác có lỗ theo độ lồng: lồng chẵn = vòng ngoài, lẻ = lỗ của vòng chứa nhỏ nhất */
export const nestLoops = (loops: number[][]): { outer: number[]; holes: number[][] }[] => {
  const items = loops
    .map((loop) => ({ loop, area: Math.abs(signedArea(loop)) }))
    .filter((l) => l.area > 1e-12)
    .sort((a, b) => b.area - a.area);
  const depth: number[] = [];
  const parent: number[] = [];
  items.forEach((item, i) => {
    // Điểm thử: trung điểm cạnh đầu (tránh trùng đỉnh của vòng khác)
    const x = (item.loop[0] + item.loop[2]) / 2;
    const y = (item.loop[1] + item.loop[3]) / 2;
    let d = 0;
    let p = -1;
    for (let j = 0; j < i; j++) {
      if (pointInLoop(x, y, items[j].loop)) {
        d++;
        p = j; // vòng chứa sau cùng (đã sắp giảm dần) là vòng nhỏ nhất
      }
    }
    depth.push(d);
    parent.push(p);
  });
  const polys = new Map<number, { outer: number[]; holes: number[][] }>();
  items.forEach((item, i) => {
    if (depth[i] % 2 === 0) polys.set(i, { outer: item.loop, holes: [] });
  });
  items.forEach((item, i) => {
    if (depth[i] % 2 === 1) polys.get(parent[i])?.holes.push(item.loop);
  });
  return [...polys.values()];
};

const toVectors = (loop: number[]) => {
  const out: Vector2[] = [];
  for (let i = 0; i < loop.length; i += 2) out.push(new Vector2(loop[i], loop[i + 1]));
  return out;
};

/** Tam giác hoá đa giác có lỗ, trả toạ độ 2D phẳng (6 số/tam giác) */
export const triangulatePolygon = (outer: number[], holes: number[][]): number[] => {
  const contour = toVectors(outer);
  const holeVecs = holes.map(toVectors);
  const faces = ShapeUtils.triangulateShape(contour, holeVecs);
  const all = [...contour, ...holeVecs.flat()];
  const out: number[] = [];
  for (const f of faces) {
    for (const k of f) {
      const p = all[k];
      if (!p) continue;
      out.push(p.x, p.y);
    }
  }
  return out;
};

export interface CapBuildOptions {
  /** Lệch nắp vào phía giữ lại (m) để không bị chính mặt cắt xén */
  offset?: number;
  /** Dung sai nối đầu mút (m) */
  tol?: number;
  /** Bước vân gạch chéo (m) cho toạ độ UV */
  hatch?: number;
  /** Ghi pháp tuyến (3 số/đỉnh) hướng về phía bị cắt bỏ — phía người xem nhìn vào mặt cắt */
  normals?: number[];
}

/**
 * Nắp cắt của một cấu kiện trên một mặt phẳng: ghi vị trí (9 số/tam giác) và UV (6 số/tam giác) vào mảng ra.
 * Trả số tam giác đã ghi.
 */
export const appendSectionCap = (
  tris: ArrayLike<number>,
  plane: CapPlane,
  positions: number[],
  uvs: number[] | null,
  options: CapBuildOptions = {},
): number => {
  const b = planeBasis(plane);
  if (!b) return 0;
  const segs = sliceTriangles(tris, b);
  if (segs.length < 12) return 0;
  const loops = chainLoops(segs, options.tol ?? 1e-5);
  if (!loops.length) return 0;
  const offset = options.offset ?? 0.003;
  const hatch = options.hatch ?? 0.25;
  let written = 0;
  for (const poly of nestLoops(loops)) {
    const flat = triangulatePolygon(poly.outer, poly.holes);
    for (let i = 0; i + 5 < flat.length; i += 6) {
      for (let k = 0; k < 3; k++) {
        const x = flat[i + k * 2];
        const y = flat[i + k * 2 + 1];
        const p = fromPlane2D(b, x, y, offset);
        positions.push(p[0], p[1], p[2]);
        uvs?.push(x / hatch, y / hatch);
        options.normals?.push(-b.n[0], -b.n[1], -b.n[2]);
      }
      written++;
    }
  }
  return written;
};

/** Tổng diện tích các tam giác nắp (m²) — dùng cho kiểm thử và thống kê */
export const capArea = (positions: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a: Vec3 = [
      positions[i + 3] - positions[i],
      positions[i + 4] - positions[i + 1],
      positions[i + 5] - positions[i + 2],
    ];
    const c: Vec3 = [
      positions[i + 6] - positions[i],
      positions[i + 7] - positions[i + 1],
      positions[i + 8] - positions[i + 2],
    ];
    s += len(cross(a, c)) / 2;
  }
  return s;
};

/** Màu nắp theo bộ môn (vân gạch chéo nhân với màu này); bộ môn khác dùng xám trung tính */
export const CAP_COLORS: Record<string, string> = {
  KIEN_TRUC: '#d6b48a',
  KET_CAU: '#a3a3a3',
  MEP: '#7cc0de',
  THONG_TIN_TIN_HIEU: '#b9a3e3',
  CAU: '#b8a58c',
  HAM: '#9fb39a',
  NHA_GA: '#d6b48a',
  DUONG_RAY: '#a89c8f',
};
export const CAP_NEUTRAL = '#b4b4b4';
export const capColor = (discipline: string | null | undefined) =>
  (discipline && CAP_COLORS[discipline]) || CAP_NEUTRAL;
