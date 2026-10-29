// features/bim/lib/sectionOutline.ts
// Viền màu tại chỗ cắt: giao lưới tam giác của cấu kiện với các mặt phẳng cắt (thuần, kiểm thử được).
// Mặt phẳng theo quy ước THREE.Plane: normal·x + constant ≥ 0 là phần được giữ lại.

export type Vec3 = [number, number, number];
export interface ClipPlane {
  normal: Vec3;
  constant: number;
}

const dist = (p: ClipPlane, x: number, y: number, z: number) =>
  p.normal[0] * x + p.normal[1] * y + p.normal[2] * z + p.constant;

/**
 * Cắt đoạn thẳng [a, b] theo các nửa không gian giữ lại (trừ mặt `skip`).
 * Trả null nếu đoạn nằm hoàn toàn ở phần bị cắt bỏ.
 */
export const clipSegment = (a: Vec3, b: Vec3, planes: ClipPlane[], skip = -1): [Vec3, Vec3] | null => {
  let p = a;
  let q = b;
  for (let j = 0; j < planes.length; j++) {
    if (j === skip) continue;
    const da = dist(planes[j], p[0], p[1], p[2]);
    const db = dist(planes[j], q[0], q[1], q[2]);
    if (da < 0 && db < 0) return null;
    if (da >= 0 && db >= 0) continue;
    const t = da / (da - db);
    const m: Vec3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    if (da < 0) p = m;
    else q = m;
  }
  return [p, q];
};

/**
 * Giao tam giác (9 số/tam giác, toạ độ thế giới) với từng mặt cắt; mỗi đoạn được cắt tiếp bởi các mặt còn lại
 * (hộp cắt) và đẩy lệch `offset` mét vào phía giữ lại để không bị chính mặt cắt xén mất.
 * Ghi 6 số/đoạn vào `out`; dừng khi đủ `maxSegments`. Trả số đoạn đã ghi.
 */
export const appendSectionOutline = (
  tris: Float32Array,
  planes: ClipPlane[],
  out: number[],
  options: { offset?: number; maxSegments?: number } = {},
): number => {
  const offset = options.offset ?? 0.002;
  const max = options.maxSegments ?? Infinity;
  let written = 0;
  const v: Vec3[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const d = [0, 0, 0];
  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i];
    const len = Math.hypot(plane.normal[0], plane.normal[1], plane.normal[2]) || 1;
    const shift: Vec3 = [
      (plane.normal[0] / len) * offset,
      (plane.normal[1] / len) * offset,
      (plane.normal[2] / len) * offset,
    ];
    for (let t = 0; t + 8 < tris.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        v[k][0] = tris[t + k * 3];
        v[k][1] = tris[t + k * 3 + 1];
        v[k][2] = tris[t + k * 3 + 2];
        d[k] = dist(plane, v[k][0], v[k][1], v[k][2]);
      }
      const pos = (d[0] >= 0 ? 1 : 0) + (d[1] >= 0 ? 1 : 0) + (d[2] >= 0 ? 1 : 0);
      if (pos === 0 || pos === 3) continue;
      const pts: Vec3[] = [];
      for (let k = 0; k < 3; k++) {
        const a = k;
        const b = (k + 1) % 3;
        if (d[a] >= 0 === d[b] >= 0) continue;
        const s = d[a] / (d[a] - d[b]);
        pts.push([
          v[a][0] + (v[b][0] - v[a][0]) * s,
          v[a][1] + (v[b][1] - v[a][1]) * s,
          v[a][2] + (v[b][2] - v[a][2]) * s,
        ]);
      }
      if (pts.length !== 2) continue;
      const seg = planes.length > 1 ? clipSegment(pts[0], pts[1], planes, i) : (pts as [Vec3, Vec3]);
      if (!seg) continue;
      const [p, q] = seg;
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 1e-7) continue;
      out.push(p[0] + shift[0], p[1] + shift[1], p[2] + shift[2], q[0] + shift[0], q[1] + shift[1], q[2] + shift[2]);
      if (++written >= max) return written;
    }
  }
  return written;
};

/** Khung bao (min/max) có giao với mặt phẳng không — lọc cấu kiện trước khi đọc lưới tam giác */
export const boxTouchesPlane = (min: Vec3, max: Vec3, plane: ClipPlane) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? max[0] : min[0];
    const y = i & 2 ? max[1] : min[1];
    const z = i & 4 ? max[2] : min[2];
    const s = dist(plane, x, y, z);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return lo <= 0 && hi >= 0;
};

/** Khung bao có còn phần nào ở phía giữ lại của mọi mặt không */
export const boxInsideAll = (min: Vec3, max: Vec3, planes: ClipPlane[]) =>
  planes.every((plane) => {
    for (let i = 0; i < 8; i++) {
      const s = dist(plane, i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
      if (s >= 0) return true;
    }
    return false;
  });
