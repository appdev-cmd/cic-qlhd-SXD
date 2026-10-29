// Đọc tệp đầu vào của 4D/5D: tiến độ (Excel, MS Project XML), định mức và giá dự thầu (Excel).
// Chỉ chuyển đổi dữ liệu; kiểm tra quyền và ghi CSDL do RPC máy chủ đảm nhận.

export interface ScheduleImportRow {
  ma_wbs: string;
  ten: string;
  bat_dau?: string | null;
  ket_thuc?: string | null;
  ty_trong?: number | null;
  tien_nhiem_wbs?: string | null;
  vi_tri?: string | null;
  bo_mon?: string | null;
  la_tom_tat?: boolean;
  phan_tram_thuc_te?: number | null;
  guid?: string[];
}

export interface ParseResult<T> {
  rows: T[];
  warnings: string[];
}

type Cell = string | number | boolean | Date | null | undefined;

const norm = (v: Cell) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

/** Ngày từ ô Excel (số sê-ri, Date, dd/mm/yyyy, yyyy-mm-dd) → yyyy-mm-dd; không đọc được → null. */
export function toIsoDate(v: Cell): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Số từ ô Excel. Có cả "." và "," thì dấu đứng sau là dấu thập phân ("1.234,5" và "1,234.5").
 * Chỉ dấu chấm: nhóm 3 chữ số đều đặn là phân cách nghìn ("1.234", "1.234.567"), còn lại là thập phân ("0.75").
 * Chỉ dấu phẩy: theo cách viết Việt Nam là thập phân ("1,025", "2,5"), trừ khi có từ hai nhóm nghìn ("1,234,567").
 */
export function toNumber(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[%\s]/g, '');
  if (!s) return null;
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? '.' : ',';
    s = s
      .split(dec === '.' ? ',' : '.')
      .join('')
      .replace(dec, '.');
  } else if (comma >= 0) {
    s = /^-?[1-9]\d{0,2}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dot >= 0 && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Tìm dòng tiêu đề và cột theo từ khóa (đã bỏ dấu). Trả về chỉ số dòng tiêu đề và ánh xạ khóa → cột. */
export function findColumns<S extends Record<string, RegExp>>(
  sheet: Cell[][],
  spec: S,
  required: (keyof S)[],
): { header: number; cols: Partial<Record<keyof S, number>> } | null {
  type K = keyof S;
  for (let r = 0; r < Math.min(sheet.length, 30); r++) {
    const row = sheet[r] ?? [];
    const cols: Partial<Record<K, number>> = {};
    row.forEach((cell, c) => {
      const text = norm(cell);
      if (!text) return;
      for (const key of Object.keys(spec) as K[]) {
        if (cols[key] === undefined && spec[key].test(text)) {
          cols[key] = c;
          break;
        }
      }
    });
    if (required.every((k) => cols[k] !== undefined)) return { header: r, cols };
  }
  return null;
}

const SCHEDULE_SPEC = {
  ma_wbs: /^(ma )?wbs|^ma cong viec|^ma hieu|^stt wbs/,
  tien_nhiem: /tien nhiem|predecessor|cong viec truoc/,
  ten: /^ten|task name|^cong viec|^noi dung/,
  bat_dau: /bat dau|^start|^tu ngay/,
  ket_thuc: /ket thuc|^finish|^end|^den ngay/,
  ty_trong: /ty trong|trong so|weight/,
  phan_tram: /% ?(hoan thanh|thuc te|complete)|^phan tram|percent/,
  vi_tri: /vi tri|^tang|location|khu vuc/,
  bo_mon: /bo mon|discipline/,
  tom_tat: /tom tat|summary|hang muc lon/,
  guid: /guid|globalid/,
} as const;

/** Bảng tính tiến độ: dòng đầu có "Mã WBS" và "Tên công việc"; các cột khác tùy chọn. */
export function parseScheduleSheet(sheet: Cell[][]): ParseResult<ScheduleImportRow> {
  const found = findColumns(sheet, SCHEDULE_SPEC, ['ma_wbs', 'ten']);
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột "Mã WBS" và "Tên công việc".'] };
  const { header, cols } = found;
  const at = (row: Cell[], key: keyof typeof SCHEDULE_SPEC) => (cols[key] === undefined ? undefined : row[cols[key]!]);
  const rows: ScheduleImportRow[] = [];
  const warnings: string[] = [];
  const wbsSet = new Set<string>();
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    const wbs = String(at(row, 'ma_wbs') ?? '').trim();
    const ten = String(at(row, 'ten') ?? '').trim();
    if (!wbs && !ten) continue;
    if (wbsSet.has(wbs)) warnings.push(`Dòng ${r + 1}: mã WBS ${wbs} trùng, dòng sau ghi đè dòng trước.`);
    wbsSet.add(wbs);
    const bd = at(row, 'bat_dau');
    const kt = at(row, 'ket_thuc');
    if (bd && !toIsoDate(bd)) warnings.push(`Dòng ${r + 1}: không đọc được ngày bắt đầu "${String(bd)}".`);
    if (kt && !toIsoDate(kt)) warnings.push(`Dòng ${r + 1}: không đọc được ngày kết thúc "${String(kt)}".`);
    const tomTat = norm(at(row, 'tom_tat'));
    rows.push({
      ma_wbs: wbs,
      ten,
      bat_dau: toIsoDate(bd),
      ket_thuc: toIsoDate(kt),
      ty_trong: toNumber(at(row, 'ty_trong')),
      tien_nhiem_wbs: String(at(row, 'tien_nhiem') ?? '').trim() || null,
      vi_tri: String(at(row, 'vi_tri') ?? '').trim() || null,
      bo_mon: String(at(row, 'bo_mon') ?? '').trim() || null,
      la_tom_tat: ['x', 'co', 'yes', '1', 'true'].includes(tomTat),
      phan_tram_thuc_te: toNumber(at(row, 'phan_tram')),
      guid: String(at(row, 'guid') ?? '')
        .split(/[\s,;]+/)
        .map((g) => g.trim())
        .filter((g) => /^[0-9A-Za-z_$]{22}$/.test(g)),
    });
  }
  // Dòng tóm tắt suy từ WBS: mã là tiền tố của mã khác ("1" của "1.1")
  for (const row of rows)
    if (!row.la_tom_tat && rows.some((o) => o !== row && o.ma_wbs.startsWith(`${row.ma_wbs}.`))) row.la_tom_tat = true;
  return { rows, warnings };
}

/** MS Project XML (Lưu dưới dạng XML): Task/UID/WBS/Name/Start/Finish/Summary/PercentComplete/PredecessorLink. */
export function parseMsProjectXml(xml: string): ParseResult<ScheduleImportRow> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { rows: [], warnings: ['Tệp XML không hợp lệ.'] };
  const text = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  const tasks = Array.from(doc.getElementsByTagName('Task'));
  const wbsByUid = new Map<string, string>();
  for (const t of tasks) wbsByUid.set(text(t, 'UID'), text(t, 'WBS') || text(t, 'OutlineNumber') || text(t, 'ID'));
  const rows: ScheduleImportRow[] = [];
  const warnings: string[] = [];
  for (const t of tasks) {
    const name = text(t, 'Name');
    if (!name || text(t, 'UID') === '0' || text(t, 'IsNull') === '1') continue;
    const pred = t.getElementsByTagName('PredecessorLink');
    if (pred.length > 1) warnings.push(`${name}: có ${pred.length} công việc tiền nhiệm, chỉ lấy công việc đầu.`);
    const predUid = pred[0] ? text(pred[0], 'PredecessorUID') : '';
    rows.push({
      ma_wbs: wbsByUid.get(text(t, 'UID'))!,
      ten: name,
      bat_dau: toIsoDate(text(t, 'Start')),
      ket_thuc: toIsoDate(text(t, 'Finish')),
      la_tom_tat: text(t, 'Summary') === '1',
      phan_tram_thuc_te: toNumber(text(t, 'PercentComplete')),
      tien_nhiem_wbs: predUid ? (wbsByUid.get(predUid) ?? null) : null,
    });
  }
  if (!rows.length) warnings.push('Không có công việc nào trong tệp.');
  return { rows, warnings };
}

export interface NormImportRow {
  ma_dinh_muc: string;
  ten_cong_tac: string;
  don_vi: string;
  nhom?: string | null;
  loai_cau_kien_goi_y?: string[];
  tu_khoa?: string[];
  hao_phi: { loai: 'vat_lieu' | 'nhan_cong' | 'may'; ten: string; don_vi: string | null; dinh_muc: number }[];
}

const NORM_SPEC = {
  ma: /^ma (hieu|dinh muc)|^ma$|^ma hieu/,
  ten: /^ten cong tac|^ten$|^noi dung cong viec|^ten cong viec/,
  don_vi: /^don vi$|^don vi tinh|^dvt$/,
  nhom: /^nhom|^chuong/,
  loai_ifc: /loai cau kien|ifc/,
  tu_khoa: /tu khoa/,
  loai_hp: /loai hao phi|^loai$/,
  thanh_phan: /thanh phan|ten hao phi|vat lieu, nhan cong/,
  don_vi_tp: /don vi (thanh phan|hao phi)|dvt hao phi/,
  dinh_muc: /^dinh muc|^hao phi$|^luong hao phi/,
} as const;

/** Định mức: mỗi dòng một thành phần hao phí; các dòng cùng mã hiệu gộp thành một định mức. */
export function parseNormSheet(sheet: Cell[][]): ParseResult<NormImportRow> {
  const found = findColumns(sheet, NORM_SPEC, ['ma', 'ten', 'don_vi']);
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột "Mã hiệu", "Tên công tác", "Đơn vị".'] };
  const { header, cols } = found;
  const at = (row: Cell[], key: keyof typeof NORM_SPEC) => (cols[key] === undefined ? undefined : row[cols[key]!]);
  const byCode = new Map<string, NormImportRow>();
  const warnings: string[] = [];
  let current: NormImportRow | null = null;
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    const ma = String(at(row, 'ma') ?? '')
      .trim()
      .toUpperCase();
    if (ma) {
      current = byCode.get(ma) ?? {
        ma_dinh_muc: ma,
        ten_cong_tac: String(at(row, 'ten') ?? '').trim(),
        don_vi: String(at(row, 'don_vi') ?? '').trim(),
        nhom: String(at(row, 'nhom') ?? '').trim() || null,
        loai_cau_kien_goi_y: String(at(row, 'loai_ifc') ?? '')
          .split(/[\s,;]+/)
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean),
        tu_khoa: String(at(row, 'tu_khoa') ?? '')
          .split(/[,;]+/)
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
        hao_phi: [],
      };
      byCode.set(ma, current);
      if (!current.ten_cong_tac || !current.don_vi)
        warnings.push(`Dòng ${r + 1}: mã ${ma} thiếu tên công tác hoặc đơn vị.`);
    }
    const tp = String(at(row, 'thanh_phan') ?? '').trim();
    if (!tp || !current) continue;
    const loai = norm(at(row, 'loai_hp'));
    const dm = toNumber(at(row, 'dinh_muc'));
    if (dm === null) {
      warnings.push(`Dòng ${r + 1}: thành phần "${tp}" không có lượng hao phí.`);
      continue;
    }
    current.hao_phi.push({
      loai: loai.startsWith('nhan') ? 'nhan_cong' : loai.startsWith('may') ? 'may' : 'vat_lieu',
      ten: tp,
      don_vi: String(at(row, 'don_vi_tp') ?? '').trim() || null,
      dinh_muc: dm,
    });
  }
  const rows = [...byCode.values()].filter((r) => r.ten_cong_tac && r.don_vi);
  return { rows, warnings };
}

export interface BidImportRow {
  ma_hieu: string | null;
  ten_cong_viec: string;
  don_vi: string | null;
  khoi_luong: number | null;
  don_gia: number | null;
}

const BID_SPEC = {
  ma: /^ma (hieu|cong viec|dinh muc)|^ma hieu|^ma$/,
  ten: /^ten cong viec|^noi dung|^hang muc|^ten$/,
  don_vi: /^don vi|^dvt/,
  khoi_luong: /^khoi luong|^kl$/,
  don_gia: /^don gia/,
} as const;

/** Bảng giá dự thầu: Mã hiệu, Tên công việc, Đơn vị, Khối lượng, Đơn giá. */
export function parseBidSheet(sheet: Cell[][]): ParseResult<BidImportRow> {
  const found = findColumns(sheet, BID_SPEC, ['ten', 'don_gia']);
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột "Tên công việc" và "Đơn giá".'] };
  const { header, cols } = found;
  const at = (row: Cell[], key: keyof typeof BID_SPEC) => (cols[key] === undefined ? undefined : row[cols[key]!]);
  const rows: BidImportRow[] = [];
  const warnings: string[] = [];
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    const ten = String(at(row, 'ten') ?? '').trim();
    if (!ten) continue;
    const price = toNumber(at(row, 'don_gia'));
    if (price === null) warnings.push(`Dòng ${r + 1}: "${ten}" chưa có đơn giá.`);
    rows.push({
      ma_hieu:
        String(at(row, 'ma') ?? '')
          .trim()
          .toUpperCase() || null,
      ten_cong_viec: ten,
      don_vi: String(at(row, 'don_vi') ?? '').trim() || null,
      khoi_luong: toNumber(at(row, 'khoi_luong')),
      don_gia: price,
    });
  }
  return { rows, warnings };
}

/** Reads the first sheet of an .xlsx or .csv file (lib/xlsxRead.ts). */
export { readFirstSheet } from './xlsxRead';

/** Template with a header row (and example rows) as CSV, which Excel opens directly. */
export async function downloadTemplate(fileName: string, headers: string[], example: (string | number)[][] = []) {
  const { downloadCsv } = await import('./csv');
  downloadCsv(fileName.replace(/.xlsx?$/i, '.csv'), [headers, ...example]);
}
