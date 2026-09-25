/**
 * Kho Dữ liệu Thẩm định Chuyên sâu Toàn diện cho các Dự án Mẫu
 * Sở Xây dựng Tỉnh Điện Biên — Tuân thủ Luật Xây dựng 2025/2026 & Nghị định 217/2026/NĐ-CP
 */

import type { Project } from './mockData';
import { formatCurrency } from '../lib/utils';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type {
  AppraisalChecklistItem,
  PlanningMetricItem,
  FireSafetyData,
  CostBreakdownRow,
  CostEvaluationData,
  Sample03NoticeData,
  LegalChecklistDoc,
  PermitData,
  InspectionData,
  AiAuditLog,
  ProjectAppraisalData,
} from '../types/appraisal';
import type {
  AppraisalChecklistItem,
  PlanningMetricItem,
  FireSafetyData,
  CostEvaluationData,
  Sample03NoticeData,
  PermitData,
  InspectionData,
  AiAuditLog,
  ProjectAppraisalData,
} from '../types/appraisal';

// ─── Generator Thẩm định Thông minh theo Chuyên ngành Công trình ─────────────

export function getProjectAppraisalData(project: Project): ProjectAppraisalData {
  const name = project.name.toLowerCase();
  const total = project.totalInvestment;
  const savings = project.estimatedSavings || Math.round(total * 0.045);
  const original = total + savings;

  // 1. Phân loại chuyên ngành công trình
  const isBridge = name.includes('cầu');
  const isRoad = name.includes('đường') || name.includes('đại lộ') || name.includes('tuyến');
  const isHospital = name.includes('bệnh viện') || name.includes('y tế');
  const isSchool = name.includes('trường') || name.includes('mầm non') || name.includes('tiểu học');
  const isWater = name.includes('cấp nước') || name.includes('thoát nước') || name.includes('nước thải');
  const isSports = name.includes('thể thao') || name.includes('sân vận động');
  const isCulture = name.includes('hội nghị') || name.includes('triển lãm') || name.includes('di tích') || name.includes('quảng trường');
  const isHousing = name.includes('nhà ở') || name.includes('tái định cư') || name.includes('liền kề');
  const isIndustrial = name.includes('nhà máy') || name.includes('cụm công nghiệp') || name.includes('nông lâm sản');

  // ─── A. Checklist Quy chuẩn Kết cấu AI theo Chuyên ngành ───
  let complianceChecklist: AppraisalChecklistItem[] = [];

  if (isBridge) {
    complianceChecklist = [
      {
        category: 'Tải trọng thiết kế & Động đất',
        item: 'Hoạt tải HL-93 & Cấp động đất VII Điện Biên',
        standardRequired: 'TCVN 11823:2017 (Thiết kế cầu đường bộ) & gia tốc nền ag = 0.154g',
        designApplied: 'Áp dụng tải trọng HL-93 đầy đủ tổ hợp lực động đất vùng núi đèo',
        aiVerdict: 'dat',
        aiNotes: 'Kết cấu dầm Super-T bê tông cốt thép dự ứng lực đảm bảo khả năng chịu lực.',
      },
      {
        category: 'Giải pháp Mố trụ & Nền móng',
        item: 'Móng cọc khoan nhồi cắm vào tầng đá gốc',
        standardRequired: 'TCVN 10304:2014, chiều sâu ngàm đá tối thiểu 3D',
        designApplied: 'Cọc D1200 cắm ngàm đá vôi cứng chắc ≥ 4.0m',
        aiVerdict: 'dat',
        aiNotes: 'Khảo sát địa chất đáy sông phù hợp, đảm bảo chống xói lở chân mố trụ mùa lũ.',
      },
      {
        category: 'Thông thuyền & Thoát lũ',
        item: 'Khổ thông thuyền và tĩnh không cầu vượt sông',
        standardRequired: 'Nghị định 08/2021/NĐ-CP & Thỏa thuận thoát lũ Chi cục Thủy lợi',
        designApplied: 'Tĩnh không thông thuyền đạt H = 4.5m, vượt đỉnh lũ lịch sử 100 năm + 0.8m',
        aiVerdict: 'dat',
        aiNotes: 'Khẩu độ thoát lũ thông thoáng, không gây ngập úng vùng thượng lưu.',
      },
    ];
  } else if (isRoad) {
    complianceChecklist = [
      {
        category: 'Cấp đường & Vận tốc thiết kế',
        item: 'Tiêu chuẩn đường ô tô miền núi (TCVN 4054:2005)',
        standardRequired: 'Đường cấp III miền núi, Vtk = 60 km/h, bán kính đường cong Rmin = 125m',
        designApplied: 'Áp dụng đúng bán kính Rmin = 150m, có mở rộng siêu cao trong đường cong',
        aiVerdict: 'dat',
        aiNotes: 'Đảm bảo tầm nhìn xe vượt và an toàn phương tiện tải trọng lớn.',
      },
      {
        category: 'Kết cấu Mặt đường & Áo đường',
        item: 'Mô đun đàn hồi yêu cầu Eyc',
        standardRequired: 'TCVN 13592:2022, Eyc ≥ 140 MPa đối với trục xe tiêu chuẩn 12 tấn',
        designApplied: 'Bê tông nhựa chặt 2 lớp (12cm) trên móng CPĐD loại I & II (35cm), Eyc = 158 MPa',
        aiVerdict: 'dat',
        aiNotes: 'Khả năng chịu tải và độ nhám chống trượt trên đèo dốc sương mù đạt yêu cầu.',
      },
      {
        category: 'Gia cố Mái taluy & Thoát nước',
        item: 'An toàn mái dốc chống sạt lở đồi núi',
        standardRequired: 'QCVN 02:2022/BXD (Mưa lũ cực đoan Điện Biên)',
        designApplied: 'Kè rọ đá kết hợp khung bê tông ô vuông trồng cỏ phủ taluy âm, rãnh cơ phân tầng',
        aiVerdict: 'dat',
        aiNotes: 'Giải pháp phòng chống sụt trượt taluy dương phù hợp địa hình đèo dốc sỏi sạn.',
      },
    ];
  } else if (isSchool) {
    complianceChecklist = [
      {
        category: 'Tiêu chuẩn Thiết kế Trường học',
        item: 'Diện tích sàn & Chiếu sáng tự nhiên',
        standardRequired: 'TCVN 8793:2011 (Trường phổ thông), diện tích tối thiểu 1.85 m²/học sinh',
        designApplied: 'Đạt 2.15 m²/học sinh, 100% phòng học đón ánh sáng tự nhiên hướng Nam',
        aiVerdict: 'dat',
        aiNotes: 'Bố trí hành lang rộng 2.4m, chống rét mùa đông và thông thoáng mùa hè vùng cao.',
      },
      {
        category: 'An toàn Kết cấu & Kháng chấn',
        item: 'Chịu chấn động đất cấp VII Điện Biên',
        standardRequired: 'TCVN 9386:2012 & TCVN 2737:2023',
        designApplied: 'Khung bê tông cốt thép toàn khối, vách cứng kháng chấn',
        aiVerdict: 'dat',
        aiNotes: 'Hệ móng băng giao thoa trên nền đất đồi phong hóa đầm chặt đạt K ≥ 0.95.',
      },
      {
        category: 'Vệ sinh & An toàn Thực phẩm',
        item: 'Khu nội trú & Bếp ăn tập thể 1 chiều',
        standardRequired: 'QCVN 01:2021/BXD & Thông tư 13/2016/TTLT-BYT-BGDĐT',
        designApplied: 'Bếp ăn thiết kế phân luồng 1 chiều riêng biệt, khu cấp dưỡng khép kín',
        aiVerdict: 'dat',
        aiNotes: 'Đáp ứng tốt điều kiện sinh hoạt bán trú và nội trú vùng đồng bào dân tộc thiểu số.',
      },
    ];
  } else if (isWater) {
    complianceChecklist = [
      {
        category: 'Quy chuẩn Hạ tầng Cấp thoát nước',
        item: 'Công suất thiết kế & Chất lượng xả thải',
        standardRequired: 'QCVN 07-1:2023/BXD & QCVN 40:2011/BTNMT (Cột A nước thải công nghiệp)',
        designApplied: 'Dây chuyền lắng lọc lamen tiếp xúc, khử trùng clo tự động, nước ra Cột A',
        aiVerdict: 'dat',
        aiNotes: 'Hồ sinh học sự cố dung tích 3 ngày lưu nước đảm bảo an toàn tuyệt đối nguồn tiếp nhận.',
      },
      {
        category: 'Kết cấu Bể chứa & Chống thấm',
        item: 'Độ bền xâm thực bê tông cốt thép',
        standardRequired: 'TCVN 5574:2018 & TCVN 12041:2017 (Chống thấm cấp B8)',
        designApplied: 'Bê tông chống thấm B8, sử dụng phụ gia tinh thể thẩm thấu gốc xi măng',
        aiVerdict: 'dat',
        aiNotes: 'Tính toán áp lực nước đẩy nổi và ứng suất nứt thành bể đạt biên an toàn k = 1.35.',
      },
    ];
  } else {
    // Mặc định công trình dân dụng, y tế, văn hóa, trụ sở, nhà ở
    complianceChecklist = [
      {
        category: 'Tải trọng gió & Động đất',
        item: 'TCVN 2737:2023 & TCVN 9386:2012',
        standardRequired: 'Vùng áp lực gió II.B, cấp động đất 7 tại địa bàn tỉnh Điện Biên',
        designApplied: 'Áp dụng đúng áp lực gió Wo = 95 daN/m², hệ số tầm quan trọng gamma = 1.25',
        aiVerdict: 'dat',
        aiNotes: 'Mô hình không gian 3D Etabs kiểm tra chu kỳ dao động và chuyển vị đỉnh công trình hợp lệ.',
      },
      {
        category: 'Giải pháp Nền móng & Địa kỹ thuật',
        item: 'Tương thích báo cáo khảo sát địa chất',
        standardRequired: 'TCVN 10304:2014 & hồ sơ khoan khảo sát địa chất hiện trường',
        designApplied: 'Móng cọc ép bê tông cốt thép / móng khoan nhồi cắm vào tầng cuội sỏi chặt vừa',
        aiVerdict: 'dat',
        aiNotes: 'Sức chịu tải thiết kế cọc tương thích với kết quả thí nghiệm nén tĩnh tại hiện trường.',
      },
      {
        category: 'An toàn Công trình lân cận & Môi trường',
        item: 'Biện pháp đào hố móng sâu và bảo vệ mái dốc',
        standardRequired: 'QCVN 18:2021/BXD (An toàn trong thi công xây dựng)',
        designApplied: 'Hệ tường vây cừ larsen kết hợp hệ giằng chống shoring và hạ mực nước ngầm có kiểm soát',
        aiVerdict: 'dat',
        aiNotes: 'Có phương án quan trắc lún nghiêng công trình lân cận định kỳ trong suốt quá trình đào.',
      },
    ];
  }

  // ─── B. Chỉ tiêu Quy hoạch & Hạ tầng Đối chiếu ───
  let planningMetrics: PlanningMetricItem[] = [];
  if (isRoad || isBridge) {
    planningMetrics = [
      { name: 'Chỉ giới giải phóng mặt bằng', designValue: 'Rộng 26.5m', standardLimit: 'Quy hoạch ≥ 25.0m', isPassed: true },
      { name: 'Bề rộng nền đường / cầu', designValue: 'Bề rộng 12.0m (2 làn xe cơ giới)', standardLimit: 'TCVN 4054:2005 (≥ 9.0m)', isPassed: true },
      { name: 'Độ dốc dọc tối đa (Imax)', designValue: '6.8%', standardLimit: 'Đường cấp III miền núi (≤ 7.0%)', isPassed: true },
      { name: 'Hành lang an toàn đường bộ', designValue: '15.0m tính từ mép ngoài đất của đường', standardLimit: 'Nghị định 11/2010/NĐ-CP (≥ 13.0m)', isPassed: true },
    ];
  } else {
    planningMetrics = [
      { name: 'Mật độ xây dựng thuần', designValue: `${project.buildingGrade === 'I' ? '32.5%' : '38.0%'}`, standardLimit: 'Quy chuẩn QCVN 01:2021 (≤ 40.0%)', isPassed: true },
      { name: 'Tầng cao công trình', designValue: `${project.buildingGrade === 'I' ? '08 tầng nổi, 01 hầm' : '05 tầng nổi'}`, standardLimit: 'Đúng Đồ án quy hoạch 1/500 phê duyệt', isPassed: true },
      { name: 'Hệ số sử dụng đất (FAR)', designValue: `${project.buildingGrade === 'I' ? '2.1 lần' : '1.45 lần'}`, standardLimit: 'Giới hạn quy chuẩn (≤ 3.0 lần)', isPassed: true },
      { name: 'Chỉ giới lùi công trình', designValue: '6.0 m', standardLimit: 'Quy định tối thiểu ≥ 5.0m', isPassed: true },
    ];
  }

  // ─── C. PCCC Checklist ───
  const fireSafety: FireSafetyData = {
    agreementNumber: `${project.code.replace(/\D/g, '').slice(-3)}/PC07-CAĐB`,
    agreementDate: '15/08/2026',
    agency: 'Phòng Cảnh sát PCCC & CNCH — Công an Tỉnh Điện Biên',
    fireResistanceGrade: project.buildingGrade === 'I' ? 'Bậc I (Chịu lửa ≥ 150 phút)' : 'Bậc II (Chịu lửa ≥ 120 phút)',
    evacuationDistance: isRoad || isBridge ? 'Không áp dụng đối với công trình tuyến giao thông' : '26.5m (Quy chuẩn QCVN 06:2022 cho phép ≤ 40m)',
    evacuationStaircases: isRoad || isBridge ? 'Không áp dụng' : '03 buồng thang bộ kín loại N1/N2 thoát trực tiếp ra ngoài sân',
    fireAccessRoad: 'Đường giao thông nội bộ rộng 6.5m chạy bao quanh, khoảng cách đỗ xe chữa cháy đạt chuẩn',
    waterReserve: 'Bể ngầm PCCC dung tích 250m³ kết hợp trạm bơm điện tử & máy phát diesel dự phòng 100%',
  };

  // ─── D. Thẩm định TMĐT (Nghị định 206/2026/NĐ-CP) ───
  const cConstruction = Math.round(total * 0.58);
  const cEquipment = Math.round(total * 0.18);
  const cManagement = Math.round(total * 0.025);
  const cConsulting = Math.round(total * 0.045);
  const cOthers = Math.round(total * 0.07);
  const cContingency = total - (cConstruction + cEquipment + cManagement + cConsulting + cOthers);

  const costEvaluation: CostEvaluationData = {
    originalTotal: original,
    appraisedTotal: total,
    savingsTotal: savings,
    items: [
      {
        name: '1. Chi phí Bồi thường, Hỗ trợ & Tái định cư',
        originalValue: Math.round(cOthers * 1.08),
        appraisedValue: cOthers,
        difference: Math.round(cOthers * 0.08),
        reason: 'Loại trừ khối lượng hoa màu tính trùng lặp theo biên bản đối soát Ban ĐBGPMB huyện.',
      },
      {
        name: '2. Chi phí Xây dựng (Sau thẩm định)',
        originalValue: Math.round(cConstruction * 1.05),
        appraisedValue: cConstruction,
        difference: Math.round(cConstruction * 0.05),
        reason: 'Áp dụng lại đơn giá vật liệu theo Thông báo giá Quý III/2026 của Liên sở SXD-STC Điện Biên.',
      },
      {
        name: '3. Chi phí Thiết bị & Công nghệ',
        originalValue: Math.round(cEquipment * 1.04),
        appraisedValue: cEquipment,
        difference: Math.round(cEquipment * 0.04),
        reason: 'Thẩm định lại giá 3 báo giá cạnh tranh đối với thiết bị nhập khẩu chuyên dụng.',
      },
      {
        name: '4. Chi phí Quản lý Dự án',
        originalValue: Math.round(cManagement * 1.02),
        appraisedValue: cManagement,
        difference: Math.round(cManagement * 0.02),
        reason: 'Định mức trích lập theo phụ lục Thông tư 12/2021/TT-BXD đối với dự án đầu tư công.',
      },
      {
        name: '5. Chi phí Tư vấn Đầu tư Xây dựng',
        originalValue: Math.round(cConsulting * 1.03),
        appraisedValue: cConsulting,
        difference: Math.round(cConsulting * 0.03),
        reason: 'Chuẩn hóa định mức chi phí thẩm tra, lập hồ sơ mời thầu và khảo sát địa hình.',
      },
      {
        name: '6. Chi phí Dự phòng (Trượt giá & khối lượng)',
        originalValue: Math.round(cContingency * 1.06),
        appraisedValue: cContingency,
        difference: Math.round(cContingency * 0.06),
        reason: 'Cân đối tỷ lệ dự phòng theo thời gian thực hiện dự án 24-36 tháng.',
      },
    ],
  };

  // ─── E. Dự thảo Thông báo Kết quả Thẩm định Mẫu số 03 Khổ A4 ───
  const sample03Notice: Sample03NoticeData = {
    docNumber: `${project.code.replace(/\D/g, '').slice(-3)}/SXD-QLXD`,
    docDate: 'Ngày 25 tháng 09 năm 2026',
    signerName: 'Nguyễn Văn Hùng',
    signerTitle: 'Phó Giám đốc Sở',
    submissionDoc: `Tờ trình số 42/TTr-${project.code.slice(-4)}`,
    submissionDate: project.submissionDate,
    evaluationSummary: `Hồ sơ thiết kế cơ sở và tổng mức đầu tư dự án ${project.name} tuân thủ quy chuẩn xây dựng hiện hành, phù hợp quy hoạch ngành và chỉ tiêu kinh tế kỹ thuật. Giải pháp kết cấu bảo đảm an toàn chịu lực, kháng chấn cấp VII và an toàn PCCC.`,
    conclusion: 'ĐỦ ĐIỀU KIỆN ĐỂ NGƯỜI QUYẾT ĐỊNH ĐẦU TƯ PHÊ DUYỆT BÁO CÁO NGHIÊN CỨU KHẢ THI THEO QUY ĐỊNH.',
  };

  // ─── F. Cấp Giấy phép Xây dựng ───
  const permit: PermitData = {
    status: project.stage === 'gpxd' ? 'dang_tham_tra' : project.stage === 'nghiem_thu' || project.stage === 'hoan_thanh' ? 'da_cap' : 'cho_bo_sung',
    permitNumber: `${project.code.replace(/\D/g, '').slice(-3)}/GPXD-SXD`,
    permitDate: '18/08/2026',
    checklistDocs: [
      { name: 'Đơn đề nghị cấp giấy phép xây dựng theo mẫu NĐ 217/2026', code: 'DOC-01', status: 'hop_le', note: 'Đúng mẫu số 01 Phụ lục II' },
      { name: 'Giấy chứng nhận quyền sử dụng đất / Quyết định giao đất', code: 'DOC-02', status: 'hop_le', note: 'UBND tỉnh cấp còn nguyên hiệu lực' },
      { name: 'Văn bản thẩm duyệt PCCC & Báo cáo ĐTM môi trường', code: 'DOC-03', status: 'hop_le', note: 'Đã tích hợp đầy đủ số hiệu công văn' },
      { name: 'Hai bộ bản vẽ thiết kế xây dựng kèm Báo cáo kết quả thẩm tra', code: 'DOC-04', status: 'hop_le', note: 'Đã đóng dấu thẩm tra của đơn vị tư vấn cấp I' },
      { name: 'Chứng chỉ năng lực hoạt động xây dựng của các tổ chức tham gia', code: 'DOC-05', status: 'hop_le', note: 'Tra cứu CSDL Quốc gia hợp lệ 100%' },
    ],
    technicalConditions: {
      allowedGroundArea: `${(project.totalInvestment / 50000000).toFixed(0)} m²`,
      allowedTotalFloorArea: `${(project.totalInvestment / 12000000).toFixed(0)} m²`,
      allowedStories: project.buildingGrade === 'I' ? '08 tầng' : '05 tầng',
      allowedHeight: project.buildingGrade === 'I' ? '32.5 m' : '22.0 m',
      specialRequirements: [
        'Tuân thủ tuyệt đối chỉ giới đường đỏ và chỉ giới xây dựng đã định vị',
        'Lắp đặt hệ thống quan trắc lún nghiêng và lưới an toàn che chắn bụi bẩn',
        'Có biện pháp hoàn trả hiện trạng công trình ngầm hạ tầng kỹ thuật đô thị',
      ],
    },
  };

  // ─── G. Hậu kiểm & Nghiệm thu Công trình ───
  const inspection: InspectionData = {
    groundBreakingConditions: [
      { item: 'Mặt bằng xây dựng đã được bàn giao mốc giới trên thực địa', status: 'dat', verifyDate: '10/06/2026' },
      { item: 'Có Giấy phép xây dựng hoặc văn bản miễn giấy phép hợp lệ', status: 'dat', verifyDate: '12/06/2026' },
      { item: 'Có thiết kế bản vẽ thi công đã được chủ đầu tư phê duyệt đóng dấu', status: 'dat', verifyDate: '15/06/2026' },
      { item: 'Hợp đồng thi công xây dựng và hợp đồng bảo hiểm công trình', status: 'dat', verifyDate: '18/06/2026' },
      { item: 'Thông báo ngày khởi công gửi Sở Xây dựng và UBND cấp huyện', status: 'dat', verifyDate: '20/06/2026' },
    ],
    phaseInspections: [
      {
        phaseName: 'Nghiệm thu Giai đoạn Phần móng & Kết cấu ngầm',
        inspectDate: '15/07/2026',
        inspectTeam: 'Đoàn Kiểm tra Sở Xây dựng phối hợp Ban QLDA',
        verdict: 'chap_thuan',
        findings: 'Chất lượng bê tông lót, cốt thép móng và kết quả nén mẫu R28 đạt thiết kế.',
      },
      {
        phaseName: 'Nghiệm thu Giai đoạn Khung sàn bê tông cốt thép thân công trình',
        inspectDate: '22/08/2026',
        inspectTeam: 'Tổ Giám sát Quản lý Xây dựng — SXD Điện Biên',
        verdict: 'chap_thuan',
        findings: 'Sai số kích thước hình học nằm trong phạm vi cho phép theo TCVN 4453:1995.',
      },
      {
        phaseName: 'Nghiệm thu Hệ thống PCCC & Chạy thử liên động kỹ thuật',
        inspectDate: '10/09/2026',
        inspectTeam: 'Sở Xây dựng, Cảnh sát PCCC & CNCH, Tư vấn Giám sát',
        verdict: 'chap_thuan',
        findings: 'Áp lực nước chữa cháy đầu lăng phun đạt 4.2 bar, hệ thống báo khói tự động nhạy bén.',
      },
    ],
    finalNotice: {
      noticeNumber: `${project.code.replace(/\D/g, '').slice(-3)}/TB-SXD`,
      issueDate: '20/09/2026',
      result: 'Chấp thuận kết quả nghiệm thu hoàn thành công trình của Chủ đầu tư đưa vào khai thác sử dụng.',
      recommendations: [
        'Chủ đầu tư lưu trữ đầy đủ hồ sơ hoàn công công trình theo quy định',
        'Thực hiện bảo trì công trình định kỳ theo quy trình đã được phê duyệt',
      ],
    },
  };

  // ─── H. Lịch sử Giải trình AI Audit Trail (Luật AI 2025) ───
  const auditLogs: AiAuditLog[] = [
    {
      timestamp: `${project.submissionDate} 08:30`,
      actor: 'Cổng Dịch vụ công Quốc gia',
      action: 'Tiếp nhận hồ sơ điện tử',
      details: `Hồ sơ ${project.code} được đẩy tự động từ Cổng DVC Tân Dân tỉnh Điện Biên sang hệ thống Thẩm định SXD.`,
      badge: 'info',
    },
    {
      timestamp: `${project.submissionDate} 08:35`,
      actor: 'AI Compliance Checker Engine',
      action: 'Quét tự động Quy chuẩn & Hồ sơ pháp lý',
      details: 'AI đối soát 18 danh mục quy chuẩn: Phát hiện 100% tài liệu hợp lệ, không có tiêu chuẩn hết hiệu lực.',
      badge: 'audit',
    },
    {
      timestamp: `${project.submissionDate} 14:15`,
      actor: 'AI Cost Analysis Assistant',
      action: 'Bóc tách chi phí & Đối soát định mức BXD',
      details: `Phát hiện chênh lệch đơn giá vật tư mác bê tông và vận chuyển đèo dốc. Đề xuất tiết giảm ${formatCurrency(savings)}.`,
      badge: 'warning',
    },
    {
      timestamp: '20/09/2026 10:20',
      actor: project.assignee,
      action: 'Chuyên viên chấp thuận đề xuất AI',
      details: 'Chuyên viên thụ lý ghi nhận và tích hợp 100% kiến nghị của AI vào Báo cáo thẩm định chuyên môn.',
      badge: 'success',
    },
    {
      timestamp: '25/09/2026 16:00',
      actor: 'Phó Giám đốc Sở — Nguyễn Văn Hùng',
      action: 'Ký số văn bản điện tử Mẫu số 03',
      details: 'Phê duyệt Thông báo kết quả thẩm định, cấp dấu mộc điện tử và đẩy kết quả sang Cổng DVC.',
      badge: 'success',
    },
  ];

  return {
    complianceChecklist,
    planningMetrics,
    fireSafety,
    costEvaluation,
    sample03Notice,
    permit,
    inspection,
    auditLogs,
  };
}
