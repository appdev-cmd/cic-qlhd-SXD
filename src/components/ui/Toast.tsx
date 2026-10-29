import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** ms; 0 = giữ đến khi người dùng đóng */
  duration: number;
}

type Listener = () => void;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function push(tone: ToastTone, title: string, options: { description?: string; duration?: number } = {}) {
  const item: ToastItem = {
    id: nextId++,
    tone,
    title,
    description: options.description,
    duration: options.duration ?? (tone === 'error' ? 8000 : 4000),
  };
  items = [...items.slice(-4), item];
  emit();
  return item.id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * Thông báo nổi dùng chung — gọi được cả ngoài React:
 * `toast.success('Đã lưu hồ sơ')`, `toast.error('Không lưu được', { description: message })`.
 */
export const toast = {
  success: (title: string, options?: { description?: string; duration?: number }) => push('success', title, options),
  error: (title: string, options?: { description?: string; duration?: number }) => push('error', title, options),
  warning: (title: string, options?: { description?: string; duration?: number }) => push('warning', title, options),
  info: (title: string, options?: { description?: string; duration?: number }) => push('info', title, options),
  dismiss: dismissToast,
};

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const TONES: Record<ToastTone, { icon: typeof Info; bar: string; iconClass: string }> = {
  success: {
    icon: CheckCircle2,
    bar: 'bg-success-500 dark:bg-success-400',
    iconClass: 'text-success-600 dark:text-success-400',
  },
  error: { icon: XCircle, bar: 'bg-danger-500 dark:bg-danger-400', iconClass: 'text-danger-600 dark:text-danger-400' },
  warning: {
    icon: AlertTriangle,
    bar: 'bg-warning-500 dark:bg-warning-400',
    iconClass: 'text-warning-600 dark:text-warning-400',
  },
  info: { icon: Info, bar: 'bg-info-500 dark:bg-info-400', iconClass: 'text-info-600 dark:text-info-400' },
};

function ToastCard({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!item.duration || paused) return;
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, paused]);
  const tone = TONES[item.tone];
  const Icon = tone.icon;
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 py-3 pl-4 pr-10 shadow-dropdown animate-slide-in-right"
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} />
      <Icon size={18} className={cn('mt-0.5 shrink-0', tone.iconClass)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink dark:text-slate-100">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted dark:text-slate-400">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => dismissToast(item.id)}
        className="absolute right-2 top-2 rounded-md p-1 text-ink-muted dark:text-slate-400 hover:bg-subtle dark:hover:bg-slate-700 hover:text-ink dark:hover:text-slate-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Gắn một lần ở gốc ứng dụng (main.tsx). */
export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  if (!list.length) return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[9500] flex flex-col items-end gap-2"
    >
      {list.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body,
  );
}
