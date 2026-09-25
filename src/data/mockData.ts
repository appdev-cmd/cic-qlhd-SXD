/**
 * Dữ liệu Mẫu Thực tế Hệ thống Thẩm định — Sở Xây dựng Tỉnh Điện Biên
 */

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

import { ADDITIONAL_PROJECTS } from './mockAdditionalProjects';

// ─── 1. DANH SÁCH DỰ ÁN MẪU TẠI ĐIỆN BIÊN ───
const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-001',
    code: 'DA-2026-DB-0182',
    name: 'Xây dựng Bệnh viện Đa khoa Khu vực Mường Ảng quy mô 200 giường',
    coverImage: '/images/projects/hospital/hospital_01.jpg',
    images: [
      {
        id: 'img-001-1',
        url: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh 3D Khối nhà khám & điều trị 7 tầng',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '10/05/2026',
        author: 'Công ty CP TVTK Xây dựng Điện Biên',
        description: 'Mặt đứng kiến trúc chính hướng Nam đón gió, sử dụng kính low-e cản nhiệt và lam nhôm chắn nắng.',
        isPrimary: true,
      },
      {
        id: 'img-001-2',
        url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Sảnh đón tiếp & Khuôn viên Cảnh quan',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '12/05/2026',
        author: 'Công ty CP TVTK Xây dựng Điện Biên',
        description: 'Đường nội bộ rộng 10.5m phân luồng riêng cho xe cấp cứu 115 và lối tiếp cận bệnh nhân ngoại trú.',
      },
      {
        id: 'img-001-3',
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng Thực địa Khu đất quy hoạch YT-01 (Mường Ảng)',
        category: 'hien_trang',
        categoryLabel: 'Hiện trạng thực địa',
        date: '02/09/2026',
        author: 'Đoàn Thẩm định Sở Xây dựng',
        description: 'Diện tích 2.45 ha, địa hình thoai thoải đồi bát úp, đã hoàn tất cắm mốc GPMB và bàn giao ranh giới.',
      },
      {
        id: 'img-001-4',
        url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=400&q=80',
        title: 'Bản vẽ Tổng mặt bằng Kiến trúc & Định vị Lưới cột',
        category: 'ban_ve',
        categoryLabel: 'Bản vẽ quy hoạch',
        date: '15/05/2026',
        author: 'Phòng QLĐT Huyện Mường Ảng',
        description: 'Tỷ lệ 1/500, mật độ xây dựng 25%, hệ số sử dụng đất 1.17 lần, khoảng lùi trục đường chính 12.0m.',
      },
      {
        id: 'img-001-5',
        url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trường Khảo sát Địa chất & Khoan thăm dò HK-03',
        category: 'tien_do',
        categoryLabel: 'Tiến độ thực địa',
        date: '25/08/2026',
        author: 'Viện KHCN Xây dựng (IBST)',
        description: 'Khoan 12 hố khoan sâu 25m kiểm tra địa tầng lớp cuội sỏi phong hóa và mực nước ngầm.',
      },
    ],
    investorId: 'org-001',
    investorName: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên',
    location: 'Huyện Mường Ảng, Tỉnh Điện Biên',
    projectGroup: 'B',
    buildingGrade: 'II',
    totalInvestment: 385000000000, // 385 tỷ
    stage: 'bcnckt',
    slaStatus: 'dang_tham_dinh',
    submissionDate: '2026-09-12',
    deadlineDate: '2026-10-06',
    assignee: 'KS. Trần Văn Hùng',
    department: 'Phòng Quản lý Xây dựng',
    planningCompliance: true,
    standardCompliance: true,
    fireSafetyStatus: 'dat',
    estimatedSavings: 18450000000,
    contractors: [
      {
        role: 'Tư vấn Thiết kế BCNCKT',
        orgId: 'org-003',
        orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
        leadPersonnelId: 'per-001',
        leadPersonnelName: 'KTS. Hoàng Tuấn Anh',
      },
      {
        role: 'Tư vấn Thẩm tra Thiết kế & Dự toán',
        orgId: 'org-004',
        orgName: 'Viện Khoa học Công nghệ Xây dựng (IBST)',
        leadPersonnelId: 'per-002',
        leadPersonnelName: 'TS. Nguyễn Mạnh Cường',
      },
    ],
  },
  {
    id: 'proj-002',
    code: 'DA-2026-DB-0183',
    name: 'Nâng cấp, mở rộng Tuyến đường nối TP. Điện Biên Phủ đi Cửa khẩu Quốc tế Tây Trang',
    coverImage: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80',
    images: [
      {
        id: 'img-002-1',
        url: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Hướng tuyến Mở rộng Đèo Tây Trang',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '20/06/2026',
        author: 'Tổng Công ty Tư vấn TK GTVT (TEDI)',
        description: 'Thiết kế đường cấp III miền núi, tốc độ thiết kế Vtk = 60km/h, gia cố mái taluy dương chống sạt.',
        isPrimary: true,
      },
      {
        id: 'img-002-2',
        url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Cầu cạn Vượt Thung lũng Nậm Mức Km14+250',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '22/06/2026',
        author: 'TEDI',
        description: 'Cầu dầm bê tông cốt thép DƯL Super-T khẩu độ 40m, khổ cầu B = 16.0m đảm bảo 4 làn xe chạy an toàn.',
      },
      {
        id: 'img-002-3',
        url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng Nền đường cũ Đoạn Km8 hay sạt lở mùa mưa',
        category: 'hien_trang',
        categoryLabel: 'Hiện trạng thực địa',
        date: '28/08/2026',
        author: 'Ban QLDA Công trình Giao thông Điện Biên',
        description: 'Mặt đường cũ nhỏ hẹp 6.0m nhiều khúc cua gấp nguy hiểm, cần nắn tuyến và hạ thấp độ dốc dọc.',
      },
      {
        id: 'img-002-4',
        url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
        title: 'Bản vẽ Bình đồ Trắc dọc Tuyến đường Km12 - Km16',
        category: 'ban_ve',
        categoryLabel: 'Bản vẽ quy hoạch',
        date: '10/07/2026',
        author: 'TEDI',
        description: 'Bình đồ nắn chỉnh bán kính đường cong Rmin >= 60m kết hợp hệ thống thoát nước rãnh bậc thang.',
      },
    ],
    investorId: 'org-002',
    investorName: 'Ban QLDA Các công trình Giao thông tỉnh Điện Biên',
    location: 'TP. Điện Biên Phủ & Huyện Điện Biên',
    projectGroup: 'A',
    buildingGrade: 'I',
    totalInvestment: 1250000000000, // 1.250 tỷ
    stage: 'bcnckt',
    slaStatus: 'dang_tham_dinh',
    submissionDate: '2026-09-08',
    deadlineDate: '2026-10-14',
    assignee: 'ThS. Nguyễn Đức Long',
    department: 'Phòng Quản lý Xây dựng (Tổ Giao thông)',
    planningCompliance: true,
    standardCompliance: false,
    fireSafetyStatus: 'dat',
    estimatedSavings: 42100000000,
    contractors: [
      {
        role: 'Tư vấn Khảo sát & Thiết kế',
        orgId: 'org-005',
        orgName: 'Tổng Công ty Tư vấn Thiết kế Giao thông Vận tải (TEDI)',
        leadPersonnelId: 'per-003',
        leadPersonnelName: 'KS. Vũ Thành Đạt',
      },
    ],
  },
  {
    id: 'proj-003',
    code: 'DA-2026-DB-0184',
    name: 'Khu Trung tâm Thương mại, Dịch vụ & Khách sạn Quốc tế Mường Lay Plaza',
    coverImage: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
    images: [
      {
        id: 'img-003-1',
        url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh 3D Tổ hợp Khách sạn & TTTM Mường Lay Plaza',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '15/07/2026',
        author: 'Công ty CP Đầu tư & PT Đô thị Tây Bắc',
        description: 'Khối khách sạn 12 tầng ven hồ lòng chảo sông Đà, khối đế thương mại 3 tầng phục vụ du lịch.',
        isPrimary: true,
      },
      {
        id: 'img-003-2',
        url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Ban đêm & Bến du thuyền Thủy điện Sơn La',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '18/07/2026',
        author: 'Tư vấn Thiết kế Tây Bắc',
        description: 'Hệ thống ánh sáng mỹ thuật mặt ngoài kết hợp phố đi bộ bờ sông đón khách du lịch đường thủy.',
      },
      {
        id: 'img-003-3',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng Mép nước Lòng hồ Mường Lay cốt +215.0m',
        category: 'hien_trang',
        categoryLabel: 'Hiện trạng thực địa',
        date: '01/09/2026',
        author: 'Tổ Thẩm định SXD Điện Biên',
        description: 'Kiểm tra cao trình an toàn lũ hồ thủy điện và khoảng lùi hành lang thoát lũ theo quy định.',
      },
      {
        id: 'img-003-4',
        url: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Sảnh thông tầng Atrium & Trung tâm hội nghị',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '20/07/2026',
        author: 'Tư vấn Thiết kế Tây Bắc',
        description: 'Không gian tổ chức sự kiện và hội nghị quốc tế sức chứa 800 chỗ với vách kính panoramic nhìn ra hồ.',
      },
    ],
    investorId: 'org-006',
    investorName: 'Công ty CP Đầu tư & Phát triển Đô thị Tây Bắc',
    location: 'Thị xã Mường Lay, Tỉnh Điện Biên',
    projectGroup: 'B',
    buildingGrade: 'II',
    totalInvestment: 420000000000,
    stage: 'gpxd',
    slaStatus: 'yeu_cau_bo_sung',
    submissionDate: '2026-09-15',
    deadlineDate: '2026-10-05',
    assignee: 'KTS. Lê Hồng Phong',
    department: 'Phòng Quản lý Xây dựng',
    planningCompliance: true,
    standardCompliance: true,
    fireSafetyStatus: 'can_bo_sung',
    estimatedSavings: 0,
    contractors: [
      {
        role: 'Tư vấn Lập hồ sơ Cấp phép',
        orgId: 'org-003',
        orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
        leadPersonnelId: 'per-004',
        leadPersonnelName: 'KS. Phạm Hải Nam',
      },
    ],
  },
  {
    id: 'proj-004',
    code: 'DA-2026-DB-0185',
    name: 'Xây dựng Trường Phổ thông Dân tộc Nội trú THCS & THPT Huyện Điện Biên Đông',
    coverImage: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
    images: [
      {
        id: 'img-004-1',
        url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh 3D Cụm Trường PTDT Nội trú Huyện Điện Biên Đông',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '12/04/2026',
        author: 'Công ty CP XD & TM Mường Thanh',
        description: 'Thiết kế hiện đại mang bản sắc văn hóa vùng cao Tây Bắc, quy mô 500 học sinh dân tộc nội trú.',
        isPrimary: true,
      },
      {
        id: 'img-004-2',
        url: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Khối nhà Lớp học 3 tầng & Thư viện',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '14/04/2026',
        author: 'Mường Thanh Arch',
        description: 'Đầy đủ phòng học lý thuyết, phòng thực hành STEM và nhà đa năng thể thao văn hóa.',
      },
      {
        id: 'img-004-3',
        url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Khu Ký túc xá & Nhà ăn Dinh dưỡng',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '16/04/2026',
        author: 'Mường Thanh Arch',
        description: 'Phòng ở khép kín đảm bảo 8 học sinh/phòng, hệ thống nước nóng năng lượng mặt trời.',
      },
      {
        id: 'img-004-4',
        url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng San gạt Mặt bằng Khu đồi Điện Biên Đông',
        category: 'hien_trang',
        categoryLabel: 'Hiện trạng thực địa',
        date: '20/08/2026',
        author: 'Đoàn Giám sát SXD',
        description: 'Hoàn thành bóc lớp đất hữu cơ và đào đất đồi san nền cốt thiết kế +38.5m.',
      },
    ],
    investorId: 'org-001',
    investorName: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên',
    location: 'Huyện Điện Biên Đông, Tỉnh Điện Biên',
    projectGroup: 'C',
    buildingGrade: 'III',
    totalInvestment: 95000000000,
    stage: 'bcnckt',
    slaStatus: 'da_tham_dinh',
    submissionDate: '2026-08-20',
    deadlineDate: '2026-09-08',
    assignee: 'KS. Đặng Minh Tuấn',
    department: 'Phòng Quản lý Xây dựng',
    planningCompliance: true,
    standardCompliance: true,
    fireSafetyStatus: 'dat',
    estimatedSavings: 6200000000,
    contractors: [
      {
        role: 'Tư vấn Thiết kế',
        orgId: 'org-007',
        orgName: 'Công ty CP Xây dựng & Thương mại Mường Thanh',
        leadPersonnelId: 'per-005',
        leadPersonnelName: 'KTS. Bùi Quốc Anh',
      },
    ],
  },
  {
    id: 'proj-005',
    code: 'DA-2026-DB-0186',
    name: 'Khu Nhà ở Cán bộ Công chức & Công viên Thể thao Him Lam - TP. Điện Biên Phủ',
    coverImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    images: [
      {
        id: 'img-005-1',
        url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Dãy Nhà ở Liền kề Kiểu mẫu Phường Him Lam',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '05/03/2026',
        author: 'CIC Điện Biên',
        description: 'Kiến trúc hiện đại sinh thái, đồng bộ hạ tầng điện ngầm và cáp quang viễn thông đô thị.',
        isPrimary: true,
      },
      {
        id: 'img-005-2',
        url: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Công viên Thể thao & Hồ điều hòa Trung tâm',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '08/03/2026',
        author: 'CIC Điện Biên',
        description: 'Cảnh quan mặt nước, đường chạy bộ, cụm sân pickleball và bóng đá mini phục vụ cư dân.',
      },
      {
        id: 'img-005-3',
        url: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng Thi công Hạ tầng Kỹ thuật & Thảm nhựa Đường nội bộ',
        category: 'tien_do',
        categoryLabel: 'Tiến độ thi công',
        date: '10/09/2026',
        author: 'Tổ Kiểm tra Công trình SXD',
        description: 'Nghiệm thu phần móng cấp phối đá dăm và hố ga thoát nước chuẩn bị thảm bê tông nhựa hạt mịn.',
      },
    ],
    investorId: 'org-008',
    investorName: 'UBND Thành phố Điện Biên Phủ',
    location: 'Phường Him Lam, TP. Điện Biên Phủ',
    projectGroup: 'B',
    buildingGrade: 'II',
    totalInvestment: 260000000000,
    stage: 'nghiem_thu',
    slaStatus: 'dang_tham_dinh',
    submissionDate: '2026-09-18',
    deadlineDate: '2026-10-08',
    assignee: 'ThS. Nguyễn Đức Long',
    department: 'Phòng Quản lý Xây dựng',
    planningCompliance: true,
    standardCompliance: true,
    fireSafetyStatus: 'cho_y_kien_ca',
    estimatedSavings: 11500000000,
    contractors: [
      {
        role: 'Nhà thầu Thi công Xây dựng',
        orgId: 'org-009',
        orgName: 'Công ty CP Đầu tư & Xây dựng CIC Điện Biên',
        leadPersonnelId: 'per-006',
        leadPersonnelName: 'KS. Đỗ Quang Khải',
      },
    ],
  },
  {
    id: 'proj-006',
    code: 'DA-2026-DB-0187',
    name: 'Hệ thống Cấp nước sinh hoạt & Thoát nước thải Cụm Công nghiệp Phổ Yên - Tuần Giáo',
    coverImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80',
    images: [
      {
        id: 'img-006-1',
        url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh 3D Nhà máy Xử lý Nước sạch Công suất 5.000m³/ngày',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '15/01/2026',
        author: 'Ban QLDA Các công trình Giao thông tỉnh',
        description: 'Dây chuyền công nghệ lắng lọc lamen tiếp xúc hiện đại, hệ thống châm hóa chất tự động.',
        isPrimary: true,
      },
      {
        id: 'img-006-2',
        url: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=400&q=80',
        title: 'Phối cảnh Trạm Bơm tăng áp & Bể chứa nước sạch 2.000m³',
        category: 'phoi_canh',
        categoryLabel: 'Phối cảnh 3D',
        date: '18/01/2026',
        author: 'Tư vấn Thiết kế Cấp thoát nước',
        description: 'Bơm chìm công suất lớn dự phòng 100%, hệ thống biến tần tiết kiệm điện năng.',
      },
      {
        id: 'img-006-3',
        url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80',
        title: 'Hiện trạng Vị trí Đấu nối Công trình Thu đầu nguồn Suối Tuần Giáo',
        category: 'hien_trang',
        categoryLabel: 'Hiện trạng thực địa',
        date: '05/08/2026',
        author: 'Đoàn Giám sát Liên ngành',
        description: 'Kiểm tra lưu lượng nước mùa kiệt và phương án bố trí hố thu bùn cát lắng trước khi bơm.',
      },
    ],
    investorId: 'org-002',
    investorName: 'Ban QLDA Các công trình Giao thông tỉnh Điện Biên',
    location: 'Huyện Tuần Giáo, Tỉnh Điện Biên',
    projectGroup: 'B',
    buildingGrade: 'II',
    totalInvestment: 180000000000,
    stage: 'bcnckt',
    slaStatus: 'qua_han',
    submissionDate: '2026-08-10',
    deadlineDate: '2026-09-02',
    assignee: 'KS. Trần Văn Hùng',
    department: 'Phòng Quản lý Xây dựng',
    planningCompliance: false,
    standardCompliance: true,
    fireSafetyStatus: 'dat',
    estimatedSavings: 8900000000,
    contractors: [],
  },
];

export const MOCK_PROJECTS: Project[] = [...INITIAL_PROJECTS, ...ADDITIONAL_PROJECTS];

// ─── 2. DANH SÁCH TỔ CHỨC THAM GIA (CHỦ ĐẦU TƯ, NHÀ THẦU, TƯ VẤN) ───
import { MOCK_ORGANIZATIONS } from './mockOrganizations';
export { MOCK_ORGANIZATIONS };

// ─── 3. DANH SÁCH CÁ NHÂN HÀNH NGHỀ (CHUYÊN GIA / KỸ SƯ / KIẾN TRÚC SƯ) ───
import { MOCK_PERSONNEL } from './mockPersonnel';
export { MOCK_PERSONNEL };

// ─── 4. CSDL GIÁ VẬT LIỆU XÂY DỰNG LIÊN SỞ ĐIỆN BIÊN (THÁNG 09/2026) ───
export const MOCK_MATERIAL_PRICES: MaterialPrice[] = [
  {
    id: 'mat-001',
    code: 'VL-XM-PCB40',
    name: 'Xi măng poóc lăng hỗn hợp PCB40 Hoàng Thạch',
    unit: 'Tấn',
    standardPrice: 1720000,
    marketPrice: 1740000,
    region: 'TP. Điện Biên Phủ',
    period: 'Kỳ 09/2026',
    supplier: 'Công ty TNHH MTV Xi măng Vicem Hoàng Thạch',
  },
  {
    id: 'mat-002',
    code: 'VL-THEP-CB400',
    name: 'Thép cốt bê tông Hòa Phát D10-D32 (CB400-V)',
    unit: 'Tấn',
    standardPrice: 15450000,
    marketPrice: 15600000,
    region: 'Toàn tỉnh Điện Biên',
    period: 'Kỳ 09/2026',
    supplier: 'Tập đoàn Hòa Phát',
  },
  {
    id: 'mat-003',
    code: 'VL-CAT-VANG',
    name: 'Cát vàng đổ bê tông (Mô đun độ lớn ML > 2.0)',
    unit: 'm³',
    standardPrice: 380000,
    marketPrice: 420000,
    region: 'Huyện Mường Ảng',
    period: 'Kỳ 09/2026',
    supplier: 'Mỏ cát Sông Nậm Mức',
  },
  {
    id: 'mat-004',
    code: 'VL-DA-1X2',
    name: 'Đá dăm 1x2 tiêu chuẩn đổ bê tông',
    unit: 'm³',
    standardPrice: 295000,
    marketPrice: 310000,
    region: 'TP. Điện Biên Phủ & Huyện Điện Biên',
    period: 'Kỳ 09/2026',
    supplier: 'Mỏ đá C9 Nà Nhạn',
  },
  {
    id: 'mat-005',
    code: 'VL-BT-M300',
    name: 'Bê tông thương phẩm mác 300 R28 độ sụt 12±2',
    unit: 'm³',
    standardPrice: 1250000,
    marketPrice: 1280000,
    region: 'TP. Điện Biên Phủ',
    period: 'Kỳ 09/2026',
    supplier: 'Trạm trộn bê tông CIC Điện Biên',
  },
];

// ─── 5. DỮ LIỆU ĐIỀU HÀNH EXECUTIVE DASHBOARD ───
export const MOCK_DASHBOARD_STATS = {
  totalProjects: 148,
  activeAppraisals: 24,
  onTimeSlaRate: 95.8, // 95.8%
  overdueSlaCount: 1,
  totalAppraisedInvestment: 8450000000000, // 8.450 tỷ
  totalSavingsAmount: 384000000000,       // Tiết kiệm 384 tỷ cho NSNN
  averageProcessingDays: 14.2,             // 14.2 ngày
  warningApproachingSlaCount: 3,
};

// ─── 6. DỮ LIỆU BIỂU ĐỒ RECHARTS (HÀNG THÁNG NĂM 2026) ───
export const MOCK_CHART_MONTHLY = [
  { month: 'T1', tiepNhan: 12, hoanThanh: 11, dungHanPct: 98, vonThamDinh: 450 },
  { month: 'T2', tiepNhan: 8, hoanThanh: 9, dungHanPct: 100, vonThamDinh: 320 },
  { month: 'T3', tiepNhan: 16, hoanThanh: 14, dungHanPct: 94, vonThamDinh: 680 },
  { month: 'T4', tiepNhan: 19, hoanThanh: 18, dungHanPct: 96, vonThamDinh: 820 },
  { month: 'T5', tiepNhan: 22, hoanThanh: 20, dungHanPct: 95, vonThamDinh: 1150 },
  { month: 'T6', tiepNhan: 25, hoanThanh: 23, dungHanPct: 93, vonThamDinh: 1420 },
  { month: 'T7', tiepNhan: 18, hoanThanh: 19, dungHanPct: 97, vonThamDinh: 950 },
  { month: 'T8', tiepNhan: 21, hoanThanh: 20, dungHanPct: 96, vonThamDinh: 1280 },
  { month: 'T9', tiepNhan: 17, hoanThanh: 16, dungHanPct: 96, vonThamDinh: 980 },
];

export const MOCK_CHART_BY_TYPE = [
  { name: 'Đầu tư công', value: 88, color: '#00668c' },
  { name: 'Đối tác PPP', value: 14, color: '#10b981' },
  { name: 'Kinh doanh Phụ lục IV', value: 46, color: '#f59e0b' },
];

// ─── 7. HÀM TẠO DỮ LIỆU ĐẦY ĐỦ THEO THÔNG TƯ 39/2026/TT-BXD CHO DỰ ÁN ───
export function getProjectTT39Data(project: Project): ProjectTT39Data {
  if (project.id === 'proj-001') {
    return {
      nationalProjectId: 'CSDL-DB-2026-08129',
      investmentCode: 'DT-2026-9812',
      budgetRelationCode: 'NS-1049281',
      decisionMaker: 'Chủ tịch UBND tỉnh Điện Biên (Số định danh: 011082001982)',
      preparedBy: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên (Mã ĐV: 5600123456)',
      province: 'Tỉnh Điện Biên',
      district: 'Huyện Mường Ảng',
      commune: 'Thị trấn Mường Ảng',
      detailedAddress: 'Tổ dân phố 4, Thị trấn Mường Ảng, huyện Mường Ảng, tỉnh Điện Biên',
      landLot: 'Lô quy hoạch YT-01 (Khu trung tâm hành chính mở rộng)',
      coordinates: '21°30\'45.2"N 103°12\'18.6"E (Hệ tọa độ VN-2000 kinh tuyến trục 103°)',
      projectGroup: 'B',
      projectType: 'Dự án Đầu tư công (theo Nghị định 217/2026/NĐ-CP)',
      facilityType: 'Công trình Dân dụng - Cơ sở Y tế khám chữa bệnh (Nghị định 207/2026/NĐ-CP)',
      facilityGrade: 'Cấp II (Niên hạn sử dụng trên 50 năm)',
      objective: 'Xây dựng mới đồng bộ cơ sở vật chất Bệnh viện Đa khoa quy mô 200 giường đáp ứng nhu cầu khám chữa bệnh chất lượng cao cho nhân dân các dân tộc huyện Mường Ảng và vùng phụ cận.',
      landArea: 24500, // 2.45 ha
      constructionArea: 6125,
      grossFloorArea: 28600,
      buildingDensity: 25.0, // %
      plotRatio: 1.17, // lần
      floorCount: '07 tầng nổi, 01 tầng bán hầm kỹ thuật',
      buildingHeight: 28.5, // mét
      capacity: '200 giường bệnh nội trú, công suất phục vụ 600 lượt khám/ngày đêm',
      totalInvestment: 385000000000,
      appraisalItemCost: 385000000000,
      fundingSource: 'Vốn Đầu tư công (Ngân sách tỉnh Điện Biên 60% + Ngân sách Trung ương hỗ trợ 40%)',
      costBreakdown: {
        construction: 210000000000, // Chi phí xây dựng
        equipment: 82500000000,     // Chi phí thiết bị
        management: 6200000000,     // Chi phí quản lý dự án
        consulting: 14800000000,    // Chi phí tư vấn ĐTXD
        others: 36000000000,        // Bồi thường GPMB + Chi phí khác
        contingency: 35500000000,   // Chi phí dự phòng
      },
      executionPeriod: '2026 – 2028 (36 tháng)',
      startDate: '15/03/2026',
      completionDate: '31/12/2028',
      phases: 'Giai đoạn 1 (2026-2027): Thi công khối nhà khám & điều trị 7 tầng; Giai đoạn 2 (2028): Khối truyền nhiễm, xử lý nước thải y tế & lắp đặt trang thiết bị.',
      standards: [
        { code: 'QCVN 01:2021/BXD', name: 'Quy chuẩn kỹ thuật quốc gia về Quy hoạch xây dựng' },
        { code: 'QCVN 06:2022/BXD + SĐ 1:2023', name: 'Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình' },
        { code: 'QCVN 02:2022/BXD', name: 'Quy chuẩn kỹ thuật quốc gia về Số liệu điều kiện tự nhiên dùng trong xây dựng' },
        { code: 'TCVN 4470:2012', name: 'Bệnh viện đa khoa - Tiêu chuẩn thiết kế' },
        { code: 'TCVN 9386:2012', name: 'Thiết kế công trình chịu động đất (Địa bàn Điện Biên cấp VII)' },
        { code: 'QCVN 07:2023/BXD', name: 'Quy chuẩn kỹ thuật quốc gia về các công trình Hạ tầng kỹ thuật' },
      ],
      legalDocs: [
        {
          category: 'Chủ trương đầu tư',
          docNumber: '1142/QĐ-UBND',
          docDate: '15/03/2026',
          issuer: 'UBND tỉnh Điện Biên',
          description: 'Quyết định phê duyệt chủ trương đầu tư dự án Bệnh viện Đa khoa Khu vực Mường Ảng',
          status: 'da_xac_thuc',
        },
        {
          category: 'Quy hoạch chi tiết 1/500',
          docNumber: '540/QĐ-UBND',
          docDate: '10/05/2026',
          issuer: 'UBND huyện Mường Ảng',
          description: 'Quyết định phê duyệt Đồ án quy hoạch chi tiết xây dựng tỷ lệ 1/500 (Mã QH: QH-DB-MA-2026-05)',
          status: 'da_xac_thuc',
        },
        {
          category: 'Thi tuyển kiến trúc',
          docNumber: '680/QĐ-SXD',
          docDate: '28/05/2026',
          issuer: 'Sở Xây dựng Điện Biên',
          description: 'Quyết định công nhận kết quả thi tuyển phương án kiến trúc công trình Bệnh viện Mường Ảng',
          status: 'da_xac_thuc',
        },
        {
          category: 'Đấu nối hạ tầng kỹ thuật',
          docNumber: '215/TT-SXD-HTKT',
          docDate: '12/06/2026',
          issuer: 'Sở Xây dựng & Sở GTVT',
          description: 'Chấp thuận phương án đấu nối giao thông QL279, cấp điện 35kV và xả thải nước sạch',
          status: 'da_xac_thuc',
        },
        {
          category: 'Tĩnh không hàng không',
          docNumber: '458/TC-QC',
          docDate: '20/06/2026',
          issuer: 'Cục Tác chiến - Bộ Tổng tham mưu',
          description: 'Chấp thuận độ cao chướng ngại vật hàng không cốt đỉnh mái +28.5m',
          status: 'da_xac_thuc',
        },
        {
          category: 'Báo cáo ĐTM & Môi trường',
          docNumber: '189/QĐ-STNMT',
          docDate: '05/07/2026',
          issuer: 'Sở TN&MT tỉnh Điện Biên',
          description: 'Quyết định phê duyệt kết quả thẩm định Báo cáo đánh giá tác động môi trường (ĐTM)',
          status: 'da_xac_thuc',
        },
        {
          category: 'Thẩm duyệt PCCC',
          docNumber: '88/TD-PCCC',
          docDate: '18/07/2026',
          issuer: 'Phòng Cảnh sát PCCC & CNCH - CA Điện Biên',
          description: 'Văn bản thẩm duyệt thiết kế về phòng cháy và chữa cháy đối với hồ sơ TKCS',
          status: 'da_xac_thuc',
        },
        {
          category: 'Báo cáo Thẩm tra TKCS',
          docNumber: '104/BC-IBST',
          docDate: '05/09/2026',
          issuer: 'Viện Khoa học Công nghệ XD (IBST)',
          description: 'Báo cáo kết quả thẩm tra thiết kế cơ sở và tổng mức đầu tư xây dựng công trình',
          status: 'da_xac_thuc',
        },
      ],
      participants: [
        {
          id: 'part-001',
          name: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên',
          role: 'Chủ đầu tư / Cơ quan chuẩn bị dự án',
          taxCode: '5600123456',
          address: 'Số 12 Đường Hoàng Văn Thái, Phường Điện Biên Phủ, TP. Điện Biên Phủ',
          representative: 'Ông Nguyễn Thanh Sơn (Giám đốc Ban)',
          certNumber: 'BXD-000109',
          certGrade: 'I',
          memberCount: 2,
        },
        {
          id: 'part-002',
          name: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
          role: 'Nhà thầu Tư vấn lập BCNCKT & Thiết kế cơ sở',
          taxCode: '5600192842',
          address: 'Số 45 Đường Võ Nguyên Giáp, Phường Mường Thanh, TP. Điện Biên Phủ',
          representative: 'ThS. Lê Thành Đô (Tổng Giám đốc)',
          certNumber: 'SXD-DB-00192',
          certGrade: 'I',
          memberCount: 4,
        },
        {
          id: 'part-003',
          name: 'Viện Khoa học Công nghệ Xây dựng (IBST)',
          role: 'Nhà thầu Tư vấn Thẩm tra Thiết kế cơ sở & Tổng mức đầu tư',
          taxCode: '0100123890',
          address: 'Số 81 Trần Cung, Phường Nghĩa Tân, Quận Cầu Giấy, Hà Nội',
          representative: 'PGS. TS. Vũ Thành Hải (Viện trưởng)',
          certNumber: 'BXD-000088',
          certGrade: 'I',
          memberCount: 2,
        },
        {
          id: 'part-004',
          name: 'Công ty Cổ phần Xây dựng & Tư vấn Khảo sát Mường Phăng',
          role: 'Nhà thầu Khảo sát Xây dựng (Địa chất & Địa hình)',
          taxCode: '5600789012',
          address: 'Xã Mường Phăng, TP. Điện Biên Phủ, Tỉnh Điện Biên',
          representative: 'Ông Lò Văn Muôn (Giám đốc)',
          certNumber: 'SXD-DB-00084',
          certGrade: 'II',
          memberCount: 1,
        },
      ],
      members: [
        {
          id: 'mem-001',
          fullName: 'Hoàng Tuấn Anh',
          idCard: '011085002345',
          role: 'Chủ nhiệm thiết kế BCNCKT & TKCS',
          position: 'Trưởng phòng Thiết kế Kiến trúc',
          orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
          orgRole: 'Tư vấn Thiết kế',
          certNumber: 'BXD-00042189',
          certGrade: 'I',
          certIssuer: 'Cục QL Hoạt động Xây dựng - Bộ Xây dựng',
          certExpiry: '18/04/2029',
          status: 'hieu_luc',
          specialties: ['Thiết kế kiến trúc công trình', 'Chủ nhiệm đồ án quy hoạch xây dựng'],
        },
        {
          id: 'mem-002',
          fullName: 'Trần Quốc Đạt',
          idCard: '011087003412',
          role: 'Chủ trì thiết kế Kết cấu',
          position: 'Kỹ sư Kết cấu chính',
          orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
          orgRole: 'Tư vấn Thiết kế',
          certNumber: 'BXD-00038912',
          certGrade: 'I',
          certIssuer: 'Cục QL Hoạt động Xây dựng - Bộ Xây dựng',
          certExpiry: '25/08/2028',
          status: 'hieu_luc',
          specialties: ['Thiết kế kết cấu công trình dân dụng - công nghiệp'],
        },
        {
          id: 'mem-003',
          fullName: 'Lê Thị Bích Ngọc',
          idCard: '001190005678',
          role: 'Chủ trì Cơ điện MEP & PCCC',
          position: 'Kỹ sư Cơ điện chính',
          orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
          orgRole: 'Tư vấn Thiết kế',
          certNumber: 'SXD-HN-002194',
          certGrade: 'I',
          certIssuer: 'Sở Xây dựng TP. Hà Nội',
          certExpiry: '10/02/2030',
          status: 'hieu_luc',
          specialties: ['Thiết kế cơ điện công trình', 'Thiết kế hệ thống PCCC'],
        },
        {
          id: 'mem-004',
          fullName: 'Phạm Hải Nam',
          idCard: '011088004567',
          role: 'Chủ trì Dự toán & Tổng mức đầu tư',
          position: 'Trưởng nhóm Kinh tế xây dựng',
          orgName: 'Công ty Cổ phần Tư vấn Thiết kế Xây dựng Điện Biên',
          orgRole: 'Tư vấn Thiết kế',
          certNumber: 'SXD-DB-00124',
          certGrade: 'II',
          certIssuer: 'Sở Xây dựng tỉnh Điện Biên',
          certExpiry: '10/11/2026',
          status: 'sap_het_han',
          specialties: ['Định giá xây dựng', 'Lập & thẩm tra dự toán công trình'],
        },
        {
          id: 'mem-005',
          fullName: 'Nguyễn Mạnh Cường',
          idCard: '001079001234',
          role: 'Chủ nhiệm thẩm tra TKCS & Tổng mức đầu tư',
          position: 'Phó Viện trưởng Viện KHCN Xây dựng',
          orgName: 'Viện Khoa học Công nghệ Xây dựng (IBST)',
          orgRole: 'Tư vấn Thẩm tra',
          certNumber: 'BXD-00012903',
          certGrade: 'I',
          certIssuer: 'Cục QL Hoạt động Xây dựng - Bộ Xây dựng',
          certExpiry: '15/01/2030',
          status: 'hieu_luc',
          specialties: ['Thiết kế & thẩm tra kết cấu công trình', 'Đánh giá an toàn chịu lực'],
        },
        {
          id: 'mem-006',
          fullName: 'Trịnh Đình Trọng',
          idCard: '001083009876',
          role: 'Chủ trì thẩm tra Dự toán & Chi phí',
          position: 'Chuyên gia Kinh tế xây dựng IBST',
          orgName: 'Viện Khoa học Công nghệ Xây dựng (IBST)',
          orgRole: 'Tư vấn Thẩm tra',
          certNumber: 'BXD-00015432',
          certGrade: 'I',
          certIssuer: 'Bộ Xây dựng',
          certExpiry: '30/09/2029',
          status: 'hieu_luc',
          specialties: ['Định giá xây dựng', 'Thẩm tra tổng mức đầu tư'],
        },
        {
          id: 'mem-007',
          fullName: 'Vũ Văn Hào',
          idCard: '034080007812',
          role: 'Chủ nhiệm khảo sát Địa chất công trình',
          position: 'Trưởng phòng Địa kỹ thuật',
          orgName: 'Công ty Cổ phần Xây dựng & Tư vấn Khảo sát Mường Phăng',
          orgRole: 'Tư vấn Khảo sát',
          certNumber: 'SXD-DB-00045',
          certGrade: 'II',
          certIssuer: 'Sở Xây dựng tỉnh Điện Biên',
          certExpiry: '15/07/2028',
          status: 'hieu_luc',
          specialties: ['Khảo sát địa chất công trình', 'Khảo sát địa hình'],
        },
        {
          id: 'mem-008',
          fullName: 'Lò Văn Hùng',
          idCard: '011084001928',
          role: 'Giám đốc Quản lý dự án',
          position: 'Phó Giám đốc Ban QLDA',
          orgName: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên',
          orgRole: 'Chủ đầu tư',
          certNumber: 'BXD-00021980',
          certGrade: 'I',
          certIssuer: 'Cục QL Hoạt động Xây dựng - Bộ Xây dựng',
          certExpiry: '14/06/2029',
          status: 'hieu_luc',
          specialties: ['Quản lý dự án đầu tư xây dựng công trình dân dụng'],
        },
        {
          id: 'mem-009',
          fullName: 'Đỗ Quang Minh',
          idCard: '011089006543',
          role: 'Phụ trách Kỹ thuật & Hồ sơ pháp lý',
          position: 'Chuyên viên Phòng Điều hành Dự án 1',
          orgName: 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên',
          orgRole: 'Chủ đầu tư',
          certNumber: 'SXD-DB-00078',
          certGrade: 'II',
          certIssuer: 'Sở Xây dựng tỉnh Điện Biên',
          certExpiry: '19/12/2027',
          status: 'hieu_luc',
          specialties: ['Quản lý dự án dân dụng', 'Giám sát thi công xây dựng'],
        },
      ],
    };
  }

  // Fallback thông minh cho các dự án khác
  return {
    nationalProjectId: `CSDL-DB-2026-${project.code.replace(/\D/g, '').padEnd(5, '0')}`,
    investmentCode: `DT-2026-${project.id.replace(/\D/g, '').padEnd(4, '1')}`,
    budgetRelationCode: `NS-104${project.id.replace(/\D/g, '').padEnd(4, '9')}`,
    decisionMaker: 'Chủ tịch UBND tỉnh Điện Biên (Số định danh: 011082001982)',
    preparedBy: `${project.investorName} (Mã ĐV: 5600123456)`,
    province: 'Tỉnh Điện Biên',
    district: project.location.includes('Huyện') ? project.location.split(',')[0].trim() : 'TP. Điện Biên Phủ',
    commune: 'Trung tâm hành chính',
    detailedAddress: `${project.location}`,
    landLot: 'Lô quy hoạch theo quyết định phê duyệt mặt bằng',
    coordinates: '21°23\'15.0"N 103°01\'20.0"E (Hệ tọa độ VN-2000)',
    projectGroup: project.projectGroup,
    projectType: 'Dự án Đầu tư công (theo Nghị định 217/2026/NĐ-CP)',
    facilityType: `Công trình ${project.buildingGrade === 'I' ? 'Cấp I' : 'Cấp II'} (theo Nghị định 207/2026/NĐ-CP)`,
    facilityGrade: `Cấp ${project.buildingGrade}`,
    objective: `Đầu tư xây dựng hoàn thiện ${project.name} nhằm phục vụ phát triển kinh tế - xã hội tỉnh Điện Biên.`,
    landArea: 18500,
    constructionArea: 5200,
    grossFloorArea: 21500,
    buildingDensity: 28.1,
    plotRatio: 1.16,
    floorCount: '05 tầng nổi, 01 tầng hầm',
    buildingHeight: 22.0,
    capacity: 'Quy mô công suất thiết kế theo Quyết định chủ trương đầu tư',
    totalInvestment: project.totalInvestment,
    appraisalItemCost: project.totalInvestment,
    fundingSource: 'Vốn ngân sách nhà nước tỉnh Điện Biên & Ngân sách hỗ trợ',
    costBreakdown: {
      construction: Math.round(project.totalInvestment * 0.55),
      equipment: Math.round(project.totalInvestment * 0.22),
      management: Math.round(project.totalInvestment * 0.02),
      consulting: Math.round(project.totalInvestment * 0.04),
      others: Math.round(project.totalInvestment * 0.07),
      contingency: Math.round(project.totalInvestment * 0.1),
    },
    executionPeriod: '2026 – 2028 (36 tháng)',
    startDate: project.submissionDate,
    completionDate: '31/12/2028',
    phases: 'Phân kỳ đầu tư theo kế hoạch vốn trung hạn 2026 - 2030.',
    standards: [
      { code: 'QCVN 01:2021/BXD', name: 'Quy chuẩn kỹ thuật quốc gia về Quy hoạch xây dựng' },
      { code: 'QCVN 06:2022/BXD', name: 'Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình' },
      { code: 'TCVN 9386:2012', name: 'Thiết kế công trình chịu động đất' },
    ],
    legalDocs: [
      {
        category: 'Chủ trương đầu tư',
        docNumber: `982/QĐ-UBND`,
        docDate: '10/02/2026',
        issuer: 'UBND tỉnh Điện Biên',
        description: `Quyết định phê duyệt chủ trương đầu tư dự án ${project.name}`,
        status: 'da_xac_thuc',
      },
      {
        category: 'Quy hoạch xây dựng',
        docNumber: `312/QĐ-UBND`,
        docDate: '15/04/2026',
        issuer: 'Cơ quan có thẩm quyền',
        description: 'Văn bản chấp thuận chỉ giới đường đỏ và quy hoạch chi tiết xây dựng',
        status: 'da_xac_thuc',
      },
    ],
    participants: [
      {
        id: `part-inv-${project.id}`,
        name: project.investorName,
        role: 'Chủ đầu tư / Cơ quan chuẩn bị dự án',
        taxCode: MOCK_ORGANIZATIONS.find((o) => o.id === project.investorId)?.taxCode || '5600123456',
        address: MOCK_ORGANIZATIONS.find((o) => o.id === project.investorId)?.address || 'Tỉnh Điện Biên',
        representative: MOCK_ORGANIZATIONS.find((o) => o.id === project.investorId)?.representative || 'Đại diện Ban QLDA',
        certNumber: MOCK_ORGANIZATIONS.find((o) => o.id === project.investorId)?.certificateNumber,
        certGrade: MOCK_ORGANIZATIONS.find((o) => o.id === project.investorId)?.certificateGrade,
        memberCount: 2,
      },
      ...project.contractors.map((c, i) => {
        const foundOrg = MOCK_ORGANIZATIONS.find((o) => o.id === c.orgId);
        return {
          id: `part-gen-${project.id}-${i}`,
          name: c.orgName,
          role: c.role,
          taxCode: foundOrg?.taxCode || `5600${i}89123`,
          address: foundOrg?.address || 'Tỉnh Điện Biên',
          representative: foundOrg?.representative || c.leadPersonnelName,
          certNumber: foundOrg?.certificateNumber || 'SXD-DB-00192',
          certGrade: foundOrg?.certificateGrade || 'I',
          memberCount: 2,
        };
      }),
    ],
    members: project.contractors.map((c, i) => {
      const foundPerson = MOCK_PERSONNEL.find((p) => p.id === c.leadPersonnelId);
      return {
        id: `mem-gen-${project.id}-${i}`,
        fullName: foundPerson?.fullName || c.leadPersonnelName,
        idCard: foundPerson?.idCard || `01108${i}001234`,
        role: `Chủ nhiệm / Chủ trì (${c.role})`,
        position: foundPerson?.specialties[0] ? `Kỹ sư chính • ${foundPerson.specialties[0]}` : 'Chủ nhiệm dự án',
        orgName: c.orgName,
        orgRole: c.role,
        certNumber: foundPerson?.certNumber || `BXD-0004${i}912`,
        certGrade: foundPerson?.certGrade || 'I',
        certIssuer: foundPerson?.certIssuer || 'Bộ Xây dựng',
        certExpiry: foundPerson?.certExpiry
          ? (foundPerson.certExpiry.includes('/') ? foundPerson.certExpiry : foundPerson.certExpiry.split('-').reverse().join('/'))
          : '15/05/2029',
        status: foundPerson?.status || 'hieu_luc',
        specialties: foundPerson?.specialties || ['Thiết kế công trình xây dựng', 'Quản lý dự án'],
      };
    }),
  };
}
