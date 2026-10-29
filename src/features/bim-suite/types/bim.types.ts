// types/bim.types.ts
// Định nghĩa kiểu dữ liệu cho phân hệ BIM / openBIM IFC (Mục 14 CV 3219/BQLDAĐS-KHCN)

// BuildSIA bổ sung các bộ môn dân dụng/hạ tầng; cic-hud chỉ có bộ môn đường sắt (ràng buộc ở migration bim_core).
export type BimDiscipline =
  | 'TOAN_THE'
  | 'KIEN_TRUC'
  | 'KET_CAU'
  | 'MEP'
  | 'DIEN'
  | 'CAP_THOAT_NUOC'
  | 'PCCC'
  | 'HA_TANG'
  | 'CAU'
  | 'HAM'
  | 'NHA_GA'
  | 'DUONG_RAY'
  | 'THONG_TIN_TIN_HIEU'
  | 'KHAC';

export type BimModelStatus = 'uploaded' | 'processing' | 'ready' | 'error';

export interface HudStandardRecord {
  global_id: string;
  express_id: number;
  phien_ban_tu_dien: string;
  trang_thai_chuan: 'dat_cho_demo';
  gia_tri: Record<string, string | number | boolean | null>;
  trang_thai: Record<string, 'co_gia_tri' | 'chua_co_nguon' | 'khong_ap_dung'>;
  nguon_dai_luong: Record<
    string,
    { nguon: string; co_so: string; cong_thuc: string; don_vi: string | null; gioi_han?: string }
  >;
  tham_so_thieu_nguon: string[];
}

export interface HudDataCertificate {
  phien_ban: string;
  trang_thai: string;
  ma_dot_phat_hanh: string;
  sha256_ifc: string;
  sha256_tu_dien: string;
  sha256_uniclass?: string;
  uniclass?: Record<string, number>;
  so_cau_kien: number;
  so_tham_so: number;
  so_tham_so_thieu_nguon: number;
  kiem_tra: {
    loi_schema_ifc: number;
    loi_tham_so: number;
    loi_json_schema?: number;
    loi_uniclass?: number;
    guid_hinh_hoc_giu_nguyen: boolean;
    du_lieu_chuyen_doi_khop_ifc?: boolean;
  };
  kiem_tra_lien_ket: boolean;
  cap_nhat_luc: string;
}

export interface BimModel {
  id: string;
  project_id: string;
  work_id?: string | null;
  file_name: string;
  file_size: number | null;
  ifc_path: string | null;
  frag_path: string | null;
  properties_path?: string | null;
  status: BimModelStatus;
  discipline: BimDiscipline;
  element_count: number;
  error_message?: string | null;
  uploaded_by?: string | null;
  file_hash?: string | null;
  tien_do?: number | null;
  ifc_schema?: string | null;
  phan_mem_tao?: string | null;
  phien_ban?: number;
  model_goc_id?: string | null;
  ghi_chu_phien_ban?: string | null;
  trang_thai_cde?: BimCdeState | null;
  ma_phu_hop?: string | null;
  /** Toạ độ gốc đọc từ IfcMapConversion / IfcSite (worker ghi) */
  georef?: BimGeoref | null;
  thong_tin_mo_rong?: { chuan_du_lieu?: HudDataCertificate; [key: string]: unknown } | null;
  chat_luong?: BimDataQualityStats | null;
  /** Cảnh báo chất lượng tệp (VD thiếu Base Quantities) */
  canh_bao?: { thieu_qto_ty_le?: number; so_cau_kien_thieu_qto?: number } | null;
  toa_do_offset?: { x: number; y: number; z: number } | null;
  /** auth.uid() người tải lên — trigger máy chủ gán, client không đặt được */
  nguoi_tao_uid?: string | null;
  /** Xóa mềm: khác null là đã xóa (chỉ quản trị thấy; khôi phục / xóa vĩnh viễn qua RPC) */
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Nhóm thuộc tính: tên thuộc tính → giá trị */
export type BimPropertyGroup = Record<string, unknown>;

/** Cấu trúc thuoc_tinh do converter worker ghi ra */
export interface BimElementProperties {
  hud_chuan?: HudStandardRecord;
  thong_tin?: Record<string, string>;
  psets?: Record<string, BimPropertyGroup>;
  qto?: Record<string, BimPropertyGroup>;
  kieu?: { ten: string | null; loai: string; psets?: Record<string, BimPropertyGroup> };
  phan_loai?: string[];
}

export type BimQuantitySource = 'qto' | 'pset' | 'hinh_hoc';

export interface BimElement {
  id: string;
  model_id: string;
  project_id: string;
  express_id: number;
  global_id: string;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
  phan_doan_tang: string | null;
  parent_express_id?: number | null;
  vat_lieu?: string | null;
  /** Thể tích cấu kiện m³ (tên cột giữ nguyên để tương thích) */
  the_tich_be_tong: number | null;
  dien_tich?: number | null;
  dien_tich_van_khuon: number | null;
  chieu_dai: number | null;
  trong_luong?: number | null;
  nguon_khoi_luong?: BimQuantitySource | null;
  thuoc_tinh: BimElementProperties & Record<string, any>;
  hash_noi_dung?: string | null;
  created_at?: string;
}

/** Một dòng của view v_bim_khoi_luong_tong_hop */
export interface BimQuantitySummaryRow {
  model_id: string;
  project_id: string;
  loai_cau_kien: string;
  vat_lieu: string;
  phan_doan_tang: string;
  so_luong: number;
  thieu_the_tich?: number;
  thieu_dien_tich?: number;
  thieu_chieu_dai?: number;
  thieu_trong_luong?: number;
  tong_the_tich: number | null;
  tong_dien_tich: number | null;
  tong_chieu_dai: number | null;
  tong_trong_luong: number | null;
  co_uoc_tinh_hinh_hoc: boolean | null;
}

export interface BimElementFilter {
  loai_cau_kien?: string;
  phan_doan_tang?: string;
  search?: string;
}

/** Mặt phẳng cắt lưu dạng THREE.Plane (normal, constant) */
export interface BimClipPlaneState {
  normal: [number, number, number];
  constant: number;
}

/** Trạng thái góc nhìn 3D (dùng cho góc nhìn lưu trữ và vướng mắc) */
/** Trạng thái hiển thị của một mô hình trong góc nhìn (ID cục bộ của tệp .frag) */
export interface BimViewpointVisibility {
  /** null: không cô lập; mảng (có thể rỗng): chỉ hiện các cấu kiện này */
  isolated: number[] | null;
  hidden: number[];
}

export interface BimViewpoint {
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
  };
  sectionPlanes?: BimClipPlaneState[];
  /** Định dạng cũ, chỉ cho một mô hình — giữ để đọc góc nhìn/BCF đã lưu trước đây */
  isolatedIds?: number[];
  hiddenIds?: number[];
  selectedIds?: number[];
  modelIds?: string[];
  /** Trạng thái hiển thị theo từng mô hình đang nạp lúc lưu */
  visibility?: Record<string, BimViewpointVisibility>;
  /** Toàn bộ lựa chọn theo mô hình */
  selection?: { modelId: string; ids: number[] }[];
  /** Chế độ nhìn xuyên (ghost) lúc lưu */
  ghost?: { active: boolean; opacity?: number };
  /** Ảnh ghi chú (mũi tên, khoanh vùng, chữ) vẽ trên góc nhìn — JPEG data URL đã thu nhỏ */
  markup?: string | null;
  /** Các phép đo đang hiển thị lúc lưu (toạ độ thế giới, mét) */
  measurements?: BimMeasurementRecord[];
  /** Trạng thái bảng mặt cắt (theo mét) để mở lại và chỉnh tiếp; mặt phẳng áp thực tế vẫn là sectionPlanes */
  section?: BimViewpointSection | null;
}

export type BimMeasurementKind =
  | 'distance'
  | 'elevation'
  | 'area'
  | 'angle'
  | 'slope'
  | 'perpendicular'
  | 'clearance'
  | 'bbox';

/** Một phép đo lưu được: điểm theo toạ độ thế giới của trình xem (Y hướng lên), mét */
export interface BimMeasurementRecord {
  id: string;
  kind: BimMeasurementKind;
  points: [number, number, number][];
  /** Pháp tuyến mặt tham chiếu (đo vuông góc) */
  normal?: [number, number, number];
  /** Khoảng cách giữa hai cấu kiện tính gần đúng theo hộp bao (mô hình quá nặng để tính trên lưới tam giác) */
  approximate?: boolean;
}

/** Trạng thái mặt cắt theo mét (bản 2) */
export interface BimViewpointSection {
  version: 2;
  mode: 'plane' | 'box';
  axis: 'x' | 'y' | 'z';
  position: number;
  normal?: [number, number, number] | null;
  flip: boolean;
  box: Record<'x' | 'y' | 'z', [number | null, number | null]>;
  outline?: boolean;
  /** Nắp cắt tô kín mặt cắt (mặc định bật) */
  caps?: boolean;
}

export interface BimSavedView {
  id: string;
  project_id: string;
  model_id?: string | null;
  name: string;
  description?: string | null;
  state: BimViewpoint;
  thumbnail_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  /** Thẻ phân loại (cột `tags`, migration 20261021130000) */
  tags?: string[] | null;
}

export type BimIssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type BimIssuePriority = 'low' | 'normal' | 'high' | 'critical';
export type BimIssueType = 'thiet_ke' | 'va_cham' | 'hien_truong' | 'giai_phong_mat_bang';
/** Loại hồ sơ trao đổi (migration 20261023100000). */
export type BimRecordType = 'vuong_mac' | 'rfi' | 'rfa' | 'rfp' | 'ncr';
export type BimResponsibleParty = 'chu_dau_tu' | 'tu_van_thiet_ke' | 'tu_van_giam_sat' | 'nha_thau' | 'khac';

export interface BimIssue {
  id: string;
  project_id: string;
  model_id?: string | null;
  title: string;
  description?: string | null;
  status: BimIssueStatus;
  priority: BimIssuePriority;
  issue_type: BimIssueType;
  target_element_guid?: string | null;
  target_express_id?: number | null;
  viewpoint?: BimViewpoint | null;
  screenshot_url?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  don_vi_xu_ly?: BimResponsibleParty | null;
  due_date?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  loai_ho_so?: BimRecordType | null;
  so_hieu?: string | null;
  ben_nhan?: string | null;
  han_tra_loi?: string | null;
  noi_dung_tra_loi?: string | null;
  tra_loi_luc?: string | null;
  nguoi_tra_loi_uid?: string | null;
}

export interface BimIssueComment {
  id: string;
  issue_id: string;
  body: string;
  author?: string | null;
  author_id?: string | null;
  loai?: 'binh_luan' | 'he_thong';
  created_at: string;
}

export type BimLinkType = 'tai_lieu' | 'nghiem_thu' | 'cong_viec' | 'boq';

/** Project owner or member (bim_nguoi_tham_gia). */
export interface BimProjectPerson {
  id: string;
  ten: string;
  email: string;
  vai_tro: 'owner' | 'manager' | 'contributor' | 'viewer';
}

/** Document of the project library (Hồ sơ tài liệu). */
export interface BimLibraryDocument {
  id: string;
  name: string;
  category: string;
  updated_at: string;
}

export interface BimDocumentLink {
  id: string;
  project_id: string;
  model_id?: string | null;
  global_id: string;
  loai_doi_tuong: BimLinkType;
  doi_tuong_id: string;
  ten_hien_thi?: string | null;
  ghi_chu?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type BimVersionChange = 'them_moi' | 'da_xoa' | 'da_sua';

export interface BimVersionDiffRow {
  global_id: string;
  trang_thai: BimVersionChange;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
  express_id_cu: number | null;
  express_id_moi: number | null;
  the_tich_cu: number | null;
  the_tich_moi: number | null;
}

export interface BimProjectSettings {
  project_id: string;
  coord_offset: {
    x: number;
    y: number;
    z: number;
  };
  updated_at?: string;
}

// ── 4D tiến độ ─────────────────────────────────────────────
export type BimTaskStatus4D = 'chua_bat_dau' | 'dang_lam' | 'hoan_thanh' | 'cham_tien_do' | 'khong_gan';

/** Công việc tiến độ (bảng nhiem_vu) rút gọn cho liên kết 4D */
/** Nền bản đồ / ảnh flycam của dự án (bảng bim_nen_ban_do) */
export interface BimBasemap {
  project_id: string;
  loai: 'anh' | 'osm';
  duong_dan?: string | null;
  min_x: number;
  min_z: number;
  max_x: number;
  max_z: number;
  do_mo: number;
  cao_do?: number | null;
  ten_nguoi_cap_nhat?: string | null;
  updated_at?: string;
}

/** Toạ độ gốc của mô hình (IfcMapConversion + hệ quy chiếu) */
export interface BimGeoref {
  eastings?: number;
  northings?: number;
  orthogonalHeight?: number;
  xAxisAbscissa?: number;
  xAxisOrdinate?: number;
  scale?: number;
  crs?: string | null;
  /** Gốc toạ độ dự án (IfcSite RefLatitude/RefLongitude) nếu không có MapConversion */
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
}

/** ISO 19650: trạng thái thông tin trong môi trường dữ liệu chung (CDE) */
export type BimCdeState = 'wip' | 'shared' | 'cho_phat_hanh' | 'published' | 'archived';

export interface BimCdeHistory {
  id: string;
  model_id: string;
  tu_trang_thai: BimCdeState | null;
  den_trang_thai: BimCdeState;
  ma_phu_hop?: string | null;
  ghi_chu?: string | null;
  ten_nguoi_thuc_hien?: string | null;
  created_at: string;
}

/** Trường lọc: tên cột của bim_elements hoặc đường dẫn trong thuoc_tinh (VD ['psets','Pset_WallCommon','IsExternal']) */
export type BimFieldRef = string | string[];

export type BimSetOperator =
  | '='
  | '!='
  | 'chua'
  | 'khong_chua'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'co'
  | 'khong_co'
  | 'trong'
  | 'khop_mau';

export interface BimSetCondition {
  truong: BimFieldRef;
  toan_tu: BimSetOperator;
  gia_tri?: string;
}

/** Bộ chọn thông minh đã lưu (bảng bim_bo_chon) */
export interface BimSmartSet {
  id: string;
  project_id: string;
  ten: string;
  mo_ta?: string | null;
  dieu_kien: BimSetCondition[];
  /** Nhóm HOẶC (mỗi nhóm là các điều kiện VÀ); null/thiếu = bộ chọn dạng cũ chỉ dùng dieu_kien */
  nhom_dieu_kien?: BimSetCondition[][] | null;
  mau?: string | null;
  ten_nguoi_tao?: string | null;
  created_at: string;
}

export interface BimFieldInfo {
  duong_dan: BimFieldRef;
  so_luong: number;
  vi_du?: string | null;
}

export interface BimElementRef {
  model_id: string;
  express_id: number;
  global_id?: string | null;
}

/** Vị trí trong hàng đợi chuyển đổi IFC (RPC bim_hang_doi) */
export interface BimQueueEntry {
  model_id: string;
  vi_tri: number;
  tong_cho: number;
  dang_xu_ly: number;
}

export interface BimTask {
  ma_nhiem_vu: string;
  tieu_de: string;
  trang_thai: string | null;
  tien_do: number | null;
  ngay_bat_dau: string | null;
  ngay_han: string | null;
  ngay_bat_dau_thuc_te: string | null;
  ngay_ket_thuc_thuc_te: string | null;
}

// ── 5D chi phí ─────────────────────────────────────────────
export type BimCostUnit = 'm3' | 'm2' | 'm' | 'kg' | 'cai';

export interface BimUnitPrice {
  id: string;
  project_id: string;
  loai_cau_kien: string;
  vat_lieu?: string | null;
  ma_dinh_muc?: string | null;
  don_vi: BimCostUnit;
  don_gia: number;
  ghi_chu?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Một dòng bóc tách chi phí: khối lượng × đơn giá */
export interface BimCostRow {
  model_id?: string;
  issue?: 'missing_price' | 'missing_quantity' | 'ambiguous_price' | 'invalid_price';
  loai_cau_kien: string;
  vat_lieu: string;
  phan_doan_tang: string;
  so_luong: number;
  khoi_luong: number | null;
  don_vi: BimCostUnit | null;
  don_gia: number | null;
  ma_dinh_muc?: string | null;
  thanh_tien: number | null;
  uoc_tinh_hinh_hoc: boolean;
}

// ── Kiểm tra chất lượng thông tin mô hình (IDS rút gọn) ────
export type BimQualitySeverity = 'loi' | 'canh_bao' | 'thong_tin';

export interface BimQualityIssueRow {
  express_id: number;
  global_id: string;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
}

export interface BimQualityRule {
  id: string;
  label: string;
  description: string;
  severity: BimQualitySeverity;
  count: number;
  total: number;
  samples: BimQualityIssueRow[];
}

export interface BimQualityReport {
  modelId: string;
  totalElements: number;
  score: number;
  rules: BimQualityRule[];
  checkedAt: string;
}

// ── Dò va chạm (clash detection) ───────────────────────────
export interface BimClashRow {
  id: string;
  modelA: string;
  modelB: string;
  idA: number;
  idB: number;
  nameA: string;
  nameB: string;
  categoryA: string;
  categoryB: string;
  guidA?: string;
  guidB?: string;
  /** Thể tích giao nhau (m³) của hai khung bao */
  overlap: number;
  /** Kích thước chồng lấn nhỏ nhất theo 3 trục (m) — độ "cắm sâu" */
  depth: number;
  center: [number, number, number];
  /** Kết quả pha hẹp: mặt cắt nhau · nằm lọt · chỉ theo khung bao */
  kind?: 'cat_nhau' | 'nam_trong' | 'khung_bao';
  verdict?: BimClashVerdict;
  reason?: string;
  status?: BimClashStatus;
  /** id dòng trong bim_va_cham khi đã lưu phiên */
  dbId?: string;
  note?: string | null;
}

export type BimClashStatus = 'moi' | 'dang_xu_ly' | 'da_xu_ly' | 'bo_qua' | 'da_het';
export type BimClashVerdict = 'that' | 'gia' | 'can_xem';

export interface BimClashSession {
  id: string;
  project_id: string;
  ten: string;
  model_a: string;
  model_b: string;
  goc_a?: string | null;
  goc_b?: string | null;
  dung_sai: number;
  che_do: 'khung_bao' | 'luoi';
  so_va_cham: number;
  ten_nguoi_tao?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BimClashRecord {
  id: string;
  phien_id: string;
  project_id: string;
  guid_a: string;
  guid_b: string;
  ten_a?: string | null;
  ten_b?: string | null;
  loai_a?: string | null;
  loai_b?: string | null;
  tam?: [number, number, number] | null;
  do_sau?: number | null;
  nhom?: string | null;
  trang_thai: BimClashStatus;
  danh_gia?: BimClashVerdict | null;
  ly_do_danh_gia?: string | null;
  ghi_chu?: string | null;
  lan_dau: string;
  lan_cuoi: string;
}

export interface BimDataQualityStats {
  so_cau_kien: number;
  co_qto: number;
  co_pset: number;
  uoc_tinh: number;
  khong_khoi_luong: number;
  co_vat_lieu: number;
  co_tang: number;
  co_ten: number;
  proxy: number;
  co_van_khuon: number;
  co_phan_loai: number;
  tinh_luc?: string;
}

export type BimActualState = 'da_nghiem_thu' | 'da_thi_cong' | 'dang_thi_cong' | 'cham' | 'chua_bat_dau';

/** Một dòng của bim_tien_do_thuc_te(): trạng thái thực tế của cấu kiện theo nghiệm thu / nhật ký / công việc */
export interface BimActualProgressRow {
  model_id: string;
  global_id: string;
  trang_thai: BimActualState;
  ngay: string | null;
  nguon: 'nghiem_thu' | 'nhat_ky' | 'thi_cong';
  chi_tiet: string | null;
}

/** Báo cáo tuần tự động (bim_bao_cao_tuan) */
export interface BimWeeklyReport {
  id: number;
  project_id: string;
  tuan_bat_dau: string;
  tuan_ket_thuc: string;
  tao_luc: string;
  nguoi_tao?: string | null;
  noi_dung: {
    ten_du_an?: string | null;
    tu_ngay: string;
    den_ngay: string;
    tu_dong?: boolean;
    vuong_mac: {
      moi: number;
      da_xu_ly: number;
      dang_mo: number;
      qua_han: number;
      uu_tien_cao: number;
      danh_sach_moi: {
        id: string;
        tieu_de: string;
        uu_tien: string;
        trang_thai: string;
        nguoi_xu_ly?: string | null;
      }[];
    };
    va_cham: {
      phien_moi: number;
      so_va_cham_moi: number;
      tong_phien: number;
      phien_gan_nhat?: { ten: string; so_va_cham: number; ngay: string } | null;
    };
    mo_hinh: { tai_len_trong_tuan: number; san_sang: number; loi: number; dang_xu_ly: number; ten_moi: string[] };
    chat_luong: {
      so_cau_kien: number;
      ty_le_khai_bao: number | null;
      ty_le_vat_lieu: number | null;
      so_mo_hinh_cu: number;
    };
    su_dung: { luot: number; nguoi_dung: number; cong_cu: { cong_cu: string; so_lan: number }[] };
    nghiem_thu: { bien_ban_moi: number; dat: number; khong_dat: number; cho_ket_luan: number };
  };
}
