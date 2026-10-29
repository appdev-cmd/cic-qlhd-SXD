import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// F1: phân tích nắng và bóng đổ trên mô hình.
// Giờ nắng trên bề mặt trên cùng (sân, mái) theo ngày chọn; vật cản là tam giác thật của mọi cấu kiện đang hiện, kể cả khối bối cảnh.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Pause, Play, Sun, Trash2, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../../viewer/types';
import { BimSunService, type ProjectLocation } from '../../services/BimSunService';
import {
  SUN_DATE_PRESETS,
  daySteps,
  formatHour,
  resolveSiteLocation,
  type LocationSource,
  type SunStep,
} from '../../lib/sun/solar';
import {
  LIT_COLOR,
  SHADE_COLOR,
  SUN_RAMP,
  hourClass,
  sunStats,
  type SampleGrid,
  type SunStats,
} from '../../lib/sun/sunHours';
import { runSunWorker } from '../../lib/sun/sunWorkerTypes';

const NO_MODELS: BimModel[] = [];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number, d = 1) => formatNumber(v, d);
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const hexRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const RAMP_RGB = SUN_RAMP.map(hexRgb);
const LIT_RGB = hexRgb(LIT_COLOR);
const SHADE_RGB = hexRgb(SHADE_COLOR);
const todayVn = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

interface SunResult {
  grid: SampleGrid;
  lit: Uint8Array;
  hours: Float32Array;
  steps: SunStep[];
  stats: SunStats;
  maxHours: number;
  items: number;
  triangles: number;
  seconds: number;
  params: {
    date: string;
    from: number;
    to: number;
    stepMin: number;
    lat: number;
    lon: number;
    north: number;
    source: LocationSource;
    label: string;
  };
}

export const BimSunPanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  models?: BimModel[];
  canEdit: boolean;
  className?: string;
}> = ({ projectId, viewerRef, models = NO_MODELS, canEdit, className = '' }) => {
  const { addToast } = useToast();
  const [location, setLocation] = useState<ProjectLocation | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [editLoc, setEditLoc] = useState<{ lat: string; lon: string; north: string } | null>(null);
  const [date, setDate] = useState(todayVn);
  const [from, setFrom] = useState(6);
  const [to, setTo] = useState(18);
  const [stepMin, setStepMin] = useState(30);
  const [cell, setCell] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<SunResult | null>(null);
  const [mode, setMode] = useState<'gio_nang' | 'bong_do'>('gio_nang');
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let alive = true;
    BimSunService.getLocation(projectId).then(
      (l) => alive && setLocation(l),
      (e) => alive && setLocError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);
  // Rời panel thì xóa lớp phủ và dừng tính
  useEffect(
    () => () => {
      cancelRef.current?.();
      viewerRef.current?.setSunOverlay(null);
    },
    [viewerRef],
  );

  const site = useMemo(() => resolveSiteLocation(location, models), [location, models]);
  const { lat, lon, north } = site;
  const year = date.slice(0, 4);

  const run = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    cancelledRef.current = false;
    const started = performance.now();
    try {
      setBusy('Đang đọc hình học mô hình…');
      const obstacles = await viewer.getSunObstacles({
        onProgress: (d, t) => setBusy(`Đọc hình học ${fmt(d, 0)}/${fmt(t, 0)} cấu kiện…`),
        isCancelled: () => cancelledRef.current,
      });
      if (cancelledRef.current) return;
      if (!obstacles.box || !obstacles.parts.length) throw new Error('Chưa có mô hình nào đang hiện để phân tích.');
      const steps = daySteps(date, from, to, stepMin, lat, lon, north);
      if (!steps.some((s) => s.dir)) throw new Error('Mặt trời dưới chân trời trong cả khung giờ đã chọn.');
      const stepHours = stepMin / 60;
      const items = obstacles.items;
      await new Promise<void>((resolve, reject) => {
        cancelRef.current = runSunWorker(
          {
            parts: obstacles.parts,
            box: obstacles.box!,
            step: cell,
            maxPoints: 25_000,
            dirs: steps.map((s) => s.dir),
            stepHours,
          },
          (msg) => {
            if (msg.type === 'progress') {
              setBusy(
                msg.phase === 'bvh'
                  ? 'Đang dựng cây BVH…'
                  : msg.phase === 'grid'
                    ? 'Đang lấy mẫu bề mặt…'
                    : `Dò tia ${Math.round((msg.done / Math.max(msg.total, 1)) * 100)}%…`,
              );
              return;
            }
            cancelRef.current = null;
            if (msg.type === 'error') return reject(new Error(msg.message));
            const grid: SampleGrid = { points: msg.points, count: msg.count, step: msg.step, groundY: msg.groundY };
            const lightSteps = steps.filter((s) => s.dir).length;
            setResult({
              grid,
              lit: msg.lit,
              hours: msg.hours,
              steps,
              stats: sunStats(msg.hours, grid),
              maxHours: lightSteps * stepHours,
              items,
              triangles: msg.triangles,
              seconds: (performance.now() - started) / 1000,
              params: { date, from, to, stepMin, lat, lon, north, source: site.source, label: site.label },
            });
            setStepIndex(
              Math.max(
                0,
                steps.findIndex((s) => Math.abs(s.hour - 12) < stepHours / 2 + 1e-6),
              ),
            );
            resolve();
          },
        );
      });
    } catch (e) {
      if (!cancelledRef.current) addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const cancel = () => {
    cancelledRef.current = true;
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(null);
  };

  // Vẽ lớp phủ theo chế độ
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !result) return;
    const { grid, hours, lit, steps, maxHours } = result;
    const colors = new Float32Array(grid.count * 3);
    const s = Math.min(stepIndex, steps.length - 1);
    for (let p = 0; p < grid.count; p++) {
      const rgb =
        mode === 'gio_nang' ? RAMP_RGB[hourClass(hours[p], maxHours)] : lit[s * grid.count + p] ? LIT_RGB : SHADE_RGB;
      colors.set(rgb, p * 3);
    }
    viewer.setSunOverlay({
      points: grid.points,
      colors,
      count: grid.count,
      cell: grid.step,
      sun: mode === 'bong_do' ? (steps[s]?.dir ?? null) : null,
    });
  }, [result, mode, stepIndex, viewerRef]);

  useEffect(() => {
    if (!playing || !result) return;
    const t = setInterval(() => setStepIndex((i) => (i + 1) % result.steps.length), 700);
    return () => clearInterval(t);
  }, [playing, result]);

  const clear = () => {
    setPlaying(false);
    setResult(null);
    viewerRef.current?.setSunOverlay(null);
  };
  const saveLoc = async () => {
    if (!editLoc) return;
    const loc = { vi_do: Number(editLoc.lat), kinh_do: Number(editLoc.lon), goc_bac_thuc: Number(editLoc.north || 0) };
    if (
      !Number.isFinite(loc.vi_do) ||
      Math.abs(loc.vi_do) > 90 ||
      !Number.isFinite(loc.kinh_do) ||
      Math.abs(loc.kinh_do) > 180 ||
      !Number.isFinite(loc.goc_bac_thuc)
    ) {
      return addToast({ type: 'error', message: 'Vĩ độ −90…90, kinh độ −180…180, góc Bắc là số độ.' });
    }
    try {
      await BimSunService.saveLocation(projectId, loc);
      setLocation(loc);
      setEditLoc(null);
      addToast({ type: 'success', message: 'Đã lưu vị trí dự án.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };

  const legend = useMemo(() => {
    if (!result) return [];
    const m = result.maxHours;
    return SUN_RAMP.map((c, i) => ({
      c,
      label:
        i === SUN_RAMP.length - 1
          ? `≥ ${fmt((m * i) / SUN_RAMP.length)} giờ`
          : `${fmt((m * i) / SUN_RAMP.length)}–${fmt((m * (i + 1)) / SUN_RAMP.length)} giờ`,
    }));
  }, [result]);
  const current = result?.steps[Math.min(stepIndex, (result?.steps.length ?? 1) - 1)];

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-txt-secondary dark:text-slate-200 ${className}`}
      aria-label="Phân tích nắng"
    >
      <div className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
        <Sun className="h-4 w-4 text-orange-600" aria-hidden /> Phân tích nắng và bóng đổ
      </div>

      <section className="rounded-xl border border-border p-2 dark:border-slate-700">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {fmt(lat, 4)}° B, {fmt(lon, 4)}° Đ{north ? ` · Bắc thật ${fmt(north)}°` : ''}
              <span className="block text-2xs text-txt-muted">{site.label}</span>
            </span>
          </div>
          {canEdit && !editLoc && (
            <button
              type="button"
              className={btn}
              onClick={() => setEditLoc({ lat: String(lat), lon: String(lon), north: String(north) })}
            >
              Sửa
            </button>
          )}
        </div>
        {site.source === 'mac_dinh' && (
          <p className="mt-1 text-2xs text-amber-700 dark:text-amber-300">
            Dự án chưa có vị trí và mô hình không có toạ độ IfcSite: đang giả định vị trí Hà Nội, kết quả chỉ để tham
            khảo.
          </p>
        )}
        {locError && <p className="mt-1 text-2xs text-amber-700 dark:text-amber-300">{locError}</p>}
        {editLoc && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            <label className="text-2xs">
              Vĩ độ
              <BimInput
                className={field}
                inputMode="decimal"
                value={editLoc.lat}
                onChange={(e) => setEditLoc({ ...editLoc, lat: e.target.value })}
              />
            </label>
            <label className="text-2xs">
              Kinh độ
              <BimInput
                className={field}
                inputMode="decimal"
                value={editLoc.lon}
                onChange={(e) => setEditLoc({ ...editLoc, lon: e.target.value })}
              />
            </label>
            <label className="text-2xs" data-tooltip="Góc từ hướng −Z của trình xem tới Bắc thật, theo chiều kim đồng hồ">
              Bắc thật (°)
              <BimInput
                className={field}
                inputMode="decimal"
                value={editLoc.north}
                onChange={(e) => setEditLoc({ ...editLoc, north: e.target.value })}
              />
            </label>
            <div className="col-span-3 flex justify-end gap-1">
              <button type="button" className={btn} onClick={() => setEditLoc(null)}>
                Hủy
              </button>
              <button type="button" className={btn} onClick={() => void saveLoc()}>
                Lưu vị trí
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-1.5 rounded-xl border border-border p-2 dark:border-slate-700">
        <label className="block text-2xs font-semibold">
          Ngày
          <BimInput
            type="date"
            className={`${field} mt-0.5`}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {SUN_DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`${btn} ${date.slice(5) === p.md ? 'border-orange-400 text-orange-700 dark:text-orange-300' : ''}`}
              onClick={() => setDate(`${year}-${p.md}`)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1">
          <label className="text-2xs">
            Từ
            <BimSelect className={field} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 4).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="text-2xs">
            Đến
            <BimSelect className={field} value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {Array.from({ length: 9 }, (_, i) => i + 12).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="text-2xs">
            Bước
            <BimSelect className={field} value={stepMin} onChange={(e) => setStepMin(Number(e.target.value))}>
              {[15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} phút
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="text-2xs">
            Lưới
            <BimSelect className={field} value={cell} onChange={(e) => setCell(Number(e.target.value))}>
              {[2, 4, 8].map((m) => (
                <option key={m} value={m}>
                  {m} m
                </option>
              ))}
            </BimSelect>
          </label>
        </div>
        <div className="flex gap-1">
          {busy ? (
            <>
              <span className="flex-1 self-center text-2xs text-txt-muted" role="status">
                {busy}
              </span>
              <button type="button" className={btn} onClick={cancel}>
                <X className="h-3 w-3" aria-hidden /> Dừng
              </button>
            </>
          ) : (
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-600 px-2 py-1.5 text-2xs font-bold text-white hover:bg-orange-700 disabled:opacity-40 dark:bg-orange-600"
              disabled={from >= to}
              onClick={() => void run()}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden /> {result ? 'Tính lại' : 'Tính giờ nắng'}
            </button>
          )}
          {result && !busy && (
            <button type="button" className={btn} onClick={clear} data-tooltip="Xóa lớp phủ">
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      </section>

      {result && (
        <section
          className="space-y-2 rounded-xl border border-border p-2 dark:border-slate-700"
          aria-label="Kết quả phân tích nắng"
        >
          <div role="tablist" className="flex gap-1">
            {(['gio_nang', 'bong_do'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                className={`${btn} flex-1 justify-center ${mode === m ? 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200' : ''}`}
                onClick={() => {
                  setMode(m);
                  setPlaying(false);
                }}
              >
                {m === 'gio_nang' ? 'Giờ nắng' : 'Bóng đổ'}
              </button>
            ))}
          </div>

          {mode === 'gio_nang' ? (
            <ul className="space-y-0.5" aria-label="Chú giải giờ nắng">
              {legend.map((l) => (
                <li key={l.c} className="flex items-center gap-1.5 text-2xs">
                  <span className="h-3 w-5 rounded-sm" style={{ background: l.c }} aria-hidden />
                  {l.label}
                </li>
              ))}
            </ul>
          ) : (
            current && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? 'Tạm dừng' : 'Chạy cả ngày'}
                  >
                    {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <BimInput
                    type="range"
                    className="flex-1 accent-orange-600"
                    min={0}
                    max={result.steps.length - 1}
                    value={Math.min(stepIndex, result.steps.length - 1)}
                    onChange={(e) => {
                      setPlaying(false);
                      setStepIndex(Number(e.target.value));
                    }}
                    aria-label="Thời điểm"
                  />
                  <span className="w-11 text-right font-mono tabular-nums">{formatHour(current.hour)}</span>
                </div>
                <p className="text-2xs text-txt-muted">
                  {current.dir
                    ? `Mặt trời cao ${fmt(current.altitude)}°, phương vị ${fmt(current.azimuth, 0)}°`
                    : 'Mặt trời dưới chân trời'}
                </p>
                <div className="flex gap-3 text-2xs">
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm" style={{ background: LIT_COLOR }} aria-hidden /> Có nắng
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm" style={{ background: SHADE_COLOR }} aria-hidden /> Trong bóng
                  </span>
                </div>
              </div>
            )
          )}

          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-2xs">
            <dt className="text-txt-muted">Giờ nắng trung bình</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.stats.mean, 2)} giờ</dd>
            <dt className="text-txt-muted">Diện tích ≥ 2 giờ nắng</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.stats.atLeast2h)}%</dd>
            <dt className="text-txt-muted">Diện tích ≥ 4 giờ nắng</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.stats.atLeast4h)}%</dd>
            <dt className="text-txt-muted">Ô mặt đất / mái</dt>
            <dd className="text-right font-mono tabular-nums">
              {fmt(result.stats.groundCells, 0)} / {fmt(result.stats.roofCells, 0)}
            </dd>
          </dl>
          <p className="text-2xs leading-snug text-txt-muted">
            Ngày {result.params.date.split('-').reverse().join('/')}, {result.params.from}:00–{result.params.to}:00,
            bước {result.params.stepMin} phút, lưới {fmt(result.grid.step)} m. Vật cản: {fmt(result.items, 0)} cấu kiện
            ({fmt(result.triangles, 0)} tam giác), gồm khối bối cảnh. Tính trong {fmt(result.seconds)} giây.
            {result.params.source !== 'du_an' && ` Vị trí: ${result.params.label}.`} Phân tích sơ bộ trên bề mặt trên
            cùng (sân, mái), không thay mô phỏng đạt chuẩn; chưa tính mặt đứng.
          </p>
        </section>
      )}
    </div>
  );
};
