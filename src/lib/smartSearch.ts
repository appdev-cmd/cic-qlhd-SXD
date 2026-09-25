/**
 * Tìm kiếm thông minh tiếng Việt: không dấu + từ điển viết tắt ngành xây dựng.
 * Câu tìm kiếm được tách theo từ; MỌI từ phải khớp (trực tiếp hoặc qua dạng đầy đủ của từ viết tắt).
 * VD: "bqlda dan dung" khớp "Ban QLDA Các công trình Dân dụng & Công nghiệp".
 */
export const ABBREVIATIONS_DICT: Record<string, string[]> = {
  sxd: ['sở xây dựng'],
  bqlda: ['ban quản lý dự án', 'ban qlda', 'qlda'],
  qlda: ['quản lý dự án'],
  cdt: ['chủ đầu tư'],
  tmdt: ['tổng mức đầu tư'],
  gpxd: ['giấy phép xây dựng'],
  tkcs: ['thiết kế cơ sở'],
  bvtc: ['bản vẽ thi công'],
  qcvn: ['quy chuẩn kỹ thuật quốc gia', 'quy chuẩn'],
  tcvn: ['tiêu chuẩn việt nam', 'tiêu chuẩn'],
  pccc: ['phòng cháy chữa cháy'],
  bcnckt: ['báo cáo nghiên cứu khả thi'],
  db: ['điện biên'],
  dbp: ['điện biên phủ'],
  cchn: ['chứng chỉ hành nghề'],
  ubnd: ['ủy ban nhân dân', 'uỷ ban nhân dân'],
  tp: ['thành phố'],
  tx: ['thị xã'],
  xlnt: ['xử lý nước thải'],
  ccn: ['cụm công nghiệp'],
  ptdtnt: ['phổ thông dân tộc nội trú'],
};

/**
 * Loại bỏ dấu tiếng Việt để tìm kiếm không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

function normalize(str: string): string {
  return removeVietnameseTones(str)
    .replace(/[,()%*\\"&.;:/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tách câu tìm kiếm thành các nhóm từ: mỗi nhóm là danh sách cách viết tương đương (đã chuẩn hóa không dấu).
 * Bản ghi khớp khi MỌI nhóm có ít nhất một cách viết xuất hiện trong văn bản.
 */
export function searchTokenGroups(query: string): string[][] {
  const clean = normalize(query ?? '');
  if (!clean) return [];
  return clean.split(' ').map((token) => {
    const expansions = ABBREVIATIONS_DICT[token]?.map(normalize) ?? [];
    return [token, ...expansions];
  });
}

/**
 * Biểu thức lọc tại DB cho cột search_text (đã không dấu): mỗi nhóm → một `.or()`; các `.or()` được AND với nhau.
 */
export function buildSearchFilters(query: string, column = 'search_text'): string[] {
  return searchTokenGroups(query).map((group) => group.map((alt) => `${column}.ilike.*${alt}*`).join(','));
}

/**
 * So khớp chuỗi tìm kiếm thông minh có hỗ trợ từ viết tắt và không dấu (dùng ở client: dropdown, dữ liệu demo)
 */
export function matchesSmartSearch(text: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!text) return false;
  const cleanText = normalize(text);
  return searchTokenGroups(query).every((group) => group.some((alt) => cleanText.includes(alt)));
}
