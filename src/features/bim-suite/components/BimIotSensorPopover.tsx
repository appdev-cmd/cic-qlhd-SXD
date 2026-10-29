'use client';
// Readings of one IoT device opened from its pin on the 3D model: every point of the device, live trend of the
// selected point, threshold. Rendered into the viewer's IoT overlay host. Ported from cic-hud (SVG chart, no recharts).
import React, { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { formatDate } from '@/features/bim-suite/adapters/utils';
import { numberLabel, unitLabel, valueLabel, type IotCatalog, type IotPoint } from '../lib/iotTypes';
import { LIVE_STATE_LABELS, liveClock, livePointState, pointTrend } from '../lib/iotLiveFrame';
import type { IotLiveStream } from '../hooks/useBimIot';
import { IOT_PIN_COLORS, IOT_PIN_LABELS, type IotPinStatus } from '../viewer/iotSensorLayer';
import { BimIotLineChart } from './BimIotLineChart';

export function BimIotSensorPopover({
  data,
  stream,
  deviceId,
  status,
  onClose,
  onExpand,
  initialPointId,
}: {
  data: IotCatalog;
  stream: IotLiveStream;
  deviceId: string;
  status: IotPinStatus;
  onClose: () => void;
  onExpand: (point: IotPoint) => void;
  initialPointId?: string;
}) {
  const device = data.devices.find((d) => d.device_id === deviceId);
  const asset = data.assets.find((a) => a.asset_id === device?.asset_id);
  const points = data.points.filter((p) => p.device_id === deviceId);
  const stateOf = (p: IotPoint) =>
    livePointState(data, p, stream.frame.readings[p.point_id], stream.now, stream.staleMsFor(p));
  const [pointId, setPointId] = useState(
    () =>
      points.find((p) => p.point_id === initialPointId)?.point_id ??
      points.find((p) => stateOf(p) === 'exceeded')?.point_id ??
      points[0]?.point_id,
  );
  const point = points.find((p) => p.point_id === pointId) ?? points[0];
  if (!device || !asset || !point)
    return (
      <section
        role="status"
        className="pointer-events-auto absolute bottom-16 right-3 z-20 rounded-xl border border-border bg-bg-surface p-3 text-xs text-txt-secondary shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
      >
        Không tìm thấy thiết bị hoặc điểm đo trong danh mục hiện tại.
        <button type="button" className="ml-2 font-semibold underline" onClick={onClose}>
          Đóng
        </button>
      </section>
    );
  const reading = stream.frame.readings[point.point_id];
  const state = stateOf(point);
  const staleMs = stream.staleMsFor(point);
  const rule = data.alarm_rules.find((r) => r.point_id === point.point_id && r.threshold !== null);
  const rows = pointTrend(
    stream.history,
    point.point_id,
    staleMs,
    stream.now,
    !reading || stream.now - reading.observedAt > staleMs,
  );
  return (
    <section
      className="pointer-events-auto absolute bottom-16 right-3 z-20 max-h-[80%] space-y-3 overflow-y-auto rounded-xl border border-border bg-bg-surface p-3 text-xs text-txt-secondary shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      style={{ width: 'min(390px, calc(100% - 24px))' }}
      aria-label={`Chỉ số cảm biến ${device.code}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xs font-bold text-primary-700 dark:text-primary-300">IoT GATEWAY · REALTIME</p>
          <h3 className="mt-1 text-sm font-bold text-txt-primary dark:text-white">{device.code}</h3>
          <p className="mt-1 text-2xs text-txt-muted">
            {asset.asset_name}
            {asset.location ? ` · ${asset.location}` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="Đóng chỉ số cảm biến"
          className="rounded p-1 hover:bg-bg-subtle focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <p className="flex items-center gap-2 text-2xs font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: IOT_PIN_COLORS[status] }} />
        {IOT_PIN_LABELS[status]} · {points.length} chỉ số
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {points.map((p) => {
          const sample = stream.frame.readings[p.point_id];
          const itemState = stateOf(p);
          return (
            <button
              key={p.point_id}
              type="button"
              aria-pressed={p.point_id === point.point_id}
              onClick={() => setPointId(p.point_id)}
              className={`rounded-lg border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${p.point_id === point.point_id ? 'border-primary-600 bg-primary-50 dark:border-primary-400 dark:bg-slate-800' : 'border-border bg-bg-subtle hover:border-primary-500 dark:border-slate-700 dark:bg-slate-800'}`}
            >
              <span className="block text-2xs text-txt-muted">{p.name}</span>
              <span className="my-1 block text-sm font-bold tabular-nums">
                {!sample ? 'Chưa có số đo' : sample.quality === 'bad' ? 'Không hợp lệ' : valueLabel(sample.value, p)}
              </span>
              <span
                className={`block text-3xs ${itemState === 'exceeded' ? 'text-amber-800 dark:text-amber-300' : itemState === 'bad' ? 'text-purple-700 dark:text-purple-300' : 'text-txt-muted'}`}
              >
                {LIVE_STATE_LABELS[itemState]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-border pt-2 dark:border-slate-700">
        <h4 className="font-semibold">{point.name}</h4>
        <p className="mt-1 text-2xs tabular-nums text-txt-muted">
          {reading
            ? `Đo ${formatDate(new Date(reading.observedAt))} ${liveClock(reading.observedAt)} · ${Math.max(0, Math.floor((stream.now - reading.observedAt) / 1000))} giây trước`
            : 'Chưa nhận số đo từ gateway'}
        </p>
      </div>
      {rows.some((r) => r.value !== null) ? (
        <BimIotLineChart
          rows={rows}
          label={`Biểu đồ trực tiếp ${point.name}; ${LIVE_STATE_LABELS[state]}`}
          y={point.value_type === 'boolean' ? [0, 1] : undefined}
          threshold={rule?.threshold}
          step={point.value_type === 'boolean'}
          color={IOT_PIN_COLORS[status]}
          heightClass="h-36"
          formatX={liveClock}
          formatY={(v) => (point.value_type === 'boolean' ? String(v) : numberLabel(v))}
          formatValue={(v) => valueLabel(point.value_type === 'boolean' ? !!v : v, point)}
        />
      ) : (
        <p className="rounded-lg bg-bg-subtle p-3 text-center text-2xs text-txt-muted dark:bg-slate-800">
          Chưa có số đo hợp lệ từ khi mở dashboard (không thay bằng 0).
        </p>
      )}
      {rule?.threshold != null && (
        <p className="text-2xs leading-relaxed text-txt-muted">
          {point.value_type === 'boolean'
            ? `Điều kiện: ${valueLabel(true, point)}`
            : `Ngưỡng vận hành ${rule.operator === 'lt' ? '<' : '>'} ${numberLabel(rule.threshold)} ${unitLabel(point.unit)}`}
          . Màu vượt ngưỡng cập nhật tức thời; cảnh báo lưu còn phụ thuộc thời gian duy trì.
        </p>
      )}
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-2xs font-semibold text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        onClick={() => onExpand(point)}
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Mở biểu đồ lớn
      </button>
      <p className="text-3xs leading-relaxed text-txt-muted">
        {asset.bim_anchor_note ?? 'Vị trí thiết bị được tham chiếu từ cấu kiện BIM.'} Biểu đồ dùng cùng luồng với
        dashboard.
      </p>
    </section>
  );
}
