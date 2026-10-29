export type BimAccess = {
  organizationId: string;
  projectId: string | null;
  /** Thành viên dự án có quyền cập nhật (tạo, sửa dữ liệu BIM). */
  canWrite: boolean;
  /** Quản lý dự án (thành viên, xóa hẳn mô hình). */
  canManage: boolean;
  /** Quản trị đơn vị. */
  isOrgAdmin: boolean;
};

/** Quy đổi quyền tài nguyên của cic-hud sang vai trò dự án/đơn vị của BuildSIA (định hướng ACC: quyền theo mô-đun). */
export function bimCan(access: BimAccess, resource: string, action: string) {
  if (resource === 'bim') {
    if (action === 'view' || action === 'export') return true;
    if (action === 'create' || action === 'update' || action === 'approve') return access.canWrite;
    if (action === 'delete') return access.canManage || access.isOrgAdmin;
    return false;
  }
  // Mã gốc dùng 'admin_accounts' để nhận diện quản trị: ứng với quản trị đơn vị hoặc quản lý dự án.
  if (resource === 'admin_accounts') return access.isOrgAdmin || access.canManage;
  return false;
}
