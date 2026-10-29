import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { useChildFormGuard } from '../../hooks/useChildFormGuard';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { cn } from '../../lib/utils';

/** Open modals, newest last — Escape and Tab only act on the top one. */
const modalStack: symbol[] = [];

export function isTopModal(id: symbol) {
  return modalStack[modalStack.length - 1] === id;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(96vw,1400px)]',
} as const;

export interface ModalProps {
  /** Tiêu đề hộp thoại (bắt buộc — dùng cho aria-label). */
  heading: string;
  /** Mô tả ngắn dưới tiêu đề. */
  description?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  /** Có thay đổi chưa lưu: chặn đóng bằng backdrop, hỏi lại khi bấm X/Esc. */
  dirty?: boolean;
  size?: keyof typeof SIZES;
  /** Vùng nút thao tác cố định dưới cùng (Hủy / Lưu…). */
  footer?: React.ReactNode;
  /** Biểu tượng cạnh tiêu đề. */
  icon?: React.ReactNode;
  /** Cho phép bấm nền mờ để đóng khi không có thay đổi (mặc định có). */
  closeOnBackdrop?: boolean;
  className?: string;
}

/**
 * Hộp thoại chuẩn của hệ thống.
 * - Portal lên body, nền mờ, bẫy focus (Tab/Shift+Tab), trả focus khi đóng.
 * - Nhiều lớp chồng nhau: Esc chỉ đóng lớp trên cùng (Child Form & Modal Guard).
 * - Khóa Slide Panel cha qua useChildFormGuard; dirty → useUnsavedChangesGuard + hỏi lại trước khi bỏ.
 */
export function Modal({
  heading,
  description,
  children,
  onClose,
  dirty = false,
  size = 'xl',
  footer,
  icon,
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  const modalId = useRef(Symbol('modal'));
  const section = useRef<HTMLElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const [discard, setDiscard] = useState(false);

  useChildFormGuard(true);
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    const id = modalId.current;
    modalStack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    section.current?.focus();
    return () => {
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      previous?.focus?.();
    };
  }, []);

  const requestClose = () => (dirty ? setDiscard(true) : onClose());

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!isTopModal(modalId.current)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (discard) setDiscard(false);
        else if (dirty) setDiscard(true);
        else onClose();
      }
      if (e.key === 'Tab') {
        const controls = section.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === section.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [dirty, discard, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-bg-overlay dark:bg-bg-overlay p-4 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && closeOnBackdrop && !dirty) onClose();
      }}
    >
      <section
        ref={section}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative flex w-full max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 text-ink dark:text-slate-100 shadow-modal outline-none animate-scale-in',
          SIZES[size],
          className,
        )}
      >
        <header className="flex items-start gap-3 border-b border-border dark:border-slate-700 px-6 pt-5 pb-4 pr-16">
          {icon && <span className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300">{icon}</span>}
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-semibold leading-snug text-ink dark:text-slate-100">
              {heading}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-ink-muted dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
        </header>
        <div className="absolute right-3 top-3 z-30">
          <Tooltip content="Đóng (Esc)" placement="bottom">
            <button
              type="button"
              aria-label="Đóng cửa sổ"
              onClick={requestClose}
              className="rounded-lg p-2 text-ink-muted dark:text-slate-400 hover:bg-subtle dark:hover:bg-slate-700 hover:text-ink dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>

        {discard ? (
          <div className="space-y-4 px-6 py-6">
            <div className="flex items-start gap-3 rounded-xl border border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-slate-900 p-4">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning-600 dark:text-warning-400" />
              <div>
                <p className="font-semibold text-ink dark:text-slate-100">Có thay đổi chưa lưu</p>
                <p className="mt-1 text-sm text-ink-muted dark:text-slate-400">
                  Nếu đóng bây giờ, nội dung vừa nhập sẽ bị mất.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setDiscard(false)}
                className="rounded-xl border border-border dark:border-slate-600 bg-surface dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-ink dark:text-slate-100 hover:bg-subtle dark:hover:bg-slate-700"
              >
                Tiếp tục nhập
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-danger-600 dark:bg-danger-600 px-4 py-2 text-sm font-semibold text-white dark:text-white hover:bg-danger-700 dark:hover:bg-danger-700"
              >
                Bỏ thay đổi và đóng
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border dark:border-slate-700 bg-subtle dark:bg-slate-900 px-6 py-3">
                {footer}
              </footer>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
