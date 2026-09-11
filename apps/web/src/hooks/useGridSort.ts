import { useCallback, useState } from 'react';

/**
 * useGridSort — chuẩn hoá hành vi sắp xếp cột cho toàn bộ bảng dữ liệu.
 *
 * Chu trình bấm tiêu đề cột thống nhất trên mọi bảng:
 *   lần 1 → tăng dần (asc) · lần 2 → giảm dần (desc) · lần 3 → bỏ sắp xếp
 */

export type GridSortDir = 'asc' | 'desc' | null;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

/** So sánh chung: số → ngày ISO → chuỗi tiếng Việt (bỏ dấu, có nhận số trong chuỗi) */
export function compareGridValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // giá trị rỗng luôn xếp cuối
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);

  const as = String(a);
  const bs = String(b);

  const an = Number(as);
  const bn = Number(bs);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;

  if (ISO_DATE_RE.test(as) && ISO_DATE_RE.test(bs)) {
    const ad = Date.parse(as);
    const bd = Date.parse(bs);
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) return ad - bd;
  }

  return as.localeCompare(bs, 'vi', { sensitivity: 'base', numeric: true });
}

interface UseGridSortOptions {
  defaultKey?: string | null;
  defaultDir?: GridSortDir;
}

interface UseGridSortReturn<T> {
  sortKey: string | null;
  sortDir: GridSortDir;
  /** Bấm tiêu đề cột: asc → desc → bỏ sắp xếp */
  toggleSort: (key: string) => void;
  setSort: (key: string | null, dir: GridSortDir) => void;
  /** Sắp xếp mảng dữ liệu (không đổi mảng gốc) */
  sortRows: (rows: T[], getValue?: (row: T, key: string) => unknown) => T[];
}

export function useGridSort<T>({ defaultKey = null, defaultDir = null }: UseGridSortOptions = {}): UseGridSortReturn<T> {
  const [sort, setSortState] = useState<{ key: string | null; dir: GridSortDir }>({
    key: defaultKey,
    dir: defaultDir,
  });
  const { key: sortKey, dir: sortDir } = sort;

  const toggleSort = useCallback((key: string) => {
    setSortState(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key: null, dir: null };
      return { key, dir: 'asc' };
    });
  }, []);

  const setSort = useCallback((key: string | null, dir: GridSortDir) => {
    setSortState({ key, dir });
  }, []);

  const sortRows = useCallback(
    (rows: T[], getValue?: (row: T, key: string) => unknown): T[] => {
      if (!sortKey || !sortDir || !rows || rows.length === 0) return rows;
      const read = getValue ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);
      const factor = sortDir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => factor * compareGridValues(read(a, sortKey), read(b, sortKey)));
    },
    [sortKey, sortDir],
  );

  return { sortKey, sortDir, toggleSort, setSort, sortRows };
}

export default useGridSort;
