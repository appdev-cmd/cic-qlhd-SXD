import { randomUUID } from 'node:crypto';
import type { Actor } from './auth.js';

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
