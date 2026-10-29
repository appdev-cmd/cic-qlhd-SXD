import { X } from 'lucide-react';

export interface FilterChip {
  id: string;
  /** Nhãn nhóm, ví dụ "Trạng thái" */
  label: string;
  /** Giá trị đang lọc, ví dụ "Đang xử lý" */
  value: string;
  onRemove: () => void;
}

/**
 * Dải chip "bộ lọc đang áp dụng" dưới thanh lọc — mỗi chip bỏ được riêng, kèm nút xóa tất cả.
 * Không hiển thị gì khi không có bộ lọc.
 */
export function FilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll?: () => void }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang áp dụng">
      <span className="text-xs font-semibold text-ink-muted dark:text-slate-400">Đang lọc:</span>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-full border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-slate-800 py-0.5 pl-2.5 pr-1 text-xs text-primary-800 dark:text-primary-200"
        >
          <span className="text-primary-600 dark:text-primary-400">{chip.label}:</span>
          <span className="max-w-[16rem] truncate font-semibold">{chip.value}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={'Bỏ lọc ' + chip.label + ': ' + chip.value}
            className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {onClearAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-ink-muted dark:text-slate-400 underline-offset-2 hover:text-ink dark:hover:text-slate-100 hover:underline"
        >
          Xóa tất cả
        </button>
      )}
    </div>
  );
}
