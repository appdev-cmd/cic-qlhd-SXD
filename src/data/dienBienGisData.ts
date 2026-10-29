/**
 * Dữ liệu Không gian GIS & Lớp Quy hoạch Xây dựng Tham khảo — Sở Xây dựng Tỉnh Điện Biên
 * Bao gồm:
 * 1. Địa giới khái quát & Tâm hành chính 10 Huyện / Thị xã / Thành phố tỉnh Điện Biên
 * 2. Các Phân vùng Quy hoạch & Hành lang Kiểm soát Xây dựng (QCVN 01:2021/BXD, Tĩnh không, Di tích)
 * 3. Mạng lưới Giao thông Quốc lộ huyết mạch (QL279, QL12, QL6, QL4H) & Thủy hệ chính (Sông Nậm Rốm, Sông Đà, Sông Nậm Mức)
 * 4. Tiện ích chuyển đổi tọa độ VN-2000 (Kinh tuyến trục 103° Điện Biên) & tính khoảng cách tĩnh không
 */

import { formatNumber } from '../lib/utils';

export interface DienBienDistrict {
  id: string;
  code: string;
  name: string;
  shortName: string;
  type: 'thanh_pho' | 'thi_xa' | 'huyen';
  center: [number, number]; // [lat, lng]
  areaKm2: number;
  urbanGrade: string;
  masterPlanRef: string;
  color: string;
  polygon: [number, number][];
}

export interface PlanningZone {
  id: string;
  code: string;
  name: string;
  category: 'do_thi' | 'tinh_khong' | 'di_tich' | 'kkt_cua_khau' | 'du_lich' | 'cong_nghiep';
  categoryLabel: string;
  decisionNumber: string;
  authority: string;
  scale: string;
  maxDensityPercent: number;
  maxHeightMeters: number;
  note: string;
  color: string;
  center: [number, number];
  polygon: [number, number][];
}

export interface GisLineFeature {
  id: string;
  code: string;
  name: string;
  kind: 'national_road' | 'river';
  gradeOrSpec: string;
  color: string;
  weight: number;
  dashArray?: string;
  coordinates: [number, number][];
}

export interface MaterialMine {
  id: string;
  name: string;
  mine_type: 'Đá' | 'Cát' | 'Đất';
  status: 'Đang khai thác' | 'Quy hoạch' | 'Đóng cửa';
  capacity: string;
  address: string;
  coordinates: { lat: number; lng: number };
  notes: string;
}

/** 10 Mỏ vật liệu xây dựng phục vụ dự án đầu tư trên địa bàn Tỉnh Điện Biên */
export const DIEN_BIEN_MATERIAL_MINES: MaterialMine[] = [
  {
    id: 'mine-db-01',
    name: 'Mỏ đá xây dựng C9 Nà Nhạn',
    mine_type: 'Đá',
    status: 'Đang khai thác',
    capacity: '4,8 triệu m³',
    address: 'Xã Nà Nhạn, TP. Điện Biên Phủ, Tỉnh Điện Biên',
    coordinates: { lat: 21.452, lng: 103.058 },
    notes: 'Chuyên cung cấp đá hộc, đá dăm cấp phối CPĐD loại I/II và cốt liệu bê tông xi măng M250–M400.',
  },
  {
    id: 'mine-db-02',
    name: 'Mỏ cát Sông Nậm Rốm – Thanh Xương',
    mine_type: 'Cát',
    status: 'Đang khai thác',
    capacity: '1,6 triệu m³',
    address: 'Xã Thanh Xương, Huyện Điện Biên, Tỉnh Điện Biên',
    coordinates: { lat: 21.348, lng: 103.004 },
    notes: 'Cát xây trát và cát đổ bê tông tiêu chuẩn TCVN 7570:2006 phục vụ cụm công trình TP. Điện Biên Phủ.',
  },
  {
    id: 'mine-db-03',
    name: 'Mỏ đất san lấp Khu đô thị Đông Nam Him Lam',
    mine_type: 'Đất',
    status: 'Đang khai thác',
    capacity: '3,2 triệu m³',
    address: 'Phường Him Lam, TP. Điện Biên Phủ, Tỉnh Điện Biên',
    coordinates: { lat: 21.375, lng: 103.046 },
    notes: 'Đất đồi san lấp đạt độ chặt K95, K98 phục vụ các dự án hạ tầng kỹ thuật và khu dân cư đô thị.',
  },
  {
    id: 'mine-db-04',
    name: 'Mỏ đá vôi Pá Khoang – Mường Phăng',
    mine_type: 'Đá',
    status: 'Đang khai thác',
    capacity: '3,5 triệu m³',
    address: 'Xã Pá Khoang, TP. Điện Biên Phủ, Tỉnh Điện Biên',
    coordinates: { lat: 21.428, lng: 103.112 },
    notes: 'Cung cấp đá xây dựng cho các dự án hạ tầng Khu du lịch Quốc gia Điện Biên Phủ – Pá Khoang.',
  },
  {
    id: 'mine-db-05',
    name: 'Mỏ cát Sông Nậm Mức – Mường Chà',
    mine_type: 'Cát',
    status: 'Đang khai thác',
    capacity: '2,4 triệu m³',
    address: 'Xã Mường Mươn, Huyện Mường Chà, Tỉnh Điện Biên',
    coordinates: { lat: 21.745, lng: 103.028 },
    notes: 'Nguồn cát hạt trung chủ lực phục vụ các dự án dọc hành lang Quốc lộ 12, Mường Chà và Tủa Chùa.',
  },
  {
    id: 'mine-db-06',
    name: 'Mỏ đá xây dựng Bản Phủ – Noong Hẹt',
    mine_type: 'Đá',
    status: 'Đang khai thác',
    capacity: '5,0 triệu m³',
    address: 'Xã Noong Hẹt, Huyện Điện Biên, Tỉnh Điện Biên',
    coordinates: { lat: 21.302, lng: 102.985 },
    notes: 'Cung cấp đá bê tông nhựa nóng (BTN) và đá hộc kè sông Nậm Rốm, Quốc lộ 279 đi Tây Trang.',
  },
  {
    id: 'mine-db-07',
    name: 'Mỏ đá Búng Lao – Tuần Giáo',
    mine_type: 'Đá',
    status: 'Đang khai thác',
    capacity: '6,2 triệu m³',
    address: 'Xã Búng Lao, Huyện Mường Ảng – Tuần Giáo, Tỉnh Điện Biên',
    coordinates: { lat: 21.552, lng: 103.318 },
    notes: 'Mỏ đá công suất lớn phục vụ Cụm công nghiệp Phổ Yên và nâng cấp trục Quốc lộ 279 – Quốc lộ 6.',
  },
  {
    id: 'mine-db-08',
    name: 'Mỏ đất san lấp Thị trấn Điện Biên Đông',
    mine_type: 'Đất',
    status: 'Quy hoạch',
    capacity: '1,8 triệu m³',
    address: 'Thị trấn Điện Biên Đông, Huyện Điện Biên Đông, Tỉnh Điện Biên',
    coordinates: { lat: 21.284, lng: 103.232 },
    notes: 'Quy hoạch mỏ vật liệu san lấp phục vụ kè chống sạt lở và hạ tầng đô thị vùng cao Điện Biên Đông.',
  },
  {
    id: 'mine-db-09',
    name: 'Bãi tập kết cát sỏi Lòng hồ Sông Đà – Mường Lay',
    mine_type: 'Cát',
    status: 'Đang khai thác',
    capacity: '1,2 triệu m³',
    address: 'Phường Sông Đà, Thị xã Mường Lay, Tỉnh Điện Biên',
    coordinates: { lat: 22.048, lng: 103.162 },
    notes: 'Cát sỏi khai thác và trung chuyển đường thủy phục vụ cụm dự án đô thị Mường Lay và Tủa Chùa.',
  },
  {
    id: 'mine-db-10',
    name: 'Mỏ đá Huổi Lèng – Mường Chà',
    mine_type: 'Đá',
    status: 'Quy hoạch',
    capacity: '2,9 triệu m³',
    address: 'Xã Huổi Lèng, Huyện Mường Chà, Tỉnh Điện Biên',
    coordinates: { lat: 21.815, lng: 102.942 },
    notes: 'Mỏ quy hoạch phục vụ tuyến đường liên huyện Mường Chà – Nậm Pồ – Mường Nhé (Quốc lộ 4H).',
  },
];

/** Tọa độ chuẩn Cảng Hàng không Điện Biên (phục vụ kiểm tra phễu tĩnh không) */
export const DIEN_BIEN_AIRPORT_COORD: [number, number] = [21.3975, 103.0078];

/** Tọa độ Trung tâm Hành chính Tỉnh Điện Biên (Quảng trường 7/5 - Phường Him Lam) */
export const DIEN_BIEN_CENTER_COORD: [number, number] = [21.3883, 103.0205];

/** 10 Đơn vị hành chính cấp Huyện / Thị xã / Thành phố thuộc Tỉnh Điện Biên */
export const DIEN_BIEN_DISTRICTS: DienBienDistrict[] = [
  {
    id: 'tp-dien-bien-phu',
    code: '094',
    name: 'TP. Điện Biên Phủ',
    shortName: 'TP. Điện Biên Phủ',
    type: 'thanh_pho',
    center: [21.3883, 103.0205],
    areaKm2: 308.18,
    urbanGrade: 'Đô thị loại II (Tỉnh lỵ)',
    masterPlanRef: 'QĐ 1485/QĐ-UBND Quy hoạch chung TP. Điện Biên Phủ đến năm 2045',
    color: '#0284c7',
    polygon: [
      [21.48, 102.98],
      [21.49, 103.09],
      [21.43, 103.15],
      [21.35, 103.12],
      [21.34, 103.01],
      [21.39, 102.96],
    ],
  },
  {
    id: 'tx-muong-lay',
    code: '095',
    name: 'Thị xã Mường Lay',
    shortName: 'TX. Mường Lay',
    type: 'thi_xa',
    center: [22.0567, 103.1492],
    areaKm2: 112.67,
    urbanGrade: 'Đô thị loại IV (Ven lòng hồ Sông Đà)',
    masterPlanRef: 'QĐ 812/QĐ-UBND Quy hoạch chung TX. Mường Lay đến năm 2040',
    color: '#0891b2',
    polygon: [
      [22.12, 103.08],
      [22.13, 103.21],
      [22.01, 103.22],
      [21.99, 103.1],
    ],
  },
  {
    id: 'h-dien-bien',
    code: '100',
    name: 'Huyện Điện Biên',
    shortName: 'H. Điện Biên',
    type: 'huyen',
    center: [21.315, 103.012],
    areaKm2: 1396.27,
    urbanGrade: 'Vùng động lực Mường Thanh & Cửa khẩu Tây Trang',
    masterPlanRef: 'QĐ 1120/QĐ-UBND Quy hoạch xây dựng vùng huyện Điện Biên',
    color: '#2563eb',
    polygon: [
      [21.52, 102.85],
      [21.5, 103.12],
      [21.34, 103.12],
      [21.08, 103.1],
      [21.05, 102.88],
      [21.22, 102.8],
    ],
  },
  {
    id: 'h-dien-bien-dong',
    code: '101',
    name: 'Huyện Điện Biên Đông',
    shortName: 'H. Điện Biên Đông',
    type: 'huyen',
    center: [21.2764, 103.2201],
    areaKm2: 1206.39,
    urbanGrade: 'Đô thị loại V (Thị trấn Điện Biên Đông)',
    masterPlanRef: 'QĐ 645/QĐ-UBND Quy hoạch chung xây dựng TT. Điện Biên Đông',
    color: '#7c3aed',
    polygon: [
      [21.43, 103.12],
      [21.42, 103.42],
      [21.1, 103.45],
      [21.05, 103.18],
      [21.12, 103.1],
    ],
  },
  {
    id: 'h-muong-ang',
    code: '102',
    name: 'Huyện Mường Ảng',
    shortName: 'H. Mường Ảng',
    type: 'huyen',
    center: [21.5173, 103.2081],
    areaKm2: 443.52,
    urbanGrade: 'Đô thị loại V (Thị trấn Mường Ảng)',
    masterPlanRef: 'QĐ 540/QĐ-UBND Quy hoạch chung đô thị Mường Ảng đến năm 2035',
    color: '#059669',
    polygon: [
      [21.64, 103.12],
      [21.65, 103.32],
      [21.42, 103.32],
      [21.43, 103.12],
    ],
  },
  {
    id: 'h-tuan-giao',
    code: '099',
    name: 'Huyện Tuần Giáo',
    shortName: 'H. Tuần Giáo',
    type: 'huyen',
    center: [21.5878, 103.4216],
    areaKm2: 1136.29,
    urbanGrade: 'Đô thị loại IV dự kiến (Đầu mối QL6 – QL279)',
    masterPlanRef: 'QĐ 930/QĐ-UBND Quy hoạch chung TT. Tuần Giáo & CCN Phổ Yên',
    color: '#0d9488',
    polygon: [
      [21.78, 103.3],
      [21.76, 103.58],
      [21.44, 103.56],
      [21.42, 103.32],
    ],
  },
  {
    id: 'h-tua-chua',
    code: '098',
    name: 'Huyện Tủa Chùa',
    shortName: 'H. Tủa Chùa',
    type: 'huyen',
    center: [21.9056, 103.3758],
    areaKm2: 679.41,
    urbanGrade: 'Đô thị loại V (Thị trấn Tủa Chùa)',
    masterPlanRef: 'QĐ 490/QĐ-UBND Quy hoạch xây dựng vùng huyện Tủa Chùa',
    color: '#d97706',
    polygon: [
      [22.08, 103.22],
      [22.06, 103.52],
      [21.76, 103.5],
      [21.78, 103.24],
    ],
  },
  {
    id: 'h-muong-cha',
    code: '097',
    name: 'Huyện Mường Chà',
    shortName: 'H. Mường Chà',
    type: 'huyen',
    center: [21.775, 103.05],
    areaKm2: 1190.42,
    urbanGrade: 'Đô thị loại V (Thị trấn Mường Chà)',
    masterPlanRef: 'QĐ 585/QĐ-UBND Quy hoạch hành lang kinh tế Quốc lộ 12',
    color: '#4f46e5',
    polygon: [
      [22.0, 102.9],
      [21.99, 103.24],
      [21.64, 103.22],
      [21.52, 102.92],
    ],
  },
  {
    id: 'h-nam-po',
    code: '103',
    name: 'Huyện Nậm Pồ',
    shortName: 'H. Nậm Pồ',
    type: 'huyen',
    center: [21.88, 102.78],
    areaKm2: 1498.12,
    urbanGrade: 'Khu trung tâm hành chính Nà Hỳ',
    masterPlanRef: 'QĐ 412/QĐ-UBND Quy hoạch xây dựng trung tâm huyện lỵ Nậm Pồ',
    color: '#9333ea',
    polygon: [
      [22.06, 102.58],
      [22.0, 102.9],
      [21.64, 102.92],
      [21.68, 102.6],
    ],
  },
  {
    id: 'h-muong-nhe',
    code: '096',
    name: 'Huyện Mường Nhé',
    shortName: 'H. Mường Nhé',
    type: 'huyen',
    center: [22.1883, 102.4497],
    areaKm2: 1573.75,
    urbanGrade: 'Đô thị trung tâm Mường Nhé & cực Tây A Pa Chải',
    masterPlanRef: 'QĐ 395/QĐ-UBND Quy hoạch chung xây dựng đô thị Mường Nhé',
    color: '#ea580c',
    polygon: [
      [22.42, 102.18],
      [22.36, 102.66],
      [22.06, 102.68],
      [21.98, 102.28],
    ],
  },
];

/** 6 Phân vùng Quy hoạch & Hành lang Kiểm soát Xây dựng trọng điểm tỉnh Điện Biên */
export const DIEN_BIEN_PLANNING_ZONES: PlanningZone[] = [
  {
    id: 'qh-tp-dbp-2045',
    code: 'QH-DBP-2045',
    name: 'Quy hoạch chung TP. Điện Biên Phủ & Phụ cận đến năm 2045',
    category: 'do_thi',
    categoryLabel: 'Quy hoạch chung Đô thị (1/10.000)',
    decisionNumber: '1485/QĐ-UBND',
    authority: 'UBND tỉnh Điện Biên',
    scale: '1/10.000 & Phân khu 1/2.000',
    maxDensityPercent: 45,
    maxHeightMeters: 45,
    note: 'Phát triển đô thị đa cực Him Lam – Noong Bua – Nam Thanh Búp kết nối trục sông Nậm Rốm.',
    color: '#0284c7',
    center: [21.382, 103.025],
    polygon: [
      [21.415, 102.995],
      [21.418, 103.052],
      [21.355, 103.055],
      [21.352, 102.998],
    ],
  },
  {
    id: 'qh-tinh-khong-san-bay',
    code: 'TK-CHK-DBP',
    name: 'Phễu Tĩnh không Cảng Hàng không Điện Biên',
    category: 'tinh_khong',
    categoryLabel: 'Hành lang Tĩnh không Hàng không',
    decisionNumber: '458/TC-QC (NĐ 32/2016/NĐ-CP)',
    authority: 'Cục Tác chiến – Bộ Tổng tham mưu',
    scale: 'Bề mặt giới hạn chướng ngại vật',
    maxDensityPercent: 40,
    maxHeightMeters: 28.5,
    note: 'Mọi công trình cao từ 18m trở lên trong bán kính 4km phải có văn bản chấp thuận độ cao tĩnh không.',
    color: '#e11d48',
    center: [21.3975, 103.0078],
    polygon: [
      [21.425, 102.988],
      [21.428, 103.024],
      [21.372, 103.028],
      [21.369, 102.992],
    ],
  },
  {
    id: 'qh-di-tich-dbp',
    code: 'DT-QGDB-DBP',
    name: 'Khoanh vùng Bảo vệ Di tích Quốc gia Đặc biệt Chiến trường Điện Biên Phủ',
    category: 'di_tich',
    categoryLabel: 'Bảo tồn Di tích Quốc gia Đặc biệt',
    decisionNumber: '1215/QĐ-TTg',
    authority: 'Thủ tướng Chính phủ & Bộ VHTTDL',
    scale: '1/2.000 & 1/500 các điểm di tích',
    maxDensityPercent: 20,
    maxHeightMeters: 12,
    note: 'Kiểm soát nghiêm ngặt kiến trúc, màu sắc và chiều cao quanh Đồi A1, Hầm Đờ Cát, Cầu Mường Thanh, Hồng Cúm.',
    color: '#d97706',
    center: [21.384, 103.016],
    polygon: [
      [21.394, 103.008],
      [21.395, 103.026],
      [21.374, 103.025],
      [21.373, 103.009],
    ],
  },
  {
    id: 'qh-kkt-tay-trang',
    code: 'QH-KKT-TT',
    name: 'Quy hoạch Chung Khu Kinh tế Cửa khẩu Quốc tế Tây Trang',
    category: 'kkt_cua_khau',
    categoryLabel: 'Quy hoạch KKT Cửa khẩu (1/5.000)',
    decisionNumber: '980/QĐ-TTg',
    authority: 'Thủ tướng Chính phủ & BQL Khu kinh tế',
    scale: '1/5.000 & Chi tiết 1/500',
    maxDensityPercent: 40,
    maxHeightMeters: 24,
    note: 'Khu kiểm soát liên hợp, kho ngoại quan, thương mại biên giới và hạ tầng đấu nối Quốc lộ 279.',
    color: '#7c3aed',
    center: [21.21, 102.928],
    polygon: [
      [21.235, 102.895],
      [21.238, 102.962],
      [21.182, 102.96],
      [21.18, 102.892],
    ],
  },
  {
    id: 'qh-dlqg-pa-khoang',
    code: 'QH-DL-PK',
    name: 'Khu Du lịch Quốc gia Điện Biên Phủ – Pá Khoang – Mường Phăng',
    category: 'du_lich',
    categoryLabel: 'Quy hoạch Phân khu Du lịch (1/2.000)',
    decisionNumber: '765/QĐ-UBND',
    authority: 'UBND tỉnh Điện Biên',
    scale: '1/2.000',
    maxDensityPercent: 25,
    maxHeightMeters: 15,
    note: 'Khu du lịch sinh thái hồ Pá Khoang & Sở chỉ huy Chiến dịch Mường Phăng; bảo vệ rừng đặc dụng.',
    color: '#059669',
    center: [21.43, 103.11],
    polygon: [
      [21.47, 103.07],
      [21.475, 103.16],
      [21.39, 103.165],
      [21.385, 103.075],
    ],
  },
  {
    id: 'qh-ccn-pho-yen',
    code: 'QH-CCN-PY',
    name: 'Quy hoạch Chi tiết Cụm Công nghiệp Phổ Yên – Tuần Giáo',
    category: 'cong_nghiep',
    categoryLabel: 'Quy hoạch Chi tiết CCN (1/500)',
    decisionNumber: '612/QĐ-UBND',
    authority: 'UBND tỉnh Điện Biên',
    scale: '1/500',
    maxDensityPercent: 60,
    maxHeightMeters: 18,
    note: 'Hạ tầng kỹ thuật đồng bộ trạm xử lý nước thải tập trung, cách ly môi trường và đấu nối QL279.',
    color: '#0d9488',
    center: [21.5878, 103.4216],
    polygon: [
      [21.61, 103.395],
      [21.612, 103.448],
      [21.565, 103.445],
      [21.563, 103.392],
    ],
  },
];

/** Mạng lưới Quốc lộ huyết mạch & Hệ thống Sông chính tỉnh Điện Biên */
export const DIEN_BIEN_LINES: GisLineFeature[] = [
  {
    id: 'ql-279',
    code: 'QL.279',
    name: 'Quốc lộ 279 (Tuần Giáo – Mường Ảng – TP. Điện Biên Phủ – Cửa khẩu Tây Trang)',
    kind: 'national_road',
    gradeOrSpec: 'Đường cấp III miền núi • Trục Đông – Tây',
    color: '#dc2626',
    weight: 3,
    coordinates: [
      [21.62, 103.52],
      [21.5878, 103.4216],
      [21.5173, 103.2081],
      [21.44, 103.08],
      [21.3883, 103.0205],
      [21.312, 103.005],
      [21.215, 102.92],
      [21.205, 102.935],
    ],
  },
  {
    id: 'ql-12',
    code: 'QL.12',
    name: 'Quốc lộ 12 (TP. Điện Biên Phủ – Mường Chà – Thị xã Mường Lay)',
    kind: 'national_road',
    gradeOrSpec: 'Đường cấp III–IV miền núi • Trục Bắc – Nam',
    color: '#ea580c',
    weight: 2.8,
    coordinates: [
      [21.3883, 103.0205],
      [21.435, 103.012],
      [21.6, 103.03],
      [21.775, 103.05],
      [21.92, 103.1],
      [22.0567, 103.1492],
    ],
  },
  {
    id: 'ql-6',
    code: 'QL.6',
    name: 'Quốc lộ 6 (Đèo Pha Đin – Tuần Giáo – Thị xã Mường Lay)',
    kind: 'national_road',
    gradeOrSpec: 'Đường cấp III miền núi • Kết nối Hà Nội – Tây Bắc',
    color: '#d97706',
    weight: 2.8,
    coordinates: [
      [21.56, 103.55],
      [21.5878, 103.4216],
      [21.75, 103.32],
      [21.9, 103.22],
      [22.0567, 103.1492],
    ],
  },
  {
    id: 'ql-4h',
    code: 'QL.4H',
    name: 'Quốc lộ 4H (Mường Chà – Nậm Pồ – Mường Nhé – A Pa Chải)',
    kind: 'national_road',
    gradeOrSpec: 'Đường cấp IV miền núi • Hành lang biên giới phía Tây',
    color: '#ca8a04',
    weight: 2.5,
    dashArray: '6 4',
    coordinates: [
      [21.775, 103.05],
      [21.825, 102.85],
      [21.88, 102.78],
      [22.05, 102.6],
      [22.1883, 102.4497],
      [22.38, 102.22],
    ],
  },
  {
    id: 'song-nam-rom',
    code: 'S.Nậm Rốm',
    name: 'Sông Nậm Rốm (Trục cảnh quan trung tâm TP. Điện Biên Phủ & Cánh đồng Mường Thanh)',
    kind: 'river',
    gradeOrSpec: 'Lưu vực Nậm Rốm • Hành lang thoát lũ đô thị',
    color: '#0284c7',
    weight: 3,
    coordinates: [
      [21.48, 103.03],
      [21.435, 103.018],
      [21.393, 103.022],
      [21.385, 103.015],
      [21.365, 103.012],
      [21.312, 103.0],
      [21.24, 102.97],
    ],
  },
  {
    id: 'song-da',
    code: 'S.Đà',
    name: 'Sông Đà & Lòng hồ Thủy điện Sơn La (Mường Lay – Tủa Chùa)',
    kind: 'river',
    gradeOrSpec: 'Đường thủy nội địa cấp III • Cao trình dâng bình thường +215m',
    color: '#0369a1',
    weight: 4,
    coordinates: [
      [22.12, 103.08],
      [22.0567, 103.1492],
      [22.02, 103.28],
      [21.95, 103.42],
      [21.85, 103.5],
    ],
  },
  {
    id: 'song-nam-muc',
    code: 'S.Nậm Mức',
    name: 'Sông Nậm Mức (Mường Chà – Tủa Chùa – Mường Lay)',
    kind: 'river',
    gradeOrSpec: 'Phụ lưu Sông Đà • Kiểm soát sạt lở bờ sông',
    color: '#0ea5e9',
    weight: 2.5,
    coordinates: [
      [21.72, 102.98],
      [21.82, 103.12],
      [21.902, 103.372],
      [22.01, 103.22],
    ],
  },
];

/**
 * Chuyển đổi xấp xỉ tọa độ WGS84 (lat, lng) sang Hệ tọa độ phẳng VN-2000
 * Kinh tuyến trục L0 = 103°00' (Tỉnh Điện Biên, k0 = 0.9999, False Easting = 500.000m)
 */
export function wgs84ToVn2000DienBien(lat: number, lng: number): { x: number; y: number; formatted: string } {
  const latRad = (lat * Math.PI) / 180;
  const dLng = lng - 103.0; // Kinh tuyến trục Điện Biên 103°00'E
  const dLngRad = (dLng * Math.PI) / 180;
  // Bán kính cong và quy đổi Gauss-Krüger múi 3°
  const x = Math.round(lat * 110574.2 + 1250 * Math.sin(2 * latRad));
  const y = Math.round(500000 + dLngRad * 6378137 * Math.cos(latRad) * 0.9999);
  return {
    x,
    y,
    formatted: `X: ${formatNumber(x)} m • Y: ${formatNumber(y)} m`,
  };
}

/**
 * Tính khoảng cách đường chim bay (km) giữa 2 tọa độ WGS84 theo công thức Haversine
 */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Nhận diện mã địa bàn Huyện / Thị / Thành phố từ chuỗi địa điểm dự án
 */
export function matchDienBienDistrict(locationText: string): DienBienDistrict | undefined {
  const text = (locationText || '').toLowerCase();
  if (text.includes('mường ảng')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-muong-ang');
  if (text.includes('mường lay')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'tx-muong-lay');
  if (text.includes('điện biên đông')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-dien-bien-dong');
  if (text.includes('tuần giáo') || text.includes('phổ yên'))
    return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-tuan-giao');
  if (text.includes('tủa chùa')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-tua-chua');
  if (text.includes('mường nhé')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-muong-nhe');
  if (text.includes('nậm pồ')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-nam-po');
  if (text.includes('mường chà')) return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-muong-cha');
  if (
    text.includes('huyện điện biên') ||
    text.includes('sam mứn') ||
    text.includes('thanh xương') ||
    text.includes('pom lót') ||
    text.includes('thanh nưa') ||
    text.includes('thanh an') ||
    text.includes('na ư')
  ) {
    return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'h-dien-bien');
  }
  if (
    text.includes('điện biên phủ') ||
    text.includes('him lam') ||
    text.includes('mường thanh') ||
    text.includes('noong bua') ||
    text.includes('thanh bình') ||
    text.includes('nam thanh') ||
    text.includes('tân thanh')
  ) {
    return DIEN_BIEN_DISTRICTS.find((d) => d.id === 'tp-dien-bien-phu');
  }
  return undefined;
}

/**
 * Tìm phân vùng quy hoạch tương ứng gần nhất hoặc bao chứa dự án
 */
export function matchPlanningZone(lat: number | null | undefined, lng: number | null | undefined): PlanningZone {
  if (lat == null || lng == null) return DIEN_BIEN_PLANNING_ZONES[0];
  // Kiểm tra khoảng cách tới tâm các phân vùng đặc thù trước
  if (haversineDistanceKm(lat, lng, 21.21, 102.928) <= 6) {
    return DIEN_BIEN_PLANNING_ZONES.find((z) => z.id === 'qh-kkt-tay-trang')!;
  }
  if (haversineDistanceKm(lat, lng, 21.5878, 103.4216) <= 8) {
    return DIEN_BIEN_PLANNING_ZONES.find((z) => z.id === 'qh-ccn-pho-yen')!;
  }
  if (haversineDistanceKm(lat, lng, 21.3975, 103.0078) <= 3.5) {
    return DIEN_BIEN_PLANNING_ZONES.find((z) => z.id === 'qh-tinh-khong-san-bay')!;
  }
  if (haversineDistanceKm(lat, lng, 21.384, 103.016) <= 2.2) {
    return DIEN_BIEN_PLANNING_ZONES.find((z) => z.id === 'qh-di-tich-dbp')!;
  }
  return DIEN_BIEN_PLANNING_ZONES[0];
}
