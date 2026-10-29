import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// IoT section of the viewer's "Vận hành" panel: gateway status, live dashboard (sensors on the model), shared alerts
// with work orders raised from them, and point history from the database (raw / 5-minute / hourly, CSV export).
// Ported from cic-hud BimIotOperationsPanel. Dropped: the local demo source and its replay/scenario workspace
// (HUD Tower dataset), BimOfficeIotScenarios, recharts, the embedded FacilityOrderEditor (work orders open in the
// asset workspace through onOpenWorkOrder / onOpenAsset). Without a registered gateway it explains how to add one.
import React, { useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Download, History, Loader2, Radio, RefreshCw } from 'lucide-react';
import { useBimAccess } from '@/features/bim-suite/adapters/context';
import type { BimViewerRef } from '../viewer/types';
import { useBimIot, useIotCatalog, IOT_KEY } from '../hooks/useBimIot';
import { useProjectIotSource } from '../hooks/useProjectIotSource';
import { BimIotService, type IotGatewayInfo } from '../services/BimIotService';
import { historyCsv, historyResolution, type HistoryRow } from '../lib/iotHistory';
import { zonedIso } from '../lib/iotTime';
import { iotClock, iotDateTime, numberLabel, unitLabel, valueLabel, type IotCatalog } from '../lib/iotTypes';
import { BimIotLiveDashboard } from './BimIotLiveDashboard';
import { BimIotSharedPanel } from './BimIotSharedPanel';
import { BimIotLineChart } from './BimIotLineChart';

export interface BimIotOperationsPanelProps {
  /** BuildSIA project uuid (document_projects.id). */
  projectId: string;
  /** Viewer handle: sensor pins (setIotSensors), overlay host, floor focus. */
  viewerRef: RefObject<BimViewerRef | null>;
  /** Select / fly to an element by IFC GlobalId. */
  onLocateGuid: (guid: string) => void;
  /** Open an asset (bim_assets.asset_id) in the asset workspace. */
  onOpenAsset: (assetId: string) => void;
  /** Open a work order (facility_work_orders.id) in the asset workspace; falls back to onOpenAsset. */
  onOpenWorkOrder?: (orderId: string, assetId: string) => void;
  /** Write access override; defaults to useBimAccess().canWrite. */
  canEdit?: boolean;
  /** Shown in the expanded dashboard title. */
  projectName?: string;
}
type View = 'live' | 'alerts' | 'history';

const action =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-2xs font-medium text-txt-secondary hover:border-primary-500 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200';
const field =
  'min-w-0 rounded-lg border border-border bg-bg-surface px-2 py-1.5 text-xs text-txt-primary dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';
const chip = (active: boolean) =>
  `rounded-lg border px-2 py-1 text-2xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${active ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-bg-surface text-txt-secondary hover:border-primary-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`;

/** Where the setup steps are documented (lead keeps docs/bim.md in sync). */
export const IOT_SETUP_DOC = 'frontend/docs/bim.md › IoT: đăng ký gateway';

/** Empty state: what to do before any IoT data can appear. */
export function BimIotSetupGuide({ reason }: { reason: 'no-gateway' | 'no-points' | 'disabled' }) {
  return (
    <section
      className="space-y-2 rounded-xl border border-dashed border-border p-4 text-xs text-txt-secondary dark:border-slate-600 dark:text-slate-300"
      aria-label="Hướng dẫn kết nối IoT"
    >
      <h3 className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
        <Radio className="h-4 w-4 text-primary-600" />
        {reason === 'no-gateway'
          ? 'Dự án chưa kết nối gateway IoT'
          : reason === 'disabled'
            ? 'Mọi gateway của dự án đang bị khóa'
            : 'Gateway đã đăng ký nhưng chưa có điểm đo gắn thiết bị'}
      </h3>
      <p className="leading-relaxed">
        Số đo đến từ gateway BMS/SCADA của tòa nhà qua Edge Function <code>iot-ingest</code>; dashboard không dùng dữ
        liệu mẫu. Quản trị cơ sở dữ liệu thực hiện:
      </p>
      <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
        <li>Lập sổ tài sản (tab Tài sản) cho thiết bị cần giám sát và gắn cấu kiện BIM.</li>
        <li>
          Đăng ký gateway:{' '}
          <code>
            select public.iot_register_gateway(&apos;&lt;dự án&gt;&apos;, &apos;GW-01&apos;, &apos;Gateway BMS&apos;,
            &apos;BACnet/IP&apos;, &apos;wall&apos;);
          </code>{' '}
          — khóa trả về chỉ hiện một lần, cấu hình vào gateway.
        </li>
        <li>
          Khai báo thiết bị (<code>iot_devices</code>), điểm đo (<code>bim_iot_points</code>, đơn vị chuẩn, dải hợp lệ)
          và quy tắc cảnh báo (<code>iot_alarm_rules</code>). Có thể sinh SQL từ tệp cấu hình:{' '}
          <code>npx tsx scripts/iot-gateway-simulator.ts --mode sql --config &lt;tệp&gt;</code>.
        </li>
        <li>
          Gateway gửi lô <code>POST /functions/v1/iot-ingest</code> với <code>x-iot-gateway-id</code> và{' '}
          <code>x-iot-gateway-secret</code>.
        </li>
      </ol>
      <p className="text-2xs text-txt-muted">Chi tiết hợp đồng dữ liệu và gateway giả lập: {IOT_SETUP_DOC}.</p>
    </section>
  );
}

export function BimIotOperationsPanel(props: BimIotOperationsPanelProps) {
  const access = useBimAccess();
  const canEdit = props.canEdit ?? access.canWrite;
  const source = useProjectIotSource(props.projectId);
  const [view, setView] = useState<View>('live');
  const configured = source.gateways.length > 0;
  const catalog = useIotCatalog(props.projectId, configured);
  if (source.isPending)
    return (
      <p role="status" className="flex items-center gap-2 p-4 text-xs text-txt-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải nguồn IoT…
      </p>
    );
  if (source.isError)
    return (
      <div role="alert" className="space-y-2 p-4 text-xs text-rose-700">
        <p>Không tải được gateway IoT: {source.error.message}</p>
        <button type="button" className={action} onClick={() => void source.refetch()}>
          Tải lại
        </button>
      </div>
    );
  if (!configured)
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <BimIotSetupGuide reason="no-gateway" />
        {/* Alerts/orders may exist from an earlier configuration. */}
        <BimIotSharedPanel
          projectId={props.projectId}
          canEdit={canEdit}
          onLocateGuid={props.onLocateGuid}
          onOpenAsset={props.onOpenAsset}
          onOpenWorkOrder={props.onOpenWorkOrder}
        />
      </div>
    );
  const data = catalog.data;
  return (
    <div
      className="flex h-full min-h-0 flex-col text-xs text-txt-secondary dark:text-slate-200"
      aria-label="IoT vận hành"
    >
      <header className="shrink-0 space-y-2 border-b border-border bg-bg-subtle p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
              <Radio className="h-4 w-4 text-primary-600" />
              IoT vận hành
            </h3>
            <p className="mt-0.5 text-2xs text-txt-muted">
              {data
                ? `${data.devices.length} thiết bị · ${data.points.length} điểm đã cấu hình${data.unconfigured_points ? ` · ${data.unconfigured_points} điểm chưa gắn thiết bị` : ''}`
                : 'Đang tải danh mục điểm đo…'}
            </p>
          </div>
          <span
            className={`rounded-md border px-2 py-1 text-2xs font-bold ${source.status.state === 'receiving' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-50' : 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-50'}`}
          >
            {source.status.label}
          </span>
        </div>
        <GatewayList gateways={source.gateways} />
        <nav aria-label="Mục IoT" className="flex flex-wrap gap-1">
          {(
            [
              ['live', 'Dashboard trực tiếp', Radio],
              ['alerts', 'Cảnh báo & phiếu', BellRing],
              ['history', 'Lịch sử', History],
            ] as const
          ).map(([id, name, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`inline-flex shrink-0 items-center gap-1 ${chip(view === id)}`}
            >
              <Icon className="h-3 w-3" />
              {name}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {view === 'alerts' ? (
          <BimIotSharedPanel
            projectId={props.projectId}
            canEdit={canEdit}
            onLocateGuid={props.onLocateGuid}
            onOpenAsset={props.onOpenAsset}
            onOpenWorkOrder={props.onOpenWorkOrder}
          />
        ) : catalog.isPending ? (
          <p role="status" className="flex items-center gap-2 text-txt-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải danh mục điểm đo của gateway…
          </p>
        ) : catalog.isError || !data ? (
          <div role="alert" className="space-y-2 text-rose-700">
            <p>{catalog.error?.message ?? 'Chưa tải được danh mục gateway.'}</p>
            <button type="button" className={action} onClick={() => void catalog.refetch()}>
              Tải lại
            </button>
          </div>
        ) : !data.points.length ? (
          <BimIotSetupGuide reason={source.status.state === 'disabled' ? 'disabled' : 'no-points'} />
        ) : view === 'live' ? (
          <BimIotLiveDashboard
            data={data}
            viewerRef={props.viewerRef}
            onLocateGuid={props.onLocateGuid}
            title={props.projectName}
          />
        ) : (
          <GatewayHistory projectId={props.projectId} data={data} />
        )}
      </div>
    </div>
  );
}
export default BimIotOperationsPanel;

function GatewayList({ gateways }: { gateways: IotGatewayInfo[] }) {
  return (
    <ul className="space-y-0.5 text-2xs text-txt-muted">
      {gateways.map((g) => (
        <li key={g.id} className="flex flex-wrap justify-between gap-2">
          <span>
            {g.code} · {g.name}
            {g.protocol ? ` · ${g.protocol}` : ''} · {g.status === 'active' ? 'hoạt động' : 'đã khóa'}
          </span>
          <span className="tabular-nums">
            {g.last_seen_at ? `Nhận lô cuối ${iotDateTime(g.last_seen_at)}` : 'Chưa nhận lô nào'}
          </span>
        </li>
      ))}
    </ul>
  );
}

const RANGES = [
  [1, '1 giờ'],
  [6, '6 giờ'],
  [24, '24 giờ'],
  [168, '7 ngày'],
] as const;

function GatewayHistory({ projectId, data }: { projectId: string; data: IotCatalog }) {
  const [pointId, setPointId] = useState(() => data.points[0]?.point_id ?? '');
  const [rangeHours, setRangeHours] = useState<number>(24);
  const [anchor, setAnchor] = useState<'now' | 'latest'>('latest');
  const point = data.points.find((p) => p.point_id === pointId) ?? data.points[0];
  const shared = useBimIot(projectId);
  const latest = useQuery({
    queryKey: [IOT_KEY, 'latest', projectId],
    queryFn: () => BimIotService.latest(projectId),
    staleTime: 30000,
  });
  const latestAt = latest.data?.find((r) => r.point_id === point?.point_id)?.observed_at;
  // "Up to the latest reading" anchors the range on the point's last sample (a gateway may have stopped).
  const [nowAt, setNowAt] = useState(() => Date.now());
  const end = anchor === 'latest' && latestAt ? Date.parse(latestAt) + 1 : nowAt;
  const start = end - rangeHours * 3600000;
  const history = useQuery({
    queryKey: [IOT_KEY, 'history', projectId, point?.point_id, start, end],
    queryFn: () =>
      point
        ? BimIotService.history(projectId, point.point_id, start, end, { booleanPoint: point.value_type === 'boolean' })
        : Promise.resolve({ resolution: historyResolution(rangeHours), rows: [] as HistoryRow[] }),
    enabled: !!point && (anchor === 'now' || !latest.isPending),
    staleTime: 30000,
  });
  if (!point) return <p className="text-2xs text-txt-muted">Chưa có điểm đo đã cấu hình thiết bị.</p>;
  const asset = data.assets.find((a) => a.asset_id === point.asset_id);
  const rule = data.alarm_rules.find(
    (r) => r.point_id === point.point_id && ['gt', 'lt', 'offhours_gt'].includes(r.operator),
  );
  const rows: HistoryRow[] = history.data?.rows ?? [];
  const resolution = history.data?.resolution ?? historyResolution(rangeHours);
  const alerts = (shared.data?.alerts ?? []).filter(
    (a) =>
      a.point_id === point.point_id &&
      Date.parse(a.opened_at) < end &&
      (!a.resolved_at || Date.parse(a.resolved_at) > start),
  );
  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([historyCsv(rows, { point_id: point.point_id, unit: point.unit, resolution })], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${point.point_id}_${zonedIso(start).slice(0, 16).replace(/[:T]/g, '')}_${rangeHours}h.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const badCount = rows.filter((r) => r.bad).length;
  return (
    <section className="space-y-2" aria-label="Lịch sử điểm đo từ cơ sở dữ liệu">
      <label className="block space-y-1 text-2xs text-txt-muted">
        Điểm đo
        <BimSelect className={`${field} w-full`} value={point.point_id} onChange={(e) => setPointId(e.target.value)}>
          {data.assets.map((a) => (
            <optgroup key={a.asset_id} label={`${a.asset_name}${a.location ? ` · ${a.location}` : ''}`}>
              {data.points
                .filter((p) => p.asset_id === a.asset_id)
                .map((p) => (
                  <option key={p.point_id} value={p.point_id}>
                    {p.name} {unitLabel(p.unit)}
                  </option>
                ))}
            </optgroup>
          ))}
        </BimSelect>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map(([hours, label]) => (
          <button
            key={hours}
            type="button"
            aria-pressed={rangeHours === hours}
            className={chip(rangeHours === hours)}
            onClick={() => {
              setRangeHours(hours);
              setNowAt(Date.now());
            }}
          >
            {label}
          </button>
        ))}
        <BimSelect
          aria-label="Mốc kết thúc"
          className={field}
          value={anchor}
          onChange={(e) => {
            setAnchor(e.target.value as 'now' | 'latest');
            setNowAt(Date.now());
          }}
        >
          <option value="latest">Tới số đo mới nhất</option>
          <option value="now">Tới hiện tại</option>
        </BimSelect>
        <button
          type="button"
          className={action}
          aria-label="Tải lại lịch sử"
          onClick={() => {
            setNowAt(Date.now());
            void latest.refetch();
          }}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button type="button" className={action} disabled={!rows.length} onClick={exportCsv}>
          <Download className="h-3 w-3" />
          Xuất CSV
        </button>
      </div>
      <p className="text-2xs text-txt-muted">
        {asset?.location || asset?.asset_name || '—'} · {iotDateTime(start)} → {iotDateTime(end)} ·{' '}
        {resolution === 'raw' ? 'số đo gốc' : resolution === '5min' ? 'tổng hợp 5 phút' : 'tổng hợp theo giờ'}
      </p>
      <div className="rounded-xl border border-border bg-bg-surface p-2 dark:border-slate-700 dark:bg-slate-900">
        {history.isPending ? (
          <p role="status" className="flex items-center gap-2 p-6 text-txt-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải lịch sử…
          </p>
        ) : history.isError ? (
          <p role="alert" className="p-4 text-rose-700">
            {history.error.message}
          </p>
        ) : !rows.some((r) => r.value !== null) ? (
          <p className="p-6 text-center text-txt-muted">Chưa có số đo hợp lệ trong khoảng này (không thay bằng 0).</p>
        ) : (
          <BimIotLineChart
            rows={rows}
            label={`Lịch sử ${point.name} ${rangeHours} giờ, ${rows.length} mốc`}
            x={[start, end]}
            y={point.value_type === 'boolean' ? [0, 1] : undefined}
            threshold={rule?.threshold}
            step={point.value_type === 'boolean'}
            ranges={alerts.map((a) => ({
              from: Date.parse(a.opened_at),
              to: a.resolved_at ? Date.parse(a.resolved_at) : end,
            }))}
            heightClass="h-48"
            formatX={(v) => (rangeHours > 24 ? iotDateTime(v).slice(0, 5) : iotClock(v))}
            formatY={(v) => numberLabel(v)}
            formatValue={(v) => valueLabel(point.value_type === 'boolean' ? !!v : v, point)}
          />
        )}
      </div>
      <p className="text-2xs text-txt-muted">
        Đoạn trống: thiếu dữ liệu, mất kết nối hoặc giá trị lỗi. Vùng cam: thời gian cảnh báo mở.
        {badCount ? ` ${badCount} mốc chỉ có mẫu chất lượng xấu.` : ''}
      </p>
      {alerts.length > 0 && (
        <ul className="space-y-1">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border bg-bg-surface p-2 text-2xs dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="font-semibold">{a.name}</span> · mở {iotDateTime(a.opened_at)}
              {a.resolved_at ? ` · hồi phục ${iotDateTime(a.resolved_at)}` : ' · đang mở'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
