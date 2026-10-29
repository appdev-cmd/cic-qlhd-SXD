import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Info, RotateCcw, Rows3, Rows4 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from './Tooltip';
import { useColumnResize } from '../../hooks/useColumnResize';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { useFilterState } from '../../hooks/useFilterState';
import { useSortState } from '../../hooks/useGridSort';
import {
  ariaSortFor,
  hiddenAtViewport,
  keyboardResizeDelta,
  nextSort,
  resolveWidth,
  rowNumber,
  skeletonWidth,
  sortRows,
  type Breakpoint,
  type SortState,
  type SortValue,
} from '../../lib/dataTable';

export type { Breakpoint, SortState, SortDirection } from '../../lib/dataTable';
export type Density = 'comfortable' | 'compact';
export type ColumnAlign = 'left' | 'center' | 'right';

export interface DataTableColumn<T> {
  /** Stable id: key for persisted width, visibility and sort. */
  id: string;
  header: React.ReactNode;
  /** Plain-text label for the column chooser and ARIA when `header` is not a string. */
  headerText?: string;
  cell: (row: T, index: number) => React.ReactNode;
  /** Client-side sort value. Also makes the column sortable unless `sortable` says otherwise. */
  sortValue?: (row: T) => SortValue;
  /** Defaults to `Boolean(sortValue)`; set `true` for server-sorted columns without `sortValue`. */
  sortable?: boolean;
  /** Starting width: px number, "120px", "12%" (×10 px, min 120) or "8rem". Default 160px. */
  width?: number | string;
  /** Minimum width in px while resizing (default 80). */
  minWidth?: number;
  align?: ColumnAlign;
  /** Hide the column below this Tailwind breakpoint (secondary columns on small screens). */
  hideBelow?: Breakpoint;
  /** Help text shown in a Tooltip next to the header. */
  tooltip?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** Allow hiding through the column chooser (default true). */
  hideable?: boolean;
  /** Hidden until the user enables it in the column chooser. */
  defaultHidden?: boolean;
  /** Allow resizing (default true). */
  resizable?: boolean;
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  /** Prefix for persisted widths (`-widths`), sort (`-sort`), visible columns (`-columns`) and density. */
  storageKey: string;
  /** Row key; defaults to `row.id`, then the row index. */
  getRowId?: (row: T, index: number) => string | number;
  /** Controlled (server) sort. Pass `null` for "unsorted"; leave undefined for client sorting. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Initial client sort when nothing is stored yet. */
  defaultSort?: SortState | null;
  /** Row activation by click, Enter or Space. Clicks on buttons/links inside the row are ignored. */
  onRowClick?: (row: T, index: number) => void;
  /** Accessible name for an activatable row (e.g. the dossier name). */
  rowLabel?: (row: T) => string;
  rowClassName?: (row: T, index: number) => string | undefined;
  isRowActive?: (row: T) => boolean;
  showRowNumbers?: boolean;
  /** Rows before the current page, so numbering continues across pages. */
  rowOffset?: number;
  rowNumberHeader?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  /** Rendered in place of rows when there is nothing to show. */
  empty?: React.ReactNode;
  emptyMessage?: string;
  /** Controlled density; otherwise persisted per storageKey (default comfortable). */
  density?: Density;
  onDensityChange?: (density: Density) => void;
  showDensityToggle?: boolean;
  /** Show the "Cột" popover to hide/show columns (persisted per storageKey). */
  columnChooser?: boolean;
  /** Left side of the table toolbar (shown when a toolbar slot, chooser or density toggle is present). */
  toolbar?: React.ReactNode;
  stickyHeader?: boolean;
  maxHeight?: string;
  /** Keep the table at 100% width; resizing trades width with the next column. */
  fitWidth?: boolean;
  striped?: boolean;
  /** Wrap long cell text (default true); false truncates with ellipsis. */
  wrap?: boolean;
  cellClassName?: string;
  className?: string;
  /** Screen-reader caption. */
  caption?: string;
}

const ROW_NUMBER_WIDTH = 56;
const ALIGN_TEXT: Record<ColumnAlign, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
const ALIGN_FLEX: Record<ColumnAlign, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};
const INTERACTIVE =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="checkbox"],[role="menuitem"],[contenteditable="true"],[data-row-click-ignore]';

const labelOf = <T,>(column: DataTableColumn<T>) =>
  column.headerText ?? (typeof column.header === 'string' ? column.header : column.id);
const defaultRowId = (row: unknown, index: number) => {
  const id = (row as { id?: unknown } | null)?.id;
  return typeof id === 'string' || typeof id === 'number' ? id : index;
};
/** True when the event started on a control inside the row (its own handler wins). */
const fromInteractive = (target: EventTarget, row: Element) => {
  const element = target instanceof Element ? target.closest(INTERACTIVE) : null;
  return Boolean(element && element !== row && row.contains(element));
};

function useViewportWidth(enabled: boolean) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth));
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);
  return width;
}

const toolbarButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-secondary dark:text-ink-secondary transition-colors hover:bg-subtle dark:hover:bg-subtle hover:text-ink dark:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

interface ChooserItem {
  id: string;
  label: string;
  visible: boolean;
  locked: boolean;
  narrowHidden: boolean;
}

function ColumnChooser({
  items,
  onToggle,
  onReset,
}: {
  items: ChooserItem[];
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const shown = items.filter((item) => item.visible).length;
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        // Escape closes only this popover, never the parent slide panel (Child Form Guard).
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <Tooltip content="Ẩn/hiện cột của bảng" placement="top">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={toolbarButton}
        >
          <Columns3 size={14} aria-hidden />
          <span>Cột</span>
          {shown < items.length && (
            <span className="tabular-nums text-ink-muted dark:text-ink-muted">
              {shown}/{items.length}
            </span>
          )}
        </button>
      </Tooltip>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Chọn cột hiển thị"
          className="absolute right-0 top-full z-30 mt-1 w-64 max-h-80 overflow-auto rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated p-1.5 shadow-dropdown"
        >
          {items.map((item) => (
            <label
              key={item.id}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink dark:text-ink',
                item.locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-subtle dark:hover:bg-subtle',
              )}
            >
              <input
                type="checkbox"
                checked={item.visible}
                disabled={item.locked}
                onChange={() => onToggle(item.id)}
                className="h-3.5 w-3.5 shrink-0 accent-primary-600 dark:accent-primary-500"
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.visible && item.narrowHidden && (
                <span className="shrink-0 text-2xs text-ink-muted dark:text-ink-muted">ẩn khi màn hình hẹp</span>
              )}
            </label>
          ))}
          <div className="mt-1 border-t border-border-subtle dark:border-border-subtle pt-1">
            <button
              type="button"
              onClick={onReset}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <RotateCcw size={12} aria-hidden />
              Khôi phục cột và độ rộng mặc định
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared data table: resizable (mouse + keyboard) and sortable columns, persisted per `storageKey`,
 * sticky header, optional column chooser, density, row numbering across pages, skeleton loading,
 * empty slot and keyboard row activation.
 */
export function DataTable<T>({
  rows,
  columns,
  storageKey,
  getRowId = defaultRowId,
  sort: controlledSort,
  onSortChange,
  defaultSort = null,
  onRowClick,
  rowLabel,
  rowClassName,
  isRowActive,
  showRowNumbers = false,
  rowOffset = 0,
  rowNumberHeader = 'STT',
  loading = false,
  loadingRows = 5,
  empty,
  emptyMessage = 'Không có dữ liệu phù hợp.',
  density: densityProp,
  onDensityChange,
  showDensityToggle = false,
  columnChooser = false,
  toolbar,
  stickyHeader = true,
  maxHeight,
  fitWidth = false,
  striped = true,
  wrap = true,
  cellClassName,
  className,
  caption,
}: DataTableProps<T>) {
  const controlled = controlledSort !== undefined;
  const [storedSort, setStoredSort] = useSortState(storageKey + '-sort', defaultSort);
  const activeSort = controlled ? controlledSort : storedSort;
  const { widths, start, nudge, reset: resetWidths } = useColumnResize<string>(storageKey + '-widths', fitWidth);
  const hideableIds = columns.filter((c) => c.hideable !== false).map((c) => c.id);
  const visibility = useColumnVisibility(
    storageKey + '-columns',
    hideableIds,
    columns.filter((c) => c.defaultHidden && c.hideable !== false).map((c) => c.id),
  );
  const [storedDensity, setStoredDensity] = useFilterState<Density>(storageKey + '-density', 'comfortable');
  const density: Density = densityProp ?? (storedDensity === 'compact' ? 'compact' : 'comfortable');
  const viewport = useViewportWidth(columns.some((c) => c.hideBelow));

  const chosen = columns.filter((c) => !columnChooser || visibility.isVisible(c.id));
  const visible = chosen.filter((c) => !hiddenAtViewport(c.hideBelow, viewport));
  const visibleIds = visible.map((c) => c.id);

  const sortColumn = activeSort ? columns.find((c) => c.id === activeSort.columnId) : undefined;
  const sortValue = sortColumn?.sortValue;
  const direction = activeSort?.direction ?? 'asc';
  const displayRows = useMemo(
    () => (controlled || !sortValue ? [...rows] : sortRows(rows, sortValue, direction)),
    [rows, controlled, sortValue, direction],
  );

  const isSortable = (c: DataTableColumn<T>) => (c.sortable ?? Boolean(c.sortValue)) && (!controlled || !!onSortChange);
  const changeSort = (id: string) => {
    const next = nextSort(activeSort, id);
    if (controlled) onSortChange?.(next);
    else {
      setStoredSort(next);
      onSortChange?.(next);
    }
  };
  const minOf = (c: DataTableColumn<T>) => c.minWidth ?? 80;
  const widthOf = (c: DataTableColumn<T>) => widths[c.id] ?? resolveWidth(c.width, 160);
  const total = visible.reduce((sum, c) => sum + widthOf(c), showRowNumbers ? ROW_NUMBER_WIDTH : 0);
  const cssWidth = (px: number) => (fitWidth ? `${(px / Math.max(total, 1)) * 100}%` : px);
  const colSpan = Math.max(1, visible.length + (showRowNumbers ? 1 : 0));
  const activatable = Boolean(onRowClick);
  const showToolbar = Boolean(toolbar || columnChooser || showDensityToggle);
  const setDensity = (next: Density) => {
    setStoredDensity(next);
    onDensityChange?.(next);
  };

  const headerCell = cn(
    'border-b border-border dark:border-border bg-subtle dark:bg-subtle dt-cell align-middle',
    'text-2xs font-semibold uppercase tracking-wide text-ink-secondary dark:text-ink-secondary select-none',
    stickyHeader ? 'sticky top-0 z-10' : 'relative',
  );
  const bodyCell = cn(
    'dt-cell border-b border-border-subtle dark:border-border-subtle text-ink dark:text-ink',
    wrap ? 'whitespace-normal break-words' : 'truncate',
    cellClassName,
  );

  return (
    <div
      data-density={density}
      className={cn(
        'dt-root flex min-w-0 flex-col rounded-xl border border-border dark:border-border bg-surface dark:bg-surface shadow-card',
        className,
      )}
    >
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border dark:border-border px-3 py-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {showDensityToggle && (
            <Tooltip
              content={density === 'compact' ? 'Chuyển sang hiển thị thoáng' : 'Chuyển sang hiển thị gọn'}
              placement="top"
            >
              <button
                type="button"
                aria-pressed={density === 'compact'}
                aria-label="Hiển thị gọn"
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                className={toolbarButton}
              >
                {density === 'compact' ? <Rows4 size={14} aria-hidden /> : <Rows3 size={14} aria-hidden />}
              </button>
            </Tooltip>
          )}
          {columnChooser && (
            <ColumnChooser
              items={columns
                .filter((c) => c.hideable !== false)
                .map((c) => ({
                  id: c.id,
                  label: labelOf(c),
                  visible: visibility.isVisible(c.id),
                  locked: visibility.isVisible(c.id) && hideableIds.length - visibility.hidden.length <= 1,
                  narrowHidden: hiddenAtViewport(c.hideBelow, viewport),
                }))}
              onToggle={visibility.toggle}
              onReset={() => {
                visibility.reset();
                resetWidths();
              }}
            />
          )}
        </div>
      )}
      {loading && (
        <span className="sr-only" role="status">
          Đang tải dữ liệu…
        </span>
      )}
      <div
        className={cn('min-h-0 flex-1 overflow-auto', showToolbar ? 'rounded-b-xl' : 'rounded-[inherit]')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-left"
          style={fitWidth ? undefined : { minWidth: total }}
          aria-busy={loading || undefined}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {showRowNumbers && (
                <th scope="col" className={cn(headerCell, 'text-center')} style={{ width: cssWidth(ROW_NUMBER_WIDTH) }}>
                  {rowNumberHeader}
                </th>
              )}
              {visible.map((c, position) => {
                const sortable = isSortable(c);
                const align = c.align ?? 'left';
                const label = labelOf(c);
                const width = widthOf(c);
                const resizable = c.resizable !== false && (!fitWidth || position < visible.length - 1);
                const resizeOptions = { columns: visibleIds, min: minOf(c) };
                const active = activeSort?.columnId === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    data-col-id={c.id}
                    aria-sort={sortable ? ariaSortFor(activeSort, c.id) : undefined}
                    style={{ width: cssWidth(width) }}
                    className={cn(headerCell, ALIGN_TEXT[align], c.headerClassName)}
                  >
                    <div className={cn('flex min-w-0 items-center gap-1', ALIGN_FLEX[align], resizable && 'pr-2')}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => changeSort(c.id)}
                          className={cn(
                            'group/sort inline-flex min-w-0 items-center gap-1 rounded uppercase tracking-wide transition-colors',
                            'hover:text-ink dark:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                            ALIGN_TEXT[align],
                            active && 'text-ink dark:text-ink',
                          )}
                        >
                          <span className="min-w-0 break-words">{c.header}</span>
                          {active ? (
                            direction === 'desc' ? (
                              <ArrowDown
                                size={12}
                                className="shrink-0 text-primary-600 dark:text-primary-400"
                                aria-hidden
                              />
                            ) : (
                              <ArrowUp
                                size={12}
                                className="shrink-0 text-primary-600 dark:text-primary-400"
                                aria-hidden
                              />
                            )
                          ) : (
                            <ChevronsUpDown
                              size={12}
                              aria-hidden
                              className="shrink-0 text-ink-muted dark:text-ink-muted opacity-40 transition-opacity group-hover/sort:opacity-100"
                            />
                          )}
                        </button>
                      ) : (
                        <span className="min-w-0 break-words">{c.header}</span>
                      )}
                      {c.tooltip && (
                        <Tooltip content={c.tooltip} placement="top">
                          <span
                            tabIndex={0}
                            aria-label={`Giải thích cột ${label}`}
                            className="inline-flex shrink-0 rounded text-ink-muted dark:text-ink-muted hover:text-ink dark:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            <Info size={12} aria-hidden />
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    {resizable && (
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Độ rộng cột ${label} (mũi tên trái/phải để chỉnh, nhấp đúp để đặt lại)`}
                        aria-valuenow={Math.round(width)}
                        aria-valuemin={minOf(c)}
                        tabIndex={0}
                        onPointerDown={(event) => start(c.id, event, resizeOptions)}
                        onDoubleClick={() => resetWidths(c.id)}
                        onKeyDown={(event) => {
                          const delta = keyboardResizeDelta(event.key, event.shiftKey);
                          if (delta === null) return;
                          event.preventDefault();
                          event.stopPropagation();
                          nudge(c.id, delta, event.currentTarget, resizeOptions);
                        }}
                        className="absolute inset-y-0 right-0 z-[1] w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary-300 dark:hover:bg-primary-600 focus-visible:bg-primary-500 dark:focus-visible:bg-primary-400"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && displayRows.length === 0 ? (
              Array.from({ length: loadingRows }, (_, r) => (
                <tr key={'skeleton-' + r} aria-hidden className="dt-row">
                  {showRowNumbers && (
                    <td className={bodyCell}>
                      <div className="mx-auto h-3 w-5 rounded bg-muted dark:bg-muted animate-pulse" />
                    </td>
                  )}
                  {visible.map((c, i) => (
                    <td key={c.id} className={bodyCell}>
                      <div
                        className="h-3 rounded bg-muted dark:bg-muted animate-pulse"
                        style={{ width: skeletonWidth(r, i) + '%' }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-10 text-center text-sm text-ink-muted dark:text-ink-muted whitespace-normal"
                >
                  {empty ?? emptyMessage}
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => (
                <tr
                  key={getRowId(row, index)}
                  tabIndex={activatable ? 0 : undefined}
                  aria-label={activatable && rowLabel ? rowLabel(row) : undefined}
                  onClick={
                    onRowClick
                      ? (event) => {
                          if (fromInteractive(event.target, event.currentTarget)) return;
                          if (window.getSelection?.()?.toString()) return;
                          onRowClick(row, index);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row, index);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'dt-row group transition-colors',
                    striped && 'even:bg-bg-stripe dark:even:bg-bg-stripe',
                    'hover:bg-bg-hover-row dark:hover:bg-bg-hover-row',
                    activatable &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                    isRowActive?.(row) && '!bg-bg-active-row dark:!bg-bg-active-row',
                    rowClassName?.(row, index),
                  )}
                >
                  {showRowNumbers && (
                    <td
                      className={cn(bodyCell, 'text-center font-mono tabular-nums text-ink-muted dark:text-ink-muted')}
                    >
                      {rowNumber(rowOffset, index)}
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.id} className={cn(bodyCell, ALIGN_TEXT[c.align ?? 'left'], c.className)}>
                      {c.cell(row, index)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
