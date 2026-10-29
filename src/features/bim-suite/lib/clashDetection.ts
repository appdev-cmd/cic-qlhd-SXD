// features/bim/lib/clashDetection.ts
// Dò va chạm giữa hai tập cấu kiện theo khung bao (AABB) — bước sàng lọc nhanh
// trước khi kiểm tra chi tiết. Dùng lưới không gian để tránh so sánh N×M.
// Không cắt kết quả âm thầm: đếm đủ mọi cặp, chỉ giữ `maxResults` cặp chồng lấn lớn nhất và báo `capped`.

export interface ClashBox {
  id: number;
  min: [number, number, number];
  max: [number, number, number];
}

export interface ClashPair {
  idA: number;
  idB: number;
  /** Thể tích phần giao nhau của hai khung bao (m³) */
  overlap: number;
  /** Bề dày chồng lấn nhỏ nhất theo 3 trục (m) */
  depth: number;
  center: [number, number, number];
}

export interface ClashOptions {
  /** Bỏ qua giao nhau mỏng hơn ngưỡng này (mét). Mặc định 1cm */
  tolerance?: number;
  /** Số va chạm tối đa giữ lại (các cặp chồng lấn lớn nhất) */
  maxResults?: number;
  /** Bỏ qua cặp có cùng id (khi so một tập với chính nó) */
  sameSet?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface ClashScanResult {
  /** Các cặp giữ lại, xếp theo thể tích giao giảm dần */
  pairs: ClashPair[];
  /** Tổng số cặp tìm được (kể cả phần không giữ lại) */
  total: number;
  /** true nếu total > cap — giao diện phải báo danh sách đã bị giới hạn */
  capped: boolean;
  cap: number;
}

const sizeOf = (b: ClashBox) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as const;

/** Cạnh ô lưới: lấy theo kích thước trung vị của các khung bao để mỗi ô chứa vài cấu kiện */
const pickCellSize = (boxes: ClashBox[]): number => {
  if (boxes.length === 0) return 1;
  const step = Math.max(1, Math.floor(boxes.length / 500));
  const samples: number[] = [];
  for (let i = 0; i < boxes.length; i += step) {
    const s = sizeOf(boxes[i]);
    samples.push(Math.max(s[0], s[1], s[2]));
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] || 1;
  return Math.max(0.5, Math.min(median * 2, 50));
};

const keyOf = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

const cellRange = (b: ClashBox, cell: number) => ({
  x0: Math.floor(b.min[0] / cell),
  x1: Math.floor(b.max[0] / cell),
  y0: Math.floor(b.min[1] / cell),
  y1: Math.floor(b.max[1] / cell),
  z0: Math.floor(b.min[2] / cell),
  z1: Math.floor(b.max[2] / cell),
});

/** p "kém" hơn q: chồng lấn nhỏ hơn; bằng nhau thì id lớn hơn (thứ tự ổn định) */
const worse = (p: ClashPair, q: ClashPair) =>
  p.overlap !== q.overlap ? p.overlap < q.overlap : p.idA !== q.idA ? p.idA > q.idA : p.idB > q.idB;

/** Đống nhỏ nhất giữ K cặp tốt nhất mà không lưu toàn bộ (mô hình lớn có thể có hàng triệu cặp) */
class TopK {
  private heap: ClashPair[] = [];
  constructor(private readonly k: number) {}
  push(p: ClashPair) {
    const h = this.heap;
    if (this.k <= 0) return;
    if (h.length < this.k) {
      h.push(p);
      let i = h.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!worse(h[i], h[parent])) break;
        [h[i], h[parent]] = [h[parent], h[i]];
        i = parent;
      }
      return;
    }
    if (!worse(h[0], p)) return;
    h[0] = p;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && worse(h[l], h[m])) m = l;
      if (r < h.length && worse(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  sorted(): ClashPair[] {
    return [...this.heap].sort((x, y) => (worse(x, y) ? 1 : worse(y, x) ? -1 : 0));
  }
}

export interface ClashScanner {
  /** Xử lý thêm tối đa `count` cấu kiện của tập A; trả true khi đã xong */
  step: (count: number) => boolean;
  readonly done: number;
  readonly totalItems: number;
  result: () => ClashScanResult;
}

/**
 * Bộ quét có thể chạy từng phần (để chia nhịp trên luồng chính) hoặc một lần (trong Web Worker).
 * Truyền cùng một mảng cho A và B (kèm sameSet) để dò va chạm trong nội bộ một mô hình.
 */
export function createClashScanner(setA: ClashBox[], setB: ClashBox[], options: ClashOptions = {}): ClashScanner {
  const tolerance = options.tolerance ?? 0.01;
  const cap = Math.max(1, options.maxResults ?? 2000);
  const sameSet = options.sameSet ?? false;
  const top = new TopK(cap);
  let total = 0;
  let index = 0;
  const empty = setA.length === 0 || setB.length === 0;

  const cell = pickCellSize(setB.length < setA.length ? setB : setA);
  const grid = new Map<string, number[]>();
  const oversized: number[] = [];
  if (!empty) {
    setB.forEach((b, i) => {
      const r = cellRange(b, cell);
      // Cấu kiện quá dài (dầm cầu, ray) trải nhiều ô: giới hạn để không phình chỉ mục
      if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) * (r.z1 - r.z0 + 1) > 4096) {
        oversized.push(i);
        return;
      }
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++)
          for (let z = r.z0; z <= r.z1; z++) {
            const k = keyOf(x, y, z);
            const list = grid.get(k);
            if (list) list.push(i);
            else grid.set(k, [i]);
          }
    });
  }

  const scanOne = (a: ClashBox) => {
    const r = cellRange(a, cell);
    const candidates = new Set<number>(oversized);
    const spread = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) * (r.z1 - r.z0 + 1);
    if (spread > 4096) {
      for (let k = 0; k < setB.length; k++) candidates.add(k);
    } else {
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++)
          for (let z = r.z0; z <= r.z1; z++) {
            const list = grid.get(keyOf(x, y, z));
            if (list) for (const k of list) candidates.add(k);
          }
    }
    for (const k of candidates) {
      const b = setB[k];
      if (sameSet && b.id >= a.id) continue;
      const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
      if (ox <= tolerance) continue;
      const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
      if (oy <= tolerance) continue;
      const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
      if (oz <= tolerance) continue;
      total++;
      top.push({
        idA: a.id,
        idB: b.id,
        overlap: ox * oy * oz,
        depth: Math.min(ox, oy, oz),
        center: [
          (Math.max(a.min[0], b.min[0]) + Math.min(a.max[0], b.max[0])) / 2,
          (Math.max(a.min[1], b.min[1]) + Math.min(a.max[1], b.max[1])) / 2,
          (Math.max(a.min[2], b.min[2]) + Math.min(a.max[2], b.max[2])) / 2,
        ],
      });
    }
  };

  return {
    step(count: number) {
      if (empty) {
        index = setA.length;
        return true;
      }
      const end = Math.min(setA.length, index + Math.max(1, count));
      for (; index < end; index++) {
        scanOne(setA[index]);
        if (index % 500 === 0) options.onProgress?.(index, setA.length);
      }
      if (index >= setA.length) options.onProgress?.(setA.length, setA.length);
      return index >= setA.length;
    },
    get done() {
      return index;
    },
    get totalItems() {
      return setA.length;
    },
    result: () => ({ pairs: empty ? [] : top.sorted(), total, capped: total > cap, cap }),
  };
}

/** Dò toàn bộ một lần: trả cặp giữ lại + tổng số thật + cờ giới hạn */
export const findClashesDetailed = (
  setA: ClashBox[],
  setB: ClashBox[],
  options: ClashOptions = {},
): ClashScanResult => {
  const scanner = createClashScanner(setA, setB, options);
  scanner.step(Number.MAX_SAFE_INTEGER);
  return scanner.result();
};

/**
 * Tìm các cặp khung bao giao nhau giữa tập A và tập B (giữ `maxResults` cặp lớn nhất).
 * Dùng `findClashesDetailed` khi cần biết tổng số cặp thật.
 */
export const findClashes = (setA: ClashBox[], setB: ClashBox[], options: ClashOptions = {}): ClashPair[] =>
  findClashesDetailed(setA, setB, options).pairs;

// ---------------------------------------------------------------------------
// Đóng gói khung bao thành mảng số để chuyển sang Web Worker (transferable, không sao chép đối tượng)
// ---------------------------------------------------------------------------

export interface PackedBoxes {
  ids: Int32Array;
  /** 6 số mỗi cấu kiện: minX, minY, minZ, maxX, maxY, maxZ */
  bounds: Float64Array;
}

export const packBoxes = (boxes: ClashBox[]): PackedBoxes => {
  const ids = new Int32Array(boxes.length);
  const bounds = new Float64Array(boxes.length * 6);
  boxes.forEach((b, i) => {
    ids[i] = b.id;
    bounds.set(b.min, i * 6);
    bounds.set(b.max, i * 6 + 3);
  });
  return { ids, bounds };
};

export const unpackBoxes = (packed: PackedBoxes): ClashBox[] => {
  const out: ClashBox[] = new Array(packed.ids.length);
  for (let i = 0; i < packed.ids.length; i++) {
    const o = i * 6;
    const b = packed.bounds;
    out[i] = { id: packed.ids[i], min: [b[o], b[o + 1], b[o + 2]], max: [b[o + 3], b[o + 4], b[o + 5]] };
  }
  return out;
};
