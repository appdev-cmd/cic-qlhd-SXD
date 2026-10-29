import { formatNumber, formatDateTime } from '@/lib/utils';
'use client';
// Action log and plan preview of the model assistant (port of cic-hud BimAiActions, without the model metrics line).
import { CheckCircle2, CircleSlash, FileEdit, ListChecks, XCircle } from 'lucide-react';
import type { BimAiAction, BimAiActionStatus } from '../ai/runner';
import type { ViewerPlan } from '../ai/plan';

const STATUS: Record<BimAiActionStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  thanh_cong: { label: 'Đã làm', className: 'text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
  ban_nhap: { label: 'Bản nháp', className: 'text-amber-700 dark:text-amber-300', Icon: FileEdit },
  khong_tim_thay: { label: 'Không tìm thấy', className: 'text-txt-muted', Icon: CircleSlash },
  loi: { label: 'Lỗi', className: 'text-rose-700 dark:text-rose-300', Icon: XCircle },
};

const seconds = (ms: number) => formatNumber((ms / 1000), 1);

/** Executed actions: status, summary, result count, duration and error. */
export function BimAiActionList({ actions, title = 'Thao tác đã chạy' }: { actions: BimAiAction[]; title?: string }) {
  if (!actions.length) return null;
  const ok = actions.filter((a) => a.status === 'thanh_cong').length;
  return (
    <details open className="rounded-xl border border-border p-2 text-2xs dark:border-slate-600">
      <summary className="cursor-pointer font-semibold text-txt-secondary dark:text-slate-200">
        <ListChecks size={12} className="mr-1 inline" aria-hidden />
        {title} · {ok}/{actions.length} thành công
      </summary>
      <ol className="mt-2 space-y-1">
        {actions.map((action) => {
          const status = STATUS[action.status];
          return (
            <li key={action.id} className="flex items-start gap-1.5">
              <status.Icon size={12} className={`mt-0.5 shrink-0 ${status.className}`} aria-hidden />
              <span className="min-w-0">
                <span className={`font-semibold ${status.className}`}>{status.label}</span>{' '}
                <span className="text-txt-primary dark:text-slate-200">{action.summary}</span>
                <span className="text-txt-muted">
                  {action.found !== undefined ? ` · ${formatNumber(action.found, 2)} cấu kiện` : ''}
                  {` · ${seconds(action.durationMs)} giây`}
                </span>
                {action.error ? (
                  <span className="block text-rose-700 dark:text-rose-300">{action.error}</span>
                ) : action.note ? (
                  <span className="block text-txt-muted">{action.note}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/** Several view-changing steps: the user approves them before they run. */
export function BimAiPlanPreview({
  plan,
  onApprove,
  onReject,
}: {
  plan: ViewerPlan;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section
      role="dialog"
      aria-label="Duyệt các thao tác khung nhìn"
      className="space-y-2 rounded-xl border border-primary-200 bg-primary-50 p-3 text-xs dark:border-primary-800 dark:bg-primary-950"
    >
      <b className="text-primary-900 dark:text-primary-100">Lệnh gồm {plan.steps.length} thao tác trên khung nhìn</b>
      <ol className="list-decimal space-y-0.5 pl-4 text-txt-secondary dark:text-slate-200">
        {plan.steps.map((step, index) => (
          <li key={`${step.tool}-${index}`}>{step.summary}</li>
        ))}
      </ol>
      <p className="text-2xs text-txt-muted">Các bước chạy tuần tự; có thể hoàn tác từng bước sau khi thực hiện.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onApprove} className="doc-button doc-primary py-1">
          Thực hiện
        </button>
        <button type="button" onClick={onReject} className="doc-button py-1">
          Không thực hiện
        </button>
      </div>
    </section>
  );
}
