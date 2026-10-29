import React, { useState } from 'react';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn, formatNumber } from '../../../lib/utils';
import { Tooltip } from '../Tooltip';

/**
 * Standard filter bar. Slots render in the fixed order required by the project rules:
 * [1 search] → [2 classification] → [3 officer / investor / project] → [4 SLA / status]
 * → [5 received / due dates] → right side: reset, count, actions.
 */
export interface GridToolbarProps {
  search: React.ReactNode;
  classification?: React.ReactNode;
  people?: React.ReactNode;
  status?: React.ReactNode;
  period?: React.ReactNode;
  onReset?: () => void;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Gập nhóm thời gian (vị trí 5) sau nút "Bộ lọc khác" để thanh lọc gọn một hàng.
   * Khi mở, nhóm vẫn hiện đúng vị trí 5 theo thứ tự chuẩn.
   */
  collapsePeriod?: boolean;
  /** Số bộ lọc đang áp dụng trong nhóm bị gập — hiện trên nút. */
  periodActive?: number;
}

export function GridToolbar({
  search,
  classification,
  people,
  status,
  period,
  onReset,
  count,
  actions,
  className,
  collapsePeriod = false,
  periodActive = 0,
}: GridToolbarProps) {
  const [showPeriod, setShowPeriod] = useState(false);
  const periodVisible = !collapsePeriod || showPeriod || periodActive > 0;
  const slots = [classification, people, status, periodVisible ? period : null].filter(Boolean);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-3',
        className,
      )}
    >
      <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2.5">
        {search}
        {slots.map((slot, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            {slot}
          </div>
        ))}
        {collapsePeriod && period && periodActive === 0 && (
          <button
            type="button"
            aria-expanded={showPeriod}
            onClick={() => setShowPeriod(!showPeriod)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border dark:border-slate-600 px-2.5 py-2 text-sm text-ink-muted dark:text-slate-400 hover:border-primary-300 dark:hover:border-primary-700 hover:text-ink dark:hover:text-slate-100"
          >
            <SlidersHorizontal size={14} />
            {showPeriod ? 'Ẩn lọc thời gian' : 'Lọc theo thời gian'}
            <ChevronDown size={14} className={cn('transition-transform', showPeriod && 'rotate-180')} />
          </button>
        )}
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
        {onReset && <GridResetButton onClick={onReset} />}
        {count}
        {actions}
      </div>
    </div>
  );
}

export function GridSearchInput({
  value,
  onChange,
  placeholder = 'Tìm theo tên dự án, mã hồ sơ...',
  label = 'Tìm kiếm',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full min-w-[220px] sm:w-72', className)}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-slate-400"
      />
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 py-2 pl-9 pr-8 text-sm text-ink dark:text-slate-100 outline-none transition-colors placeholder:text-ink-muted dark:placeholder:text-slate-500 focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
      />
      {value && (
        <button
          type="button"
          aria-label="Xóa nội dung tìm kiếm"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function GridResetButton({ onClick, label = 'Đặt lại bộ lọc' }: { onClick: () => void; label?: string }) {
  return (
    <Tooltip content={label} placement="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="rounded-lg border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 p-2 text-ink-muted dark:text-slate-300 transition-colors hover:text-ink dark:hover:text-slate-100"
      >
        <RotateCcw size={15} />
      </button>
    </Tooltip>
  );
}

export function GridCount({ total, unit = 'bản ghi', detail }: { total: number; unit?: string; detail?: string }) {
  return (
    <span className="rounded-md border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-ink-secondary dark:text-slate-300">
      {formatNumber(total)} {unit}
      {detail ? ' · ' + detail : ''}
    </span>
  );
}
