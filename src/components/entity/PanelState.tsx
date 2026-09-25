import { AlertTriangle, Loader2 } from 'lucide-react';

export function PanelLoading({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-muted">
      <Loader2 size={16} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function PanelError({ error, notFoundLabel }: { error?: Error | null; notFoundLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-xs text-rose-600 dark:text-rose-400">
      <AlertTriangle size={20} />
      <span className="font-semibold">{error?.message ?? notFoundLabel ?? 'Không tìm thấy dữ liệu'}</span>
    </div>
  );
}
