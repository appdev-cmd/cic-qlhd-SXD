// features/bim/lib/bimSearch.ts
// Tìm cấu kiện bằng tiếng Việt tự nhiên: hiểu từ đồng nghĩa ("cột", "cot", "trụ" → IFCCOLUMN),
// gõ không dấu, nhiều từ khóa (mọi từ đều phải khớp), và dựng bộ lọc PostgREST + phân trang keyset
// cho bảng bim_elements (thứ tự ten_cau_kien, id).

import { quotePostgrestValue, escapeLikePattern } from '@/features/bim/adapters/utils';
import { ifcLabels } from './ifcLabels';
import { matchBimCategory, normalizeVi } from './vietnameseBimMap';

export interface ResolvedSearch {
  /** Chuỗi người dùng gõ (đã bỏ khoảng trắng thừa) */
  raw: string;
  /** Các từ giữ nguyên dấu — dùng cho ILIKE trong CSDL */
  tokens: string[];
  /** Các từ đã bỏ dấu, chữ thường — dùng so khớp phía trình duyệt */
  normTokens: string[];
  /** Lớp IFC suy ra từ từ đồng nghĩa hoặc nhãn tiếng Việt (viết hoa) */
  classes: string[];
  /** Từ còn lại sau khi tách cụm chỉ loại cấu kiện (VD "cột C1" → ["C1"]) */
  residual: string[];
  residualNorm: string[];
  /** Tên nhóm tiếng Việt chuẩn nếu nhận ra loại cấu kiện */
  canonicalVi: string | null;
}

const FILLERS = new Set(['cac', 'nhung', 'moi', 'tat', 'ca', 'toan', 'bo']);

/** Lớp IFC có nhãn tiếng Việt chứa đủ các từ đã gõ (VD "ong gio" → IFCDUCTSEGMENT) */
const classesByLabel = (normTokens: string[]): string[] => {
  if (!normTokens.length) return [];
  const out: string[] = [];
  for (const [cls, label] of Object.entries(ifcLabels)) {
    const hay = normalizeVi(label);
    const words = new Set(hay.split(/[^a-z0-9]+/).filter(Boolean));
    if (normTokens.every((t) => words.has(t))) out.push(cls);
  }
  return out;
};

export function resolveSearch(input: string | null | undefined): ResolvedSearch {
  const raw = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = raw ? raw.split(' ') : [];
  const normTokens = tokens.map((t) => normalizeVi(t)).filter(Boolean);
  const empty: ResolvedSearch = {
    raw,
    tokens,
    normTokens,
    classes: [],
    residual: [],
    residualNorm: [],
    canonicalVi: null,
  };
  if (!raw) return empty;

  // Gõ thẳng lớp IFC: "IfcColumn", "ifcwall"
  const ifcTokens = tokens.filter((t) => /^ifc[a-z0-9]+$/i.test(t)).map((t) => t.toUpperCase());

  const match = matchBimCategory(raw);
  let classes: string[] = [...ifcTokens];
  let residual: string[] = tokens.filter((t) => !/^ifc[a-z0-9]+$/i.test(t));
  let canonicalVi: string | null = null;

  if (match) {
    classes.push(...match.mapping.ifcClasses);
    canonicalVi = match.mapping.canonicalVi;
    const phraseWords = match.phrase.split(' ');
    const norms = residual.map((t) => normalizeVi(t));
    for (let i = 0; i + phraseWords.length <= norms.length; i++) {
      if (phraseWords.every((w, k) => norms[i + k] === w)) {
        residual = [...residual.slice(0, i), ...residual.slice(i + phraseWords.length)];
        break;
      }
    }
  } else {
    // Nhãn tiếng Việt trong bảng dịch IFC (VD "lan can", "ống gió", "tà vẹt")
    const byLabel = classesByLabel(normTokens);
    if (byLabel.length && byLabel.length <= 12) {
      classes.push(...byLabel);
      residual = [];
    }
  }
  residual = residual.filter((t) => !FILLERS.has(normalizeVi(t)));
  classes = [...new Set(classes)];
  return {
    raw,
    tokens,
    normTokens,
    classes,
    residual,
    residualNorm: residual.map((t) => normalizeVi(t)).filter(Boolean),
    canonicalVi,
  };
}

export interface SearchableElement {
  name?: string | null;
  guid?: string | null;
  material?: string | null;
  category?: string | null;
}

/** So khớp phía trình duyệt: cùng quy tắc với bộ lọc CSDL nhưng không phân biệt dấu */
export function matchesSearch(r: ResolvedSearch, el: SearchableElement): boolean {
  if (!r.raw) return true;
  const cat = String(el.category || '').toUpperCase();
  const hay = normalizeVi(
    [el.name, el.guid, el.material, el.category, cat ? ifcLabels[cat] : ''].filter(Boolean).join(' '),
  );
  if (r.classes.length && cat && r.classes.includes(cat)) {
    if (r.residualNorm.length === 0 || r.residualNorm.every((t) => hay.includes(t))) return true;
  }
  return r.normTokens.length > 0 && r.normTokens.every((t) => hay.includes(t));
}

// ---------------------------------------------------------------------------
// Bộ lọc PostgREST dạng cây (và/hoặc) để ghép tìm kiếm với điều kiện keyset trong một tham số or=
// ---------------------------------------------------------------------------

export type FilterNode = string | { op: 'and' | 'or'; items: FilterNode[] };

export const and = (items: FilterNode[]): FilterNode => (items.length === 1 ? items[0] : { op: 'and', items });
export const or = (items: FilterNode[]): FilterNode => (items.length === 1 ? items[0] : { op: 'or', items });

export const serializeFilter = (node: FilterNode): string =>
  typeof node === 'string' ? node : `${node.op}(${node.items.map(serializeFilter).join(',')})`;

/** Chuỗi truyền cho `query.or(...)` (supabase-js tự bọc thành `or=(...)`) */
export const toOrParam = (node: FilterNode): string =>
  typeof node !== 'string' && node.op === 'or' ? node.items.map(serializeFilter).join(',') : serializeFilter(node);

export const SEARCH_COLUMNS = ['ten_cau_kien', 'global_id', 'vat_lieu', 'loai_cau_kien'] as const;

const ilike = (col: string, token: string) => `${col}.ilike.${quotePostgrestValue(`%${escapeLikePattern(token)}%`)}`;

const tokensMatch = (tokens: string[]): FilterNode =>
  and(tokens.map((t) => or(SEARCH_COLUMNS.map((c) => ilike(c, t)))));

/** Điều kiện tìm kiếm trong CSDL: (mọi từ khớp tên/GUID/vật liệu/loại) HOẶC (đúng lớp IFC và khớp phần còn lại) */
export function buildSearchFilter(r: ResolvedSearch): FilterNode | null {
  const branches: FilterNode[] = [];
  if (r.tokens.length) branches.push(tokensMatch(r.tokens));
  if (r.classes.length) {
    const inClasses = `loai_cau_kien.in.(${r.classes.map((c) => quotePostgrestValue(c)).join(',')})`;
    branches.push(r.residual.length ? and([inClasses, tokensMatch(r.residual)]) : inClasses);
  }
  return branches.length ? or(branches) : null;
}

export interface ElementCursor {
  /** ten_cau_kien của dòng cuối trang trước (null = nhóm chưa đặt tên, xếp cuối) */
  ten: string | null;
  id: string;
}

/** Trang sau theo thứ tự (ten_cau_kien ASC NULLS LAST, id ASC) */
export function buildKeysetFilter(cursor: ElementCursor): FilterNode {
  const id = `id.gt.${quotePostgrestValue(cursor.id)}`;
  if (cursor.ten === null) return and(['ten_cau_kien.is.null', id]);
  const ten = quotePostgrestValue(cursor.ten);
  return or([`ten_cau_kien.gt.${ten}`, and([`ten_cau_kien.eq.${ten}`, id]), 'ten_cau_kien.is.null']);
}

/** Ghép tìm kiếm + keyset thành một tham số or= duy nhất (hoặc null nếu không cần) */
export function buildElementPageFilter(search: string | null | undefined, cursor: ElementCursor | null): string | null {
  const parts: FilterNode[] = [];
  const s = buildSearchFilter(resolveSearch(search));
  if (s) parts.push(s);
  if (cursor) parts.push(buildKeysetFilter(cursor));
  if (!parts.length) return null;
  return toOrParam(and(parts));
}

/** So sánh cùng thứ tự với truy vấn keyset (dùng cho dữ liệu cục bộ) */
export const compareElementOrder = (
  a: { ten_cau_kien?: string | null; id: string },
  b: { ten_cau_kien?: string | null; id: string },
): number => {
  const ta = a.ten_cau_kien ?? null;
  const tb = b.ten_cau_kien ?? null;
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta < tb ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Cắt một trang từ danh sách đã sắp xếp theo `compareElementOrder`, bắt đầu sau con trỏ */
export function slicePageAfter<T extends { ten_cau_kien?: string | null; id: string }>(
  sorted: T[],
  cursor: ElementCursor | null,
  pageSize: number,
): { items: T[]; hasMore: boolean; nextCursor: ElementCursor | null } {
  let start = 0;
  if (cursor) {
    const ref = { ten_cau_kien: cursor.ten, id: cursor.id };
    start = sorted.findIndex((row) => compareElementOrder(row, ref) > 0);
    if (start < 0) start = sorted.length;
  }
  const items = sorted.slice(start, start + pageSize);
  const hasMore = start + pageSize < sorted.length;
  const last = items[items.length - 1];
  return { items, hasMore, nextCursor: hasMore && last ? { ten: last.ten_cau_kien ?? null, id: last.id } : null };
}
