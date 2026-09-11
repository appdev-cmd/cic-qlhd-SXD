import { Injectable } from '@nestjs/common';

@Injectable()
export class SlaService {
  /**
   * Danh sách ngày lễ, Tết theo Bộ luật Lao động Việt Nam
   * Bao gồm ngày nghỉ bù (nếu trùng Chủ nhật thì nghỉ bù Thứ 2)
   */
  private readonly holidays2026_2027: string[] = [
    // === NĂM 2026 ===
    '2026-01-01',             // Tết Dương lịch
    '2026-02-15',             // Tết Nguyên đán (28 Tết - nghỉ)
    '2026-02-16',             // Tết Nguyên đán (29 Tết)
    '2026-02-17',             // Tết Nguyên đán (30 Tết - Mùng 1)
    '2026-02-18',             // Tết Nguyên đán (Mùng 2)
    '2026-02-19',             // Tết Nguyên đán (Mùng 3)
    '2026-02-20',             // Nghỉ bù Tết
    '2026-02-21',             // Nghỉ bù Tết
    '2026-04-06',             // Giỗ Tổ Hùng Vương (10/3 ÂL)
    '2026-04-30',             // Ngày Giải phóng miền Nam
    '2026-05-01',             // Ngày Quốc tế Lao động
    '2026-05-04',             // Nghỉ bù (1/5 rơi vào T6)
    '2026-09-02',             // Quốc khánh
    '2026-09-03',             // Nghỉ bù Quốc khánh

    // === NĂM 2027 ===
    '2027-01-01',             // Tết Dương lịch
    '2027-02-05',             // Tết Nguyên đán (28 Tết)
    '2027-02-06',             // Tết Nguyên đán (29 Tết - Mùng 1)
    '2027-02-07',             // Tết Nguyên đán (Mùng 2)
    '2027-02-08',             // Tết Nguyên đán (Mùng 3)
    '2027-02-09',             // Nghỉ bù Tết
    '2027-02-10',             // Nghỉ bù Tết
    '2027-03-26',             // Giỗ Tổ Hùng Vương (10/3 ÂL)
    '2027-04-30',             // Ngày Giải phóng miền Nam
    '2027-05-01',             // Ngày Quốc tế Lao động
    '2027-05-03',             // Nghỉ bù
    '2027-09-02',             // Quốc khánh
    '2027-09-03',             // Nghỉ bù Quốc khánh
  ];

  /**
   * Kiểm tra ngày có phải ngày làm việc không
   * Loại trừ: Thứ 7, Chủ nhật, ngày lễ
   */
  isWorkingDay(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // Cuối tuần

    const dateString = date.toISOString().split('T')[0];
    if (this.holidays2026_2027.includes(dateString)) return false;

    return true;
  }

  /**
   * Cộng N ngày làm việc từ ngày bắt đầu
   */
  addWorkingDays(startDate: Date, days: number): Date {
    let currentDate = new Date(startDate);
    let addedDays = 0;

    while (addedDays < days) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (this.isWorkingDay(currentDate)) {
        addedDays++;
      }
    }

    return currentDate;
  }

  /**
   * Đếm số ngày làm việc giữa 2 mốc thời gian
   */
  countWorkingDays(startDate: Date, endDate: Date): number {
    let count = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      if (this.isWorkingDay(currentDate)) {
        count++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return count;
  }

  /**
   * Tính thời hạn thẩm định (ngày làm việc) theo NĐ 217/2026
   * Phụ thuộc vào nhóm dự án và cấp công trình
   */
  getSlaWorkingDays(
    projectGroup: string,
    constructionGrade: string,
    dossierType: string,
  ): number {
    // GPXD: luôn 20 ngày LV
    if (dossierType === 'PERMIT_GPXD') {
      return 20;
    }

    const isHighGrade = ['SPECIAL', 'GRADE_I'].includes(constructionGrade);

    switch (projectGroup) {
      case 'NATIONAL':
      case 'GROUP_A':
        return isHighGrade ? 25 : 20;
      case 'GROUP_B':
        return isHighGrade ? 20 : 16;
      case 'GROUP_C':
        return isHighGrade ? 15 : 12;
      default:
        return 20; // Mặc định
    }
  }
}
