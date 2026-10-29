import React from 'react';
import { cn, formatDateTime } from '../../lib/utils';

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  /** Thời điểm ISO — hiển thị dd/mm/yyyy HH:mm */
  at?: string;
  /** Tên người thực hiện (đã resolve, không hiển thị UUID). */
  actor?: React.ReactNode;
  description?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: React.ReactNode;
}

const DOTS = {
  default: 'bg-slate-400 dark:bg-slate-500',
  success: 'bg-success-500 dark:bg-success-400',
  warning: 'bg-warning-500 dark:bg-warning-400',
  danger: 'bg-danger-500 dark:bg-danger-400',
  info: 'bg-primary-500 dark:bg-primary-400',
} as const;

/** Dòng thời gian cho lịch sử xử lý, audit, các lần nộp. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('relative space-y-4 pl-6', className)}>
      <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-border dark:bg-slate-700" />
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute -left-6 top-1 grid h-4 w-4 place-items-center rounded-full ring-4 ring-surface dark:ring-slate-800',
              DOTS[item.tone ?? 'default'],
            )}
          >
            {item.icon}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">{item.title}</p>
            {item.at && (
              <time dateTime={item.at} className="font-mono text-2xs text-ink-muted dark:text-slate-400">
                {formatDateTime(item.at)}
              </time>
            )}
          </div>
          {item.actor && <p className="text-xs text-ink-muted dark:text-slate-400">{item.actor}</p>}
          {item.description && (
            <div className="mt-1 text-sm leading-relaxed text-ink-secondary dark:text-slate-300">
              {item.description}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
