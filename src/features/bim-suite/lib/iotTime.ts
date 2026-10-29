// Operating time zone via Intl by zone name (no hard-coded +7 h), shared by IoT views and exports. Ported from cic-hud.
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const partFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let format = partFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partFormatters.set(timeZone, format);
  }
  return format;
}
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Chủ nhật … 6 = Thứ Bảy */
  weekday: number;
}
export function zonedParts(at: number, timeZone = VN_TIME_ZONE): ZonedParts {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}
/** Độ lệch của múi giờ so với UTC tại thời điểm at (ms). */
export function zonedOffsetMs(at: number, timeZone = VN_TIME_ZONE): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}
/** 00:00 theo múi giờ của ngày chứa at. */
export function startOfZonedDay(at: number, timeZone = VN_TIME_ZONE): number {
  const p = zonedParts(at, timeZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day);
  return guess - zonedOffsetMs(guess, timeZone);
}
/** Mốc trục thời gian tròn giờ theo múi giờ (mỗi stepHours), trong [from, to]. */
export function zonedTicks(from: number, to: number, stepHours: number, timeZone = VN_TIME_ZONE): number[] {
  const step = stepHours * 3600000;
  const offset = zonedOffsetMs(from, timeZone);
  const ticks: number[] = [];
  for (let at = Math.ceil((from + offset) / step) * step - offset; at <= to; at += step) ticks.push(at);
  return ticks;
}
/** ISO 8601 kèm độ lệch múi giờ, ví dụ 2026-10-18T08:00:00+07:00, để tệp xuất không mơ hồ về giờ. */
export function zonedIso(at: number, timeZone = VN_TIME_ZONE): string {
  const p = zonedParts(at, timeZone);
  const offset = Math.round(zonedOffsetMs(at, timeZone) / 60000);
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}
export function withinOfficeHours(
  schedule: { start_hour: number; end_hour: number; weekdays: number[] },
  at: number,
  timeZone = VN_TIME_ZONE,
): boolean {
  const p = zonedParts(at, timeZone);
  return schedule.weekdays.includes(p.weekday) && p.hour >= schedule.start_hour && p.hour < schedule.end_hour;
}
