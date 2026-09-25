import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChildFormGuard } from '../../hooks/useGuards';
import { Tooltip } from './Tooltip';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Không cho đóng bằng backdrop (form đang nhập dở) */
  disableBackdropClose?: boolean;
}

const SIZE_CLASS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Modal chuẩn: khóa Slide Panel cha (useChildFormGuard), Esc / backdrop chỉ đóng chính modal.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  disableBackdropClose,
}: ModalProps) {
  useChildFormGuard(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-xs"
        onClick={() => {
          if (!disableBackdropClose) onClose();
        }}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full rounded-2xl border border-border bg-surface shadow-2xl flex flex-col max-h-[90vh]',
          'dark:border-slate-800 dark:bg-slate-900',
          SIZE_CLASS[size]
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border pr-14 relative">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink truncate">{title}</h3>
            {subtitle && <p className="text-2xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className="absolute top-3 right-3 z-30">
            <Tooltip content="Đóng (Esc)" placement="bottom">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-ink-muted hover:text-red-500 transition-colors"
              >
                <X size={15} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-xs text-ink">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Hủy',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && <AlertTriangle size={16} className="text-amber-500" />}
          {title}
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-xs font-medium text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm',
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary-500 hover:bg-primary-600'
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-xs text-ink-secondary leading-relaxed">{message}</div>
    </Modal>
  );
}
