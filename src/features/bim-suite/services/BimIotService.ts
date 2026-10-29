// IoT operations data of one project (migration 20261027160000_bim_iot.sql): alerts, points, IoT work orders,
// registered gateways, the live catalog, latest readings and history; private Realtime channel iot:<project uuid>.
// Ported from cic-hud services/BimIotService.ts. Differences: no dataset/data_kind scope (one IoT namespace per
// project), assets from bim_assets, alert workflow (bim_iot_update_alert) and actor names here instead of
// FacilityOpsService, write access from useBimAccess() instead of BimWorkflowService.canWrite.
import { supabase } from '@/features/bim-suite/adapters/supabase';
import { legacyDb } from '../lib/bimDb';
import { readAllRows } from '../lib/readAllRows';
import { buildGatewayCatalog, type GatewayCatalogRows } from '../lib/iotGatewayCatalog';
import {
  historyResolution,
  toHistoryRows,
  type HistoryResolution,
  type HistoryRow,
  type RawHistoryRow,
  type RollupHistoryRow,
} from '../lib/iotHistory';
import type { LatestSnapshotRow } from '../lib/iotLiveFrame';
import type { GatewayTransport } from '../lib/iotLiveSession';
import type { IotWorkOrderStatus } from '../lib/iotTypes';

const db = legacyDb;

export type IotAlertStatus = 'open' | 'acknowledged' | 'suppressed' | 'closed';
/** Row of bim_iot_alerts. */
export interface SharedIotAlert {
  id: string;
  project_id: string;
  source_key: string;
  point_id: string;
  asset_id: string;
  rule_id: string;
  rule_version?: number | null;
  name: string;
  severity: string;
  condition_since: string;
  opened_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  /** Operator workflow (bim_iot_update_alert); signal recovery is resolved_at. */
  status?: IotAlertStatus;
  assignee_id?: string | null;
  notes?: string | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
/** Row of bim_iot_points (BIM anchor of a measurement point). */
export interface SharedIotPoint {
  id: string;
  project_id: string;
  asset_id: string;
  model_id: string | null;
  global_id: string | null;
  name: string;
  unit: string;
  device_id?: string | null;
}
/** Work order raised from an IoT alert (facility_work_orders with iot_source_alert_id). */
export interface IotWorkOrder {
  id: string;
  project_id: string;
  asset_id: string;
  title: string;
  status: IotWorkOrderStatus;
  due_date: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  iot_source_alert_id: string | null;
  created_at: string;
}
export interface SharedIotState {
  alerts: SharedIotAlert[];
  points: SharedIotPoint[];
  orders: IotWorkOrder[];
}
/** Row of iot_gateways readable by project members (never the key hash). */
export interface IotGatewayInfo {
  id: string;
  project_id: string;
  code: string;
  name: string;
  protocol: string | null;
  status: 'active' | 'disabled';
  clock_mode: 'wall' | 'source';
  last_seen_at: string | null;
}
export interface IotAlertEvent {
  id: number | string;
  alert_id: string;
  actor_id: string | null;
  action?: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
  created_at: string;
}
/** Minimal asset fields the IoT views show (bim_assets). */
export interface IotAssetRow {
  asset_id: string;
  asset_name: string | null;
  category: string | null;
  location: string | null;
  status?: string | null;
  next_maintenance?: string | null;
}

// One Realtime channel per project, shared by every listening session (no duplicate joins of the same topic).
type ChannelHandlers = Parameters<GatewayTransport['subscribe']>[0];
interface ProjectChannel {
  channel: ReturnType<typeof supabase.channel>;
  handlers: Set<ChannelHandlers>;
  status: string;
}
const projectChannels = new Map<string, ProjectChannel>();
export const iotTopic = (project: string) => `iot:${project}`;
function subscribeProject(project: string, handlers: ChannelHandlers): () => void {
  let entry = projectChannels.get(project);
  if (!entry) {
    const created: ProjectChannel = {
      channel: supabase.channel(iotTopic(project), { config: { private: true } }),
      handlers: new Set(),
      status: 'connecting',
    };
    created.channel
      .on('broadcast', { event: 'latest' }, (message: { payload?: unknown }) =>
        created.handlers.forEach((h) => h.onMessage(message.payload)),
      )
      .subscribe((status: string, error?: Error) => {
        created.status = status;
        created.handlers.forEach((h) => h.onStatus(status, error));
      });
    projectChannels.set(project, created);
    entry = created;
  }
  const current = entry;
  current.handlers.add(handlers);
  if (current.status === 'SUBSCRIBED') queueMicrotask(() => handlers.onStatus('SUBSCRIBED'));
  return () => {
    current.handlers.delete(handlers);
    if (current.handlers.size) return;
    projectChannels.delete(project);
    void supabase.removeChannel(current.channel);
  };
}

function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Cơ sở dữ liệu không trả về dữ liệu IoT.');
  return data as T;
}
const counted = (count: boolean) => (count ? { count: 'exact' as const } : undefined);

export const BimIotService = {
  async state(project: string): Promise<SharedIotState> {
    const [alerts, points, orders] = await Promise.all([
      readAllRows<SharedIotAlert>((from, to, count) =>
        db
          .from('bim_iot_alerts')
          .select('*', counted(count))
          .eq('project_id', project)
          .order('opened_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
      readAllRows<SharedIotPoint>((from, to, count) =>
        db
          .from('bim_iot_points')
          .select('id,project_id,asset_id,model_id,global_id,name,unit,device_id', counted(count))
          .eq('project_id', project)
          .order('id')
          .range(from, to),
      ),
      readAllRows<IotWorkOrder>((from, to, count) =>
        db
          .from('facility_work_orders')
          .select('*', counted(count))
          .eq('project_id', project)
          .not('iot_source_alert_id', 'is', null)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
    ]);
    return { alerts, points, orders };
  },
  async acknowledge(alert: Pick<SharedIotAlert, 'id' | 'version'>): Promise<SharedIotAlert> {
    return unwrap(await db.rpc('bim_iot_acknowledge_alert', { p_id: alert.id, p_version: alert.version }));
  },
  /** Operator workflow of an alert: status, assignee, notes (notes required to suppress/close). */
  async updateAlert(
    alert: Pick<SharedIotAlert, 'id' | 'version'>,
    change: { status?: IotAlertStatus; assignee_id?: string | null; notes?: string | null },
  ): Promise<SharedIotAlert> {
    return unwrap(
      await db.rpc('bim_iot_update_alert', {
        p_id: alert.id,
        p_version: alert.version,
        p_status: change.status ?? null,
        p_assignee: change.assignee_id || null,
        p_notes: change.notes === undefined ? null : (change.notes ?? ''),
        p_clear_assignee: change.assignee_id === null,
      }),
    );
  },
  /** Work order from an alert; returns the existing one when the alert already has an order. */
  async createOrder(alertId: string): Promise<IotWorkOrder> {
    return unwrap(await db.rpc('bim_iot_create_work_order', { p_alert: alertId }));
  },
  async actorNames(project: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const rows = unwrap<{ id: string; name: string }[]>(
      await db.rpc('facility_actor_names', { p_project: project, p_ids: unique }),
    );
    return new Map((rows || []).map((row) => [row.id, row.name]));
  },
  /** Gateways registered for the project (columns readable by members; never secret_sha256). */
  async gateways(project: string): Promise<IotGatewayInfo[]> {
    return unwrap(
      await db
        .from('iot_gateways')
        .select('id,project_id,code,name,protocol,status,clock_mode,last_seen_at')
        .eq('project_id', project)
        .order('code'),
    );
  },
  async assets(project: string, ids: string[]): Promise<IotAssetRow[]> {
    const unique = [...new Set(ids)];
    const assets: IotAssetRow[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unwrap<IotAssetRow[]>(
        await db
          .from('bim_assets')
          .select('asset_id,asset_name,category,location,status,next_maintenance')
          .eq('project_id', project)
          .in('asset_id', unique.slice(i, i + 100)),
      );
      assets.push(...chunk);
    }
    return assets;
  },
  async gatewayCatalog(project: string) {
    const [points, devices, rules] = await Promise.all([
      readAllRows<GatewayCatalogRows['points'][number]>((from, to, count) =>
        db
          .from('bim_iot_points')
          .select(
            'id,asset_id,model_id,global_id,name,unit,device_id,metric,value_type,stale_after_seconds',
            counted(count),
          )
          .eq('project_id', project)
          .order('id')
          .range(from, to),
      ),
      readAllRows<GatewayCatalogRows['devices'][number]>((from, to, count) =>
        db
          .from('iot_devices')
          .select('id,asset_id,code,category,stale_after_seconds', counted(count))
          .eq('project_id', project)
          .order('id')
          .range(from, to),
      ),
      readAllRows<GatewayCatalogRows['rules'][number]>((from, to, count) =>
        db
          .from('iot_alarm_rules')
          .select(
            'id,point_id,device_id,name,operator,threshold,clear_threshold,hold_seconds,clear_hold_seconds,severity,schedule,enabled',
            counted(count),
          )
          .eq('project_id', project)
          .order('id')
          .range(from, to),
      ),
    ]);
    const assets = await BimIotService.assets(
      project,
      points.map((p) => p.asset_id),
    );
    return buildGatewayCatalog({ project_id: project, points, devices, assets, rules });
  },
  async latest(project: string): Promise<LatestSnapshotRow[]> {
    return readAllRows<LatestSnapshotRow>((from, to, count) =>
      db
        .from('iot_latest')
        .select('point_id,observed_at,value,quality', counted(count))
        .eq('project_id', project)
        .order('point_id')
        .range(from, to),
    );
  },
  latestTransport(project: string): GatewayTransport {
    return {
      loadSnapshot: () => BimIotService.latest(project),
      subscribe: (handlers) => subscribeProject(project, handlers),
    };
  },
  /** Notified on every ingest batch with changes (readings or alerts) — used to refresh alert lists. */
  onBatch(project: string, listener: (alerts: number) => void): () => void {
    return subscribeProject(project, {
      onMessage: (payload) =>
        listener(payload && typeof payload === 'object' ? Number((payload as { alerts?: unknown }).alerts) || 0 : 0),
      onStatus: () => undefined,
    });
  },
  /** Point history: raw ≤ 6 h, 5-minute rollup ≤ 48 h, hourly rollup beyond. */
  async history(
    project: string,
    point: string,
    fromMs: number,
    toMs: number,
    options: { booleanPoint?: boolean; resolution?: HistoryResolution } = {},
  ): Promise<{ resolution: HistoryResolution; rows: HistoryRow[] }> {
    const resolution = options.resolution ?? historyResolution((toMs - fromMs) / 3600000);
    const from = new Date(fromMs).toISOString();
    const to = new Date(toMs).toISOString();
    if (resolution === 'raw') {
      const rows = await readAllRows<RawHistoryRow>((start, end, count) =>
        db
          .from('iot_readings')
          .select('observed_at,value,quality', counted(count))
          .eq('project_id', project)
          .eq('point_id', point)
          .gte('observed_at', from)
          .lt('observed_at', to)
          .order('observed_at')
          .range(start, end),
      );
      return { resolution, rows: toHistoryRows(resolution, rows) };
    }
    const table = resolution === '5min' ? 'iot_readings_5min' : 'iot_readings_hourly';
    const rows = await readAllRows<RollupHistoryRow>((start, end, count) =>
      db
        .from(table)
        .select('bucket,samples,bad_samples,min_value,max_value,avg_value,last_value', counted(count))
        .eq('project_id', project)
        .eq('point_id', point)
        .gte('bucket', from)
        .lt('bucket', to)
        .order('bucket')
        .range(start, end),
    );
    return { resolution, rows: toHistoryRows(resolution, rows, undefined, options.booleanPoint) };
  },
  async events(project: string, alert: string): Promise<IotAlertEvent[]> {
    return unwrap(
      await db
        .from('bim_iot_alert_events')
        .select('*')
        .eq('project_id', project)
        .eq('alert_id', alert)
        .order('id', { ascending: false })
        .limit(50),
    );
  },
};
