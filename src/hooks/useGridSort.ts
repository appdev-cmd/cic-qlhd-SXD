import { useMemo } from 'react';
import { useFilterState } from './useFilterState';
import {
  fromStoredSort,
  sortRows,
  toStoredSort,
  type SortState,
  type SortValue,
  type StoredSort,
} from '../lib/dataTable';

/** Legacy index-based client sort (persisted as `{ column, descending }`). */
export function useGridSort<T>(key: string, rows: T[], columns: { value: (r: T) => SortValue }[]) {
  const [sort, setSort] = useFilterState(key, { column: 0, descending: false });
  const sorted = useMemo(
    () => sortRows(rows, columns[sort.column]?.value, sort.descending ? 'desc' : 'asc'),
    [rows, columns, sort],
  );
  return {
    sorted,
    sort,
    toggle: (column: number) => setSort({ column, descending: sort.column === column ? !sort.descending : false }),
  };
}

/**
 * Id-based sort state persisted in the same `{ column, descending }` shape, so grids that switch from
 * index columns to ids "0", "1"… keep the user's stored choice. `null` means unsorted.
 */
export function useSortState(key: string, initial: SortState | null = null) {
  const [stored, setStored] = useFilterState<StoredSort | null>(key, initial ? toStoredSort(initial) : null);
  const sort = fromStoredSort(stored);
  const setSort = (next: SortState | null) => setStored(next ? toStoredSort(next) : null);
  return [sort, setSort] as const;
}
