import React from 'react';
import type { SlaFacts, SlaState, SlaStateId } from '../../types/appraisal';
import { Tooltip } from '../ui/Tooltip';
import { cn, formatDate } from '../../lib/utils';

export const SLA_STATES: Record<SlaStateId, { label: string; className: string }> = {
  on_track: {
    label: 'Trong hạn',
    className:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-100 dark:border-emerald-700',
  },
  due_soon: {
    label: 'Sắp đến hạn',
    className:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-700',
  },
  overdue: {
    label: 'Quá hạn',
    className: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900 dark:text-rose-100 dark:border-rose-700',
  },
  paused: {
    label: 'Tạm dừng chờ bổ sung',
    className:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-900 dark:text-violet-100 dark:border-violet-700',
  },
  completed: {
    label: 'Hoàn tất đúng hạn',
    className: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-700',
  },
  completed_late: {
    label: 'Hoàn tất quá hạn',
    className:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-100 dark:border-orange-700',
  },
  superseded: {
    label: 'Đã có lần bổ sung',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  },
  supplement_overdue: {
    label: 'Quá hạn bổ sung',
    className: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900 dark:text-rose-100 dark:border-rose-700',
  },
  closed: {
    label: 'Đã dừng / từ chối',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  },
  unconfigured: {
    label: 'Chưa xác định hạn',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
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

export function SlaBadge({ sla, dueDate, className }: { sla?: SlaState; dueDate?: string | null; className?: string }) {
  if (!sla) return <span className="text-ink-muted dark:text-ink-muted">—</span>;
  const config = SLA_STATES[sla.state] || SLA_STATES.unconfigured;
  const extra = remainingText(sla);
  return (
    <Tooltip content={[dueDate ? 'Hạn: ' + formatDate(dueDate) : 'Chưa có hạn', extra].filter(Boolean).join(' · ')}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
          config.className,
          className,
        )}
      >
        {config.label}
        {extra && <span className="font-normal">· {extra}</span>}
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
        <SlaBadge sla={state} dueDate={facts.dueDate} />
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
