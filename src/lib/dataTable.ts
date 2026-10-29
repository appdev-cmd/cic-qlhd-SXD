// Pure, DOM-free helpers shared by DataTable and its hooks (unit-tested in dataTable.test.ts).

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}
/** Shape persisted by useGridSort since the first grid; kept so stored preferences survive upgrades. */
export interface StoredSort {
  column: string | number;
  descending: boolean;
}
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type SortValue = string | number | boolean | Date | null | undefined;

/** Tailwind default breakpoints (min-width, px). */
export const BREAKPOINTS: Record<Breakpoint, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

/** Keyboard resize step in px; Shift multiplies it. */
export const RESIZE_STEP = 16;
export const RESIZE_STEP_LARGE = 64;

const normalize = (value: SortValue): string | number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  return value;
};

/** Compare two cell values: numbers numerically, text with Vietnamese collation; empty values sort last. */
export function compareValues(a: SortValue, b: SortValue): number {
  const x = normalize(a),
    y = normalize(b);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x).localeCompare(String(y), 'vi', { numeric: true, sensitivity: 'base' });
}

/** Stable sort that keeps empty values at the end in both directions. */
export function sortRows<T>(
  rows: readonly T[],
  getValue: ((row: T) => SortValue) | undefined,
  direction: SortDirection,
) {
  if (!getValue) return [...rows];
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      const emptyA = normalize(a.value) === null,
        emptyB = normalize(b.value) === null;
      if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
      const result = compareValues(a.value, b.value);
      return (direction === 'desc' ? -result : result) || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Header click: a new column starts ascending, the active column flips direction. */
export function nextSort(current: SortState | null | undefined, columnId: string): SortState {
  return current?.columnId === columnId
    ? { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { columnId, direction: 'asc' };
}

export function ariaSortFor(current: SortState | null | undefined, columnId: string) {
  if (current?.columnId !== columnId) return 'none' as const;
  return current.direction === 'desc' ? ('descending' as const) : ('ascending' as const);
}

export const fromStoredSort = (stored: StoredSort | null | undefined): SortState | null =>
  stored && stored.column !== undefined && stored.column !== null && stored.column !== ''
    ? { columnId: String(stored.column), direction: stored.descending ? 'desc' : 'asc' }
    : null;

export const toStoredSort = (sort: SortState): StoredSort => ({
  column: /^\d+$/.test(sort.columnId) ? Number(sort.columnId) : sort.columnId,
  descending: sort.direction === 'desc',
});

/** Convert a declared width (px number, "120px", "12%", "8rem") to a starting pixel width. */
export function resolveWidth(width: number | string | undefined, fallback = 180): number {
  if (typeof width === 'number' && Number.isFinite(width)) return width;
  if (typeof width !== 'string') return fallback;
  const value = parseFloat(width);
  if (!Number.isFinite(value)) return fallback;
  if (width.endsWith('%')) return Math.max(120, value * 10);
  if (width.endsWith('rem') || width.endsWith('em')) return value * 16;
  return value;
}

export const clampWidth = (width: number, min = 60, max = 1200) => Math.round(Math.min(max, Math.max(min, width)));

/** Arrow-key resize delta for a focused column separator; null for keys the separator ignores. */
export function keyboardResizeDelta(key: string, shiftKey = false): number | null {
  const step = shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
  if (key === 'ArrowRight' || key === 'ArrowUp') return step;
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -step;
  return null;
}

/**
 * Fit-width mode: move `delta` px from column `index + 1` to column `index` (or back) so the total width
 * stays constant; each column keeps at least `minimum` px (capped to a third of the pair).
 */
export function redistributeWidths(current: readonly number[], index: number, delta: number, minimum = 80) {
  if (index < 0 || index >= current.length - 1) return [...current];
  const floor = Math.min(minimum, (current[index] + current[index + 1]) / 3);
  const applied = Math.max(floor - current[index], Math.min(current[index + 1] - floor, delta));
  return current.map((value, i) => value + (i === index ? applied : i === index + 1 ? -applied : 0));
}

/** True when a column with `hideBelow` should be hidden at the given viewport width. */
export const hiddenAtViewport = (hideBelow: Breakpoint | undefined, viewportWidth: number) =>
  Boolean(hideBelow) && viewportWidth < BREAKPOINTS[hideBelow as Breakpoint];

/** Toggle a column in the hidden list while always keeping at least one hideable column visible. */
export function toggleHidden(hidden: readonly string[], id: string, hideableIds: readonly string[]) {
  if (hidden.includes(id)) return hidden.filter((value) => value !== id);
  const next = [...hidden, id];
  return hideableIds.length && hideableIds.every((value) => next.includes(value)) ? [...hidden] : next;
}

/** 1-based row number that continues across pages (`offset` = rows before the current page). */
export const rowNumber = (offset: number | undefined, index: number) =>
  (Number.isFinite(offset) && (offset as number) > 0 ? (offset as number) : 0) + index + 1;

/** Deterministic skeleton bar widths so loading rows do not jitter between renders. */
export const skeletonWidth = (row: number, column: number) => 40 + ((row * 7 + column * 13) % 50);
