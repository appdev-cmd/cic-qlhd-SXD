import { randomUUID } from 'node:crypto';
import type { Actor } from './auth.js';
import config from './data/domain.json' with { type: 'json' };

export const REQUIREMENTS = config.REQUIREMENTS as [string, string, string][];
export const COSTS = config.COSTS as [string, string][];
export const FIELDS = config.FIELDS as unknown as Record<string, [string, string]>;
export function newCase(
  name: string,
  province: string,
  actor: Actor,
  legalDate: string,
  options: {
    projectId?: string | null;
    sample?: boolean;
    schoolTemplate?: boolean;
    procedure?: string;
    projectName?: string | null;
    projectCode?: string | null;
  } = {},
) {
  const procedure = options.procedure || 'bcnckt';
  let requirements = options.schoolTemplate
    ? REQUIREMENTS
    : [
        ['TTR', 'Tờ trình và danh mục hồ sơ gửi kèm', 'Tiếp nhận'],
        ['KT01', 'Hồ sơ khảo sát địa hình', 'Khảo sát'],
        ['KT02', 'Hồ sơ khảo sát địa chất', 'Khảo sát'],
        ['KT03', 'Thuyết minh BCNCKT', 'Thiết kế'],
        ['KT04', 'Hồ sơ thiết kế cơ sở', 'Thiết kế'],
        ['KT05', 'Tổng mức đầu tư', 'Chi phí'],
        ['NL01', 'Năng lực tổ chức và nhân sự', 'Năng lực'],
      ];
  if (procedure !== 'bcnckt')
    requirements = [
      ['APPLICATION', 'Đơn / văn bản đề nghị', 'Tiếp nhận'],
      ['ATTACHMENTS', 'Tài liệu gửi kèm', 'Tiếp nhận'],
      ['DRAWINGS', 'Bản vẽ', 'Tiếp nhận'],
      ['RESULTS', 'Văn bản xử lý và kết quả', 'Xử lý'],
    ];
  return {
    procedure,
    projectName: options.projectName || null,
    projectCode: options.projectCode || null,
    id: uid(),
    projectId: options.projectId || null,
    name,
    province,
    tenantId: actor.tenantId,
    department: actor.department,
    assignee: actor.name,
    createdAt: now(),
    updatedAt: now(),
    legalDate,
    sample: Boolean(options.sample),
    revision: 1,
    legalContext: {
      submissionDate: legalDate,
      scope: 'construction',
      stage: 'original',
      priorStatus: 'unknown',
      note: '',
      confirmedBy: null,
    },
    legalRequirements: {},
    requirements: requirements.map(([id, name, category]) => ({
      id,
      name,
      category,
      required: procedure === 'bcnckt' && (Boolean(options.schoolTemplate) || id !== 'KT05'),
      status: 'missing',
      note: '',
      verifiedBy: null,
    })),
    documents: [],
    facts: [],
    runs: [],
    consultations: [],
    audit: [],
    status: 'intake',
    finalReview: null,
  };
}

export const uid = randomUUID;
export const now = (): string => new Date().toISOString();
const vietnam = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function toVnDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
    return value;
  }
  const moment =
    typeof value === 'string' ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value + 'Z') : value;
  if (!Number.isFinite(moment.getTime())) throw new Error('Invalid date');
  return vietnam.format(moment);
}
export const vnToday = (): string => toVnDate(new Date())!;

// JSON payloads are persisted unchanged; optional procedure fields evolve independently.
export interface Review {
  subtype?: string;
  [key: string]: unknown;
}
export interface DocumentSegment {
  id: string;
  locator: string;
  page: number | null;
  text: string;
}
export interface CaseDocument {
  id: string;
  requirementId: string;
  role: string;
  name: string;
  segments: DocumentSegment[];
  [key: string]: unknown;
}
export interface AppraisalCase {
  id: string;
  name: string;
  revision: number;
  procedure?: string;
  subtype?: string;
  documents: CaseDocument[];
  runs: Array<{ stale: boolean; [key: string]: unknown }>;
  audit: Array<{ id: string; at: string; actor: string; action: string; detail: string }>;
  procedureReview?: Review | null;
  procedureReviewHistory?: Array<Review | null>;
  job?: { status: string; [key: string]: unknown };
  finalReview: unknown;
  [key: string]: unknown;
}

export function latestReview(value: AppraisalCase): Review | null {
  return (
    value.procedureReview || [...(value.procedureReviewHistory || [])].reverse().find((item) => Boolean(item)) || null
  );
}
export function caseSubtype(value: AppraisalCase): string | null {
  return (
    value.subtype ||
    value.procedureReview?.subtype ||
    [...(value.procedureReviewHistory || [])].reverse().find((item) => Boolean(item?.subtype))?.subtype ||
    null
  );
}
export function audit(value: AppraisalCase, actor: Actor, action: string, detail: string): void {
  value.audit.push({ id: uid(), at: now(), actor: actor.name, action, detail });
}
export function invalidate(value: AppraisalCase): void {
  const subtype = caseSubtype(value);
  if (subtype) value.subtype = subtype;
  if (value.procedureReview) {
    (value.procedureReviewHistory ||= []).push(value.procedureReview);
    value.procedureReview = null;
  }
  if (value.job?.status === 'running') value.job.status = 'cancelled';
  value.finalReview = null;
  for (const run of value.runs) run.stale = true;
}
export function latestDocuments(value: Pick<AppraisalCase, 'documents'>, mode = 'intake'): CaseDocument[] {
  const result = new Map<string, CaseDocument>();
  for (const document of value.documents) {
    if (document.role === 'reference' && mode === 'intake') continue;
    result.set(JSON.stringify([document.requirementId, document.role]), document);
  }
  return [...result.values()];
}
