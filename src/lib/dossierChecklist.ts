/**
 * Danh mục thành phần hồ sơ đề nghị (dùng khi tiếp nhận để kiểm tra tính đầy đủ).
 * Căn cứ: Điều 35 NĐ 217/2026/NĐ-CP (thẩm định BCNCKT); Luật Xây dựng 2025 (cấp GPXD).
 * Quản lý như dữ liệu — cập nhật khi văn bản hướng dẫn thay đổi.
 */
import type { ProcedureType } from '../types/domain';

export interface ChecklistItem {
  code: string;
  label: string;
  required: boolean;
  /** Chỉ bắt buộc với dự án thuộc diện này */
  condition?: 'pccc' | 'dau_tu_cong' | 'kinh_doanh';
}

export const DOSSIER_CHECKLISTS: Record<ProcedureType, ChecklistItem[]> = {
  tham_dinh_bcnckt: [
    { code: 'M01', label: 'Tờ trình thẩm định Báo cáo nghiên cứu khả thi (Mẫu số 01)', required: true },
    { code: 'BCNCKT', label: 'Báo cáo nghiên cứu khả thi (thuyết minh + thiết kế cơ sở)', required: true },
    { code: 'CTDT', label: 'Văn bản quyết định / chấp thuận chủ trương đầu tư', required: true },
    { code: 'QH', label: 'Văn bản về quy hoạch (quy hoạch chi tiết / tổng mặt bằng được duyệt)', required: true },
    { code: 'KS', label: 'Hồ sơ khảo sát xây dựng phục vụ lập dự án', required: true },
    { code: 'TT', label: 'Báo cáo kết quả thẩm tra (nếu thuộc diện bắt buộc thẩm tra)', required: false },
    { code: 'PCCC', label: 'Văn bản thẩm duyệt / góp ý thiết kế về PCCC', required: false, condition: 'pccc' },
    { code: 'MT', label: 'Văn bản về môi trường (ĐTM / giấy phép môi trường)', required: false },
    { code: 'NL', label: 'Thông tin năng lực tổ chức, cá nhân lập dự án, khảo sát, thẩm tra', required: true },
    { code: 'TMDT', label: 'Hồ sơ xác định tổng mức đầu tư', required: true, condition: 'dau_tu_cong' },
  ],
  cap_gpxd: [
    { code: 'DON', label: 'Đơn đề nghị cấp giấy phép xây dựng', required: true },
    { code: 'DAT', label: 'Giấy tờ hợp pháp về quyền sử dụng đất', required: true },
    { code: 'KQTD', label: 'Kết quả thẩm định BCNCKT / văn bản phê duyệt dự án', required: true },
    { code: 'BV', label: 'Bản vẽ thiết kế xây dựng (mặt bằng, mặt cắt, mặt đứng, móng, đấu nối)', required: true },
    { code: 'PCCC', label: 'Văn bản thẩm duyệt thiết kế về PCCC', required: false, condition: 'pccc' },
    { code: 'NL', label: 'Thông tin năng lực tổ chức, cá nhân thiết kế', required: true },
  ],
  kiem_tra_nghiem_thu: [
    { code: 'BC', label: 'Báo cáo hoàn thành thi công xây dựng hạng mục / công trình', required: true },
    { code: 'HSHT', label: 'Danh mục hồ sơ hoàn thành công trình', required: true },
    { code: 'NT', label: 'Biên bản nghiệm thu giai đoạn / hạng mục', required: true },
    { code: 'TN', label: 'Kết quả thí nghiệm, kiểm định, quan trắc', required: true },
    { code: 'PCCC', label: 'Văn bản nghiệm thu về PCCC (nếu thuộc diện)', required: false, condition: 'pccc' },
  ],
};

export function missingRequiredDocs(procedureType: ProcedureType, submittedCodes: string[]): ChecklistItem[] {
  return DOSSIER_CHECKLISTS[procedureType].filter((i) => i.required && !submittedCodes.includes(i.code));
}
