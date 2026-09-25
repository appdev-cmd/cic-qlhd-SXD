import { useMemo, useState } from 'react';
import { Check, Clock, GitBranch, Loader2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { NumberInput } from '../../components/ui/NumberInput';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useHolidays, useStaff, useTransitionDossier, useTransitions } from '../../hooks/useData';
import { useCurrentUser, ROLE_LABELS } from '../../context/CurrentUserContext';
import {
  availableActions,
  WORKFLOW_STATE_LABELS,
  WORKFLOW_STEPS,
  type WorkflowActionDef,
} from '../../lib/workflow';
import { addWorkingDays, buildHolidaySet, computeDeadline, evaluateSla, todayIso } from '../../lib/sla';
import { stageToProcedureType } from '../../lib/projectClassification';
import { cn, formatDate, formatDateTime } from '../../lib/utils';
import type { Project } from '../../types/domain';

const TONE_CLASS: Record<WorkflowActionDef['tone'], string> = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
  danger: 'border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950',
  neutral: 'border border-border text-ink hover:bg-subtle dark:border-slate-700 dark:hover:bg-slate-800',
};

const SLA_LEVEL_CLASS = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950 dark:border-emerald-800',
  warning: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800',
  urgent: 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950 dark:border-orange-800',
  overdue: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950 dark:border-rose-800',
  done: 'text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700',
  paused: 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950 dark:border-purple-800',
} as const;

export function DossierWorkflowBar({ project, onChanged }: { project: Project; onChanged: (p: Project) => void }) {
  const { currentUser } = useCurrentUser();
  const { data: holidays = [] } = useHolidays();
  const { data: staff = [] } = useStaff();
  const transition = useTransitionDossier();
  const [pending, setPending] = useState<WorkflowActionDef | null>(null);
  const [note, setNote] = useState('');
  const [extensionDays, setExtensionDays] = useState(5);
  const [assigneeId, setAssigneeId] = useState('');

  const holidaySet = useMemo(() => buildHolidaySet(holidays), [holidays]);
  const state = project.workflowState ?? 'tiep_nhan';
  const sla = evaluateSla(project, holidaySet);
  const actions = availableActions(project, currentUser?.role);
  const currentStepIndex = WORKFLOW_STEPS.indexOf(state === 'yeu_cau_bo_sung' ? 'tiep_nhan' : state);

  const computeNewDeadline = (def: WorkflowActionDef): string | undefined => {
    if (def.resetsDeadline === 'restart') {
      return computeDeadline({
        receivedDate: todayIso(),
        procedureType: project.procedureType ?? stageToProcedureType(project.stage),
        projectGroup: project.projectGroup,
        buildingGrade: project.buildingGrade,
        holidays: holidaySet,
      }).deadline;
    }
    if (def.resetsDeadline === 'extend') return addWorkingDays(project.deadlineDate, extensionDays, holidaySet);
    return undefined;
  };

  const startAction = (def: WorkflowActionDef) => {
    setNote('');
    setAssigneeId(project.assigneeStaffId ?? '');
    transition.reset();
    setPending(def);
  };

  const confirm = async () => {
    if (!pending) return;
    const updated = await transition.mutateAsync({
      project,
      action: pending.action,
      options: {
        note: note.trim() || undefined,
        deadline: computeNewDeadline(pending),
        assigneeStaffId: pending.action === 'phan_cong' ? assigneeId : undefined,
        actorRole: currentUser?.role,
        actorName: currentUser?.fullName,
      },
    });
    setPending(null);
    onChanged(updated);
  };

  const newDeadline = pending ? computeNewDeadline(pending) : undefined;
  const noteMissing = Boolean(pending?.requiresNote && !note.trim());
  const assigneeMissing = pending?.action === 'phan_cong' && !assigneeId;

  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-ink text-xs flex items-center gap-1.5">
          <GitBranch size={14} className="text-primary-600 dark:text-primary-400" />
          Quy trình giải quyết: <span className="text-primary-600 dark:text-primary-400">{WORKFLOW_STATE_LABELS[state]}</span>
        </h4>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-2xs font-semibold', SLA_LEVEL_CLASS[sla.level])}>
          <Clock size={11} />
          {sla.label} • Hạn {formatDate(project.deadlineDate)}
        </span>
      </div>

      {/* Thanh tiến trình các bước */}
      <ol className="flex items-center gap-1 overflow-x-auto">
        {WORKFLOW_STEPS.map((step, i) => {
          const done = state === 'da_phat_hanh' || i < currentStepIndex;
          const active = i === currentStepIndex && state !== 'da_phat_hanh' && state !== 'tra_ho_so';
          return (
            <li key={step} className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-3xs font-semibold border',
                  done && 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300',
                  active && 'bg-primary-500 border-primary-500 text-white',
                  !done && !active && 'bg-subtle border-border text-ink-muted dark:bg-slate-800 dark:border-slate-700'
                )}
              >
                {done && <Check size={10} />}
                {WORKFLOW_STATE_LABELS[step]}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && <span className="w-3 h-px bg-border dark:bg-slate-700" />}
            </li>
          );
        })}
      </ol>
      {state === 'yeu_cau_bo_sung' && (
        <p className="text-2xs text-purple-700 dark:text-purple-300">
          Hồ sơ đang tạm dừng chờ chủ đầu tư bổ sung (tối đa {20} ngày làm việc). Thời hạn thẩm định được tính lại khi nhận đủ hồ sơ.
        </p>
      )}

      {/* Thao tác theo vai trò */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border dark:border-slate-800">
        <span className="text-3xs text-ink-muted">
          Bạn đang thao tác với vai trò <strong>{currentUser ? ROLE_LABELS[currentUser.role] : '—'}</strong>:
        </span>
        {actions.length === 0 ? (
          <span className="text-3xs italic text-ink-muted">Không có thao tác nào ở bước này cho vai trò của bạn.</span>
        ) : (
          actions.map((a) => (
            <button
              key={a.action}
              type="button"
              onClick={() => startAction(a)}
              className={cn('px-2.5 py-1 rounded-lg text-2xs font-semibold shadow-xs transition-colors', TONE_CLASS[a.tone])}
            >
              {a.label}
            </button>
          ))
        )}
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.label ?? ''}
        subtitle={pending?.citation ? `Căn cứ: ${pending.citation}` : undefined}
        size="sm"
        disableBackdropClose={Boolean(note)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-xs text-ink dark:border-slate-700 dark:bg-slate-900"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={transition.isPending || noteMissing || assigneeMissing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {transition.isPending && <Loader2 size={13} className="animate-spin" />}
              Xác nhận
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-ink-secondary">
            Hồ sơ <strong className="text-ink">{project.code}</strong>
            {pending?.to && (
              <>
                {' '}
                sẽ chuyển sang bước <strong className="text-ink">{WORKFLOW_STATE_LABELS[pending.to]}</strong>.
              </>
            )}
          </p>
          {pending?.action === 'gia_han' && (
            <label className="block space-y-1">
              <span className="text-2xs font-semibold text-ink-secondary">Số ngày làm việc gia hạn</span>
              <NumberInput value={extensionDays} onChange={(v) => setExtensionDays(Math.max(1, Math.min(30, v)))} suffix="ngày" />
            </label>
          )}
          {pending?.action === 'phan_cong' && (
            <label className="block space-y-1">
              <span className="text-2xs font-semibold text-ink-secondary">Chuyên viên thụ lý</span>
              <SearchableSelect
                value={assigneeId}
                onChange={setAssigneeId}
                placeholder="Chọn chuyên viên"
                options={staff.filter((s) => s.role === 'officer').map((s) => ({ value: s.id, label: s.fullName, sublabel: s.department }))}
              />
            </label>
          )}
          {newDeadline && (
            <p className="text-2xs text-ink-secondary">
              Hạn trả kết quả mới: <strong className="text-ink">{formatDate(newDeadline)}</strong> (tính theo ngày làm việc)
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-2xs font-semibold text-ink-secondary">
              {pending?.requiresNote ? 'Lý do / nội dung (bắt buộc)' : 'Ghi chú (không bắt buộc)'}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-xs text-ink outline-none focus:border-primary-500 dark:bg-slate-900 dark:border-slate-700"
              placeholder={pending?.action === 'yeu_cau_bo_sung' ? 'Liệt kê đầy đủ các nội dung cần bổ sung (chỉ được yêu cầu 01 lần)...' : ''}
            />
          </label>
          {transition.error && <p className="text-2xs text-rose-600 dark:text-rose-400">{(transition.error as Error).message}</p>}
        </div>
      </Modal>
    </div>
  );
}

export function WorkflowHistory({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useTransitions(projectId);
  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-2 dark:border-slate-800 dark:bg-slate-900">
      <h4 className="font-bold text-ink text-xs flex items-center gap-1.5">
        <GitBranch size={14} className="text-primary-600 dark:text-primary-400" /> Lịch sử xử lý hồ sơ ({data.length})
      </h4>
      {isLoading ? (
        <p className="text-2xs text-ink-muted">Đang tải...</p>
      ) : data.length === 0 ? (
        <p className="text-2xs text-ink-muted italic">Chưa có bước xử lý nào được ghi nhận trên hệ thống.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((t) => (
            <li key={t.id} className="text-2xs text-ink-secondary border-l-2 border-primary-300 pl-2 dark:border-primary-800">
              <span className="font-mono text-ink-muted">{formatDateTime(t.createdAt)}</span> —{' '}
              <strong className="text-ink">{t.actorName}</strong>
              {t.actorTitle && <span className="text-ink-muted"> ({t.actorTitle})</span>}:{' '}
              {WORKFLOW_STATE_LABELS[t.fromState]} → <strong className="text-ink">{WORKFLOW_STATE_LABELS[t.toState]}</strong>
              {t.note && <p className="text-ink-muted italic">“{t.note}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
