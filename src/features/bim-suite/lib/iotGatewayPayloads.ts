// Gateway payloads for iot-ingest, shared by the gateway simulator (scripts/iot-gateway-simulator.ts) and the tests:
// replay of a slot series with resends (de-duplication), late samples, boot_id changes, bad quality and connection
// drops; synthetic series from a gateway config file; registration SQL for that config. No network access here.
// Ported from cic-hud lib/iotGatewayPayloads.ts; the HUD demo dataset is replaced by a project gateway config.
import type { IotAlarmOperator, IotPoint } from './iotTypes';

export interface GatewaySample {
  event_id: string;
  device_id: string;
  point_id: string;
  boot_id: string;
  sequence: number;
  observed_at: string;
  value: number | boolean | null;
  raw_value?: number | null;
  quality: 'good' | 'uncertain' | 'bad';
  unit: string;
}
export interface GatewayBatch {
  gateway: string;
  label: string;
  samples: GatewaySample[];
  /** Same batch sent again: the server must answer all duplicate. */
  resend?: boolean;
  /** Batch holding deliberately late samples: stored in history, latest does not go back. */
  late?: boolean;
}
export interface ReplaySeries {
  values: (number | boolean | null)[];
  /** Slots whose sample is sent with quality "bad" (value null, raw_value -999). */
  bad_slots: number[];
}
/** Time series on a fixed slot grid, per point, grouped by device and gateway code. */
export interface ReplaySource {
  project_id: string;
  start_inclusive: string;
  sample_interval_seconds: number;
  slots: number;
  devices: { device_id: string; gateway: string; boot_id?: string }[];
  points: Pick<IotPoint, 'point_id' | 'device_id' | 'unit' | 'value_type'>[];
  series: Record<string, ReplaySeries>;
}
export interface ReplayOptions {
  fromSlot: number;
  toSlot: number;
  batchSlots?: number;
  duplicateEvery?: number;
  lateEvery?: number;
  lateDevice?: string;
  reboots?: { device: string; atSlot: number }[];
  drops?: { device: string; fromSlot: number; toSlot: number }[];
  /** Shift observation times (multiples of 7 days keep weekdays); each shift is a new boot. */
  shiftMs?: number;
}

const BAD_RAW_VALUE = -999;

/** Deterministic UUID (cyrb128 hash): same point/boot/sequence → same event_id, so resends stay de-duplicated. */
export function stableUuid(text: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((h) => (h >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function deviceGateways(data: Pick<ReplaySource, 'devices'>): Map<string, string> {
  return new Map(data.devices.map((d) => [d.device_id, d.gateway]));
}
export const slotTime = (data: Pick<ReplaySource, 'start_inclusive' | 'sample_interval_seconds'>, slot: number) =>
  Date.parse(data.start_inclusive) + slot * data.sample_interval_seconds * 1000;
export const slotOf = (
  data: Pick<ReplaySource, 'start_inclusive' | 'sample_interval_seconds' | 'slots'>,
  at: string | number,
) =>
  Math.max(
    0,
    Math.min(
      data.slots,
      Math.floor(
        ((typeof at === 'number' ? at : Date.parse(at)) - Date.parse(data.start_inclusive)) /
          (data.sample_interval_seconds * 1000),
      ),
    ),
  );

function bootFor(data: ReplaySource, device: string, slot: number, reboots: ReplayOptions['reboots'], shiftMs = 0) {
  const reboot = (reboots ?? [])
    .filter((r) => r.device === device && r.atSlot <= slot)
    .sort((a, b) => b.atSlot - a.atSlot)[0];
  const original = data.devices.find((d) => d.device_id === device)?.boot_id;
  const shift = shiftMs ? `|shift${shiftMs}` : '';
  const scope = data.project_id;
  return reboot
    ? { boot: stableUuid(`${scope}|boot|${device}|${reboot.atSlot}${shift}`), sequence: slot - reboot.atSlot }
    : {
        boot: shift
          ? stableUuid(`${scope}|boot|${device}${shift}`)
          : (original ?? stableUuid(`${scope}|boot|${device}`)),
        sequence: slot,
      };
}

/** One sample of a point at a slot; null = device did not send (connection drop), never replaced by 0. */
export function sampleAt(
  data: ReplaySource,
  point: ReplaySource['points'][number],
  slot: number,
  options: Pick<ReplayOptions, 'reboots' | 'drops' | 'shiftMs'> = {},
): GatewaySample | null {
  const series = data.series[point.point_id];
  if (!series || slot < 0 || slot >= data.slots) return null;
  if ((options.drops ?? []).some((d) => d.device === point.device_id && slot >= d.fromSlot && slot <= d.toSlot))
    return null;
  const value = series.values[slot];
  const bad = series.bad_slots.includes(slot);
  if ((value === null || value === undefined) && !bad) return null;
  const { boot, sequence } = bootFor(data, point.device_id, slot, options.reboots, options.shiftMs);
  return {
    event_id: stableUuid(`${data.project_id}|${point.point_id}|${boot}|${sequence}`),
    device_id: point.device_id,
    point_id: point.point_id,
    boot_id: boot,
    sequence,
    observed_at: new Date(slotTime(data, slot) + (options.shiftMs ?? 0)).toISOString(),
    value: bad ? null : point.value_type === 'boolean' ? Boolean(value) : (value as number),
    ...(bad ? { raw_value: BAD_RAW_VALUE } : {}),
    quality: bad ? 'bad' : 'good',
    unit: point.unit,
  };
}

/** Batches per gateway and slot range, plus resent and late batches on request. */
export function buildReplayBatches(data: ReplaySource, options: ReplayOptions): GatewayBatch[] {
  const per = Math.max(1, options.batchSlots ?? 6);
  const gateways = deviceGateways(data);
  const lateDevice = options.lateDevice ?? data.devices[data.devices.length - 1]?.device_id;
  const codes = [...new Set(gateways.values())].sort();
  const batches: GatewayBatch[] = [];
  let index = 0;
  for (let from = options.fromSlot; from < options.toSlot; from += per) {
    const to = Math.min(options.toSlot, from + per);
    for (const code of codes) {
      const samples: GatewaySample[] = [];
      for (let slot = from; slot < to; slot++)
        for (const point of data.points)
          if (gateways.get(point.device_id) === code) {
            const sample = sampleAt(data, point, slot, options);
            if (sample) samples.push(sample);
          }
      if (!samples.length) continue;
      index++;
      const shift = options.shiftMs ?? 0;
      const firstAt = new Date(slotTime(data, from) + shift).toISOString();
      const label = `${code} ${firstAt} → ${new Date(slotTime(data, to) + shift).toISOString()}`;
      const lateHere = !!options.lateEvery && index % options.lateEvery === 0 && to - from > 1 && !!lateDevice;
      const held = lateHere ? samples.filter((s) => s.device_id === lateDevice && s.observed_at === firstAt) : [];
      const sent = held.length ? samples.filter((s) => !held.includes(s)) : samples;
      batches.push({ gateway: code, label, samples: sent });
      if (held.length) batches.push({ gateway: code, label: `${label} (mẫu đến muộn)`, samples: held, late: true });
      if (options.duplicateEvery && index % options.duplicateEvery === 0)
        batches.push({ gateway: code, label: `${label} (gửi lại)`, samples: sent, resend: true });
    }
  }
  return batches;
}

// ---- Project gateway config (simulator input) ------------------------------------------------------------

/** Gateway config file read by the simulator; ids are the codes the gateway sends, asset_id is a bim_assets uuid. */
export interface GatewayConfig {
  project_id: string;
  gateways: { code: string; name: string; protocol?: string | null; clock_mode?: 'wall' | 'source' }[];
  devices: {
    device_id: string;
    gateway: string;
    asset_id: string;
    code: string;
    category?: string | null;
    sample_interval_seconds?: number;
    stale_after_seconds?: number;
  }[];
  points: {
    point_id: string;
    device_id: string;
    name: string;
    unit: string;
    metric?: string;
    value_type?: 'number' | 'boolean';
    valid_min?: number | null;
    valid_max?: number | null;
    stale_after_seconds?: number;
    /** Synthetic signal: base + amplitude · sin(2π t / period_hours) (booleans: on during office hours). */
    base?: number;
    amplitude?: number;
    period_hours?: number;
  }[];
  rules?: {
    rule_id: string;
    point_id: string;
    name: string;
    operator: IotAlarmOperator;
    threshold?: number | null;
    clear_threshold?: number | null;
    hold_seconds?: number;
    clear_hold_seconds?: number;
    severity?: string;
    schedule?: { tz: string; days: number[]; start: string; end: string } | null;
    auto_work_order?: boolean;
  }[];
  /** Synthetic incidents: the point holds `value` from `from` to `to` (ISO). */
  excursions?: { point_id: string; from: string; to: string; value: number | boolean }[];
}

/** Synthetic slot series for a config (no hardware): smooth signal per point plus configured excursions. */
export function syntheticSource(
  config: GatewayConfig,
  options: { start: string; slots: number; intervalSeconds?: number },
): ReplaySource {
  const interval = options.intervalSeconds ?? 300;
  const start = Date.parse(options.start);
  const series: Record<string, ReplaySeries> = {};
  config.points.forEach((p, index) => {
    const values: (number | boolean | null)[] = [];
    const period = Math.max(1, p.period_hours ?? 24) * 3600_000;
    for (let slot = 0; slot < options.slots; slot++) {
      const at = start + slot * interval * 1000;
      const excursion = config.excursions?.find(
        (e) => e.point_id === p.point_id && at >= Date.parse(e.from) && at < Date.parse(e.to),
      );
      if (excursion) values.push(excursion.value);
      else if (p.value_type === 'boolean') {
        const hour = new Date(at + 7 * 3600_000).getUTCHours();
        values.push(hour >= 8 && hour < 18);
      } else {
        const v = (p.base ?? 0) + (p.amplitude ?? 0) * Math.sin((2 * Math.PI * at) / period + index);
        values.push(Number(v.toFixed(2)));
      }
    }
    series[p.point_id] = { values, bad_slots: [] };
  });
  return {
    project_id: config.project_id,
    start_inclusive: new Date(start).toISOString(),
    sample_interval_seconds: interval,
    slots: options.slots,
    devices: config.devices.map((d) => ({ device_id: d.device_id, gateway: d.gateway })),
    points: config.points.map((p) => ({
      point_id: p.point_id,
      device_id: p.device_id,
      unit: p.unit,
      value_type: p.value_type ?? 'number',
    })),
    series,
  };
}

const sql = (value: unknown): string =>
  value === null || value === undefined
    ? 'null'
    : typeof value === 'number'
      ? Number.isFinite(value)
        ? String(value)
        : 'null'
      : typeof value === 'boolean'
        ? String(value)
        : `'${String(value).replace(/'/g, "''")}'`;
const jsonb = (value: unknown) =>
  value === null || value === undefined ? 'null' : `${sql(JSON.stringify(value))}::jsonb`;

/**
 * SQL registering a project's gateways, devices, points and rules from a config (run by a database admin in the
 * SQL editor). Points take their BIM anchor from bim_assets (model_id, bim_element_id = IFC GlobalId), so each
 * device's asset must be linked to a model element first. iot_register_gateway returns each
 * gateway key once; the SQL itself contains no key.
 */
export function buildRegistrationSql(
  config: GatewayConfig,
  options: { workOrderActor?: string | null; finish?: 'commit' | 'rollback' } = {},
): string {
  const p = `${sql(config.project_id)}::uuid`;
  const actor = options.workOrderActor ?? null;
  const lines = [
    `-- Sinh bởi scripts/iot-gateway-simulator.ts --mode sql. Dự án ${config.project_id}.`,
    'begin;',
    `create temp table iot_sim_gateways on commit drop as select public.iot_register_gateway(${p}, v.code, v.name, v.protocol, v.clock_mode) as r`,
    `  from (values ${config.gateways
      .map((g) => `(${sql(g.code)}, ${sql(g.name)}, ${sql(g.protocol ?? null)}, ${sql(g.clock_mode ?? 'wall')})`)
      .join(', ')}) as v(code, name, protocol, clock_mode);`,
    `insert into public.iot_devices(project_id, id, gateway_id, asset_id, code, category, sample_interval_seconds, stale_after_seconds)`,
    `  select ${p}, v.id, g.id, v.asset_id::uuid, v.code, v.category, v.interval_s, v.stale_s from (values`,
    config.devices
      .map(
        (d) =>
          `    (${sql(d.device_id)}, ${sql(d.gateway)}, ${sql(d.asset_id)}, ${sql(d.code)}, ${sql(d.category ?? null)}, ${d.sample_interval_seconds ?? 300}, ${d.stale_after_seconds ?? 900})`,
      )
      .join(',\n'),
    `  ) as v(id, gateway_code, asset_id, code, category, interval_s, stale_s)`,
    `  join public.iot_gateways g on g.project_id = ${p} and g.code = v.gateway_code`,
    `  on conflict (project_id, id) do update set gateway_id = excluded.gateway_id, asset_id = excluded.asset_id,`,
    `    code = excluded.code, category = excluded.category, sample_interval_seconds = excluded.sample_interval_seconds,`,
    `    stale_after_seconds = excluded.stale_after_seconds;`,
    `insert into public.bim_iot_points(project_id, id, asset_id, model_id, global_id, name, unit, device_id, metric, value_type,`,
    `  valid_min, valid_max, stale_after_seconds, config_approved_at)`,
    `  select ${p}, v.id, d.asset_id, a.model_id, a.bim_element_id, v.name, v.unit, v.device_id, v.metric, v.value_type,`,
    `    v.valid_min, v.valid_max, v.stale_s, now() from (values`,
    config.points
      .map(
        (pt) =>
          `    (${sql(pt.point_id)}, ${sql(pt.device_id)}, ${sql(pt.name)}, ${sql(pt.unit)}, ${sql(pt.metric ?? pt.point_id)}, ${sql(pt.value_type ?? 'number')}, ${sql(pt.valid_min ?? null)}::double precision, ${sql(pt.valid_max ?? null)}::double precision, ${sql(pt.stale_after_seconds ?? null)}::integer)`,
      )
      .join(',\n'),
    `  ) as v(id, device_id, name, unit, metric, value_type, valid_min, valid_max, stale_s)`,
    `  join public.iot_devices d on d.project_id = ${p} and d.id = v.device_id`,
    `  join public.bim_assets a on a.project_id = d.project_id and a.asset_id = d.asset_id`,
    `  on conflict (project_id, id) do update set asset_id = excluded.asset_id, model_id = excluded.model_id,`,
    `    global_id = excluded.global_id, name = excluded.name, unit = excluded.unit, device_id = excluded.device_id,`,
    `    metric = excluded.metric, value_type = excluded.value_type, valid_min = excluded.valid_min,`,
    `    valid_max = excluded.valid_max, stale_after_seconds = excluded.stale_after_seconds, config_approved_at = now();`,
  ];
  const rules = config.rules ?? [];
  if (rules.length) {
    const deviceOf = new Map(config.points.map((pt) => [pt.point_id, pt.device_id]));
    lines.push(
      `insert into public.iot_alarm_rules(project_id, id, name, point_id, device_id, operator, threshold, clear_threshold,`,
      `  hold_seconds, clear_hold_seconds, severity, schedule, auto_work_order, work_order_actor) values`,
      rules
        .map((r) => {
          const auto = !!r.auto_work_order && !!actor;
          return `  (${p}, ${sql(r.rule_id)}, ${sql(r.name)}, ${sql(r.point_id)}, ${sql(deviceOf.get(r.point_id) ?? null)}, ${sql(r.operator)}, ${sql(r.threshold ?? null)}, ${sql(r.clear_threshold ?? null)}, ${r.hold_seconds ?? 0}, ${r.clear_hold_seconds ?? 0}, ${sql(r.severity ?? 'warning')}, ${jsonb(r.schedule ?? null)}, ${auto}, ${auto ? `${sql(actor)}::uuid` : 'null'})`;
        })
        .join(',\n'),
      `  on conflict (project_id, id) do update set name = excluded.name, point_id = excluded.point_id,`,
      `    device_id = excluded.device_id, operator = excluded.operator, threshold = excluded.threshold,`,
      `    clear_threshold = excluded.clear_threshold, hold_seconds = excluded.hold_seconds,`,
      `    clear_hold_seconds = excluded.clear_hold_seconds, severity = excluded.severity, schedule = excluded.schedule,`,
      `    auto_work_order = excluded.auto_work_order, work_order_actor = excluded.work_order_actor;`,
    );
  }
  lines.push(
    `-- Khóa gateway chỉ hiển thị ở đây một lần; lưu vào tệp cục bộ không commit (tmp/iot-gateways.local.json).`,
    `select jsonb_agg(r order by r->>'code') as gateways from iot_sim_gateways;`,
    `${options.finish ?? 'commit'};`,
  );
  return lines.join('\n') + '\n';
}
