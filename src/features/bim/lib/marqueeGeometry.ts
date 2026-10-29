// features/bim/lib/marqueeGeometry.ts
// Quét chọn khung chữ nhật: lọc cấu kiện đang hiện và kiểm tra hình chiếu thật của lưới tam giác
// (quét chạm/Crossing) thay vì chỉ 8 góc hộp bao — cấu kiện xiên/dài không còn bị chọn nhầm.

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface VisibilityLike {
  isolated: ReadonlySet<number> | null;
  hidden: ReadonlySet<number>;
  filterHidden?: ReadonlySet<number>;
  classificationHidden?: ReadonlySet<number>;
  annotationHidden?: ReadonlySet<number>;
  contextOnly?: ReadonlySet<number>;
}

/** Cấu kiện đang thật sự hiện: không bị ẩn tay, lọc, phân loại, cô lập hay ẩn bởi mô phỏng 4D */
export const isItemShown = (
  id: number,
  state: VisibilityLike | undefined,
  colorHidden?: ReadonlySet<number>,
  floorIsolated?: ReadonlySet<number> | null,
) => {
  if (colorHidden?.has(id)) return false;
  if (floorIsolated && !floorIsolated.has(id)) return false;
  if (!state) return true;
  if (state.isolated && !state.isolated.has(id)) return false;
  return !(
    state.hidden.has(id) ||
    state.filterHidden?.has(id) ||
    state.classificationHidden?.has(id) ||
    state.annotationHidden?.has(id) ||
    state.contextOnly?.has(id)
  );
};

const inRect = (x: number, y: number, r: ScreenRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

const segmentsCross = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) => {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
};

const pointInTriangle = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) => {
  const d1 = orient(px, py, ax, ay, bx, by);
  const d2 = orient(px, py, bx, by, cx, cy);
  const d3 = orient(px, py, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

/** Tam giác 2D giao hình chữ nhật (đỉnh trong khung, góc khung trong tam giác, hoặc cạnh cắt nhau) */
export const triangleIntersectsRect = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: ScreenRect,
) => {
  if (inRect(ax, ay, r) || inRect(bx, by, r) || inRect(cx, cy, r)) return true;
  if (
    Math.max(ax, bx, cx) < r.left ||
    Math.min(ax, bx, cx) > r.right ||
    Math.max(ay, by, cy) < r.top ||
    Math.min(ay, by, cy) > r.bottom
  )
    return false;
  const corners: [number, number][] = [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.bottom],
    [r.left, r.bottom],
  ];
  if (corners.some(([x, y]) => pointInTriangle(x, y, ax, ay, bx, by, cx, cy))) return true;
  const tri: [number, number][] = [
    [ax, ay],
    [bx, by],
    [cx, cy],
  ];
  for (let i = 0; i < 3; i++) {
    const [p, q] = [tri[i], tri[(i + 1) % 3]];
    for (let k = 0; k < 4; k++) {
      const [c, d] = [corners[k], corners[(k + 1) % 4]];
      if (segmentsCross(p[0], p[1], q[0], q[1], c[0], c[1], d[0], d[1])) return true;
    }
  }
  return false;
};

/**
 * Hình chiếu của lưới tam giác (toạ độ thế giới) có chạm khung quét không.
 * `m`: ma trận chiếu × nhìn (16 số, cột trước như THREE.Matrix4.elements).
 * Tam giác có đỉnh nằm sau camera bị bỏ qua (hộp bao đã được kiểm tra trước đó).
 */
export const trianglesHitRect = (
  tris: Float32Array,
  m: ArrayLike<number>,
  width: number,
  height: number,
  r: ScreenRect,
) => {
  const sx = [0, 0, 0];
  const sy = [0, 0, 0];
  for (let t = 0; t + 8 < tris.length; t += 9) {
    let behind = false;
    for (let k = 0; k < 3; k++) {
      const x = tris[t + k * 3];
      const y = tris[t + k * 3 + 1];
      const z = tris[t + k * 3 + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 1e-6) {
        behind = true;
        break;
      }
      const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      sx[k] = ((nx + 1) / 2) * width;
      sy[k] = ((1 - ny) / 2) * height;
    }
    if (behind) continue;
    if (triangleIntersectsRect(sx[0], sy[0], sx[1], sy[1], sx[2], sy[2], r)) return true;
  }
  return false;
};
