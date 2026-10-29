import {
  MOCK_MATERIAL_PRICES,
  MOCK_ORGANIZATIONS,
  MOCK_PERSONNEL,
  MOCK_PROJECTS,
  getProjectTT39Data,
} from '../data/mockData';
import { matchesSmartSearch } from '../lib/smartSearch';
import type {
  AppraisalSheetView,
  Dossier,
  DossierSummary,
  Health,
  ModelProvider,
  PermitRegisterRow,
  PermitView,
  StampingView,
} from '../types/appraisal';
import type { DashboardSummary } from '../components/appraisal/dashboardData';

/**
 * Bộ dữ liệu Hồ sơ thẩm định / GPXD / Hậu kiểm mẫu phục vụ chế độ trình diễn tĩnh (Vercel Static Demo)
 * khi máy chủ Python AI Worker / Express Core không chạy phía sau `/api/appraisal`.
 */
const STATIC_DOSSIERS: Dossier[] = MOCK_PROJECTS.slice(0, 18).map((proj, idx) => {
  const procedure =
    proj.stage === 'gpxd' ? 'gpxd' : proj.stage === 'nghiem_thu' || proj.stage === 'hoan_thanh' ? 'nghiem_thu' : 'bcnckt';
  const statusList = ['reviewed', 'processing', 'analyzed', 'request_supplement', 'intake'] as const;
  const status =
    proj.slaStatus === 'da_tham_dinh'
      ? 'reviewed'
      : proj.slaStatus === 'yeu_cau_bo_sung'
        ? 'request_supplement'
        : statusList[idx % statusList.length];
  const slaStateId =
    proj.slaStatus === 'qua_han'
      ? 'overdue'
      : proj.slaStatus === 'da_tham_dinh'
        ? 'completed'
        : proj.slaStatus === 'yeu_cau_bo_sung'
          ? 'paused'
          : idx % 4 === 0
            ? 'due_soon'
            : 'on_track';
  const slaLabel =
    slaStateId === 'overdue'
      ? 'Quá 3 NLV'
      : slaStateId === 'completed'
        ? 'Đúng hạn'
        : slaStateId === 'paused'
          ? 'Chờ bổ sung'
          : slaStateId === 'due_soon'
            ? 'Còn 2 NLV'
            : 'Còn 8 NLV';

  const id = `case-db-${String(idx + 1).padStart(3, '0')}`;
  const submissionCode = `HS-2026-ĐB-${String(idx + 101).padStart(4, '0')}`;

  return {
    id,
    dossierId: `dos-${proj.id}`,
    submissionCode,
    submissionRound: 1,
    documentCount: 6,
    projectId: proj.id,
    projectName: proj.name,
    projectCode: proj.code,
    procedure,
    createdAt: `${proj.submissionDate || '2026-09-10'}T08:30:00Z`,
    name: `${
      procedure === 'bcnckt'
        ? 'Thẩm định Báo cáo NCKT — '
        : procedure === 'gpxd'
          ? 'Cấp Giấy phép xây dựng — '
          : 'Kiểm tra công tác nghiệm thu — '
    }${proj.name}`,
    province: 'Tỉnh Điện Biên',
    department: proj.department || 'Phòng Quản lý Xây dựng',
    sample: true,
    legalDate: proj.submissionDate || '2026-09-10',
    updatedAt: `${proj.submissionDate || '2026-09-15'}T10:15:00Z`,
    status,
    revision: 1,
    slaDueDate: proj.deadlineDate || '2026-10-15',
    slaState: {
      state: slaStateId,
      label: slaLabel,
      remainingWorkingDays: slaStateId === 'overdue' ? -3 : slaStateId === 'due_soon' ? 2 : 8,
      phase: status === 'reviewed' ? 'closed' : 'legal',
    },
    assignee: proj.assignee || 'KS. Lò Văn Minh',
    assigneeId: 'user-reviewer-01',
    tenantId: 'sxd-dien-bien',
    requirements: [
      {
        id: 'req-01',
        name: 'Tờ trình đề nghị thẩm định / cấp phép theo mẫu NĐ 217/2026/NĐ-CP',
        category: 'Pháp lý',
        required: true,
        status: 'verified',
        note: 'Đầy đủ chữ ký số và dấu đỏ của Chủ đầu tư',
        verifiedBy: proj.assignee || 'KS. Lò Văn Minh',
      },
      {
        id: 'req-02',
        name: 'Quyết định phê duyệt chủ trương đầu tư / Quy hoạch chi tiết 1/500',
        category: 'Quy hoạch',
        required: true,
        status: 'verified',
        note: 'Phù hợp Quy hoạch chung TP. Điện Biên Phủ',
        verifiedBy: proj.assignee || 'KS. Lò Văn Minh',
      },
      {
        id: 'req-03',
        name: 'Hồ sơ bản vẽ thiết kế cơ sở / thiết kế bản vẽ thi công & thuyết minh',
        category: 'Kỹ thuật',
        required: true,
        status: 'verified',
        note: 'Đóng dấu thẩm tra đạt yêu cầu',
        verifiedBy: proj.assignee || 'KS. Lò Văn Minh',
      },
    ],
    documents: [
      {
        id: `doc-${idx}-1`,
        requirementId: 'req-01',
        name: `01_To_trinh_tham_dinh_${proj.code}.pdf`,
        role: 'legal',
        version: 1,
        hash: 'e3b0c44298fc1c149afbf4c8996fb924',
        size: 1450200,
        uploadedAt: `${proj.submissionDate || '2026-09-10'}T08:35:00Z`,
        segments: [
          {
            id: `seg-${idx}-1`,
            locator: 'Trang 1, Đoạn 2',
            page: 1,
            text: `Tờ trình thẩm định dự án ${proj.name} tại ${proj.location}, Chủ đầu tư: ${proj.investorName}.`,
          },
        ],
        warnings: [],
        signature: 'Đã ký số hợp lệ — UBND Tỉnh Điện Biên CA',
      },
      {
        id: `doc-${idx}-2`,
        requirementId: 'req-03',
        name: `02_Thuyet_minh_TKCS_${proj.code}.pdf`,
        role: 'technical',
        version: 1,
        hash: 'a1b2c3d4e5f698fc1c149afbf4c8996f',
        size: 4820100,
        uploadedAt: `${proj.submissionDate || '2026-09-10'}T08:40:00Z`,
        segments: [
          {
            id: `seg-${idx}-2`,
            locator: 'Trang 4, Bảng chỉ tiêu KTKT',
            page: 4,
            text: `Cấp công trình: Cấp ${proj.buildingGrade}, Nhóm dự án: Nhóm ${proj.projectGroup}. Áp dụng QCVN 01:2021/BXD và QCVN 06:2022/BXD.`,
          },
        ],
        warnings: [],
        signature: 'Đã ký số hợp lệ — Tư vấn thiết kế',
      },
    ],
    facts: [
      {
        id: `fact-${idx}-1`,
        documentId: `doc-${idx}-1`,
        segmentId: `seg-${idx}-1`,
        locator: 'Trang 1',
        quote: `Chủ đầu tư: ${proj.investorName}`,
        key: 'investor_name',
        label: 'Chủ đầu tư',
        value: proj.investorName,
        rawValue: proj.investorName,
        unit: '',
        method: 'ocr_rule',
        reviewStatus: 'confirmed',
        reviewedBy: proj.assignee || 'KS. Lò Văn Minh',
        reviewNote: 'Khớp dữ liệu quốc gia về ĐTXD',
      },
      {
        id: `fact-${idx}-2`,
        documentId: `doc-${idx}-2`,
        segmentId: `seg-${idx}-2`,
        locator: 'Trang 4',
        quote: `Nhóm ${proj.projectGroup}, Cấp công trình ${proj.buildingGrade}`,
        key: 'building_grade',
        label: 'Nhóm & Cấp công trình',
        value: `Nhóm ${proj.projectGroup} • Cấp ${proj.buildingGrade}`,
        rawValue: `${proj.projectGroup}/${proj.buildingGrade}`,
        unit: '',
        method: 'ocr_rule',
        reviewStatus: 'confirmed',
        reviewedBy: proj.assignee || 'KS. Lò Văn Minh',
        reviewNote: 'Phù hợp Phụ lục I Thông tư 06/2021/TT-BXD',
      },
    ],
    runs: [
      {
        id: `run-${idx}-1`,
        createdAt: `${proj.submissionDate || '2026-09-12'}T09:00:00Z`,
        ruleVersion: 'ND217-2026.1',
        mode: 'rule-engine',
        stale: false,
        documentIds: [`doc-${idx}-1`, `doc-${idx}-2`],
        provider: 'rule-based',
        aiStatus: 'completed',
        aiNotes: [],
        costVersions: [],
        costComparison: null,
        findings: [
          {
            id: `find-${idx}-1`,
            code: 'QH-01',
            category: 'Quy hoạch & Kiến trúc',
            title: 'Sự phù hợp với Quy hoạch xây dựng & Chỉ tiêu QCVN 01:2021/BXD',
            result: proj.planningCompliance ? 'pass' : 'warning',
            explanation: proj.planningCompliance
              ? 'Mật độ xây dựng, hệ số sử dụng đất và chiều cao công trình nằm trong ngưỡng cho phép của đồ án quy hoạch.'
              : 'Cần rà soát bổ sung văn bản thỏa thuận độ cao tĩnh không và khoảng lùi chỉ giới xây dựng.',
            sources: [
              {
                documentId: `doc-${idx}-2`,
                segmentId: `seg-${idx}-2`,
                locator: 'Trang 4',
                quote: `Cấp công trình ${proj.buildingGrade}, Nhóm ${proj.projectGroup}`,
              },
            ],
            calculation: 'MĐXD thực tế ≤ MĐXD tối đa theo Bảng 2.8 QCVN 01:2021/BXD',
            missingEvidence: [],
            legalRefs: [
              { label: 'Điều 38 Nghị định 217/2026/NĐ-CP', url: '' },
              { label: 'Mục 2.6 QCVN 01:2021/BXD', url: '' },
            ],
            review: {
              decision: 'agree',
              note: 'Chuyên viên đã kiểm tra đối chiếu bản vẽ tổng mặt bằng.',
              actor: proj.assignee || 'KS. Lò Văn Minh',
              at: `${proj.submissionDate || '2026-09-14'}T14:20:00Z`,
            },
          },
        ],
      },
    ],
    consultations: [],
    audit: [
      {
        id: `aud-${idx}-1`,
        at: `${proj.submissionDate || '2026-09-10'}T08:30:00Z`,
        actor: 'Bộ phận Một cửa SXD Điện Biên',
        action: 'Tiếp nhận hồ sơ',
        detail: `Tiếp nhận mã hồ sơ ${submissionCode} của dự án ${proj.code}`,
      },
      {
        id: `aud-${idx}-2`,
        at: `${proj.submissionDate || '2026-09-12'}T09:15:00Z`,
        actor: proj.assignee || 'KS. Lò Văn Minh',
        action: 'Chạy đối chiếu quy chuẩn tự động',
        detail: 'Hoàn thành kiểm tra các chỉ tiêu quy hoạch QCVN 01:2021/BXD và năng lực tổ chức.',
      },
    ],
    finalReview:
      status === 'reviewed'
        ? {
            decision: 'approve',
            note: 'Hồ sơ đủ điều kiện trình phê duyệt / thông báo kết quả thẩm định.',
            actor: proj.assignee || 'KS. Lò Văn Minh',
            at: `${proj.submissionDate || '2026-09-18'}T16:00:00Z`,
            simulation: false,
          }
        : null,
    sla: {
      policyVersion: 'ND217-2026',
      policyStatus: 'confirmed',
      calendarVersion: 'VN-2026',
      calendarConfirmed: true,
      basis: 'Điều 37 Nghị định 217/2026/NĐ-CP',
      missing: null,
      periodDays: 20,
      periodUnit: 'working',
      projectGroup: proj.projectGroup,
      projectGrade: proj.buildingGrade,
      startDate: proj.submissionDate || '2026-09-10',
      legalDueDate: proj.deadlineDate || '2026-10-10',
      internalDueDate: proj.deadlineDate || '2026-10-08',
      dueDate: proj.deadlineDate || '2026-10-10',
      dueKind: 'legal',
      paused: slaStateId === 'paused',
      pausedSince: null,
      pausedDays: 0,
      completedAt: status === 'reviewed' ? `${proj.submissionDate || '2026-09-18'}T16:00:00Z` : null,
    },
  };
});

function toSummary(d: Dossier): DossierSummary {
  return {
    id: d.id,
    dossierId: d.dossierId,
    submissionCode: d.submissionCode,
    submissionRound: d.submissionRound,
    documentCount: d.documentCount,
    projectId: d.projectId,
    projectName: d.projectName,
    projectCode: d.projectCode,
    procedure: d.procedure,
    createdAt: d.createdAt,
    name: d.name,
    province: d.province,
    department: d.department,
    sample: d.sample,
    legalDate: d.legalDate,
    updatedAt: d.updatedAt,
    status: d.status,
    revision: d.revision,
    slaDueDate: d.slaDueDate,
    slaState: d.slaState,
    assignee: d.assignee,
    assigneeId: d.assigneeId,
  };
}

function buildDashboardSummary(): DashboardSummary {
  const bcncktCount = STATIC_DOSSIERS.filter((d) => d.procedure === 'bcnckt').length;
  const gpxdCount = STATIC_DOSSIERS.filter((d) => d.procedure === 'gpxd').length;
  const ntCount = STATIC_DOSSIERS.filter((d) => d.procedure === 'nghiem_thu').length;

  return {
    cases: {
      total: STATIC_DOSSIERS.length,
      dossiers: STATIC_DOSSIERS.length,
      in_progress: STATIC_DOSSIERS.filter((d) => d.status !== 'reviewed').length,
      documents: STATIC_DOSSIERS.reduce((sum, d) => sum + (d.documentCount || 0), 0),
      reviewed: STATIC_DOSSIERS.filter((d) => d.status === 'reviewed').length,
      supplements: STATIC_DOSSIERS.filter((d) => d.status === 'request_supplement').length,
    },
    projects: {
      total: MOCK_PROJECTS.length,
    },
    procedures: [
      { id: 'bcnckt', total: bcncktCount },
      { id: 'gpxd', total: gpxdCount },
      { id: 'nghiem_thu', total: ntCount },
    ],
    months: [
      { id: '2026-05', total: 4, procedures: { bcnckt: 2, gpxd: 1, nghiem_thu: 1 } },
      { id: '2026-06', total: 5, procedures: { bcnckt: 3, gpxd: 1, nghiem_thu: 1 } },
      { id: '2026-07', total: 6, procedures: { bcnckt: 3, gpxd: 2, nghiem_thu: 1 } },
      { id: '2026-08', total: 7, procedures: { bcnckt: 4, gpxd: 2, nghiem_thu: 1 } },
      { id: '2026-09', total: 9, procedures: { bcnckt: 5, gpxd: 2, nghiem_thu: 2 } },
      { id: '2026-10', total: 8, procedures: { bcnckt: 4, gpxd: 2, nghiem_thu: 2 } },
    ],
    statuses: [
      { id: 'reviewed', total: STATIC_DOSSIERS.filter((d) => d.status === 'reviewed').length },
      { id: 'processing', total: STATIC_DOSSIERS.filter((d) => d.status === 'processing').length },
      { id: 'analyzed', total: STATIC_DOSSIERS.filter((d) => d.status === 'analyzed').length },
      { id: 'request_supplement', total: STATIC_DOSSIERS.filter((d) => d.status === 'request_supplement').length },
      { id: 'intake', total: STATIC_DOSSIERS.filter((d) => d.status === 'intake').length },
    ],
    top_projects: MOCK_PROJECTS.slice(0, 6).map((p, i) => ({
      id: p.id,
      name: p.name,
      total: i % 2 === 0 ? 2 : 1,
      dossiers: 1,
    })),
    recent: STATIC_DOSSIERS.slice(0, 8).map((d) => ({
      id: d.id,
      name: d.name,
      project_id: d.projectId || 'proj-001',
      project_name: d.projectName || 'Dự án đầu tư xây dựng',
      status: d.status,
    })),
    sla: [
      { id: 'on_track', total: STATIC_DOSSIERS.filter((d) => d.slaState?.state === 'on_track').length },
      { id: 'due_soon', total: STATIC_DOSSIERS.filter((d) => d.slaState?.state === 'due_soon').length },
      { id: 'overdue', total: STATIC_DOSSIERS.filter((d) => d.slaState?.state === 'overdue').length },
      { id: 'paused', total: STATIC_DOSSIERS.filter((d) => d.slaState?.state === 'paused').length },
      { id: 'completed', total: STATIC_DOSSIERS.filter((d) => d.slaState?.state === 'completed').length },
    ],
  };
}

function buildAppraisalSheet(dossier: Dossier): AppraisalSheetView {
  return {
    version: 'ND217-2026.1',
    planningBases: {
      qh_1_500: 'Quy hoạch chi tiết 1/500 đã phê duyệt',
      qh_1_2000: 'Quy hoạch phân khu 1/2.000 & Thiết kế đô thị',
      qh_chung: 'Quy hoạch chung xây dựng đô thị Điện Biên Phủ đến năm 2045',
    },
    statuses: {
      pending: 'Chưa đánh giá',
      meets: 'Đạt yêu cầu',
      revise: 'Cần hoàn thiện bổ sung',
      fails: 'Không đạt',
      not_applicable: 'Không áp dụng',
    },
    conclusions: {
      eligible: 'Đủ điều kiện trình phê duyệt dự án / triển khai bước tiếp theo',
      eligible_after_revision: 'Đủ điều kiện sau khi chỉnh sửa, hoàn thiện theo ý kiến thẩm định',
      ineligible: 'Chưa đủ điều kiện trình phê duyệt',
    },
    planningBasis: 'qh_1_500',
    sections: [
      {
        id: 'sec-1',
        title: '1. Sự phù hợp với quy hoạch xây dựng, quy hoạch có tính chất kỹ thuật chuyên ngành',
        form: 'Mẫu số 03 — Mục V.1',
        basis: 'Khoản 2 Điều 38 Nghị định 217/2026/NĐ-CP',
        criteria: ['Mật độ xây dựng, hệ số sử dụng đất', 'Tầng cao & chiều cao tĩnh không Cảng HK Điện Biên'],
        applicable: true,
        status: 'meets',
        assessment: 'Các chỉ tiêu quy hoạch tổng mặt bằng phù hợp với quyết định phê duyệt quy hoạch và QCVN 01:2021/BXD.',
        requirements: [],
        findingIds: [],
        suggestion: {
          status: 'meets',
          reason: 'Khớp dữ liệu đối chiếu quy hoạch tự động.',
          requirements: [],
          findings: [],
        },
      },
      {
        id: 'sec-2',
        title: '2. Khả năng kết nối hạ tầng kỹ thuật khu vực & an toàn chịu lực công trình',
        form: 'Mẫu số 03 — Mục V.2–V.4',
        basis: 'Khoản 3, 4 Điều 38 Nghị định 217/2026/NĐ-CP',
        criteria: ['Đấu nối giao thông, cấp thoát nước', 'Giải pháp móng và kết cấu chịu lực chính'],
        applicable: true,
        status: 'meets',
        assessment: 'Giải pháp thiết kế cơ sở đảm bảo khả năng đấu nối hạ tầng và tuân thủ tiêu chuẩn TCVN hiện hành.',
        requirements: [],
        findingIds: [],
        suggestion: {
          status: 'meets',
          reason: 'Đạt yêu cầu theo báo cáo kết quả thẩm tra.',
          requirements: [],
          findings: [],
        },
      },
    ],
    conclusion: 'eligible',
    recommendations: `Đề nghị Chủ đầu tư (${dossier.projectName || ''}) tổ chức thực hiện các bước tiếp theo đúng quy định của Luật Xây dựng và Nghị định 217/2026/NĐ-CP.`,
    suggestedConclusion: 'eligible',
    problems: [],
    complete: true,
    hasRun: true,
    locked: false,
    updatedBy: dossier.assignee,
    updatedAt: dossier.updatedAt,
  };
}

function buildPermitView(dossier: Dossier): PermitView {
  const proj = MOCK_PROJECTS.find((p) => p.id === dossier.projectId) || MOCK_PROJECTS[0];
  const tt39 = proj.tt39_data || getProjectTT39Data(proj);
  return {
    consultations: [
      {
        id: 'cons-01',
        agency: 'Phòng Cảnh sát PCCC & CNCH — Công an tỉnh Điện Biên',
        subject: 'Lấy ý kiến thẩm duyệt thiết kế về PCCC',
        sentDate: '2026-09-11',
        dueDate: '2026-09-15',
        response: 'Thống nhất phương án giao thông chữa cháy và khoảng cách an toàn PCCC.',
        respondedDate: '2026-09-14',
        status: 'responded',
      },
    ],
    consultDays: 2,
    permit: {
      id: `gp-${dossier.id}`,
      number: `45/2026/GPXD-SXD`,
      kind: 'Cấp mới giấy phép xây dựng công trình',
      form: 'Mẫu số 09 — Phụ lục II NĐ 217/2026/NĐ-CP',
      issueDate: '2026-09-20',
      issuedBy: 'Sở Xây dựng tỉnh Điện Biên',
      startDeadline: '2027-09-20',
      publicUntil: '2027-09-20',
      content: {
        investor: proj.investorName,
        projectName: proj.name,
        location: proj.location,
        landLot: tt39.landLot,
        constructionArea: `${tt39.constructionArea} m²`,
        grossFloorArea: `${tt39.grossFloorArea} m²`,
        buildingHeight: `${tt39.buildingHeight} m`,
        floorCount: tt39.floorCount,
      },
      note: 'Giấy phép có hiệu lực khởi công trong thời hạn 12 tháng kể từ ngày cấp.',
      events: [],
    },
    status: 'valid',
    statusLabel: 'Còn hiệu lực',
    returnDueDate: null,
    cancelFromDate: null,
    actions: ['revoke'],
    revokeReasons: {
      forged_dossier: 'Hồ sơ đề nghị cấp giấy phép giả mạo',
      wrong_authority: 'Cấp không đúng thẩm quyền hoặc trái quy hoạch',
    },
    subtype: 'new_permit',
    eligible: true,
    reviewed: true,
  };
}

function buildStampingView(dossier: Dossier): StampingView {
  return {
    status: 'stamped',
    label: 'Đã đóng dấu thẩm định Mẫu số 14',
    basis: 'Khoản 8 Điều 36 Nghị định 217/2026/NĐ-CP',
    conclusion: 'eligible',
    actions: [{ id: 'pdf_received', label: 'Tải PDF tiếp nhận' }],
    drawings: [
      { code: 'KT-01..KT-15', name: 'Bản vẽ Tổng mặt bằng & Kiến trúc công trình', sheets: 15 },
      { code: 'KC-01..KC-18', name: 'Bản vẽ Kết cấu móng, cột, dầm, sàn', sheets: 18 },
      { code: 'MEP-01..MEP-12', name: 'Bản vẽ Hệ thống cấp điện, cấp thoát nước & PCCC', sheets: 12 },
    ],
    noticeReference: `218/TB-SXD (${dossier.submissionCode || 'HS-2026'})`,
    stampedAt: '2026-09-19',
    stampedBy: dossier.assignee,
    pdfDueDate: '2026-10-05',
    pdfReceivedAt: '2026-09-22',
    history: [
      {
        action: 'stamp',
        label: 'Đóng dấu bản vẽ thiết kế theo Mẫu số 14',
        date: '2026-09-19',
        reference: '218/TB-SXD',
        note: 'Đã đóng dấu 45 tờ bản vẽ chính thức.',
        actor: dossier.assignee,
        at: '2026-09-19T15:30:00Z',
      },
    ],
    archive: [
      { name: 'Thông báo kết quả thẩm định (Mẫu số 03)', state: 'done' },
      { name: 'Bộ bản vẽ đóng dấu thẩm định (Mẫu số 14) quét PDF', state: 'done' },
      { name: 'Báo cáo kết quả thẩm tra đã đóng dấu', state: 'done' },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Xử lý toàn bộ các API `/api/appraisal/*` ngay trên trình duyệt khi chạy trên bản tĩnh Vercel.
 */
export async function handleStaticApiFallback(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // 1. Runtime & Health
  if (pathname === '/runtime') {
    return jsonResponse({
      mode: 'demo',
      environment: 'vercel-static',
      authenticationRequired: false,
    });
  }

  if (pathname === '/health') {
    const health: Health = {
      mode: 'demo',
      modelConfigured: false,
      ocrAvailable: true,
      actor: {
        name: 'Chuyên viên Thẩm định SXD',
        role: 'reviewer',
        department: 'Phòng Quản lý Xây dựng',
      },
      modelProvider: {
        id: 'rule-engine',
        label: 'Bộ quy tắc Pháp lý NĐ 217/2026 & QCVN',
        model: 'ND217-RuleEngine-v1',
        configured: true,
        connection: {
          status: 'connected',
          checkedAt: new Date().toISOString(),
          message: 'Sẵn sàng đối chiếu quy chuẩn tự động',
        },
      },
    };
    return jsonResponse(health);
  }

  if (pathname === '/model/check') {
    const provider: ModelProvider = {
      id: 'rule-engine',
      label: 'Bộ quy tắc Pháp lý NĐ 217/2026 & QCVN',
      model: 'ND217-RuleEngine-v1',
      configured: true,
      connection: {
        status: 'connected',
        checkedAt: new Date().toISOString(),
        message: 'Hoạt động ổn định ở chế độ Rule Engine trên Vercel.',
      },
    };
    return jsonResponse(provider);
  }

  // 2. Dashboard
  if (pathname === '/dashboard') {
    return jsonResponse(buildDashboardSummary());
  }

  // 3. Projects
  if (pathname === '/projects') {
    if (init.method?.toUpperCase() === 'POST' && init.body) {
      const payload = JSON.parse(String(init.body));
      const created = {
        ...MOCK_PROJECTS[0],
        id: `proj-${Date.now()}`,
        code: payload.code || `DA-2026-ĐB-${MOCK_PROJECTS.length + 1}`,
        name: payload.name || payload.title || 'Dự án mới tiếp nhận',
        investorName: payload.investorName || payload.investor_name || 'Ban QLDA các công trình Tỉnh Điện Biên',
        location: payload.location || payload.location_district || 'TP. Điện Biên Phủ, Tỉnh Điện Biên',
      };
      return jsonResponse(created, 201);
    }

    const search = searchParams.get('search') || '';
    const stage = searchParams.get('stage') || '';
    const group = searchParams.get('group') || '';
    const status = searchParams.get('status') || '';
    const offset = Number(searchParams.get('offset') || 0);
    const limit = Number(searchParams.get('limit') || 50);

    const filtered = MOCK_PROJECTS.filter((p) => {
      if (search && !matchesSmartSearch(`${p.name} ${p.code} ${p.investorName} ${p.location}`, search)) return false;
      if (stage && stage !== 'all' && p.stage !== stage) return false;
      if (group && group !== 'all' && p.projectGroup !== group) return false;
      if (status && status !== 'all' && p.slaStatus !== status) return false;
      return true;
    }).map((p) => ({
      ...p,
      tt39_data: p.tt39_data || getProjectTT39Data(p),
    }));

    return jsonResponse({
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      offset,
      limit,
    });
  }

  const projGalleryMatch = pathname.match(/^\/projects\/([^/]+)\/gallery$/);
  if (projGalleryMatch) {
    const id = decodeURIComponent(projGalleryMatch[1]);
    const proj = MOCK_PROJECTS.find((p) => p.id === id) || MOCK_PROJECTS[0];
    return jsonResponse({
      projectId: proj.id,
      coverImage: proj.coverImage || null,
      images: proj.images || [],
    });
  }

  const projDetailMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projDetailMatch) {
    const id = decodeURIComponent(projDetailMatch[1]);
    const proj = MOCK_PROJECTS.find((p) => p.id === id) || MOCK_PROJECTS[0];
    return jsonResponse({
      ...proj,
      tt39_data: proj.tt39_data || getProjectTT39Data(proj),
    });
  }

  // 4. Submissions & Cases
  if (pathname === '/submissions') {
    const search = searchParams.get('search') || '';
    const procedure = searchParams.get('procedure') || '';
    const status = searchParams.get('status') || '';
    const sla = searchParams.get('sla') || '';
    const projectId = searchParams.get('projectId') || '';
    const offset = Number(searchParams.get('offset') || 0);
    const limit = Number(searchParams.get('limit') || 50);

    const filtered = STATIC_DOSSIERS.filter((d) => {
      if (
        search &&
        !matchesSmartSearch(`${d.name} ${d.submissionCode || ''} ${d.projectName || ''} ${d.projectCode || ''}`, search)
      ) {
        return false;
      }
      if (procedure && procedure !== 'all' && d.procedure !== procedure) return false;
      if (status && status !== 'all' && d.status !== status) return false;
      if (sla && sla !== 'all' && d.slaState?.state !== sla) return false;
      if (projectId && projectId !== 'all' && d.projectId !== projectId) return false;
      return true;
    }).map(toSummary);

    return jsonResponse({
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      offset,
      limit,
    });
  }

  if (pathname === '/cases') {
    if (init.method?.toUpperCase() === 'POST') {
      return jsonResponse(STATIC_DOSSIERS[0], 201);
    }
    const procedure = searchParams.get('procedure') || '';
    const projectId = searchParams.get('projectId') || '';
    const filtered = STATIC_DOSSIERS.filter((d) => {
      if (procedure && d.procedure !== procedure) return false;
      if (projectId && d.projectId !== projectId) return false;
      return true;
    }).map(toSummary);
    return jsonResponse(filtered);
  }

  if (pathname.startsWith('/samples/')) {
    return jsonResponse(STATIC_DOSSIERS[0]);
  }

  if (pathname === '/permits') {
    const rows: PermitRegisterRow[] = MOCK_PROJECTS.filter((p) => p.stage === 'gpxd').map((p, idx) => ({
      number: `${String(idx + 12).padStart(2, '0')}/2026/GPXD-SXD`,
      caseId: `case-db-${String(idx + 1).padStart(3, '0')}`,
      projectId: p.id,
      projectName: p.name,
      projectCode: p.code,
      form: 'Mẫu số 09 — NĐ 217/2026',
      kind: 'Cấp mới GPXD công trình',
      issueDate: p.submissionDate || '2026-09-18',
      investor: p.investorName,
      location: p.location,
      startDeadline: '2027-09-18',
      publicUntil: '2027-09-18',
      public: true,
      extensions: 0,
      history: [{ kind: 'Cấp mới', issueDate: p.submissionDate || '2026-09-18', caseId: `case-db-001` }],
      status: 'valid',
      statusLabel: 'Còn hiệu lực',
    }));
    return jsonResponse({ items: rows });
  }

  const caseSubRouteMatch = pathname.match(/^\/cases\/([^/]+)\/(.+)$/);
  if (caseSubRouteMatch) {
    const caseId = decodeURIComponent(caseSubRouteMatch[1]);
    const subPath = caseSubRouteMatch[2];
    const dossier = STATIC_DOSSIERS.find((d) => d.id === caseId) || STATIC_DOSSIERS[0];

    if (subPath === 'progress') {
      return jsonResponse({ revision: dossier.revision, job: null });
    }
    if (subPath === 'submissions') {
      return jsonResponse({
        items: [toSummary(dossier)],
        total: 1,
        offset: 0,
        limit: 20,
        latestId: dossier.id,
      });
    }
    if (subPath === 'legal') {
      return jsonResponse({
        regime: 'Luật Xây dựng 2026 & Nghị định 217/2026/NĐ-CP',
        effectiveDate: '2026-07-01',
        submissionDate: dossier.legalDate,
        transitional: false,
        note: 'Hồ sơ nộp sau ngày 01/07/2026, áp dụng toàn bộ quy định tại Nghị định 217/2026/NĐ-CP.',
      });
    }
    if (subPath === 'appraisal-sheet') {
      return jsonResponse(buildAppraisalSheet(dossier));
    }
    if (subPath === 'permit') {
      return jsonResponse(buildPermitView(dossier));
    }
    if (subPath === 'stamping') {
      return jsonResponse(buildStampingView(dossier));
    }
    if (subPath === 'procedure-review') {
      return jsonResponse({
        procedure: dossier.procedure || 'bcnckt',
        subtype: dossier.procedure === 'gpxd' ? 'new_permit' : 'new_construction',
        subtypes: [
          { id: 'new_construction', label: 'Dự án đầu tư xây dựng mới' },
          { id: 'adjustment', label: 'Dự án điều chỉnh báo cáo NCKT' },
        ],
        sections: [],
        conclusion: 'eligible',
        note: 'Đã rà soát đầy đủ điều kiện theo quy định.',
        locked: false,
      });
    }
    if (subPath === 'workflow') {
      return jsonResponse({
        status: dossier.status,
        assignee: dossier.assignee,
        assigneeId: dossier.assigneeId,
        department: dossier.department,
        canAssign: true,
        canTransition: true,
        reviewers: [
          { id: 'user-reviewer-01', name: 'KS. Lò Văn Minh', department: 'Phòng Quản lý Xây dựng' },
          { id: 'user-reviewer-02', name: 'ThS. Nguyễn Hoàng Tùng', department: 'Phòng Quy hoạch - Kiến trúc' },
          { id: 'user-reviewer-03', name: 'KS. Trần Thị Mai Hương', department: 'Phòng Quản lý Hạ tầng Kỹ thuật' },
        ],
        transitions: [],
        history: dossier.audit,
      });
    }
    if (subPath === 'audit') {
      return jsonResponse({
        items: dossier.audit.map((a) => ({
          id: a.id,
          created_at: a.at,
          actor_name: a.actor,
          action: a.action,
          detail: a.detail,
        })),
        total: dossier.audit.length,
        offset: 0,
        limit: 50,
      });
    }

    return jsonResponse(dossier);
  }

  const caseDetailMatch = pathname.match(/^\/cases\/([^/]+)$/);
  if (caseDetailMatch) {
    const caseId = decodeURIComponent(caseDetailMatch[1]);
    const dossier = STATIC_DOSSIERS.find((d) => d.id === caseId) || STATIC_DOSSIERS[0];
    return jsonResponse(dossier);
  }

  // 5. Catalogs (Organizations, Personnel, Material Prices)
  if (pathname === '/organizations/options') {
    const search = searchParams.get('search') || '';
    const items = MOCK_ORGANIZATIONS.filter((o) => !search || matchesSmartSearch(`${o.name} ${o.code}`, search)).map(
      (o) => ({ id: o.id, name: o.name }),
    );
    return jsonResponse(items);
  }

  const catalogMatch = pathname.match(/^\/catalog\/([^/]+)$/);
  if (catalogMatch) {
    const kind = catalogMatch[1];
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || 'all';
    const status = searchParams.get('status') || 'all';
    const offset = Number(searchParams.get('offset') || 0);
    const limit = Number(searchParams.get('limit') || 50);

    if (kind === 'organizations') {
      const rows = MOCK_ORGANIZATIONS.map((o) => ({
        id: o.id,
        code: o.code,
        name: o.name,
        category: o.type,
        tax_code: o.taxCode,
        address: o.address,
        representative: o.representative,
        phone: o.phone,
        certificate_number: o.certificateNumber || '',
        certificate_grade: o.certificateGrade || 'I',
        certificate_expiry: o.certificateExpiry || '2028-12-31',
        active_projects_count: o.activeProjectsCount,
        status: o.status,
      })).filter((r) => {
        if (search && !matchesSmartSearch(`${r.name} ${r.code} ${r.tax_code} ${r.address}`, search)) return false;
        if (category !== 'all' && r.category !== category) return false;
        if (status !== 'all' && r.status !== status) return false;
        return true;
      });
      return jsonResponse({
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
        categories: ['investor', 'consultant_design', 'consultant_audit', 'contractor', 'supervisor'],
        statuses: ['hieu_luc', 'sap_het_han', 'het_han'],
        canEdit: false,
      });
    }

    if (kind === 'personnel') {
      const rows = MOCK_PERSONNEL.map((p) => ({
        id: p.id,
        code: p.code,
        full_name: p.fullName,
        id_card: p.idCard,
        phone: p.phone,
        email: p.email,
        organization_id: p.orgId,
        organization_name: p.orgName,
        specialties: p.specialties,
        certificate_number: p.certNumber,
        certificate_grade: p.certGrade,
        certificate_issuer: p.certIssuer,
        certificate_expiry: p.certExpiry,
        status: p.status,
        active_projects_count: p.activeProjectsCount,
        has_conflict_warning: Boolean(p.hasConflictWarning),
      })).filter((r) => {
        if (search && !matchesSmartSearch(`${r.full_name} ${r.code} ${r.certificate_number} ${r.organization_name}`, search))
          return false;
        if (status !== 'all' && r.status !== status) return false;
        return true;
      });
      return jsonResponse({
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
        categories: [],
        statuses: ['hieu_luc', 'sap_het_han', 'het_han'],
        canEdit: false,
      });
    }

    if (kind === 'material_prices') {
      const rows = MOCK_MATERIAL_PRICES.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        category: m.region,
        unit: m.unit,
        standard_price: m.standardPrice,
        market_price: m.marketPrice,
        region: m.region,
        period: m.period,
        supplier: m.supplier,
        status: 'active',
      })).filter((r) => {
        if (search && !matchesSmartSearch(`${r.name} ${r.code} ${r.region} ${r.supplier}`, search)) return false;
        if (category !== 'all' && r.category !== category) return false;
        return true;
      });
      return jsonResponse({
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
        categories: Array.from(new Set(MOCK_MATERIAL_PRICES.map((m) => m.region))),
        statuses: ['active'],
        canEdit: false,
      });
    }
  }

  const entityMatch = pathname.match(/^\/entities\/([^/]+)\/([^/]+)$/);
  if (entityMatch) {
    const type = entityMatch[1];
    const id = decodeURIComponent(entityMatch[2]);
    if (type === 'organization') {
      const org = MOCK_ORGANIZATIONS.find((o) => o.id === id) || MOCK_ORGANIZATIONS[0];
      return jsonResponse({
        id: org.id,
        code: org.code,
        name: org.name,
        address: org.address,
        phone: org.phone,
        tax_code: org.taxCode,
        legal_rep: org.representative,
        cert_number: org.certificateNumber || '',
        cert_grade: org.certificateGrade || 'I',
        cert_expiry: org.certificateExpiry || '2028-12-31',
      });
    }
    if (type === 'personnel') {
      const per = MOCK_PERSONNEL.find((p) => p.id === id) || MOCK_PERSONNEL[0];
      return jsonResponse({
        id: per.id,
        code: per.code,
        full_name: per.fullName,
        phone: per.phone,
        email: per.email,
        org_name: per.orgName,
        cert_number: per.certNumber,
        cert_grade: per.certGrade,
        cert_expiry: per.certExpiry,
      });
    }
  }

  // 6. Legal Assistant
  if (pathname === '/legal-assistant') {
    return jsonResponse({
      answer:
        'Theo quy định tại Điều 37 và Điều 38 Nghị định 217/2026/NĐ-CP và QCVN 01:2021/BXD, cơ quan chuyên môn về xây dựng thuộc UBND cấp tỉnh (Sở Xây dựng tỉnh Điện Biên) thực hiện thẩm định sự phù hợp với quy hoạch xây dựng, khả năng kết nối hạ tầng kỹ thuật, an toàn chịu lực và tuân thủ quy chuẩn kỹ thuật quốc gia. Thời hạn thẩm định BCNCKT đối với dự án nhóm B là không quá 20 ngày làm việc, dự án nhóm C không quá 15 ngày làm việc kể từ ngày nhận đủ hồ sơ hợp lệ.',
      citations: [
        {
          id: 'cit-1',
          document: 'Nghị định 217/2026/NĐ-CP',
          section: 'Điều 37 & Điều 38',
          quote: 'Nội dung và thời hạn thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng tại cơ quan chuyên môn về xây dựng.',
          effectiveDate: '2026-07-01',
        },
        {
          id: 'cit-2',
          document: 'QCVN 01:2021/BXD',
          section: 'Mục 2.6 — Bảng 2.8',
          quote: 'Mật độ xây dựng thuần tối đa của lô đất xây dựng công trình công cộng, dịch vụ đô thị và nhà ở.',
          effectiveDate: '2021-11-19',
        },
      ],
      provider: 'rule-based',
      model: 'ND217-LegalKB-v1',
    });
  }

  if (pathname === '/legal-assistant/evaluation') {
    return jsonResponse({
      total: 14,
      passed: 14,
      passRate: 1,
      items: [],
    });
  }

  return jsonResponse({ items: [], total: 0, offset: 0, limit: 50 });
}
