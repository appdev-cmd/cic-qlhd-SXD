// Tên tệp CDE theo tiêu chuẩn của dự án (QĐ 348/QĐ-BXD, ISO 19650-2).
// Quy tắc kiểm tra giống hệt hàm SQL public.document_cde_name_problem (migration 20261027120000).

export const DEFAULT_NAMING_TEMPLATE = '<Dự án>-<Đơn vị>-<Khu vực>-<Tầng>-<Loại>-<Bộ môn>-<Số>';

export type CdeZone = 'wip' | 'shared' | 'published' | 'archived';
export const CDE_ZONES: CdeZone[] = ['wip', 'shared', 'published', 'archived'];
export const CDE_ZONE_LABELS: Record<CdeZone, string> = {
  wip: 'Đang thực hiện (WIP)',
  shared: 'Chia sẻ (SHARED)',
  published: 'Phát hành (PUBLISHED)',
  archived: 'Lưu trữ (ARCHIVE)',
};

export const SUITABILITY_LABELS: Record<string, string> = {
  S0: 'S0 · Đang thực hiện',
  S1: 'S1 · Dùng để phối hợp',
  S2: 'S2 · Dùng để tham khảo',
  S3: 'S3 · Để xem xét, góp ý',
  S4: 'S4 · Đề nghị phê duyệt',
  A1: 'A1 · Phát hành thiết kế',
  A2: 'A2 · Phát hành thi công',
  A3: 'A3 · Phát hành hoàn công',
  A4: 'A4 · Phát hành vận hành',
  A5: 'A5 · Phát hành khác',
  B1: 'B1 · Phát hành có góp ý (thiết kế)',
  B2: 'B2 · Phát hành có góp ý (thi công)',
  B3: 'B3 · Phát hành có góp ý (hoàn công)',
  CR: 'CR · Hồ sơ hoàn công',
};
export const SHARED_CODES = ['S1', 'S2', 'S3', 'S4'] as const;
export const PUBLISH_CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'CR'] as const;

/** Mã loại thông tin (trường <Loại>). */
export const INFO_TYPES: Record<string, string> = {
  M3: 'Mô hình 3D',
  DR: 'Bản vẽ',
  RP: 'Báo cáo',
  SP: 'Chỉ dẫn kỹ thuật',
  SH: 'Bảng tính, danh mục',
  CA: 'Tính toán',
  MI: 'Biên bản họp',
  CO: 'Thư từ, công văn',
};
/** Mã bộ môn (trường <Bộ môn>). */
export const ROLE_CODES: Record<string, string> = {
  A: 'Kiến trúc',
  S: 'Kết cấu',
  M: 'Cơ khí, điều hòa thông gió',
  E: 'Điện',
  P: 'Cấp thoát nước',
  F: 'Phòng cháy chữa cháy',
  C: 'Hạ tầng, giao thông',
  L: 'Cảnh quan',
  Z: 'Tổng hợp nhiều bộ môn',
};
const DISCIPLINE_ROLE: Record<string, string> = {
  KIEN_TRUC: 'A',
  KET_CAU: 'S',
  MEP: 'M',
  DIEN: 'E',
  CAP_THOAT_NUOC: 'P',
  PCCC: 'F',
  HA_TANG: 'C',
  TOAN_THE: 'Z',
};
export const roleCodeOfDiscipline = (discipline?: string | null) => DISCIPLINE_ROLE[discipline ?? ''] ?? 'Z';

/** Tên các trường theo mẫu; mẫu không có <…> dùng mẫu mặc định 7 trường. */
export function templateFields(template?: string | null): string[] {
  const fields = (template ?? '').match(/<[^>]+>/g);
  return fields?.length ? fields.map((f) => f.slice(1, -1).trim()) : templateFields(DEFAULT_NAMING_TEMPLATE);
}

/** null khi tên đúng tiêu chuẩn, ngược lại là lý do. Giống public.document_cde_name_problem. */
export function checkCdeName(name: string | null | undefined, template?: string | null): string | null {
  const count = templateFields(template).length;
  if (!name || !name.trim()) return 'Chưa có tên tệp.';
  if (name.length > 120) return 'Tên tệp dài quá 120 ký tự.';
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(name))
    return 'Chỉ dùng chữ in hoa không dấu, chữ số và dấu gạch ngang giữa các trường.';
  const parts = name.split('-');
  if (parts.length !== count) return `Cần đúng ${count} trường, đang có ${parts.length}.`;
  if (!/^[0-9]{4,6}$/.test(parts[count - 1])) return 'Trường cuối (số hiệu) phải có 4–6 chữ số.';
  return null;
}

/** Bỏ dấu tiếng Việt, đổi sang chữ in hoa, chỉ giữ chữ và số. */
export function codeSegment(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/** Ghép tên từ giá trị từng trường theo thứ tự của mẫu; số hiệu được đệm 4 chữ số. */
export function buildCdeName(values: string[], template?: string | null): string {
  const fields = templateFields(template);
  return fields
    .map((_, i) => {
      const v = codeSegment(values[i]);
      return i === fields.length - 1 ? v.replace(/\D/g, '').padStart(4, '0').slice(-6) : v;
    })
    .join('-');
}
