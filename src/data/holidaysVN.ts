import type { Holiday } from '../types/domain';

/**
 * Lịch nghỉ lễ, Tết (ngày thường rơi vào thứ 2–6) phục vụ tính ngày làm việc SLA.
 * Ngày cố định theo Bộ luật Lao động 2019 được đánh dấu isConfirmed = true.
 * Ngày Tết Âm lịch, nghỉ bù, ngày liền kề Quốc khánh phụ thuộc thông báo hằng năm
 * của Bộ Nội vụ — cán bộ cần xác nhận lại (isConfirmed = false).
 */
export const VN_HOLIDAYS: Holiday[] = [
  // ─── Năm 2026 ───
  { date: '2026-01-01', name: 'Tết Dương lịch', kind: 'le_tet', isConfirmed: true },
  { date: '2026-02-16', name: 'Tết Nguyên đán Bính Ngọ (28 Tết)', kind: 'le_tet', isConfirmed: false },
  { date: '2026-02-17', name: 'Tết Nguyên đán Bính Ngọ (Mùng 1)', kind: 'le_tet', isConfirmed: false },
  { date: '2026-02-18', name: 'Tết Nguyên đán Bính Ngọ (Mùng 2)', kind: 'le_tet', isConfirmed: false },
  { date: '2026-02-19', name: 'Tết Nguyên đán Bính Ngọ (Mùng 3)', kind: 'le_tet', isConfirmed: false },
  { date: '2026-02-20', name: 'Tết Nguyên đán Bính Ngọ (Mùng 4)', kind: 'le_tet', isConfirmed: false },
  { date: '2026-04-27', name: 'Nghỉ bù Giỗ Tổ Hùng Vương (26/04 rơi vào Chủ nhật)', kind: 'nghi_bu', isConfirmed: false },
  { date: '2026-04-30', name: 'Ngày Chiến thắng 30/4', kind: 'le_tet', isConfirmed: true },
  { date: '2026-05-01', name: 'Ngày Quốc tế Lao động', kind: 'le_tet', isConfirmed: true },
  { date: '2026-09-01', name: 'Nghỉ liền kề Quốc khánh', kind: 'le_tet', isConfirmed: false },
  { date: '2026-09-02', name: 'Quốc khánh', kind: 'le_tet', isConfirmed: true },
  // ─── Năm 2027 (dự kiến) ───
  { date: '2027-01-01', name: 'Tết Dương lịch', kind: 'le_tet', isConfirmed: true },
  { date: '2027-02-04', name: 'Tết Nguyên đán Đinh Mùi (29 Tết)', kind: 'le_tet', isConfirmed: false },
  { date: '2027-02-05', name: 'Tết Nguyên đán Đinh Mùi (30 Tết)', kind: 'le_tet', isConfirmed: false },
  { date: '2027-02-08', name: 'Tết Nguyên đán Đinh Mùi (Mùng 3)', kind: 'le_tet', isConfirmed: false },
  { date: '2027-02-09', name: 'Tết Nguyên đán Đinh Mùi (Mùng 4)', kind: 'le_tet', isConfirmed: false },
  { date: '2027-02-10', name: 'Nghỉ bù Tết Nguyên đán', kind: 'nghi_bu', isConfirmed: false },
  { date: '2027-04-16', name: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)', kind: 'le_tet', isConfirmed: false },
  { date: '2027-04-30', name: 'Ngày Chiến thắng 30/4', kind: 'le_tet', isConfirmed: true },
  { date: '2027-05-03', name: 'Nghỉ bù Quốc tế Lao động (01/5 rơi vào thứ Bảy)', kind: 'nghi_bu', isConfirmed: false },
  { date: '2027-09-02', name: 'Quốc khánh', kind: 'le_tet', isConfirmed: true },
  { date: '2027-09-03', name: 'Nghỉ liền kề Quốc khánh', kind: 'le_tet', isConfirmed: false },
];
