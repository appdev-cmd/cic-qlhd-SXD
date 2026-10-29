import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Live IoT dashboard of a project: gateway readings (iot_latest snapshot + Realtime iot:<project>), sensor pins on the
// 3D model filtered by floor/system, KPIs, systems / points / devices views and four live trends. Ported from cic-hud
// BimIotLiveDashboard without the local demo source, HUD Tower texts, the shared insight scope and recharts.
import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Crosshair, Download, Eye, EyeOff, Loader2, Maximize2, Radio, Search, WifiOff } from 'lucide-react';
import { Modal } from '@/features/bim-suite/adapters/ui';
import { formatDate } from '@/features/bim-suite/adapters/utils';
import { useIotLiveStream, type IotLiveStream } from '../hooks/useBimIot';
import type { BimViewerRef } from '../viewer/types';
import { BimIotSensorPopover } from './BimIotSensorPopover';
import { BimIotLineChart } from './BimIotLineChart';
import { sensorFloor, sensorFloorOptions } from '../lib/iotSensorFloors';
import { IOT_PIN_COLORS, IOT_PIN_LABELS, type BimIotSensorPin, type IotPinStatus } from '../viewer/iotSensorLayer';
import { CATEGORY_LABELS, numberLabel, unitLabel, valueLabel, type IotCatalog, type IotPoint } from '../lib/iotTypes';
import {
  LIVE_STATE_LABELS,
  liveClock,
  livePointState,
  normalizeLiveSearch,
  pointTrend,
  type LivePointState,
} from '../lib/iotLiveFrame';
import { zonedIso } from '../lib/iotTime';

const surface = 'rounded-xl border border-border bg-bg-surface dark:border-slate-700 dark:bg-slate-900';
const button =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-surface px-2.5 py-2 text-2xs font-semibold text-txt-secondary hover:border-primary-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';
const field =
  'min-w-0 rounded-lg border border-border bg-bg-surface p-2 text-xs text-txt-primary dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';
const badge: Record<LivePointState, string> = {
  normal: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  exceeded: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  stale: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  bad: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};
/** Metrics shown first on a system card. */
const PRIORITY: Record<string, string[]> = {
  AIR: ['co2', 'room_temp', 'humidity', 'pm25'],
  ROOM: ['occupancy', 'booked', 'no_show_minutes'],
  LIGHTING: ['light_on', 'lighting_kw', 'occupancy'],
  WATER_ZONE: ['leak_detected', 'water_flow', 'water_pressure'],
  SERVER: ['room_temp', 'humidity', 'cooling_running'],
  UPS: ['runtime_min', 'charge_pct', 'load_pct'],
  ELEVATOR: ['wait_seconds', 'available_cars', 'passenger_flow'],
  PUMP: ['vibration', 'bearing_temp', 'water_pressure'],
  POWER: ['demand_kw', 'voltage_a', 'power_factor'],
  GARAGE: ['co_ppm', 'ventilation_running', 'vehicle_count'],
  FIRE_READINESS: ['door_open', 'open_minutes', 'supervision_fault'],
};
const CONNECTION_LABELS = {
  connecting: 'ĐANG KẾT NỐI GATEWAY',
  live: 'GATEWAY · REALTIME',
  reconnecting: 'ĐANG KẾT NỐI LẠI',
  error: 'LỖI KẾT NỐI GATEWAY',
} as const;

export interface BimIotLiveDashboardProps {
  /** Project catalog from BimIotService.gatewayCatalog / useIotCatalog. */
  data: IotCatalog;
  onLocateGuid: (guid: string) => void;
  viewerRef: RefObject<BimViewerRef | null>;
  /** Title shown in the expanded (full-screen) dashboard, e.g. the project name. */
  title?: string;
}

export function BimIotLiveDashboard({ data, onLocateGuid, viewerRef, title }: BimIotLiveDashboardProps) {
  const stream = useIotLiveStream(data);
  if (!stream)
    return (
      <p role="status" className="p-3 text-xs text-txt-muted">
        Nguồn số đo chưa sẵn sàng.
      </p>
    );
  return (
    <LiveDashboardBody data={data} onLocateGuid={onLocateGuid} viewerRef={viewerRef} stream={stream} title={title} />
  );
}

function LiveDashboardBody({
  data,
  onLocateGuid,
  viewerRef,
  stream,
  title,
}: BimIotLiveDashboardProps & { stream: IotLiveStream }) {
  const { frame, history, now, staleMsFor } = stream;
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'systems' | 'points' | 'devices'>('systems');
  const [category, setCategory] = useState('all');
  const [location, setLocation] = useState('all');
  const [quality, setQuality] = useState('all');
  const [search, setSearch] = useState('');
  const [showSensors, setShowSensors] = useState(true);
  const [sensorLabels, setSensorLabels] = useState(false);
  const [sensorCategory, setSensorCategory] = useState('all');
  const [sensorFloorKey, setSensorFloorKey] = useState('all');
  const [floorFocusPending, setFloorFocusPending] = useState(false);
  const [floorFocusMessage, setFloorFocusMessage] = useState('');
  const floorFocusRequest = useRef(0);
  const [sensorOnlyAlerts, setSensorOnlyAlerts] = useState(false);
  const [sensorDeviceId, setSensorDeviceId] = useState<string | null>(null);
  const [sensorHost, setSensorHost] = useState<HTMLElement | null>(null);
  const chartsRef = useRef<HTMLElement | null>(null);
  const [chartPoints, setChartPoints] = useState(() => data.points.slice(0, 4).map((p) => p.point_id));
  const pointById = useMemo(() => new Map(data.points.map((p) => [p.point_id, p])), [data.points]);
  const assetById = useMemo(() => new Map(data.assets.map((a) => [a.asset_id, a])), [data.assets]);
  const categories = useMemo(() => [...new Set(data.assets.map((a) => a.category))], [data.assets]);
  const sensorFloors = useMemo(() => sensorFloorOptions(data.assets), [data.assets]);
  const floorByAsset = useMemo(
    () => new Map(data.assets.map((a) => [a.asset_id, sensorFloor(a)?.key ?? 'unknown'])),
    [data.assets],
  );
  const deviceAssetById = useMemo(() => new Map(data.devices.map((d) => [d.device_id, d.asset_id])), [data.devices]);
  const selectedFloor = sensorFloors.find((f) => f.key === sensorFloorKey);
  const floorAssets = data.assets.filter(
    (a) => sensorFloorKey === 'all' || floorByAsset.get(a.asset_id) === sensorFloorKey,
  );
  const floorCategoryCounts = new Map(categories.map((c) => [c, floorAssets.filter((a) => a.category === c).length]));
  const sensorScopeLabel = `${selectedFloor?.label ?? 'Tất cả tầng'} · ${sensorCategory === 'all' ? 'Tất cả hệ thống' : (CATEGORY_LABELS[sensorCategory] ?? sensorCategory)}`;
  const locations = useMemo(
    () =>
      [...new Set(data.assets.map((a) => a.location).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'vi', { numeric: true }),
      ),
    [data.assets],
  );
  // Point states are recomputed only on a new frame or session clock change.
  const states = useMemo(
    () =>
      new Map(
        data.points.map((p) => [p.point_id, livePointState(data, p, frame.readings[p.point_id], now, staleMsFor(p))]),
      ),
    [data, frame, now, staleMsFor],
  );
  const deviceRows = useMemo(
    () =>
      data.devices.flatMap((device) => {
        const asset = assetById.get(device.asset_id);
        const points = data.points.filter((p) => p.device_id === device.device_id);
        if (!asset || !points.length) return [];
        const observed = points
          .map((p) => frame.readings[p.point_id]?.observedAt)
          .filter((at): at is number => typeof at === 'number');
        const observedAt = observed.length ? Math.max(...observed) : null;
        const staleMs = Math.max(...points.map((p) => staleMsFor(p)));
        return [{ device, points, asset, observedAt, stale: observedAt === null || now - observedAt > staleMs }];
      }),
    [data.devices, data.points, assetById, frame, now, staleMsFor],
  );
  const offline = deviceRows.filter((d) => d.stale).length;
  const criticalPoints = useMemo(
    () => new Set(data.alarm_rules.filter((r) => r.severity === 'critical').map((r) => r.point_id)),
    [data.alarm_rules],
  );
  const sensorPins = useMemo<BimIotSensorPin[]>(
    () =>
      deviceRows.map(({ device, points, asset }) => {
        const issue = points.find((p) => states.get(p.point_id) === 'exceeded' && criticalPoints.has(p.point_id));
        const status: IotPinStatus = issue
          ? 'critical'
          : points.some((p) => states.get(p.point_id) === 'bad')
            ? 'bad'
            : points.some((p) => states.get(p.point_id) === 'stale')
              ? 'stale'
              : points.some((p) => states.get(p.point_id) === 'exceeded')
                ? 'warning'
                : 'normal';
        const primary = issue ?? points.find((p) => states.get(p.point_id) !== 'normal') ?? points[0];
        const sample = frame.readings[primary.point_id];
        const reading = !sample
          ? 'Chưa có số đo'
          : sample.quality === 'bad'
            ? 'Không hợp lệ'
            : valueLabel(sample.value, primary);
        const summary = `${primary.name}: ${reading}${sample && states.get(primary.point_id) === 'stale' ? ' (số đo cuối)' : ''}`;
        return {
          id: device.device_id,
          modelId: asset.model_id,
          guid: asset.global_id,
          label: device.code,
          title: `${asset.asset_name}${asset.location ? ` · ${asset.location}` : ''}\n${IOT_PIN_LABELS[status]} · ${summary}\nVị trí tham chiếu cấu kiện BIM`,
          summary,
          status,
          selected: sensorDeviceId === device.device_id,
        };
      }),
    [deviceRows, states, criticalPoints, frame, sensorDeviceId],
  );
  const shownSensorPins = sensorPins.filter((pin) => {
    const assetId = deviceAssetById.get(pin.id);
    return (
      (sensorCategory === 'all' || (assetId !== undefined && assetById.get(assetId)?.category === sensorCategory)) &&
      (sensorFloorKey === 'all' || (assetId !== undefined && floorByAsset.get(assetId) === sensorFloorKey)) &&
      (!sensorOnlyAlerts || pin.status !== 'normal')
    );
  });
  // The 3D layer is updated only when the pin content changes (string key, not array identity).
  const pinsKey = JSON.stringify(shownSensorPins);
  const selectSensor = useCallback((id: string) => {
    setExpanded(false);
    setSensorDeviceId(id);
  }, []);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const host = viewer.getIotOverlayHost();
    if (host !== sensorHost) setSensorHost(host);
    viewer.setIotSensors(
      showSensors
        ? {
            pins: JSON.parse(pinsKey) as BimIotSensorPin[],
            scopeLabel: sensorScopeLabel,
            showLabels: sensorLabels,
            onSelect: selectSensor,
          }
        : null,
    );
  }, [viewerRef, pinsKey, showSensors, sensorLabels, sensorHost, sensorScopeLabel, selectSensor]);
  useEffect(() => {
    const viewer = viewerRef.current;
    const request = floorFocusRequest;
    return () => {
      request.current++;
      viewer?.setIotSensors(null);
      void viewer
        ?.resetIotFloorView()
        .catch((error: unknown) => console.warn('Chưa khôi phục được chế độ xem tầng IoT:', error));
    };
  }, [viewerRef]);
  const focusFloor = async (key: string) => {
    const request = ++floorFocusRequest.current;
    const viewer = viewerRef.current;
    setSensorDeviceId(null);
    setExpanded(false);
    setFloorFocusMessage('');
    if (!viewer) {
      setFloorFocusPending(false);
      setFloorFocusMessage('Trình xem BIM chưa sẵn sàng.');
      return;
    }
    setFloorFocusPending(true);
    try {
      if (key === 'all') {
        await viewer.focusIotSensors(null);
        if (request === floorFocusRequest.current) setFloorFocusMessage('Đã trở về toàn mô hình.');
        return;
      }
      const floor = sensorFloors.find((f) => f.key === key);
      const assets = data.assets.filter((a) => floorByAsset.get(a.asset_id) === key && a.model_id && a.global_id);
      const groups = [...new Set(assets.map((a) => a.model_id))].map((modelId) => ({
        modelId,
        guids: [...new Set(assets.filter((a) => a.model_id === modelId).map((a) => a.global_id))],
      }));
      const result = await viewer.focusIotSensors(groups, floor?.key);
      if (request !== floorFocusRequest.current) return;
      setFloorFocusMessage(
        result.applied
          ? result.isolated
            ? `Đang xem riêng ${floor?.label ?? 'tầng đã chọn'} · Các tầng khác đã ẩn · ${result.glassCount ? 'Lớp kính đã làm trong suốt' : 'Tầng này không có cấu kiện kính'}.`
            : `Đã zoom tới vùng cảm biến ${floor?.label ?? 'đã chọn'}.`
          : 'Chưa tìm thấy tầng IFC trong mô hình đang nạp. Nạp mô hình rồi bấm Zoom lại tầng.',
      );
    } catch (error) {
      if (request === floorFocusRequest.current)
        setFloorFocusMessage(error instanceof Error ? error.message : 'Chưa zoom được tới tầng.');
    } finally {
      if (request === floorFocusRequest.current) setFloorFocusPending(false);
    }
  };
  const selectFloor = (key: string) => {
    setSensorFloorKey(key);
    void focusFloor(key);
  };
  const exceeded = data.points.filter((p) => states.get(p.point_id) === 'exceeded');
  const bad = data.points.filter((p) => states.get(p.point_id) === 'bad').length;
  const stale = data.points.filter((p) => states.get(p.point_id) === 'stale').length;
  const newestObserved = useMemo(() => {
    let newest = 0;
    for (const reading of Object.values(frame.readings)) newest = Math.max(newest, reading.observedAt);
    return newest;
  }, [frame]);
  const lastPacketAt = newestObserved || frame.receivedAt;
  const packetAge = Math.max(0, Math.floor((now - lastPacketAt) / 1000));
  const sourceStale = stream.connection !== 'live' || !newestObserved || now - newestObserved > stream.sourceStaleMs;
  const filtered = data.points.filter((p) => {
    const asset = assetById.get(p.asset_id);
    if (!asset) return false;
    return (
      (category === 'all' || asset.category === category) &&
      (location === 'all' || asset.location === location) &&
      (quality === 'all' || states.get(p.point_id) === quality) &&
      normalizeLiveSearch(`${p.name} ${p.point_id} ${asset.asset_name} ${asset.location}`).includes(
        normalizeLiveSearch(search),
      )
    );
  });
  const choosePoint = (point: IotPoint) => {
    setChartPoints((previous) => [point.point_id, ...previous.slice(1)]);
    chartsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const showSystem = (id: string) => {
    setCategory(id);
    setLocation('all');
    setQuality('all');
    setSearch('');
    setTab('points');
  };
  const displayReading = (point: IotPoint) => {
    const state = states.get(point.point_id);
    const reading = frame.readings[point.point_id];
    if (!reading) return 'Chưa có số đo';
    return state === 'bad' ? 'Không hợp lệ' : valueLabel(reading.value, point);
  };
  const exportSnapshot = () => {
    const snapshot = {
      source: 'gateway-realtime',
      project_id: data.project_id,
      timezone: 'Asia/Ho_Chi_Minh',
      received_at: zonedIso(frame.receivedAt),
      sequence: frame.sequence,
      points: data.points.map((p) => {
        const reading = frame.readings[p.point_id];
        return {
          ...p,
          value: reading?.value ?? null,
          quality: reading?.quality ?? null,
          observed_at: reading ? zonedIso(reading.observedAt) : null,
          state: states.get(p.point_id),
        };
      }),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `IoT-so-do-${zonedIso(frame.receivedAt).slice(0, 16).replace(/[:T]/g, '')}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const kpis: [string, string, string, LivePointState][] = [
    [
      'Thiết bị có dữ liệu mới',
      `${data.devices.length - offline}/${data.devices.length}`,
      `${offline} mất cập nhật`,
      offline ? 'stale' : 'normal',
    ],
    [
      'Điểm đo hợp lệ',
      `${data.points.length - bad - stale}/${data.points.length}`,
      'Đủ tuổi dữ liệu & chất lượng',
      bad ? 'bad' : stale ? 'stale' : 'normal',
    ],
    ['Điểm vượt ngưỡng', String(exceeded.length), 'Đối chiếu ngưỡng vận hành', exceeded.length ? 'exceeded' : 'normal'],
    ['Điểm mất cập nhật', String(stale), 'Không thay số đo bằng 0', stale ? 'stale' : 'normal'],
    ['Lỗi chất lượng', String(bad), 'Không dùng giá trị lỗi', bad ? 'bad' : 'normal'],
    [
      'Tuổi số đo mới nhất',
      `${packetAge} giây`,
      `${history.length} khung trong bộ đệm`,
      sourceStale ? 'stale' : 'normal',
    ],
  ];
  const content = (
    <div className="space-y-3 text-xs text-txt-secondary dark:text-slate-200">
      <section className="space-y-3 rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-txt-primary dark:text-white">
              <Radio className="h-4 w-4 text-primary-600" />
              Dashboard cảm biến IoT
            </h3>
            <p className="mt-1 text-2xs text-txt-secondary dark:text-slate-300">
              {data.devices.length} thiết bị/vùng đo · {data.points.length} điểm · {categories.length} hệ thống
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-2xs font-bold ${sourceStale ? badge.stale : badge.normal}`}>
            {stream.connection === 'live' && sourceStale ? 'GATEWAY NGỪNG GỬI' : CONNECTION_LABELS[stream.connection]}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!expanded && (
            <button type="button" className={button} onClick={() => setExpanded(true)}>
              <Maximize2 className="h-3.5 w-3.5" />
              Mở rộng dashboard
            </button>
          )}
          <button type="button" className={button} onClick={exportSnapshot}>
            <Download className="h-3.5 w-3.5" />
            Xuất số đo
          </button>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-2xs text-txt-secondary dark:text-slate-300">
          <span className="tabular-nums">
            {formatDate(new Date(now))} {liveClock(now)} GMT+7
          </span>
          <span className="tabular-nums">
            Khung #{numberLabel(frame.sequence, 0)} · đo {newestObserved ? liveClock(newestObserved) : '—'} ·{' '}
            {packetAge} giây trước
          </span>
        </div>
        <p className="text-2xs leading-relaxed text-txt-muted">
          Số đo từ gateway qua iot-ingest; tải ảnh chụp mới nhất khi kết nối hoặc kết nối lại, sau đó cập nhật theo kênh
          Realtime của dự án. Điểm quá thời hạn cập nhật của từng thiết bị được đánh dấu mất cập nhật và giữ số đo cuối,
          không thay bằng 0.{stream.error ? ` Lỗi: ${stream.error}` : ''}
        </p>
      </section>

      <section className={`${surface} space-y-2 p-3`} aria-label="Cảm biến trực tiếp trên BIM">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={button}
            aria-pressed={showSensors}
            onClick={() => {
              setShowSensors(!showSensors);
              if (showSensors) setSensorDeviceId(null);
            }}
          >
            {showSensors ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSensors ? 'Ẩn cảm biến' : 'Hiện cảm biến'}
          </button>
          <button
            type="button"
            className={button}
            disabled={sensorFloorKey === 'all' || floorFocusPending}
            onClick={() => void focusFloor(sensorFloorKey)}
          >
            {floorFocusPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            Zoom lại tầng
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              setSensorCategory('all');
              setSensorOnlyAlerts(false);
              selectFloor('all');
            }}
          >
            Quay lại toàn bộ mô hình
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-2xs">
            Tầng cảm biến trên BIM
            <BimSelect className={field} value={sensorFloorKey} onChange={(e) => selectFloor(e.target.value)}>
              <option value="all">Tất cả tầng ({data.assets.length})</option>
              {sensorFloors.map((floor) => (
                <option key={floor.key} value={floor.key}>
                  {floor.label} ({floor.count})
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-2xs">
            Hệ cảm biến trên mô hình
            <BimSelect
              className={field}
              value={sensorCategory}
              onChange={(e) => {
                setSensorCategory(e.target.value);
                setSensorDeviceId(null);
              }}
            >
              <option value="all">Tất cả hệ thống ({floorAssets.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c} ({floorCategoryCounts.get(c) ?? 0})
                </option>
              ))}
            </BimSelect>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 py-2 text-2xs">
            <BimInput
              type="checkbox"
              checked={sensorOnlyAlerts}
              onChange={(e) => {
                setSensorOnlyAlerts(e.target.checked);
                setSensorDeviceId(null);
              }}
              className="accent-primary-600"
            />
            Chỉ điểm cần chú ý
          </label>
          <label className="flex items-center gap-1.5 py-2 text-2xs">
            <BimInput
              type="checkbox"
              checked={sensorLabels}
              onChange={(e) => setSensorLabels(e.target.checked)}
              className="accent-primary-600"
            />
            Hiện nhãn
          </label>
        </div>
        <p aria-live="polite" className="text-xs font-semibold text-primary-700 dark:text-primary-300">
          {showSensors
            ? `Đang hiện ${shownSensorPins.length}/${data.devices.length} cảm biến`
            : `Đã ẩn cảm biến · ${shownSensorPins.length} thiết bị khớp bộ lọc`}
          {' · '}
          {sensorScopeLabel}
        </p>
        <p role="status" className="text-2xs text-txt-muted">
          {floorFocusPending ? 'Đang đưa mô hình tới tầng đã chọn…' : floorFocusMessage}
        </p>
        {shownSensorPins.length === 0 && (
          <div className="rounded-lg bg-bg-subtle p-2 text-xs text-txt-secondary dark:bg-slate-800 dark:text-slate-300">
            Không có cảm biến khớp tầng, hệ thống và trạng thái đang chọn.
            <button
              type="button"
              className="ml-2 font-semibold text-primary-700 underline dark:text-primary-300"
              onClick={() => {
                setSensorCategory('all');
                setSensorOnlyAlerts(false);
              }}
            >
              Xem tất cả hệ thống của tầng
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs">
          {Object.entries(IOT_PIN_LABELS).map(([id, label]) => (
            <span key={id} className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: IOT_PIN_COLORS[id as IotPinStatus] }}
              />
              {label}
            </span>
          ))}
        </div>
        <p className="text-2xs leading-relaxed text-txt-muted">
          Bấm điểm trên mô hình để xem chỉ số và biểu đồ. Một điểm đại diện thiết bị/vùng đo, đặt tại cấu kiện BIM gắn
          với tài sản; điểm nằm trong lớp vỏ vẫn được hiện xuyên lớp.
        </p>
      </section>

      <div className={`grid grid-cols-2 gap-2 ${expanded ? 'lg:grid-cols-6' : 'xl:grid-cols-3'}`}>
        {kpis.map(([label, value, hint, state]) => (
          <div key={label} className={`${surface} p-3`}>
            <p className="text-2xs text-txt-muted">{label}</p>
            <p className="my-1 text-xl font-bold tabular-nums text-txt-primary dark:text-white">{value}</p>
            <span className={`rounded px-1.5 py-0.5 text-3xs ${badge[state]}`}>{hint}</span>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-1" aria-label="Nội dung dashboard trực tiếp">
        {(
          [
            ['systems', 'Tổng quan hệ thống'],
            ['points', `Tất cả ${data.points.length} điểm`],
            ['devices', `Thiết bị (${data.devices.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`${button} ${tab === id ? '!border-primary-600 !bg-primary-600 !text-white' : ''}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'systems' && (
        <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${expanded ? 'xl:grid-cols-4' : ''}`}>
          {categories.map((id) => {
            const points = data.points.filter((p) => assetById.get(p.asset_id)?.category === id);
            const metrics = PRIORITY[id] ?? [...new Set(points.map((p) => p.metric))].slice(0, 3);
            const highlights = metrics
              .map((metric) => points.find((p) => p.metric === metric))
              .filter((p): p is IotPoint => !!p);
            const shown = highlights.length ? highlights : points.slice(0, 3);
            const abnormal = points.filter((p) => states.get(p.point_id) !== 'normal').length;
            return (
              <button
                key={id}
                type="button"
                onClick={() => showSystem(id)}
                className={`${surface} space-y-2 p-3 text-left hover:border-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-txt-primary dark:text-white">{CATEGORY_LABELS[id] ?? id}</h4>
                  <span className={`rounded px-1.5 py-0.5 text-3xs ${abnormal ? badge.exceeded : badge.normal}`}>
                    {abnormal ? `${abnormal} cần chú ý` : 'Đang theo dõi'}
                  </span>
                </div>
                {shown.map((p) => (
                  <div key={p.point_id} className="flex items-start justify-between gap-2 text-2xs">
                    <span className="min-w-0 text-txt-muted">{p.name}</span>
                    <span
                      className={`shrink-0 rounded px-1 text-right font-semibold tabular-nums ${badge[states.get(p.point_id) ?? 'stale']}`}
                    >
                      {displayReading(p)}
                      {states.get(p.point_id) === 'stale' ? ' · cũ' : ''}
                    </span>
                  </div>
                ))}
                <p className="text-3xs text-txt-muted">{points.length} điểm · mở đầy đủ →</p>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'points' && (
        <section className={`${surface} space-y-3 p-3`} aria-label="Toàn bộ chỉ số cảm biến">
          <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${expanded ? 'lg:grid-cols-4' : ''}`}>
            <label className="flex flex-col gap-1 text-2xs">
              Tìm cảm biến / chỉ số
              <span className="relative">
                <Search className="absolute left-2 top-2.5 h-3 w-3 text-txt-muted" />
                <BimInput
                  className={`${field} w-full pl-7`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="CO2, nhiet do, AHU…"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-2xs">
              Hệ thống
              <BimSelect className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">Tất cả hệ thống</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c] ?? c}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="flex flex-col gap-1 text-2xs">
              Vị trí / vùng đo
              <BimSelect className={field} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="all">Tất cả vị trí</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="flex flex-col gap-1 text-2xs">
              Tình trạng số đo
              <BimSelect className={field} value={quality} onChange={(e) => setQuality(e.target.value)}>
                <option value="all">Tất cả tình trạng</option>
                {Object.entries(LIVE_STATE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </BimSelect>
            </label>
          </div>
          <p className="text-2xs text-txt-muted">
            {filtered.length}/{data.points.length} điểm · bấm chỉ số để đưa vào biểu đồ 1
          </p>
          <div className="max-h-[520px] overflow-auto">
            <BimTable className="w-full text-left text-2xs">
              <thead className="sticky top-0 bg-bg-subtle text-txt-secondary dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  {['Cảm biến / vị trí', 'Giá trị', 'Tình trạng', 'Đo gần nhất'].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap p-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const r = frame.readings[p.point_id];
                  const state = states.get(p.point_id) ?? 'stale';
                  return (
                    <tr key={p.point_id} className="border-b border-border dark:border-slate-800">
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-left font-medium text-primary-700 hover:underline dark:text-primary-300"
                          onClick={() => choosePoint(p)}
                        >
                          {p.name}
                        </button>
                        <p className="mt-0.5 text-3xs text-txt-muted">{assetById.get(p.asset_id)?.location}</p>
                      </td>
                      <td className="whitespace-nowrap p-2 font-semibold tabular-nums">
                        {displayReading(p)}
                        {state === 'stale' && <span className="block text-3xs font-normal">Số đo cuối</span>}
                      </td>
                      <td className="p-2">
                        <span className={`inline-block rounded px-1.5 py-1 text-2xs ${badge[state]}`}>
                          {LIVE_STATE_LABELS[state]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-2 tabular-nums">
                        {r ? liveClock(r.observedAt) : '—'}
                        <span className="block text-3xs text-txt-muted">
                          {r ? `${Math.max(0, Math.floor((now - r.observedAt) / 1000))} giây trước` : 'Chưa nhận số đo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </BimTable>
            {!filtered.length && (
              <p className="p-4 text-center text-txt-muted">Không có điểm phù hợp. Đổi bộ lọc hoặc từ khóa.</p>
            )}
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${expanded ? 'xl:grid-cols-4' : ''}`}>
          {deviceRows.map(({ device, points, asset, observedAt, stale: isStale }) => (
            <article key={device.device_id} className={`${surface} space-y-2 p-3`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold">{device.code}</h4>
                <span
                  className={`flex items-center gap-1 rounded px-1.5 py-1 text-2xs ${isStale ? badge.stale : badge.normal}`}
                >
                  {isStale ? <WifiOff className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                  {isStale ? 'Mất cập nhật' : 'Đang gửi'}
                </span>
              </div>
              <p className="text-2xs text-txt-muted">
                {asset.asset_name}
                {asset.location ? ` · ${asset.location}` : ''}
              </p>
              <p className="text-2xs">
                {points.length} điểm ·{' '}
                {observedAt === null
                  ? 'chưa nhận số đo'
                  : `đo ${liveClock(observedAt)} · ${Math.max(0, Math.floor((now - observedAt) / 1000))} giây trước`}
              </p>
              <button
                type="button"
                className={button}
                disabled={!asset.global_id}
                onClick={() => {
                  setExpanded(false);
                  onLocateGuid(asset.global_id);
                }}
              >
                <Crosshair className="h-3 w-3" />
                Vùng BIM
              </button>
            </article>
          ))}
        </div>
      )}

      <section ref={chartsRef} className="space-y-2" aria-label="Biểu đồ nhiều cảm biến theo thời gian thực">
        <div className="flex flex-wrap justify-between gap-2">
          <h4 className="font-semibold text-txt-primary dark:text-white">Xu hướng trực tiếp · 4 chỉ số đồng thời</h4>
          <span className="text-2xs text-txt-muted">Từ khi mở dashboard · {history.length} khung gần nhất</span>
        </div>
        <div className={`grid grid-cols-1 gap-2 ${expanded ? 'lg:grid-cols-2' : ''}`}>
          {chartPoints.map((id, index) => {
            const p = pointById.get(id);
            if (!p) return null;
            const r = frame.readings[id];
            const state = states.get(id) ?? 'stale';
            const rows = pointTrend(history, id, staleMsFor(p), now, sourceStale);
            const rule = data.alarm_rules.find((rule) => rule.point_id === id && rule.threshold !== null);
            return (
              <article key={index} className={`${surface} space-y-2 p-3`}>
                <label className="flex flex-col gap-1 text-2xs">
                  Biểu đồ {index + 1}
                  <BimSelect
                    className={field}
                    value={id}
                    onChange={(e) =>
                      setChartPoints((previous) => previous.map((v, i) => (i === index ? e.target.value : v)))
                    }
                  >
                    {data.assets.map((a) => (
                      <optgroup key={a.asset_id} label={`${a.asset_name}${a.location ? ` · ${a.location}` : ''}`}>
                        {data.points
                          .filter((point) => point.asset_id === a.asset_id)
                          .map((point) => (
                            <option key={point.point_id} value={point.point_id}>
                              {point.name} {unitLabel(point.unit)}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </BimSelect>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold tabular-nums text-txt-primary dark:text-white">{displayReading(p)}</p>
                  <span className={`rounded px-1.5 py-1 text-2xs ${badge[state]}`}>{LIVE_STATE_LABELS[state]}</span>
                </div>
                <p className="text-2xs text-txt-muted">
                  {assetById.get(p.asset_id)?.location || assetById.get(p.asset_id)?.asset_name} ·{' '}
                  {r ? `đo ${liveClock(r.observedAt)}` : 'chưa nhận số đo'}
                </p>
                {rows.some((row) => row.value !== null) ? (
                  <BimIotLineChart
                    rows={rows}
                    label={`Xu hướng ${p.name}; ${displayReading(p)}; ${LIVE_STATE_LABELS[state]}`}
                    y={p.value_type === 'boolean' ? [0, 1] : undefined}
                    threshold={rule?.threshold}
                    step={p.value_type === 'boolean'}
                    color={state === 'exceeded' ? '#d97706' : undefined}
                    formatX={liveClock}
                    formatY={(v) => numberLabel(v)}
                    formatValue={(v) => valueLabel(p.value_type === 'boolean' ? !!v : v, p)}
                  />
                ) : (
                  <p className="flex h-40 items-center justify-center rounded-lg bg-bg-subtle text-center text-2xs text-txt-muted dark:bg-slate-800">
                    Chưa có số đo hợp lệ từ khi mở dashboard.
                  </p>
                )}
                <p className="text-3xs text-txt-muted">
                  {rule?.threshold != null
                    ? `Ngưỡng vận hành ${rule.operator === 'lt' ? '<' : '>'} ${numberLabel(rule.threshold)} ${unitLabel(p.unit)}; vượt ngưỡng chưa đồng nghĩa cảnh báo đã đủ thời gian duy trì.`
                    : 'Theo dõi xu hướng; chưa cấu hình ngưỡng cho chỉ số này.'}{' '}
                  Khoảng trống biểu thị dữ liệu lỗi hoặc mất cập nhật.
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`${surface} space-y-2 p-3`} aria-label="Các điểm cần chú ý trực tiếp">
        <h4 className="font-semibold text-txt-primary dark:text-white">Cần chú ý tại thời điểm hiện tại</h4>
        {data.points
          .filter((p) => states.get(p.point_id) !== 'normal')
          .slice(0, 10)
          .map((p) => (
            <button
              key={p.point_id}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2 text-left hover:border-primary-500 dark:border-slate-700"
              onClick={() => {
                choosePoint(p);
                setTab('points');
                setCategory('all');
                setLocation('all');
                setSearch(p.point_id);
                setQuality('all');
              }}
            >
              <span className="text-2xs">
                {p.name}
                <span className="block text-3xs text-txt-muted">{assetById.get(p.asset_id)?.location}</span>
              </span>
              <span className={`rounded px-1.5 py-1 text-2xs ${badge[states.get(p.point_id) ?? 'stale']}`}>
                {LIVE_STATE_LABELS[states.get(p.point_id) ?? 'stale']}
              </span>
            </button>
          ))}
        {!exceeded.length && !stale && !bad && (
          <p className="text-2xs text-emerald-800 dark:text-emerald-300">
            Chưa có điểm vượt ngưỡng, mất cập nhật hoặc lỗi chất lượng.
          </p>
        )}
        <p className="text-2xs leading-relaxed text-txt-muted">
          Cảnh báo chính thức do iot-ingest mở theo quy tắc (ngưỡng, thời gian duy trì, hồi phục); trạng thái điểm ở đây
          chỉ để quan sát nhanh.
        </p>
      </section>
    </div>
  );
  return (
    <>
      {showSensors &&
        sensorHost &&
        sensorDeviceId &&
        shownSensorPins.some((p) => p.id === sensorDeviceId) &&
        createPortal(
          <BimIotSensorPopover
            key={sensorDeviceId}
            data={data}
            stream={stream}
            deviceId={sensorDeviceId}
            status={sensorPins.find((p) => p.id === sensorDeviceId)?.status ?? 'stale'}
            onClose={() => setSensorDeviceId(null)}
            onExpand={(point) => {
              setChartPoints((previous) => [point.point_id, ...previous.slice(1)]);
              setSensorDeviceId(null);
              setExpanded(true);
            }}
          />,
          sensorHost,
        )}
      {!expanded && content}
      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        title={title ? `${title} · Dashboard cảm biến IoT` : 'Dashboard cảm biến IoT'}
        size="full"
        className="!max-w-[96vw]"
      >
        <div className="min-h-0 overflow-y-auto p-4">{expanded && content}</div>
      </Modal>
    </>
  );
}
