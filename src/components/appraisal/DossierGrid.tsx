import React from 'react';
import { DataTable, type Density, type DataTableColumn, type SortState } from '../ui/DataTable';
import type { Breakpoint } from '../../lib/dataTable';

export interface GridColumn<T> {
  label: string;
  sortKey?: string;
  value: (r: T) => string | number;
  render?: (r: T) => React.ReactNode;
  width?: number;
  /** Hide this secondary column below the given breakpoint. */
  hideBelow?: Breakpoint;
  /** Header help text shown in a Tooltip. */
  tooltip?: React.ReactNode;
}

/** Compact grid used across appraisal panels: DataTable with the legacy `GridColumn` API. */
export function DossierGrid<T extends { id: string }>({
  rows,
  columns,
  storageKey,
  serverSort,
  onSort,
  fitWidth = false,
  className = '',
  loading = false,
  emptyMessage = 'Chưa có dữ liệu trong phạm vi đã chọn.',
  onRowClick,
  rowLabel,
  showRowNumbers = false,
  rowOffset = 0,
  columnChooser = false,
  density,
}: {
  rows: T[];
  columns: GridColumn<T>[];
  storageKey: string;
  serverSort?: { key: string; direction: string };
  onSort?: (key: string, direction: string) => void;
  fitWidth?: boolean;
  className?: string;
  /** Show skeleton rows instead of the empty state while the first result is pending. */
  loading?: boolean;
  emptyMessage?: string;
  /** Row activation by click, Enter or Space. */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  showRowNumbers?: boolean;
  /** Rows before the current page so numbering continues across pages. */
  rowOffset?: number;
  columnChooser?: boolean;
  density?: Density;
}) {
  // Ids are column indexes so widths/sort stored by the previous index-based grid stay valid.
  const tableColumns: DataTableColumn<T>[] = columns.map((c, index) => ({
    id: String(index),
    header: c.label,
    cell: (row) => (c.render ? c.render(row) : c.value(row)),
    sortValue: serverSort ? undefined : c.value,
    sortable: serverSort ? Boolean(c.sortKey) : true,
    width: c.width ?? 180,
    minWidth: 80,
    hideBelow: c.hideBelow,
    tooltip: c.tooltip,
  }));
  const sortIndex = serverSort ? columns.findIndex((c) => c.sortKey && c.sortKey === serverSort.key) : -1;
  const sort: SortState | null | undefined = serverSort
    ? sortIndex >= 0
      ? { columnId: String(sortIndex), direction: serverSort.direction === 'desc' ? 'desc' : 'asc' }
      : null
    : undefined;

  return (
    <DataTable
      rows={rows}
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
      onRowClick={onRowClick ? (row) => onRowClick(row) : undefined}
      rowLabel={rowLabel}
      showRowNumbers={showRowNumbers}
      rowOffset={rowOffset}
      loading={loading}
      emptyMessage={emptyMessage}
      columnChooser={columnChooser}
      density={density}
      fitWidth={fitWidth}
      cellClassName="align-top"
      className={className}
    />
  );
}
