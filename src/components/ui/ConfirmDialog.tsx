import { useSyncExternalStore } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '../../lib/utils';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: thao tác không hoàn tác được (xóa, thu hồi, từ chối…) */
  tone?: 'default' | 'danger';
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Hộp xác nhận trước thao tác quan trọng — trả về Promise<boolean>.
 * `if (await confirm({ title: 'Thu hồi giấy phép?', tone: 'danger' })) …`
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(ok);
}

/** Gắn một lần ở gốc ứng dụng (main.tsx). */
export function ConfirmHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => pending,
  );
  if (!current) return null;
  const danger = current.tone === 'danger';
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <Modal
      heading={current.title}
      onClose={() => settle(false)}
      size="sm"
      icon={<Icon size={20} className={danger ? 'text-danger-600 dark:text-danger-400' : undefined} />}
      footer={
        <>
          <button
            type="button"
            onClick={() => settle(false)}
            className="rounded-xl border border-border dark:border-slate-600 bg-surface dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-ink dark:text-slate-100 hover:bg-subtle dark:hover:bg-slate-700"
          >
            {current.cancelLabel ?? 'Hủy'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold text-white dark:text-white shadow-button',
              danger
                ? 'bg-danger-600 dark:bg-danger-600 hover:bg-danger-700 dark:hover:bg-danger-700'
                : 'bg-primary-600 dark:bg-primary-600 hover:bg-primary-700 dark:hover:bg-primary-700',
            )}
          >
            {current.confirmLabel ?? 'Đồng ý'}
          </button>
        </>
      }
    >
      {current.description ? (
        <p className="text-sm leading-relaxed text-ink-secondary dark:text-slate-300">{current.description}</p>
      ) : (
        <span className="sr-only">Xác nhận thao tác</span>
      )}
    </Modal>
  );
}
