import React from 'react';
import { Check } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { cn } from '../../lib/utils';

export interface StepItem {
  id: string;
  label: string;
  /** Dòng phụ: ngày, người xử lý, hạn… */
  caption?: React.ReactNode;
  /** Giải thích bước (căn cứ pháp lý…) hiện trong Tooltip. */
  help?: string;
}

/**
 * Thanh tiến trình theo các bước pháp lý (Tiếp nhận → Kiểm tra hợp lệ → Thẩm định → …).
 * Bước trước `current` = đã xong; `current` = đang làm; `blockedAt` tô đỏ bước bị chặn (trả lại/từ chối).
 */
export function Stepper({
  steps,
  current,
  blockedAt,
  completed = false,
  onSelect,
  className,
}: {
  steps: StepItem[];
  current: string;
  blockedAt?: string;
  /** Mọi bước đã xong (tô xanh cả bước cuối). */
  completed?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const index = completed
    ? steps.length
    : Math.max(
        0,
        steps.findIndex((s) => s.id === current),
      );
  return (
    <ol className={cn('flex w-full items-start', className)} aria-label="Tiến trình xử lý">
      {steps.map((step, i) => {
        const done = i < index;
        const active = i === index;
        const blocked = step.id === blockedAt;
        const marker = (
          <span
            className={cn(
              'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition-colors',
              blocked
                ? 'border-danger-500 dark:border-danger-400 bg-danger-50 dark:bg-danger-900 text-danger-700 dark:text-danger-200'
                : done
                  ? 'border-primary-600 dark:border-primary-400 bg-primary-600 dark:bg-primary-500 text-white dark:text-white'
                  : active
                    ? 'border-primary-600 dark:border-primary-400 bg-surface dark:bg-slate-800 text-primary-700 dark:text-primary-200 ring-4 ring-primary-100 dark:ring-primary-900'
                    : 'border-border dark:border-slate-600 bg-surface dark:bg-slate-800 text-ink-muted dark:text-slate-400',
            )}
          >
            {done && !blocked ? <Check size={15} strokeWidth={3} /> : i + 1}
          </span>
        );
        const content = (
          <>
            {marker}
            <span className="mt-2 block text-center">
              <span
                className={cn(
                  'block text-xs font-semibold leading-tight',
                  active || done ? 'text-ink dark:text-slate-100' : 'text-ink-muted dark:text-slate-400',
                  blocked && 'text-danger-700 dark:text-danger-300',
                )}
              >
                {step.label}
              </span>
              {step.caption && (
                <span className="mt-0.5 block text-2xs text-ink-muted dark:text-slate-400">{step.caption}</span>
              )}
            </span>
          </>
        );
        const inner = onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(step.id)}
            aria-current={active ? 'step' : undefined}
            className="flex flex-col items-center rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {content}
          </button>
        ) : (
          <div aria-current={active ? 'step' : undefined} className="flex flex-col items-center px-1">
            {content}
          </div>
        );
        return (
          <li key={step.id} className="relative flex flex-1 flex-col items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[-50%] right-1/2 top-4 h-0.5',
                  i <= index ? 'bg-primary-500 dark:bg-primary-400' : 'bg-border dark:bg-slate-700',
                )}
              />
            )}
            {step.help ? <Tooltip content={step.help}>{inner}</Tooltip> : inner}
          </li>
        );
      })}
    </ol>
  );
}
