// Route and section anchors of the in-app user guide (/help). Anchors are the heading slugs of
// docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md; markdown.test.ts checks that each one still exists.

export const HELP_PATH = '/help';

export const HELP_ANCHORS = {
  /** 3.4. Làm quen giao diện — menu, tìm nhanh, chuông hạn, Dashboard. */
  interface: '34-làm-quen-giao-diện',
  /** 5.1. Hai đường vào cùng một hồ sơ — danh sách và tab xem nhanh. */
  lists: '51-hai-đường-vào-cùng-một-hồ-sơ',
  /** 5.6. Đọc thanh tiến trình hồ sơ. */
  progress: '56-đọc-thanh-tiến-trình-hồ-sơ',
  /** 10.2. Đối chiếu theo quy tắc — thẻ đề xuất. */
  findings: '102-đối-chiếu-theo-quy-tắc',
} as const;

/** Path to a section of the user guide. */
export function helpHref(anchor?: string): string {
  return anchor ? HELP_PATH + '#' + encodeURIComponent(anchor) : HELP_PATH;
}
