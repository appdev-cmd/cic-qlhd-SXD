import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Periodic inspection by QR: routes (assets in walking order), checklist, rounds with a scan log carrying time and
// position. Scanning a step label opens that step (/app/bim/{project}?bimRoute=…&bimAsset=…).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Crosshair, MapPin, Plus, QrCode, Route } from 'lucide-react';
import { useInspectionRounds, useInspectionRoutes, useRoundScans, useRouteSteps } from '../hooks/useFacilityOps';
import {
  FacilityOpsService,
  type InspectionRound,
  type InspectionRoute,
  type InspectionScan,
} from '../services/FacilityOpsService';
import type { FacilityAsset } from '../services/facilityAssetService';
import { readGeolocation } from '../lib/fieldPhoto';
import { inspectionStepLink } from '../lib/maintenance';
import { BimQrLabelModal } from './BimQrLabelModal';

const field =
  'mt-1 w-full min-w-0 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';
const chip = (active: boolean) =>
  `rounded-full border px-2 py-1 ${active ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-secondary dark:border-slate-600'}`;

interface Props {
  projectId: string;
  projectName?: string;
  canWrite?: boolean;
  assets: FacilityAsset[];
  onLocateGuid?: (guid: string) => void;
  /** Deep link from a QR label. */
  initialRouteId?: string | null;
  initialAssetId?: string | null;
}
type Editing = { route: Partial<InspectionRoute>; assetIds: string[]; checklist: string };

export const BimInspectionRoundsPanel: React.FC<Props> = ({
  projectId,
  projectName,
  canWrite,
  assets,
  onLocateGuid,
  initialRouteId,
  initialAssetId,
}) => {
  const routes = useInspectionRoutes(projectId);
  const cache = useQueryClient();
  const [routeId, setRouteId] = useState<string | null>(initialRouteId || null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [round, setRound] = useState<InspectionRound | null>(null);
  const [qrStep, setQrStep] = useState<string | null>(initialAssetId || null);
  const [labels, setLabels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = routes.data?.find((r) => r.id === routeId) || null;
  const steps = useRouteSteps(routeId);
  const rounds = useInspectionRounds(projectId, routeId);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.asset_id, a])), [assets]);
  const activeAssets = useMemo(() => assets.filter((a) => a.status !== 'Retired'), [assets]);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được');
    } finally {
      setBusy(false);
    }
  };
  // Opened from a QR label: start (or resume) the user's own round and go to the scanned step.
  const deepStarted = useRef<string | null>(null);
  const routeKnown = !!initialRouteId && !!routes.data?.some((r) => r.id === initialRouteId);
  useEffect(() => {
    if (!initialRouteId || !routeKnown || deepStarted.current === `${initialRouteId}:${initialAssetId}`) return;
    deepStarted.current = `${initialRouteId}:${initialAssetId}`;
    let cancelled = false;
    FacilityOpsService.startRound(initialRouteId)
      .then((next) => {
        if (!cancelled) setRound(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không bắt đầu được lượt kiểm tra');
      });
    return () => {
      cancelled = true;
    };
  }, [initialRouteId, initialAssetId, routeKnown]);

  const saveRoute = () =>
    run(async () => {
      if (!editing) return;
      if (!editing.route.name?.trim()) throw new Error('Cần tên tuyến.');
      if (!editing.assetIds.length) throw new Error('Tuyến cần ít nhất một thiết bị.');
      const saved = await FacilityOpsService.saveRoute(
        {
          id: editing.route.id,
          project_id: projectId,
          name: editing.route.name.trim(),
          description: editing.route.description || null,
          checklist_template: editing.checklist
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          active: editing.route.active ?? true,
        },
        editing.assetIds,
      );
      setEditing(null);
      setRouteId(saved.id);
      await cache.invalidateQueries({ queryKey: ['facility-routes', projectId] });
      await cache.invalidateQueries({ queryKey: ['facility-route-steps', saved.id] });
    });
  const move = (i: number, d: -1 | 1) => {
    if (!editing) return;
    const next = [...editing.assetIds];
    [next[i + d], next[i]] = [next[i], next[i + d]];
    setEditing({ ...editing, assetIds: next });
  };

  return (
    <section aria-label="Kiểm tra định kỳ bằng QR" className="space-y-2 text-xs text-txt-secondary dark:text-slate-200">
      <header className="flex flex-wrap items-center gap-2">
        <Route className="h-4 w-4 text-primary-600" />
        <h3 className="font-semibold text-txt-primary dark:text-white">Tuyến kiểm tra QR</h3>
        <span className="flex-1" />
        {canWrite && (
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() =>
              setEditing({
                route: { name: 'Tuyến kiểm tra', active: true },
                assetIds: [],
                checklist: 'Không rò rỉ, không tiếng ồn lạ\nĐèn báo bình thường\nVệ sinh khu vực',
              })
            }
          >
            <Plus className="h-3 w-3" /> Thêm tuyến
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
      {routes.isLoading ? (
        <p>Đang tải tuyến…</p>
      ) : routes.error ? (
        <p role="alert" className="text-rose-600">
          {routes.error.message}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {(routes.data || []).map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === routeId}
              onClick={() => {
                setRouteId(r.id);
                setRound(null);
                setQrStep(null);
              }}
              className={`${chip(r.id === routeId)} ${r.active ? '' : 'opacity-60'}`}
            >
              {r.name}
            </button>
          ))}
          {!routes.data?.length && (
            <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">Chưa có tuyến kiểm tra.</p>
          )}
        </div>
      )}
      {route && !editing && (
        <div className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <b className="flex-1 text-txt-primary dark:text-white">
              {route.name} · {steps.data?.length ?? 0} bước
            </b>
            <button type="button" className={btn} disabled={!steps.data?.length} onClick={() => setLabels(true)}>
              <QrCode className="h-3 w-3" />
              In nhãn QR
            </button>
            {canWrite && (
              <button
                type="button"
                className={btn}
                onClick={() =>
                  setEditing({
                    route,
                    assetIds: (steps.data || []).map((s) => s.asset_id),
                    checklist: route.checklist_template.join('\n'),
                  })
                }
              >
                Sửa tuyến
              </button>
            )}
            {!round && (
              <button
                type="button"
                disabled={busy || !route.active}
                className={primary}
                onClick={() => void run(async () => setRound(await FacilityOpsService.startRound(route.id)))}
              >
                Bắt đầu kiểm tra
              </button>
            )}
          </div>
          {route.description && <p className="text-txt-muted">{route.description}</p>}
          {round ? (
            <RoundRunner
              round={round}
              route={route}
              steps={steps.data || []}
              assetById={assetById}
              qrStep={qrStep}
              onLocateGuid={onLocateGuid}
              onClosed={async (next) => {
                setRound(next.status === 'in_progress' ? next : null);
                setQrStep(null);
                await cache.invalidateQueries({ queryKey: ['facility-rounds', projectId] });
              }}
            />
          ) : (
            <ol className="list-decimal space-y-0.5 pl-5">
              {(steps.data || []).map((step) => (
                <li key={step.seq}>{assetById.get(step.asset_id)?.asset_name || step.asset_id}</li>
              ))}
            </ol>
          )}
          <details>
            <summary className="cursor-pointer">Lượt kiểm tra gần đây ({rounds.data?.length ?? 0})</summary>
            <ul className="mt-1 space-y-0.5">
              {(rounds.data || []).slice(0, 20).map((r) => (
                <li key={r.id}>
                  {formatDateTime(new Date(r.started_at))} ·{' '}
                  {r.status === 'completed' ? 'Hoàn tất' : r.status === 'abandoned' ? 'Bỏ dở' : 'Đang kiểm tra'}
                  {r.completed_at ? ` · xong ${new Date(r.completed_at).toLocaleTimeString('vi-VN')}` : ''}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {editing && canWrite && (
        <form
          aria-label="Tuyến kiểm tra"
          className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            void saveRoute();
          }}
        >
          <label className="block">
            Tên tuyến
            <BimInput
              aria-label="Tên tuyến"
              value={editing.route.name || ''}
              onChange={(e) => setEditing({ ...editing, route: { ...editing.route, name: e.target.value } })}
              className={field}
            />
          </label>
          <label className="block">
            Mô tả
            <BimInput
              aria-label="Mô tả tuyến"
              value={editing.route.description || ''}
              onChange={(e) => setEditing({ ...editing, route: { ...editing.route, description: e.target.value } })}
              className={field}
            />
          </label>
          <label className="block">
            Checklist mỗi bước (mỗi dòng một việc)
            <textarea
              aria-label="Checklist tuyến"
              rows={3}
              value={editing.checklist}
              onChange={(e) => setEditing({ ...editing, checklist: e.target.value })}
              className={field}
            />
          </label>
          <p className="font-semibold">Thiết bị theo thứ tự đi</p>
          <ol className="space-y-1">
            {editing.assetIds.map((id, i) => (
              <li key={id} className="flex items-center gap-1">
                <span className="w-5 text-right">{i + 1}.</span>
                <span className="flex-1 truncate">{assetById.get(id)?.asset_name || id}</span>
                <button type="button" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Xuống"
                  disabled={i === editing.assetIds.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="text-txt-muted"
                  onClick={() => setEditing({ ...editing, assetIds: editing.assetIds.filter((x) => x !== id) })}
                >
                  Bỏ
                </button>
              </li>
            ))}
          </ol>
          <BimSelect
            aria-label="Thêm thiết bị vào tuyến"
            value=""
            onChange={(e) =>
              e.target.value && setEditing({ ...editing, assetIds: [...editing.assetIds, e.target.value] })
            }
            className={field}
          >
            <option value="">Thêm thiết bị…</option>
            {activeAssets
              .filter((a) => !editing.assetIds.includes(a.asset_id))
              .map((a) => (
                <option key={a.asset_id} value={a.asset_id}>
                  {a.asset_name}
                  {a.asset_code ? ` · ${a.asset_code}` : ''}
                </option>
              ))}
          </BimSelect>
          <label className="flex items-center gap-2">
            <BimInput
              type="checkbox"
              checked={editing.route.active ?? true}
              onChange={(e) => setEditing({ ...editing, route: { ...editing.route, active: e.target.checked } })}
            />
            Đang áp dụng
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primary}>
              Lưu tuyến
            </button>
            <button type="button" className={btn} onClick={() => setEditing(null)}>
              Hủy
            </button>
          </div>
        </form>
      )}
      {labels && route && (
        <BimQrLabelModal
          projectId={projectId}
          projectName={projectName}
          onClose={() => setLabels(false)}
          title={`Nhãn QR tuyến ${route.name}`}
          description="Dán tại từng thiết bị. Quét mở đúng bước của tuyến và ghi nhận lượt kiểm tra (cần đăng nhập)."
          items={(steps.data || []).map((step) => ({
            guid: assetById.get(step.asset_id)?.bim_element_id || step.asset_id,
            name: assetById.get(step.asset_id)?.asset_name || step.asset_id,
            caption: `Bước ${step.seq} · ${route.name}`,
            link: inspectionStepLink(projectId, route.id, step.asset_id),
          }))}
        />
      )}
    </section>
  );
};

const RoundRunner: React.FC<{
  round: InspectionRound;
  route: InspectionRoute;
  steps: { seq: number; asset_id: string }[];
  assetById: Map<string, FacilityAsset>;
  qrStep: string | null;
  onLocateGuid?: (guid: string) => void;
  onClosed: (round: InspectionRound) => Promise<void>;
}> = ({ round, route, steps, assetById, qrStep, onLocateGuid, onClosed }) => {
  const scans = useRoundScans(round.id);
  const [active, setActive] = useState<string | null>(qrStep);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = new Map((scans.data || []).map((scan) => [scan.seq, scan]));
  const firstPending = steps.find((step) => !done.has(step.seq));
  const current = steps.find((step) => step.asset_id === (active ?? firstPending?.asset_id)) || null;
  return (
    <div className="space-y-2">
      <p className="text-2xs text-txt-muted">
        Lượt bắt đầu {formatDateTime(new Date(round.started_at))} · đã ghi {done.size}/{steps.length} bước
      </p>
      <ol className="space-y-1">
        {steps.map((step) => {
          const scan = done.get(step.seq);
          const asset = assetById.get(step.asset_id);
          return (
            <li key={step.seq}>
              <button
                type="button"
                onClick={() => setActive(step.asset_id)}
                aria-current={current?.seq === step.seq ? 'step' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${current?.seq === step.seq ? 'border-primary-600 bg-primary-50 dark:bg-primary-950' : 'border-border dark:border-slate-700'}`}
              >
                <span className="w-5 text-right">{step.seq}.</span>
                <span className="flex-1 truncate">{asset?.asset_name || step.asset_id}</span>
                {scan ? (
                  <span className={scan.result === 'issue' ? 'text-rose-600' : 'text-emerald-700'}>
                    {scan.result === 'issue' ? 'Sự cố' : 'Đạt'} ·{' '}
                    {new Date(scan.scanned_at).toLocaleTimeString('vi-VN')}
                    {scan.method === 'qr' ? ' · QR' : ''}
                  </span>
                ) : (
                  <span className="text-txt-muted">Chưa kiểm</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {current && (
        <StepForm
          key={`${round.id}:${current.seq}`}
          round={round}
          route={route}
          step={current}
          asset={assetById.get(current.asset_id)}
          viaQr={!!qrStep && current.asset_id === qrStep}
          onLocateGuid={onLocateGuid}
          onLogged={async () => {
            setActive(null);
            const remaining = steps.filter((step) => !done.has(step.seq) && step.seq !== current.seq);
            if (!remaining.length) await onClosed({ ...round, status: 'completed' });
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        className={btn}
        onClick={() => {
          setBusy(true);
          FacilityOpsService.closeRound(round.id, done.size < steps.length)
            .then(onClosed)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không đóng được lượt'))
            .finally(() => setBusy(false));
        }}
      >
        {done.size < steps.length ? 'Kết thúc (bỏ dở)' : 'Đóng lượt'}
      </button>
    </div>
  );
};

const StepForm: React.FC<{
  round: InspectionRound;
  route: InspectionRoute;
  step: { seq: number; asset_id: string };
  asset?: FacilityAsset;
  viaQr: boolean;
  onLocateGuid?: (guid: string) => void;
  onLogged: (scan: InspectionScan) => Promise<void>;
}> = ({ round, route, step, asset, viaQr, onLocateGuid, onLogged }) => {
  const cache = useQueryClient();
  const [checklist, setChecklist] = useState(() => route.checklist_template.map((label) => ({ label, done: false })));
  const [result, setResult] = useState<'ok' | 'issue'>('ok');
  const [note, setNote] = useState('');
  const [createOrder, setCreateOrder] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = async () => {
    setBusy(true);
    setError(null);
    try {
      if (result === 'issue' && !note.trim()) throw new Error('Mô tả sự cố trước khi ghi nhận.');
      const fix = await readGeolocation();
      const scan = await FacilityOpsService.logScan(round.id, step.asset_id, {
        method: viaQr ? 'qr' : 'manual',
        checklist,
        result,
        note,
        lat: fix?.lat,
        lng: fix?.lng,
        accuracy: fix?.accuracy,
        createOrder: result === 'issue' && createOrder,
      });
      await cache.invalidateQueries({ queryKey: ['facility-round-scans', round.id] });
      if (result === 'issue' && createOrder)
        await cache.invalidateQueries({ queryKey: ['bim-work-orders', round.project_id] });
      await onLogged(scan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không ghi được lượt quét');
    } finally {
      setBusy(false);
    }
  };
  const guid = asset?.bim_element_id;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <b className="flex-1 text-txt-primary dark:text-white">
          Bước {step.seq}: {asset?.asset_name || step.asset_id}
        </b>
        {viaQr && <span className="rounded bg-primary-50 px-1.5 text-primary-800">Đã quét QR</span>}
        {guid && onLocateGuid && (
          <button
            type="button"
            aria-label="Định vị thiết bị trên BIM"
            className="rounded border border-border p-1"
            onClick={() => onLocateGuid(guid)}
          >
            <Crosshair className="h-3 w-3" />
          </button>
        )}
      </div>
      {checklist.map((item, i) => (
        <label
          key={i}
          className="flex min-h-[40px] items-center gap-2 rounded border border-border px-2 dark:border-slate-700"
        >
          <BimInput
            type="checkbox"
            className="h-5 w-5"
            checked={item.done}
            onChange={(e) => setChecklist(checklist.map((c, j) => (j === i ? { ...c, done: e.target.checked } : c)))}
          />
          {item.label}
        </label>
      ))}
      <div className="flex gap-2" role="radiogroup" aria-label="Kết quả bước kiểm tra">
        {(['ok', 'issue'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={result === value}
            onClick={() => setResult(value)}
            className={`flex-1 rounded-lg border py-2 ${result === value ? (value === 'ok' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-50' : 'border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-50') : 'border-border dark:border-slate-700'}`}
          >
            {value === 'ok' ? 'Đạt' : 'Có sự cố'}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Ghi chú bước kiểm tra"
        placeholder={result === 'issue' ? 'Mô tả sự cố (bắt buộc)' : 'Ghi chú'}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={field}
      />
      {result === 'issue' && (
        <label className="flex items-center gap-2">
          <BimInput type="checkbox" checked={createOrder} onChange={(e) => setCreateOrder(e.target.checked)} />
          Lập phiếu sửa chữa từ sự cố
        </label>
      )}
      <button
        type="button"
        disabled={busy}
        className={`${primary} flex w-full items-center justify-center gap-1 py-2.5`}
        onClick={() => void log()}
      >
        <MapPin className="h-4 w-4" />
        {busy ? 'Đang ghi nhận…' : 'Ghi nhận bước (kèm vị trí, thời gian)'}
      </button>
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
};
