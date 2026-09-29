import React from 'react';
import { cn } from '../lib/utils';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import { useColumnResize } from '../hooks/useColumnResize';
import { useGridSort } from '../hooks/useGridSort';

export interface Column<T> {
  header: string;
  accessor: (item: T, index: number) => React.ReactNode;
  className?: string;
  width?: string | number;
  sortValue: (item: T) => string | number;
  sortKey?: string;
}

export interface MasterTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  onView?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  maxHeight?: string;
  storageKey?: string;
  serverSort?: { key: string; direction: string };
  onSort?: (key: string, direction: string) => void;
  emptyMessage?: string;
  /** Show a loading row instead of the empty message while the first result is pending. */
  loading?: boolean;
  className?: string;
}

export function MasterTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  maxHeight = 'calc(100vh - 300px)',
  emptyMessage = 'Không tìm thấy dữ liệu phù hợp',
  loading = false,
  className,
  storageKey = 'master-table',
  serverSort,
  onSort,
}: MasterTableProps<T>) {
  const hasActions = Boolean(onView || onEdit || onDelete);
  const clickable = Boolean(onRowClick || onView);
  const { widths, start } = useColumnResize(storageKey + '-widths');
  const { sorted, sort, toggle } = useGridSort(
    storageKey + '-sort',
    data,
    columns.map((c) => ({ value: c.sortValue })),
  );
  const columnWidth = (col: Column<T>, index: number) =>
    widths[index] ||
    (typeof col.width === 'number'
      ? col.width
      : col.width?.endsWith('%')
        ? Math.max(120, parseFloat(col.width) * 10)
        : 180);

  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-card overflow-hidden', className)}>
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
        <table
          className="w-full table-fixed text-left border-collapse text-xs"
          style={{ minWidth: columns.reduce((sum, c, i) => sum + columnWidth(c, i), hasActions ? 144 : 48) }}
        >
          <thead className="thead-sticky">
            <tr>
              <th className="th-cell w-12 text-center">STT</th>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{ width: columnWidth(col, idx) }}
                  className={cn('th-cell relative', col.className)}
                  aria-sort={
                    serverSort
                      ? serverSort.key === col.sortKey
                        ? serverSort.direction === 'desc'
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                      : sort.column === idx
                        ? sort.descending
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                  }
                >
                  <button
                    type="button"
                    className="pr-4 text-left"
                    disabled={!!serverSort && !col.sortKey}
                    onClick={() =>
                      serverSort && onSort && col.sortKey
                        ? onSort(
                            col.sortKey,
                            serverSort.key === col.sortKey && serverSort.direction === 'asc' ? 'desc' : 'asc',
                          )
                        : toggle(idx)
                    }
                  >
                    {col.header}{' '}
                    {serverSort
                      ? serverSort.key === col.sortKey
                        ? serverSort.direction === 'desc'
                          ? '↓'
                          : '↑'
                        : ''
                      : sort.column === idx
                        ? sort.descending
                          ? '↓'
                          : '↑'
                        : ''}
                  </button>
                  <span
                    role="separator"
                    aria-label={'Kéo rộng cột ' + col.header}
                    onPointerDown={(e) => start(idx, e)}
                    className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-primary-300 dark:hover:bg-primary-600"
                  />
                </th>
              ))}
              {hasActions && <th className="th-cell text-right w-24">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 2 : 1)}
                  className="px-4 py-12 text-center text-xs text-ink-muted italic"
                >
                  {loading ? 'Đang tải dữ liệu…' : emptyMessage}
                </td>
              </tr>
            ) : (
              (serverSort ? data : sorted).map((item, rowIdx) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    if (onRowClick) onRowClick(item);
                    else if (onView) onView(item);
                  }}
                  className={cn('tr-stripe transition-colors group', clickable && 'cursor-pointer hover:bg-hover-row')}
                >
                  <td className="td-cell text-center font-mono text-ink-muted">{rowIdx + 1}</td>
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={cn('td-cell', col.className)}>
                      {col.accessor(item, rowIdx)}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="td-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {onView && (
                          <Tooltip content="Xem chi tiết hồ sơ" placement="left">
                            <button
                              type="button"
                              onClick={() => onView(item)}
                              className="p-1.5 rounded-md hover:bg-subtle text-ink-muted hover:text-primary-600 transition-colors"
                            >
                              <Eye size={14} />
                            </button>
                          </Tooltip>
                        )}
                        {onEdit && (
                          <Tooltip content="Chỉnh sửa thông tin" placement="left">
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="p-1.5 rounded-md hover:bg-subtle text-ink-muted hover:text-amber-600 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                          </Tooltip>
                        )}
                        {onDelete && (
                          <Tooltip content="Xóa bản ghi" placement="left">
                            <button
                              type="button"
                              onClick={() => onDelete(item)}
                              className="p-1.5 rounded-md hover:bg-subtle text-ink-muted hover:text-rose-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                        )}
                      </div>
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
