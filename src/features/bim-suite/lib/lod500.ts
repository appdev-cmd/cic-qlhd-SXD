// LOD 500 (mô hình hoàn công đã xác minh hiện trường): nhập sổ xác minh từ Excel và nhãn tiêu chí.
// Tiêu chí và ngưỡng do CSDL tính (migration 20261024090000, hàm bim_lod500_danh_gia).
import { findColumns, toIsoDate, toNumber, type ParseResult } from './planImport';

type Cell = string | number | boolean | Date | null | undefined;

export type VerificationResult = 'dat' | 'sai_lech' | 'ngoai_pham_vi';
export type VerificationMethod = 'quet_laser' | 'toan_dac' | 'do_thu_cong' | 'nghiem_thu';

export interface VerificationRow {
  global_id: string;
  ket_qua: VerificationResult;
  ngay_xac_minh: string | null;
  don_vi_xac_minh: string | null;
  phuong_phap: VerificationMethod | null;
  sai_so_mm: number | null;
  dung_sai_mm: number | null;
  bien_ban: string | null;
  ly_do: string | null;
}

export const RESULT_LABELS: Record<VerificationResult, string> = {
  dat: 'Đạt',
  sai_lech: 'Sai lệch',
  ngoai_pham_vi: 'Ngoài phạm vi',
};
export const METHOD_LABELS: Record<VerificationMethod, string> = {
  quet_laser: 'Quét laser',
  toan_dac: 'Toàn đạc',
  do_thu_cong: 'Đo thủ công',
  nghiem_thu: 'Nghiệm thu',
};
export const LOD_TEMPLATE_HEADERS = [
  'GlobalId',
  'Kết quả',
  'Ngày xác minh',
  'Đơn vị xác minh',
  'Phương pháp',
  'Sai số (mm)',
  'Dung sai (mm)',
  'Số biên bản',
  'Lý do (nếu ngoài phạm vi)',
];

const norm = (v: Cell) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

/** Chữ trong ô → mã kết quả; nhận cả mã và nhãn tiếng Việt. */
export function toResult(v: Cell): VerificationResult | null {
  const s = norm(v).replace(/[\s_-]+/g, ' ');
  if (/^(dat|ok|pass|dat yeu cau)$/.test(s)) return 'dat';
  if (/^(sai lech|khong dat|fail|vuot dung sai)$/.test(s)) return 'sai_lech';
  if (/^(ngoai pham vi|khong ap dung|n\/?a)$/.test(s)) return 'ngoai_pham_vi';
  return null;
}

export function toMethod(v: Cell): VerificationMethod | null {
  const s = norm(v).replace(/[\s_-]+/g, ' ');
  if (!s) return null;
  if (/laser|scan|quet/.test(s)) return 'quet_laser';
  if (/toan dac|total station/.test(s)) return 'toan_dac';
  if (/thu cong|thuoc|manual/.test(s)) return 'do_thu_cong';
  if (/nghiem thu/.test(s)) return 'nghiem_thu';
  return null;
}

const SPEC = {
  guid: /^global ?id|^guid|^ma cau kien/,
  ket_qua: /^ket qua/,
  ngay: /^ngay/,
  don_vi: /^don vi/,
  phuong_phap: /^phuong phap/,
  sai_so: /^sai so/,
  dung_sai: /^dung sai/,
  bien_ban: /^(so )?bien ban|^ho so/,
  ly_do: /^ly do/,
} as const;

/** Sổ xác minh hiện trường: mỗi dòng một cấu kiện. Dòng thiếu dữ liệu bắt buộc bị bỏ, kèm cảnh báo. */
export function parseVerificationSheet(sheet: Cell[][]): ParseResult<VerificationRow> {
  const found = findColumns(sheet, SPEC, ['guid', 'ket_qua']);
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột "GlobalId" và "Kết quả".'] };
  const { header, cols } = found;
  const at = (row: Cell[], key: keyof typeof SPEC) => (cols[key] === undefined ? undefined : row[cols[key]!]);
  const text = (row: Cell[], key: keyof typeof SPEC) => String(at(row, key) ?? '').trim() || null;
  const rows: VerificationRow[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    const guid = String(at(row, 'guid') ?? '').trim();
    if (!guid) continue;
    const line = `Dòng ${r + 1} (${guid})`;
    const ket_qua = toResult(at(row, 'ket_qua'));
    if (!ket_qua) {
      warnings.push(`${line}: kết quả phải là Đạt, Sai lệch hoặc Ngoài phạm vi.`);
      continue;
    }
    const v: VerificationRow = {
      global_id: guid,
      ket_qua,
      ngay_xac_minh: toIsoDate(at(row, 'ngay')),
      don_vi_xac_minh: text(row, 'don_vi'),
      phuong_phap: toMethod(at(row, 'phuong_phap')),
      sai_so_mm: toNumber(at(row, 'sai_so')),
      dung_sai_mm: toNumber(at(row, 'dung_sai')),
      bien_ban: text(row, 'bien_ban'),
      ly_do: text(row, 'ly_do'),
    };
    if (ket_qua === 'ngoai_pham_vi' && (v.ly_do ?? '').length < 3) {
      warnings.push(`${line}: ngoài phạm vi phải ghi lý do.`);
      continue;
    }
    if (ket_qua !== 'ngoai_pham_vi' && (!v.ngay_xac_minh || !v.phuong_phap)) {
      warnings.push(`${line}: thiếu ngày hoặc phương pháp xác minh.`);
      continue;
    }
    if (ket_qua === 'dat' && v.sai_so_mm !== null && v.dung_sai_mm !== null && v.sai_so_mm > v.dung_sai_mm) {
      warnings.push(`${line}: sai số ${v.sai_so_mm} mm vượt dung sai ${v.dung_sai_mm} mm, ghi là "Sai lệch".`);
      v.ket_qua = 'sai_lech';
    }
    if (seen.has(guid)) warnings.push(`${line}: GlobalId lặp, lấy dòng sau cùng.`);
    seen.add(guid);
    rows.push(v);
  }
  // Dòng sau cùng của một GlobalId thắng
  const last = new Map(rows.map((x) => [x.global_id, x]));
  return { rows: [...last.values()], warnings };
}
