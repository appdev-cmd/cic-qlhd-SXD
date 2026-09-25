import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  buildHolidaySet,
  computeDeadline,
  evaluateSla,
  findSlaRule,
  isWorkingDay,
  workingDaysBetween,
} from './sla';

const holidays = buildHolidaySet([
  { date: '2026-04-30', kind: 'le_tet' },
  { date: '2026-05-01', kind: 'le_tet' },
  { date: '2026-09-01', kind: 'le_tet' },
  { date: '2026-09-02', kind: 'le_tet' },
]);
const none = new Set<string>();

describe('ngày làm việc', () => {
  it('bỏ qua thứ Bảy, Chủ nhật', () => {
    expect(isWorkingDay('2026-09-26', none)).toBe(false); // thứ Bảy
    expect(isWorkingDay('2026-09-27', none)).toBe(false); // Chủ nhật
    expect(isWorkingDay('2026-09-28', none)).toBe(true); // thứ Hai
  });

  it('tiếp nhận thứ Sáu + 1 ngày LV = thứ Hai', () => {
    expect(addWorkingDays('2026-09-25', 1, none)).toBe('2026-09-28');
  });

  it('bỏ qua ngày lễ 30/4, 1/5', () => {
    // Thứ Tư 29/4 + 1 ngày LV: 30/4 (lễ), 1/5 (lễ), 2-3/5 (cuối tuần) → thứ Hai 4/5
    expect(addWorkingDays('2026-04-29', 1, holidays)).toBe('2026-05-04');
  });

  it('bỏ qua kỳ nghỉ Quốc khánh', () => {
    // Thứ Hai 31/8 + 2 ngày LV: 1/9, 2/9 nghỉ → 3/9, 4/9
    expect(addWorkingDays('2026-08-31', 2, holidays)).toBe('2026-09-04');
  });

  it('đếm số ngày LV giữa hai mốc (đối xứng âm/dương)', () => {
    expect(workingDaysBetween('2026-09-25', '2026-10-02', none)).toBe(5);
    expect(workingDaysBetween('2026-10-02', '2026-09-25', none)).toBe(-5);
    expect(workingDaysBetween('2026-09-25', '2026-09-25', none)).toBe(0);
  });
});

describe('quy tắc SLA thẩm định BCNCKT (Điều 37 NĐ 217/2026)', () => {
  it.each([
    ['A', 'I', 25],
    ['A', 'II', 20],
    ['B', 'I', 20],
    ['B', 'II', 16],
    ['C', 'I', 15],
    ['C', 'III', 12],
  ] as const)('Nhóm %s, cấp %s → %i ngày LV', (group, grade, days) => {
    expect(findSlaRule('tham_dinh_bcnckt', group, grade)?.workingDays).toBe(days);
  });

  it('cấp GPXD 20 ngày LV', () => {
    expect(findSlaRule('cap_gpxd', 'B', 'II')?.workingDays).toBe(20);
  });

  it('tính hạn trả kết quả có gia hạn', () => {
    const r = computeDeadline({
      receivedDate: '2026-09-25',
      procedureType: 'tham_dinh_bcnckt',
      projectGroup: 'C',
      buildingGrade: 'III',
      holidays: none,
      extensionDays: 3,
    });
    expect(r.workingDays).toBe(15);
    expect(r.deadline).toBe('2026-10-16');
  });
});

describe('đánh giá tình trạng SLA', () => {
  it('quá hạn', () => {
    expect(evaluateSla({ deadlineDate: '2026-09-21', slaStatus: 'dang_tham_dinh' }, none, '2026-09-25').level).toBe('overdue');
  });
  it('khẩn (≤ 2 ngày LV)', () => {
    expect(evaluateSla({ deadlineDate: '2026-09-29', slaStatus: 'dang_tham_dinh' }, none, '2026-09-25').level).toBe('urgent');
  });
  it('cảnh báo (≤ 5 ngày LV)', () => {
    expect(evaluateSla({ deadlineDate: '2026-10-02', slaStatus: 'dang_tham_dinh' }, none, '2026-09-25').level).toBe('warning');
  });
  it('đã có kết quả / tạm dừng', () => {
    expect(evaluateSla({ deadlineDate: '2026-01-01', slaStatus: 'da_tham_dinh' }, none, '2026-09-25').level).toBe('done');
    expect(evaluateSla({ deadlineDate: '2026-01-01', slaStatus: 'yeu_cau_bo_sung' }, none, '2026-09-25').level).toBe('paused');
  });
});
