// features/bim/lib/viewerKeyboard.ts
// Điều khiển trình xem 3D bằng bàn phím khi khung 3D đang được chọn (focus):
//   Mũi tên: xoay quanh điểm nhìn · Shift + mũi tên: lia · W/S: tiến/lùi · A/D: lia ngang · Q/E: hạ/nâng
//   + / −: phóng to/thu nhỏ · Enter: chọn cấu kiện ở giữa khung · ] / [: chuyển qua lại giữa các cấu kiện đang chọn
//   Backspace / Delete: bỏ điểm đo cuối (khi đang đo) · Ctrl+Z: xoá phép đo cuối

export type ViewerKeyAction =
  | { type: 'orbit'; azimuthDeg: number; polarDeg: number }
  | { type: 'pan'; x: number; y: number }
  | { type: 'dolly'; amount: number }
  | { type: 'pick-center' }
  | { type: 'cycle'; direction: 1 | -1 }
  | { type: 'undo-point' }
  | { type: 'undo-measure' };

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export const ORBIT_STEP_DEG = 7.5;
/** Bước lia/tiến theo tỉ lệ khoảng cách camera → điểm nhìn */
export const MOVE_STEP_RATIO = 0.06;

export const viewerKeyAction = (e: KeyLike, options: { measuring?: boolean } = {}): ViewerKeyAction | null => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && key === 'z') return { type: 'undo-measure' };
  if (mod || e.altKey) return null;
  if (options.measuring && (key === 'Backspace' || key === 'Delete')) return { type: 'undo-point' };
  switch (key) {
    case 'ArrowLeft':
      return e.shiftKey ? { type: 'pan', x: -1, y: 0 } : { type: 'orbit', azimuthDeg: ORBIT_STEP_DEG, polarDeg: 0 };
    case 'ArrowRight':
      return e.shiftKey ? { type: 'pan', x: 1, y: 0 } : { type: 'orbit', azimuthDeg: -ORBIT_STEP_DEG, polarDeg: 0 };
    case 'ArrowUp':
      return e.shiftKey ? { type: 'pan', x: 0, y: 1 } : { type: 'orbit', azimuthDeg: 0, polarDeg: -ORBIT_STEP_DEG };
    case 'ArrowDown':
      return e.shiftKey ? { type: 'pan', x: 0, y: -1 } : { type: 'orbit', azimuthDeg: 0, polarDeg: ORBIT_STEP_DEG };
    case 'w':
      return { type: 'dolly', amount: 1 };
    case 's':
      return { type: 'dolly', amount: -1 };
    case 'a':
      return { type: 'pan', x: -1, y: 0 };
    case 'd':
      return { type: 'pan', x: 1, y: 0 };
    case 'q':
      return { type: 'pan', x: 0, y: -1 };
    case 'e':
      return { type: 'pan', x: 0, y: 1 };
    case '+':
    case '=':
      return { type: 'dolly', amount: 1 };
    case '-':
    case '_':
      return { type: 'dolly', amount: -1 };
    case 'Enter':
      return options.measuring ? null : { type: 'pick-center' };
    case ']':
      return { type: 'cycle', direction: 1 };
    case '[':
      return { type: 'cycle', direction: -1 };
    default:
      return null;
  }
};

/** Vị trí kế tiếp khi chuyển vòng trong danh sách */
export const cycleIndex = (current: number, length: number, direction: 1 | -1) =>
  length <= 0 ? -1 : current < 0 ? (direction > 0 ? 0 : length - 1) : (current + direction + length) % length;
