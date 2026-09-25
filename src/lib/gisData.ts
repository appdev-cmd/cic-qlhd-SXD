/**
 * Dữ liệu Tọa độ GIS và Quy hoạch Tỉnh Điện Biên
 * Phục vụ Tích hợp Google Maps & Bản đồ Không gian Xây dựng
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GisZoningArea {
  id: string;
  name: string;
  category: 'do_thi' | 'cong_nghiep' | 'ha_tang' | 'du_lich' | 'bao_ton';
  color: string;
  fillOpacity: number;
  coordinates: [number, number][]; // [lat, lng][]
  description: string;
}

// Tâm hành chính Tỉnh Điện Biên (TP. Điện Biên Phủ)
export const DIEN_BIEN_CENTER: LatLng = {
  lat: 21.3883,
  lng: 103.0205,
};

export const DIEN_BIEN_DEFAULT_ZOOM = 11;

// Tọa độ chi tiết chính xác của 26 Dự án Thẩm định tại Tỉnh Điện Biên
export const PROJECT_COORDINATES: Record<string, LatLng> = {
  // 6 Dự án Khởi tạo chính
  'proj-001': { lat: 21.5173, lng: 103.2081 }, // BVĐK Mường Ảng
  'proj-002': { lat: 21.3973, lng: 103.0076 }, // Cảng hàng không Điện Biên Phủ
  'proj-003': { lat: 22.0567, lng: 103.1492 }, // Kè chống sạt lở TX Mường Lay (Sông Đà)
  'proj-004': { lat: 21.2764, lng: 103.2201 }, // Đường liên xã Keo Lôm - H. Điện Biên Đông
  'proj-005': { lat: 21.3888, lng: 103.0245 }, // Trụ sở HĐND - UBND Tỉnh (Him Lam, TP. ĐBP)
  'proj-006': { lat: 21.5878, lng: 103.4216 }, // Hệ thống cấp nước Huyện Tuần Giáo

  // 20 Dự án Bổ sung trải đều 10 huyện thị thành phố
  'proj-007': { lat: 21.3820, lng: 103.0125 }, // CDC Tỉnh Điện Biên (Thanh Bình, TP. ĐBP)
  'proj-008': { lat: 21.3750, lng: 103.0380 }, // THPT Chuyên Lê Quý Đôn CS2 (Noong Bua)
  'proj-009': { lat: 21.3650, lng: 103.0180 }, // Khu đô thị Nam Thanh Búp
  'proj-010': { lat: 21.3780, lng: 103.0420 }, // Công viên hồ điều hòa Noong Bua
  'proj-011': { lat: 21.8250, lng: 102.8500 }, // Đường Mường Chà - Nậm Pồ
  'proj-012': { lat: 21.9056, lng: 103.3758 }, // TTTTT Huyện Tủa Chùa
  'proj-013': { lat: 21.9020, lng: 103.3720 }, // Bến xe & Chợ trung tâm Tủa Chùa
  'proj-014': { lat: 21.3120, lng: 103.0050 }, // Thủy lợi cánh đồng Mường Thanh (Sam Mứn)
  'proj-015': { lat: 21.3910, lng: 103.0100 }, // Cầu vượt sông Nậm Rốm (Nam Thanh - Thanh Trường)
  'proj-016': { lat: 21.3850, lng: 103.0210 }, // Nhà thi đấu Đa năng Tỉnh (Tân Thanh)
  'proj-017': { lat: 21.5250, lng: 103.2200 }, // Nhà máy XLCTR sinh hoạt Mường Ảng
  'proj-018': { lat: 22.1883, lng: 102.4497 }, // Đường tuần tra biên giới Mường Nhé (Mốc 0 - 16)
  'proj-019': { lat: 21.2850, lng: 103.0150 }, // CCN Na Hai (Pom Lót, H. Điện Biên)
  'proj-020': { lat: 21.2150, lng: 102.9200 }, // Cải tạo QL279 đoạn Cửa khẩu Quốc tế Tây Trang
  'proj-021': { lat: 21.5120, lng: 103.2040 }, // PTDTNT THCS Mường Ảng
  'proj-022': { lat: 21.3930, lng: 103.0290 }, // KS Mường Thanh Điện Biên 2 (Him Lam)
  'proj-023': { lat: 21.3870, lng: 103.0190 }, // Trung tâm Hội nghị & Triển lãm Tỉnh
  'proj-024': { lat: 21.4350, lng: 103.0120 }, // Nghĩa trang Độc Lập & CV tưởng niệm (Thanh Nưa)
  'proj-025': { lat: 21.3895, lng: 103.0175 }, // Đập dâng tạo cảnh quan sông Nậm Rốm
  'proj-026': { lat: 21.2050, lng: 102.9350 }, // Nhà máy nước sạch Na Ư (Cửa khẩu Tây Trang)
};

/**
 * Trả về tọa độ địa lý chính xác của dự án theo ID hoặc nội suy từ địa điểm
 */
export function getProjectCoordinates(projectId: string, location?: string): LatLng {
  if (PROJECT_COORDINATES[projectId]) {
    return PROJECT_COORDINATES[projectId];
  }

  const loc = (location || '').toLowerCase();
  if (loc.includes('mường ảng')) return { lat: 21.5173, lng: 103.2081 };
  if (loc.includes('mường lay')) return { lat: 22.0567, lng: 103.1492 };
  if (loc.includes('tuần giáo')) return { lat: 21.5878, lng: 103.4216 };
  if (loc.includes('điện biên đông')) return { lat: 21.2764, lng: 103.2201 };
  if (loc.includes('tủa chùa')) return { lat: 21.9056, lng: 103.3758 };
  if (loc.includes('mường chà')) return { lat: 21.7828, lng: 103.0645 };
  if (loc.includes('mường nhé')) return { lat: 22.1883, lng: 102.4497 };
  if (loc.includes('nậm pồ')) return { lat: 21.8741, lng: 102.6622 };
  if (loc.includes('tây trang') || loc.includes('na ư')) return { lat: 21.205, lng: 102.935 };

  // Mặc định tâm TP. Điện Biên Phủ với độ lệch ngẫu nhiên nhẹ để không đè lên nhau
  const hash = projectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const deltaLat = ((hash % 100) - 50) * 0.0008;
  const deltaLng = (((hash * 7) % 100) - 50) * 0.0008;

  return {
    lat: DIEN_BIEN_CENTER.lat + deltaLat,
    lng: DIEN_BIEN_CENTER.lng + deltaLng,
  };
}

// Đường ranh giới hành chính Tỉnh Điện Biên (Polygon bao quanh)
export const DIEN_BIEN_PROVINCE_BOUNDARY: [number, number][] = [
  [22.4200, 102.1500], // Cực Tây A Pa Chải (Mường Nhé - Ngã ba biên giới)
  [22.3800, 102.4500],
  [22.3200, 102.7500],
  [22.1500, 103.1200], // Giáp Lai Châu (Mường Lay)
  [22.0567, 103.2200],
  [21.9200, 103.4500], // Tủa Chùa giáp Quỳnh Nhai (Sơn La)
  [21.6500, 103.5800], // Đèo Pha Đin (Tuần Giáo giáp Thuận Châu)
  [21.4200, 103.4200],
  [21.2200, 103.3200], // Điện Biên Đông giáp Sông Mã (Sơn La)
  [21.1200, 103.1800],
  [21.1500, 102.9200], // Biên giới Việt - Lào (Tây Trang)
  [21.3200, 102.7500],
  [21.5500, 102.5000], // Biên giới Nậm Pồ
  [21.8500, 102.3200],
  [22.1500, 102.2000],
  [22.4200, 102.1500], // Khép góc A Pa Chải
];

// Các vùng quy hoạch trọng điểm tỉnh Điện Biên
export const DIEN_BIEN_ZONING_AREAS: GisZoningArea[] = [
  {
    id: 'zone-01',
    name: 'Vùng Đô thị Lõi & Trung tâm Hành chính TP. Điện Biên Phủ',
    category: 'do_thi',
    color: '#0284c7', // Sky blue
    fillOpacity: 0.18,
    description: 'Quy hoạch phân khu đô thị trung tâm, mật độ xây dựng khống chế 35-45%, tầng cao tối đa 9 tầng.',
    coordinates: [
      [21.4100, 103.0000],
      [21.4150, 103.0450],
      [21.3650, 103.0550],
      [21.3550, 103.0150],
      [21.3800, 102.9900],
    ],
  },
  {
    id: 'zone-02',
    name: 'Vành đai Cảng Hàng không Điện Biên & Logistics Tây Bắc',
    category: 'ha_tang',
    color: '#f59e0b', // Amber
    fillOpacity: 0.16,
    description: 'Vùng đệm tĩnh không sân bay và hành lang dự trữ mở rộng đường băng 2.400m đón máy bay A321.',
    coordinates: [
      [21.4150, 103.0000],
      [21.4180, 103.0180],
      [21.3850, 103.0120],
      [21.3820, 102.9950],
    ],
  },
  {
    id: 'zone-03',
    name: 'Vùng Cụm Công nghiệp & Tiểu thủ CN Na Hai - Pom Lót',
    category: 'cong_nghiep',
    color: '#10b981', // Emerald
    fillOpacity: 0.18,
    description: 'Cụm công nghiệp chế biến nông lâm sản Tây Bắc và vật liệu xây dựng thân thiện môi trường.',
    coordinates: [
      [21.2950, 103.0050],
      [21.2980, 103.0300],
      [21.2720, 103.0280],
      [21.2700, 103.0020],
    ],
  },
  {
    id: 'zone-04',
    name: 'Khu Đô thị Mới Nam Thanh Búp & Công viên Sinh thái Nam Sông Nậm Rốm',
    category: 'do_thi',
    color: '#8b5cf6', // Violet
    fillOpacity: 0.16,
    description: 'Khu đô thị sinh thái kết hợp thương mại dịch vụ quy mô 85 ha, chỉ giới lùi bờ sông tối thiểu 20m.',
    coordinates: [
      [21.3720, 103.0100],
      [21.3700, 103.0320],
      [21.3550, 103.0280],
      [21.3580, 103.0080],
    ],
  },
];

// Dark Map Styles cho Google Maps (phù hợp Dark Mode của Sở Xây dựng)
export const GOOGLE_MAP_DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f2c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#00668c' }, { weight: 1.5 }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#142926' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#273549' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#e07a22' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#7c2d12' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f394d' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#092138' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#38bdf8' }],
  },
];
