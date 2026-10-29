// BIM 6D sustainability (migration 20261027140000): labels, factor / meter sheet parsing, carbon colour ramp.
import { findColumns, toIsoDate, toNumber } from './planImport';

type Cell = string | number | boolean | Date | null | undefined;

export const FACTOR_UNITS = ['m3', 'm2', 'm', 'kg', 't', 'cai', 'kWh', 'm3_nuoc', 'm3_gas'] as const;
export const FACTOR_STAGES = ['A1-A3', 'A4', 'A5', 'B6', 'B7', 'C1-C4'] as const;
export const RELIABILITY_LABELS: Record<string, string> = {
  epd_vn: 'EPD nhà sản xuất Việt Nam',
  epd_quoc_te: 'EPD quốc tế',
  csdl_quoc_te: 'Cơ sở dữ liệu quốc tế',
  cong_bo_nha_nuoc: 'Công bố của cơ quan nhà nước',
  noi_bo: 'Nội bộ',
};
export const STAGE_LABELS: Record<string, string> = {
  'A1-A3': 'A1–A3 Sản xuất vật liệu',
  A4: 'A4 Vận chuyển',
  A5: 'A5 Thi công',
  B6: 'B6 Năng lượng vận hành',
  B7: 'B7 Nước vận hành',
  'C1-C4': 'C1–C4 Cuối vòng đời',
};
export const METER_LABELS: Record<string, { label: string; unit: string }> = {
  dien: { label: 'Điện', unit: 'kWh' },
  nuoc: { label: 'Nước', unit: 'm³' },
  gas: { label: 'Gas', unit: 'm³' },
  tai_tao: { label: 'Điện tái tạo', unit: 'kWh' },
};
export const TARGET_LABELS: Record<string, { label: string; unit: string; chieu: 'toi_da' | 'toi_thieu' }> = {
  carbon_ngam_m2: { label: 'Carbon ngầm', unit: 'kgCO₂e/m²', chieu: 'toi_da' },
  eui: { label: 'Cường độ năng lượng (EUI)', unit: 'kWh/m²/năm', chieu: 'toi_da' },
  wui: { label: 'Cường độ nước (WUI)', unit: 'm³/m²/năm', chieu: 'toi_da' },
  carbon_van_hanh_m2: { label: 'Carbon vận hành', unit: 'kgCO₂e/m²/năm', chieu: 'toi_da' },
  ty_le_tai_tao: { label: 'Tỷ lệ điện tái tạo', unit: '%', chieu: 'toi_thieu' },
};
export const FRAMEWORK_LABELS: Record<string, string> = {
  'QCVN09:2017': 'QCVN 09:2017/BXD',
  LOTUS: 'LOTUS (VGBC)',
  EDGE: 'EDGE (IFC)',
  LEED: 'LEED',
  noi_bo: 'Mục tiêu nội bộ',
};
export const CARBON_STATUS_LABELS: Record<string, string> = {
  da_tinh: 'Đã tính',
  thieu_anh_xa: 'Chưa ánh xạ vật liệu',
  thieu_he_so: 'Chưa có hệ số',
  thieu_khoi_luong: 'Thiếu khối lượng',
  khong_ap_dung: 'Không áp dụng',
};

/** Thang màu thứ bậc một sắc độ (đã kiểm tra tương phản), nhạt = ít carbon. Xám: chưa tính được. */
export const CARBON_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
export const CARBON_MISSING = '#9ca3af';

/** Ngưỡng chia 5 bậc theo phân vị của các giá trị dương (bậc bằng nhau khi ít giá trị khác nhau). */
export function carbonBreaks(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]);
}
export const carbonClass = (value: number, breaks: number[]) => {
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return i;
};

export interface FactorImportRow {
  ma_vat_lieu: string;
  ten: string;
  don_vi: string;
  giai_doan: string;
  he_so: number;
  nguon: string;
  phien_ban: string;
  do_tin_cay: string;
  hieu_luc_tu: string | null;
  hieu_luc_den: string | null;
}

const RELIABILITY_KEYS: [RegExp, string][] = [
  [/epd.*(vn|viet)/, 'epd_vn'],
  [/epd/, 'epd_quoc_te'],
  [/co so du lieu|database|csdl|ice|ecoinvent/, 'csdl_quoc_te'],
  [/nha nuoc|bo |cong bo|chinh phu/, 'cong_bo_nha_nuoc'],
  [/noi bo/, 'noi_bo'],
];
const plain = (v: Cell) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

export function parseFactorSheet(sheet: Cell[][]): { rows: FactorImportRow[]; warnings: string[] } {
  const found = findColumns(
    sheet,
    {
      ma: /^ma vat lieu|^ma$/,
      ten: /^ten/,
      don_vi: /^don vi/,
      giai_doan: /giai doan|stage/,
      he_so: /^he so|kgco2|factor/,
      nguon: /^nguon|source/,
      phien_ban: /phien ban|version/,
      tin_cay: /tin cay|loai nguon|reliab/,
      tu: /hieu luc tu|^tu ngay/,
      den: /hieu luc den|^den ngay/,
    },
    ['ma', 'ten', 'don_vi', 'he_so', 'nguon'],
  );
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột Mã vật liệu, Tên, Đơn vị, Hệ số, Nguồn.'] };
  const { header, cols } = found;
  const at = (row: Cell[], k: keyof typeof cols) => (cols[k] === undefined ? undefined : row[cols[k]!]);
  const rows: FactorImportRow[] = [];
  const warnings: string[] = [];
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    // Mã chỉ gồm chữ không dấu, số, _ . - (ràng buộc của bim_6d_he_so)
    const ma = plain(at(row, 'ma'))
      .toUpperCase()
      .replace(/[^A-Z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!ma) continue;
    const heSo = toNumber(at(row, 'he_so'));
    const donVi = String(at(row, 'don_vi') ?? '')
      .trim()
      .replace('m³', 'm3')
      .replace('m²', 'm2');
    const giaiDoan =
      String(at(row, 'giai_doan') ?? '')
        .trim()
        .toUpperCase()
        .replace('–', '-') || 'A1-A3';
    const nguon = String(at(row, 'nguon') ?? '').trim();
    const tinCay =
      RELIABILITY_KEYS.find(([re]) => re.test(plain(at(row, 'tin_cay'))))?.[1] ??
      (plain(at(row, 'tin_cay')) || 'noi_bo');
    const problems = [
      heSo === null || heSo < 0 ? 'hệ số không hợp lệ' : '',
      !(FACTOR_UNITS as readonly string[]).includes(donVi)
        ? `đơn vị "${donVi}" không thuộc ${FACTOR_UNITS.join(', ')}`
        : '',
      !(FACTOR_STAGES as readonly string[]).includes(giaiDoan) ? `giai đoạn "${giaiDoan}" không hợp lệ` : '',
      nguon.length < 3 ? 'thiếu nguồn' : '',
      !RELIABILITY_LABELS[tinCay] ? `độ tin cậy "${tinCay}" không hợp lệ` : '',
    ].filter(Boolean);
    if (problems.length) {
      warnings.push(`Dòng ${r + 1} (${ma}): ${problems.join(', ')}.`);
      continue;
    }
    rows.push({
      ma_vat_lieu: ma,
      ten: String(at(row, 'ten') ?? '').trim(),
      don_vi: donVi,
      giai_doan: giaiDoan,
      he_so: heSo!,
      nguon,
      phien_ban: String(at(row, 'phien_ban') ?? '').trim() || '1',
      do_tin_cay: tinCay,
      hieu_luc_tu: toIsoDate(at(row, 'tu')),
      hieu_luc_den: toIsoDate(at(row, 'den')),
    });
  }
  return { rows, warnings };
}

export interface MeterImportRow {
  loai: 'dien' | 'nuoc' | 'gas' | 'tai_tao';
  ky: string;
  gia_tri: number;
  nguon: 'hoa_don' | 'nhap_tay';
  ghi_chu?: string | null;
}

/** Số đo tháng: Tháng (01/2026, 2026-01, ngày bất kỳ trong tháng), Loại, Giá trị, Nguồn (hóa đơn/nhập tay), Ghi chú. */
export function parseMeterSheet(sheet: Cell[][]): { rows: MeterImportRow[]; warnings: string[] } {
  const found = findColumns(
    sheet,
    {
      thang: /^thang|^ky|month/,
      loai: /^loai/,
      gia_tri: /gia tri|^so do|chi so|luong/,
      nguon: /^nguon/,
      ghi_chu: /ghi chu/,
    },
    ['thang', 'loai', 'gia_tri'],
  );
  if (!found) return { rows: [], warnings: ['Không thấy dòng tiêu đề có cột Tháng, Loại, Giá trị.'] };
  const { header, cols } = found;
  const at = (row: Cell[], k: keyof typeof cols) => (cols[k] === undefined ? undefined : row[cols[k]!]);
  const rows: MeterImportRow[] = [];
  const warnings: string[] = [];
  for (let r = header + 1; r < sheet.length; r++) {
    const row = sheet[r] ?? [];
    const rawMonth = at(row, 'thang');
    if (rawMonth === null || rawMonth === undefined || rawMonth === '') continue;
    const mm = String(rawMonth)
      .trim()
      .match(/^(\d{1,2})[/.-](\d{4})$/);
    const iso = mm ? `${mm[2]}-${mm[1].padStart(2, '0')}-01` : toIsoDate(rawMonth);
    const loaiText = plain(at(row, 'loai'));
    const loai = loaiText.startsWith('nuoc')
      ? 'nuoc'
      : loaiText.startsWith('gas')
        ? 'gas'
        : loaiText.includes('tai tao') || loaiText.includes('mat troi')
          ? 'tai_tao'
          : loaiText.startsWith('dien')
            ? 'dien'
            : null;
    const value = toNumber(at(row, 'gia_tri'));
    if (!iso || !loai || value === null || value < 0) {
      warnings.push(`Dòng ${r + 1}: thiếu tháng, loại hoặc giá trị hợp lệ.`);
      continue;
    }
    rows.push({
      loai,
      ky: `${iso.slice(0, 7)}-01`,
      gia_tri: value,
      nguon: plain(at(row, 'nguon')).startsWith('hoa') ? 'hoa_don' : 'nhap_tay',
      ghi_chu: String(at(row, 'ghi_chu') ?? '').trim() || null,
    });
  }
  return { rows, warnings };
}
