import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/lib/smartSets.ts
// Bộ chọn thông minh: nhãn trường, toán tử, nhóm HOẶC của các điều kiện VÀ, gợi ý giá trị theo từ đồng nghĩa,
// gom nhóm tô màu theo giá trị thuộc tính.

import type { BimFieldRef, BimSetCondition, BimSetOperator, BimSmartSet } from '@/features/bim-suite/types/bim.types';
import { ifcLabels } from './ifcLabels';
import { VIETNAMESE_BIM_CATEGORIES, matchBimCategory, normalizeVi } from './vietnameseBimMap';

export const COLUMN_FIELDS: { key: string; label: string; numeric?: boolean }[] = [
  { key: 'loai_cau_kien', label: 'Loại cấu kiện (IFC)' },
  { key: 'phan_doan_tang', label: 'Tầng / phân đoạn' },
  { key: 'vat_lieu', label: 'Vật liệu' },
  { key: 'ten_cau_kien', label: 'Tên cấu kiện' },
  { key: 'global_id', label: 'GUID' },
  { key: 'the_tich_be_tong', label: 'Thể tích (m³)', numeric: true },
  { key: 'dien_tich', label: 'Diện tích (m²)', numeric: true },
  { key: 'chieu_dai', label: 'Chiều dài (m)', numeric: true },
  { key: 'trong_luong', label: 'Trọng lượng (kg)', numeric: true },
  { key: 'dien_tich_van_khuon', label: 'Diện tích ván khuôn (m²)', numeric: true },
];

export const OPERATORS: { key: BimSetOperator; label: string; needsValue: boolean }[] = [
  { key: '=', label: 'bằng', needsValue: true },
  { key: '!=', label: 'khác', needsValue: true },
  { key: 'chua', label: 'chứa', needsValue: true },
  { key: 'khong_chua', label: 'không chứa', needsValue: true },
  { key: '>', label: '>', needsValue: true },
  { key: '>=', label: '≥', needsValue: true },
  { key: '<', label: '<', needsValue: true },
  { key: '<=', label: '≤', needsValue: true },
  { key: 'trong', label: 'thuộc (a|b|c)', needsValue: true },
  { key: 'khop_mau', label: 'khớp mẫu (regex)', needsValue: true },
  { key: 'co', label: 'có giá trị', needsValue: false },
  { key: 'khong_co', label: 'không có giá trị', needsValue: false },
];

const GROUP_LABEL: Record<string, string> = { kieu: 'Kiểu', thong_tin: 'Thông tin', psets: 'Pset' };

export const fieldKey = (f: BimFieldRef) => (Array.isArray(f) ? JSON.stringify(f) : f);

export const parseFieldKey = (key: string): BimFieldRef => (key.startsWith('[') ? (JSON.parse(key) as string[]) : key);

export const fieldLabel = (f: BimFieldRef) => {
  if (!Array.isArray(f)) return COLUMN_FIELDS.find((c) => c.key === f)?.label || f;
  if (f[0] === 'psets') return `${f[1]} › ${f[2]}`;
  if (f[0] === 'kieu' && f[1] === 'ten') return 'Kiểu (Type)';
  if (f[0] === 'kieu' && f[1] === 'loai') return 'Lớp kiểu (IFC Type)';
  return `${GROUP_LABEL[f[0]] || f[0]} › ${f.slice(1).join(' › ')}`;
};

export const isNumericField = (f: BimFieldRef) =>
  !Array.isArray(f) && !!COLUMN_FIELDS.find((c) => c.key === f)?.numeric;

export const conditionText = (c: { truong: BimFieldRef; toan_tu: BimSetOperator; gia_tri?: string }) => {
  const op = OPERATORS.find((o) => o.key === c.toan_tu);
  return `${fieldLabel(c.truong)} ${op?.label || c.toan_tu}${op?.needsValue ? ` “${c.gia_tri ?? ''}”` : ''}`;
};

// ---------------------------------------------------------------------------
// Nhóm HOẶC: bộ chọn = (đk VÀ đk) HOẶC (đk) …; tương thích bộ chọn cũ chỉ có `dieu_kien` (một nhóm VÀ)
// ---------------------------------------------------------------------------

export type ConditionGroups = BimSetCondition[][];

/** Đọc nhóm điều kiện từ bộ chọn đã lưu (dạng cũ → một nhóm) */
export const groupsOfSet = (
  set: Pick<BimSmartSet, 'dieu_kien'> & { nhom_dieu_kien?: ConditionGroups | null },
): ConditionGroups => {
  const nhom = (set.nhom_dieu_kien || []).filter((g) => Array.isArray(g) && g.length > 0);
  if (nhom.length) return nhom.map((g) => [...g]);
  return Array.isArray(set.dieu_kien) && set.dieu_kien.length ? [[...set.dieu_kien]] : [];
};

/** Dữ liệu lưu: `dieu_kien` giữ nhóm đầu (công cụ cũ vẫn đọc được), `nhom_dieu_kien` chỉ khi có ≥ 2 nhóm */
export const storedFromGroups = (
  groups: ConditionGroups,
): { dieu_kien: BimSetCondition[]; nhom_dieu_kien: ConditionGroups | null } => {
  const clean = groups.filter((g) => g.length > 0);
  return { dieu_kien: clean[0] || [], nhom_dieu_kien: clean.length > 1 ? clean : null };
};

const needsValue = (op: BimSetOperator) => OPERATORS.find((o) => o.key === op)?.needsValue ?? true;

/** Bỏ điều kiện chưa nhập giá trị và nhóm rỗng */
export const validGroups = (groups: ConditionGroups): ConditionGroups =>
  groups
    .map((g) => g.filter((c) => !needsValue(c.toan_tu) || (c.gia_tri ?? '').trim() !== ''))
    .filter((g) => g.length > 0);

/** Tham số RPC bim_loc_cau_kien: một nhóm → mảng điều kiện (dạng cũ), nhiều nhóm → mảng các nhóm */
export const rpcConditions = (groups: ConditionGroups): BimSetCondition[] | ConditionGroups =>
  groups.length === 1 ? groups[0] : groups;

export const groupsText = (groups: ConditionGroups): string =>
  groups
    .map((g) => {
      const text = g.map(conditionText).join(' và ');
      return groups.length > 1 && g.length > 1 ? `(${text})` : text;
    })
    .join(' hoặc ');

/** Giá trị một trường của cấu kiện (cột hoặc đường dẫn trong thuoc_tinh) — dạng chữ như trong SQL */
export const fieldValue = (el: Record<string, any>, field: BimFieldRef): string | null => {
  let v: unknown;
  if (Array.isArray(field)) {
    v = field.reduce<any>((o, k) => (o && typeof o === 'object' ? o[k] : undefined), el.thuoc_tinh);
  } else v = el[field];
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const toNum = (v: string | null | undefined) =>
  v != null && /^\s*-?[0-9]+([.,][0-9]+)?([eE][-+]?[0-9]+)?\s*$/.test(v) ? Number(v.trim().replace(',', '.')) : null;

/** Đánh giá một điều kiện phía trình duyệt, cùng ngữ nghĩa với bim_bieu_thuc_dieu_kien trên máy chủ */
export const evaluateCondition = (el: Record<string, any>, c: BimSetCondition): boolean => {
  const v = fieldValue(el, c.truong);
  const val = c.gia_tri ?? '';
  const low = (s: string | null) => (s ?? '').toLowerCase();
  switch (c.toan_tu) {
    case 'co':
      return (v ?? '') !== '';
    case 'khong_co':
      return (v ?? '') === '';
    case '=':
      return v !== null && low(v) === low(val);
    case '!=':
      return low(v) !== low(val);
    case 'chua':
      return v !== null && low(v).includes(low(val));
    case 'khong_chua':
      return !low(v).includes(low(val));
    case 'trong': {
      const list = val
        .split('|')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      return v !== null && list.includes(low(v));
    }
    case 'khop_mau':
      try {
        return new RegExp(val, 'i').test(v ?? '');
      } catch {
        return false;
      }
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const a = toNum(v);
      const b = toNum(val);
      if (a === null || b === null) return false;
      return c.toan_tu === '>' ? a > b : c.toan_tu === '>=' ? a >= b : c.toan_tu === '<' ? a < b : a <= b;
    }
    default:
      return false;
  }
};

/** Cấu kiện thỏa bộ chọn: thỏa MỌI điều kiện của ÍT NHẤT một nhóm */
export const matchesGroups = (el: Record<string, any>, groups: ConditionGroups): boolean =>
  groups.some((g) => g.length > 0 && g.every((c) => evaluateCondition(el, c)));

export interface ValueSuggestion {
  value: string;
  label: string;
  count?: number;
  /** Toán tử nên dùng (VD "trong" khi một từ ứng với nhiều lớp IFC) */
  operator?: BimSetOperator;
}

/**
 * Gợi ý giá trị khi nhập điều kiện. Với "Loại cấu kiện": gõ "cột", "cot", "ống gió"… gợi ý lớp IFC tương ứng
 * (và cả nhóm lớp dùng toán tử "thuộc"). Trường khác: lọc giá trị phổ biến không phân biệt dấu.
 */
export function suggestValues(
  field: BimFieldRef,
  input: string,
  popular: { gia_tri: string; so_luong: number }[] = [],
): ValueSuggestion[] {
  const q = normalizeVi(input);
  const fromPopular = popular
    .filter(
      (p) =>
        !q ||
        normalizeVi(p.gia_tri).includes(q) ||
        (field === 'loai_cau_kien' && normalizeVi(ifcLabels[p.gia_tri.toUpperCase()] || '').includes(q)),
    )
    .map((p) => ({
      value: p.gia_tri,
      label:
        field === 'loai_cau_kien' && ifcLabels[p.gia_tri.toUpperCase()]
          ? `${ifcLabels[p.gia_tri.toUpperCase()]} (${p.gia_tri})`
          : p.gia_tri,
      count: p.so_luong,
    }));
  if (field !== 'loai_cau_kien' || !q) return fromPopular.slice(0, 40);

  const out: ValueSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: ValueSuggestion) => {
    const key = `${s.operator || '='}:${s.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  const match = matchBimCategory(input);
  const categories = match
    ? [match.mapping]
    : Object.values(VIETNAMESE_BIM_CATEGORIES).filter((c) => normalizeVi(c.canonicalVi).includes(q));
  const present = new Map(popular.map((p) => [p.gia_tri.toUpperCase(), p.so_luong]));
  for (const cat of categories) {
    const classes = cat.ifcClasses.filter((c) => !/TYPE$/.test(c));
    if (classes.length > 1) {
      const count = classes.reduce((s, c) => s + (present.get(c) || 0), 0);
      push({
        value: classes.join('|'),
        label: `${cat.canonicalVi} — mọi lớp`,
        count: count || undefined,
        operator: 'trong',
      });
    }
    for (const cls of classes)
      push({ value: cls, label: `${ifcLabels[cls] || cat.canonicalVi} (${cls})`, count: present.get(cls) });
  }
  fromPopular.forEach(push);
  return out.slice(0, 40);
}

// Bảng màu phân biệt tốt cho tối đa 14 nhóm
export const VALUE_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#b45309',
  '#9333ea',
  '#475569',
];
// Dải màu cho giá trị số: xanh → đỏ
export const NUMERIC_RAMP = ['#1d4ed8', '#0891b2', '#16a34a', '#eab308', '#f97316', '#dc2626'];

const toNumber = (v: string | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export interface ValueBucket {
  label: string;
  color: string;
  count: number;
  byModel: Map<string, number[]>;
}

const fmt = (n: number) => formatNumber(n, n);

/**
 * Gom cấu kiện theo giá trị để tô màu.
 * - Trường số (≥ 80% giá trị là số): chia 6 khoảng đều từ min tới max.
 * - Trường chữ: 13 giá trị nhiều nhất mỗi giá trị một màu, còn lại gộp “Giá trị khác”.
 * Cấu kiện không có giá trị không được tô (giữ màu gốc) nhưng được đếm trong `missing`.
 */
export const bucketValues = (rows: { model_id: string; express_id: number; gia_tri: string | null }[]) => {
  const present = rows.filter((r) => r.gia_tri !== null && r.gia_tri !== '');
  const missing = rows.length - present.length;
  const numbers = present.map((r) => toNumber(r.gia_tri));
  const numericCount = numbers.filter((n) => n !== null).length;
  const buckets: ValueBucket[] = [];
  const push = (b: ValueBucket, r: { model_id: string; express_id: number }) => {
    b.count++;
    const list = b.byModel.get(r.model_id);
    if (list) list.push(r.express_id);
    else b.byModel.set(r.model_id, [r.express_id]);
  };

  if (present.length > 0 && numericCount / present.length >= 0.8) {
    const values = numbers.filter((n): n is number => n !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const steps = min === max ? 1 : NUMERIC_RAMP.length;
    const width = (max - min) / steps || 1;
    for (let i = 0; i < steps; i++) {
      const lo = min + width * i;
      const hi = i === steps - 1 ? max : min + width * (i + 1);
      buckets.push({
        label: steps === 1 ? fmt(min) : `${fmt(lo)} – ${fmt(hi)}`,
        color: NUMERIC_RAMP[steps === 1 ? 2 : i],
        count: 0,
        byModel: new Map(),
      });
    }
    present.forEach((r, i) => {
      const n = numbers[i];
      if (n === null) return;
      const idx = Math.min(steps - 1, Math.floor((n - min) / width));
      push(buckets[idx], r);
    });
    return { numeric: true, buckets: buckets.filter((b) => b.count > 0), missing };
  }

  const counts = new Map<string, number>();
  present.forEach((r) => counts.set(r.gia_tri!, (counts.get(r.gia_tri!) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, VALUE_PALETTE.length - 1);
  const index = new Map<string, number>();
  top.forEach(([v], i) => {
    index.set(v, i);
    buckets.push({ label: v, color: VALUE_PALETTE[i], count: 0, byModel: new Map() });
  });
  const other: ValueBucket = {
    label: `Giá trị khác (${ranked.length - top.length})`,
    color: VALUE_PALETTE[VALUE_PALETTE.length - 1],
    count: 0,
    byModel: new Map(),
  };
  present.forEach((r) => {
    const i = index.get(r.gia_tri!);
    push(i === undefined ? other : buckets[i], r);
  });
  if (other.count) buckets.push(other);
  return { numeric: false, buckets, missing };
};
