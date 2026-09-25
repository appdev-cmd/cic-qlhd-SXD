/**
 * Kiểu dữ liệu hồ sơ thẩm định chuyên ngành (BCNCKT, GPXD, Nghiệm thu, Nhật ký AI).
 */

export interface AppraisalChecklistItem {
  category: string;
  item: string;
  standardRequired: string;
  designApplied: string;
  aiVerdict: 'dat' | 'can_bo_sung' | 'khong_dat';
  aiNotes: string;
}

export interface PlanningMetricItem {
  name: string;
  designValue: string;
  standardLimit: string;
  isPassed: boolean;
}

export interface FireSafetyData {
  agreementNumber: string;
  agreementDate: string;
  agency: string;
  fireResistanceGrade: string;
  evacuationDistance: string;
  evacuationStaircases: string;
  fireAccessRoad: string;
  waterReserve: string;
}

export interface CostBreakdownRow {
  name: string;
  originalValue: number;
  appraisedValue: number;
  difference: number;
  reason: string;
}

export interface CostEvaluationData {
  originalTotal: number;
  appraisedTotal: number;
  savingsTotal: number;
  items: CostBreakdownRow[];
}

export interface Sample03NoticeData {
  docNumber: string;
  docDate: string;
  signerName: string;
  signerTitle: string;
  submissionDoc: string;
  submissionDate: string;
  evaluationSummary: string;
  conclusion: string;
}

export interface LegalChecklistDoc {
  name: string;
  code: string;
  status: 'hop_le' | 'thieu' | 'can_bo_sung';
  note: string;
}

export interface PermitData {
  status: 'da_cap' | 'dang_tham_tra' | 'cho_bo_sung' | 'mien_gpxd';
  permitNumber: string;
  permitDate: string;
  checklistDocs: LegalChecklistDoc[];
  technicalConditions: {
    allowedGroundArea: string;
    allowedTotalFloorArea: string;
    allowedStories: string;
    allowedHeight: string;
    specialRequirements: string[];
  };
}

export interface InspectionData {
  groundBreakingConditions: {
    item: string;
    status: 'dat' | 'chua_dat';
    verifyDate: string;
  }[];
  phaseInspections: {
    phaseName: string;
    inspectDate: string;
    inspectTeam: string;
    verdict: 'chap_thuan' | 'yeu_cau_khac_phuc';
    findings: string;
  }[];
  finalNotice: {
    noticeNumber: string;
    issueDate: string;
    result: string;
    recommendations: string[];
  };
}

export interface AiAuditLog {
  timestamp: string;
  actor: string;
  action: string;
  details: string;
  badge: 'info' | 'success' | 'warning' | 'audit';
}

export interface ProjectAppraisalData {
  complianceChecklist: AppraisalChecklistItem[];
  planningMetrics: PlanningMetricItem[];
  fireSafety: FireSafetyData;
  costEvaluation: CostEvaluationData;
  sample03Notice: Sample03NoticeData;
  permit: PermitData;
  inspection: InspectionData;
  auditLogs: AiAuditLog[];
}
