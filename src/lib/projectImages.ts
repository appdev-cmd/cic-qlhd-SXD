/**
 * Quản lý Hình ảnh Đại diện & Thư viện Ảnh Dự án Thông minh theo Chuẩn Ngữ nghĩa Kiến trúc Xây dựng Việt Nam
 * Tương thích và kế thừa giải pháp từ qlda-ddcn-ht-selfhost
 */

import type { ProjectImage } from '../types/domain';

export interface ProjectImageContext {
  imageUrl?: string | null;
  projectName?: string | null;
  buildingGrade?: string | null;
  projectGroup?: string | null;
  location?: string | null;
  projectId?: string | null;
}

// Chuẩn hóa chuỗi tiếng Việt không dấu để matching chính xác
export function normalizeVietnameseText(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim();
}

/**
 * Tự động xác định hình ảnh phối cảnh đại diện cho dự án
 */
export function getProjectImage(ctx: ProjectImageContext): string {
  // Nếu dự án đã có ảnh trực tiếp và là ảnh hợp lệ thì ưu tiên
  if (ctx.imageUrl && ctx.imageUrl.trim() !== '' && !ctx.imageUrl.includes('unsplash.com')) {
    return ctx.imageUrl;
  }

  const text = normalizeVietnameseText(`${ctx.projectName || ''} ${ctx.location || ''}`);

  // 1. Cầu cống, cầu treo, cầu vượt sông
  if (/(cau |cau vuot|cau treo|cau can|cau song|thanh binh|nam nhe|nam rom)/i.test(text)) {
    if (/(treo|dan sinh|ban lang|vung sau)/i.test(text)) {
      return '/images/projects/bridge/bridge_rural_01.jpg';
    }
    return '/images/projects/bridge/bridge_river_01.jpg';
  }

  // 2. Y tế & Bệnh viện, Trạm y tế
  if (/(benh vien|y te|kham chua benh|tram y te|dieu tri|phong kham|nhi|da khoa|sam mun)/i.test(text)) {
    if (/(tram y te|co so 2|phong kham)/i.test(text)) {
      return '/images/projects/hospital/hospital_clinic_01.jpg';
    }
    return '/images/projects/hospital/hospital_01.jpg';
  }

  // 3. Giáo dục - Trường học, Khu nội trú, Mầm non, Tiểu học, THPT
  if (/(truong|noi tru|thcs|thpt|tieu hoc|mam non|hoc vien|giao duc|dao tao|dien bien dong|be van dan|hoa ban|tua chua)/i.test(text)) {
    if (/(mam non|hoa ban|mau giao)/i.test(text)) {
      return '/images/projects/school/school_kindergarten_01.jpg';
    }
    if (/(tieu hoc|be van dan)/i.test(text)) {
      return '/images/projects/school/school_primary_01.jpg';
    }
    return '/images/projects/school/school_campus_01.jpg';
  }

  // 4. Đê kè, Thủy lợi, Chống sạt lở sông suối
  if (/(de |ke |thuy loi|ho chua|dap|sat lo|nam muc|ke song)/i.test(text)) {
    return '/images/projects/dyke_embankment/dyke_sea_01.jpg';
  }

  // 5. Thể dục thể thao, Sân vận động, Nhà thi đấu
  if (/(the thao|san van dong|nha thi dau|huan luyen|lien hop)/i.test(text)) {
    return '/images/projects/culture_sports/sports_stadium_01.jpg';
  }

  // 6. Văn hóa, Hội nghị, Triển lãm, Di tích, Nhà văn hóa, Quảng trường
  if (/(hoi nghi|trien lam|di tich|chien truong|quang truong|van hoa|bao tang|dien bien phu)/i.test(text)) {
    if (/(quang truong|cong vien canh quan)/i.test(text)) {
      return '/images/projects/culture_sports/square_beach_01.jpg';
    }
    return '/images/projects/culture_sports/cultural_house_01.jpg';
  }

  // 7. Nhà ở tái định cư, Nhà ở xã hội
  if (/(tai dinh cu|nha o xa hoi|noong bua|khu dan cu)/i.test(text)) {
    return '/images/projects/resettlement/resettlement_01.jpg';
  }

  // 8. Nhà ở thương mại liền kề, Phố đi bộ, Hỗn hợp
  if (/(nha o|lien ke|pho di bo|muong thanh|khu do thi|can ho)/i.test(text)) {
    return '/images/projects/specialties/mixed.jpg';
  }

  // 9. Công nghiệp, Nhà máy, Thảo dược, Nông lâm sản, Chế biến
  if (/(nha may|che bien|nong lam san|thao duoc|na hai|cum cong nghiep)/i.test(text)) {
    return '/images/projects/specialties/civil_industrial.jpg';
  }

  // 10. Giao thông - Đường liên huyện, Miền núi, Nông thôn
  if (/(lien huyen|nam po|muong cha|quoc lo 4h|nong thon)/i.test(text)) {
    return '/images/projects/road/road_rural_01.jpg';
  }

  // 11. Giao thông - Đường đô thị, Đại lộ 7/5, Chiếu sáng thông minh, Bến xe
  if (/(dai lo|chieu sang|ben xe|ben xe khach|do thi)/i.test(text)) {
    if (/(ben xe)/i.test(text)) {
      return '/images/projects/specialties/transport_urban.jpg';
    }
    return '/images/projects/road/road_urban_01.jpg';
  }

  // 12. Giao thông - Quốc lộ, Tuyến đường nối Tây Trang, Đường ven sông
  if (/(duong|tuyen duong|quoc lo|tinh lo|giao thong|tay trang|noi tp|mo rong)/i.test(text)) {
    return '/images/projects/road/road_coastal_01.jpg';
  }

  // 13. Nông nghiệp công nghệ cao, Cánh đồng Mường Thanh
  if (/(canh dong|muong thanh|nong nghiep|cong nghe cao)/i.test(text)) {
    return '/images/projects/specialties/agriculture_rural.jpg';
  }

  // 14. Trụ sở cơ quan, Ban ngành, Kiểm soát cửa khẩu, Trung tâm thương mại
  if (/(tru lu|so xay dung|so tn&mt|lien co quan|ban quan ly|cua khau|plaza|khach san)/i.test(text)) {
    return '/images/projects/government_office/government_office_01.jpg';
  }

  // 15. Cấp thoát nước, Xử lý môi trường, Trạm xử lý nước thải
  if (/(cap nuoc|thoat nuoc|nuoc thai|thu gom|moi truong|ha tang|muong ang|pho yen|tuan giao)/i.test(text)) {
    return '/images/projects/infrastructure_environment/water_treatment_01.jpg';
  }

  // Mặc định
  return '/images/projects/government_office/government_office_01.jpg';
}

/**
 * Sinh danh sách 4-5 ảnh thư viện tư liệu phối cảnh, hiện trạng, bản vẽ cho từng dự án
 */
export function generateProjectGallery(projectName: string, location: string): ProjectImage[] {
  const primaryImg = getProjectImage({ projectName, location });
  const text = normalizeVietnameseText(`${projectName} ${location}`);

  let secondary3D = '/images/projects/government_office/government_office_01.jpg';
  let siteImg = '/images/projects/dyke_embankment/dyke_sea_01.jpg';
  let surveyImg = '/images/projects/road/road_rural_01.jpg';

  if (text.includes('cau')) {
    secondary3D = '/images/projects/bridge/bridge_rural_01.jpg';
    siteImg = '/images/projects/dyke_embankment/dyke_sea_01.jpg';
    surveyImg = '/images/projects/road/road_coastal_01.jpg';
  } else if (text.includes('duong') || text.includes('giao thong')) {
    secondary3D = '/images/projects/road/road_urban_01.jpg';
    siteImg = '/images/projects/road/road_rural_01.jpg';
    surveyImg = '/images/projects/specialties/transport_urban.jpg';
  } else if (text.includes('truong')) {
    secondary3D = '/images/projects/school/school_primary_01.jpg';
    siteImg = '/images/projects/school/school_campus_01.jpg';
    surveyImg = '/images/projects/culture_sports/sports_stadium_01.jpg';
  } else if (text.includes('y te') || text.includes('benh vien')) {
    secondary3D = '/images/projects/hospital/hospital_clinic_01.jpg';
    siteImg = '/images/projects/resettlement/resettlement_01.jpg';
    surveyImg = '/images/projects/infrastructure_environment/water_treatment_01.jpg';
  } else if (text.includes('the thao') || text.includes('san van dong')) {
    secondary3D = '/images/projects/culture_sports/square_beach_01.jpg';
    siteImg = '/images/projects/resettlement/resettlement_01.jpg';
    surveyImg = '/images/projects/culture_sports/cultural_house_01.jpg';
  } else if (text.includes('nha may') || text.includes('cum cong nghiep')) {
    secondary3D = '/images/projects/specialties/civil_industrial.jpg';
    siteImg = '/images/projects/infrastructure_environment/water_treatment_01.jpg';
    surveyImg = '/images/projects/specialties/technical_infrastructure.jpg';
  }

  return [
    {
      id: `img-${Date.now()}-1`,
      url: primaryImg,
      thumbnailUrl: primaryImg,
      title: `Phối cảnh 3D Tổng thể Công trình ${projectName.slice(0, 45)}...`,
      category: 'phoi_canh',
      categoryLabel: 'Phối cảnh 3D',
      date: '15/05/2026',
      author: 'Tổ Thẩm tra Thiết kế Sở Xây dựng',
      description: 'Phương án kiến trúc được phê duyệt, đảm bảo quy chuẩn xây dựng và bản sắc văn hóa Điện Biên.',
      isPrimary: true,
    },
    {
      id: `img-${Date.now()}-2`,
      url: secondary3D,
      thumbnailUrl: secondary3D,
      title: 'Phối cảnh Chi tiết Hạng mục Chính & Cảnh quan Phụ trợ',
      category: 'phoi_canh',
      categoryLabel: 'Phối cảnh 3D',
      date: '18/05/2026',
      author: 'Đơn vị Tư vấn Thiết kế',
      description: 'Đồng bộ giải pháp kết cấu, hạ tầng kỹ thuật, đường nội bộ và cảnh quan cây xanh.',
    },
    {
      id: `img-${Date.now()}-3`,
      url: siteImg,
      thumbnailUrl: siteImg,
      title: `Hiện trạng Thực địa Khu đất Xây dựng tại ${location.split(',')[0]}`,
      category: 'hien_trang',
      categoryLabel: 'Hiện trạng thực địa',
      date: '20/07/2026',
      author: 'Đoàn Khảo sát Hiện trường SXD',
      description: 'Khảo sát địa hình, đối soát mốc giới GPMB và hiện trạng hạ tầng đấu nối xung quanh.',
    },
    {
      id: `img-${Date.now()}-4`,
      url: surveyImg,
      thumbnailUrl: surveyImg,
      title: 'Khảo sát Địa chất & Khoan thăm dò Hiện trường',
      category: 'tien_do',
      categoryLabel: 'Tiến độ thực địa',
      date: '10/08/2026',
      author: 'Nhà thầu Khảo sát Địa chất',
      description: 'Báo cáo khảo sát địa tầng, kiểm tra mực nước ngầm và tầng chịu lực móng công trình.',
    },
  ];
}
