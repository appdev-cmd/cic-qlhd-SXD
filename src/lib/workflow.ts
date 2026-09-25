/**
 * Định nghĩa quy trình giải quyết hồ sơ (đồng bộ với RPC public.transition_dossier — nơi kiểm tra cuối cùng).
 * Dùng ở giao diện để hiển thị bước hiện tại và các thao tác hợp lệ theo vai trò.
 */
import type { Project, StaffRole, WorkflowState } from '../types/domain';

export type WorkflowAction =
  | 'xac_nhan_hop_le'
  | 'yeu_cau_bo_sung'
  | 'nhan_bo_sung'
  | 'trinh_truong_phong'
  | 'tra_lai_chuyen_vien'
  | 'trinh_lanh_dao'
  | 'tra_lai_truong_phong'
  | 'ky_phat_hanh'
  | 'tra_ho_so'
  | 'gia_han'
  | 'phan_cong';

export interface WorkflowActionDef {
  action: WorkflowAction;
  label: string;
  from: WorkflowState[];
  /** null = giữ nguyên bước hiện tại */
  to: WorkflowState | null;
  roles: StaffRole[];
  requiresNote?: boolean;
  /** Cần tính lại hạn trả kết quả */
  resetsDeadline?: 'restart' | 'extend';
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  citation?: string;
}

export const WORKFLOW_STATE_LABELS: Record<WorkflowState, string> = {
  tiep_nhan: 'Tiếp nhận – kiểm tra hợp lệ',
  yeu_cau_bo_sung: 'Tạm dừng – chờ bổ sung',
  dang_tham_dinh: 'Chuyên viên thẩm định',
  cho_truong_phong: 'Chờ Trưởng phòng duyệt',
  cho_lanh_dao: 'Chờ Lãnh đạo Sở ký',
  da_phat_hanh: 'Đã phát hành kết quả',
  tra_ho_so: 'Đã trả hồ sơ',
};

/** Thứ tự các bước chính để vẽ thanh tiến trình */
export const WORKFLOW_STEPS: WorkflowState[] = ['tiep_nhan', 'dang_tham_dinh', 'cho_truong_phong', 'cho_lanh_dao', 'da_phat_hanh'];

export const WORKFLOW_ACTIONS: WorkflowActionDef[] = [
  {
    action: 'xac_nhan_hop_le',
    label: 'Xác nhận hồ sơ hợp lệ',
    from: ['tiep_nhan'],
    to: 'dang_tham_dinh',
    roles: ['officer', 'head_of_department'],
    resetsDeadline: 'restart',
    tone: 'success',
    citation: 'Điều 36 NĐ 217/2026/NĐ-CP',
  },
  {
    action: 'yeu_cau_bo_sung',
    label: 'Yêu cầu bổ sung (01 lần)',
    from: ['tiep_nhan', 'dang_tham_dinh'],
    to: 'yeu_cau_bo_sung',
    roles: ['officer', 'head_of_department'],
    requiresNote: true,
    tone: 'warning',
    citation: 'Điều 36 NĐ 217/2026/NĐ-CP',
  },
  {
    action: 'nhan_bo_sung',
    label: 'Đã nhận đủ hồ sơ bổ sung',
    from: ['yeu_cau_bo_sung'],
    to: 'dang_tham_dinh',
    roles: ['officer', 'head_of_department'],
    resetsDeadline: 'restart',
    tone: 'success',
  },
  {
    action: 'trinh_truong_phong',
    label: 'Trình Trưởng phòng',
    from: ['dang_tham_dinh'],
    to: 'cho_truong_phong',
    roles: ['officer'],
    tone: 'primary',
  },
  {
    action: 'tra_lai_chuyen_vien',
    label: 'Trả lại chuyên viên',
    from: ['cho_truong_phong'],
    to: 'dang_tham_dinh',
    roles: ['head_of_department'],
    requiresNote: true,
    tone: 'danger',
  },
  {
    action: 'trinh_lanh_dao',
    label: 'Trình Lãnh đạo Sở',
    from: ['cho_truong_phong'],
    to: 'cho_lanh_dao',
    roles: ['head_of_department'],
    tone: 'primary',
  },
  {
    action: 'tra_lai_truong_phong',
    label: 'Trả lại Trưởng phòng',
    from: ['cho_lanh_dao'],
    to: 'cho_truong_phong',
    roles: ['director'],
    requiresNote: true,
    tone: 'danger',
  },
  {
    action: 'ky_phat_hanh',
    label: 'Ký & phát hành kết quả',
    from: ['cho_lanh_dao'],
    to: 'da_phat_hanh',
    roles: ['director'],
    tone: 'success',
    citation: 'Điều 38 NĐ 217/2026/NĐ-CP (Mẫu số 03)',
  },
  {
    action: 'tra_ho_so',
    label: 'Trả hồ sơ',
    from: ['tiep_nhan', 'yeu_cau_bo_sung'],
    to: 'tra_ho_so',
    roles: ['officer', 'head_of_department', 'director'],
    requiresNote: true,
    tone: 'danger',
  },
  {
    action: 'gia_han',
    label: 'Gia hạn thẩm định',
    from: ['dang_tham_dinh', 'cho_truong_phong', 'cho_lanh_dao'],
    to: null,
    roles: ['head_of_department', 'director'],
    requiresNote: true,
    resetsDeadline: 'extend',
    tone: 'neutral',
    citation: 'Điều 37 NĐ 217/2026/NĐ-CP (gia hạn tối đa 01 lần)',
  },
  {
    action: 'phan_cong',
    label: 'Phân công chuyên viên',
    from: ['tiep_nhan', 'yeu_cau_bo_sung', 'dang_tham_dinh', 'cho_truong_phong'],
    to: null,
    roles: ['head_of_department', 'director'],
    tone: 'neutral',
  },
];

/** Các thao tác người dùng hiện tại được phép thực hiện với hồ sơ */
export function availableActions(
  project: Pick<Project, 'workflowState' | 'supplementCount' | 'extensionCount'>,
  role: StaffRole | undefined
): WorkflowActionDef[] {
  const state = project.workflowState ?? 'tiep_nhan';
  return WORKFLOW_ACTIONS.filter((a) => {
    if (!a.from.includes(state)) return false;
    if (role !== 'admin' && (!role || !a.roles.includes(role))) return false;
    if (a.action === 'yeu_cau_bo_sung' && (project.supplementCount ?? 0) >= 1) return false;
    if (a.action === 'gia_han' && (project.extensionCount ?? 0) >= 1) return false;
    return true;
  });
}

/** Trạng thái SLA hiển thị suy ra từ bước quy trình + hạn chót (khớp public.derive_sla_status) */
export function deriveSlaStatus(state: WorkflowState, deadline: string, today: string): Project['slaStatus'] {
  if (state === 'tiep_nhan') return 'tiep_nhan';
  if (state === 'yeu_cau_bo_sung') return 'yeu_cau_bo_sung';
  if (state === 'da_phat_hanh') return 'da_tham_dinh';
  if (state === 'tra_ho_so') return 'tra_ho_so';
  return deadline < today ? 'qua_han' : 'dang_tham_dinh';
}

export function workflowStateFromSla(sla: Project['slaStatus']): WorkflowState {
  if (sla === 'tiep_nhan') return 'tiep_nhan';
  if (sla === 'yeu_cau_bo_sung') return 'yeu_cau_bo_sung';
  if (sla === 'da_tham_dinh') return 'da_phat_hanh';
  if (sla === 'tra_ho_so') return 'tra_ho_so';
  return 'dang_tham_dinh';
}
