// Point history from the database: resolution by range (raw ≤ 6 h, 5-minute ≤ 48 h, hourly beyond), gaps kept as
// nulls (never joined as 0), CSV export with time zone. Ported from cic-hud.
import { zonedIso } from './iotTime';

export type HistoryResolution = 'raw' | '5min' | 'hourly';
export interface HistoryRow {
  at: number;
  value: number | null;
  min?: number | null;
  max?: number | null;
  bad: boolean;
  samples?: number;
}
export interface RawHistoryRow {
  observed_at: string;
  value: number | null;
  quality: string;
}
export interface RollupHistoryRow {
  bucket: string;
  samples: number;
  bad_samples: number;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  last_value: number | null;
}

export function historyResolution(rangeHours: number): HistoryResolution {
  return rangeHours <= 6 ? 'raw' : rangeHours <= 48 ? '5min' : 'hourly';
}
export const RESOLUTION_STEP_MS: Record<HistoryResolution, number> = {
  raw: 300_000,
  '5min': 300_000,
  hourly: 3_600_000,
};

/** Hàng biểu đồ theo thời gian; khoảng cách lớn hơn 2 bước được đánh dấu bằng một điểm null để tách đường. */
export function toHistoryRows(
  resolution: HistoryResolution,
  raw: RawHistoryRow[] | RollupHistoryRow[],
  stepMs = RESOLUTION_STEP_MS[resolution],
  booleanPoint = false,
): HistoryRow[] {
  const rows: HistoryRow[] =
    resolution === 'raw'
      ? (raw as RawHistoryRow[]).map((r) => ({
          at: Date.parse(r.observed_at),
          value: r.quality === 'bad' || r.value === null ? null : Number(r.value),
          bad: r.quality === 'bad',
        }))
      : (raw as RollupHistoryRow[]).map((r) => ({
          at: Date.parse(r.bucket),
          // Trạng thái bật/tắt: lấy trạng thái cuối của bucket, không lấy trung bình.
          value: booleanPoint ? r.last_value : r.avg_value,
          min: r.min_value,
          max: r.max_value,
          bad: r.samples > 0 && r.bad_samples === r.samples,
          samples: r.samples,
        }));
  rows.sort((a, b) => a.at - b.at);
  const out: HistoryRow[] = [];
  for (const row of rows) {
    const previous = out[out.length - 1];
    if (previous && row.at - previous.at > stepMs * 2) out.push({ at: previous.at + stepMs, value: null, bad: false });
    out.push(row);
  }
  return out;
}

export function historyCsv(
  rows: HistoryRow[],
  meta: { point_id: string; unit: string; resolution: HistoryResolution },
): string {
  const header = 'thoi_diem_gio_vn,thoi_diem_utc,point_id,gia_tri,min,max,don_vi,chat_luong,do_phan_giai';
  const lines = rows.map((r) =>
    [
      zonedIso(r.at),
      new Date(r.at).toISOString(),
      meta.point_id,
      r.value ?? '',
      r.min ?? '',
      r.max ?? '',
      meta.unit,
      r.bad ? 'bad' : r.value === null ? 'missing' : 'good',
      meta.resolution,
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
