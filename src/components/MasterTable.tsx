import React from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import { DataTable, type Breakpoint, type ColumnAlign, type DataTableColumn, type SortState } from './ui/DataTable';

export interface Column<T> {
  header: string;
  accessor: (item: T, index: number) => React.ReactNode;
  className?: string;
  width?: string | number;
  sortValue: (item: T) => string | number;
  sortKey?: string;
  /** Hide this secondary column below the given breakpoint. */
  hideBelow?: Breakpoint;
  /** Header help text shown in a Tooltip. */
  tooltip?: React.ReactNode;
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
  /** Rendered in place of rows when there is nothing to show (overrides emptyMessage). */
  empty?: React.ReactNode;
  /** Show skeleton rows instead of the empty message while the first result is pending. */
  loading?: boolean;
  className?: string;
  /** Rows before the current page (server paging) so the STT column continues across pages. */
  rowOffset?: number;
  /** Show the "Cột" popover to hide/show columns (default true). */
  columnChooser?: boolean;
  /** Accessible name for each clickable row. */
  rowLabel?: (item: T) => string;
}

const alignFrom = (className?: string): ColumnAlign | undefined =>
  /\btext-right\b/.test(className || '') ? 'right' : /\btext-center\b/.test(className || '') ? 'center' : undefined;

const actionButton =
  'p-1.5 rounded-md hover:bg-subtle dark:hover:bg-subtle text-ink-muted dark:text-ink-muted transition-colors';

/** Main entity list (ProjectsPage…): DataTable with STT column, action buttons and legacy column API. */
export function MasterTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  maxHeight = 'calc(100vh - 300px)',
  emptyMessage = 'Không tìm thấy dữ liệu phù hợp',
  empty,
  loading = false,
  className,
  storageKey = 'master-table',
  serverSort,
  onSort,
  rowOffset = 0,
  columnChooser = true,
  rowLabel,
}: MasterTableProps<T>) {
  const hasActions = Boolean(onView || onEdit || onDelete);
  const activate = onRowClick || onView;
  // Ids are column indexes so widths/sort stored by the previous index-based grid stay valid.
  const tableColumns: DataTableColumn<T>[] = columns.map((col, index) => ({
    id: String(index),
    header: col.header,
    cell: col.accessor,
    sortValue: serverSort ? undefined : col.sortValue,
    sortable: serverSort ? Boolean(col.sortKey) : true,
    width: col.width,
    minWidth: 100,
    align: alignFrom(col.className),
    className: col.className,
    headerClassName: col.className,
    hideBelow: col.hideBelow,
    tooltip: col.tooltip,
  }));
  if (hasActions)
    tableColumns.push({
      id: '__actions',
      header: 'Thao tác',
      width: 112,
      align: 'right',
      hideable: false,
      resizable: false,
      sortable: false,
      className: 'whitespace-nowrap',
      cell: (item) => (
        <div className="flex items-center justify-end gap-1" data-row-click-ignore>
          {onView && (
            <Tooltip content="Xem chi tiết hồ sơ" placement="left">
              <button
                type="button"
                aria-label="Xem chi tiết"
                onClick={() => onView(item)}
                className={actionButton + ' hover:text-primary-600 dark:hover:text-primary-400'}
              >
                <Eye size={14} />
              </button>
            </Tooltip>
          )}
          {onEdit && (
            <Tooltip content="Chỉnh sửa thông tin" placement="left">
              <button
                type="button"
                aria-label="Chỉnh sửa"
                onClick={() => onEdit(item)}
                className={actionButton + ' hover:text-amber-600 dark:hover:text-amber-400'}
              >
                <Pencil size={14} />
              </button>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip content="Xóa bản ghi" placement="left">
              <button
                type="button"
                aria-label="Xóa"
                onClick={() => onDelete(item)}
                className={actionButton + ' hover:text-rose-600 dark:hover:text-rose-400'}
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      ),
    });

  const sortIndex = serverSort ? columns.findIndex((c) => c.sortKey && c.sortKey === serverSort.key) : -1;
  const sort: SortState | null | undefined = serverSort
    ? sortIndex >= 0
      ? { columnId: String(sortIndex), direction: serverSort.direction === 'desc' ? 'desc' : 'asc' }
      : null
    : undefined;

  return (
    <DataTable
      rows={data}
      columns={tableColumns}
      storageKey={storageKey}
      sort={sort}
      onSortChange={
        serverSort && onSort
          ? (next) => {
              const key = columns[Number(next.columnId)]?.sortKey;
              if (key) onSort(key, next.direction);
            }
          : undefined
      }
      defaultSort={{ columnId: '0', direction: 'asc' }}
      onRowClick={activate ? (item) => activate(item) : undefined}
      rowLabel={rowLabel}
      showRowNumbers
      rowOffset={rowOffset}
      loading={loading}
      emptyMessage={emptyMessage}
      empty={empty}
      columnChooser={columnChooser}
      showDensityToggle={columnChooser}
      maxHeight={maxHeight}
      className={className}
    />
  );
}
