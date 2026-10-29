import React, { useId, useRef } from 'react';
import { cn } from '../../lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Số đếm hiển thị cạnh nhãn (ví dụ số hồ sơ). */
  count?: number;
  disabled?: boolean;
}

/**
 * Thanh tab chuẩn: role="tablist", phím ←/→/Home/End chuyển tab, aria-selected.
 * Nội dung tab do trang tự render — dùng `tabPanelProps(id)` để gắn aria cho vùng nội dung.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = items.filter((t) => !t.disabled);

  const move = (delta: number | 'first' | 'last') => {
    const i = enabled.findIndex((t) => t.id === value);
    const next =
      delta === 'first'
        ? enabled[0]
        : delta === 'last'
          ? enabled[enabled.length - 1]
          : enabled[(i + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center gap-1 overflow-x-auto',
        variant === 'underline' && 'border-b border-border dark:border-slate-700',
        variant === 'pills' && 'rounded-xl bg-muted dark:bg-slate-800 p-1',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') move(1);
        else if (e.key === 'ArrowLeft') move(-1);
        else if (e.key === 'Home') move('first');
        else if (e.key === 'End') move('last');
        else return;
        e.preventDefault();
      }}
    >
      {items.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40 disabled:cursor-not-allowed',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              variant === 'underline' &&
                (selected
                  ? '-mb-px border-b-2 border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-300'
                  : '-mb-px border-b-2 border-transparent dark:border-transparent text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-100'),
              variant === 'pills' &&
                (selected
                  ? 'rounded-lg bg-surface dark:bg-slate-700 text-ink dark:text-slate-100 shadow-xs'
                  : 'rounded-lg text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-100'),
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1.5 text-center text-2xs font-bold leading-5',
                  selected
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-200'
                    : 'bg-muted dark:bg-slate-700 text-ink-muted dark:text-slate-300',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
