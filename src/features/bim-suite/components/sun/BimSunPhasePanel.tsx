import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G6: ảnh hưởng nắng tới khối bối cảnh (nhà lân cận, mặt đất) theo các mốc tiến độ dự án.
// Vật cản tại mốc = khối bối cảnh + cấu kiện đã xong đến mốc theo liên kết tiến độ; cấu kiện chưa gắn tiến độ tính xong ở mốc cuối.
import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, Sun, Trash2, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../../viewer/types';
import { BimSunService } from '../../services/BimSunService';
import { SUN_DATE_PRESETS, daySteps } from '../../lib/sun/solar';
import {
  LOST_RAMP,
  NO_LOSS_COLOR,
  lostClass,
  milestonesFromDates,
  phaseStats,
  stageOf,
  type Milestone,
  type PhaseStat,
} from '../../lib/sun/phaseSun';
import { runPhaseWorker } from '../../lib/sun/phaseWorkerTypes';

const NO_MODELS: BimModel[] = [];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number, d = 1) => formatNumber(v, d);
const dmy = (d: string) => d.split('-').reverse().join('/');
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const hexRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const LOST_RGB = LOST_RAMP.map(hexRgb);
const NO_LOSS_RGB = hexRgb(NO_LOSS_COLOR);
const BAR = '#2a78d6';
const LEGEND = [
  { c: NO_LOSS_COLOR, label: 'Không mất (< 15 phút)' },
  { c: LOST_RAMP[0], label: 'Mất dưới 1 giờ' },
  { c: LOST_RAMP[1], label: 'Mất 1–2 giờ' },
  { c: LOST_RAMP[2], label: 'Mất 2–3 giờ' },
  { c: LOST_RAMP[3], label: 'Mất từ 3 giờ' },
];

interface PhaseResult {
  points: Float32Array;
  count: number;
  step: number;
  base: Float32Array;
  hours: Float32Array;
  milestones: Milestone[];
  totalBuilding: number;
  unlinked: number;
  contextItems: number;
  baseMean: number;
  stats: PhaseStat[];
  seconds: number;
  params: { date: string; location: string | null };
}

export const BimSunPhasePanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  models?: BimModel[];
  className?: string;
}> = ({ projectId, viewerRef, models = NO_MODELS, className = '' }) => {
  const { addToast } = useToast();
  const [date, setDate] = useState(() => `${new Date().getFullYear()}-12-21`);
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PhaseResult | null>(null);
  const [shown, setShown] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      cancelRef.current?.();
      viewerRef.current?.setSunOverlay(null);
    },
    [viewerRef],
  );

  const run = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    cancelledRef.current = false;
    const started = performance.now();
    try {
      setBusy('Đang đọc tiến độ dự án…');
      const [loc, finish] = await Promise.all([
        BimSunService.resolveLocation(projectId, models),
        BimSunService.elementFinishDates(projectId),
      ]);
      if (!finish.size) throw new Error('Chưa có cấu kiện nào gắn công việc trong tiến độ dự án để chia mốc.');
      setBusy('Đang đọc hình học mô hình…');
      const obs = await viewer.getSunObstacles({
        onProgress: (d, t) => setBusy(`Đọc hình học ${fmt(d, 0)}/${fmt(t, 0)} cấu kiện…`),
        isCancelled: () => cancelledRef.current,
      });
      if (cancelledRef.current) return;
      if (!obs.box || !obs.parts.length) throw new Error('Chưa có mô hình nào đang hiện để phân tích.');

      // Ngày xong của từng phần hình học công trình: GlobalId của liên kết tiến độ → mã cục bộ trong trình xem
      const dateByLocal = new Map<string, string>();
      const guidsByModel = new Map<string, string[]>();
      for (const k of finish.keys()) {
        const [m, g] = k.split('|');
        guidsByModel.set(m, [...(guidsByModel.get(m) ?? []), g]);
      }
      for (const [m, guids] of guidsByModel) {
        if (!obs.meta.some((x) => x.modelId === m)) continue;
        const ids = await viewer.mapGuidsToIds(m, guids);
        ids.forEach((id, i) => {
          if (id !== null) dateByLocal.set(`${m}|${id}`, finish.get(`${m}|${guids[i]}`)!);
        });
      }
      const contextParts: Float32Array[] = [];
      const buildingParts: Float32Array[] = [];
      const buildingDates: (string | null)[] = [];
      obs.parts.forEach((p, i) => {
        const meta = obs.meta[i];
        if (meta.context) contextParts.push(p);
        else {
          buildingParts.push(p);
          buildingDates.push(dateByLocal.get(`${meta.modelId}|${meta.localId}`) ?? null);
        }
      });
      if (!contextParts.length)
        throw new Error('Mô hình đang mở không có khối bối cảnh (nhà lân cận, mặt đất) để đánh giá ảnh hưởng.');
      const milestones = milestonesFromDates(
        buildingDates.filter((d): d is string => !!d),
        count,
      );
      if (!milestones.length) throw new Error('Các cấu kiện đang hiện chưa gắn tiến độ.');
      const stages = buildingDates.map((d) => stageOf(d, milestones));
      const unlinked = buildingDates.filter((d) => !d).length;
      const built = milestones.map((_, m) => stages.filter((s) => s <= m).length);

      const steps = daySteps(date, 6, 18, 30, loc.lat, loc.lon, loc.north);
      const contextItems = contextParts.length;
      await new Promise<void>((resolve, reject) => {
        cancelRef.current = runPhaseWorker(
          {
            contextParts,
            buildingParts,
            buildingStages: stages,
            stageCount: milestones.length,
            box: obs.box!,
            step: 4,
            maxPoints: 8_000,
            dirs: steps.map((s) => s.dir),
            stepHours: 0.5,
          },
          (msg) => {
            if (msg.type === 'progress') {
              setBusy(
                msg.phase === 'bvh'
                  ? 'Đang dựng cây BVH…'
                  : msg.phase === 'grid'
                    ? 'Đang lấy mẫu khối bối cảnh…'
                    : `Dò tia ${Math.round((msg.done / Math.max(msg.total, 1)) * 100)}%…`,
              );
              return;
            }
            cancelRef.current = null;
            if (msg.type === 'error') return reject(new Error(msg.message));
            const st = phaseStats({ base: msg.base, hours: msg.hours, stages: milestones.length }, msg.count);
            setResult({
              points: msg.points,
              count: msg.count,
              step: msg.step,
              base: msg.base,
              hours: msg.hours,
              milestones: milestones.map((m, i) => ({ ...m, built: built[i] })),
              totalBuilding: buildingParts.length,
              unlinked,
              contextItems,
              baseMean: st.baseMean,
              stats: st.stages,
              seconds: (performance.now() - started) / 1000,
              params: { date, location: loc.source === 'du_an' ? null : loc.label },
            });
            setShown(milestones.length - 1);
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

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !result) return;
    const colors = new Float32Array(result.count * 3);
    for (let p = 0; p < result.count; p++) {
      const k = lostClass(result.base[p] - result.hours[shown * result.count + p]);
      colors.set(k < 0 ? NO_LOSS_RGB : LOST_RGB[k], p * 3);
    }
    viewer.setSunOverlay({ points: result.points, colors, count: result.count, cell: result.step });
  }, [result, shown, viewerRef]);

  const maxLost = result ? Math.max(0.01, ...result.stats.map((s) => s.lost)) : 1;
  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-txt-secondary dark:text-slate-200 ${className}`}
      aria-label="Nắng theo tiến độ thi công"
    >
      <div className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
        <CalendarClock className="h-4 w-4 text-orange-600" aria-hidden /> Ảnh hưởng nắng theo tiến độ
      </div>
      <p className="text-2xs text-txt-muted">
        Giờ nắng trên mái, sân của khối bối cảnh khi công trình lên dần theo liên kết tiến độ dự án, so với trước khi
        xây.
      </p>
      <section className="space-y-1.5 rounded-xl border border-border p-2 dark:border-slate-700">
        <label className="block text-2xs font-semibold">
          Ngày đánh giá
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
        <label className="block text-2xs">
          Số mốc tiến độ
          <BimSelect className={field} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} mốc
              </option>
            ))}
          </BimSelect>
        </label>
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
              <Sun className="h-3.5 w-3.5" aria-hidden /> {result ? 'Tính lại' : 'Tính theo các mốc'}
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
          aria-label="Kết quả theo mốc"
        >
          <p className="text-2xs">
            Trước khi xây: trung bình <b className="tabular-nums">{fmt(result.baseMean, 2)} giờ</b> nắng (6:00–18:00).
          </p>
          <BimTable className="w-full text-2xs">
            <caption className="sr-only">Giờ nắng mất theo mốc tiến độ</caption>
            <thead>
              <tr className="text-left text-2xs text-txt-muted">
                <th className="font-normal">Mốc</th>
                <th className="font-normal">Đã xây</th>
                <th className="font-normal">Giờ mất TB</th>
                <th className="text-right font-normal">Mất ≥ 1 giờ</th>
              </tr>
            </thead>
            <tbody>
              {result.milestones.map((m, i) => {
                const s = result.stats[i];
                return (
                  <tr
                    key={m.date}
                    aria-selected={shown === i}
                    onClick={() => setShown(i)}
                    className={`cursor-pointer ${shown === i ? 'bg-orange-50 dark:bg-orange-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    data-tooltip={`Xem lớp phủ đến ${dmy(m.date)}`}
                  >
                    <td className="py-0.5 tabular-nums">{dmy(m.date)}</td>
                    <td className="tabular-nums">{fmt((m.built / Math.max(result.totalBuilding, 1)) * 100, 0)}%</td>
                    <td className="pr-1">
                      <span className="flex items-center gap-1">
                        <span
                          className="h-2 rounded-r"
                          style={{ width: `${Math.max(2, (s.lost / maxLost) * 48)}px`, background: BAR }}
                          aria-hidden
                        />
                        <span className="tabular-nums">{fmt(s.lost, 2)} giờ</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{fmt(s.lost1h)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </BimTable>
          <ul className="space-y-0.5" aria-label="Chú giải giờ nắng mất">
            {LEGEND.map((l) => (
              <li key={l.c} className="flex items-center gap-1.5 text-2xs">
                <span className="h-3 w-5 rounded-sm" style={{ background: l.c }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
          <p className="text-2xs leading-snug text-txt-muted">
            Lớp phủ: mốc {dmy(result.milestones[shown].date)}. Ngày {dmy(result.params.date)}, bước 30 phút, lưới{' '}
            {fmt(result.step)} m, {fmt(result.count, 0)} điểm trên khối bối cảnh ({fmt(result.contextItems, 0)} khối).
            Mốc chia đều theo thời gian từ ngày xong sớm nhất tới muộn nhất (ngày thực tế, thiếu thì ngày kế hoạch).
            {result.unlinked > 0 &&
              ` ${fmt(result.unlinked, 0)}/${fmt(result.totalBuilding, 0)} cấu kiện chưa gắn tiến độ, tính là xong ở mốc cuối.`}
            {result.params.location && ` Vị trí: ${result.params.location}.`} Tính trong {fmt(result.seconds)} giây.
            Phân tích sơ bộ, chưa tính mặt đứng nhà lân cận.
          </p>
        </section>
      )}
    </div>
  );
};
