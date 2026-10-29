// G6: nắng trên khối bối cảnh (nhà lân cận, mặt đất) theo các mốc tiến độ thi công.
// Vật cản tại mốc m = khối bối cảnh + cấu kiện công trình đã xong theo liên kết tiến độ dự án đến mốc m. Một lần dò tia cho mọi mốc:
// tia gặp cấu kiện xong sớm nhất ở mốc k thì điểm mất nắng từ mốc k trở đi.
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { buildObstacleBvh, type Box3Like, type SampleGrid, sampleTopSurfaces, type SunRunOptions } from './sunHours';

const LIFT = 0.05;

export interface StagedBvh {
  bvh: MeshBVH;
  /** Mốc của từng tam giác theo thứ tự gốc (trước khi BVH sắp lại). */
  triStage: Uint16Array;
  triangles: number;
}

/** BVH công trình kèm mốc của từng tam giác; `stages[i]` là mốc của phần `parts[i]`. */
export function buildStagedBvh(parts: Float32Array[], stages: number[]): StagedBvh {
  const { bvh, triangles } = buildObstacleBvh(parts);
  const triStage = new Uint16Array(triangles);
  let t = 0;
  parts.forEach((p, i) => {
    const n = Math.floor(p.length / 9);
    triStage.fill(stages[i], t, t + n);
    t += n;
  });
  return { bvh, triStage, triangles };
}

/** Tam giác gốc của một lần chạm: BVH sắp lại chỉ mục, đỉnh giữ nguyên (tam giác gốc t có đỉnh 3t..3t+2). */
const originalTriangle = (bvh: MeshBVH, faceIndex: number) => {
  const index = bvh.geometry.index;
  return index ? Math.floor(index.getX(faceIndex * 3) / 3) : faceIndex;
};

/** Bỏ điểm mẫu nằm dưới công trình hoàn thành (tia thẳng lên gặp công trình): chỗ đó sẽ bị chiếm chỗ, không phải bóng đổ. */
export function dropCoveredPoints(grid: SampleGrid, building: StagedBvh | null): SampleGrid {
  if (!building || !grid.count) return grid;
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const keep: number[] = [];
  for (let p = 0; p < grid.count; p++) {
    ray.origin.set(grid.points[p * 3], grid.points[p * 3 + 1] + LIFT, grid.points[p * 3 + 2]);
    if (!building.bvh.raycastFirst(ray, THREE.DoubleSide)) keep.push(p);
  }
  const points = new Float32Array(keep.length * 3);
  keep.forEach((p, i) => points.set(grid.points.subarray(p * 3, p * 3 + 3), i * 3));
  return { ...grid, points, count: keep.length };
}

export interface PhaseHours {
  /** Giờ nắng trước khi xây (chỉ khối bối cảnh che). */
  base: Float32Array;
  /** hours[m * count + p]: giờ nắng của điểm p tại mốc m. */
  hours: Float32Array;
  stages: number;
}

export function phaseSunHours(
  context: MeshBVH,
  building: StagedBvh | null,
  grid: SampleGrid,
  dirs: ([number, number, number] | null)[],
  stageCount: number,
  stepHours: number,
  opts: SunRunOptions = {},
): PhaseHours {
  const count = grid.count;
  const base = new Float32Array(count);
  const hours = new Float32Array(stageCount * count);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  const total = dirs.length * count;
  for (let s = 0; s < dirs.length; s++) {
    const d = dirs[s];
    if (!d) continue;
    ray.direction.set(d[0], d[1], d[2]).normalize();
    for (let p = 0; p < count; p++) {
      ray.origin
        .set(grid.points[p * 3], grid.points[p * 3 + 1], grid.points[p * 3 + 2])
        .addScaledVector(ray.direction, LIFT);
      if (context.raycastFirst(ray, THREE.DoubleSide)) continue;
      base[p] += stepHours;
      let first = stageCount;
      if (building) {
        for (const hit of building.bvh.raycast(ray, THREE.DoubleSide)) {
          if (hit.faceIndex == null) continue;
          const st = building.triStage[originalTriangle(building.bvh, hit.faceIndex)];
          if (st < first) first = st;
          if (first === 0) break;
        }
      }
      for (let m = 0; m < first; m++) hours[m * count + p] += stepHours;
    }
    if (opts.isCancelled?.()) break;
    opts.onProgress?.((s + 1) * count, total);
  }
  return { base, hours, stages: stageCount };
}

/** Lưới mẫu trên khối bối cảnh, bỏ phần công trình sẽ chiếm chỗ. */
export function sampleContext(
  context: MeshBVH,
  building: StagedBvh | null,
  box: Box3Like,
  step: number,
  maxPoints: number,
): SampleGrid {
  return dropCoveredPoints(sampleTopSurfaces(context, box, step, maxPoints), building);
}

export interface Milestone {
  /** Ngày mốc (ISO yyyy-mm-dd): cấu kiện hoàn thành đến hết ngày này coi là đã xây. */
  date: string;
  /** Số cấu kiện đã xây đến mốc (cộng dồn). */
  built: number;
}

/**
 * Chia khoảng từ ngày hoàn thành sớm nhất tới muộn nhất thành `n` mốc đều nhau theo thời gian (mốc cuối = ngày muộn nhất).
 * Chia theo thời gian, không theo số cấu kiện: MEP nhiều cấu kiện nhỏ, nếu chia theo số lượng thì mốc đầu rơi sau khi kết cấu đã lên xong.
 * Mốc trùng ngày gộp lại.
 */
export function milestonesFromDates(dates: string[], n: number): Milestone[] {
  const sorted = dates.filter(Boolean).sort();
  if (!sorted.length || n < 1) return [];
  const t0 = Date.parse(`${sorted[0]}T00:00:00Z`);
  const t1 = Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`);
  const out: Milestone[] = [];
  for (let k = 1; k <= n; k++) {
    const date = k === n ? sorted[sorted.length - 1] : new Date(t0 + ((t1 - t0) * k) / n).toISOString().slice(0, 10);
    if (out.length && out[out.length - 1].date >= date) continue;
    out.push({ date, built: upperBound(sorted, date) });
  }
  return out;
}
const upperBound = (sorted: string[], v: string) => {
  let lo = 0,
    hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** Mốc đầu tiên mà ngày hoàn thành không muộn hơn; không có ngày (chưa gắn tiến độ) thì tính vào mốc cuối. */
export function stageOf(date: string | null | undefined, milestones: Milestone[]): number {
  if (!milestones.length) return 0;
  if (!date) return milestones.length - 1;
  const i = milestones.findIndex((m) => date <= m.date);
  return i < 0 ? milestones.length - 1 : i;
}

export interface PhaseStat {
  /** Giờ nắng trung bình tại mốc. */
  mean: number;
  /** Giờ nắng mất trung bình so với trước khi xây. */
  lost: number;
  /** Tỷ lệ điểm mất ≥ 1 giờ / ≥ 2 giờ nắng, %. */
  lost1h: number;
  lost2h: number;
}

export function phaseStats(r: PhaseHours, count: number): { baseMean: number; stages: PhaseStat[] } {
  const pct = (v: number) => (count ? Math.round((v / count) * 1000) / 10 : 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  let baseSum = 0;
  for (let p = 0; p < count; p++) baseSum += r.base[p];
  const stages: PhaseStat[] = [];
  for (let m = 0; m < r.stages; m++) {
    let sum = 0,
      lostSum = 0,
      l1 = 0,
      l2 = 0;
    for (let p = 0; p < count; p++) {
      const h = r.hours[m * count + p];
      const lost = r.base[p] - h;
      sum += h;
      lostSum += lost;
      if (lost >= 1 - 1e-6) l1++;
      if (lost >= 2 - 1e-6) l2++;
    }
    stages.push({
      mean: count ? round(sum / count) : 0,
      lost: count ? round(lostSum / count) : 0,
      lost1h: pct(l1),
      lost2h: pct(l2),
    });
  }
  return { baseMean: count ? round(baseSum / count) : 0, stages };
}

/** Thang một sắc xanh cho giờ nắng mất (đã kiểm định --ordinal nền sáng và tối); "không mất" dùng xám trung tính kèm chú giải chữ. */
export const LOST_RAMP = ['#6da7ec', '#3987e5', '#256abf', '#184f95'] as const;
export const NO_LOSS_COLOR = '#cbd5e1';
/** Lớp giờ nắng mất: -1 = không mất (< 15 phút), 0: < 1 giờ, 1: 1–2, 2: 2–3, 3: ≥ 3 giờ. */
export const lostClass = (lost: number) => (lost < 0.25 ? -1 : Math.min(LOST_RAMP.length - 1, Math.floor(lost)));

/**
 * Finish date per element (key "model|GlobalId") from schedule links: latest finish over the linked tasks,
 * actual finish first, else planned finish.
 */
export function finishDatesByElement(
  links: { task_id: string; model_id: string; global_id: string }[],
  tasks: { id: string; ket_thuc: string | null; ket_thuc_thuc_te: string | null }[],
): Map<string, string> {
  const end = new Map<string, string>();
  for (const t of tasks) {
    const d = (t.ket_thuc_thuc_te || t.ket_thuc || '').slice(0, 10);
    if (d) end.set(t.id, d);
  }
  const out = new Map<string, string>();
  for (const l of links) {
    const d = end.get(l.task_id);
    if (!d) continue;
    const k = `${l.model_id}|${l.global_id}`;
    const cur = out.get(k);
    if (!cur || d > cur) out.set(k, d);
  }
  return out;
}
