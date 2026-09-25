/**
 * Thao tác ghi hồ sơ: tiếp nhận mới, chuyển bước quy trình, lịch sử chuyển bước.
 * Chế độ live: RPC `transition_dossier` kiểm tra trạng thái & vai trò tại DB.
 * Chế độ demo: áp dụng cùng quy tắc trong bộ nhớ (src/lib/workflow.ts).
 */
import type { InvestmentForm, ProcedureType, Project, WorkflowState } from '../types/domain';
import { isDemoMode } from '../lib/dataMode';
import { requireSupabase } from '../lib/supabase';
import { availableActions, deriveSlaStatus, WORKFLOW_ACTIONS, type WorkflowAction } from '../lib/workflow';
import { todayIso } from '../lib/sla';
import { stageToProcedureType } from '../lib/projectClassification';
import { loadDemo } from './demoSource';
import { recordDemoAudit } from './auditLogs';
import { mapProject, PROJECT_LIST_COLUMNS, type ProjectRow } from './rows';
import { DataAccessError, unwrap } from './query';

export interface DossierIntakeInput {
  name: string;
  investorId: string;
  investorName: string;
  investmentForm: InvestmentForm;
  procedureType: ProcedureType;
  projectGroup: Project['projectGroup'];
  buildingGrade: Project['buildingGrade'];
  field: string;
  location: string;
  totalInvestment: number;
  submissionDate: string;
  deadlineDate: string;
  assigneeStaffId?: string;
  assigneeName?: string;
  department: string;
  isAppendixIV: boolean;
  decidedByCommune: boolean;
  submittedDocuments: string[];
  lat?: number;
  lng?: number;
}

const PROCEDURE_STAGE: Record<ProcedureType, Project['stage']> = {
  tham_dinh_bcnckt: 'bcnckt',
  cap_gpxd: 'gpxd',
  kiem_tra_nghiem_thu: 'nghiem_thu',
};

function nextCode(existingCodes: string[], year: number): string {
  const prefix = `DA-${year}-DB-`;
  const max = existingCodes
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number(c.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((m, n) => Math.max(m, n), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function createDossier(input: DossierIntakeInput): Promise<Project> {
  const year = Number(input.submissionDate.slice(0, 4));

  if (isDemoMode) {
    const demo = await loadDemo();
    const project: Project = {
      id: `proj-${Date.now()}`,
      code: nextCode(demo.projects.map((p) => p.code), year),
      name: input.name,
      images: [],
      investorId: input.investorId,
      investorName: input.investorName,
      location: input.location,
      projectGroup: input.projectGroup,
      buildingGrade: input.buildingGrade,
      totalInvestment: input.totalInvestment,
      stage: PROCEDURE_STAGE[input.procedureType],
      slaStatus: 'tiep_nhan',
      submissionDate: input.submissionDate,
      deadlineDate: input.deadlineDate,
      assignee: input.assigneeName ?? '',
      assigneeStaffId: input.assigneeStaffId,
      department: input.department,
      planningCompliance: true,
      standardCompliance: true,
      fireSafetyStatus: 'cho_y_kien_ca',
      estimatedSavings: 0,
      contractors: [],
      investmentForm: input.investmentForm,
      field: input.field,
      procedureType: input.procedureType,
      workflowState: 'tiep_nhan',
      supplementCount: 0,
      extensionCount: 0,
      isAppendixIV: input.isAppendixIV,
      decidedByCommune: input.decidedByCommune,
      submittedDocuments: input.submittedDocuments,
      lat: input.lat,
      lng: input.lng,
    };
    demo.projects.unshift(project);
    recordDemoAudit({
      tableName: 'projects',
      recordId: project.id,
      action: 'insert',
      oldData: null,
      newData: { title: project.name, code: project.code },
      changedFields: [],
      actorId: 'demo',
      actorName: 'Người dùng demo',
    });
    return project;
  }

  const sb = requireSupabase();
  const { data: lastCodes } = await sb
    .from('projects')
    .select('code')
    .like('code', `DA-${year}-DB-%`)
    .order('code', { ascending: false })
    .limit(1);

  const row = {
    code: nextCode((lastCodes ?? []).map((r: { code: string }) => r.code), year),
    title: input.name,
    field: input.field,
    investment_form: input.investmentForm,
    group_type: input.projectGroup,
    grade: input.buildingGrade,
    investment_cost: input.totalInvestment,
    investor_id: input.investorId || null,
    investor_name: input.investorName,
    procedure_type: input.procedureType,
    stage: PROCEDURE_STAGE[input.procedureType],
    status: 'tiep_nhan',
    sla_status: 'tiep_nhan',
    workflow_state: 'tiep_nhan',
    submission_date: input.submissionDate,
    deadline: input.deadlineDate,
    location_district: input.location,
    department: input.department,
    lead_reviewer_staff_id: input.assigneeStaffId ?? null,
    lead_reviewer_name: input.assigneeName ?? null,
    fire_safety_status: 'cho_y_kien_ca',
    is_appendix_iv: input.isAppendixIV,
    decided_by_commune: input.decidedByCommune,
    submitted_documents: input.submittedDocuments,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  };

  const result = await sb.from('projects').insert(row).select(PROJECT_LIST_COLUMNS).single();
  return mapProject(unwrap(result, 'Không lưu được hồ sơ tiếp nhận') as unknown as ProjectRow);
}

export interface TransitionOptions {
  note?: string;
  deadline?: string;
  assigneeStaffId?: string;
  /** Dùng ở chế độ demo để kiểm tra vai trò */
  actorRole?: import('../types/domain').StaffRole;
  actorName?: string;
}

export async function transitionDossier(project: Project, action: WorkflowAction, opts: TransitionOptions = {}): Promise<Project> {
  if (isDemoMode) {
    const def = WORKFLOW_ACTIONS.find((a) => a.action === action);
    const allowed = availableActions(project, opts.actorRole).some((a) => a.action === action);
    if (!def || !allowed) throw new DataAccessError('Vai trò hoặc bước hiện tại không cho phép thao tác này');
    if (def.requiresNote && !opts.note?.trim()) throw new DataAccessError('Vui lòng nhập lý do / nội dung');

    const demo = await loadDemo();
    const target = demo.projects.find((p) => p.id === project.id);
    if (!target) throw new DataAccessError('Không tìm thấy hồ sơ');
    const from = (target.workflowState ?? 'tiep_nhan') as WorkflowState;
    const to = def.to ?? from;
    const before = { ...target };

    target.workflowState = to;
    if (opts.deadline) target.deadlineDate = opts.deadline;
    if (action === 'xac_nhan_hop_le' || action === 'nhan_bo_sung') target.receivedDate = todayIso();
    if (action === 'yeu_cau_bo_sung') target.supplementCount = (target.supplementCount ?? 0) + 1;
    if (action === 'gia_han') target.extensionCount = (target.extensionCount ?? 0) + 1;
    target.slaStatus = deriveSlaStatus(to, target.deadlineDate, todayIso());

    demoTransitions.unshift({
      id: demoTransitions.length + 1,
      projectId: project.id,
      action,
      fromState: from,
      toState: to,
      note: opts.note,
      actorName: opts.actorName ?? 'Người dùng demo',
      createdAt: new Date().toISOString(),
    });
    recordDemoAudit({
      tableName: 'projects',
      recordId: project.id,
      action: 'update',
      oldData: { sla_status: before.slaStatus, deadline: before.deadlineDate },
      newData: { sla_status: target.slaStatus, deadline: target.deadlineDate },
      changedFields: ['sla_status', ...(opts.deadline ? ['deadline'] : [])],
      actorId: 'demo',
      actorName: opts.actorName ?? 'Người dùng demo',
    });
    return { ...target };
  }

  const result = await requireSupabase().rpc('transition_dossier', {
    p_project_id: project.id,
    p_action: action,
    p_note: opts.note ?? null,
    p_deadline: opts.deadline ?? null,
    p_assignee_staff_id: opts.assigneeStaffId ?? null,
  });
  if (result.error) throw new DataAccessError(result.error.message, result.error);
  const updated = await requireSupabase().from('projects').select(PROJECT_LIST_COLUMNS).eq('id', project.id).single();
  return mapProject(unwrap(updated, 'Không tải lại được hồ sơ') as unknown as ProjectRow);
}

export interface WorkflowTransition {
  id: number;
  projectId: string;
  action: WorkflowAction;
  fromState: WorkflowState;
  toState: WorkflowState;
  note?: string;
  actorName: string;
  actorTitle?: string;
  createdAt: string;
}

const demoTransitions: WorkflowTransition[] = [];

export async function listTransitions(projectId: string): Promise<WorkflowTransition[]> {
  if (isDemoMode) return demoTransitions.filter((t) => t.projectId === projectId);
  const result = await requireSupabase()
    .from('workflow_transitions_resolved')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = unwrap(result, 'Không tải được lịch sử xử lý') as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    projectId: String(r.project_id),
    action: r.action as WorkflowAction,
    fromState: r.from_state as WorkflowState,
    toState: r.to_state as WorkflowState,
    note: (r.note as string) ?? undefined,
    actorName: String(r.actor_name),
    actorTitle: (r.actor_title as string) ?? undefined,
    createdAt: String(r.created_at),
  }));
}

/** Cập nhật trạng thái SLA theo ngày hiện tại (chạy khi mở ứng dụng ở chế độ live). */
export async function refreshSlaStatus(): Promise<void> {
  if (isDemoMode) {
    const demo = await loadDemo();
    const today = todayIso();
    for (const p of demo.projects) {
      p.procedureType ??= stageToProcedureType(p.stage);
      p.slaStatus = deriveSlaStatus(p.workflowState ?? 'tiep_nhan', p.deadlineDate, today);
    }
    return;
  }
  await requireSupabase().rpc('refresh_sla_status');
}
