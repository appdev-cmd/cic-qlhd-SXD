/**
 * Động cơ tính thời hạn giải quyết (SLA) theo NGÀY LÀM VIỆC:
 * bỏ qua thứ Bảy, Chủ nhật và ngày nghỉ lễ, Tết (bảng holidays).
 * Quy tắc số ngày được quản lý như dữ liệu (SLA_RULES) để cập nhật khi pháp luật thay đổi.
 */
import type { Holiday, ProcedureType, Project } from '../types/domain';

export type IsoDate = string; // yyyy-mm-dd

// ─── Tiện ích ngày (không phụ thuộc múi giờ: xử lý bằng UTC) ───────────────────

export function parseIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): IsoDate {
  const now = new Date();
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function addCalendarDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function buildHolidaySet(holidays: Pick<Holiday, 'date' | 'kind'>[]): Set<IsoDate> {
  return new Set(holidays.filter((h) => h.kind !== 'lam_bu').map((h) => h.date));
}

export function isWorkingDay(iso: IsoDate, holidaySet: Set<IsoDate>): boolean {
  const dow = parseIsoDate(iso).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidaySet.has(iso);
}

/**
 * Ngày làm việc thứ N sau ngày bắt đầu (không tính ngày bắt đầu).
 * VD: tiếp nhận thứ Sáu, N = 1 → thứ Hai kế tiếp (nếu không phải ngày lễ).
 */
export function addWorkingDays(start: IsoDate, workingDays: number, holidaySet: Set<IsoDate>): IsoDate {
  let current = start;
  let remaining = workingDays;
  while (remaining > 0) {
    current = addCalendarDays(current, 1);
    if (isWorkingDay(current, holidaySet)) remaining -= 1;
  }
  return current;
}

/** Số ngày làm việc trong khoảng (from, to] — âm nếu to < from. */
export function workingDaysBetween(from: IsoDate, to: IsoDate, holidaySet: Set<IsoDate>): number {
  if (from === to) return 0;
  const sign = to > from ? 1 : -1;
  const [a, b] = sign > 0 ? [from, to] : [to, from];
  let count = 0;
  let current = a;
  while (current < b) {
    current = addCalendarDays(current, 1);
    if (isWorkingDay(current, holidaySet)) count += 1;
  }
  return sign * count;
}

// ─── Quy tắc thời hạn (dữ liệu) ────────────────────────────────────────────────

export interface SlaRule {
  procedureType: ProcedureType;
  /** Áp dụng cho nhóm dự án (bỏ trống = mọi nhóm) */
  projectGroups?: Project['projectGroup'][];
  /** true: công trình cấp I trở lên (cấp I, cấp đặc biệt); false: các cấp còn lại; bỏ trống: mọi cấp */
  gradeIOrAbove?: boolean;
  workingDays: number;
  citation: string;
  /** Quy tắc cần cán bộ pháp chế xác nhận lại */
  needsConfirmation?: boolean;
}

export const SLA_RULES: SlaRule[] = [
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['QG', 'A'], gradeIOrAbove: true, workingDays: 25, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['QG', 'A'], gradeIOrAbove: false, workingDays: 20, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['B'], gradeIOrAbove: true, workingDays: 20, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['B'], gradeIOrAbove: false, workingDays: 16, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['C'], gradeIOrAbove: true, workingDays: 15, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'tham_dinh_bcnckt', projectGroups: ['C'], gradeIOrAbove: false, workingDays: 12, citation: 'Điều 37 NĐ 217/2026/NĐ-CP' },
  { procedureType: 'cap_gpxd', workingDays: 20, citation: 'Luật Xây dựng 2025 & NĐ 217/2026/NĐ-CP (cấp GPXD)' },
  {
    procedureType: 'kiem_tra_nghiem_thu',
    workingDays: 20,
    citation: 'NĐ 207/2026/NĐ-CP (kiểm tra công tác nghiệm thu)',
    needsConfirmation: true,
  },
];

/** Thời hạn kiểm tra tính hợp lệ của hồ sơ (ngày làm việc) */
export const COMPLETENESS_CHECK_DAYS = 5;
/** Thời hạn chủ đầu tư bổ sung hồ sơ khi bị tạm dừng (ngày làm việc), chỉ yêu cầu 01 lần */
export const SUPPLEMENT_DAYS = 20;
/** Ngưỡng cảnh báo sắp đến hạn (ngày làm việc) */
export const WARNING_THRESHOLDS = { early: 5, urgent: 2 } as const;

export function isGradeIOrAbove(grade: Project['buildingGrade']): boolean {
  return grade === 'I' || grade === 'DB';
}

export function findSlaRule(
  procedureType: ProcedureType,
  projectGroup: Project['projectGroup'],
  buildingGrade: Project['buildingGrade']
): SlaRule | undefined {
  const high = isGradeIOrAbove(buildingGrade);
  return SLA_RULES.find(
    (r) =>
      r.procedureType === procedureType &&
      (!r.projectGroups || r.projectGroups.includes(projectGroup)) &&
      (r.gradeIOrAbove === undefined || r.gradeIOrAbove === high)
  );
}

export interface DeadlineResult {
  deadline: IsoDate;
  workingDays: number;
  rule?: SlaRule;
}

/** Hạn trả kết quả = ngày nhận đủ hồ sơ hợp lệ + số ngày làm việc theo quy tắc (+ số ngày gia hạn). */
export function computeDeadline(params: {
  receivedDate: IsoDate;
  procedureType: ProcedureType;
  projectGroup: Project['projectGroup'];
  buildingGrade: Project['buildingGrade'];
  holidays: Set<IsoDate>;
  extensionDays?: number;
}): DeadlineResult {
  const rule = findSlaRule(params.procedureType, params.projectGroup, params.buildingGrade);
  const workingDays = (rule?.workingDays ?? 20) + (params.extensionDays ?? 0);
  return { deadline: addWorkingDays(params.receivedDate, workingDays, params.holidays), workingDays, rule };
}

export type SlaLevel = 'ok' | 'warning' | 'urgent' | 'overdue' | 'done' | 'paused';

export interface SlaState {
  level: SlaLevel;
  /** Số ngày làm việc còn lại (âm = đã quá hạn) */
  remainingWorkingDays: number;
  label: string;
}

/** Tình trạng SLA tại thời điểm `today` */
export function evaluateSla(
  project: Pick<Project, 'deadlineDate' | 'slaStatus'>,
  holidays: Set<IsoDate>,
  today: IsoDate = todayIso()
): SlaState {
  if (project.slaStatus === 'da_tham_dinh') return { level: 'done', remainingWorkingDays: 0, label: 'Đã có kết quả' };
  if (project.slaStatus === 'yeu_cau_bo_sung') {
    return { level: 'paused', remainingWorkingDays: 0, label: 'Tạm dừng — chờ chủ đầu tư bổ sung' };
  }
  const remaining = workingDaysBetween(today, project.deadlineDate, holidays);
  if (remaining < 0 || (remaining === 0 && today > project.deadlineDate)) {
    return { level: 'overdue', remainingWorkingDays: remaining, label: `Quá hạn ${Math.abs(remaining)} ngày LV` };
  }
  if (remaining <= WARNING_THRESHOLDS.urgent) {
    return { level: 'urgent', remainingWorkingDays: remaining, label: remaining === 0 ? 'Đến hạn hôm nay' : `Còn ${remaining} ngày LV` };
  }
  if (remaining <= WARNING_THRESHOLDS.early) {
    return { level: 'warning', remainingWorkingDays: remaining, label: `Còn ${remaining} ngày LV` };
  }
  return { level: 'ok', remainingWorkingDays: remaining, label: `Còn ${remaining} ngày LV` };
}
