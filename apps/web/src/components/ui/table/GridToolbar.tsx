"use client";

import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '../Tooltip';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  GRID TOOLBAR — thanh tìm kiếm & bộ lọc chuẩn dùng chung cho mọi bảng
 * ══════════════════════════════════════════════════════════════════════════
 *  Thứ tự bắt buộc từ TRÁI sang PHẢI (theo CLAUDE.md — Standard Filter Bar):
 *    1. Ô tìm kiếm  → 2. Phân loại → 3. Phụ trách/Đơn vị → 4. Trạng thái
 *    → 5. Thời gian/Sắp xếp → (đẩy sang phải) Reset • Bộ đếm • Nút thao tác
 */

/** Class dùng chung cho mọi control trong thanh lọc (select, nút, ô nhập) */
export const GRID_CONTROL_CLASS =
  'h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
  'text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ' +
  'focus:border-indigo-500 transition-colors';

export function GridToolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800',
        'bg-white dark:bg-slate-900 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Đẩy các phần tử phía sau sang mép phải của thanh lọc */
export function GridToolbarSpacer() {
  return <div className="flex-1 min-w-0" />;
}

interface GridSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/** Vị trí 1 — Ô tìm kiếm (luôn đứng đầu tiên bên trái, có nút xoá) */
export function GridSearchInput({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  className,
  autoFocus,
}: GridSearchInputProps) {
  return (
    <div className={cn('relative flex-1 min-w-[200px] max-w-md', className)}>
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(GRID_CONTROL_CLASS, 'w-full pl-9 pr-8 placeholder:text-slate-400 dark:placeholder:text-slate-500')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          aria-label="Xoá từ khoá tìm kiếm"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Select ngắn (enum cố định) dùng chung style với ô tìm kiếm */
export function GridFilterSelect({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(GRID_CONTROL_CLASS, 'cursor-pointer', className)} {...rest}>
      {children}
    </select>
  );
}

/** Nút khôi phục bề rộng cột / bộ lọc về mặc định */
export function GridResetButton({
  onClick,
  label = 'Khôi phục bề rộng cột về mặc định',
  text = 'Reset cột',
}: {
  onClick: () => void;
  label?: string;
  text?: string;
}) {
  return (
    <Tooltip content={label} placement="top">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <RotateCcw size={14} />
        {text}
      </button>
    </Tooltip>
  );
}

/** Bộ đếm kết quả hiển thị ở cuối thanh lọc */
export function GridCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
      {children}
    </span>
  );
}

export default GridToolbar;
