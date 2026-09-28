/** Domain types for projects and supporting catalogs (shared by UI and seed scripts). */

export interface ProjectImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  category: 'phoi_canh' | 'hien_trang' | 'ban_ve' | 'tien_do';
  categoryLabel: string;
  date: string;
  author: string;
  description?: string;
  isPrimary?: boolean;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  coverImage?: string;
  images?: ProjectImage[];
  investorId: string;
  investorName: string;
  location: string;
  projectGroup: 'A' | 'B' | 'C' | 'QG';
  buildingGrade: 'I' | 'II' | 'III' | 'IV' | 'DB';
  totalInvestment: number; // VNĐ
  stage: 'bcnckt' | 'gpxd' | 'nghiem_thu' | 'hoan_thanh';
  slaStatus: 'tiep_nhan' | 'dang_tham_dinh' | 'yeu_cau_bo_sung' | 'da_tham_dinh' | 'qua_han';
  submissionDate: string;
  deadlineDate: string;
  assignee: string; // Chuyên viên thụ lý
  department: string;
  // Chi tiết thẩm định
  planningCompliance: boolean;
  standardCompliance: boolean;
  fireSafetyStatus: 'dat' | 'can_bo_sung' | 'cho_y_kien_ca';
  estimatedSavings: number; // Tiền cắt giảm qua thẩm định
  contractors: {
    role: string;
    orgId: string;
    orgName: string;
    leadPersonnelId: string;
    leadPersonnelName: string;
  }[];
}

export interface ProjectMemberTT39 {
  id: string;
  fullName: string;
  idCard: string; // CCCD / Số định danh cá nhân theo TT39 mục 20
  role: string; // Vai trò dự án: Chủ nhiệm thiết kế, Chủ trì kết cấu, Chủ trì MEP, Chủ nhiệm thẩm tra...
  position: string; // Chức vụ: Giám đốc, Trưởng phòng Kỹ thuật, Kỹ sư chính...
  orgName: string; // Tên đơn vị
  orgRole: string; // Vai trò đơn vị: Chủ đầu tư, Tư vấn thiết kế, Tư vấn thẩm tra, Nhà thầu khảo sát...
  certNumber: string; // Số CCHN
  certGrade: 'I' | 'II' | 'III';
  certIssuer: string;
  certExpiry: string;
  status: 'hieu_luc' | 'sap_het_han' | 'het_han';
  specialties: string[];
}

export interface ProjectParticipantOrgTT39 {
  id: string;
  name: string;
  role: string;
  taxCode: string; // Mã số thuế / Mã số doanh nghiệp / Mã quan hệ NSNN
  address: string;
  representative: string;
  certNumber?: string;
  certGrade?: 'I' | 'II' | 'III';
  memberCount: number;
}

export interface ProjectLegalDocTT39 {
  category: string;
  docNumber: string;
  docDate: string;
  issuer: string;
  description: string;
  status: 'da_xac_thuc' | 'can_bo_sung' | 'cho_doi_soat';
}

export interface ProjectTT39Data {
  nationalProjectId: string; // Mã định danh CSDL Quốc gia
  investmentCode: string; // Mã số DA đầu tư theo Luật Đầu tư
  budgetRelationCode: string; // Mã số đơn vị có quan hệ ngân sách
  decisionMaker: string; // Người quyết định đầu tư
  preparedBy: string; // Cơ quan chuẩn bị dự án
  province: string;
  district: string;
  commune: string;
  detailedAddress: string;
  landLot: string;
  coordinates: string;
  routeInfo?: string;
  projectGroup: 'A' | 'B' | 'C' | 'QG';
  projectType: string;
  facilityType: string;
  facilityGrade: string;
  objective: string;
  landArea: number;
  constructionArea: number;
  grossFloorArea: number;
  buildingDensity: number;
  plotRatio: number;
  floorCount: string;
  buildingHeight: number;
  capacity: string;
  totalInvestment: number;
  appraisalItemCost: number;
  fundingSource: string;
  costBreakdown: {
    construction: number;
    equipment: number;
    management: number;
    consulting: number;
    others: number;
    contingency: number;
  };
  executionPeriod: string;
  startDate: string;
  completionDate: string;
  phases: string;
  standards: { code: string; name: string }[];
  legalDocs: ProjectLegalDocTT39[];
  participants: ProjectParticipantOrgTT39[];
  members: ProjectMemberTT39[];
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  type: 'investor' | 'consultant_design' | 'consultant_audit' | 'contractor' | 'supervisor';
  taxCode: string;
  address: string;
  representative: string;
  phone: string;
  certificateNumber?: string;
  certificateGrade?: 'I' | 'II' | 'III';
  certificateExpiry?: string;
  activeProjectsCount: number;
  status: 'hieu_luc' | 'sap_het_han' | 'het_han';
}

export interface Personnel {
  id: string;
  code: string;
  fullName: string;
  idCard: string;
  phone: string;
  email: string;
  orgId: string;
  orgName: string;
  specialties: string[];
  certNumber: string;
  certGrade: 'I' | 'II' | 'III';
  certIssuer: string;
  certExpiry: string;
  status: 'hieu_luc' | 'sap_het_han' | 'het_han';
  activeProjectsCount: number;
  hasConflictWarning?: boolean;
}

export interface MaterialPrice {
  id: string;
  code: string;
  name: string;
  unit: string;
  standardPrice: number; // Giá công bố liên sở
  marketPrice: number;   // Giá thị trường khảo sát
  region: string;
  period: string; // Kỳ công bố (Tháng 09/2026)
  supplier: string;
}
