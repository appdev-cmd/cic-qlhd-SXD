import React, { useCallback, useMemo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { compareValues, type SortSpec } from '../../data-access/query';
import { useColumnResize, useGridSort } from '../../hooks/useGridColumns';

export interface GridColumn<T, K extends string = string> {
  key: K;
  header: string;
  render: (row: T, index: number) => React.ReactNode;
  /** Độ rộng mặc định (px) — người dùng kéo thay đổi, lưu localStorage */
  width: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** Giá trị dùng để sắp xếp phía client (mặc định: row[key]) */
  sortValue?: (row: T) => unknown;
}

/**
 * Trạng thái lưới dữ liệu (độ rộng cột + sắp xếp), khai báo ở trang để nút "Đặt lại" dùng chung.
 */
export function useDataGrid<T, K extends string>(
  storageKey: string,
  columns: GridColumn<T, K>[],
  defaultSort: SortSpec<K> | null = null
) {
  const defaultWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c.width])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phụ thuộc cấu hình độ rộng
    [columns.map((c) => `${c.key}:${c.width}`).join('|')]
  );
  const resize = useColumnResize(storageKey, defaultWidths);
  const sorting = useGridSort<K>(storageKey, defaultSort);

  const resetLayout = useCallback(() => {
    resize.resetWidths();
    sorting.resetSort();
  }, [resize, sorting]);

  return { ...resize, ...sorting, resetLayout };
}

export type DataGridState<K extends string> = ReturnType<typeof useDataGrid<unknown, K>>;

export interface DataGridProps<T, K extends string> {
  columns: GridColumn<T, K>[];
  rows: T[];
  grid: DataGridState<K>;
  getRowId: (row: T) => string;
  /** 'server': dữ liệu đã được sắp xếp tại DB theo grid.sort; 'client': sắp xếp trong bảng */
  sortMode?: 'client' | 'server';
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  actionsWidth?: number;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  emptyMessage?: string;
  maxHeight?: string;
  showIndex?: boolean;
  /** Số thứ tự bắt đầu (khi phân trang) */
  indexOffset?: number;
  className?: string;
}

export function DataGrid<T, K extends string>({
  columns,
  rows,
  grid,
  getRowId,
  sortMode = 'client',
  onRowClick,
  rowActions,
  actionsWidth = 96,
  isLoading,
  error,
  onRetry,
  emptyMessage = 'Không tìm thấy dữ liệu phù hợp',
  maxHeight = 'calc(100vh - 260px)',
  showIndex = true,
  indexOffset = 0,
  className,
}: DataGridProps<T, K>) {
  const { widths, startResize, sort, toggleSort } = grid;

  const displayRows = useMemo(() => {
    if (sortMode === 'server' || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const getValue = col.sortValue ?? ((row: T) => (row as Record<string, unknown>)[col.key]);
    return [...rows].sort((a, b) => {
      const diff = compareValues(getValue(a), getValue(b));
      return sort.direction === 'asc' ? diff : -diff;
    });
  }, [rows, sort, sortMode, columns]);

  const totalWidth =
    (showIndex ? 52 : 0) +
    columns.reduce((s, c) => s + (widths[c.key] ?? c.width), 0) +
    (rowActions ? actionsWidth : 0);

  const colSpan = columns.length + (showIndex ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-card overflow-hidden dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="border-collapse text-xs text-left" style={{ tableLayout: 'fixed', width: '100%', minWidth: totalWidth }}>
          <colgroup>
            {showIndex && <col style={{ width: 52 }} />}
            {columns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
            ))}
            {rowActions && <col style={{ width: actionsWidth }} />}
          </colgroup>

          <thead className="thead-sticky">
            <tr>
              {showIndex && <th className="th-cell text-center">STT</th>}
              {columns.map((c) => {
                const isSorted = sort?.key === c.key;
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'th-cell relative group/th select-none',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center'
                    )}
                    aria-sort={isSorted ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => sortable && toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 max-w-full truncate',
                        sortable && 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400',
                        isSorted && 'text-primary-600 dark:text-primary-400',
                        c.align === 'right' && 'flex-row-reverse'
                      )}
                    >
                      <span className="truncate">{c.header}</span>
                      {sortable &&
                        (isSorted ? (
                          sort!.direction === 'asc' ? (
                            <ArrowUp size={12} className="shrink-0" />
                          ) : (
                            <ArrowDown size={12} className="shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown size={11} className="shrink-0 opacity-0 group-hover/th:opacity-50" />
                        ))}
                    </button>
                    {/* Tay kéo thay đổi độ rộng cột */}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Kéo để đổi độ rộng cột ${c.header}`}
                      onPointerDown={(e) => startResize(c.key, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:right-0.5 after:top-1/4 after:h-1/2 after:w-px after:bg-border hover:after:bg-primary-500 hover:after:w-0.5"
                    />
                  </th>
                );
              })}
              {rowActions && <th className="th-cell text-right">Thao tác</th>}
            </tr>
          </thead>

          <tbody>
            {error ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={20} />
                    <span className="text-xs font-semibold">{error.message}</span>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-surface text-2xs text-ink hover:bg-subtle"
                      >
                        <RefreshCw size={12} /> Thử lại
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : isLoading && rows.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={colSpan} className="td-cell">
                    <div className="h-4 rounded bg-subtle animate-pulse dark:bg-slate-800" />
                  </td>
                </tr>
              ))
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-xs text-ink-muted italic">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => (
                <tr
                  key={getRowId(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'tr-stripe transition-colors group',
                    onRowClick && 'cursor-pointer hover:bg-hover-row',
                    isLoading && 'opacity-60'
                  )}
                >
                  {showIndex && (
                    <td className="td-cell text-center font-mono text-ink-muted">{indexOffset + idx + 1}</td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'td-cell overflow-hidden',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center'
                      )}
                    >
                      {c.render(row, idx)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="td-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
