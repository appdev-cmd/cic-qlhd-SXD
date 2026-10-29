// IoT source of a project as one status shared by Operations, Analysis and the AI panel. BuildSIA has a single source
// per project (registered gateways → iot-ingest); cic-hud's choice between a local demo and gateway datasets is gone,
// so this only summarises the gateways and never falls back to sample data.
import type { IotGatewayInfo } from '../services/BimIotService';

export type IotSourceState = 'none' | 'disabled' | 'waiting' | 'receiving' | 'silent';
export interface IotSourceStatus {
  state: IotSourceState;
  label: string;
  /** Gateways with status active / all registered. */
  active: number;
  total: number;
  lastSeenAt: string | null;
}
/** A gateway that sent nothing for this long is shown as silent (sample periods are minutes). */
export const IOT_SOURCE_SILENT_MS = 60 * 60_000;

export function iotSourceStatus(
  gateways: Pick<IotGatewayInfo, 'status' | 'last_seen_at'>[],
  now: number,
  silentMs = IOT_SOURCE_SILENT_MS,
): IotSourceStatus {
  const active = gateways.filter((g) => g.status === 'active');
  const lastSeenAt = gateways.reduce<string | null>(
    (latest, g) => (g.last_seen_at && (!latest || g.last_seen_at > latest) ? g.last_seen_at : latest),
    null,
  );
  const base = { active: active.length, total: gateways.length, lastSeenAt };
  if (!gateways.length) return { ...base, state: 'none', label: 'Chưa đăng ký gateway' };
  if (!active.length) return { ...base, state: 'disabled', label: 'Gateway đã bị khóa' };
  if (!lastSeenAt) return { ...base, state: 'waiting', label: 'Chờ lô dữ liệu đầu tiên' };
  return now - Date.parse(lastSeenAt) > silentMs
    ? { ...base, state: 'silent', label: 'Gateway ngừng gửi' }
    : { ...base, state: 'receiving', label: 'Đang nhận dữ liệu' };
}
