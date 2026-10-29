// Giờ nắng và bóng đổ trên bề mặt trên cùng (sân, mái) bằng dò tia qua cây BVH dựng từ tam giác thật của mô hình.
// Phân tích sơ bộ giai đoạn đầu (như giờ nắng của Forma), không thay mô phỏng đạt chuẩn.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface Box3Like {
  min: [number, number, number];
  max: [number, number, number];
}

/** Gộp các mảng tam giác (9 số/tam giác, toạ độ thế giới) thành một cây BVH. */
export function buildObstacleBvh(parts: Float32Array[]): { bvh: MeshBVH; triangles: number } {
  let length = 0;
  for (const p of parts) length += p.length - (p.length % 9);
  const positions = new Float32Array(length);
  let o = 0;
  for (const p of parts) {
    const n = p.length - (p.length % 9);
    positions.set(n === p.length ? p : p.subarray(0, n), o);
    o += n;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return { bvh: new MeshBVH(geometry), triangles: length / 9 };
}

export interface SampleGrid {
  /** x, y, z của từng điểm mẫu (đã nhấc khỏi bề mặt một khoảng nhỏ). */
  points: Float32Array;
  count: number;
  /** Bước lưới thực dùng, mét (có thể lớn hơn bước yêu cầu để giữ số điểm trong giới hạn). */
  step: number;
  /** Cao độ mặt đất: cao độ bề mặt gặp nhiều nhất (theo dải 0,5 m). Điểm cao hơn > 2 m coi là mái. */
  groundY: number;
}

const LIFT = 0.05;

/** Bước lưới đủ lớn để số ô không vượt `maxPoints`. */
export function gridStep(widthX: number, depthZ: number, requested: number, maxPoints: number) {
  const area = Math.max(widthX, 0) * Math.max(depthZ, 0);
  return Math.max(requested, Math.sqrt(area / Math.max(maxPoints, 1)));
}

/** Lưới mẫu nhìn từ trên xuống: mỗi ô bắn một tia thẳng đứng tìm bề mặt trên cùng. Ô không chạm gì bị bỏ. */
export function sampleTopSurfaces(bvh: MeshBVH, box: Box3Like, requestedStep: number, maxPoints = 20_000): SampleGrid {
  const [minX, , minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;
  const step = gridStep(maxX - minX, maxZ - minZ, requestedStep, maxPoints);
  const nx = Math.max(1, Math.floor((maxX - minX) / step));
  const nz = Math.max(1, Math.floor((maxZ - minZ) / step));
  const out = new Float32Array(nx * nz * 3);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  let count = 0;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = minX + (i + 0.5) * step;
      const z = minZ + (k + 0.5) * step;
      ray.origin.set(x, maxY + 1, z);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!hit) continue;
      out[count * 3] = x;
      out[count * 3 + 1] = hit.point.y + LIFT;
      out[count * 3 + 2] = z;
      count++;
    }
  }
  const points = out.slice(0, count * 3);
  return { points, count, step, groundY: modalHeight(points, count) };
}

/** Cao độ gặp nhiều nhất (dải 0,5 m): mặt sân chiếm phần lớn ô, không bị hồ, tầng hầm hay đế địa hình thấp hơn kéo xuống. */
export function modalHeight(points: Float32Array, count: number, bin = 0.5): number {
  if (!count) return 0;
  const bins = new Map<number, { n: number; sum: number }>();
  for (let p = 0; p < count; p++) {
    const y = points[p * 3 + 1] - LIFT;
    const k = Math.round(y / bin);
    const b = bins.get(k) ?? { n: 0, sum: 0 };
    b.n++;
    b.sum += y;
    bins.set(k, b);
  }
  let best = { n: 0, sum: 0 };
  for (const b of bins.values()) if (b.n > best.n) best = b;
  return best.sum / best.n;
}

export interface SunRunOptions {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

/**
 * Điểm nào có nắng ở từng bước thời gian: lit[s * count + p] = 1 khi tia từ điểm p về mặt trời ở bước s không bị chặn.
 * Bước có `dir` null (mặt trời dưới chân trời) để toàn 0.
 */
export function sunlitMatrix(
  bvh: MeshBVH,
  grid: SampleGrid,
  dirs: ([number, number, number] | null)[],
  opts: SunRunOptions = {},
): Uint8Array {
  const lit = new Uint8Array(dirs.length * grid.count);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  const total = dirs.length * grid.count;
  for (let s = 0; s < dirs.length; s++) {
    const d = dirs[s];
    if (!d) continue;
    ray.direction.set(d[0], d[1], d[2]).normalize();
    for (let p = 0; p < grid.count; p++) {
      ray.origin
        .set(grid.points[p * 3], grid.points[p * 3 + 1], grid.points[p * 3 + 2])
        .addScaledVector(ray.direction, LIFT);
      if (!bvh.raycastFirst(ray, THREE.DoubleSide)) lit[s * grid.count + p] = 1;
    }
    if (opts.isCancelled?.()) break;
    opts.onProgress?.((s + 1) * grid.count, total);
  }
  return lit;
}

/** Tổng giờ nắng của từng điểm. */
export function sunHoursFromLit(lit: Uint8Array, count: number, steps: number, stepHours: number): Float32Array {
  const hours = new Float32Array(count);
  for (let s = 0; s < steps; s++) for (let p = 0; p < count; p++) if (lit[s * count + p]) hours[p] += stepHours;
  return hours;
}

export interface SunStats {
  mean: number;
  max: number;
  /** Tỷ lệ diện tích (theo số ô) có ít nhất 2 giờ / 4 giờ nắng, %. */
  atLeast2h: number;
  atLeast4h: number;
  /** Số ô mái (cao hơn mặt đất > 2 m) và mặt đất. */
  roofCells: number;
  groundCells: number;
}

export function sunStats(hours: Float32Array, grid: SampleGrid): SunStats {
  const n = hours.length;
  if (!n) return { mean: 0, max: 0, atLeast2h: 0, atLeast4h: 0, roofCells: 0, groundCells: 0 };
  let sum = 0,
    max = 0,
    h2 = 0,
    h4 = 0,
    roof = 0;
  for (let p = 0; p < n; p++) {
    const h = hours[p];
    sum += h;
    if (h > max) max = h;
    if (h >= 2 - 1e-6) h2++;
    if (h >= 4 - 1e-6) h4++;
    if (grid.points[p * 3 + 1] - grid.groundY > 2 + LIFT) roof++;
  }
  const pct = (v: number) => Math.round((v / n) * 1000) / 10;
  return {
    mean: Math.round((sum / n) * 100) / 100,
    max,
    atLeast2h: pct(h2),
    atLeast4h: pct(h4),
    roofCells: roof,
    groundCells: n - roof,
  };
}

/**
 * Thang thứ bậc một sắc cam (sắc tuần tự thứ hai của phân hệ, sau xanh của carbon): nhạt = ít giờ nắng, đậm = nhiều.
 * Đã kiểm định --ordinal trên nền sáng và tối (đơn điệu độ sáng, khoảng cách bậc, tương phản đầu thang).
 */
export const SUN_RAMP = ['#f29a6c', '#e8763e', '#cf5720', '#a84216', '#8a3311'] as const;
/** Chế độ bóng đổ: hai trạng thái, luôn kèm chú giải chữ. */
export const SHADE_COLOR = '#475569';
export const LIT_COLOR = '#e8763e';

/** Ngưỡng chia 5 lớp màu theo giờ nắng tối đa của ngày (0 → tối đa). */
export function hourClass(h: number, maxHours: number) {
  if (maxHours <= 0) return 0;
  return Math.min(SUN_RAMP.length - 1, Math.floor((h / maxHours) * SUN_RAMP.length));
}
