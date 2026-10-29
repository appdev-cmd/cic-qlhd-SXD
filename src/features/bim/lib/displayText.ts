// Làm sạch chữ hiển thị đọc trực tiếp từ tệp mô hình (tên cấu kiện, thuộc tính IFC):
// bỏ nhãn "[DEMO]", "(minh họa)", "— giả định", "mô phỏng"... giống scripts/hud-clean-wording.sql
// để tên trên khung nhìn khớp dữ liệu đã làm sạch trong CSDL. Mã định danh (GUID, mã) không bị đổi.

const HINT = /DEMO|Demo|\sdemo|minh họa|mô phỏng|giả lập|giả định/;
const RULES: [RegExp, string][] = [
  [/\[(?:DEMO|MẪU HUD)[^\]]*\]\s*/g, ''],
  [/\s*\((?:minh họa|mô phỏng|giả lập|giả định|demo|DEMO)\)/g, ''],
  [/\s*—\s*(?:minh họa|giả định|sơ đồ demo)/g, ''],
  [/\s*·\s*(?:vùng đo )?(?:mô phỏng|minh họa|giả lập)(?=$|[\s.,;])/g, ''],
  [/\s+(?:mô phỏng|minh họa|giả lập|giả định)(?!\s*(?:tiến độ|4D))(?=$|[\s.,;·])/g, ''],
  [/\s+(?:DEMO|Demo|demo)(?=$|[\s.,;·)])/g, ''],
  [/\s{2,}/g, ' '],
];

export function cleanDisplayText<T>(value: T): T {
  if (typeof value !== 'string' || !HINT.test(value)) return value;
  let text: string = value;
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.trim() as T;
}
