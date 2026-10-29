import React from 'react';
import type { SlaFacts, SlaState, SlaStateId } from '../../types/appraisal';
import { Tooltip } from '../ui/Tooltip';
import { cn, formatDate } from '../../lib/utils';

export const SLA_STATES: Record<SlaStateId, { label: string; className: string; dot: string }> = {
  on_track: {
    label: 'Trong hạn',
    className:
      'bg-success-50 text-success-800 border-success-200 dark:bg-success-900 dark:text-success-100 dark:border-success-700',
    dot: 'bg-success-500 dark:bg-success-400',
  },
  due_soon: {
    label: 'Sắp đến hạn',
    className:
      'bg-warning-50 text-warning-800 border-warning-200 dark:bg-warning-900 dark:text-warning-100 dark:border-warning-700',
    dot: 'bg-warning-500 dark:bg-warning-400',
  },
  overdue: {
    label: 'Quá hạn',
    className:
      'bg-danger-50 text-danger-800 border-danger-200 dark:bg-danger-900 dark:text-danger-100 dark:border-danger-700',
    dot: 'bg-danger-500 dark:bg-danger-400',
  },
  paused: {
    label: 'Tạm dừng chờ bổ sung',
    className:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-900 dark:text-violet-100 dark:border-violet-700',
    dot: 'bg-violet-500 dark:bg-violet-400',
  },
  completed: {
    label: 'Hoàn tất đúng hạn',
    className: 'bg-info-50 text-info-800 border-info-200 dark:bg-info-900 dark:text-info-100 dark:border-info-700',
    dot: 'bg-info-500 dark:bg-info-400',
  },
  completed_late: {
    label: 'Hoàn tất quá hạn',
    className:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-100 dark:border-orange-700',
    dot: 'bg-orange-500 dark:bg-orange-400',
  },
  superseded: {
    label: 'Đã có lần bổ sung',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
  supplement_overdue: {
    label: 'Quá hạn bổ sung',
    className:
      'bg-danger-50 text-danger-800 border-danger-200 dark:bg-danger-900 dark:text-danger-100 dark:border-danger-700',
    dot: 'bg-danger-500 dark:bg-danger-400',
  },
  closed: {
    label: 'Đã dừng / từ chối',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
  unconfigured: {
    label: 'Chưa xác định hạn',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
};

export const SLA_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả hạn xử lý' },
  ...Object.entries(SLA_STATES).map(([value, config]) => ({ value, label: config.label })),
];

function remainingText(sla: SlaState) {
  const days = sla.remainingWorkingDays;
  if (days === null || days === undefined) return '';
  if (days < 0) return `quá ${-days} ngày làm việc`;
  return days === 0 ? 'đến hạn hôm nay' : `còn ${days} ngày làm việc`;
}

/** Nhãn một dòng cho bảng: "Quá 43 NLV", "Còn 3 NLV", "Hạn hôm nay"; trạng thái khác giữ tên đầy đủ. */
export function slaShortLabel(sla: SlaState) {
  const days = sla.remainingWorkingDays;
  const counting = sla.state === 'on_track' || sla.state === 'due_soon' || sla.state === 'overdue';
  if (!counting || days === null || days === undefined) return SLA_STATES[sla.state]?.label ?? '—';
  if (days < 0) return `Quá ${-days} NLV`;
  return days === 0 ? 'Hạn hôm nay' : `Còn ${days} NLV`;
}

/**
 * Nhãn hạn xử lý. Mặc định gọn một dòng (dùng trong bảng); chi tiết nằm trong Tooltip.
 * `variant="full"` hiện đầy đủ "Quá hạn · quá 43 ngày làm việc" (dùng trong panel chi tiết).
 */
export function SlaBadge({
  sla,
  dueDate,
  className,
  variant = 'compact',
}: {
  sla?: SlaState;
  dueDate?: string | null;
  className?: string;
  variant?: 'compact' | 'full';
}) {
  if (!sla) return <span className="text-ink-muted dark:text-ink-muted">—</span>;
  const config = SLA_STATES[sla.state] || SLA_STATES.unconfigured;
  const extra = remainingText(sla);
  const short = slaShortLabel(sla);
  const help = [config.label, extra, dueDate ? 'Hạn: ' + formatDate(dueDate) : 'Chưa có hạn', 'NLV = ngày làm việc']
    .filter(Boolean)
    .join(' · ');
  return (
    <Tooltip content={help}>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold',
          config.className,
          className,
        )}
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dot)} />
        {variant === 'full' ? (
          <>
            {config.label}
            {extra && <span className="font-normal">· {extra}</span>}
          </>
        ) : (
          <>
            <span aria-hidden>{short}</span>
            <span className="sr-only">
              {config.label}
              {extra ? ', ' + extra : ''}
            </span>
          </>
        )}
      </span>
    </Tooltip>
  );
}

export function SlaSummary({ facts, state }: { facts?: SlaFacts; state?: SlaState }) {
  if (!facts)
    return (
      <p className="text-sm text-ink-muted dark:text-ink-muted">
        Hồ sơ chưa được tính hạn xử lý. Hạn sẽ được tính ở lần lưu tiếp theo.
      </p>
    );
  const unit = facts.periodUnit === 'calendar' ? 'ngày' : 'ngày làm việc';
  const rows: [string, React.ReactNode][] = [
    ['Ngày tiếp nhận', formatDate(facts.receivedDate || facts.startDate)],
    [
      'Hạn kiểm tra hồ sơ',
      facts.intakeDueDate ? formatDate(facts.intakeDueDate) : facts.validated ? 'Đã xác nhận hợp lệ' : '—',
    ],
    ['Tính thời hạn từ', formatDate(facts.startDate)],
    [
      'Thời hạn theo quy định',
      facts.periodDays
        ? `${facts.periodDays} ${unit}${facts.extended ? ' (đã gia hạn)' : ''}`
        : facts.missing || 'Chưa xác định',
    ],
    ['Hạn pháp định', formatDate(facts.legalDueDate)],
    ['Hạn nội bộ', formatDate(facts.internalDueDate)],
    ['Hạn chờ bổ sung', facts.waitingDueDate ? formatDate(facts.waitingDueDate) : '—'],
  ];
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Hạn xử lý</span>
        <SlaBadge sla={state} dueDate={facts.dueDate} variant="full" />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-2">
            <dt className="text-ink-muted dark:text-ink-muted">{label}:</dt>
            <dd className="text-ink dark:text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {facts.basis && <p className="text-xs text-ink-muted dark:text-ink-muted">Căn cứ: {facts.basis}.</p>}
      {(facts.policyStatus === 'requires_confirmation' || !facts.calendarConfirmed) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100">
          Bảng thời hạn được trích từ văn bản pháp luật và{' '}
          {facts.calendarConfirmed ? '' : 'lịch nghỉ có ngày chưa xác nhận; '}cần chuyên viên xác nhận trước khi dùng
          làm căn cứ chính thức.
        </p>
      )}
    </div>
  );
}
