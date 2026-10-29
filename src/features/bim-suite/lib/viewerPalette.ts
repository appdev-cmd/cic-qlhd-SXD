// Màu dùng trong cảnh 3D (WebGL không đọc được lớp Tailwind). Lấy từ biến --theme-* của phần tử chứa trình xem
// để viền chọn, rê chuột, nắp mặt cắt và nền đổi theo "Giao diện" người dùng chọn. Màu trạng thái (va chạm, cảnh báo,
// tiến độ) mang ý nghĩa nên giữ cố định ở nơi dùng, không lấy từ đây.

export type ViewerPalette = {
  selection: string;
  hover: string;
  sectionCap: string;
  background: string;
  grid: string;
};

// Giá trị của theme "Xanh ngọc" (globals.css), dùng khi chưa có DOM hoặc biến chưa được khai báo.
export const DEFAULT_VIEWER_PALETTE: ViewerPalette = {
  selection: '#34d1b9',
  hover: '#0c887a',
  sectionCap: '#0c6a62',
  background: '#f8fcfa',
  grid: '#bce7de',
};

const sources: Record<keyof ViewerPalette, string> = {
  selection: '--theme-accent',
  hover: '--theme-primary',
  sectionCap: '--theme-primary-deep',
  background: '--theme-soft-light',
  grid: '--theme-border',
};

export function readViewerPalette(element: Element | null): ViewerPalette {
  if (!element || typeof getComputedStyle !== 'function') return DEFAULT_VIEWER_PALETTE;
  const style = getComputedStyle(element);
  const palette = { ...DEFAULT_VIEWER_PALETTE };
  for (const key of Object.keys(sources) as (keyof ViewerPalette)[]) {
    const value = style.getPropertyValue(sources[key]).trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) palette[key] = value;
  }
  return palette;
}
