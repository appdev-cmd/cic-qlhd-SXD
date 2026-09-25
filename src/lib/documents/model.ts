/**
 * Mô hình văn bản hành chính (thể thức Nghị định 30/2020/NĐ-CP) — nguồn duy nhất cho:
 * xem trước A4 trên web, in ấn, xuất DOCX.
 */

/** Khổ giấy & lề (mm) theo quy chuẩn dự án */
export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 22,
  marginBottomMm: 20,
  marginLeftMm: 30,
  marginRightMm: 20,
} as const;

/** Cỡ chữ (pt) theo Phụ lục I NĐ 30/2020/NĐ-CP */
export const FONT_PT = {
  agency: 12.5, // tên cơ quan: 12–13
  nationalTitle: 12.5, // quốc hiệu: 12–13
  motto: 13.5, // tiêu ngữ: 13–14
  number: 13, // số, ký hiệu
  placeDate: 13.5, // địa danh, ngày tháng: 13–14, nghiêng
  docType: 14, // tên loại văn bản: 13–14, đứng đậm
  subject: 14, // trích yếu: 13–14, đứng đậm
  body: 14, // nội dung: 13–14
  signer: 14, // quyền hạn, chức vụ, họ tên người ký: 13–14
  recipientsLabel: 12, // "Nơi nhận:" 12 nghiêng đậm
  recipients: 11, // danh sách nơi nhận: 11
  pageNumber: 13,
} as const;

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface DocParagraph {
  runs: TextRun[];
  align?: 'justify' | 'center' | 'left';
  /** Thụt đầu dòng 1 cm (mặc định true với đoạn nội dung) */
  indent?: boolean;
  /** Tiêu đề mục (I., II., ...) */
  heading?: boolean;
}

export interface AdminDocument {
  kind: 'mau_03' | 'gpxd' | 'yeu_cau_bo_sung' | 'custom';
  agencyParent: string;
  agency: string;
  number: string;
  place: string;
  dateIso: string;
  docType: string;
  subject: string;
  recipient?: string;
  paragraphs: DocParagraph[];
  signer: {
    authority?: string; // KT. GIÁM ĐỐC
    title: string; // PHÓ GIÁM ĐỐC
    name: string;
  };
  recipients: string[];
  isSigned?: boolean;
  /** Đánh dấu dự thảo (chưa ký ban hành) */
  isDraft?: boolean;
}

/** Tách chuỗi có đánh dấu **đậm** thành các đoạn chữ */
export function md(text: string): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('**') && part.endsWith('**') ? { text: part.slice(2, -2), bold: true } : { text: part }));
}

export function p(text: string, opts: Omit<DocParagraph, 'runs'> = {}): DocParagraph {
  return { runs: md(text), indent: true, align: 'justify', ...opts };
}

export function heading(text: string): DocParagraph {
  return { runs: [{ text, bold: true }], heading: true, indent: true, align: 'justify' };
}

/** "Điện Biên, ngày 25 tháng 9 năm 2026" — ngày < 10 và tháng 1, 2 thêm số 0 theo NĐ 30 */
export function formatAdminDate(place: string, iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const day = d < 10 ? `0${d}` : String(d);
  const month = m < 3 ? `0${m}` : String(m);
  return `${place}, ngày ${day} tháng ${month} năm ${y}`;
}
