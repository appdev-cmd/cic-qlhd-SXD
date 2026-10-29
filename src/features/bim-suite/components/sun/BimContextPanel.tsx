import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G10: bối cảnh từ OpenStreetMap. Tải khung nhà, số tầng quanh vị trí dự án, dựng khối trong trình xem (che nắng cho F1/G6/G9),
// không ghi vào IFC. Bản chụp GeoJSON lưu trong kho dự án kèm ngày tải và ghi nguồn ODbL.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, EyeOff, FolderOpen, Map as MapIcon, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import { useConfirm } from '@/features/bim-suite/adapters/ui';
import type { BimViewerRef } from '../../viewer/types';
import { BimSunService, type ProjectLocation } from '../../services/BimSunService';
import { BimOsmService, type OsmSnapshotRef } from '../../services/BimOsmService';
import { resolveSiteLocation, type SiteLocation } from '../../lib/sun/solar';
import {
  DEFAULT_HEIGHT,
  LEVEL_HEIGHT,
  OSM_ATTRIBUTION,
  buildContext,
  fromGeoJson,
  type ContextBuild,
  type OsmBuilding,
  type OsmSnapshot,
} from '../../lib/osmContext';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number, d = 0) => formatNumber(v, d);
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

interface Anchor {
  x: number;
  z: number;
  own: { min: [number, number]; max: [number, number] };
}
interface Kept {
  buildings: OsmBuilding[];
  snapshot: OsmSnapshot;
  saved: boolean;
  anchor: Anchor;
  adj: { dx: number; dz: number; rot: number; y: number };
  radius: number;
  visible: boolean;
}
/** Giữ khối theo dự án khi đổi sang mục Nắng, Mặt đứng, Tiến độ (khối vẫn ở trong trình xem để che nắng). */
const kept = new Map<string, Kept>();
const NO_MODELS: BimModel[] = [];

export const BimContextPanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  models?: BimModel[];
  canEdit: boolean;
  className?: string;
}> = ({ projectId, viewerRef, models = NO_MODELS, canEdit, className = '' }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [savedLoc, setSavedLoc] = useState<ProjectLocation | null | undefined>(undefined);
  const k = kept.get(projectId);
  const [radius, setRadius] = useState(k?.radius ?? 300);
  const [buildings, setBuildings] = useState<OsmBuilding[] | null>(k?.buildings ?? null);
  const [snapshot, setSnapshot] = useState<OsmSnapshot | null>(k?.snapshot ?? null);
  const [saved, setSaved] = useState(k?.saved ?? false);
  const [anchor, setAnchor] = useState<Anchor | null>(k?.anchor ?? null);
  const [adj, setAdj] = useState(k?.adj ?? { dx: 0, dz: 0, rot: 0, y: 0 });
  const [visible, setVisible] = useState(k?.visible ?? true);
  const [busy, setBusy] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const snapshotsKey = ['bim-boi-canh', projectId];
  const snapshots = useQuery({ queryKey: snapshotsKey, queryFn: () => BimOsmService.listSnapshots(projectId) });

  useEffect(() => {
    let alive = true;
    BimSunService.getLocation(projectId).then(
      (l) => alive && setSavedLoc(l),
      () => alive && setSavedLoc(null),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const site: SiteLocation | null = useMemo(
    () => (savedLoc === undefined ? null : resolveSiteLocation(savedLoc, models)),
    [savedLoc, models],
  );
  // OSM context needs a real position: the assumed default location is not used here
  const loc = site && site.source !== 'mac_dinh' ? site : null;
  const locMissing = site?.source === 'mac_dinh';
  useEffect(() => {
    if (buildings && snapshot && anchor)
      kept.set(projectId, { buildings, snapshot, saved, anchor, adj, radius, visible });
  }, [projectId, buildings, snapshot, saved, anchor, adj, radius, visible]);

  /** Điểm neo: tâm khung công trình (không tính khối bối cảnh của mô hình) trên mặt bằng trình xem. */
  const ensureAnchor = async (): Promise<Anchor> => {
    if (anchor) return anchor;
    const viewer = viewerRef.current;
    if (!viewer) throw new Error('Trình xem chưa sẵn sàng.');
    setBusy('Đang đọc khung công trình…');
    const obs = await viewer.getSunObstacles({ includeContext: false });
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const p of obs.parts)
      for (let i = 0; i + 2 < p.length; i += 3) {
        x0 = Math.min(x0, p[i]);
        x1 = Math.max(x1, p[i]);
        z0 = Math.min(z0, p[i + 2]);
        z1 = Math.max(z1, p[i + 2]);
      }
    if (!Number.isFinite(x0)) throw new Error('Chưa có công trình đang hiện để đặt bối cảnh.');
    const a = {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      own: { min: [x0, z0] as [number, number], max: [x1, z1] as [number, number] },
    };
    setAnchor(a);
    return a;
  };

  // Primitive deps: `loc` is a new object whenever the models prop changes identity
  const lat = loc?.lat,
    lon = loc?.lon,
    north = loc?.north ?? 0;
  const built: ContextBuild | null = useMemo(() => {
    if (!buildings || !anchor || lat === undefined || lon === undefined) return null;
    return buildContext(
      buildings,
      { lat, lon, x: anchor.x + adj.dx, z: anchor.z + adj.dz, y: adj.y, north: north + adj.rot },
      {
        min: [anchor.own.min[0], anchor.own.min[1]],
        max: [anchor.own.max[0], anchor.own.max[1]],
      },
    );
  }, [buildings, anchor, lat, lon, north, adj]);
  // Chỉ dựng khi có khối; gỡ khối là việc của nút Gỡ (rời mục này khối vẫn ở lại để che nắng các mục khác)
  useEffect(() => {
    if (built) viewerRef.current?.setContextMasses(built.tris, { visible });
  }, [built, visible, viewerRef]);

  const download = async () => {
    if (!loc) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      await ensureAnchor();
      setBusy('Đang tải từ OpenStreetMap…');
      const b = await BimOsmService.fetchBuildings(loc.lat, loc.lon, radius, abortRef.current.signal);
      setBuildings(b);
      setSnapshot(BimOsmService.toSnapshot(b, loc.lat, loc.lon, radius));
      setSaved(false);
      if (!b.length)
        addToast({ type: 'info', message: 'OpenStreetMap không có khung nhà nào trong bán kính đã chọn.' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const openSaved = async (ref: OsmSnapshotRef) => {
    try {
      await ensureAnchor();
      setBusy('Đang mở bản chụp đã lưu…');
      const snap = await BimOsmService.openSnapshot(ref);
      setBuildings(fromGeoJson(snap));
      setSnapshot(snap);
      setSaved(true);
      setRadius(snap.radius_m);
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!snapshot) return;
    try {
      setBusy('Đang lưu bản chụp…');
      await BimOsmService.saveSnapshot(projectId, snapshot);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: snapshotsKey });
      addToast({ type: 'success', message: 'Đã lưu bản chụp bối cảnh vào kho dự án.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (ref: OsmSnapshotRef) => {
    if (
      !(await confirm({
        title: 'Xóa bản chụp bối cảnh',
        message: `Xóa "${ref.ten}" khỏi dự án?`,
        confirmText: 'Xóa',
        variant: 'danger',
      }))
    )
      return;
    try {
      await BimOsmService.deleteSnapshot(ref);
      void queryClient.invalidateQueries({ queryKey: snapshotsKey });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const clear = () => {
    kept.delete(projectId);
    setBuildings(null);
    setSnapshot(null);
    viewerRef.current?.setContextMasses(null);
  };
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-txt-secondary dark:text-slate-200 ${className}`}
      aria-label="Bối cảnh OpenStreetMap"
    >
      <div className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
        <MapIcon className="h-4 w-4 text-primary-600" aria-hidden /> Bối cảnh từ bản đồ mở
      </div>
      {locMissing && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Dự án chưa có vĩ độ, kinh độ và mô hình không có toạ độ IfcSite. Nhập vị trí ở mục Nắng trước khi tải bối
          cảnh.
        </p>
      )}
      {loc && (
        <section className="space-y-1.5 rounded-xl border border-border p-2 dark:border-slate-700">
          <p className="text-2xs text-txt-muted">
            Tâm {fmt(loc.lat, 5)}° B, {fmt(loc.lon, 5)}° Đ{loc.north ? ` · Bắc thật ${fmt(loc.north, 1)}°` : ''}. Khối
            đặt quanh tâm khung công trình, chỉnh lệch được bên dưới.
            {loc.source === 'mo_hinh' ? ` Vị trí lấy từ ${loc.label}.` : ''}
          </p>
          <label className="block text-2xs">
            Bán kính
            <BimSelect className={field} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {[150, 300, 500].map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </BimSelect>
          </label>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} disabled={!!busy} onClick={() => void download()}>
              <Download className="h-3 w-3" aria-hidden /> Tải từ OpenStreetMap
            </button>
          </div>
          {busy && (
            <p role="status" className="text-2xs text-txt-muted">
              {busy}
            </p>
          )}
        </section>
      )}

      {built && buildings && (
        <section
          className="space-y-1.5 rounded-xl border border-border p-2 dark:border-slate-700"
          aria-label="Khối bối cảnh"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{fmt(built.used)} khối nhà</span>
            <span className="flex gap-1">
              <button
                type="button"
                className={btn}
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Ẩn khối bối cảnh' : 'Hiện khối bối cảnh'}
              >
                {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
              <button type="button" className={btn} onClick={clear} aria-label="Gỡ khối bối cảnh">
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          </div>
          <ul className="text-2xs">
            <li>
              Có chiều cao ghi trên bản đồ: <b className="tabular-nums">{fmt(built.bySource.chieu_cao)}</b>
            </li>
            <li>
              Tính theo số tầng × {fmt(LEVEL_HEIGHT, 1)} m:{' '}
              <b className="tabular-nums">{fmt(built.bySource.so_tang)}</b>
            </li>
            <li>
              Không có số liệu, lấy mặc định {DEFAULT_HEIGHT} m:{' '}
              <b className="tabular-nums">{fmt(built.bySource.mac_dinh)}</b>
            </li>
            {built.skipped > 0 && (
              <li className="text-txt-muted">
                Bỏ {fmt(built.skipped)} khối trùng khung công trình (chính công trình trên bản đồ).
              </li>
            )}
          </ul>
          <div className="grid grid-cols-4 gap-1">
            <label className="text-2xs">
              Lệch X (m)
              <BimInput
                className={field}
                inputMode="decimal"
                defaultValue={adj.dx}
                onBlur={(e) => setAdj((a) => ({ ...a, dx: num(e.target.value) }))}
              />
            </label>
            <label className="text-2xs">
              Lệch Z (m)
              <BimInput
                className={field}
                inputMode="decimal"
                defaultValue={adj.dz}
                onBlur={(e) => setAdj((a) => ({ ...a, dz: num(e.target.value) }))}
              />
            </label>
            <label className="text-2xs">
              Xoay thêm (°)
              <BimInput
                className={field}
                inputMode="decimal"
                defaultValue={adj.rot}
                onBlur={(e) => setAdj((a) => ({ ...a, rot: num(e.target.value) }))}
              />
            </label>
            <label className="text-2xs">
              Cao độ đất (m)
              <BimInput
                className={field}
                inputMode="decimal"
                defaultValue={adj.y}
                onBlur={(e) => setAdj((a) => ({ ...a, y: num(e.target.value) }))}
              />
            </label>
          </div>
          <p className="text-2xs text-txt-muted">
            Định vị gần đúng theo vị trí dự án; nếu khối lệch so với ảnh nền hay khối bối cảnh của mô hình, chỉnh lệch
            và góc xoay. Khối đang hiện che nắng ở các mục Nắng, Mặt đứng, Tiến độ; không ghi vào IFC.
          </p>
          {canEdit && snapshot && !saved && (
            <button type="button" className={btn} disabled={!!busy} onClick={() => void save()}>
              <Save className="h-3 w-3" aria-hidden /> Lưu bản chụp cho dự án
            </button>
          )}
          {saved && snapshot && (
            <p className="text-2xs text-txt-muted">
              Bản chụp tải ngày {snapshot.downloaded_at.slice(0, 10).split('-').reverse().join('/')} đã lưu trong dự án.
            </p>
          )}
        </section>
      )}
      {(snapshots.data?.length ?? 0) > 0 && (
        <section
          className="space-y-1 rounded-xl border border-border p-2 dark:border-slate-700"
          aria-label="Bản chụp đã lưu"
        >
          <div className="font-semibold text-txt-primary dark:text-white">Bản chụp đã lưu</div>
          <ul className="space-y-1">
            {snapshots.data!.map((r) => (
              <li key={r.id} className="flex items-center gap-1 text-2xs">
                <span className="min-w-0 flex-1">
                  <span className="block truncate" data-tooltip={r.ten}>
                    {r.ten}
                  </span>
                  <span className="text-2xs text-txt-muted">Lưu {formatDateTime(new Date(r.created_at))}</span>
                </span>
                <button
                  type="button"
                  className={btn}
                  disabled={!!busy}
                  onClick={() => void openSaved(r)}
                  aria-label={`Dùng ${r.ten}`}
                >
                  <FolderOpen className="h-3 w-3" aria-hidden /> Dùng
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className={btn}
                    disabled={!!busy}
                    onClick={() => void remove(r)}
                    aria-label={`Xóa ${r.ten}`}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {snapshots.error && <p className="text-2xs text-amber-700 dark:text-amber-300">{errorText(snapshots.error)}</p>}
      <p className="text-2xs text-txt-muted">{OSM_ATTRIBUTION}.</p>
    </div>
  );
};
