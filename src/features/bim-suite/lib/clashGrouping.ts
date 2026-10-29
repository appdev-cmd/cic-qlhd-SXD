// features/bim/lib/clashGrouping.ts
// Gom và định danh va chạm: id ổn định theo cặp GUID (+ mô hình), gom cụm theo lưới ~1 m trên tâm va chạm,
// gom theo tầng, khung bao để phóng tới, và tập cấu kiện "ngữ cảnh 2 m" quanh một va chạm.

import type { ClashBox } from './clashDetection';

type Vec3 = [number, number, number];

export interface ClashIdentity {
  modelA: string;
  modelB: string;
  idA: number;
  idB: number;
  guidA?: string | null;
  guidB?: string | null;
}

/** Khóa cặp GUID không phụ thuộc thứ tự (dùng so khớp bản ghi đã lưu, cặp đã bỏ qua) */
export const guidPairKey = (a?: string | null, b?: string | null): string =>
  a && b ? (a < b ? `${a}|${b}` : `${b}|${a}`) : '';

/**
 * Id dòng ổn định giữa các lần dò: cặp (mô hình:GUID) đã sắp xếp. Thiếu GUID thì dùng id cục bộ.
 * Không phụ thuộc vị trí trong danh sách, nên trạng thái/chọn dòng không nhảy khi dò lại.
 */
export const clashRowId = (c: ClashIdentity): string => {
  const sideA = `${c.modelA}:${c.guidA || `#${c.idA}`}`;
  const sideB = `${c.modelB}:${c.guidB || `#${c.idB}`}`;
  return `clash:${sideA < sideB ? `${sideA}|${sideB}` : `${sideB}|${sideA}`}`;
};

export interface ClashCluster<T> {
  /** Id ổn định: id nhỏ nhất của các dòng trong cụm */
  id: string;
  rows: T[];
  /** Tâm trung bình của cụm */
  center: Vec3;
  min: Vec3;
  max: Vec3;
}

const cellKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

/**
 * Gom cụm va chạm theo lưới `cellSize` mét (mặc định 1 m) trên tâm va chạm.
 * Các ô kề nhau (26 hướng) nối thành một cụm, nên va chạm cách nhau < ~1 m không bị chia đôi ở mép ô.
 */
export function clusterClashes<T extends { id: string; center: Vec3 }>(rows: T[], cellSize = 1): ClashCluster<T>[] {
  const cells = new Map<string, number[]>();
  const coords = new Map<string, Vec3>();
  rows.forEach((r, i) => {
    const c: Vec3 = [
      Math.floor(r.center[0] / cellSize),
      Math.floor(r.center[1] / cellSize),
      Math.floor(r.center[2] / cellSize),
    ];
    const k = cellKey(c[0], c[1], c[2]);
    const list = cells.get(k);
    if (list) list.push(i);
    else {
      cells.set(k, [i]);
      coords.set(k, c);
    }
  });

  // Hợp nhất các ô kề nhau (union-find)
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = k;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const k of cells.keys()) parent.set(k, k);
  for (const [k, c] of coords) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dy && !dz) continue;
          const n = cellKey(c[0] + dx, c[1] + dy, c[2] + dz);
          if (!cells.has(n)) continue;
          const ra = find(k);
          const rb = find(n);
          if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
        }
  }

  const groups = new Map<string, T[]>();
  for (const [k, list] of cells) {
    const root = find(k);
    const g = groups.get(root) || [];
    for (const i of list) g.push(rows[i]);
    groups.set(root, g);
  }

  const clusters: ClashCluster<T>[] = [];
  for (const list of groups.values()) {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    const sum: Vec3 = [0, 0, 0];
    for (const r of list) {
      for (let a = 0; a < 3; a++) {
        sum[a] += r.center[a];
        min[a] = Math.min(min[a], r.center[a]);
        max[a] = Math.max(max[a], r.center[a]);
      }
    }
    const sorted = [...list].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    clusters.push({
      id: `cum:${sorted[0].id}`,
      rows: list,
      center: [sum[0] / list.length, sum[1] / list.length, sum[2] / list.length],
      min,
      max,
    });
  }
  return clusters.sort((a, b) => b.rows.length - a.rows.length || (a.id < b.id ? -1 : 1));
}

/** Thứ tự tầng: móng → hầm → tầng 1…n → mái → khác; "chưa xác định" cuối cùng */
export const storeyRank = (name: string): number => {
  const s = name.toLowerCase();
  if (!s || s === 'chưa xác định tầng') return 10_000;
  if (/móng|cọc/.test(s)) return -20;
  if (/hầm|\bb\d/.test(s)) return -10;
  const m = s.match(/(?:tầng|\bt|\bl)\s*0*(\d+)/);
  if (m) return Number(m[1]);
  if (/mái|tum/.test(s)) return 900;
  return 500;
};

export const UNKNOWN_STOREY = 'Chưa xác định tầng';

/** Gom va chạm theo tầng (tên tầng do người gọi tra từ CSDL hoặc mô hình) */
export function groupByStorey<T>(rows: T[], storeyOf: (row: T) => string | null | undefined): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = (storeyOf(r) || '').trim() || UNKNOWN_STOREY;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].sort(
    (a, b) => storeyRank(a[0]) - storeyRank(b[0]) || a[0].localeCompare(b[0], 'vi', { numeric: true }),
  );
}

export interface Box3Like {
  min: Vec3;
  max: Vec3;
}

export const unionBox = (boxes: (Box3Like | null | undefined)[]): Box3Like | null => {
  const list = boxes.filter((b): b is Box3Like => !!b);
  if (!list.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of list)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], b.min[a]);
      max[a] = Math.max(max[a], b.max[a]);
    }
  return { min, max };
};

export const expandBox = (b: Box3Like, margin: number): Box3Like => ({
  min: [b.min[0] - margin, b.min[1] - margin, b.min[2] - margin],
  max: [b.max[0] + margin, b.max[1] + margin, b.max[2] + margin],
});

const intersects = (a: Box3Like, b: Box3Like) =>
  a.min[0] <= b.max[0] &&
  a.max[0] >= b.min[0] &&
  a.min[1] <= b.max[1] &&
  a.max[1] >= b.min[1] &&
  a.min[2] <= b.max[2] &&
  a.max[2] >= b.min[2];

/** Cấu kiện (theo mô hình) có khung bao chạm vùng `area` — dùng cho "chỉ hiện 2 cấu kiện và ngữ cảnh 2 m" */
export function contextGroups(
  area: Box3Like,
  boxesByModel: Map<string, ClashBox[]>,
  must: { modelId: string; id: number }[] = [],
) {
  const out = new Map<string, Set<number>>();
  for (const [modelId, boxes] of boxesByModel) {
    for (const b of boxes) {
      if (!intersects(area, b)) continue;
      let set = out.get(modelId);
      if (!set) out.set(modelId, (set = new Set()));
      set.add(b.id);
    }
  }
  for (const m of must) {
    let set = out.get(m.modelId);
    if (!set) out.set(m.modelId, (set = new Set()));
    set.add(m.id);
  }
  return [...out.entries()].map(([modelId, ids]) => ({ modelId, ids: [...ids].sort((x, y) => x - y) }));
}

export interface CameraPoseLike {
  position: Vec3;
  target: Vec3;
}

/**
 * Vị trí camera đóng khung một hộp: giữ hướng nhìn hiện tại (nếu có), lùi đủ xa để thấy trọn hộp
 * với góc nhìn ~60°. Hệ trục của trình xem: Y hướng lên.
 */
export function cameraPoseForBox(box: Box3Like, current?: CameraPoseLike | null, fovDeg = 60): CameraPoseLike {
  const target: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const half = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]].map((v) => v / 2);
  const radius = Math.max(0.5, Math.hypot(half[0], half[1], half[2]));
  let dir: Vec3 = [1, 0.8, 1];
  if (current) {
    const d: Vec3 = [
      current.position[0] - current.target[0],
      current.position[1] - current.target[1],
      current.position[2] - current.target[2],
    ];
    if (Math.hypot(d[0], d[1], d[2]) > 1e-6) dir = d;
  }
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const distance = Math.max(3, (radius / Math.sin(((fovDeg / 2) * Math.PI) / 180)) * 1.15);
  return {
    target,
    position: [
      target[0] + (dir[0] / len) * distance,
      target[1] + (dir[1] / len) * distance,
      target[2] + (dir[2] / len) * distance,
    ],
  };
}
