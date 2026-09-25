import type { PostgrestError } from '@supabase/supabase-js';
import { buildSearchFilters, matchesSmartSearch } from '../lib/smartSearch';

/** Kích thước trang tối đa của Supabase PostgREST. */
export const SUPABASE_PAGE_SIZE = 1000;

export class DataAccessError extends Error {
  constructor(message: string, readonly cause?: PostgrestError | Error) {
    super(message);
    this.name = 'DataAccessError';
  }
}

export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, context: string): T {
  if (result.error) {
    throw new DataAccessError(`${context}: ${result.error.message}`, result.error);
  }
  return result.data as T;
}

/**
 * Tải trọn bộ dữ liệu theo từng khối 1000 dòng (`.range()`), chỉ dùng khi thực sự cần full dataset
 * (bản đồ GIS, xuất Excel). Truyền factory để mỗi khối tạo query mới.
 */
export async function fetchAllChunked<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  context: string
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const page = unwrap(await queryPage(from, from + SUPABASE_PAGE_SIZE - 1), context) ?? [];
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return all;
}

/** Áp dụng tìm kiếm không dấu + viết tắt lên cột search_text (mỗi từ một điều kiện `.or()`, các từ AND với nhau). */
export function applySearch<Q>(query: Q, search: string | undefined, column = 'search_text'): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder PostgREST có generic lồng rất sâu
  let q = query as any;
  for (const expr of buildSearchFilters(search ?? '', column)) q = q.or(expr);
  return q as Q;
}

/** Lọc tìm kiếm cho chế độ demo (dữ liệu offline trong bộ nhớ). */
export function demoSearch<T>(items: T[], query: string | undefined, fields: (item: T) => (string | undefined)[]): T[] {
  if (!query?.trim()) return items;
  return items.filter((item) => matchesSmartSearch(fields(item).filter(Boolean).join(' '), query));
}

export interface Paged<T> {
  rows: T[];
  total: number;
}

export type SortDirection = 'asc' | 'desc';

export interface SortSpec<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
}
