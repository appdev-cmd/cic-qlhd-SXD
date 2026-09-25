/**
 * Xác định cơ quan có thẩm quyền giải quyết hồ sơ (Điều 32 NĐ 217/2026/NĐ-CP — thẩm định BCNCKT;
 * phân cấp cấp GPXD theo Luật Xây dựng 2025 & NĐ 217/2026). Quy tắc là dữ liệu có trích dẫn;
 * kết quả chỉ là gợi ý — cán bộ tiếp nhận quyết định cuối cùng.
 */
import type { InvestmentForm, ProcedureType, Project } from '../types/domain';

export type Authority = 'so_xay_dung' | 'ubnd_cap_xa' | 'bo_chuyen_nganh' | 'hoi_dong_tham_dinh_nn';

export const AUTHORITY_LABELS: Record<Authority, string> = {
  so_xay_dung: 'Sở Xây dựng tỉnh Điện Biên',
  ubnd_cap_xa: 'Cơ quan chuyên môn thuộc UBND cấp xã',
  bo_chuyen_nganh: 'Bộ quản lý công trình xây dựng chuyên ngành',
  hoi_dong_tham_dinh_nn: 'Hội đồng thẩm định nhà nước',
};

export interface JurisdictionInput {
  procedureType: ProcedureType;
  projectGroup: Project['projectGroup'];
  buildingGrade: Project['buildingGrade'];
  investmentForm: InvestmentForm;
  /** Dự án do UBND cấp xã quyết định đầu tư */
  decidedByCommune?: boolean;
  /** Dự án kinh doanh có công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng (Phụ lục IV) */
  isAppendixIV?: boolean;
  /** Nhà ở riêng lẻ */
  isDetachedHouse?: boolean;
}

export interface JurisdictionResult {
  authority: Authority;
  isSoXayDung: boolean;
  reason: string;
  citation: string;
}

export function determineJurisdiction(input: JurisdictionInput): JurisdictionResult {
  const soXd = (reason: string, citation: string): JurisdictionResult => ({
    authority: 'so_xay_dung',
    isSoXayDung: true,
    reason,
    citation,
  });
  const other = (authority: Authority, reason: string, citation: string): JurisdictionResult => ({
    authority,
    isSoXayDung: false,
    reason,
    citation,
  });

  if (input.procedureType === 'cap_gpxd') {
    const citation = 'Luật Xây dựng 2025; NĐ 217/2026/NĐ-CP (phân cấp cấp GPXD)';
    if (input.isDetachedHouse) return other('ubnd_cap_xa', 'Nhà ở riêng lẻ do UBND cấp xã cấp GPXD.', citation);
    if (input.buildingGrade === 'DB') {
      return other('bo_chuyen_nganh', 'Công trình cấp đặc biệt không thuộc thẩm quyền cấp phép của Sở.', citation);
    }
    if (input.buildingGrade === 'I' || input.buildingGrade === 'II') {
      return soXd(`Công trình cấp ${input.buildingGrade} thuộc thẩm quyền cấp GPXD của Sở Xây dựng.`, citation);
    }
    return other('ubnd_cap_xa', `Công trình cấp ${input.buildingGrade} do UBND cấp xã cấp GPXD.`, citation);
  }

  if (input.procedureType === 'kiem_tra_nghiem_thu') {
    return soXd('Kiểm tra công tác nghiệm thu công trình trên địa bàn tỉnh.', 'NĐ 207/2026/NĐ-CP');
  }

  // Thẩm định BCNCKT — Điều 32 NĐ 217/2026/NĐ-CP
  const citation = 'Điều 32 NĐ 217/2026/NĐ-CP';
  if (input.projectGroup === 'QG') {
    return other('hoi_dong_tham_dinh_nn', 'Dự án quan trọng quốc gia do Hội đồng thẩm định nhà nước thẩm định.', citation);
  }
  if (input.buildingGrade === 'DB') {
    return other('bo_chuyen_nganh', 'Dự án có công trình cấp đặc biệt thuộc thẩm quyền Bộ quản lý chuyên ngành.', citation);
  }
  if (input.decidedByCommune) {
    return other('ubnd_cap_xa', 'Dự án do UBND cấp xã quyết định đầu tư do cơ quan chuyên môn cấp xã thẩm định.', citation);
  }
  if (input.investmentForm === 'dau_tu_cong') return soXd('Dự án đầu tư công trên địa bàn tỉnh.', citation);
  if (input.investmentForm === 'ppp') return soXd('Dự án PPP do cơ quan cấp tỉnh là cơ quan có thẩm quyền.', citation);
  if (input.isAppendixIV) {
    return soXd('Dự án kinh doanh có công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng (Phụ lục IV).', citation);
  }
  return other(
    'ubnd_cap_xa',
    'Dự án đầu tư kinh doanh không có công trình thuộc Phụ lục IV — không thuộc diện Sở Xây dựng thẩm định.',
    citation
  );
}
