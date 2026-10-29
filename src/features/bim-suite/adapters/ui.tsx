import { Modal as SharedModal } from '@/components/ui/Modal';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Thay các component dùng chung của cic-hud (Modal, ConfirmProvider, EmptyState, ErrorBoundary, TableSkeleton,
// FilterChip, TabNav, Input, Textarea, Select) với cùng tên và props mà mã BIM dùng. Hộp thoại dùng <dialog> gốc nên
// vẫn nằm trong cây có data-theme và nhận đúng biến --theme-* (portal ra <body> sẽ mất màu theo giao diện).
import {
  Component,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, FolderOpen, Inbox, Plus, RefreshCw, Search, X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
const modalWidths: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: string;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Giữ để tương thích với cic-hud; <dialog> luôn nằm trên cùng nên không cần z-index. */
  zIndex?: string;
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  className = '',
}: ModalProps) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [isOpen]);
  if (!isOpen) return null;
  return (
    <SharedModal
      heading={typeof title === 'string' ? title : 'Chi tiết BIM'}
      description={description}
      size={size}
      dirty={dirty}
      onClose={onClose}
      footer={footer}
      className={className}
    >
      <div onInputCapture={() => setDirty(true)}>{children}</div>
    </SharedModal>
  );
}

export type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Xác nhận',
  message,
  confirmText = 'Đồng ý',
  cancelText = 'Hủy',
  variant = 'danger',
  loading = false,
}: ConfirmOptions & { isOpen: boolean; onClose: () => void; onConfirm: () => void; loading?: boolean }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="doc-button" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button
            type="button"
            className={
              variant === 'danger'
                ? 'doc-button border-transparent bg-rose-700 text-white hover:bg-rose-800 dark:bg-rose-700'
                : 'doc-button doc-primary'
            }
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="text-sm text-txt-secondary">{message}</div>
    </Modal>
  );
}

const ConfirmContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(null);

/** Thay window.confirm: `if (!(await confirm('Xóa?'))) return;` */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('ConfirmProvider missing');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback((value: ConfirmOptions | string) => {
    resolver.current?.(false);
    setOptions(typeof value === 'string' ? { message: value } : value);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={options !== null}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        message={options?.message ?? ''}
        title={options?.title}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        variant={options?.variant}
      />
    </ConfirmContext.Provider>
  );
}

const emptyIcons = {
  default: <Inbox size={40} />,
  search: <Search size={40} />,
  error: <AlertTriangle size={40} />,
  folder: <FolderOpen size={40} />,
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  variant = 'default',
  className = '',
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: { label: string; onClick: () => void };
  variant?: keyof typeof emptyIcons;
  className?: string;
  children?: ReactNode;
}) {
  const handler = action?.onClick ?? onAction;
  const label = action?.label ?? actionLabel;
  return (
    <div className={`flex flex-col items-center justify-center px-8 py-14 text-center ${className}`}>
      <div className="mb-5 grid size-16 place-items-center rounded-xl bg-bg-muted text-txt-muted">
        {icon ?? emptyIcons[variant]}
      </div>
      <h3 className="text-base font-semibold text-txt-secondary">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-txt-muted">{description}</p> : null}
      {handler && label ? (
        <button type="button" className="doc-button doc-primary mt-5" onClick={handler}>
          <Plus size={15} />
          {label}
        </button>
      ) : null}
      {children}
    </div>
  );
}

type BoundaryProps = { children: ReactNode; fallback?: ReactNode; onError?: (error: Error, info: ErrorInfo) => void };
export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BIM view failed:', error.message);
    this.props.onError?.(error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" className="rounded-2xl border border-border bg-bg-surface p-8 text-center">
        <AlertTriangle className="mx-auto text-rose-600" size={32} />
        <h2 className="mt-3 text-lg font-semibold">Không mở được nội dung BIM</h2>
        <p className="mt-2 text-sm text-txt-muted">{this.state.error.message || 'Có lỗi không mong muốn.'}</p>
        <button type="button" className="doc-button doc-primary mt-5" onClick={() => this.setState({ error: null })}>
          <RefreshCw size={14} />
          Thử lại
        </button>
      </div>
    );
  }
}

export function TableSkeleton({
  columns = 4,
  rows = 5,
  className = '',
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Đang tải"
      className={`overflow-hidden rounded-xl border border-border-subtle ${className}`}
    >
      {Array.from({ length: rows + 1 }, (_, row) => (
        <div key={row} className={`flex gap-4 border-b border-border-subtle px-4 py-3 ${row ? '' : 'bg-bg-subtle'}`}>
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} className="h-3.5 flex-1 animate-pulse rounded bg-bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

export type FilterChipOption = { value: string; label: string; color?: string; count?: number };
export function FilterChip({
  label,
  value,
  options,
  onChange,
  allValue = 'all',
  className = '',
}: {
  label: string;
  value: string;
  options: FilterChipOption[];
  onChange: (value: string) => void;
  allValue?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: 'left' | 'right';
}) {
  const active = value !== allValue;
  return (
    <label className={`relative inline-flex ${className}`}>
      <span className="sr-only">{label}</span>
      <BimSelect
        className={`doc-input rounded-full py-1.5 pr-7 text-xs ${active ? 'border-[var(--theme-primary)] font-semibold text-[var(--theme-primary)]' : ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.some((o) => o.value === allValue) ? null : <option value={allValue}>{label}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.count === undefined ? '' : ` (${option.count})`}
          </option>
        ))}
      </BimSelect>
    </label>
  );
}

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
};
export function TabNav({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  size = 'md',
}: {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pill' | 'button';
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto border-b border-border ${className}`}>
      {tabs
        .filter((tab) => !tab.hidden)
        .map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} ${activeTab === tab.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-txt-muted hover:border-border hover:text-txt-secondary'}`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
          </button>
        ))}
    </div>
  );
}

type FieldProps = { label?: string; helperText?: string; error?: string };
function Field({ id, label, helperText, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={id} className="block text-xs font-medium text-txt-secondary">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-txt-muted">{helperText}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps>(
  function Input({ label, helperText, error, id, className = '', ...props }, ref) {
    const generated = useId();
    return (
      <Field id={id ?? generated} label={label} helperText={helperText} error={error}>
        <BimInput
          ref={ref}
          id={id ?? generated}
          aria-invalid={error ? true : undefined}
          className={`doc-input w-full ${className}`}
          {...props}
        />
      </Field>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ label, helperText, error, id, className = '', ...props }, ref) {
    const generated = useId();
    return (
      <Field id={id ?? generated} label={label} helperText={helperText} error={error}>
        <textarea
          ref={ref}
          id={id ?? generated}
          aria-invalid={error ? true : undefined}
          className={`doc-input w-full ${className}`}
          {...props}
        />
      </Field>
    );
  },
);

export type SelectOption = { value: string | number; label: string; disabled?: boolean };
/** Chỉ hỗ trợ chọn một giá trị (mã BIM không dùng chọn nhiều). */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Chọn…',
  label,
  helperText,
  error,
  disabled,
  className = '',
}: FieldProps & {
  options: SelectOption[];
  value?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}) {
  const id = useId();
  const byKey = useMemo(() => new Map(options.map((o) => [String(o.value), o.value])), [options]);
  return (
    <Field id={id} label={label} helperText={helperText} error={error}>
      <BimSelect
        id={id}
        className={`doc-input w-full ${className}`}
        value={value === undefined ? '' : String(value)}
        disabled={disabled}
        onChange={(event) => onChange?.(byKey.get(event.target.value) ?? event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </BimSelect>
    </Field>
  );
}
