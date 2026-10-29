// Build the live-dashboard catalog of one project from the gateway tables: points configured with a device,
// devices, assets (bim_assets) and enabled alarm rules. Points without a device are left out (they cannot receive
// readings yet) and counted. Ported from cic-hud without the dataset/data_kind scope and the HUD catalog adoption.
import type { IotAlarmOperator, IotAsset, IotCatalog, IotPoint, IotRule } from './iotTypes';

export interface GatewayCatalogRows {
  project_id: string;
  points: {
    id: string;
    asset_id: string;
    model_id: string | null;
    global_id: string | null;
    name: string;
    unit: string;
    device_id: string | null;
    metric: string | null;
    value_type: 'number' | 'boolean' | null;
    stale_after_seconds: number | null;
  }[];
  devices: { id: string; asset_id: string; code: string; category: string | null; stale_after_seconds: number }[];
  assets: {
    asset_id: string;
    asset_name: string | null;
    category: string | null;
    location: string | null;
    status?: string | null;
    next_maintenance?: string | null;
  }[];
  rules: {
    id: string;
    point_id: string;
    device_id: string | null;
    name: string;
    operator: IotAlarmOperator;
    threshold: number | null;
    clear_threshold: number | null;
    hold_seconds: number;
    clear_hold_seconds: number;
    severity: string;
    schedule: { tz?: string; days?: number[]; start?: string; end?: string } | null;
    enabled?: boolean;
  }[];
}

const towerOf = (location: string) =>
  location
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .match(/\bthap\s+([a-z0-9]+)/i)?.[1]
    ?.toUpperCase() ?? '';

export function buildGatewayCatalog(rows: GatewayCatalogRows): IotCatalog & { unconfigured_points: number } {
  const devices = new Map(rows.devices.map((d) => [d.id, d]));
  const facility = new Map(rows.assets.map((a) => [a.asset_id, a]));
  const configured = rows.points.filter((p) => p.device_id && devices.has(p.device_id));
  const points: IotPoint[] = configured.map((p) => ({
    point_id: p.id,
    asset_id: p.asset_id,
    device_id: p.device_id!,
    metric: p.metric ?? p.id,
    name: p.name,
    unit: p.unit,
    value_type: p.value_type === 'boolean' ? 'boolean' : 'number',
    stale_after_seconds: p.stale_after_seconds ?? devices.get(p.device_id!)?.stale_after_seconds ?? 900,
  }));
  const assets = new Map<string, IotAsset>();
  for (const p of configured) {
    if (assets.has(p.asset_id)) continue;
    const device = devices.get(p.device_id!);
    const row = facility.get(p.asset_id);
    const location = row?.location ?? '';
    assets.set(p.asset_id, {
      asset_id: p.asset_id,
      asset_name: row?.asset_name ?? device?.code ?? p.asset_id,
      category: device?.category ?? row?.category ?? 'OTHER',
      location,
      model_id: p.model_id ?? '',
      global_id: p.global_id ?? '',
      express_id: 0,
      tower: towerOf(location),
      status: row?.status ?? undefined,
      next_maintenance: row?.next_maintenance ?? null,
    });
  }
  const pointIds = new Set(points.map((p) => p.point_id));
  const alarmRules: IotRule[] = rows.rules
    .filter((r) => r.enabled !== false && pointIds.has(r.point_id))
    .map((r) => ({
      rule_id: r.id,
      point_id: r.point_id,
      device_id: r.device_id ?? points.find((p) => p.point_id === r.point_id)!.device_id,
      name: r.name,
      operator: r.operator,
      threshold: r.threshold,
      clear_threshold: r.clear_threshold,
      hold_seconds: r.hold_seconds,
      clear_hold_seconds: r.clear_hold_seconds,
      severity: r.severity,
    }));
  const schedule = rows.rules.find((r) => r.operator === 'offhours_gt' && r.schedule)?.schedule;
  const hour = (text: string | undefined, fallback: number) => (text ? Number(text.slice(0, 2)) : fallback);
  return {
    project_id: rows.project_id,
    assets: [...assets.values()],
    points,
    devices: [...devices.values()]
      .filter((d) => points.some((p) => p.device_id === d.id))
      .map((d) => ({ device_id: d.id, asset_id: d.asset_id, code: d.code })),
    alarm_rules: alarmRules,
    office_schedule: {
      start_hour: hour(schedule?.start, 8),
      end_hour: hour(schedule?.end, 18),
      weekdays: schedule?.days ?? [1, 2, 3, 4, 5],
    },
    unconfigured_points: rows.points.length - configured.length,
  };
}
