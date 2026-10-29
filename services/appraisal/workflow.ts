import config from './data/workflow.json' with { type: 'json' };
import { now, vnToday } from './domain.js';
import type { Actor } from './auth.js';
import type { DeadlineCase, WorkflowData, SlaSnapshot } from './sla.js';
import { policy } from './procedure-policy.js';
import { validateReview, type ProcedureReview } from './procedure-review.js';
import { HttpError } from './errors.js';

export const STATES = config.STATES;
export function state(value: DeadlineCase): string {
  return value.workflow?.state || (value.finalReview?.decision === 'reviewed' ? 'reviewed' : 'received');
}
export function label(value: DeadlineCase, action: string): string {
  return (
    (config.PROCEDURE_LABELS as Record<string, string>)[`${value.procedure || 'bcnckt'}/${action}`] ||
    (config.LABELS as Record<string, string>)[action]
  );
}
export function deriveStatus(value: DeadlineCase): string {
  const decision = value.finalReview?.decision;
  if (decision && ['reviewed', 'request_supplement'].includes(decision)) return decision;
  const current = state(value);
  if (['reviewed', 'rejected', 'stopped', 'suspended'].includes(current)) return current;
  if (current === 'awaiting_supplement') return 'request_supplement';
  if (value.job?.status === 'running' && value.job.mode !== 'ocr') return 'analyzing';
  if (value.runs.length && !value.runs.at(-1)?.stale) return 'analyzed';
  return ['processing', 'site_visit', 'correction', 'pending_review'].includes(current) ? 'processing' : 'intake';
}
function allowed(value: DeadlineCase, key: string, current: string, today: string): boolean {
  const procedure = value.procedure || 'bcnckt';
  const rules = policy(procedure);
  const used = value.workflow?.counters || {};
  if (config.ONLY_INSPECTION.includes(key) && procedure !== 'nghiem_thu') return false;
  if (key === 'request_supplement')
    return (
      !(rules.supplement.max != null && (used[key] || 0) >= rules.supplement.max) &&
      !(rules.supplement.phase === 'intake' && !['received', 'assigned'].includes(current))
    );
  if (key === 'suspend' || key === 'extend') return Boolean(rules[key] && (used[key] || 0) < (rules[key]!.max || 0));
  if (key === 'stop') {
    if (procedure === 'gpxd') return (used.request_supplement || 0) >= 1;
    if (current === 'processing') return false;
    const due = (value.sla as SlaSnapshot | undefined)?.waitingDueDate;
    return Boolean(due && today > due);
  }
  return true;
}
const transitions = config.TRANSITIONS as unknown as Record<string, [string[], string | null, string[]]>;
export function options(value: DeadlineCase, actor: Actor, today = vnToday()) {
  const current = state(value);
  const assigned = value.workflow?.assigneeId;
  if (assigned && assigned !== actor.id && actor.role === 'officer') return [];
  if (value.finalReview || config.TERMINAL.includes(current)) return [];
  return Object.entries(transitions)
    .filter(
      ([key, [sources, _, roles]]) =>
        sources.includes(current) && roles.includes(actor.role) && allowed(value, key, current, today),
    )
    .map(([id]) => ({ id, label: label(value, id) }));
}
export function apply(
  value: DeadlineCase,
  actor: Actor,
  action: string,
  note: string,
  visitDate?: string | null,
  today = vnToday(),
): string {
  if (!options(value, actor, today).some((option) => option.id === action))
    throw new HttpError(409, 'Thao tác không phù hợp trạng thái, số lần cho phép hoặc quyền hiện tại.');
  const workflow: WorkflowData = value.workflow || {};
  if (workflow.assigneeId && workflow.assigneeId !== actor.id && actor.role === 'officer')
    throw new HttpError(403, 'Hồ sơ đã phân công chuyên viên khác.');
  if (['submit_review', 'approve'].includes(action)) {
    if (['gpxd', 'nghiem_thu'].includes(value.procedure || ''))
      validateReview(value.procedureReview as ProcedureReview | undefined);
    if (!value.documents.some((document) => document.role === 'submission'))
      throw new HttpError(422, 'Cần tài liệu đầu vào trước khi trình rà soát.');
    if ((value.procedure || 'bcnckt') === 'bcnckt' && (!value.runs.length || value.runs.at(-1)?.stale))
      throw new HttpError(422, 'Cần kết quả kiểm tra còn hiệu lực trước khi trình rà soát.');
  }
  if (action === 'schedule_visit' && !visitDate) throw new HttpError(422, 'Nhập ngày kiểm tra hiện trường dự kiến.');
  if (action === 'confirm_correction') {
    const review = value.procedureReview as ProcedureReview | undefined;
    if (!review?.defects?.length || review.defects.some((defect) => defect.status !== 'resolved'))
      throw new HttpError(422, 'Cần ghi nhận các tồn tại và xác nhận tài liệu khắc phục trong phiếu chuyên môn.');
  }
  if (action === 'schedule_visit' && visitDate! < value.legalDate)
    throw new HttpError(422, 'Ngày kiểm tra không được trước ngày đánh giá của hồ sơ.');
  const source = state(value);
  const target = transitions[action][1] || source;
  const rules = policy(value.procedure);
  const basis = (
    {
      request_supplement: rules.supplement.basis,
      suspend: rules.suspend?.basis,
      resume: rules.restartBasis,
      extend: rules.extend?.basis,
      stop: rules.supplement.basis,
    } as Record<string, string | undefined>
  )[action];
  const entry = {
    from: source,
    to: target,
    action: label(value, action),
    note,
    actor: actor.name,
    at: now(),
    ...(basis ? { basis } : {}),
  };
  const used = { ...workflow.counters };
  if (['request_supplement', 'suspend', 'extend'].includes(action)) used[action] = (used[action] || 0) + 1;
  value.workflow = { ...workflow, state: target, history: [...(workflow.history || []), entry], counters: used };
  if ((action === 'start' && !workflow.validAt) || action === 'resume') value.workflow.validAt = today;
  if (action === 'extend') value.workflow.extended = true;
  if (visitDate) value.workflow.visitDate = visitDate;
  if (action === 'approve')
    value.finalReview = { decision: 'reviewed', note, actor: actor.name, at: now(), simulation: Boolean(value.sample) };
  return entry.action;
}
