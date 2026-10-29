import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/lib/sectionState.ts
// Trạng thái mặt cắt theo MÉT trong hệ toạ độ thế giới của trình xem (trục Y hướng lên).
// Bản cũ lưu vị trí theo tỉ lệ 0..1 của hộp bao cảnh nên mặt cắt trôi khi nạp thêm mô hình;
// hàm normalizeSectionState đổi bản cũ sang mét theo hộp bao lúc mở lại.

import type { BimClipPlaneState, BimViewpointSection } from '@/features/bim-suite/types/bim.types';

export type SectionAxis = 'x' | 'y' | 'z';
export type SectionMode = 'plane' | 'box';
export type Vec3 = [number, number, number];
export interface SceneBounds {
  min: Vec3;
  max: Vec3;
}
/** Một cạnh hộp cắt: null = không giới hạn (mô hình nạp sau vẫn hiện đầy đủ phía đó) */
export type BoxRange = [number | null, number | null];

/**
 * - mode 'plane': mặt phẳng n·x = position (mét), n là pháp tuyến của trục hoặc của mặt đã bấm (`normal`)
 * - mode 'box': box[trục] = [nhỏ nhất, lớn nhất] theo mét
 * - flip: đảo phía giữ lại · outline: vẽ viền màu tại chỗ cắt · caps: tô kín mặt cắt (nắp cắt)
 */
export type BimSectionState = BimViewpointSection;

export const AXES: SectionAxis[] = ['x', 'y', 'z'];
export const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };
const EPS = 1e-6;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);

export const axisUnit = (axis: SectionAxis, sign = 1): Vec3 => {
  const n: Vec3 = [0, 0, 0];
  n[AXIS_INDEX[axis]] = sign;
  return n;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > EPS ? [v[0] / l, v[1] / l, v[2] / l] : null;
};

/** Pháp tuyến đơn vị của mặt cắt đơn */
export const planeNormal = (state: Pick<BimSectionState, 'axis' | 'normal'>): Vec3 =>
  (state.normal && normalize(state.normal)) || axisUnit(state.axis);

/** Khoảng giá trị n·x của hộp bao cảnh theo pháp tuyến n (dùng làm giới hạn thanh trượt) */
export const projectedRange = (bounds: SceneBounds, normal: Vec3): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [
      i & 1 ? bounds.max[0] : bounds.min[0],
      i & 2 ? bounds.max[1] : bounds.min[1],
      i & 4 ? bounds.max[2] : bounds.min[2],
    ];
    const v = dot(p, normal);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
};

export const sectionRange = (
  state: Pick<BimSectionState, 'axis' | 'normal'>,
  bounds: SceneBounds | null,
): [number, number] | null => (bounds ? projectedRange(bounds, planeNormal(state)) : null);

/** Bước thanh trượt theo kích thước cảnh: 1 cm cho công trình, thô hơn cho sa bàn lớn */
export const sliderStep = (span: number) => (span <= 60 ? 0.01 : span <= 600 ? 0.05 : 0.1);

const OPEN_BOX: Record<SectionAxis, BoxRange> = { x: [null, null], y: [null, null], z: [null, null] };

export const defaultSectionState = (bounds: SceneBounds | null, mode: SectionMode = 'plane'): BimSectionState => ({
  version: 2,
  mode,
  axis: 'y',
  position: bounds ? (bounds.min[1] + bounds.max[1]) / 2 : 0,
  normal: null,
  flip: false,
  box: { ...OPEN_BOX },
  outline: true,
  caps: true,
});

interface LegacySectionState {
  mode?: unknown;
  axis?: unknown;
  position?: unknown;
  flip?: unknown;
  box?: Record<string, unknown>;
}

const lerp = (bounds: SceneBounds, axis: SectionAxis, t: number) => {
  const i = AXIS_INDEX[axis];
  return bounds.min[i] + (bounds.max[i] - bounds.min[i]) * t;
};

/**
 * Chuẩn hoá trạng thái mặt cắt đọc từ góc nhìn lưu, AI hoặc phiên bản cũ.
 * - Bản 2 (mét): kiểm tra kiểu và giữ nguyên.
 * - Bản cũ (tỉ lệ 0..1 của hộp cảnh): đổi sang mét theo hộp cảnh hiện tại; cạnh hộp ở 0 hoặc 1 thành "không giới hạn".
 * - Dữ liệu hỏng: trả trạng thái mặc định.
 */
export const normalizeSectionState = (raw: unknown, bounds: SceneBounds | null): BimSectionState => {
  const base = defaultSectionState(bounds);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<BimSectionState> & LegacySectionState;
  const mode: SectionMode = r.mode === 'box' ? 'box' : 'plane';
  const axis: SectionAxis = r.axis === 'x' || r.axis === 'z' ? r.axis : 'y';
  const flip = r.flip === true;
  if (r.version === 2) {
    const box = { ...OPEN_BOX };
    for (const a of AXES) {
      const range = (r.box as Record<string, unknown> | undefined)?.[a];
      if (Array.isArray(range)) box[a] = [isNum(range[0]) ? range[0] : null, isNum(range[1]) ? range[1] : null];
    }
    const normal = isVec3(r.normal) ? normalize(r.normal) : null;
    return {
      version: 2,
      mode,
      axis,
      position: isNum(r.position) ? r.position : base.position,
      normal,
      flip,
      box,
      outline: r.outline !== false,
      caps: r.caps !== false,
    };
  }
  // Bản cũ theo tỉ lệ
  const ratio = isNum(r.position) ? Math.min(1, Math.max(0, r.position)) : 0.5;
  const box = { ...OPEN_BOX };
  if (bounds && r.box && typeof r.box === 'object') {
    for (const a of AXES) {
      const range = r.box[a];
      if (!Array.isArray(range)) continue;
      const lo = isNum(range[0]) ? range[0] : 0;
      const hi = isNum(range[1]) ? range[1] : 1;
      box[a] = [lo > 0.0001 ? lerp(bounds, a, lo) : null, hi < 0.9999 ? lerp(bounds, a, hi) : null];
    }
  }
  return {
    version: 2,
    mode,
    axis,
    position: bounds ? lerp(bounds, axis, ratio) : base.position,
    normal: null,
    flip,
    box,
    outline: true,
    caps: true,
  };
};

/** Lệnh cắt cũ theo tỉ lệ (AI) → trạng thái theo mét */
export const sectionFromRatio = (
  axis: SectionAxis,
  ratio: number,
  flip: boolean,
  bounds: SceneBounds | null,
): BimSectionState => ({
  ...defaultSectionState(bounds),
  axis,
  flip,
  position: bounds ? lerp(bounds, axis, Math.min(1, Math.max(0, ratio))) : 0,
});

/**
 * Mặt phẳng cắt dạng THREE.Plane (normal·x + constant ≥ 0 là phần giữ lại).
 * Mặt cắt đơn giữ phía n·x ≤ position (hoặc ≥ khi đảo). Hộp cắt chỉ sinh mặt cho cạnh có giới hạn.
 */
export const computeSectionPlanes = (state: BimSectionState | null): BimClipPlaneState[] => {
  if (!state) return [];
  if (state.mode === 'plane') {
    const n = planeNormal(state);
    const d = state.position;
    return state.flip
      ? [{ normal: [n[0], n[1], n[2]], constant: -d }]
      : [{ normal: [-n[0], -n[1], -n[2]], constant: d }];
  }
  const planes: BimClipPlaneState[] = [];
  for (const axis of AXES) {
    const [lo, hi] = state.box[axis];
    if (lo !== null) planes.push({ normal: axisUnit(axis, 1), constant: -lo });
    if (hi !== null) planes.push({ normal: axisUnit(axis, -1), constant: hi });
  }
  return planes;
};

/** Trục mà pháp tuyến gần như trùng (|thành phần| ≥ 0,999), kèm dấu */
export const snapToAxis = (normal: Vec3): { axis: SectionAxis; sign: 1 | -1 } | null => {
  const n = normalize(normal);
  if (!n) return null;
  for (const axis of AXES) {
    const c = n[AXIS_INDEX[axis]];
    if (Math.abs(c) >= 0.999) return { axis, sign: c > 0 ? 1 : -1 };
  }
  return null;
};

/**
 * Dựng lại trạng thái bảng mặt cắt từ các mặt phẳng của góc nhìn/vướng mắc (chỉ lưu mặt phẳng),
 * để người dùng mở bảng và chỉnh tiếp thay vì bắt đầu lại.
 */
export const sectionStateFromPlanes = (
  planes: BimClipPlaneState[] | null | undefined,
  bounds: SceneBounds | null,
): BimSectionState | null => {
  if (!planes?.length) return null;
  if (planes.length === 1) {
    const p = planes[0];
    const n = normalize(p.normal);
    if (!n) return null;
    // Phần giữ lại: n·x + c ≥ 0  ⇔  (−n)·x ≤ c
    const snapped = snapToAxis(n);
    const c = p.constant / Math.hypot(...p.normal);
    if (snapped) {
      // n = +e: giữ x ≥ −c (đảo phía); n = −e: giữ x ≤ c
      return {
        ...defaultSectionState(bounds),
        axis: snapped.axis,
        position: snapped.sign > 0 ? -c : c,
        flip: snapped.sign > 0,
      };
    }
    return { ...defaultSectionState(bounds), normal: [-n[0], -n[1], -n[2]], position: c, flip: false };
  }
  const box = { x: [null, null], y: [null, null], z: [null, null] } as Record<SectionAxis, BoxRange>;
  for (const p of planes) {
    const snapped = snapToAxis(p.normal);
    if (!snapped) return null;
    const len = Math.hypot(...p.normal);
    const c = p.constant / len;
    if (snapped.sign > 0) box[snapped.axis][0] = -c;
    else box[snapped.axis][1] = c;
  }
  return { ...defaultSectionState(bounds, 'box'), box };
};

/** Hộp cắt bao quanh khung bao của các cấu kiện, thêm lề theo tỉ lệ (tối thiểu minMargin mét) */
export const boxAroundBounds = (
  bounds: SceneBounds,
  marginRatio = 0.05,
  minMargin = 0.05,
): Record<SectionAxis, BoxRange> => {
  const out = { ...OPEN_BOX };
  for (const axis of AXES) {
    const i = AXIS_INDEX[axis];
    const pad = Math.max((bounds.max[i] - bounds.min[i]) * marginRatio, minMargin);
    out[axis] = [bounds.min[i] - pad, bounds.max[i] + pad];
  }
  return out;
};

/** Mặt cắt đơn đi qua tâm khung bao (dùng cho "cắt tại cấu kiện đang chọn" ở chế độ mặt cắt đơn) */
export const positionThroughBounds = (state: Pick<BimSectionState, 'axis' | 'normal'>, bounds: SceneBounds) => {
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return dot(center, planeNormal(state));
};

/**
 * Canh mặt cắt theo mặt đã bấm: mặt phẳng trùng mặt đó, bỏ phần phía pháp tuyến (phía người xem),
 * giữ phần phía sau mặt. Pháp tuyến gần trùng trục thì quy về mặt cắt theo trục để dùng được thanh trượt quen thuộc.
 */
export const planeFromFace = (
  point: Vec3,
  normal: Vec3,
): Pick<BimSectionState, 'axis' | 'normal' | 'position' | 'flip'> | null => {
  const n = normalize(normal);
  if (!n || !isVec3(point)) return null;
  const snapped = snapToAxis(n);
  if (snapped) {
    return { axis: snapped.axis, normal: null, position: point[AXIS_INDEX[snapped.axis]], flip: snapped.sign < 0 };
  }
  return { axis: 'y', normal: n, position: dot(n, point), flip: false };
};

/**
 * Chuẩn hoá một cạnh hộp sau khi kéo: chạm biên cảnh (trong dung sai) → không giới hạn.
 * Giữ khoảng tối thiểu minGap giữa hai cạnh.
 */
export const normalizeBoxRange = (
  range: [number, number],
  sceneLo: number,
  sceneHi: number,
  minGap = 0.01,
): BoxRange => {
  const tol = Math.max((sceneHi - sceneLo) * 1e-4, 1e-4);
  let [lo, hi] = range;
  if (hi - lo < minGap) {
    if (lo + minGap <= sceneHi) hi = lo + minGap;
    else lo = hi - minGap;
  }
  return [lo <= sceneLo + tol ? null : lo, hi >= sceneHi - tol ? null : hi];
};

/** Cạnh hộp đã giải (null → biên cảnh) */
export const resolveBoxRange = (range: BoxRange, sceneLo: number, sceneHi: number): [number, number] => [
  range[0] ?? sceneLo,
  range[1] ?? sceneHi,
];

/** Mô tả ngắn để hiển thị trên danh sách góc nhìn */
export const describeSection = (state: BimSectionState) => {
  const fmt = (v: number) => `${formatNumber(v, 2)} m`;
  if (state.mode === 'plane') {
    const label = state.normal
      ? 'Mặt đã chọn'
      : state.axis === 'y'
        ? 'Cao độ'
        : state.axis === 'x'
          ? 'Trục X'
          : 'Trục Y';
    return `${label} ${fmt(state.position)}`;
  }
  const limited = AXES.filter((a) => state.box[a][0] !== null || state.box[a][1] !== null);
  return limited.length ? `Hộp cắt (${limited.length} trục)` : 'Hộp cắt toàn cảnh';
};
