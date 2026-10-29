// features/bim/lib/viewerConstants.ts
// Hằng số và hàm tiện ích của trình xem 3D (tách khỏi BimViewer.tsx cho gọn)

import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import type { BimMeasureMode, BimViewPreset } from '../components/BimViewer';
import type { SnapKind } from './measureMath';
import { cleanDisplayText } from './displayText';

export const SELECTION_COLOR = '#e600ff';
export const SELECTION_MATERIAL: FRAGS.MaterialDefinition = {
  color: new THREE.Color(SELECTION_COLOR),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
};

export const HOVER_MATERIAL: FRAGS.MaterialDefinition = {
  color: new THREE.Color('#38bdf8'),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
};

/** 6 mặt của khối lập phương điều hướng (CSS 3D) */
export const CUBE = 36;
export const VIEW_CUBE_FACES: { preset: BimViewPreset; label: string; transform: string }[] = [
  { preset: 'front', label: 'TRƯỚC', transform: `rotateY(0deg) translateZ(${CUBE}px)` },
  { preset: 'right', label: 'PHẢI', transform: `rotateY(90deg) translateZ(${CUBE}px)` },
  { preset: 'back', label: 'SAU', transform: `rotateY(180deg) translateZ(${CUBE}px)` },
  { preset: 'left', label: 'TRÁI', transform: `rotateY(-90deg) translateZ(${CUBE}px)` },
  { preset: 'top', label: 'TRÊN', transform: `rotateX(90deg) translateZ(${CUBE}px)` },
  { preset: 'bottom', label: 'DƯỚI', transform: `rotateX(-90deg) translateZ(${CUBE}px)` },
];

export const MEASURE_TITLES: Record<Exclude<BimMeasureMode, null>, string> = {
  distance: 'Đo khoảng cách',
  elevation: 'Đo cao độ',
  area: 'Đo diện tích',
  angle: 'Đo góc',
  slope: 'Đo độ dốc',
  perpendicular: 'Đo khoảng cách vuông góc',
};

export const MEASURE_HINTS: Record<Exclude<BimMeasureMode, null>, string[]> = {
  distance: ['Chọn điểm đầu', 'Chọn điểm thứ hai'],
  elevation: ['Chọn điểm cần đo cao độ'],
  slope: ['Chọn điểm thứ nhất', 'Chọn điểm thứ hai'],
  angle: ['Chọn điểm thứ nhất', 'Chọn đỉnh góc', 'Chọn điểm thứ ba'],
  perpendicular: ['Chọn mặt tham chiếu', 'Chọn điểm cần đo tới mặt'],
  area: ['Chọn đỉnh thứ nhất', 'Chọn các đỉnh tiếp theo · bấm lại đỉnh đầu hoặc Enter để khép vùng'],
};

export const SNAP_LABEL: Record<SnapKind, string> = {
  dinh: 'Đỉnh',
  trung_diem: 'Trung điểm',
  canh: 'Cạnh',
  mat: 'Mặt',
};

// Giá trị thuộc tính từ tệp mô hình; chữ hiển thị được làm sạch nhãn demo/minh họa (xem displayText.ts).
export const unwrap = (v: any) => cleanDisplayText(v && typeof v === 'object' && 'value' in v ? v.value : v);

export const toVec3 = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

// Giữ tương thích nơi đang nhập từ đây
export { quaternionToCss } from './viewCube';
