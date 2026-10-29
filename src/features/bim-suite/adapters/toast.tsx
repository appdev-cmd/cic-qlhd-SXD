'use client';
// Thay components/ui/Toast của cic-hud (cùng API showToast/addToast), dựng bằng màu --theme-toast của BuildSIA.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
type ToastItem = { id: number; message: string; type: ToastType; title?: string };
type ToastContextValue = {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  addToast: (options: { title?: string; message: string; type?: ToastType }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const icons = { success: CheckCircle, error: AlertCircle, info: Info, warning: AlertTriangle };
const accents: Record<ToastType, string> = {
  success: 'text-emerald-300',
  error: 'text-rose-300',
  info: 'text-sky-300',
  warning: 'text-amber-300',
};

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('ToastProvider missing');
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, number>());
  const remove = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);
  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string) => {
      const id = ++next.current;
      setToasts((current) => [...current.slice(-4), { id, message, type, title }]);
      // Lỗi giữ lâu hơn để kịp đọc.
      timers.current.set(
        id,
        window.setTimeout(() => remove(id), type === 'error' ? 8000 : 4000),
      );
    },
    [remove],
  );
  const addToast = useCallback(
    (options: { title?: string; message: string; type?: ToastType }) =>
      showToast(options.message, options.type ?? 'info', options.title),
    [showToast],
  );
  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const value = useMemo(() => ({ showToast, addToast }), [showToast, addToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[600] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl bg-[var(--theme-toast,#1c3d47)] px-4 py-3 text-sm text-white shadow-lg"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${accents[toast.type]}`} />
              <div className="min-w-0 flex-1">
                {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
                <p className="break-words">{toast.message}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng thông báo"
                className="shrink-0 opacity-70 hover:opacity-100"
                onClick={() => remove(toast.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
