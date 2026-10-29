import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { cn, formatNumber } from '../../lib/utils';

const TONES = {
  default: 'text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-slate-800',
  success: 'text-success-600 dark:text-success-400 bg-success-50 dark:bg-slate-800',
  warning: 'text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-slate-800',
  danger: 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-slate-800',
  info: 'text-info-600 dark:text-info-400 bg-info-50 dark:bg-slate-800',
} as const;

/**
 * Ô chỉ số (KPI) cho dashboard. Bấm được khi có `onClick` (mở danh sách đã lọc tương ứng).
 * `trend` so với kỳ trước: số dương = tăng; `trendGood` cho biết tăng là tốt hay xấu.
 */
export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
  trendLabel = 'so với kỳ trước',
  trendGood = 'up',
  help,
  onClick,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
  trend?: number;
  trendLabel?: string;
  trendGood?: 'up' | 'down';
  help?: string;
  onClick?: () => void;
  className?: string;
}) {
  const Trend = trend === undefined || trend === 0 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  const good = trend === undefined || trend === 0 ? null : trendGood === 'up' ? trend > 0 : trend < 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-slate-400">{label}</p>
        {icon && <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONES[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums leading-none text-ink dark:text-slate-100">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {trend !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              good === null && 'bg-muted dark:bg-slate-700 text-ink-muted dark:text-slate-300',
              good === true && 'bg-success-50 dark:bg-success-900 text-success-700 dark:text-success-200',
              good === false && 'bg-danger-50 dark:bg-danger-900 text-danger-700 dark:text-danger-200',
            )}
          >
            <Trend size={12} />
            {formatNumber(Math.abs(trend), 1)}%
          </span>
        )}
        {trend !== undefined && <span className="text-ink-muted dark:text-slate-400">{trendLabel}</span>}
        {hint && <span className="text-ink-muted dark:text-slate-400">{hint}</span>}
      </div>
    </>
  );
  const classes = cn(
    'block w-full rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-4 text-left shadow-card',
    onClick &&
      'cursor-pointer transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
    className,
  );
  const tile = onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
  return help ? <Tooltip content={help}>{tile}</Tooltip> : tile;
}
