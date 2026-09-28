/**
 * Bộ từ điển viết tắt thuật ngữ xây dựng thông minh
 */
export const ABBREVIATIONS_DICT: Record<string, string[]> = {
  sxd: ['sở xây dựng', 'so xay dung'],
  bqlda: ['ban quản lý dự án', 'ban quan ly du an'],
  cdt: ['chủ đầu tư', 'chu dau tu'],
  tmdt: ['tổng mức đầu tư', 'tong muc dau tu'],
  gpxd: ['giấy phép xây dựng', 'giay phep xay dung'],
  tkcs: ['thiết kế cơ sở', 'thiet ke co so'],
  bvtc: ['bản vẽ thi công', 'ban ve thi cong'],
  qcvn: ['quy chuẩn kỹ thuật quốc gia', 'quy chuan'],
  tcvn: ['tiêu chuẩn việt nam', 'tieu chuan'],
  pccc: ['phòng cháy chữa cháy', 'phong chay chua chay'],
  bcnckt: ['báo cáo nghiên cứu khả thi', 'bao cao nghien cuu kha thi'],
  db: ['điện biên', 'dien bien'],
  cchn: ['chứng chỉ hành nghề', 'chung chi hanh nghe'],
};

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm không dấu (hỗ trợ cả chuỗi dựng sẵn NFC và tổ hợp NFD).
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * So khớp chuỗi tìm kiếm thông minh: không dấu, hỗ trợ từ viết tắt; mọi từ trong truy vấn phải khớp.
 */
export function matchesSmartSearch(text: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!text) return false;
  const cleanText = removeVietnameseTones(text);
  const cleanQuery = removeVietnameseTones(query.trim());
  if (cleanText.includes(cleanQuery)) return true;
  return cleanQuery
    .split(/\s+/)
    .every(
      (token) =>
        cleanText.includes(token) ||
        (ABBREVIATIONS_DICT[token] || []).some((name) => cleanText.includes(removeVietnameseTones(name))),
    );
}
