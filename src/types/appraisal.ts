export interface SourceRef {
  documentId: string;
  segmentId: string;
  locator: string;
  quote: string;
}
export interface ChecklistCandidate extends SourceRef {
  id: string;
  requirementId: string;
  name: string;
  category: string;
  accepted: boolean;
}
export interface Segment {
  id: string;
  locator: string;
  page: number | null;
  text: string;
}
export interface DossierDocument {
  id: string;
  requirementId: string;
  name: string;
  role: string;
  version: number;
  hash: string;
  size: number;
  uploadedAt: string;
  segments: Segment[];
  warnings: string[];
  signature: string;
}
export interface Fact extends SourceRef {
  id: string;
  key: string;
  label: string;
  value: string;
  rawValue: string;
  unit: string;
  method: string;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewNote: string;
}
export interface Finding {
  id: string;
  code: string;
  category: string;
  title: string;
  result: string;
  explanation: string;
  sources: SourceRef[];
  calculation: string;
  missingEvidence: string[];
  legalRefs: { label: string; url: string }[];
  review: null | { decision: string; note: string; actor: string; at: string };
}
export interface AppraisalRun {
  aiCoverage?: AiCoverage;
  aiProvenance?: {
    provider: string;
    model: string;
    promptVersion: string;
    selectionVersion: string;
    inputHash: string;
    revision: number;
    elapsedMs: number;
  };
  id: string;
  createdAt: string;
  ruleVersion: string;
  mode: string;
  stale: boolean;
  findings: Finding[];
  documentIds: string[];
  provider: string;
  aiStatus: string;
  aiNotes: { text: string; sources: (Segment & { documentId: string })[]; status: string; model: string }[];
  costVersions: {
    documentId: string;
    name: string;
    version: number;
    total: string;
    sum: string;
    items: { key: string; name: string; value: string }[];
  }[];
  costComparison: null | {
    before: string;
    after: string;
    netSavings: string;
    items: { name: string; before: string; after: string; difference: string }[];
  };
}
export interface DossierSummary {
  id: string;
  dossierId?: string;
  previousSubmissionId?: string;
  previousSubmissionName?: string;
  submissionCode?: string;
  submissionRound?: number;
  documentCount?: number;
  sampleScenario?: string;
  projectId?: string;
  projectName?: string;
  projectCode?: string;
  procedure?: import('../lib/projectProcedures').ProjectProcedure;
  createdAt?: string;
  name: string;
  province: string;
  department: string;
  sample: boolean;
  legalDate: string;
  updatedAt: string;
  status: string;
  revision: number;
  slaDueDate?: string | null;
  slaState?: SlaState;
}
export interface Dossier extends DossierSummary {
  readOnly?: boolean;
  checklistCandidates?: ChecklistCandidate[];
  assignee: string;
  tenantId: string;
  requirements: {
    id: string;
    name: string;
    category: string;
    required: boolean;
    status: string;
    note: string;
    verifiedBy: string | null;
  }[];
  documents: DossierDocument[];
  facts: Fact[];
  runs: AppraisalRun[];
  consultations: { id: string; text: string; response: string; actor: string; at: string; status: string }[];
  audit: { id: string; at: string; actor: string; action: string; detail: string }[];
  job?: {
    id: string;
    status: string;
    mode?: string;
    documentId?: string;
    startedAt?: string;
    finishedAt?: string;
    useModel?: boolean;
  };
  finalReview: null | { decision: string; note: string; actor: string; at: string; simulation: boolean };
  sla?: SlaFacts;
}
export interface ModelProvider {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  connection: { status: 'not_checked' | 'connected' | 'error'; checkedAt: string | null; message: string };
}
export interface Health {
  modelProvider?: ModelProvider;
  mode: string;
  modelConfigured: boolean;
  actor: { name: string; role: string; department: string };
  ocrAvailable: boolean;
}
export interface AiCoverage {
  selectedSegments: number;
  totalSegments: number;
  selectedCharacters: number;
  totalCharacters: number;
  documents: { name: string; selectedSegments: number; totalSegments: number; locators: string[]; complete: boolean }[];
}
export type SlaStateId =
  | 'on_track'
  | 'due_soon'
  | 'overdue'
  | 'paused'
  | 'completed'
  | 'completed_late'
  | 'superseded'
  | 'supplement_overdue'
  | 'closed'
  | 'unconfigured';
export interface SlaState {
  state: SlaStateId;
  label: string;
  remainingWorkingDays: number | null;
  phase?: 'intake' | 'legal' | 'internal' | 'waiting' | 'closed';
}
export interface SlaFacts {
  policyVersion: string;
  policyStatus: string;
  calendarVersion: string;
  calendarConfirmed: boolean;
  basis: string | null;
  missing: string | null;
  periodDays: number | null;
  periodUnit: 'working' | 'calendar' | null;
  projectGroup: string | null;
  projectGrade: string | null;
  startDate: string | null;
  legalDueDate: string | null;
  internalDueDate: string | null;
  dueDate: string | null;
  dueKind: 'intake' | 'legal' | 'internal' | null;
  intakeDueDate?: string | null;
  intakeBasis?: string | null;
  receivedDate?: string | null;
  validated?: boolean;
  extended?: boolean;
  waitingDueDate?: string | null;
  outcome?: 'reviewed' | 'rejected' | 'stopped' | null;
  paused: boolean;
  pausedSince: string | null;
  pausedDays: number;
  completedAt: string | null;
}

/** Phiếu thẩm định BCNCKT theo Điều 38 NĐ 217/2026 (mục V–VI Mẫu số 03). */
export type SheetStatus = 'pending' | 'meets' | 'revise' | 'fails' | 'not_applicable';
export type SheetConclusion = 'pending' | 'eligible' | 'eligible_after_revision' | 'ineligible';
export interface SheetSection {
  id: string;
  title: string;
  form: string;
  basis: string;
  criteria: string[];
  applicable: boolean;
  status: SheetStatus;
  assessment: string;
  requirements: string[];
  findingIds: string[];
  suggestion: {
    status: SheetStatus | null;
    reason: string;
    requirements: string[];
    findings: { id: string; title: string; result: string; decision: string | null }[];
  };
}
export interface AppraisalSheetView {
  version: string;
  planningBases: Record<string, string>;
  statuses: Record<SheetStatus, string>;
  conclusions: Record<Exclude<SheetConclusion, 'pending'>, string>;
  planningBasis: string;
  sections: SheetSection[];
  conclusion: SheetConclusion;
  recommendations: string;
  suggestedConclusion: Exclude<SheetConclusion, 'pending'> | null;
  problems: string[];
  complete: boolean;
  hasRun: boolean;
  locked: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Đóng dấu, trả kết quả và lưu trữ — khoản 8, 9 Điều 36 NĐ 217/2026. */
export interface StampDrawing {
  code: string;
  name: string;
  sheets: number;
}
export interface StampingView {
  status: 'not_started' | 'to_stamp' | 'awaiting_request' | 'unstamped' | 'stamped' | 'archived';
  label: string;
  basis: string | null;
  conclusion: SheetConclusion | null;
  actions: { id: 'request' | 'refuse' | 'stamp' | 'pdf_received'; label: string }[];
  drawings: StampDrawing[];
  noticeReference: string;
  stampedAt: string | null;
  stampedBy: string | null;
  pdfDueDate: string | null;
  pdfReceivedAt: string | null;
  history: {
    action: string;
    label: string;
    date: string;
    reference: string;
    note: string;
    actor: string;
    at: string;
  }[];
  archive: { name: string; state: 'done' | 'missing' | 'optional' }[];
}

/** Giấy phép xây dựng: lấy ý kiến, cấp số, sổ giấy phép, thu hồi/hủy (NĐ 217/2026 Điều 49, 54, 63–66). */
export interface PermitConsultation {
  id: string;
  agency: string;
  subject: string;
  sentDate: string;
  dueDate: string;
  response: string;
  respondedDate: string | null;
  status: 'waiting' | 'responded' | 'silent_consent';
}
export interface PermitEvent {
  type: 'revoke' | 'return' | 'cancel';
  date: string;
  reference: string;
  reason: string;
  note: string;
  actor: string;
  at: string;
}
export interface PermitRecord {
  id: string;
  number: string;
  kind: string;
  form: string;
  issueDate: string;
  issuedBy: string;
  startDeadline: string;
  publicUntil: string;
  extensionNo?: number;
  content: Record<string, string>;
  note: string;
  events: PermitEvent[];
}
export type PermitStatus = 'valid' | 'start_overdue' | 'revoked' | 'returned' | 'cancelled';
export interface PermitView {
  consultations: PermitConsultation[];
  consultDays: number;
  permit: PermitRecord | null;
  status: PermitStatus | null;
  statusLabel: string | null;
  returnDueDate: string | null;
  cancelFromDate: string | null;
  actions: ('issue' | 'revoke' | 'return' | 'cancel')[];
  revokeReasons: Record<string, string>;
  subtype: string | null;
  eligible: boolean;
  reviewed: boolean;
  basePermits?: { number: string; projectName: string; status: string }[];
}
export interface PermitRegisterRow {
  number: string;
  caseId: string;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  form: string;
  kind: string;
  issueDate: string;
  investor: string;
  location: string;
  startDeadline: string;
  publicUntil: string;
  public: boolean;
  extensions: number;
  history: { kind: string; issueDate: string; caseId: string }[];
  status: PermitStatus;
  statusLabel: string;
}
