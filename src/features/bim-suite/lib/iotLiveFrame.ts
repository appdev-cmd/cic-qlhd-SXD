// Live measurement frame (iot_latest snapshot + Realtime Broadcast on iot:<project>) and point state helpers.
// A new frame object is created only when a reading really changes, so React and the 3D layer skip idle redraws.
// Ported from cic-hud lib/iotLiveFrame.ts + the non-demo parts of lib/iotLiveDemo.ts.
import { isOfficeHour, type IotCatalog, type IotPoint, type IotValue } from './iotTypes';

export const LIVE_HISTORY_LIMIT = 150;
export interface LiveReading {
  value: IotValue;
  observedAt: number;
  quality: 'good' | 'bad';
}
export interface LiveFrame {
  sequence: number;
  receivedAt: number;
  readings: Record<string, LiveReading>;
}
export type LivePointState = 'normal' | 'exceeded' | 'stale' | 'bad';
export type IotConnection = 'connecting' | 'live' | 'reconnecting' | 'error';
export interface IotLiveState {
  now: number;
  frame: LiveFrame;
  history: LiveFrame[];
  connection: IotConnection;
  error: string | null;
}
export interface LatestSnapshotRow {
  point_id: string;
  observed_at: string;
  value: number | null;
  quality: 'good' | 'uncertain' | 'bad';
}

const sameReading = (a: LiveReading | undefined, b: LiveReading) =>
  !!a && a.observedAt === b.observedAt && a.value === b.value && a.quality === b.quality;

/**
 * Merge new readings into the frame. Returns the same frame when nothing changed; readings older than the one held
 * are ignored (latest never goes back). replace = true: full iot_latest snapshot on (re)connect.
 */
export function mergeReadings(
  frame: LiveFrame,
  updates: Record<string, LiveReading>,
  receivedAt: number,
  replace = false,
): LiveFrame {
  let changed = false;
  const readings: Record<string, LiveReading> = replace ? {} : { ...frame.readings };
  for (const [pointId, reading] of Object.entries(updates)) {
    const current = frame.readings[pointId];
    if (!replace && current && reading.observedAt < current.observedAt) continue;
    if (!sameReading(current, reading)) changed = true;
    readings[pointId] = sameReading(current, reading) ? current! : reading;
  }
  if (replace) {
    for (const pointId of Object.keys(frame.readings)) if (!(pointId in updates)) changed = true;
  }
  if (!changed) return frame;
  return { sequence: frame.sequence + 1, receivedAt, readings };
}

export function readingsFromLatest(rows: LatestSnapshotRow[]): Record<string, LiveReading> {
  const readings: Record<string, LiveReading> = {};
  for (const row of rows) {
    const observedAt = Date.parse(row.observed_at);
    if (!Number.isFinite(observedAt)) continue;
    readings[row.point_id] = {
      value: row.quality === 'bad' ? null : (row.value as IotValue),
      observedAt,
      quality: row.quality === 'bad' ? 'bad' : 'good',
    };
  }
  return readings;
}

/** iot-ingest Broadcast packet: { v: 1, at, r: [[point_id, observed_ms, value, quality]], alerts }. */
export function readingsFromBroadcast(
  payload: unknown,
): { readings: Record<string, LiveReading>; alerts: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { v?: unknown; r?: unknown; alerts?: unknown };
  if (p.v !== 1 || !Array.isArray(p.r)) return null;
  const readings: Record<string, LiveReading> = {};
  for (const item of p.r) {
    if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'number') continue;
    const quality = item[3] === 'bad' ? 'bad' : 'good';
    const value = typeof item[2] === 'number' && quality !== 'bad' ? item[2] : null;
    readings[item[0]] = { value, observedAt: item[1], quality };
  }
  return { readings, alerts: typeof p.alerts === 'number' ? p.alerts : 0 };
}

export function appendHistory(history: LiveFrame[], frame: LiveFrame, limit: number): LiveFrame[] {
  if (history[history.length - 1] === frame) return history;
  return [...history.slice(-(limit - 1)), frame];
}

/** Earliest time (after now) a point becomes stale; null when no point is about to expire. */
export function nextStaleDeadline(
  frame: LiveFrame,
  points: Pick<IotPoint, 'point_id' | 'stale_after_seconds'>[],
  staleMsFor: (point: Pick<IotPoint, 'point_id' | 'stale_after_seconds'>) => number,
  now: number,
): number | null {
  let next: number | null = null;
  for (const point of points) {
    const reading = frame.readings[point.point_id];
    if (!reading) continue;
    const deadline = reading.observedAt + staleMsFor(point) + 1;
    if (deadline > now && (next === null || deadline < next)) next = deadline;
  }
  return next;
}

/** Point state: no reading or too old → stale (never shown as 0). */
export function livePointState(
  data: Pick<IotCatalog, 'alarm_rules' | 'office_schedule'>,
  point: IotPoint,
  reading: LiveReading | undefined,
  now: number,
  staleMs: number,
): LivePointState {
  if (!reading || now - reading.observedAt > staleMs) return 'stale';
  if (reading.quality === 'bad' || reading.value === null) return 'bad';
  const value = Number(reading.value);
  const exceeded = data.alarm_rules.some((rule) => {
    if (rule.point_id !== point.point_id || rule.threshold === null) return false;
    if (rule.operator === 'offhours_gt') return !isOfficeHour(data, now) && value > rule.threshold;
    return rule.operator === 'gt' ? value > rule.threshold : rule.operator === 'lt' ? value < rule.threshold : false;
  });
  return exceeded ? 'exceeded' : 'normal';
}

export const LIVE_STATE_LABELS: Record<LivePointState, string> = {
  normal: 'Trong ngưỡng / theo dõi',
  exceeded: 'Vượt ngưỡng',
  stale: 'Mất cập nhật',
  bad: 'Lỗi chất lượng',
};
const liveClockFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
export const liveClock = (at: number) => liveClockFormat.format(at);
export const normalizeLiveSearch = (s: string) =>
  s.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** Chart rows for one point from the frame history: gaps (stale/bad/missing) become nulls so the line breaks. */
export function pointTrend(
  history: LiveFrame[],
  pointId: string,
  staleMs: number,
  now: number,
  sourceStale: boolean,
): { at: number; value: number | null }[] {
  const rows: { at: number; value: number | null }[] = [];
  history.forEach((frame, index) => {
    if (index > 0 && frame.receivedAt - history[index - 1].receivedAt > staleMs)
      rows.push({ at: history[index - 1].receivedAt + 1, value: null });
    const sample = frame.readings[pointId];
    rows.push({
      at: sample ? sample.observedAt : frame.receivedAt,
      value:
        !sample || sample.quality === 'bad' || sample.value === null || frame.receivedAt - sample.observedAt > staleMs
          ? null
          : Number(sample.value),
    });
  });
  if (sourceStale) rows.push({ at: now, value: null });
  return rows;
}
