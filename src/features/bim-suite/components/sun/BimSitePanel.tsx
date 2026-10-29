import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G1: chỉ số quy hoạch (diện tích sàn, chiếm đất, chiều cao, hệ số sử dụng đất, mật độ) và khái toán theo suất vốn người dùng nhập.
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, CircleHelp, Save, X, XCircle } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimViewerRef } from '../../viewer/types';
import {
  BimSiteService,
  EMPTY_PLANNING,
  type FloorAreaResult,
  type MetricsRun,
  type PlanningProfile,
} from '../../services/BimSiteService';
import { BimCostService } from '../../services/BimCostService';
import {
  approvedEstimateTotal,
  footprintFromGrid,
  planningMetrics,
  quickEstimate,
  type Footprint,
  type PlanningMetrics,
} from '../../lib/siteMetrics';
import { runSunWorker } from '../../lib/sun/sunWorkerTypes';
import type { SampleGrid } from '../../lib/sun/sunHours';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : formatNumber(Number(v), d);
const ty = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${fmt(v / 1e9, 1)} tỷ đồng`);
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const FOOT_RGB: [number, number, number] = [0x2a / 255, 0x78 / 255, 0xd6 / 255];
const NO_IDS: string[] = [];

interface SiteResult {
  floor: FloorAreaResult;
  floorError: string | null;
  foot: Footprint;
  grid: SampleGrid;
  metrics: PlanningMetrics;
  estimate: ReturnType<typeof quickEstimate>;
  approved: ReturnType<typeof approvedEstimateTotal>;
  items: number;
  excludedOutOfScope: number;
}

const CheckIcon: React.FC<{ ok: boolean | null }> = ({ ok }) =>
  ok === null ? (
    <CircleHelp className="h-3.5 w-3.5 text-slate-400" aria-label="Chưa đủ dữ liệu" />
  ) : ok ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Đạt" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-rose-600" aria-label="Vượt giới hạn" />
  );

export const BimSitePanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  /** Models loaded in the viewer; floor area covers these (all current models when empty). */
  loadedIds?: string[];
  canEdit: boolean;
  className?: string;
}> = ({ projectId, viewerRef, loadedIds = NO_IDS, canEdit, className = '' }) => {
  const { addToast } = useToast();
  const [plan, setPlan] = useState<PlanningProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanningProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [history, setHistory] = useState<MetricsRun[]>([]);
  const [showFloors, setShowFloors] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    BimSiteService.getPlanning(projectId).then(
      (p) => alive && setPlan(p ?? EMPTY_PLANNING),
      (e) => {
        if (!alive) return;
        setNotice(errorText(e));
        setPlan(EMPTY_PLANNING);
      },
    );
    BimSiteService.history(projectId).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [projectId]);
  useEffect(
    () => () => {
      cancelRef.current?.();
      viewerRef.current?.setSunOverlay(null);
    },
    [viewerRef],
  );

  const run = async () => {
    const viewer = viewerRef.current;
    if (!viewer || !plan) return;
    try {
      setBusy('Đang tính diện tích sàn…');
      let floorError: string | null = null;
      const [floor, outOfScope, estimates] = await Promise.all([
        BimSiteService.floorArea(projectId, loadedIds).catch((e): FloorAreaResult => {
          floorError = errorText(e);
          return { tong: 0, nguon: 'tat_ca_san', mo_hinh: [], so_san: 0, theo_tang: [] };
        }),
        BimSiteService.outOfScope(projectId),
        BimCostService.estimates(projectId).catch(() => []),
      ]);
      const excludedOutOfScope = Object.values(outOfScope).reduce((s, l) => s + l.length, 0);
      setBusy('Đang đọc hình học công trình…');
      const obstacles = await viewer.getSunObstacles({
        includeContext: false,
        excludeGuids: outOfScope,
        onProgress: (d, t) => setBusy(`Đọc hình học ${fmt(d, 0)}/${fmt(t, 0)} cấu kiện…`),
      });
      if (!obstacles.box || !obstacles.parts.length) throw new Error('Chưa có mô hình nào đang hiện để tính.');
      const grid = await new Promise<SampleGrid>((resolve, reject) => {
        cancelRef.current = runSunWorker(
          { parts: obstacles.parts, box: obstacles.box!, step: 2, maxPoints: 40_000, dirs: [], stepHours: 0 },
          (msg) => {
            if (msg.type === 'progress')
              return setBusy(msg.phase === 'bvh' ? 'Đang dựng cây BVH…' : 'Đang lấy mẫu hình chiếu…');
            cancelRef.current = null;
            if (msg.type === 'error') return reject(new Error(msg.message));
            resolve({ points: msg.points, count: msg.count, step: msg.step, groundY: msg.groundY });
          },
        );
      });
      const foot = footprintFromGrid(grid);
      const metrics = planningMetrics(floor.tong || null, foot.area || null, foot.height || null, plan);
      setResult({
        floor,
        floorError,
        foot,
        grid,
        metrics,
        estimate: quickEstimate(floor.tong || null, plan),
        approved: approvedEstimateTotal(estimates),
        items: obstacles.items,
        excludedOutOfScope,
      });
      const colors = new Float32Array(grid.count * 3);
      let n = 0;
      const pts = new Float32Array(foot.cells * 3);
      for (let p = 0; p < grid.count; p++)
        if (foot.mask[p]) {
          pts.set(grid.points.subarray(p * 3, p * 3 + 3), n * 3);
          colors.set(FOOT_RGB, n * 3);
          n++;
        }
      viewer.setSunOverlay({ points: pts, colors: colors.subarray(0, n * 3), count: n, cell: grid.step, opacity: 0.7 });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    try {
      await BimSiteService.savePlanning(projectId, draft);
      setPlan(draft);
      setDraft(null);
      addToast({ type: 'success', message: 'Đã lưu thông số quy hoạch.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const saveRun = async () => {
    if (!result) return;
    try {
      const r = await BimSiteService.saveRun(projectId, {
        model_ids: result.floor.mo_hinh,
        dien_tich_san: result.metrics.gfa,
        dien_tich_chiem_dat: result.metrics.footprint,
        chieu_cao: result.metrics.height,
        hsdd: result.metrics.hsdd,
        mat_do: result.metrics.matDo,
        khai_toan: result.estimate?.total ?? null,
        chi_tiet: {
          nguon_san: result.floor.nguon,
          so_san: result.floor.so_san,
          buoc_luoi: result.grid.step,
          can_cu_khai_toan: result.estimate?.basis ?? null,
          suat_von: result.estimate?.perM2 ?? null,
          gioi_han: plan,
          du_toan_duyet: result.approved?.total ?? null,
        },
      });
      setHistory((h) => [r, ...h].slice(0, 20));
      if (result.metrics.gfa && result.metrics.gfa > 0) {
        await BimSiteService.saveFloorArea(projectId, result.metrics.gfa);
        setPlan((p) => (p ? { ...p, dien_tich_san: result.metrics.gfa } : p));
      }
      addToast({ type: 'success', message: 'Đã lưu lần tính chỉ số.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };

  const p = draft ?? plan;
  const set = (k: keyof PlanningProfile, v: string) =>
    draft &&
    setDraft({
      ...draft,
      [k]: ['can_cu_quy_hoach', 'suat_von_nguon'].includes(k) ? v || null : v === '' ? null : Number(v),
    });

  if (!p) return <div className={`p-2 text-xs text-txt-muted ${className}`}>Đang tải…</div>;
  const diff =
    result?.estimate && result.approved?.total
      ? ((result.estimate.total - result.approved.total) / result.approved.total) * 100
      : null;

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-txt-secondary dark:text-slate-200 ${className}`}
      aria-label="Chỉ số quy hoạch"
    >
      {notice && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {notice} Vẫn tính được chiếm đất và chiều cao; giới hạn quy hoạch để trống.
        </p>
      )}
      <section className="space-y-1 rounded-xl border border-border p-2 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-txt-primary dark:text-white">Thông số quy hoạch</span>
          {canEdit && !draft && (
            <button type="button" className={btn} onClick={() => setDraft(p)}>
              Sửa
            </button>
          )}
        </div>
        {draft ? (
          <div className="grid grid-cols-2 gap-1">
            <label className="text-2xs">
              Khu đất (m²)
              <BimInput
                className={field}
                inputMode="decimal"
                value={draft.dien_tich_khu_dat ?? ''}
                onChange={(e) => set('dien_tich_khu_dat', e.target.value)}
              />
            </label>
            <label className="text-2xs">
              Mật độ tối đa (%)
              <BimInput
                className={field}
                inputMode="decimal"
                value={draft.mat_do_toi_da ?? ''}
                onChange={(e) => set('mat_do_toi_da', e.target.value)}
              />
            </label>
            <label className="text-2xs">
              HSSDĐ tối đa (lần)
              <BimInput
                className={field}
                inputMode="decimal"
                value={draft.hsdd_toi_da ?? ''}
                onChange={(e) => set('hsdd_toi_da', e.target.value)}
              />
            </label>
            <label className="text-2xs">
              Chiều cao tối đa (m)
              <BimInput
                className={field}
                inputMode="decimal"
                value={draft.chieu_cao_toi_da ?? ''}
                onChange={(e) => set('chieu_cao_toi_da', e.target.value)}
              />
            </label>
            <label className="col-span-2 text-2xs">
              Căn cứ quy hoạch
              <BimInput
                className={field}
                value={draft.can_cu_quy_hoach ?? ''}
                onChange={(e) => set('can_cu_quy_hoach', e.target.value)}
                placeholder="Số quyết định quy hoạch chi tiết 1/500…"
              />
            </label>
            <label className="text-2xs">
              Suất vốn (đ/m² sàn)
              <BimInput
                className={field}
                inputMode="decimal"
                value={draft.suat_von ?? ''}
                onChange={(e) => set('suat_von', e.target.value)}
              />
            </label>
            <label className="text-2xs">
              Nguồn suất vốn
              <BimInput
                className={field}
                value={draft.suat_von_nguon ?? ''}
                onChange={(e) => set('suat_von_nguon', e.target.value)}
                placeholder="Quyết định công bố suất vốn, dự án tương tự…"
              />
            </label>
            <div className="col-span-2 flex justify-end gap-1">
              <button type="button" className={btn} onClick={() => setDraft(null)}>
                Hủy
              </button>
              <button type="button" className={btn} onClick={() => void save()}>
                <Save className="h-3 w-3" aria-hidden /> Lưu
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-2xs">
            <dt className="text-txt-muted">Khu đất</dt>
            <dd className="text-right">{p.dien_tich_khu_dat ? `${fmt(p.dien_tich_khu_dat, 0)} m²` : 'chưa có'}</dd>
            <dt className="text-txt-muted">Giới hạn mật độ / HSSDĐ</dt>
            <dd className="text-right">
              {p.mat_do_toi_da ? `${fmt(p.mat_do_toi_da)}%` : '—'} / {p.hsdd_toi_da ? fmt(p.hsdd_toi_da, 2) : '—'}
            </dd>
            <dt className="text-txt-muted">Chiều cao tối đa</dt>
            <dd className="text-right">{p.chieu_cao_toi_da ? `${fmt(p.chieu_cao_toi_da)} m` : '—'}</dd>
            <dt className="text-txt-muted">Suất vốn</dt>
            <dd className="text-right">{p.suat_von ? `${fmt(p.suat_von / 1e6, 2)} triệu đ/m²` : 'chưa nhập'}</dd>
            {p.dien_tich_san ? (
              <>
                <dt className="text-txt-muted">Diện tích sàn đã lưu</dt>
                <dd className="text-right">{fmt(p.dien_tich_san, 0)} m²</dd>
              </>
            ) : null}
            {p.can_cu_quy_hoach && <dd className="col-span-2 text-txt-muted">{p.can_cu_quy_hoach}</dd>}
            {p.suat_von && p.suat_von_nguon && (
              <dd className="col-span-2 text-txt-muted">Nguồn suất vốn: {p.suat_von_nguon}</dd>
            )}
          </dl>
        )}
      </section>

      <div className="flex gap-1">
        {busy ? (
          <>
            <span className="flex-1 self-center text-2xs text-txt-muted" role="status">
              {busy}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => {
                cancelRef.current?.();
                cancelRef.current = null;
                setBusy(null);
              }}
            >
              <X className="h-3 w-3" aria-hidden /> Dừng
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary-600 px-2 py-1.5 text-2xs font-bold text-white hover:bg-primary-700"
            onClick={() => void run()}
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden /> {result ? 'Tính lại chỉ số' : 'Tính chỉ số quy hoạch'}
          </button>
        )}
      </div>

      {result && (
        <section
          className="space-y-2 rounded-xl border border-border p-2 dark:border-slate-700"
          aria-label="Kết quả chỉ số quy hoạch"
        >
          {result.floorError && (
            <p className="flex items-start gap-1 text-2xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Chưa lấy được diện tích sàn:{' '}
              {result.floorError}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-2xs">
            <dt className="text-txt-muted">Tổng diện tích sàn</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.metrics.gfa, 0)} m²</dd>
            <dt className="text-txt-muted">Diện tích chiếm đất</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.metrics.footprint, 0)} m²</dd>
            <dt className="text-txt-muted">Chiều cao</dt>
            <dd className="text-right font-mono tabular-nums">{fmt(result.metrics.height)} m</dd>
          </dl>
          <ul className="space-y-1">
            {result.metrics.checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 text-2xs">
                <span className="flex items-center gap-1">
                  <CheckIcon ok={c.ok} /> {c.label}
                </span>
                <span className="font-mono tabular-nums">
                  {c.value === null ? 'chưa đủ dữ liệu' : `${fmt(c.value, 2)} ${c.unit}`}
                  {c.limit !== null && <span className="text-txt-muted"> / ≤ {fmt(c.limit, 2)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1.5 text-2xs">
            <span className="h-3 w-4 rounded-sm" style={{ background: '#2a78d6' }} aria-hidden /> Diện tích chiếm đất
            trên mô hình
          </div>
          {result.foot.noGround && (
            <p className="flex items-start gap-1 text-2xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Mô hình không có mặt sân: diện tích
              chiếm đất và chiều cao có thể sai.
            </p>
          )}

          <div className="rounded-lg bg-slate-50 p-1.5 text-2xs dark:bg-slate-900">
            <div className="flex justify-between font-semibold">
              <span>Khái toán</span>
              <span className="font-mono">{result.estimate ? ty(result.estimate.total) : 'chưa nhập suất vốn'}</span>
            </div>
            {result.estimate && (
              <p className="text-txt-muted">
                {fmt(result.estimate.perM2 / 1e6, 2)} triệu đ/m² sàn × {fmt(result.metrics.gfa, 0)} m². Nguồn:{' '}
                {result.estimate.basis}. Ước tính sơ bộ, chưa gồm chi phí ngoài suất vốn.
              </p>
            )}
            <div className="mt-1 flex justify-between">
              <span className="text-txt-muted">Dự toán 5D đã duyệt</span>
              <span className="font-mono">{ty(result.approved?.total)}</span>
            </div>
            {result.approved && result.approved.missing > 0 && (
              <p className="text-2xs text-txt-muted">
                Dự toán duyệt còn {fmt(result.approved.missing, 0)} dòng chưa có thành tiền.
              </p>
            )}
            {diff !== null && (
              <div className="flex justify-between">
                <span className="text-txt-muted">Chênh lệch khái toán − dự toán</span>
                <span className="font-mono">
                  {diff > 0 ? '+' : ''}
                  {fmt(diff)}%
                </span>
              </div>
            )}
          </div>

          <button type="button" className={btn} onClick={() => setShowFloors((v) => !v)} aria-expanded={showFloors}>
            {showFloors ? 'Ẩn' : 'Xem'} diện tích sàn theo tầng ({result.floor.theo_tang.length})
          </button>
          {showFloors && (
            <BimTable className="w-full text-2xs">
              <thead>
                <tr className="text-left text-txt-muted">
                  <th>Tầng</th>
                  <th className="text-right">m²</th>
                  <th className="text-right">Sàn</th>
                </tr>
              </thead>
              <tbody>
                {result.floor.theo_tang.map((t) => (
                  <tr key={t.tang} className="border-t border-slate-100 dark:border-slate-700">
                    <td>{t.tang}</td>
                    <td className="text-right font-mono">{fmt(t.dien_tich, 0)}</td>
                    <td className="text-right font-mono">{t.so_san}</td>
                  </tr>
                ))}
              </tbody>
            </BimTable>
          )}
          <p className="text-2xs leading-snug text-txt-muted">
            Diện tích sàn: {result.floor.nguon === 'san_ket_cau' ? 'sàn mô hình kết cấu' : 'mọi sàn'} (
            {fmt(result.floor.so_san, 0)} sàn), bỏ cấu kiện ngoài phạm vi. Chiếm đất và chiều cao: lưới{' '}
            {fmt(result.grid.step)} m trên {fmt(result.items, 0)} cấu kiện công trình, không tính khối bối cảnh
            {result.excludedOutOfScope ? ` và ${fmt(result.excludedOutOfScope, 0)} cấu kiện ghi ngoài phạm vi` : ''}.
          </p>
          {canEdit && result.floor.mo_hinh.length > 0 && (
            <button type="button" className={btn} onClick={() => void saveRun()}>
              <Save className="h-3 w-3" aria-hidden /> Lưu lần tính
            </button>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="rounded-xl border border-border p-2 dark:border-slate-700" aria-label="Lịch sử chỉ số">
          <div className="mb-1 font-semibold text-txt-primary dark:text-white">Các lần tính đã lưu</div>
          <ul className="space-y-0.5 text-2xs">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span className="text-txt-muted">{formatDateTime(new Date(h.created_at))}</span>
                <span className="font-mono">
                  {fmt(Number(h.dien_tich_san), 0)} m² · HSSDĐ {fmt(Number(h.hsdd), 2)} · {fmt(Number(h.mat_do))}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
