import { useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, ListChecks } from 'lucide-react';
import type { Dossier } from '../../types/appraisal';
import { Badge } from '../ui/Badge';
import { EntityLink } from '../ui/EntityLink';
import { Stepper } from '../ui/Stepper';
import { SlaBadge } from './SlaBadge';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import { caseProgress, caseState, preSubmitChecklist } from '../../lib/caseSteps';
import { cn, formatDate } from '../../lib/utils';

const WORKING_STATES = ['received', 'assigned', 'processing', 'site_visit', 'correction'];

/**
 * Đầu hồ sơ dùng chung cho BCNCKT, GPXD, nghiệm thu: định danh, dự án, người phụ trách, hạn xử lý,
 * thanh tiến trình theo bước pháp lý và danh sách việc cần xong trước khi trình rà soát.
 */
export function CaseHeader({ dossier: d, onTitleClick }: { dossier: Dossier; onTitleClick?: () => void }) {
  const progress = caseProgress(d);
  const state = caseState(d);
  const checklist = preSubmitChecklist(d);
  const remaining = checklist.filter((i) => !i.done).length;
  const showChecklist = WORKING_STATES.includes(state) && !d.readOnly;
  const [open, setOpen] = useState(remaining > 0);
  const procedure = PROJECT_PROCEDURES[d.procedure || 'bcnckt'];
  // The single-case API returns SLA facts (`sla.dueDate`); list rows carry `slaDueDate`.
  const due = d.slaDueDate || d.sla?.dueDate || null;
  const round = d.submissionRound ? 'Lần ' + String(d.submissionRound).padStart(2, '0') : null;

  const steps = progress.steps.map((step) => ({
    ...step,
    caption:
      step.id === progress.current && progress.waiting
        ? progress.waiting
        : step.id === 'intake'
          ? formatDate(d.sla?.receivedDate || d.createdAt || d.legalDate)
          : step.id === 'review' && progress.current === 'review' && due
            ? 'Hạn ' + formatDate(due)
            : undefined,
  }));

  return (
    <section
      aria-label="Thông tin hồ sơ"
      className="space-y-5 rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-900 p-5 pr-16 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{procedure.label}</Badge>
            {round && <Badge variant="neutral">{round}</Badge>}
            {d.readOnly && <Badge variant="warning">Chỉ xem — đã có lần bổ sung</Badge>}
            <span className="font-mono text-2xs text-ink-muted dark:text-slate-400">Cập nhật lần {d.revision}</span>
          </div>
          <h2 className="text-xl font-bold leading-snug text-ink dark:text-slate-100">
            {onTitleClick ? (
              <EntityLink type="dossier" id={d.id} name={d.name} onClick={onTitleClick} className="whitespace-normal" />
            ) : (
              d.name
            )}
          </h2>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex min-w-0 gap-1.5">
              <dt className="text-ink-muted dark:text-slate-400">Dự án:</dt>
              <dd className="min-w-0 font-medium text-ink dark:text-slate-100">
                {d.projectId ? (
                  <EntityLink type="project" id={d.projectId} name={d.projectName || 'Dự án'} />
                ) : (
                  'Chưa gắn dự án'
                )}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-muted dark:text-slate-400">Phụ trách:</dt>
              <dd className="font-medium text-ink dark:text-slate-100">{d.assignee || 'Chưa phân công'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-muted dark:text-slate-400">Phòng:</dt>
              <dd className="text-ink dark:text-slate-100">{d.department}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-muted dark:text-slate-400">Ngày đánh giá:</dt>
              <dd className="text-ink dark:text-slate-100">{formatDate(d.legalDate)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <SlaBadge sla={d.slaState} dueDate={due} variant="full" />
          <span className="text-xs text-ink-muted dark:text-slate-400">
            {due ? 'Hạn xử lý ' + formatDate(due) : 'Chưa xác định hạn'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <Stepper
          steps={steps}
          current={progress.current}
          blockedAt={progress.blockedAt}
          completed={progress.completed}
          className="min-w-[36rem]"
        />
      </div>

      {showChecklist && (
        <div className="rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-ink dark:text-slate-100"
          >
            <ListChecks size={16} className="text-primary-600 dark:text-primary-300" />
            <span className="flex-1">Việc cần xong trước khi trình rà soát</span>
            <span
              className={cn(
                'rounded-full px-2 text-2xs font-bold leading-5',
                remaining
                  ? 'bg-warning-100 dark:bg-warning-900 text-warning-800 dark:text-warning-100'
                  : 'bg-success-100 dark:bg-success-900 text-success-800 dark:text-success-100',
              )}
            >
              {checklist.length - remaining}/{checklist.length}
            </span>
            <ChevronDown
              size={15}
              className={cn('text-ink-muted dark:text-slate-400 transition-transform', open && 'rotate-180')}
            />
          </button>
          {open && (
            <ul className="grid gap-1.5 border-t border-border dark:border-slate-700 px-4 py-3 sm:grid-cols-2">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle2 size={16} className="shrink-0 text-success-600 dark:text-success-400" />
                  ) : (
                    <Circle size={16} className="shrink-0 text-ink-muted dark:text-slate-500" />
                  )}
                  <span className={item.done ? 'text-ink-muted dark:text-slate-400' : 'text-ink dark:text-slate-100'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
