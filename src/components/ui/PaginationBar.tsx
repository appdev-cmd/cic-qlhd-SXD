import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatNumber } from '../../lib/utils';

/**
 * PaginationBar — shared pager for list screens. Hides itself when there is only one page.
 */
export interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  /** Display unit: "hồ sơ", "dự án"… */
  unit?: string;
  className?: string;
}

const fmt = (n: number) => formatNumber(n, 0);

const navButton =
  'p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-bg-muted dark:hover:bg-slate-800 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

export const PaginationBar = memo(
  ({ page, totalPages, total, pageSize, onPageChange, unit = 'hồ sơ', className }: PaginationBarProps) => {
    if (totalPages <= 1) return null;
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, total);

    return (
      <nav
        aria-label="Phân trang"
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 mt-3',
          'bg-bg-surface border-border dark:bg-slate-900 dark:border-slate-800',
          className,
        )}
      >
        <span className="text-xs font-medium text-txt-muted dark:text-slate-400">
          Hiển thị {fmt(startItem)}–{fmt(endItem)} / {fmt(total)} {unit}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={navButton}
            aria-label="Trang trước"
          >
            <ChevronLeft className="w-4 h-4 text-txt-secondary dark:text-slate-300" aria-hidden="true" />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7 || page <= 4) pageNum = i + 1;
            else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
            else pageNum = page - 3 + i;
            const active = page === pageNum;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                aria-label={`Trang ${pageNum}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'w-8 h-8 rounded-lg text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  active
                    ? 'bg-primary-500 text-white shadow-sm dark:bg-primary-600 dark:text-white'
                    : 'text-txt-secondary hover:bg-bg-muted dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={navButton}
            aria-label="Trang sau"
          >
            <ChevronRight className="w-4 h-4 text-txt-secondary dark:text-slate-300" aria-hidden="true" />
          </button>
        </div>
      </nav>
    );
  },
);
PaginationBar.displayName = 'PaginationBar';

export default PaginationBar;
