// features/bim/lib/estimateImport.ts
// 5D: nhập đơn giá từ file dự toán Excel (mã hiệu định mức · nội dung công việc · đơn vị · đơn giá)
// và gợi ý ánh xạ sang loại cấu kiện IFC / vật liệu trong mô hình.

import type { BimCostUnit } from '@/features/bim-suite/types/bim.types';

export interface EstimateRow {
  index: number;
  ma_hieu: string;
  ten: string;
  don_vi_goc: string;
  don_gia_goc: number;
  /** Đơn vị quy đổi sang đơn vị bóc tách của mô hình */
  don_vi: BimCostUnit | null;
  /** Đơn giá đã quy đổi theo đơn vị bóc tách (VD 100m² → m²: chia 100) */
  don_gia: number;
  loai_cau_kien: string | null;
  vat_lieu: string | null;
  nguon_goi_y?: 'quy_tac' | 'ai' | 'tay';
  ly_do?: string;
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();

/** Đơn vị dự toán → đơn vị bóc tách + hệ số chia đơn giá */
export const convertUnit = (raw: string): { unit: BimCostUnit; factor: number } | null => {
  const u = norm(raw).replace(/\s/g, '').replace('³', '3').replace('²', '2');
  const m = u.match(/^(\d+(?:[.,]\d+)?)?(.*)$/);
  const mult = m?.[1] ? Number(m[1].replace(',', '.')) : 1;
  const base = m?.[2] || u;
  if (!Number.isFinite(mult) || mult <= 0) return null;
  const pick = (unit: BimCostUnit, factor = 1) => ({ unit, factor: factor * mult });
  if (/^(m3|khối)$/.test(base)) return pick('m3');
  if (/^(m2)$/.test(base)) return pick('m2');
  if (/^(m|md|mdài|mét)$/.test(base)) return pick('m');
  if (/^(kg)$/.test(base)) return pick('kg');
  if (/^(tấn|tan|t)$/.test(base)) return pick('kg', 1000);
  if (/^(cái|cai|chiếc|bộ|bo|cấukiện|cáy|con|cột|tấm|ô)$/.test(base)) return pick('cai');
  return null;
};

const RULES: [RegExp, string][] = [
  [/cọc/, 'IFCPILE'],
  [/móng|đài/, 'IFCFOOTING'],
  [/cột/, 'IFCCOLUMN'],
  [/dầm|giằng|lanh tô|xà/, 'IFCBEAM'],
  [/sàn|mái bằng|bản thang|ô văng|sênô|seno/, 'IFCSLAB'],
  [/cầu thang/, 'IFCSTAIR'],
  [/tường|vách/, 'IFCWALL'],
  [/cửa sổ/, 'IFCWINDOW'],
  [/cửa đi|cửa/, 'IFCDOOR'],
  [/lan can|tay vịn/, 'IFCRAILING'],
  [/trần|ốp|lát/, 'IFCCOVERING'],
  [/mái/, 'IFCROOF'],
  [/ống gió/, 'IFCDUCTSEGMENT'],
  [/ống|đường ống/, 'IFCPIPESEGMENT'],
];

/** Từ khóa vật liệu để lọc (khớp chứa trong tên vật liệu của cấu kiện) */
export const materialKeyword = (name: string): string | null => {
  const n = norm(name);
  const grade = n.match(/\b(b\s?\d{2}(?:[.,]\d)?)\b/) || n.match(/mác\s*(\d{3})/);
  if (grade) return grade[1].startsWith('b') ? grade[1].replace(/\s/g, '').toUpperCase() : `M${grade[1]}`;
  if (/bê tông|btct/.test(n)) return 'bê tông';
  if (/thép|sắt/.test(n)) return 'thép';
  if (/gạch/.test(n)) return 'gạch';
  if (/gỗ/.test(n)) return 'gỗ';
  if (/kính/.test(n)) return 'kính';
  return null;
};

/** Gợi ý theo quy tắc từ khóa; chỉ nhận loại có trong mô hình */
export const suggestByRules = (name: string, available: Set<string>): { loai: string | null; reason: string } => {
  const n = norm(name);
  if (/ván khuôn|vận chuyển|nhân công|máy thi công|lắp dựng giàn|đào|đắp|san lấp/.test(n)) {
    return { loai: null, reason: 'Công việc không lấy khối lượng trực tiếp từ mô hình' };
  }
  for (const [re, loai] of RULES) {
    if (re.test(n)) {
      const candidates = loai === 'IFCWALL' ? ['IFCWALL', 'IFCWALLSTANDARDCASE'] : [loai];
      const hit = candidates.find((c) => available.has(c));
      if (!hit && loai === 'IFCDUCTSEGMENT') return { loai: null, reason: 'Không có lớp ống gió trong mô hình' };
      if (hit) return { loai: hit, reason: `Từ khóa “${n.match(re)![0]}”` };
    }
  }
  return { loai: null, reason: 'Chưa nhận diện được' };
};

const HEADER_KEYS = {
  ma: /mã\s*hiệu|mã\s*số|mã\s*đm|mã\s*định\s*mức|mã\s*công\s*việc/,
  ten: /nội\s*dung|tên\s*công\s*việc|hạng\s*mục|diễn\s*giải|công\s*việc/,
  dv: /đơn\s*vị|đvt/,
  gia: /đơn\s*giá|giá\s*trị\s*đơn\s*vị|đ\.giá/,
};

const toNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\s/g, '');
  if (!s) return NaN;
  // 1.234.567 hoặc 1,234,567 hoặc 1234567,5
  const cleaned = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '');
  return Number(cleaned);
};

/** Đọc bảng (mảng dòng × cột) → các dòng có mã hiệu, đơn vị và đơn giá hợp lệ */
export const parseEstimateSheetDetailed = (
  rows: unknown[][],
  availableCategories: string[] = [],
): { rows: EstimateRow[]; rejected: { row: number; reason: string }[] } => {
  const available = new Set(availableCategories);
  let header = -1;
  let col = { ma: -1, ten: -1, dv: -1, gia: -1 };
  for (let r = 0; r < Math.min(rows.length, 40) && header < 0; r++) {
    const cells = (rows[r] || []).map(norm);
    const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
    const c = {
      ma: find(HEADER_KEYS.ma),
      ten: find(HEADER_KEYS.ten),
      dv: find(HEADER_KEYS.dv),
      gia: find(HEADER_KEYS.gia),
    };
    if (c.ten >= 0 && c.dv >= 0 && c.gia >= 0) {
      header = r;
      col = c;
    }
  }
  if (header < 0) throw new Error('Không tìm thấy dòng tiêu đề (cần có cột Nội dung công việc, Đơn vị, Đơn giá)');
  const out: EstimateRow[] = [];
  const rejected: { row: number; reason: string }[] = [];
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const ten = String(row[col.ten] ?? '').trim();
    const dvRaw = String(row[col.dv] ?? '').trim();
    const gia = toNumber(row[col.gia]);
    if (row.every((v) => !String(v ?? '').trim())) continue;
    if (!ten || !dvRaw || !Number.isFinite(gia) || gia < 0) {
      rejected.push({ row: r + 1, reason: !ten ? 'Thiếu nội dung' : !dvRaw ? 'Thiếu đơn vị' : 'Đơn giá không hợp lệ' });
      continue;
    }
    const conv = convertUnit(dvRaw);
    const rule = suggestByRules(ten, available);
    out.push({
      index: out.length,
      ma_hieu: col.ma >= 0 ? String(row[col.ma] ?? '').trim() : '',
      ten,
      don_vi_goc: dvRaw,
      don_gia_goc: gia,
      don_vi: conv?.unit ?? null,
      don_gia: conv ? Math.round((gia / conv.factor) * 100) / 100 : gia,
      loai_cau_kien: conv ? rule.loai : null,
      vat_lieu: rule.loai ? materialKeyword(ten) : null,
      nguon_goi_y: 'quy_tac',
      ly_do: conv ? rule.reason : `Đơn vị “${dvRaw}” không bóc tách được từ mô hình`,
    });
  }
  return { rows: out, rejected };
};

export const parseEstimateSheet = (rows: unknown[][], categories: string[] = []) =>
  parseEstimateSheetDetailed(rows, categories).rows;
