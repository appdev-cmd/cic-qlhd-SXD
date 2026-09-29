import React from 'react';
import { useColumnResize } from '../../hooks/useColumnResize';
import { useGridSort } from '../../hooks/useGridSort';
export interface GridColumn<T> {
  label: string;
  sortKey?: string;
  value: (r: T) => string | number;
  render?: (r: T) => React.ReactNode;
  width?: number;
}
export function DossierGrid<T extends { id: string }>({
  rows,
  columns,
  storageKey,
  serverSort,
  onSort,
  fitWidth = false,
  className = '',
  loading = false,
}: {
  rows: T[];
  columns: GridColumn<T>[];
  storageKey: string;
  serverSort?: { key: string; direction: string };
  onSort?: (key: string, direction: string) => void;
  fitWidth?: boolean;
  className?: string;
  /** Show a loading message instead of the empty state while the first result is pending. */
  loading?: boolean;
}) {
  const { widths, start } = useColumnResize(storageKey + '-widths', fitWidth);
  const { sorted, sort, toggle } = useGridSort(storageKey + '-sort', rows, columns);
  const totalWidth = columns.reduce((n, c, i) => n + (widths[i] || c.width || 180), 0);
  return (
    <div
      className={
        'overflow-auto rounded-xl border border-border dark:border-border bg-surface dark:bg-surface ' + className
      }
    >
      <table
        className="w-full table-fixed text-left text-xs text-ink-secondary dark:text-ink-secondary"
        style={fitWidth ? undefined : { minWidth: totalWidth }}
      >
        <thead className="sticky top-0 z-10 bg-subtle dark:bg-subtle">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.label}
                style={{
                  width: fitWidth
                    ? `${((widths[i] || c.width || 180) / totalWidth) * 100}%`
                    : widths[i] || c.width || 180,
                }}
                className="relative p-3 font-semibold break-words"
                aria-sort={
                  serverSort
                    ? serverSort.key === c.sortKey
                      ? serverSort.direction === 'desc'
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                    : sort.column === i
                      ? sort.descending
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                }
              >
                <button
                  type="button"
                  className="text-left pr-4"
                  disabled={!!serverSort && !c.sortKey}
                  onClick={() =>
                    serverSort && onSort && c.sortKey
                      ? onSort(
                          c.sortKey,
                          serverSort.key === c.sortKey && serverSort.direction === 'asc' ? 'desc' : 'asc',
                        )
                      : toggle(i)
                  }
                >
                  {c.label}{' '}
                  {serverSort
                    ? serverSort.key === c.sortKey
                      ? serverSort.direction === 'desc'
                        ? '↓'
                        : '↑'
                      : ''
                    : sort.column === i
                      ? sort.descending
                        ? '↓'
                        : '↑'
                      : ''}
                </button>
                {(!fitWidth || i < columns.length - 1) && (
                  <span
                    role="separator"
                    aria-label={'Kéo rộng cột ' + c.label}
                    onPointerDown={(e) => start(i, e)}
                    className="absolute inset-y-0 right-0 w-2 touch-none cursor-col-resize hover:bg-primary-300 dark:hover:bg-primary-600"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(serverSort ? rows : sorted).map((row) => (
            <tr key={row.id} className="border-t border-border dark:border-border">
              {columns.map((c) => (
                <td key={c.label} className="p-3 align-top break-words whitespace-normal">
                  {c.render ? c.render(row) : c.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-8 text-center text-sm text-ink-muted dark:text-ink-muted">
          {loading ? 'Đang tải dữ liệu…' : 'Chưa có dữ liệu trong phạm vi đã chọn.'}
        </p>
      )}
    </div>
  );
}
