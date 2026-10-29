import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Viewer side panel "Vận hành": assets of the register on the loaded models (labels via viewer/facilityAssetLayer,
// color by maintenance state, show only assets), open work orders, open IoT alerts, and the live IoT section (lazy,
// components/BimIotOperationsPanel). The asset record opens as a modal (BimAssetRecord). One owner releases the 3D
// state this panel applied when it unmounts (lib/facilityAssetView).
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BellRing, Crosshair, Eye, EyeOff, Loader2, Palette, Plus, Radio, Search, Tag, Wrench } from 'lucide-react';
import { useBimAccess } from '@/features/bim-suite/adapters/context';
import { ErrorBoundary } from '@/features/bim-suite/adapters/ui';
import type { BimModel } from '../types/bim.types';
import type { BimSelectedElement, BimViewerRef } from '../viewer/types';
import type { SmartSetColoring } from './BimSmartSetsPanel';
import type { FacilityAsset } from '../services/facilityAssetService';
import type { MaintenanceOrder } from '../services/FacilityOpsService';
import {
  useFacilityAssets,
  useFacilityFloors,
  useOpenIotAlerts,
  useVnToday,
  useWorkOrders,
} from '../hooks/useFacilityOps';
import { createOperationsViewOwner, facilityAssetLabels } from '../lib/facilityAssetView';
import { MAINT_STATES, MAINT_STATE_KEYS, maintDueText, maintState, type MaintState } from '../lib/maintenance';
import { ORDER_STATES, PRIORITY_LABELS, dueText, isClosed, orderDueState } from '../lib/workOrderFilters';
import { BimOpsKpiCards } from './BimOpsKpiCards';
import { BimAssetRecord } from './BimAssetWorkspace';

// Live IoT section is owned by the IoT module; loaded only when its tab is opened.
const BimIotOperationsPanel = lazy(() => import('./BimIotOperationsPanel'));

const btn =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const active =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-primary-600 bg-primary-600 px-2 py-1 text-2xs font-semibold text-white disabled:opacity-40';
const chip = (on: boolean) =>
  `flex items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-2 text-2xs ${on ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500/40 dark:bg-primary-950' : 'border-border hover:border-slate-300 dark:border-slate-600'}`;
const EMPTY_ASSETS: FacilityAsset[] = [];
const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-rose-600',
  high: 'text-rose-600',
  warning: 'text-amber-600',
  medium: 'text-amber-600',
};

type Mode = 'assets' | 'orders' | 'alerts' | 'iot';
const MODES: { id: Mode; label: string; icon: typeof Wrench }[] = [
  { id: 'assets', label: 'Thiết bị', icon: Wrench },
  { id: 'orders', label: 'Phiếu đang mở', icon: Tag },
  { id: 'alerts', label: 'Cảnh báo', icon: BellRing },
  { id: 'iot', label: 'IoT trực tiếp', icon: Radio },
];

export interface BimOperationsPanelProps {
  projectId: string;
  projectName?: string;
  viewerRef: RefObject<BimViewerRef | null>;
  /** Models shown in the viewer (latest versions). */
  models: BimModel[];
  /** Ids of the models currently loaded in the viewer. */
  loadedIds: string[];
  /** Element selected in the viewer (prefills "add asset", highlights its row). */
  selection?: BimSelectedElement | null;
  /** Select / fly to an element by IFC GlobalId (loads its model if needed). */
  onLocateGuid: (guid: string) => void;
  /** Viewer coloring with legend (BimProjectViewer colorizeSet). */
  onColorize: (coloring: SmartSetColoring | null) => void;
  /** Asset to open first (deep link ?bimAsset=). */
  initialAssetId?: string | null;
  className?: string;
}

export function BimOperationsPanel({
  projectId,
  projectName,
  viewerRef,
  models,
  loadedIds,
  selection,
  onLocateGuid,
  onColorize,
  initialAssetId,
  className = '',
}: BimOperationsPanelProps) {
  const { canWrite } = useBimAccess();
  const [mode, setMode] = useState<Mode>('assets');
  const assetsQuery = useFacilityAssets(projectId);
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const floors = useFacilityFloors(projectId);
  const orders = useWorkOrders(projectId, undefined, mode === 'orders' || mode === 'assets');
  const alerts = useOpenIotAlerts(projectId, mode === 'alerts');
  const today = useVnToday();
  const [record, setRecord] = useState<{ assetId: string | null; orderId?: string | null } | null>(() =>
    initialAssetId ? { assetId: initialAssetId } : null,
  );
  const openAsset = useCallback((assetId: string, orderId?: string | null) => setRecord({ assetId, orderId }), []);
  const recordAsset = record?.assetId ? assets.find((a) => a.asset_id === record.assetId) : null;

  // The parent's colorize callback may change identity every render: keep the latest in a ref for the owner.
  const colorizeRef = useRef(onColorize);
  useEffect(() => {
    colorizeRef.current = onColorize;
  });
  const [owner] = useState(() =>
    createOperationsViewOwner(
      () => viewerRef.current,
      () => colorizeRef.current(null),
    ),
  );
  useEffect(() => () => void owner.release(), [owner]);

  // Asset labels on the loaded models.
  const [labelsOn, setLabelsOn] = useState(true);
  const floorName = useMemo(() => new Map((floors.data || []).map((f) => [f.floor_key, f.name])), [floors.data]);
  const labels = useMemo(
    () => facilityAssetLabels(assets, loadedIds, (key) => floorName.get(key)),
    [assets, loadedIds, floorName],
  );
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setFacilityAssets(
      labelsOn && labels.length ? { assets: labels, showLabels: true, onSelect: (id) => openAsset(id) } : null,
    );
    return () => viewer.setFacilityAssets(null);
  }, [viewerRef, labels, labelsOn, openAsset]);

  const fallback = (
    <p role="status" className="flex items-center gap-2 p-4 text-xs text-txt-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Đang mở…
    </p>
  );
  return (
    <div className={`flex min-h-0 flex-col text-xs ${className}`}>
      <nav
        aria-label="Vận hành"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 dark:border-slate-700"
      >
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={mode === id ? active : btn}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {mode === 'assets' ? (
          <AssetsOnModel
            projectId={projectId}
            assets={assets}
            loading={assetsQuery.isLoading}
            error={assetsQuery.error}
            models={models}
            loadedIds={loadedIds}
            viewerRef={viewerRef}
            owner={owner}
            selection={selection}
            canWrite={canWrite}
            labelsOn={labelsOn}
            labelCount={labels.length}
            onToggleLabels={() => setLabelsOn((v) => !v)}
            onColorize={onColorize}
            onLocateGuid={onLocateGuid}
            onOpen={openAsset}
            onCreate={() => setRecord({ assetId: null })}
            today={today}
          />
        ) : mode === 'orders' ? (
          orders.isLoading ? (
            fallback
          ) : orders.error ? (
            <p role="alert" className="text-rose-600">
              Không tải được phiếu bảo trì: {orders.error.message}
            </p>
          ) : (
            <OpenOrders
              orders={(orders.data || []).filter((o) => !isClosed(o))}
              assets={assets}
              today={today}
              onOpen={openAsset}
              onLocateGuid={onLocateGuid}
            />
          )
        ) : mode === 'alerts' ? (
          alerts.isLoading ? (
            fallback
          ) : alerts.error ? (
            <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
              Chưa đọc được cảnh báo IoT của dự án ({alerts.error.message}). Đăng ký gateway trong mục IoT trực tiếp.
            </p>
          ) : !alerts.data?.length ? (
            <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
              Không có cảnh báo đang mở.
            </p>
          ) : (
            <ul className="space-y-1">
              {alerts.data.map((alert) => {
                const asset = alert.asset_id ? assets.find((a) => a.asset_id === alert.asset_id) : undefined;
                const guid = asset?.bim_element_id;
                return (
                  <li key={alert.id} className="rounded-xl border border-border p-2 dark:border-slate-700">
                    <div className="flex items-start gap-2">
                      <BellRing className={`mt-0.5 h-3.5 w-3.5 ${SEVERITY_TONE[alert.severity] || 'text-txt-muted'}`} />
                      <div className="min-w-0 flex-1">
                        <b className="text-txt-primary dark:text-white">{alert.name}</b>
                        <p className="text-2xs text-txt-muted">
                          {asset?.asset_name || 'Thiết bị chưa gắn sổ'} ·{' '}
                          {alert.status === 'acknowledged' ? 'Đã tiếp nhận' : 'Đang mở'} · từ{' '}
                          {formatDateTime(new Date(alert.opened_at))}
                        </p>
                      </div>
                      {guid && (
                        <button
                          type="button"
                          className="text-txt-muted hover:text-primary-600"
                          aria-label="Định vị thiết bị"
                          onClick={() => onLocateGuid(guid)}
                        >
                          <Crosshair className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {asset && (
                        <button type="button" className={btn} onClick={() => openAsset(asset.asset_id)}>
                          Hồ sơ
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <ErrorBoundary>
            <Suspense fallback={fallback}>
              <BimIotOperationsPanel
                projectId={projectId}
                projectName={projectName}
                viewerRef={viewerRef}
                onLocateGuid={onLocateGuid}
                onOpenAsset={(id) => openAsset(id)}
                onOpenWorkOrder={(orderId, assetId) => openAsset(assetId, orderId)}
                canEdit={canWrite}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
      {record && (record.assetId === null || recordAsset) && (
        <BimAssetRecord
          key={record.assetId || 'new'}
          projectId={projectId}
          asset={recordAsset ?? null}
          models={models}
          canEdit={canWrite}
          selected={
            record.assetId === null && selection
              ? { guid: selection.guid, modelId: selection.modelId, name: selection.name }
              : null
          }
          initialOrderId={record.orderId}
          onLocateGuid={onLocateGuid}
          onClose={() => setRecord(null)}
        />
      )}
    </div>
  );
}

type Owner = ReturnType<typeof createOperationsViewOwner>;

function AssetsOnModel({
  projectId,
  assets,
  loading,
  error,
  models,
  loadedIds,
  viewerRef,
  owner,
  selection,
  canWrite,
  labelsOn,
  labelCount,
  onToggleLabels,
  onColorize,
  onLocateGuid,
  onOpen,
  onCreate,
  today,
}: {
  projectId: string;
  assets: FacilityAsset[];
  loading: boolean;
  error: Error | null;
  models: BimModel[];
  loadedIds: string[];
  viewerRef: RefObject<BimViewerRef | null>;
  owner: Owner;
  selection?: BimSelectedElement | null;
  canWrite: boolean;
  labelsOn: boolean;
  labelCount: number;
  onToggleLabels: () => void;
  onColorize: (coloring: SmartSetColoring | null) => void;
  onLocateGuid: (guid: string) => void;
  onOpen: (assetId: string) => void;
  onCreate: () => void;
  today: string;
}) {
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<MaintState | 'all'>('all');
  const [colored, setColored] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const linked = useMemo(() => assets.filter((a) => a.bim_element_id), [assets]);
  const rows = useMemo(() => {
    const at = new Date(`${today}T00:00:00`);
    return linked.map((asset) => ({ asset, state: maintState(asset, at), due: maintDueText(asset, at) }));
  }, [linked, today]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(MAINT_STATE_KEYS.map((k) => [k, 0])) as Record<MaintState, number>;
    rows.forEach((r) => c[r.state]++);
    return c;
  }, [rows]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => stateFilter === 'all' || r.state === stateFilter)
      .filter(
        (r) =>
          !term ||
          `${r.asset.asset_name} ${r.asset.asset_code || ''} ${r.asset.system_name || ''} ${r.asset.location || ''}`
            .toLowerCase()
            .includes(term),
      )
      .sort(
        (a, b) =>
          MAINT_STATES[a.state].order - MAINT_STATES[b.state].order ||
          a.asset.asset_name.localeCompare(b.asset.asset_name, 'vi'),
      );
  }, [rows, q, stateFilter]);
  const loadedModels = useMemo(() => models.filter((m) => loadedIds.includes(m.id)), [models, loadedIds]);

  /** Element ids of the filtered assets in the loaded models, grouped by maintenance state. */
  const idsByState = useCallback(async () => {
    const viewer = viewerRef.current;
    const out: { modelId: string; state: MaintState; ids: number[] }[] = [];
    if (!viewer) return out;
    for (const m of loadedModels)
      for (const st of MAINT_STATE_KEYS) {
        const guids = filtered
          .filter((r) => r.state === st && (!r.asset.model_id || r.asset.model_id === m.id))
          .map((r) => r.asset.bim_element_id)
          .filter((guid): guid is string => !!guid);
        if (!guids.length) continue;
        const ids = (await viewer.getLocalIdsByGuids(m.id, guids)).filter((x) => typeof x === 'number');
        if (ids.length) out.push({ modelId: m.id, state: st, ids });
      }
    return out;
  }, [viewerRef, loadedModels, filtered]);
  const coloringOf = useCallback(
    (parts: { modelId: string; state: MaintState; ids: number[] }[]): SmartSetColoring => {
      const legendCounts = new Map<MaintState, number>();
      filtered.forEach((r) => legendCounts.set(r.state, (legendCounts.get(r.state) || 0) + 1));
      return {
        title: 'Tình trạng bảo trì thiết bị',
        groups: parts.map((p) => ({ modelId: p.modelId, color: MAINT_STATES[p.state].color, ids: p.ids })),
        legend: MAINT_STATE_KEYS.filter((k) => legendCounts.get(k)).map((k) => ({
          color: MAINT_STATES[k].color,
          label: MAINT_STATES[k].label,
          count: legendCounts.get(k) || 0,
        })),
      };
    },
    [filtered],
  );
  // Keep the coloring in step with filters and loaded models while it is on.
  useEffect(() => {
    if (!colored) return;
    let cancelled = false;
    idsByState()
      .then((parts) => {
        if (cancelled) return;
        if (!parts.length) {
          onColorize(null);
          owner.markColored(false);
          setColored(false);
          return;
        }
        onColorize(coloringOf(parts));
      })
      .catch((e: unknown) => {
        if (!cancelled) setMessage(e instanceof Error ? e.message : 'Không cập nhật được màu thiết bị.');
      });
    return () => {
      cancelled = true;
    };
    // onColorize identity may change each parent render; the coloring depends on the data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colored, idsByState, coloringOf, owner]);

  const toggleColor = async () => {
    if (colored) {
      onColorize(null);
      owner.markColored(false);
      setColored(false);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const parts = await idsByState();
      if (!parts.length) {
        setMessage('Chưa nạp mô hình chứa thiết bị. Bấm tên một thiết bị để mở mô hình tương ứng.');
        return;
      }
      onColorize(coloringOf(parts));
      owner.markColored(true);
      setColored(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Không tô màu được thiết bị.');
    } finally {
      setBusy(false);
    }
  };
  const toggleIsolate = async () => {
    if (isolated) {
      await owner.showAll();
      setIsolated(false);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const parts = await idsByState();
      if (!parts.length) {
        setMessage('Chưa nạp mô hình chứa thiết bị. Bấm tên một thiết bị để mở mô hình tương ứng.');
        return;
      }
      const byModel = new Map<string, number[]>();
      parts.forEach((p) => byModel.set(p.modelId, [...(byModel.get(p.modelId) || []), ...p.ids]));
      await owner.isolate(
        [...byModel.entries()].map(([modelId, ids]) => ({ modelId, ids })),
        loadedModels.map((model) => ({
          modelId: model.id,
          guids: filtered
            .filter((row) => !row.asset.model_id || row.asset.model_id === model.id)
            .map((row) => row.asset.bim_element_id)
            .filter((guid): guid is string => !!guid),
        })),
      );
      setIsolated(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Không cô lập được thiết bị.');
    } finally {
      setBusy(false);
    }
  };
  const selectedAsset = selection?.guid ? assets.find((a) => a.bim_element_id === selection.guid) : undefined;

  return (
    <section aria-label="Thiết bị trên mô hình" className="space-y-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary-600" />
        <span className="font-semibold text-txt-primary dark:text-white">Bảo trì vận hành</span>
        <span className="text-2xs text-txt-muted">
          {formatNumber(linked.length, 2)} thiết bị gắn mô hình · {labelCount} trên mô hình đang mở
        </span>
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-1">
          {selectedAsset ? (
            <button type="button" className={btn} onClick={() => onOpen(selectedAsset.asset_id)}>
              Hồ sơ thiết bị đang chọn
            </button>
          ) : (
            <button type="button" className={btn} onClick={onCreate}>
              <Plus className="h-3 w-3" />
              {selection?.guid ? 'Đưa cấu kiện đang chọn vào sổ tài sản' : 'Thêm tài sản'}
            </button>
          )}
        </div>
      )}
      <BimOpsKpiCards projectId={projectId} />
      <div className="flex flex-wrap gap-1">
        {MAINT_STATE_KEYS.filter((k) => counts[k] > 0 || k === 'qua_han').map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={stateFilter === k}
            onClick={() => setStateFilter((s) => (s === k ? 'all' : k))}
            className={chip(stateFilter === k)}
            data-tooltip={`Lọc: ${MAINT_STATES[k].label}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: MAINT_STATES[k].color }} />
            <b className="tabular-nums text-txt-primary dark:text-white">{counts[k]}</b>
            <span className="text-txt-muted">{MAINT_STATES[k].short}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          disabled={busy || !filtered.length}
          onClick={() => void toggleColor()}
          className={colored ? active : btn}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
          Tô màu
        </button>
        <button
          type="button"
          disabled={busy || !filtered.length}
          onClick={() => void toggleIsolate()}
          className={isolated ? active : btn}
        >
          {isolated ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {isolated ? 'Hiện tất cả' : 'Chỉ thiết bị'}
        </button>
        <button
          type="button"
          disabled={!labelCount}
          onClick={onToggleLabels}
          className={labelsOn && labelCount ? active : btn}
        >
          <Tag className="h-3.5 w-3.5" />
          Nhãn
        </button>
      </div>
      {message && (
        <p role="status" className="text-amber-700 dark:text-amber-300">
          {message}
        </p>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-[9px] h-3.5 w-3.5 text-slate-400" />
        <BimInput
          aria-label="Tìm thiết bị"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên, mã tài sản, hệ thống, vị trí…"
          className="w-full rounded-lg border border-border bg-white py-1.5 pl-8 pr-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
      </div>
      {loading ? (
        <p className="flex justify-center gap-2 p-4 text-txt-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải sổ tài sản…
        </p>
      ) : error ? (
        <p role="alert" className="text-rose-600">
          Không tải được sổ tài sản: {error.message}
        </p>
      ) : !linked.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
          Chưa có tài sản gắn cấu kiện BIM. Nhập từ mô hình IFC trong tab Tài sản, hoặc chọn một cấu kiện rồi đưa vào
          sổ.
        </p>
      ) : (
        <ul className="space-y-1">
          {!filtered.length && <li className="p-2 text-center text-txt-muted">Không có thiết bị phù hợp bộ lọc.</li>}
          {filtered.map(({ asset: a, state, due }) => {
            const st = MAINT_STATES[state];
            const guid = a.bim_element_id!;
            const current = !!selection?.guid && selection.guid === guid;
            return (
              <li
                key={a.asset_id}
                className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${current ? 'border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950' : 'border-border dark:border-slate-700'}`}
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: st.color }}
                  data-tooltip={st.label}
                />
                <button
                  type="button"
                  onClick={() => onLocateGuid(guid)}
                  className="min-w-0 flex-1 text-left"
                  data-tooltip={`Phóng tới ${a.asset_name}`}
                >
                  <span className="block truncate font-semibold text-txt-primary dark:text-white">{a.asset_name}</span>
                  <span className="block truncate text-2xs text-txt-muted">
                    {a.asset_code}
                    {a.system_name ? ` · ${a.system_name}` : ''}
                  </span>
                  <span className="block text-2xs" style={{ color: st.color }}>
                    {state === 'hong' || state === 'dang_bao_tri' || state === 'ngung_su_dung' ? st.label : due}
                  </span>
                </button>
                <button type="button" className={btn} onClick={() => onOpen(a.asset_id)}>
                  Hồ sơ
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OpenOrders({
  orders,
  assets,
  today,
  onOpen,
  onLocateGuid,
}: {
  orders: MaintenanceOrder[];
  assets: FacilityAsset[];
  today: string;
  onOpen: (assetId: string, orderId?: string | null) => void;
  onLocateGuid: (guid: string) => void;
}) {
  const assetById = useMemo(() => new Map(assets.map((a) => [a.asset_id, a])), [assets]);
  if (!orders.length)
    return <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">Không có phiếu đang mở.</p>;
  const sorted = [...orders].sort((a, b) => a.due_date.localeCompare(b.due_date));
  return (
    <ul className="space-y-1">
      {sorted.map((o) => {
        const asset = assetById.get(o.asset_id);
        const due = orderDueState(o, today);
        const guid = asset?.bim_element_id;
        return (
          <li key={o.id} className="rounded-xl border border-border p-2 dark:border-slate-700">
            <div className="flex items-start gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(o.asset_id, o.id)}>
                <b className="block truncate text-txt-primary dark:text-white">{o.title}</b>
                <span className="block truncate text-2xs text-txt-muted">
                  {asset?.asset_name || o.asset_id} · {ORDER_STATES[o.status]} ·{' '}
                  {PRIORITY_LABELS[o.priority ?? 'normal']}
                  {o.assignee_name ? ` · ${o.assignee_name}` : ''}
                </span>
                <span
                  className={`block text-2xs ${due === 'overdue' ? 'text-rose-600' : due === 'due_soon' ? 'text-amber-600' : 'text-txt-muted'}`}
                >
                  Hạn {o.due_date} · {dueText(o, today)}
                </span>
              </button>
              {guid && (
                <button
                  type="button"
                  className="text-txt-muted hover:text-primary-600"
                  aria-label="Định vị thiết bị"
                  onClick={() => onLocateGuid(guid)}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default BimOperationsPanel;
