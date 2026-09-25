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
 * Loại bỏ dấu tiếng Việt để tìm kiếm không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  return str;
}

/**
 * So khớp chuỗi tìm kiếm thông minh có hỗ trợ từ viết tắt và không dấu
 */
export function matchesSmartSearch(text: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!text) return false;

  const cleanQuery = removeVietnameseTones(query.trim().toLowerCase());
  const cleanText = removeVietnameseTones(text.toLowerCase());

  // Khớp trực tiếp
  if (cleanText.includes(cleanQuery)) return true;

  // Khớp từ điển viết tắt
  for (const [abbr, fullNames] of Object.entries(ABBREVIATIONS_DICT)) {
    if (cleanQuery.includes(abbr)) {
      for (const name of fullNames) {
        const cleanName = removeVietnameseTones(name);
        if (cleanText.includes(cleanName)) return true;
      }
    }
  }

  return false;
}
