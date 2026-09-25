import React from 'react';
import { Search, X, RotateCcw, FileSpreadsheet, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { Tooltip } from './ui/Tooltip';

export interface TableToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  resultCount?: number;
  onResetFilters?: () => void;
  onExportExcel?: () => void;
  onAddNew?: () => void;
  addNewLabel?: string;
}

export function TableToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm theo tên dự án, mã hồ sơ...',
  filters,
  resultCount,
  onResetFilters,
  onExportExcel,
  onAddNew,
  addNewLabel = 'Tiếp nhận mới',
}: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface shadow-xs">
      {/* ─── Cụm bên trái: [1. Ô tìm kiếm] + [2, 3, 4, 5. Các bộ lọc chuẩn] ─── */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Vị trí 1: Ô tìm kiếm luôn đứng đầu bên trái */}
        <div className="relative min-w-[220px] max-w-xs w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-border bg-subtle text-xs text-ink outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Vị trí 2, 3, 4, 5: Các dropdown bộ lọc */}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}

        {onResetFilters && (
          <Tooltip content="Đặt lại toàn bộ bộ lọc về mặc định" placement="top">
            <button
              type="button"
              onClick={onResetFilters}
              className="p-1.5 rounded-lg border border-border bg-subtle text-ink-muted hover:text-ink hover:border-slate-400 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* ─── Cụm bên phải: Bộ đếm kết quả + Xuất Excel + Thao tác chính ─── */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {resultCount !== undefined && (
          <span className="text-2xs font-semibold px-2 py-1 rounded-md bg-subtle text-ink-secondary border border-border">
            {resultCount} bản ghi
          </span>
        )}

        {onExportExcel && (
          <Tooltip content="Xuất dữ liệu danh sách ra file Excel" placement="top">
            <button
              type="button"
              onClick={onExportExcel}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-xs font-medium text-ink transition-colors"
            >
              <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </button>
          </Tooltip>
        )}

        {onAddNew && (
          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>{addNewLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
