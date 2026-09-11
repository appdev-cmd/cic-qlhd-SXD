import { Injectable } from '@nestjs/common';

@Injectable()
export class SlaService {
  private readonly holidays2026_2027: string[] = [
    '2026-01-01', // Tết Dương lịch
    '2026-02-16', // Tết Âm lịch...
    // Cần điền đầy đủ danh sách ngày lễ VN
  ];

  isWorkingDay(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // Cuối tuần

    const dateString = date.toISOString().split('T')[0];
    if (this.holidays2026_2027.includes(dateString)) return false;

    return true;
  }

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
}
