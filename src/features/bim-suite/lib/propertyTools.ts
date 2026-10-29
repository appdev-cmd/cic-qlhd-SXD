import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/lib/propertyTools.ts
// Công cụ cho bảng thuộc tính: tìm trong thuộc tính (không phân biệt dấu), so sánh hai cấu kiện cạnh nhau,
// dựng tiêu chí "chọn tương tự" (cùng loại / vật liệu / tầng / kiểu) dưới dạng điều kiện bộ chọn.

import type { BimElement, BimSetCondition } from '@/features/bim-suite/types/bim.types';
import { getIfcLabel } from './ifcLabels';
import { normalizeVi } from './vietnameseBimMap';

export const formatPropertyValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return formatNumber(v, 4);
  if (Array.isArray(v)) return v.map(formatPropertyValue).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('min' in o || 'max' in o) return `${formatPropertyValue(o.min)} – ${formatPropertyValue(o.max)}`;
    return JSON.stringify(v);
  }
  return String(v);
};

/** Từ khóa tìm trong thuộc tính: mọi từ (bỏ dấu) phải có trong tên hoặc giá trị */
export const propertyMatcher = (query: string) => {
  const tokens = normalizeVi(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return (key: string, value: unknown) => {
    const hay = normalizeVi(`${key} ${formatPropertyValue(value)}`);
    return tokens.every((t) => hay.includes(t));
  };
};

export type PropertyMatcher = NonNullable<ReturnType<typeof propertyMatcher>>;

/** Lọc một bộ thuộc tính; nếu tên bộ khớp thì giữ cả bộ */
export const filterPropertyGroup = (
  groupName: string,
  values: Record<string, unknown>,
  match: PropertyMatcher | null,
): Record<string, unknown> => {
  if (!match) return values;
  if (match(groupName, '')) return values;
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => match(k, v)));
};

export interface CompareRow {
  group: string;
  key: string;
  a: string;
  b: string;
  same: boolean;
}

const flatten = (el: BimElement): Map<string, { group: string; key: string; value: unknown }> => {
  const out = new Map<string, { group: string; key: string; value: unknown }>();
  const put = (group: string, key: string, value: unknown) => out.set(`${group}\u0000${key}`, { group, key, value });
  put('Chung', 'Tên', el.ten_cau_kien);
  put('Chung', 'Loại', el.loai_cau_kien ? `${getIfcLabel(el.loai_cau_kien)} (${el.loai_cau_kien})` : null);
  put('Chung', 'Tầng / phân đoạn', el.phan_doan_tang);
  put('Chung', 'Vật liệu', el.vat_lieu);
  put('Khối lượng', 'Thể tích (m³)', el.the_tich_be_tong);
  put('Khối lượng', 'Diện tích (m²)', el.dien_tich);
  put('Khối lượng', 'Chiều dài (m)', el.chieu_dai);
  put('Khối lượng', 'Trọng lượng (kg)', el.trong_luong);
  put('Khối lượng', 'Diện tích ván khuôn (m²)', el.dien_tich_van_khuon);
  const props = (el.thuoc_tinh || {}) as Record<string, any>;
  if (props.kieu?.ten) put('Kiểu', 'Kiểu (Type)', props.kieu.ten);
  for (const [k, v] of Object.entries(props.thong_tin || {})) put('Thông tin', k, v);
  for (const [pset, values] of Object.entries(props.psets || {})) {
    if (values && typeof values === 'object')
      for (const [k, v] of Object.entries(values as Record<string, unknown>)) put(pset, k, v);
  }
  for (const [qto, values] of Object.entries(props.qto || {})) {
    if (values && typeof values === 'object')
      for (const [k, v] of Object.entries(values as Record<string, unknown>)) put(qto, k, v);
  }
  return out;
};

/** Bảng so sánh hai cấu kiện: mọi thuộc tính có ở ít nhất một bên, đánh dấu giống/khác */
export function compareElements(a: BimElement, b: BimElement): CompareRow[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const keys = [...new Set([...fa.keys(), ...fb.keys()])];
  const rows: CompareRow[] = [];
  for (const k of keys) {
    const x = fa.get(k);
    const y = fb.get(k);
    const va = formatPropertyValue(x?.value);
    const vb = formatPropertyValue(y?.value);
    if (va === '-' && vb === '-') continue;
    rows.push({ group: (x || y)!.group, key: (x || y)!.key, a: va, b: vb, same: va === vb });
  }
  return rows;
}

export type SimilarField = 'loai_cau_kien' | 'vat_lieu' | 'phan_doan_tang' | 'kieu';

export const SIMILAR_FIELD_LABEL: Record<SimilarField, string> = {
  loai_cau_kien: 'Cùng loại',
  vat_lieu: 'Cùng vật liệu',
  phan_doan_tang: 'Cùng tầng',
  kieu: 'Cùng kiểu (Type)',
};

export interface SelectSimilarCriteria {
  /** Mô hình của cấu kiện gốc (bên nhận có thể mở rộng ra mọi mô hình đang hiển thị) */
  modelId?: string;
  /** Cấu kiện gốc */
  sourceGuid: string;
  fields: SimilarField[];
  values: { loai_cau_kien: string; vat_lieu: string | null; phan_doan_tang: string | null; kieu: string | null };
  /** Điều kiện bộ chọn tương đương — truyền thẳng cho bim_loc_cau_kien (BimService.filterElements) */
  conditions: BimSetCondition[];
  /** Mô tả tiếng Việt, VD "Cùng loại Cột / Trụ · cùng tầng Tháp B · T04" */
  label: string;
}

/** Tiêu chí "chọn tương tự" từ một cấu kiện và các trường được tích */
export function buildSelectSimilar(el: BimElement, fields: SimilarField[], modelId?: string): SelectSimilarCriteria {
  const kieu = (el.thuoc_tinh as any)?.kieu?.ten ?? null;
  const values = {
    loai_cau_kien: el.loai_cau_kien,
    vat_lieu: el.vat_lieu ?? null,
    phan_doan_tang: el.phan_doan_tang ?? null,
    kieu: kieu ? String(kieu) : null,
  };
  const chosen = [...new Set<SimilarField>(['loai_cau_kien', ...fields])];
  const conditions: BimSetCondition[] = [];
  const labels: string[] = [];
  for (const f of chosen) {
    const v = values[f];
    const truong = f === 'kieu' ? ['kieu', 'ten'] : f;
    conditions.push(v ? { truong, toan_tu: '=', gia_tri: v } : { truong, toan_tu: 'khong_co' });
    const shown = f === 'loai_cau_kien' ? getIfcLabel(v || '') : v || 'chưa có';
    labels.push(`${SIMILAR_FIELD_LABEL[f].toLowerCase()} ${shown}`);
  }
  const label = labels.join(' · ');
  return {
    modelId,
    sourceGuid: el.global_id,
    fields: chosen,
    values,
    conditions,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}
