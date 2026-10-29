// Thay services/auditLogService của cic-hud. BuildSIA chưa có nhật ký thao tác dùng chung cho mọi phân hệ; các thay
// đổi dữ liệu BIM quan trọng (tải, xóa, khôi phục mô hình) đã có dấu thời gian và người thực hiện trong bảng.
// Giữ chữ ký để mã BIM không đổi; khi có bảng nhật ký chung chỉ cần ghi ở đây.
export type AuditEvent = {
  action: string;
  targetEntity: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  oldValues?: unknown;
  newValues?: unknown;
};

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  void event;
}
