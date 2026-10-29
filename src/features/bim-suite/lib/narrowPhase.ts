// features/bim/lib/narrowPhase.ts
// Dò va chạm pha hẹp: sau khi khung bao (AABB) của hai cấu kiện giao nhau, kiểm tra lưới tam giác thật
// để loại các cặp "khung bao chạm nhưng hình không chạm" (VD ống chạy chéo qua góc khung bao của dầm).
//
// Lưới vào là mảng phẳng toạ độ thế giới, mỗi tam giác 9 số (ax,ay,az,bx,by,bz,cx,cy,cz).

export type Tris = Float32Array | number[];

export interface NarrowResult {
  /** 'cat_nhau': mặt hai cấu kiện cắt nhau · 'nam_trong': một cấu kiện nằm lọt trong cấu kiện kia */
  kind: 'cat_nhau' | 'nam_trong' | null;
  /** Số cặp tam giác đã so (để biết có bị cắt ngắn không) */
  tested: number;
  /** Quá nhiều cặp phải so → kết luận theo khung bao (không chắc chắn) */
  truncated: boolean;
}

const EPS = 1e-9;

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const tri = (t: Tris, i: number): [V, V, V] => [
  [t[i], t[i + 1], t[i + 2]],
  [t[i + 3], t[i + 4], t[i + 5]],
  [t[i + 6], t[i + 7], t[i + 8]],
];

/** Khoảng chiếu của tam giác lên đường giao hai mặt phẳng (Möller 1997) */
const interval = (p: [number, number, number], d: [number, number, number]): [number, number] | null => {
  // d: khoảng cách có dấu của 3 đỉnh tới mặt phẳng kia; p: chiếu 3 đỉnh lên đường giao
  const [d0, d1, d2] = d;
  const [p0, p1, p2] = p;
  const isect = (pa: number, pb: number, da: number, db: number) => pa + ((pb - pa) * da) / (da - db);
  if (d0 * d1 > 0) return [isect(p2, p0, d2, d0), isect(p2, p1, d2, d1)];
  if (d0 * d2 > 0) return [isect(p1, p0, d1, d0), isect(p1, p2, d1, d2)];
  if (d1 * d2 > 0 || d0 !== 0) return [isect(p0, p1, d0, d1), isect(p0, p2, d0, d2)];
  if (d1 !== 0) return [isect(p1, p0, d1, d0), isect(p1, p2, d1, d2)];
  if (d2 !== 0) return [isect(p2, p0, d2, d0), isect(p2, p1, d2, d1)];
  return null; // đồng phẳng
};

/** Hai tam giác có cắt nhau không (bỏ qua trường hợp đồng phẳng = chỉ tì mặt) */
export const trianglesIntersect = (a: [V, V, V], b: [V, V, V]): boolean => {
  const n2 = cross(sub(b[1], b[0]), sub(b[2], b[0]));
  const dd2 = -dot(n2, b[0]);
  const da: [number, number, number] = [dot(n2, a[0]) + dd2, dot(n2, a[1]) + dd2, dot(n2, a[2]) + dd2];
  const la = Math.max(1e-12, Math.hypot(...n2));
  const ta = da.map((x) => (Math.abs(x) / la < EPS ? 0 : x)) as [number, number, number];
  if (ta[0] * ta[1] > 0 && ta[0] * ta[2] > 0) return false;

  const n1 = cross(sub(a[1], a[0]), sub(a[2], a[0]));
  const dd1 = -dot(n1, a[0]);
  const db: [number, number, number] = [dot(n1, b[0]) + dd1, dot(n1, b[1]) + dd1, dot(n1, b[2]) + dd1];
  const lb = Math.max(1e-12, Math.hypot(...n1));
  const tb = db.map((x) => (Math.abs(x) / lb < EPS ? 0 : x)) as [number, number, number];
  if (tb[0] * tb[1] > 0 && tb[0] * tb[2] > 0) return false;

  const dir = cross(n1, n2);
  // Chiếu lên trục toạ độ lớn nhất của hướng giao tuyến (đủ để so khoảng)
  const ax =
    Math.abs(dir[0]) >= Math.abs(dir[1]) && Math.abs(dir[0]) >= Math.abs(dir[2])
      ? 0
      : Math.abs(dir[1]) >= Math.abs(dir[2])
        ? 1
        : 2;
  const ia = interval([a[0][ax], a[1][ax], a[2][ax]], ta);
  const ib = interval([b[0][ax], b[1][ax], b[2][ax]], tb);
  if (!ia || !ib) return false;
  const [a0, a1] = ia[0] <= ia[1] ? ia : [ia[1], ia[0]];
  const [b0, b1] = ib[0] <= ib[1] ? ib : [ib[1], ib[0]];
  return !(a1 < b0 || b1 < a0);
};

/** Tia từ điểm p theo hướng (lệch nhẹ để tránh trùng cạnh) cắt tam giác? (Möller–Trumbore) */
const rayHits = (p: V, d: V, t: [V, V, V]) => {
  const e1 = sub(t[1], t[0]);
  const e2 = sub(t[2], t[0]);
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const s = sub(p, t[0]);
  const u = inv * dot(s, h);
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = inv * dot(d, q);
  if (v < 0 || u + v > 1) return false;
  return inv * dot(e2, q) > 1e-9;
};

/** Điểm p nằm trong lưới kín `mesh`? (đếm số lần tia cắt mặt: lẻ = ở trong) */
export const pointInside = (p: V, mesh: Tris) => {
  const d: V = [0.5773, 0.5774, 0.5771];
  let n = 0;
  for (let i = 0; i + 8 < mesh.length; i += 9) if (rayHits(p, d, tri(mesh, i))) n++;
  return n % 2 === 1;
};

const triBox = (t: Tris, i: number) => {
  const minX = Math.min(t[i], t[i + 3], t[i + 6]);
  const minY = Math.min(t[i + 1], t[i + 4], t[i + 7]);
  const minZ = Math.min(t[i + 2], t[i + 5], t[i + 8]);
  const maxX = Math.max(t[i], t[i + 3], t[i + 6]);
  const maxY = Math.max(t[i + 1], t[i + 4], t[i + 7]);
  const maxZ = Math.max(t[i + 2], t[i + 5], t[i + 8]);
  return [minX, minY, minZ, maxX, maxY, maxZ];
};

const boxesOverlap = (a: number[], b: number[], tol: number) =>
  a[0] <= b[3] + tol &&
  a[3] + tol >= b[0] &&
  a[1] <= b[4] + tol &&
  a[4] + tol >= b[1] &&
  a[2] <= b[5] + tol &&
  a[5] + tol >= b[2];

const meshBox = (t: Tris) => {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 8 < t.length; i += 9) {
    const b = triBox(t, i);
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k], b[k]);
      box[k + 3] = Math.max(box[k + 3], b[k + 3]);
    }
  }
  return box;
};

/**
 * Kiểm tra va chạm thật giữa hai lưới.
 * `maxPairs`: giới hạn số cặp tam giác so sánh (cấu kiện rất chi tiết) — vượt quá thì trả truncated.
 */
export const meshesClash = (
  a: Tris,
  b: Tris,
  options: { tolerance?: number; maxPairs?: number } = {},
): NarrowResult => {
  const tol = options.tolerance ?? 0;
  const maxPairs = options.maxPairs ?? 400_000;
  if (a.length < 9 || b.length < 9) return { kind: null, tested: 0, truncated: false };
  const boxA = meshBox(a);
  const boxB = meshBox(b);
  if (!boxesOverlap(boxA, boxB, tol)) return { kind: null, tested: 0, truncated: false };
  // Vùng chồng lấn của hai khung bao: chỉ xét tam giác nằm trong vùng này
  const region = [
    Math.max(boxA[0], boxB[0]) - tol,
    Math.max(boxA[1], boxB[1]) - tol,
    Math.max(boxA[2], boxB[2]) - tol,
    Math.min(boxA[3], boxB[3]) + tol,
    Math.min(boxA[4], boxB[4]) + tol,
    Math.min(boxA[5], boxB[5]) + tol,
  ];
  const pick = (t: Tris) => {
    const out: number[] = [];
    for (let i = 0; i + 8 < t.length; i += 9) if (boxesOverlap(triBox(t, i), region, 0)) out.push(i);
    return out;
  };
  const ia = pick(a);
  const ib = pick(b);
  const boxesB = ib.map((j) => triBox(b, j));
  let tested = 0;
  for (const i of ia) {
    const ba = triBox(a, i);
    const ta = tri(a, i);
    for (let k = 0; k < ib.length; k++) {
      if (!boxesOverlap(ba, boxesB[k], tol)) continue;
      if (++tested > maxPairs) return { kind: 'cat_nhau', tested, truncated: true };
      if (trianglesIntersect(ta, tri(b, ib[k]))) return { kind: 'cat_nhau', tested, truncated: false };
    }
  }
  // Không có mặt nào cắt nhau: kiểm tra một cấu kiện nằm lọt trong cấu kiện kia
  const centerOf = (t: Tris): V => [(t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3, (t[2] + t[5] + t[8]) / 3];
  if (pointInside(centerOf(b), a) || pointInside(centerOf(a), b))
    return { kind: 'nam_trong', tested, truncated: false };
  return { kind: null, tested, truncated: false };
};

// ── Đánh giá va chạm thật / giả theo quy tắc (dùng trước khi hỏi AI) ─────────

const SOFT = new Set([
  'IFCSPACE',
  'IFCOPENINGELEMENT',
  'IFCVIRTUALELEMENT',
  'IFCANNOTATION',
  'IFCGRID',
  'IFCSITE',
  'IFCZONE',
]);
const FINISH = new Set(['IFCCOVERING', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE']);
const STRUCTURAL = new Set([
  'IFCBEAM',
  'IFCCOLUMN',
  'IFCSLAB',
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCFOOTING',
  'IFCPILE',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCSTAIR',
  'IFCRAMP',
  'IFCROOF',
]);
const MEP =
  /^IFC(PIPE|DUCT|CABLE|FLOW|DISTRIBUTION|AIRTERMINAL|SANITARY|LIGHT|VALVE|PUMP|FAN|ELECTRIC|OUTLET|ALARM|FIRESUPPRESSION|SPACEHEATER|UNITARY|TANK|BOILER|CHILLER)/;

export type ClashVerdict = 'that' | 'gia' | 'can_xem';

/** Phân loại nhanh: loại bỏ va chạm với đối tượng ảo/hoàn thiện, ưu tiên kết cấu × cơ điện cắm sâu */
export const triageClash = (
  catA: string,
  catB: string,
  depthM: number,
  kind: NarrowResult['kind'] | 'khung_bao',
): { verdict: ClashVerdict; reason: string } => {
  const a = (catA || '').toUpperCase();
  const b = (catB || '').toUpperCase();
  if (SOFT.has(a) || SOFT.has(b))
    return { verdict: 'gia', reason: 'Va chạm với đối tượng ảo (không gian, lỗ mở, lưới trục)' };
  if (kind === null) return { verdict: 'gia', reason: 'Khung bao chạm nhưng hình thật không chạm' };
  if (depthM < 0.005) return { verdict: 'gia', reason: 'Chồng lấn dưới 5 mm — sai số mô hình hóa' };
  if (FINISH.has(a) || FINISH.has(b)) return { verdict: 'can_xem', reason: 'Liên quan lớp hoàn thiện / nội thất' };
  const structA = STRUCTURAL.has(a);
  const structB = STRUCTURAL.has(b);
  const mepA = MEP.test(a);
  const mepB = MEP.test(b);
  if ((structA && mepB) || (structB && mepA)) {
    return depthM >= 0.02
      ? { verdict: 'that', reason: 'Cơ điện xuyên qua kết cấu — cần bố trí lỗ chờ hoặc đổi tuyến' }
      : { verdict: 'can_xem', reason: 'Cơ điện chạm nhẹ kết cấu' };
  }
  if (structA && structB)
    return { verdict: depthM >= 0.05 ? 'that' : 'can_xem', reason: 'Hai cấu kiện kết cấu chồng lên nhau' };
  if (mepA && mepB) return { verdict: depthM >= 0.01 ? 'that' : 'can_xem', reason: 'Hai tuyến cơ điện giao nhau' };
  return { verdict: 'can_xem', reason: 'Cần xem trực quan' };
};
