import React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';
import { DateInput } from '../ui/DateInput';

/**
 * Thanh Tìm kiếm & Bộ lọc chuẩn — thứ tự CỐ ĐỊNH từ trái sang phải:
 * [1. Tìm kiếm] → [2. Phân loại] → [3. Cán bộ / CĐT] → [4. Trạng thái SLA] → [5. Thời gian] … [Đặt lại · Đếm · Thao tác]
 */
export interface GridToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  classification?: React.ReactNode;
  assignee?: React.ReactNode;
  status?: React.ReactNode;
  time?: React.ReactNode;
  /** Nút/điều khiển phụ ngay sau bộ lọc (VD: chuyển chế độ xem) */
  extra?: React.ReactNode;
  onReset?: () => void;
  activeFilterCount?: number;
  resultCount?: number;
  resultUnit?: string;
  actions?: React.ReactNode;
}

export function GridSearchInput({
  value,
  onChange,
  placeholder = 'Tìm theo tên dự án, mã hồ sơ...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState(value);

  // Debounce 300ms trước khi đẩy lên bộ lọc (tránh truy vấn DB mỗi phím gõ)
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="relative min-w-[220px] w-full sm:w-72">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-border bg-subtle text-xs text-ink outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-800 dark:bg-slate-800"
      />
      {draft && (
        <button
          type="button"
          aria-label="Xóa nội dung tìm kiếm"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function GridResetButton({ onClick, activeCount = 0 }: { onClick: () => void; activeCount?: number }) {
  return (
    <Tooltip content="Đặt lại bộ lọc, độ rộng cột và sắp xếp về mặc định" placement="top">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative p-1.5 rounded-lg border bg-subtle transition-colors dark:bg-slate-800',
          activeCount > 0
            ? 'border-primary-400 text-primary-600 dark:text-primary-400'
            : 'border-border text-ink-muted hover:text-ink dark:border-slate-800'
        )}
      >
        <RotateCcw size={14} />
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary-500 text-white text-[9px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export function GridCount({ count, unit = 'bản ghi' }: { count: number; unit?: string }) {
  return (
    <span className="text-2xs font-semibold px-2 py-1 rounded-md bg-subtle text-ink-secondary border border-border whitespace-nowrap dark:bg-slate-800 dark:border-slate-800">
      {count.toLocaleString('vi-VN')} {unit}
    </span>
  );
}

/** Bộ lọc khoảng ngày (vị trí 5): Từ ngày — Đến ngày. Giá trị dạng yyyy-mm-dd. */
export function DateRangeFilter({
  from,
  to,
  onChange,
  label,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-2xs text-ink-muted whitespace-nowrap">{label}</span>}
      <DateInput value={from} onChange={(v) => onChange(v, to)} placeholder="Từ ngày" className="w-32 [&_input]:text-xs" />
      <span className="text-ink-muted text-2xs">—</span>
      <DateInput value={to} onChange={(v) => onChange(from, v)} placeholder="Đến ngày" className="w-32 [&_input]:text-xs" />
    </div>
  );
}

export function GridToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  classification,
  assignee,
  status,
  time,
  extra,
  onReset,
  activeFilterCount,
  resultCount,
  resultUnit,
  actions,
}: GridToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
        {/* 1. Tìm kiếm */}
        <GridSearchInput value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
        {/* 2. Phân loại */}
        {classification}
        {/* 3. Cán bộ thẩm định / Chủ đầu tư */}
        {assignee}
        {/* 4. Trạng thái SLA */}
        {status}
        {/* 5. Thời gian */}
        {time}
        {extra}
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {onReset && <GridResetButton onClick={onReset} activeCount={activeFilterCount} />}
        {resultCount !== undefined && <GridCount count={resultCount} unit={resultUnit} />}
        {actions}
      </div>
    </div>
  );
}
