export const DOSSIER_STATUS = {
  RECEIVED: "Đã tiếp nhận",
  REVIEWING: "Đang kiểm tra",
  APPRAISING: "Đang thẩm định",
  PENDING_SIGNATURE: "Chờ ký duyệt",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Từ chối",
  RETURNED: "Yêu cầu bổ sung",
} as const;

export type DossierStatusType = keyof typeof DOSSIER_STATUS;

export const USER_ROLES = {
  SPECIALIST: "Chuyên viên QLXD",
  LEADER: "Lãnh đạo Sở",
  ADMIN: "Quản trị hệ thống",
} as const;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
