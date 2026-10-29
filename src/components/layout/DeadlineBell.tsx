import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import { NAV_ITEMS, type ProcedureId } from '../../layouts/navigation';
import { urgentTotal, type WorkCounts } from '../../hooks/useWorkCounts';

const ROWS: { key: 'overdue' | 'supplementOverdue' | 'dueSoon'; sla: string; label: string; dot: string }[] = [
  { key: 'overdue', sla: 'overdue', label: 'Quá hạn', dot: 'bg-danger-500 dark:bg-danger-400' },
  {
    key: 'supplementOverdue',
    sla: 'supplement_overdue',
    label: 'Quá hạn bổ sung',
    dot: 'bg-danger-500 dark:bg-danger-400',
  },
  { key: 'dueSoon', sla: 'due_soon', label: 'Sắp đến hạn (≤3 NLV)', dot: 'bg-warning-500 dark:bg-warning-400' },
];

/**
 * Chuông báo hạn trong ứng dụng: số hồ sơ quá hạn / sắp đến hạn theo nghiệp vụ, tính khi mở trang
 * (không gửi email). Bấm một dòng → mở danh sách đã lọc theo hạn (`?sla=`).
 */
export function DeadlineBell({ counts }: { counts: WorkCounts | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const procedures = NAV_ITEMS.filter((i) => i.procedure);
  const total = procedures.reduce((sum, i) => sum + urgentTotal(counts?.[i.procedure as ProcedureId]), 0);
  const overdue = procedures.reduce(
    (sum, i) =>
      sum +
      (counts?.[i.procedure as ProcedureId]?.overdue || 0) +
      (counts?.[i.procedure as ProcedureId]?.supplementOverdue || 0),
    0,
  );

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const label = counts
    ? total
      ? `${total} hồ sơ cần chú ý về hạn xử lý`
      : 'Không có hồ sơ sắp/quá hạn'
    : 'Đang tính hạn xử lý';

  return (
    <div className="relative" ref={ref}>
      <Tooltip content={label} placement="bottom">
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="relative rounded-xl p-2 text-ink-secondary dark:text-slate-300 hover:bg-subtle dark:hover:bg-slate-800 hover:text-ink dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Bell size={18} />
          {total > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full px-1 text-center text-2xs font-black leading-[1.125rem] text-white dark:text-white ring-2 ring-surface dark:ring-slate-900',
                overdue ? 'bg-danger-500 dark:bg-danger-500' : 'bg-warning-500 dark:bg-warning-500',
              )}
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          role="dialog"
          aria-label="Hạn xử lý cần chú ý"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 shadow-dropdown animate-fade-in-down"
        >
          <div className="border-b border-border dark:border-slate-700 px-4 py-3">
            <p className="text-sm font-bold text-ink dark:text-slate-100">Hạn xử lý cần chú ý</p>
            <p className="text-2xs text-ink-muted dark:text-slate-400">
              Theo bảng thời hạn NĐ 217/2026 và NĐ 207/2026 · NLV = ngày làm việc
            </p>
          </div>
          {!counts ? (
            <p className="px-4 py-6 text-center text-xs text-ink-muted dark:text-slate-400">Đang tính…</p>
          ) : total === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-ink-muted dark:text-slate-400">
              Không có hồ sơ quá hạn hoặc sắp đến hạn.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto p-2">
              {procedures.map((item) => {
                const c = counts[item.procedure as ProcedureId];
                if (!urgentTotal(c)) return null;
                const Icon = item.icon;
                return (
                  <li key={item.to} className="py-1">
                    <p className="flex items-center gap-2 px-2 pb-1 text-2xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">
                      <Icon size={13} />
                      {item.shortLabel}
                    </p>
                    {ROWS.filter((r) => c[r.key] > 0).map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate(item.to + '?sla=' + r.sla);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink dark:text-slate-100 hover:bg-subtle dark:hover:bg-slate-700"
                      >
                        <span aria-hidden className={cn('h-2 w-2 rounded-full', r.dot)} />
                        <span className="flex-1">{r.label}</span>
                        <span className="font-mono font-bold tabular-nums">{c[r.key]}</span>
                        <ChevronRight size={14} className="text-ink-muted dark:text-slate-400" />
                      </button>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
