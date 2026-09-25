/**
 * Dựng văn bản từ dữ liệu hồ sơ: Mẫu số 03 (Thông báo kết quả thẩm định BCNCKT),
 * Giấy phép xây dựng, Văn bản yêu cầu bổ sung hồ sơ.
 * Nội dung chuyên môn lấy từ dữ liệu thẩm định của hồ sơ; khi chưa có, để trống đánh dấu [....] cho chuyên viên hoàn thiện.
 */
import type { Project } from '../../types/domain';
import type { ProjectAppraisalData } from '../../types/appraisal';
import { formatCurrency, formatDate } from '../utils';
import { heading, p, type AdminDocument } from './model';

const AGENCY_PARENT = 'ỦY BAN NHÂN DÂN TỈNH ĐIỆN BIÊN';
const AGENCY = 'SỞ XÂY DỰNG';
const PLACE = 'Điện Biên';
const BLANK = '[....]';

const LEGAL_BASIS = [
  'Căn cứ Luật Xây dựng số 135/2025/QH15;',
  'Căn cứ Nghị định số 217/2026/NĐ-CP của Chính phủ quy định chi tiết một số nội dung về quản lý hoạt động xây dựng;',
  'Căn cứ Nghị định số 206/2026/NĐ-CP của Chính phủ về quản lý chi phí đầu tư xây dựng;',
];

function signerFrom(appraisal: ProjectAppraisalData | null) {
  const notice = appraisal?.sample03Notice;
  return {
    authority: 'KT. GIÁM ĐỐC',
    title: (notice?.signerTitle ?? 'Phó Giám đốc').toUpperCase().replace(/ SỞ$/, ''),
    name: notice?.signerName ?? 'Nguyễn Văn Hùng',
  };
}

export function buildMau03(project: Project, appraisal: ProjectAppraisalData | null, today: string): AdminDocument {
  const notice = appraisal?.sample03Notice;
  const savings = appraisal?.costEvaluation.savingsTotal ?? project.estimatedSavings;
  const issued = project.workflowState === 'da_phat_hanh' || project.slaStatus === 'da_tham_dinh';

  return {
    kind: 'mau_03',
    agencyParent: AGENCY_PARENT,
    agency: AGENCY,
    number: notice?.docNumber ?? `${BLANK}/SXD-QLXD`,
    place: PLACE,
    dateIso: today,
    docType: 'THÔNG BÁO',
    subject: `Kết quả thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng dự án ${project.name}`,
    recipient: project.investorName,
    paragraphs: [
      ...LEGAL_BASIS.map((t) => p(t, { indent: true })),
      p(
        `Sau khi xem xét ${notice?.submissionDoc ?? `Tờ trình số ${BLANK}`} ngày ${notice?.submissionDate ? formatDate(notice.submissionDate) : BLANK} của ${project.investorName} về việc đề nghị thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng dự án ${project.name}, Sở Xây dựng thông báo kết quả thẩm định như sau:`
      ),
      heading('I. THÔNG TIN CHUNG VỀ DỰ ÁN'),
      p(`1. Tên dự án: ${project.name}.`),
      p(`2. Nhóm dự án: Nhóm ${project.projectGroup}; loại, cấp công trình: ${project.field ?? ''} cấp ${project.buildingGrade}.`),
      p(`3. Chủ đầu tư: ${project.investorName}.`),
      p(`4. Địa điểm xây dựng: ${project.location}, tỉnh Điện Biên.`),
      p(`5. Tổng mức đầu tư đề nghị thẩm định: **${formatCurrency(project.totalInvestment + savings)}**.`),
      heading('II. KẾT QUẢ THẨM ĐỊNH'),
      p(
        `1. Sự phù hợp với quy hoạch: ${project.planningCompliance ? 'Phù hợp với quy hoạch chi tiết được duyệt về chỉ tiêu sử dụng đất, vị trí, chỉ giới xây dựng.' : 'Chưa phù hợp — chủ đầu tư phải hoàn thiện theo ý kiến tại Phụ lục kèm theo.'}`
      ),
      p(
        `2. Danh mục và sự tuân thủ quy chuẩn kỹ thuật, tiêu chuẩn áp dụng: ${project.standardCompliance ? 'Áp dụng đúng quy chuẩn kỹ thuật quốc gia bắt buộc và tiêu chuẩn chủ yếu.' : 'Còn tồn tại nội dung chưa tuân thủ — xem Phụ lục.'}`
      ),
      p(
        `3. An toàn xây dựng, phòng cháy chữa cháy: ${
          project.fireSafetyStatus === 'dat'
            ? `Giải pháp PCCC đáp ứng yêu cầu${appraisal?.fireSafety.agreementNumber ? `; đã có văn bản số ${appraisal.fireSafety.agreementNumber} của ${appraisal.fireSafety.agency}` : ''}.`
            : 'Chưa đủ điều kiện — chờ ý kiến cơ quan Cảnh sát PCCC & CNCH.'
        }`
      ),
      p(
        `4. Tổng mức đầu tư sau thẩm định: **${formatCurrency(project.totalInvestment)}**${savings > 0 ? ` (giảm ${formatCurrency(savings)} so với đề nghị)` : ''}.`
      ),
      ...(notice?.evaluationSummary ? [p(`5. Ý kiến khác: ${notice.evaluationSummary}`)] : []),
      heading('III. KẾT LUẬN'),
      p(
        `Báo cáo nghiên cứu khả thi đầu tư xây dựng dự án **${notice?.conclusion ?? 'đủ điều kiện trình người quyết định đầu tư phê duyệt'}** sau khi chủ đầu tư hoàn thiện các nội dung nêu tại Thông báo này.`
      ),
      p('Chủ đầu tư chịu trách nhiệm về tính chính xác, trung thực của hồ sơ trình thẩm định; tổ chức thực hiện các bước tiếp theo theo quy định tại khoản 5 Điều 26 Luật Xây dựng.'),
    ],
    signer: signerFrom(appraisal),
    recipients: ['Như trên;', 'UBND tỉnh (b/c);', 'Giám đốc Sở (b/c);', 'Lưu: VT, QLXD.'],
    isSigned: issued,
    isDraft: !issued,
  };
}

export function buildGpxd(project: Project, appraisal: ProjectAppraisalData | null, today: string): AdminDocument {
  const permit = appraisal?.permit;
  const tc = permit?.technicalConditions;
  const issued = Boolean(permit?.permitNumber) && project.stage !== 'bcnckt';
  return {
    kind: 'gpxd',
    agencyParent: AGENCY_PARENT,
    agency: AGENCY,
    number: permit?.permitNumber ?? `${BLANK}/GPXD`,
    place: PLACE,
    dateIso: today,
    docType: 'GIẤY PHÉP XÂY DỰNG',
    subject: `Công trình: ${project.name}`,
    paragraphs: [
      p('Căn cứ Luật Xây dựng số 135/2025/QH15;'),
      p('Căn cứ Nghị định số 217/2026/NĐ-CP của Chính phủ quy định chi tiết một số nội dung về quản lý hoạt động xây dựng;'),
      p(`Xét hồ sơ đề nghị cấp giấy phép xây dựng của ${project.investorName},`),
      { runs: [{ text: 'CẤP GIẤY PHÉP XÂY DỰNG CHO:', bold: true }], align: 'center', indent: false },
      p(`1. Chủ đầu tư: **${project.investorName}**.`),
      p(`2. Được phép xây dựng công trình: ${project.name} (cấp ${project.buildingGrade}).`),
      p(`3. Địa điểm xây dựng: ${project.location}, tỉnh Điện Biên.`),
      p(`4. Diện tích xây dựng: ${tc?.allowedGroundArea ?? BLANK}; tổng diện tích sàn: ${tc?.allowedTotalFloorArea ?? BLANK}.`),
      p(`5. Số tầng: ${tc?.allowedStories ?? BLANK}; chiều cao công trình: ${tc?.allowedHeight ?? BLANK}.`),
      ...(tc?.specialRequirements?.length
        ? [p('6. Yêu cầu đối với chủ đầu tư:'), ...tc.specialRequirements.map((r) => p(`- ${r}`))]
        : []),
      p('Giấy phép này có hiệu lực khởi công xây dựng trong thời hạn 12 tháng kể từ ngày cấp; quá thời hạn trên thì phải đề nghị gia hạn giấy phép xây dựng.'),
    ],
    signer: signerFrom(appraisal),
    recipients: ['Chủ đầu tư;', 'UBND xã, phường nơi xây dựng;', 'Lưu: VT, QLXD.'],
    isSigned: issued,
    isDraft: !issued,
  };
}

export function buildYeuCauBoSung(project: Project, items: string[], today: string, signerName = 'Nguyễn Văn Hùng'): AdminDocument {
  return {
    kind: 'yeu_cau_bo_sung',
    agencyParent: AGENCY_PARENT,
    agency: AGENCY,
    number: `${BLANK}/SXD-QLXD`,
    place: PLACE,
    dateIso: today,
    docType: 'V/v đề nghị bổ sung, hoàn thiện hồ sơ trình thẩm định',
    subject: '',
    recipient: project.investorName,
    paragraphs: [
      p(
        `Ngày ${formatDate(project.submissionDate)}, Sở Xây dựng nhận được hồ sơ đề nghị thẩm định dự án ${project.name} (mã hồ sơ ${project.code}) của ${project.investorName}.`
      ),
      p('Căn cứ Điều 35, Điều 36 Nghị định số 217/2026/NĐ-CP, qua kiểm tra, hồ sơ chưa đủ điều kiện để thẩm định. Đề nghị chủ đầu tư bổ sung, hoàn thiện các nội dung sau:'),
      ...(items.length ? items : [BLANK]).map((t, i) => p(`${i + 1}. ${t}`)),
      p(
        'Thời gian thẩm định được tính từ ngày Sở Xây dựng nhận đủ hồ sơ hợp lệ. Quá 20 ngày làm việc kể từ ngày nhận văn bản này mà chủ đầu tư không bổ sung, Sở Xây dựng sẽ trả lại hồ sơ.'
      ),
    ],
    signer: { authority: 'KT. GIÁM ĐỐC', title: 'PHÓ GIÁM ĐỐC', name: signerName },
    recipients: ['Như trên;', 'Lưu: VT, QLXD.'],
    isDraft: true,
  };
}
