import holidays from './data/holidays.json' with { type: 'json' };
import { caseSubtype, latestReview, toVnDate, vnToday, type AppraisalCase } from './domain.js';
import { resolveProfile, type LegalCase } from './legal.js';
import { intakeDays, policy, waitDays } from './procedure-policy.js';
import { read } from './database.js';

export const POLICY_VERSION = 'sla-2026.09.29-nd217-steps';
export const POLICY_STATUS = 'requires_confirmation';
export const STATES: Record<string, string> = {
  on_track: 'Trong hạn',
  due_soon: 'Sắp đến hạn',
  overdue: 'Quá hạn',
  paused: 'Tạm dừng chờ bổ sung',
  completed: 'Đã hoàn tất đúng hạn',
  completed_late: 'Hoàn tất quá hạn',
  superseded: 'Đã có lần nộp bổ sung',
  supplement_overdue: 'Quá hạn bổ sung — xem xét dừng',
  closed: 'Đã dừng / từ chối',
  unconfigured: 'Chưa xác định hạn',
};
const permitDays: Record<string, number> = {
  house: 7,
  new: 10,
  stage: 10,
  group: 10,
  relocation: 10,
  temporary: 10,
  amendment: 9,
  repair: 9,
  extension: 5,
  reissue: 5,
};
const feasibilityDays: Record<string, [number, number, string]> = {
  A: [25, 20, 'b'],
  B: [20, 16, 'c'],
  C: [15, 12, 'd'],
};
export function normalizeGroup(value: unknown): string | null {
  const text = String(value || '')
    .toUpperCase()
    .replace('NHÓM', '')
    .trim();
  return ['QG', 'QUAN TRỌNG QUỐC GIA'].includes(text) ? 'QG' : ['A', 'B', 'C'].includes(text) ? text : null;
}
export function normalizeGrade(value: unknown): string | null {
  const text = String(value || '')
    .toUpperCase()
    .replace('CẤP', '')
    .trim();
  return ['DB', 'ĐB', 'ĐẶC BIỆT', 'DAC BIET'].includes(text)
    ? 'DB'
    : ['I', 'II', 'III', 'IV'].includes(text)
      ? text
      : null;
}
export interface Period {
  days?: number;
  unit?: string;
  basis?: string;
  missing?: string;
}
export function legalPeriod(
  procedure: string,
  group: string | null,
  grade: string | null,
  subtype?: string | null,
  regime = 'nd217',
): Period {
  const high = grade === 'I' || grade === 'DB';
  if (procedure === 'bcnckt' && regime === 'nd175') {
    const days = ({ A: 35, B: 25, C: 15 } as Record<string, number>)[group || ''];
    return days
      ? {
          days,
          unit: 'calendar',
          basis: 'Khoản 2 Điều 59 Luật Xây dựng 2014 (sửa đổi 2020), áp dụng theo khoản 2 Điều 76 NĐ 217/2026/NĐ-CP',
        }
      : { missing: 'Dự án chưa có nhóm A/B/C (chế độ NĐ 175/2024).' };
  }
  if (procedure === 'bcnckt') {
    if (group === 'QG') return { days: 60, unit: 'calendar', basis: 'Điểm a khoản 1 Điều 37 NĐ 217/2026/NĐ-CP' };
    const values = feasibilityDays[group || ''];
    if (!values) return { missing: 'Dự án chưa có nhóm A/B/C/QG.' };
    if (!grade) return { missing: 'Dự án chưa có cấp công trình.' };
    return {
      days: values[high ? 0 : 1],
      unit: 'working',
      basis: `Điểm ${values[2]} khoản 1 Điều 37 NĐ 217/2026/NĐ-CP`,
    };
  }
  if (procedure === 'gpxd')
    return permitDays[subtype || 'new']
      ? { days: permitDays[subtype || 'new'], unit: 'working', basis: 'Điểm b khoản 1 Điều 54 NĐ 217/2026/NĐ-CP' }
      : { missing: 'Chưa chọn loại thủ tục GPXD.' };
  if (procedure === 'nghiem_thu' && subtype === 'start_notice')
    return {
      days: 5,
      unit: 'working',
      basis: 'Khoản 2 Điều 12 NĐ 207/2026/NĐ-CP; TT 39/2026/TT-BXD (cập nhật cơ sở dữ liệu quốc gia)',
    };
  if (procedure === 'nghiem_thu' && subtype === 'during')
    return {
      days: 10,
      unit: 'working',
      basis: 'Điểm b khoản 3 Điều 27 NĐ 207/2026/NĐ-CP (thông báo kết quả trong 10 ngày làm việc từ ngày kiểm tra)',
    };
  if (procedure === 'nghiem_thu')
    return grade
      ? {
          days: high ? 16 : 12,
          unit: 'working',
          basis: 'Điều 27 NĐ 207/2026/NĐ-CP (thời hạn ra văn bản thông báo kết quả kiểm tra)',
        }
      : { missing: 'Dự án chưa có cấp công trình.' };
  return { missing: 'Loại hồ sơ chưa có quy định thời hạn.' };
}
export function addCalendarDays(day: string, count: number): string {
  const moment = new Date(day + 'T00:00:00Z');
  moment.setUTCDate(moment.getUTCDate() + count);
  return moment.toISOString().slice(0, 10);
}
export type Holiday = { date: string; kind: string; confirmed: boolean };
export class Calendar {
  readonly off = new Map<string, boolean>();
  readonly worked = new Set<string>();
  readonly years = new Set<number>();
  constructor(
    days: Holiday[],
    public version: string,
  ) {
    for (const day of days) {
      this.years.add(Number(day.date.slice(0, 4)));
      if (day.kind === 'lam_bu') this.worked.add(day.date);
      else this.off.set(day.date, day.confirmed);
    }
  }
  isWorking(day: string): boolean {
    const week = new Date(day + 'T00:00:00Z').getUTCDay();
    return this.worked.has(day) || (week > 0 && week < 6 && !this.off.has(day));
  }
  add(start: string, count: number): string {
    let day = start;
    while (count > 0) {
      day = addCalendarDays(day, 1);
      if (this.isWorking(day)) count--;
    }
    return day;
  }
  between(start: string, end: string): number {
    let n = 0;
    for (let day = addCalendarDays(start, 1); day <= end; day = addCalendarDays(day, 1)) if (this.isWorking(day)) n++;
    return n;
  }
  confirmed(start: string, end: string): boolean {
    for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++)
      if (!this.years.has(year)) return false;
    return [...this.off].every(([day, ok]) => day < start || day > end || ok);
  }
}
export const demoCalendar = () => new Calendar(holidays.days, holidays.version);
let cached: { until: number; calendar: Calendar } | undefined;
export async function loadCalendar(actor?: string, cloud = false): Promise<Calendar> {
  if (!cloud) return demoCalendar();
  if (cached && cached.until > Date.now()) return cached.calendar;
  let calendar: Calendar;
  try {
    const rows = await read<{ holiday_date: Date | string; kind: string; is_confirmed: boolean }>(
      actor!,
      'select holiday_date,kind,is_confirmed from public.holidays',
    );
    calendar = new Calendar(
      rows.map((row) => ({
        date: row.holiday_date instanceof Date ? row.holiday_date.toISOString().slice(0, 10) : row.holiday_date,
        kind: row.kind,
        confirmed: row.is_confirmed,
      })),
      'public.holidays',
    );
  } catch {
    calendar = demoCalendar();
    calendar.version += '+fallback';
  }
  cached = { until: Date.now() + 600_000, calendar };
  return calendar;
}
export interface WorkflowData {
  state?: string;
  assigneeId?: string;
  validAt?: string;
  extended?: boolean;
  visitDate?: string;
  deadline?: string | null;
  history?: Array<{ to?: string; at: string; [key: string]: unknown }>;
  counters?: Record<string, number>;
  [key: string]: unknown;
}
export interface DeadlineCase extends AppraisalCase, LegalCase {
  workflow?: WorkflowData;
  legalDate: string;
  finalReview: { decision: string; at?: string; [key: string]: unknown } | null;
}
function entered(value: DeadlineCase, target: string): string | null {
  const entry = [...(value.workflow?.history || [])].reverse().find((item) => item.to === target);
  return toVnDate(entry?.at || (value.updatedAt as string | undefined));
}
export function outcome(value: DeadlineCase): [string | null, string | null] {
  if (value.finalReview?.decision === 'reviewed') return ['reviewed', toVnDate(value.finalReview.at)];
  const state = value.workflow?.state;
  return state && ['rejected', 'stopped'].includes(state) ? [state, entered(value, state)] : [null, null];
}
export function compute(value: DeadlineCase, calendar: Calendar, classification: { group?: unknown; grade?: unknown }) {
  const procedure = value.procedure || 'bcnckt';
  const workflow = value.workflow || {};
  const current = workflow.state || 'received';
  const group = normalizeGroup(classification.group);
  const grade = normalizeGrade(classification.grade);
  const subtype = caseSubtype(value);
  const regime = procedure === 'bcnckt' && value.legalDate ? resolveProfile(value).code : 'nd217';
  const period = legalPeriod(procedure, group, grade, subtype, regime === 'nd175' ? 'nd175' : 'nd217');
  const received = toVnDate(value.legalContext?.submissionDate || value.legalDate);
  const valid = toVnDate(workflow.validAt);
  let start = valid || received;
  if (procedure === 'nghiem_thu' && subtype === 'during')
    start = toVnDate(workflow.visitDate || (latestReview(value)?.visitDate as string | undefined));
  let legalDue: string | null = null;
  if (start && period.days) {
    const total = period.days * (workflow.extended ? 2 : 1);
    legalDue = period.unit === 'calendar' ? addCalendarDays(start, total) : calendar.add(start, total);
  }
  const days = intakeDays(procedure, subtype);
  const intakeDue =
    received && days && !valid && ['received', 'assigned'].includes(current) ? calendar.add(received, days) : null;
  const paused = ['awaiting_supplement', 'suspended'].includes(current);
  const pausedSince = paused ? entered(value, current) : null;
  const wait = waitDays(procedure, current === 'suspended' ? 'suspend' : 'supplement', subtype);
  const waitingDue = paused && pausedSince && wait ? calendar.add(pausedSince, wait) : null;
  const internalDue = toVnDate(workflow.deadline);
  const due = intakeDue || legalDue || internalDue;
  const kind = intakeDue ? 'intake' : legalDue ? 'legal' : internalDue ? 'internal' : null;
  const [result, finished] = outcome(value);
  return {
    policyVersion: POLICY_VERSION,
    policyStatus: POLICY_STATUS,
    calendarVersion: calendar.version,
    calendarConfirmed: Boolean(start && due) && calendar.confirmed(start!, due! > start! ? due! : start!),
    basis: period.basis || null,
    regime: regime === 'nd175' ? 'nd175' : 'nd217',
    intakeBasis: intakeDue ? policy(procedure).intakeBasis || null : null,
    missing: period.missing || null,
    periodDays: period.days || null,
    periodUnit: period.unit || null,
    extended: Boolean(workflow.extended),
    projectGroup: group,
    projectGrade: grade,
    receivedDate: received,
    startDate: start,
    validated: Boolean(valid),
    intakeDueDate: intakeDue,
    legalDueDate: legalDue,
    internalDueDate: internalDue,
    dueDate: due,
    dueKind: kind,
    paused,
    pausedSince,
    waitingDueDate: waitingDue,
    pausedDays: 0,
    outcome: result,
    completedAt: finished,
  };
}
export interface SlaSnapshot {
  dueDate?: string | null;
  completedAt?: string | null;
  waitingDueDate?: string | null;
  paused?: boolean;
  dueKind?: string | null;
  outcome?: string | null;
}
export const soonLimit = (calendar: Calendar, today = vnToday()) => calendar.add(today, 3);
export function evaluate(sla: SlaSnapshot | null, calendar: Calendar, superseded = false, today = vnToday()) {
  sla ||= {};
  const due = toVnDate(sla.dueDate);
  const finished = toVnDate(sla.completedAt);
  const waiting = toVnDate(sla.waitingDueDate);
  let remaining: number | null = null;
  let phase = sla.paused ? 'waiting' : sla.dueKind || 'legal';
  let state: string;
  if (finished) {
    state = ['rejected', 'stopped'].includes(sla.outcome || '')
      ? 'closed'
      : due && finished > due
        ? 'completed_late'
        : 'completed';
    phase = 'closed';
  } else if (superseded) state = 'superseded';
  else if (sla.paused) {
    state = waiting && today > waiting ? 'supplement_overdue' : 'paused';
    if (waiting) remaining = today <= waiting ? calendar.between(today, waiting) : -calendar.between(waiting, today);
  } else if (!due) state = 'unconfigured';
  else if (today > due) {
    state = 'overdue';
    remaining = -calendar.between(due, today);
  } else {
    remaining = calendar.between(today, due);
    state = due <= soonLimit(calendar, today) ? 'due_soon' : 'on_track';
  }
  return { state, label: STATES[state], remainingWorkingDays: remaining, phase };
}
