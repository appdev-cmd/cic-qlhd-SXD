import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G9: mặt đứng và mái: giờ nắng, ánh sáng bầu trời (gần đúng VSC), bức xạ mặt trời, tiềm năng điện mặt trời trên mái.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileUp, Sun, Trash2, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../../viewer/types';
import { BimSunService } from '../../services/BimSunService';
import { SUN_DATE_PRESETS } from '../../lib/sun/solar';
import { SUN_RAMP } from '../../lib/sun/sunHours';
import { LOST_RAMP } from '../../lib/sun/phaseSun';
import {
  PV_ASSUMPTION,
  orientationStats,
  parseEpw,
  roofPv,
  type EpwData,
  type OrientationStat,
} from '../../lib/sun/facade';
import { runFacadeWorker } from '../../lib/sun/facadeWorkerTypes';

const NO_MODELS: BimModel[] = [];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number, d = 1) => formatNumber(v, d);
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const hexRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
type Mode = 'gio_nang' | 'bau_troi' | 'buc_xa';
/** Ngưỡng VSC: 27% là mức tham khảo hay dùng (hướng dẫn BRE về ánh sáng ban ngày), không phải quy chuẩn Việt Nam. */
const VSC_CLASSES = [
  { max: 15, label: 'Dưới 15%' },
  { max: 27, label: '15–27%' },
  { max: 35, label: '27–35%' },
  { max: Infinity, label: 'Từ 35%' },
];

interface FacadeResult {
  points: Float32Array;
  normals: Float32Array;
  area: Float32Array;
  kind: Uint8Array;
  count: number;
  vsc: Float32Array;
  svf: Float32Array;
  hours: Float32Array;
  irradiation: Float32Array;
  annual: Float32Array | null;
  stats: OrientationStat[];
  maxHours: number;
  maxIrr: number;
  triangles: number;
  seconds: number;
  params: { date: string; location: string | null; epw: string | null };
}

export const BimFacadePanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  models?: BimModel[];
  className?: string;
}> = ({ projectId, viewerRef, models = NO_MODELS, className = '' }) => {
  const { addToast } = useToast();
  const [date, setDate] = useState(() => `${new Date().getFullYear()}-12-22`);
  const [cell, setCell] = useState(4);
  const [annual, setAnnual] = useState(true);
  const [epw, setEpw] = useState<EpwData | null>(null);
  const [mode, setMode] = useState<Mode>('gio_nang');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<FacadeResult | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      cancelRef.current?.();
      viewerRef.current?.setSunOverlay(null);
    },
    [viewerRef],
  );

  const loadEpw = async (file: File | undefined) => {
    if (!file) return;
    try {
      const d = parseEpw(await file.text());
      setEpw(d);
      addToast({
        type: 'success',
        message: `Đã nạp dữ liệu khí hậu ${d.location}${d.source ? ` (${d.source})` : ''}.`,
      });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };

  const run = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    cancelledRef.current = false;
    const started = performance.now();
    try {
      setBusy('Đang đọc hình học mô hình…');
      const loc = await BimSunService.resolveLocation(projectId, models);
      const obs = await viewer.getSunObstacles({
        onProgress: (d, t) => setBusy(`Đọc hình học ${fmt(d, 0)}/${fmt(t, 0)} cấu kiện…`),
        isCancelled: () => cancelledRef.current,
      });
      if (cancelledRef.current) return;
      if (!obs.box || !obs.parts.length) throw new Error('Chưa có mô hình nào đang hiện để phân tích.');
      const buildingParts = obs.parts.filter((_, i) => !obs.meta[i]?.context);
      if (!buildingParts.length) throw new Error('Chỉ có khối bối cảnh, không có công trình để lấy mặt đứng.');
      const { lat, lon, north } = loc;
      await new Promise<void>((resolve, reject) => {
        cancelRef.current = runFacadeWorker(
          {
            obstacleParts: obs.parts,
            buildingParts,
            box: obs.box!,
            step: cell,
            maxPoints: 8_000,
            date,
            lat,
            lon,
            north,
            stepMinutes: 30,
            hourWindow: [6, 18],
            epw,
            annual,
          },
          (msg) => {
            if (msg.type === 'progress') {
              const label = {
                bvh: 'Đang dựng cây BVH…',
                mau: 'Đang lấy mẫu mặt đứng, mái…',
                bau_troi: 'Đang dò tia vòm trời…',
                nang: 'Đang tính giờ nắng, bức xạ…',
                nam: `Ước tính năm: tháng ${msg.done + 1}/12…`,
              }[msg.phase];
              setBusy(label);
              return;
            }
            cancelRef.current = null;
            if (msg.type === 'error') return reject(new Error(msg.message));
            const s = { points: msg.points, normals: msg.normals, area: msg.area, kind: msg.kind, count: msg.count };
            const stats = orientationStats(
              s,
              { hours: msg.hours, irradiation: msg.irradiation },
              { vsc: msg.vsc, svf: msg.svf },
              north,
            );
            let maxH = 0,
              maxI = 0;
            for (let p = 0; p < msg.count; p++) {
              maxH = Math.max(maxH, msg.hours[p]);
              maxI = Math.max(maxI, msg.irradiation[p]);
            }
            setResult({
              ...s,
              vsc: msg.vsc,
              svf: msg.svf,
              hours: msg.hours,
              irradiation: msg.irradiation,
              annual: msg.annual,
              stats,
              maxHours: maxH,
              maxIrr: maxI,
              triangles: msg.triangles,
              seconds: (performance.now() - started) / 1000,
              params: {
                date,
                location: loc.source === 'du_an' ? null : loc.label,
                epw: epw ? `${epw.location}${epw.source ? ` · ${epw.source}` : ''}` : null,
              },
            });
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
  const clear = () => {
    setResult(null);
    viewerRef.current?.setSunOverlay(null);
  };

  const classOf = useMemo(() => {
    if (!result) return null;
    if (mode === 'bau_troi') return (p: number) => VSC_CLASSES.findIndex((c) => result.vsc[p] < c.max);
    const max = mode === 'gio_nang' ? result.maxHours : result.maxIrr;
    const v = mode === 'gio_nang' ? result.hours : result.irradiation;
    return (p: number) => (max <= 0 ? 0 : Math.min(SUN_RAMP.length - 1, Math.floor((v[p] / max) * SUN_RAMP.length)));
  }, [result, mode]);
  const ramp = mode === 'bau_troi' ? LOST_RAMP : SUN_RAMP;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !result || !classOf) return;
    const rgb = ramp.map(hexRgb);
    const colors = new Float32Array(result.count * 3);
    for (let p = 0; p < result.count; p++) colors.set(rgb[classOf(p)], p * 3);
    viewer.setSunOverlay({
      points: result.points,
      colors,
      count: result.count,
      cell: cell * 0.9,
      normals: result.normals,
    });
  }, [result, classOf, ramp, cell, viewerRef]);

  const legend = useMemo(() => {
    if (!result) return [];
    if (mode === 'bau_troi') return VSC_CLASSES.map((c, i) => ({ c: LOST_RAMP[i], label: c.label }));
    const max = mode === 'gio_nang' ? result.maxHours : result.maxIrr / 1000;
    const unit = mode === 'gio_nang' ? 'giờ' : 'kWh/m²';
    return SUN_RAMP.map((c, i) => ({
      c,
      label: `${fmt((max * i) / SUN_RAMP.length)}–${fmt((max * (i + 1)) / SUN_RAMP.length)} ${unit}`,
    }));
  }, [result, mode]);

  const roof = useMemo(() => {
    if (!result?.annual) return null;
    let a = 0,
      e = 0;
    for (let p = 0; p < result.count; p++)
      if (result.kind[p] === 1) {
        a += result.area[p];
        e += result.annual[p] * result.area[p];
      }
    if (!a) return null;
    return { area: a, perM2: e / a, ...roofPv(e / a, a) };
  }, [result]);

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-txt-secondary dark:text-slate-200 ${className}`}
      aria-label="Mặt đứng và mái"
    >
      <div className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
        <Building2 className="h-4 w-4 text-orange-600" aria-hidden /> Mặt đứng: nắng, bầu trời, bức xạ
      </div>
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
              onClick={() => setDate(`${date.slice(0, 4)}-${p.md}`)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
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
          <label className="flex items-end gap-1 pb-1 text-2xs">
            <BimInput type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} /> Ước tính năm cho
            mái
          </label>
        </div>
        <div className="flex items-center gap-1">
          <label className={`${btn} cursor-pointer`}>
            <FileUp className="h-3 w-3" aria-hidden /> Tệp khí hậu EPW
            <BimInput
              type="file"
              accept=".epw"
              className="hidden"
              onChange={(e) => {
                void loadEpw(e.target.files?.[0]);
                e.target.value = '';
              }}
              aria-label="Nạp tệp khí hậu EPW"
            />
          </label>
          <span className="min-w-0 flex-1 truncate text-2xs text-txt-muted">
            {epw ? `${epw.location}${epw.source ? ` · ${epw.source}` : ''}` : 'Chưa có: dùng mô hình trời quang'}
          </span>
          {epw && (
            <button
              type="button"
              className="text-slate-400 hover:text-rose-600"
              aria-label="Bỏ tệp khí hậu"
              onClick={() => setEpw(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-600 px-2 py-1.5 text-2xs font-bold text-white hover:bg-orange-700 dark:bg-orange-600"
              onClick={() => void run()}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden /> {result ? 'Tính lại' : 'Phân tích mặt đứng'}
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
          aria-label="Kết quả mặt đứng"
        >
          <div role="tablist" className="flex gap-1">
            {(
              [
                ['gio_nang', 'Giờ nắng'],
                ['bau_troi', 'Bầu trời'],
                ['buc_xa', 'Bức xạ'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                type="button"
                className={`${btn} flex-1 justify-center ${mode === k ? 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200' : ''}`}
                onClick={() => setMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="space-y-0.5" aria-label="Chú giải">
            {legend.map((l) => (
              <li key={l.c} className="flex items-center gap-1.5 text-2xs">
                <span className="h-3 w-5 rounded-sm" style={{ background: l.c }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
          {mode === 'bau_troi' && (
            <p className="text-2xs text-txt-muted">
              Tỷ lệ bầu trời nhìn thấy, gần đúng VSC (trời u ám CIE). Mặt đứng không bị che ≈ 40%; 27% là mức tham khảo
              hay dùng trong hướng dẫn BRE, không phải quy chuẩn Việt Nam.
            </p>
          )}
          <BimTable className="w-full text-2xs">
            <caption className="sr-only">Theo hướng</caption>
            <thead>
              <tr className="text-left text-2xs text-txt-muted">
                <th className="font-normal">Hướng</th>
                <th className="text-right font-normal">m²</th>
                <th className="text-right font-normal">Giờ nắng</th>
                <th className="text-right font-normal">VSC</th>
                <th className="text-right font-normal">kWh/m²·ngày</th>
              </tr>
            </thead>
            <tbody>
              {result.stats.map((s) => (
                <tr key={s.huong}>
                  <td>{s.huong}</td>
                  <td className="text-right tabular-nums">{fmt(s.dien_tich, 0)}</td>
                  <td className="text-right tabular-nums">{fmt(s.gio_nang, 1)}</td>
                  <td className="text-right tabular-nums">{s.vsc === null ? '—' : `${fmt(s.vsc, 0)}%`}</td>
                  <td className="text-right tabular-nums">{fmt(s.buc_xa / 1000, 2)}</td>
                </tr>
              ))}
            </tbody>
          </BimTable>
          {roof && (
            <div className="rounded-lg bg-slate-50 p-1.5 text-2xs dark:bg-slate-900">
              <b>Mái: {fmt(roof.perM2, 0)} kWh/m²·năm</b> trên {fmt(roof.area, 0)} m². Điện mặt trời ước tính{' '}
              {fmt(roof.kwh_nam / 1000, 0)} MWh/năm
              <span className="block text-2xs text-txt-muted">
                Giả định: lắp {Math.round(PV_ASSUMPTION.ty_le_lap * 100)}% diện tích mái ({fmt(roof.dien_tich_lap, 0)}{' '}
                m²), hiệu suất tấm {Math.round(PV_ASSUMPTION.hieu_suat * 100)}%, hệ số hệ thống{' '}
                {PV_ASSUMPTION.he_so_he_thong}; 12 ngày đại diện (ngày 21 mỗi tháng).
              </span>
            </div>
          )}
          <p className="text-2xs leading-snug text-txt-muted">
            Ngày {result.params.date.split('-').reverse().join('/')}, giờ nắng 6:00–18:00, {fmt(result.count, 0)} điểm (
            {fmt(result.triangles, 0)} tam giác vật cản, gồm khối bối cảnh). Tính trong {fmt(result.seconds)} giây. Bức
            xạ:{' '}
            {result.params.epw
              ? `tệp khí hậu ${result.params.epw}`
              : 'mô hình trời quang (Meinel, khuếch tán 10% trực xạ), cao hơn thực tế khi trời mây'}
            ; chưa tính phản xạ mặt đất.
            {result.params.location && ` Vị trí: ${result.params.location}.`} Ước tính sơ bộ, không thay mô phỏng năng
            lượng, chiếu sáng đạt chuẩn.
          </p>
        </section>
      )}
    </div>
  );
};
