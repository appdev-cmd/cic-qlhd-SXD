// Viewer controller for the BIM assistant tools (port of cic-hud hooks/useAiViewerController + lib/insightViewer):
// isolate / X-Ray / colour / hide by category, GUID or floor, disciplines, sections and section boxes in metres,
// saved views, measuring, clash clusters and an undo stack of the assistant's own actions. Built on BimViewerRef;
// the optional `host` routes section, visibility and saved-view changes through BimProjectViewer's own state so
// its panels stay in sync (without it the hook drives the viewer directly).
import { useMemo, useRef, type RefObject } from 'react';
import type { BimModel, BimSavedView } from '@/features/bim-suite/types/bim.types';
import type { BimColorGroup, BimSelectedElement, BimViewerRef } from '../viewer/types';
import type { BimIdGroup, BimViewerController } from '../ai/viewerController';
import type { QuickCommandContext } from '../ai/quickCommands';
import type { UniclassToolContext } from '../ai/uniclassActions';
import { NO_MATCH_CLASS, resolveIfcClasses } from '../ai/elementFilters';
import { ViewerUndoStack } from '../ai/plan';
import { uniclassConditions } from '../ai/uniclass';
import { BimService } from '../services/BimService';
import { BimUniclassService } from '../services/BimUniclassService';
import { clusterClashes } from '../lib/clashGrouping';
import { getSectionContext, matchesStorey, resolveSectionLocation } from '../lib/sectionLocation';
import { computeSectionPlanes, defaultSectionState, sectionFromRatio, type BimSectionState } from '../lib/sectionState';
import { sortModelsForDisplay } from '../lib/tabUtils';
import { viewpointHasIsolation } from '../lib/viewpointState';
import { normalizeVi } from '../lib/vietnameseBimMap';

/** Optional callbacks into the viewer page (BimProjectViewer) so its own state follows the assistant. */
export interface AiViewerHost {
  /** Open the section panel with this state (metres); null closes it. */
  setSection?: (state: BimSectionState | null) => void;
  /** Apply a saved view the way the page does (camera, section, visibility, markup). */
  applySavedView?: (view: BimSavedView) => Promise<void>;
  /** Page-level "show all" (also clears filters / colour modes of the page). */
  showAll?: () => Promise<void>;
  /** Show or hide whole models (the page loads models that are not loaded yet). */
  setModelsVisible?: (modelIds: string[], visible: boolean) => void;
  /** Show only these models. */
  showOnlyModels?: (modelIds: string[]) => void;
  onIsolationChange?: (isolated: boolean) => void;
  onSelect?: (element: BimSelectedElement) => void;
}

export interface AiViewerControllerDeps {
  viewerRef: RefObject<BimViewerRef | null>;
  projectId: string;
  /** Models of the project (all versions shown in the page). */
  models: BimModel[];
  /** Models loaded in the viewer. */
  loadedIds: string[];
  userName?: string | null;
  host?: AiViewerHost;
}

interface AiViewerSnapshot {
  viewpoint: ReturnType<BimViewerRef['getViewpoint']>;
  colors: BimColorGroup[];
  ghost: boolean;
  section: BimSectionState | null;
}

interface AiViewerSession {
  undo: ViewerUndoStack<AiViewerSnapshot>;
  colors: BimColorGroup[];
  ghost: boolean;
  section: BimSectionState | null;
}

const OPEN_CLASH = new Set(['moi', 'dang_xu_ly']);
const DEFAULT_COLOR = '#2563eb';
const count = (groups: BimIdGroup[]) => groups.reduce((sum, group) => sum + group.ids.length, 0);
const fold = (value: string) => normalizeVi(value);

/** IFC classes of a category argument ("cột", "IFCCOLUMN", "IFCBEAM,IFCMEMBER"). */
const classesOf = (category: string) =>
  [...new Set(category.split(',').flatMap((part) => resolveIfcClasses(part.trim()) ?? []))].filter(
    (cls) => cls !== NO_MATCH_CLASS,
  );

/** Categories and storeys of the loaded models, for quick command parsing. */
export async function readViewerCommandContext(
  viewer: BimViewerRef | null,
  loadedIds: string[],
): Promise<QuickCommandContext> {
  if (!viewer || !loadedIds.length) return {};
  const categories = new Set<string>();
  const storeys = new Map<string, { name: string; elevation: number }>();
  for (const modelId of loadedIds) {
    for (const c of await viewer.getCategories(modelId).catch(() => [])) categories.add(c.category.toUpperCase());
    for (const s of await viewer.getStoreys(modelId).catch(() => [])) {
      const key = fold(s.name);
      const elevation = s.elevation ?? Number.POSITIVE_INFINITY;
      const prev = storeys.get(key);
      if (!prev || elevation < prev.elevation) storeys.set(key, { name: s.name, elevation });
    }
  }
  return {
    categories: [...categories],
    storeys: [...storeys.values()]
      .sort((a, b) => a.elevation - b.elevation || a.name.localeCompare(b.name, 'vi', { numeric: true }))
      .map((s) => s.name),
  };
}

export function useAiViewerController(deps: AiViewerControllerDeps): {
  controller: BimViewerController;
  uniclass: UniclassToolContext;
} {
  const { viewerRef, projectId, models, loadedIds, userName, host } = deps;
  // Mutable session that survives re-renders; only read and written inside the controller's async callbacks.
  const sessionRef = useRef<AiViewerSession | null>(null);

  return useMemo(() => {
    const ensure = () =>
      (sessionRef.current ??= {
        undo: new ViewerUndoStack<AiViewerSnapshot>(20),
        colors: [],
        ghost: false,
        section: null,
      });
    const loadedModels = models.filter((m) => loadedIds.includes(m.id));
    const viewerOf = () => {
      const viewer = viewerRef.current;
      if (!viewer) throw new Error('Trình xem mô hình chưa sẵn sàng.');
      return viewer;
    };

    const byGuids = async (guids: string[]): Promise<BimIdGroup[]> => {
      const viewer = viewerOf();
      const out: BimIdGroup[] = [];
      for (const modelId of loadedIds) {
        const ids = await viewer.getLocalIdsByGuids(modelId, guids);
        if (ids.length) out.push({ modelId, ids });
      }
      return out;
    };
    const onStorey = async (groups: BimIdGroup[], storey?: string): Promise<BimIdGroup[]> => {
      if (!storey) return groups;
      const viewer = viewerOf();
      const out: BimIdGroup[] = [];
      for (const group of groups) {
        const floor = new Set(
          (await viewer.getStoreys(group.modelId))
            .filter((s) => matchesStorey(s.name, storey) || s.name === storey)
            .flatMap((s) => s.ids),
        );
        const ids = group.ids.filter((id) => floor.has(id));
        if (ids.length) out.push({ modelId: group.modelId, ids });
      }
      return out;
    };
    const targets = async (guids: string[], category?: string, storey?: string): Promise<BimIdGroup[]> => {
      const viewer = viewerOf();
      let groups: BimIdGroup[] = [];
      if (category) {
        const classes = classesOf(category);
        if (classes.length)
          groups = (await viewer.highlightCategories(classes)).groups
            .filter((g) => g.ids.length)
            .map((g) => ({ modelId: g.modelId, ids: g.ids }));
      } else if (guids.length) groups = await byGuids(guids);
      return onStorey(groups, storey);
    };

    const setGhost = async (active: boolean) => {
      await viewerOf().setGhostMode(active);
      ensure().ghost = active;
    };
    const paint = async (coloring: BimColorGroup[], accumulate: boolean) => {
      await viewerOf().colorize(coloring, { accumulate });
      ensure().colors = accumulate ? [...ensure().colors, ...coloring] : [...coloring];
    };
    const applySection = (state: BimSectionState | null) => {
      ensure().section = state;
      if (host?.setSection) host.setSection(state);
      else viewerRef.current?.setClipPlanes(computeSectionPlanes(state));
    };
    const isolateGroups = async (groups: BimIdGroup[]) => {
      const found = count(groups);
      if (!found) return { found: 0 };
      await setGhost(false);
      await viewerOf().isolateMany(groups);
      host?.onIsolationChange?.(true);
      return { found };
    };
    const highlightGroups = async (groups: BimIdGroup[], color: string, accumulate = true) => {
      const found = count(groups);
      if (found)
        await paint(
          groups.map((g) => ({ ...g, color })),
          accumulate,
        );
      return { found };
    };

    const captureState = async (): Promise<AiViewerSnapshot> => ({
      viewpoint: viewerRef.current?.getViewpoint() ?? null,
      colors: ensure().colors.map((group) => ({ ...group, ids: [...group.ids] })),
      ghost: ensure().ghost,
      section: ensure().section,
    });
    const restoreState = async (raw: unknown) => {
      const snapshot = raw as AiViewerSnapshot;
      const viewer = viewerOf();
      if (snapshot.viewpoint) {
        await viewer.setViewpoint(snapshot.viewpoint);
        host?.onIsolationChange?.(viewpointHasIsolation(snapshot.viewpoint));
      }
      await viewer.setGhostMode(snapshot.ghost);
      ensure().ghost = snapshot.ghost;
      await viewer.colorize(null);
      if (snapshot.colors.length) await viewer.colorize(snapshot.colors, { accumulate: false });
      ensure().colors = snapshot.colors;
      if (snapshot.section !== ensure().section) applySection(snapshot.section);
    };

    const disciplineModels = (discipline: string) => {
      const d = discipline.toUpperCase().trim();
      const wanted =
        d.includes('TAT_CA') || d === 'ALL' || d.includes('TOAN_BO')
          ? null
          : d.includes('KIEN_TRUC_VA_KET_CAU') || (d.includes('KIEN_TRUC') && d.includes('KET_CAU'))
            ? ['KIEN_TRUC', 'KET_CAU']
            : d
                .split(/[,+&|]/)
                .map((x) => x.trim())
                .filter(Boolean);
      return models.filter(
        (m) => m.status === 'ready' && (!wanted || wanted.includes(String(m.discipline).toUpperCase())),
      );
    };
    const allIds = async (modelId: string) => [
      ...new Set((await viewerOf().getCategories(modelId)).flatMap((c) => c.ids)),
    ];

    const controller: BimViewerController = {
      isolate: async (guids, category, storey) => isolateGroups(await targets(guids, category, storey)),
      highlight: async (guids, color, category, options) =>
        highlightGroups(
          await targets(guids, category, options?.storey),
          color ?? DEFAULT_COLOR,
          options?.accumulate ?? true,
        ),
      highlightMany: async (items, storey) => {
        const coloring: BimColorGroup[] = [];
        const detail: { loai_cau_kien?: string; so_luong: number; mau: string }[] = [];
        for (const item of items) {
          const color = item.color ?? DEFAULT_COLOR;
          const groups = await targets(item.guids ?? [], item.loai_cau_kien, storey);
          if (!count(groups)) continue;
          coloring.push(...groups.map((g) => ({ ...g, color })));
          detail.push({ loai_cau_kien: item.loai_cau_kien, so_luong: count(groups), mau: color });
        }
        if (!coloring.length) return { error: 'Không tìm thấy cấu kiện phù hợp trong mô hình đang mở' };
        await paint(coloring, true);
        const total = count(coloring);
        return {
          thanh_cong: true,
          tong_so_luong: total,
          chi_tiet: detail,
          ghi_chu: `Đã tô màu đồng thời cho ${total} cấu kiện trên mô hình 3D`,
        };
      },
      xray: async (guids, color, category, storey) => {
        const groups = await targets(guids, category, storey);
        const found = count(groups);
        if (!found) return { found: 0 };
        await setGhost(true);
        await viewerOf().isolateMany(groups);
        if (color)
          await paint(
            groups.map((g) => ({ ...g, color })),
            true,
          );
        host?.onIsolationChange?.(true);
        return { found };
      },
      hide: async (guids, category, storey) => {
        const groups = await targets(guids, category, storey);
        for (const group of groups) await viewerOf().hideElements(group.modelId, group.ids);
        return { found: count(groups) };
      },
      isolateGroups,
      highlightGroups: (groups, color) => highlightGroups(groups, color, true),
      showAll: async () => {
        const viewer = viewerOf();
        await setGhost(false);
        await viewer.colorize(null);
        ensure().colors = [];
        if (host?.showAll) await host.showAll();
        else await viewer.showAll();
        host?.onIsolationChange?.(false);
      },
      flyTo: async (guid) => {
        const found = await viewerOf().flyToGuid(guid);
        if (found) host?.onSelect?.(found);
        return !!found;
      },
      setSection: (axis, position, flip) =>
        applySection(sectionFromRatio(axis, position, !!flip, viewerRef.current?.getSceneBox() ?? null)),
      getSectionContext: async () => getSectionContext(loadedModels, viewerOf()),
      setSectionByLocation: async (request, flip) => {
        const viewer = viewerOf();
        const result = await resolveSectionLocation(request, loadedModels, viewer);
        if ('error' in result) return result;
        applySection({
          ...defaultSectionState(viewer.getSceneBox()),
          axis: result.axis,
          position: result.elevation,
          flip: !!flip,
        });
        return result;
      },
      clearSection: () => applySection(null),
      setView: (preset) => viewerRef.current?.setView(preset),
      toggleDiscipline: async (discipline, visible = true, isolate = false) => {
        const targetModels = disciplineModels(discipline);
        if (!targetModels.length) return { count: 0 };
        const ids = targetModels.map((m) => m.id);
        const viewer = viewerOf();
        await setGhost(false);
        await viewer.colorize(null);
        ensure().colors = [];
        if (isolate) {
          if (host?.showOnlyModels) host.showOnlyModels(sortModelsForDisplay(targetModels).map((m) => m.id));
          else {
            const loaded = ids.filter((id) => loadedIds.includes(id));
            if (!loaded.length) return { count: 0 };
            await viewer.isolateMany(
              await Promise.all(loaded.map(async (modelId) => ({ modelId, ids: await allIds(modelId) }))),
            );
            host?.onIsolationChange?.(true);
          }
          return { count: targetModels.length };
        }
        if (host?.setModelsVisible) {
          host.setModelsVisible(ids, visible);
          return { count: targetModels.length };
        }
        // Without the page: only loaded models, and "show" can only reset the whole view.
        const loaded = ids.filter((id) => loadedIds.includes(id));
        if (!loaded.length) return { count: 0 };
        if (visible) await viewer.showAll();
        else for (const modelId of loaded) await viewer.hideElements(modelId, await allIds(modelId));
        return { count: loaded.length };
      },
      getViewpoint: () => viewerRef.current?.getViewpoint() ?? null,
      restoreViewpoint: async (vp) => {
        await viewerOf().setViewpoint(vp);
        host?.onIsolationChange?.(viewpointHasIsolation(vp));
      },
      measureBetween: async (a, b) => {
        const viewer = viewerOf();
        const picked: { modelId: string; id: number }[] = [];
        if (a && b) {
          for (const ref of [a, b]) {
            let hit: { modelId: string; id: number } | null = null;
            for (const modelId of ref.modelId ? [ref.modelId] : loadedIds) {
              const [id] = await viewer.mapGuidsToIds(modelId, [ref.guid]);
              if (id !== null && id !== undefined) {
                hit = { modelId, id };
                break;
              }
            }
            if (!hit) return { error: `Không tìm thấy cấu kiện ${ref.guid} trong mô hình đang hiển thị.` };
            picked.push(hit);
          }
        } else {
          const selection = viewer.getSelection();
          if (selection.length !== 2) return { error: 'Cần chọn đúng hai cấu kiện trên mô hình hoặc truyền hai GUID.' };
          picked.push(...selection.map((p) => ({ modelId: p.modelId, id: p.expressId })));
        }
        const boxes = await Promise.all(picked.map((t) => viewer.getBoxOf(t.modelId, [t.id])));
        if (boxes.some((box) => !box)) return { error: 'Cấu kiện không có hình học để đo.' };
        const [ba, bb] = boxes as { min: [number, number, number]; max: [number, number, number] }[];
        const centre = (box: typeof ba) => box.min.map((v, i) => (v + box.max[i]) / 2);
        const [ca, cb] = [centre(ba), centre(bb)];
        const delta = [0, 1, 2].map((i) => cb[i] - ca[i]);
        const gap = Math.hypot(...[0, 1, 2].map((i) => Math.max(0, ba.min[i] - bb.max[i], bb.min[i] - ba.max[i])));
        const r = (v: number) => Math.round(v * 1000) / 1000;
        const briefs = await Promise.all(picked.map((t) => viewer.getItemsBrief(t.modelId, [t.id])));
        await viewer.selectMany(picked.map((t) => ({ modelId: t.modelId, expressId: t.id })));
        return {
          khoang_cach_tam_m: r(Math.hypot(...delta)),
          khoang_ho_m: r(gap),
          chenh_lech_m: { x: r(delta[0]), y: r(delta[1]), z: r(delta[2]) },
          cau_kien: picked.map((t, i) => ({
            guid: briefs[i]?.[t.id]?.guid ?? '',
            model_id: t.modelId,
            ten: briefs[i]?.[t.id]?.name,
          })),
        };
      },
      setSectionBox: async (request) => {
        const viewer = viewerOf();
        const scene = viewer.getSceneBox();
        if (!scene) return { error: 'Trình xem chưa sẵn sàng.' };
        const groups: BimIdGroup[] = request.guids?.length ? await byGuids(request.guids) : [];
        if (request.storey) {
          const building = request.building ? fold(request.building).replace(/^thap\s*/, '') : '';
          for (const model of loadedModels) {
            const ids = (await viewer.getStoreys(model.id))
              .filter(
                (s) =>
                  matchesStorey(s.name, request.storey!) &&
                  (!building || fold(`${s.name} ${model.file_name}`).includes(building)),
              )
              .flatMap((s) => s.ids);
            if (ids.length) groups.push({ modelId: model.id, ids });
          }
        }
        const found = count(groups);
        if (!found) return { found: 0 };
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const group of groups) {
          const box = await viewer.getBoxOf(group.modelId, group.ids);
          if (!box) continue;
          for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], box.min[i]);
            max[i] = Math.max(max[i], box.max[i]);
          }
        }
        if (!Number.isFinite(min[0])) return { error: 'Không đọc được khung bao của các cấu kiện.' };
        const pad = request.paddingM ?? 0.5;
        const range = (i: number): [number, number] => [min[i] - pad, max[i] + pad];
        applySection({ ...defaultSectionState(scene, 'box'), box: { x: range(0), y: range(1), z: range(2) } });
        const round = (v: number) => Math.round(v * 100) / 100;
        return { found, box: { min: min.map((v) => round(v - pad)), max: max.map((v) => round(v + pad)) } };
      },
      listSavedViews: async () =>
        (await BimService.getSavedViews(projectId)).map((view) => ({
          id: view.id,
          name: view.name,
          created_at: view.created_at,
        })),
      applySavedView: async (key) => {
        const views = await BimService.getSavedViews(projectId);
        const exact = views.find((view) => view.id === key) ?? views.find((view) => fold(view.name) === fold(key));
        const partial = exact ? [exact] : views.filter((view) => fold(view.name).includes(fold(key)));
        if (partial.length !== 1)
          return {
            error: partial.length ? 'Có nhiều góc nhìn trùng tên, hãy chọn rõ.' : `Không có góc nhìn "${key}".`,
            choices: (partial.length ? partial : views).slice(0, 20).map((view) => view.name),
          };
        const view = partial[0];
        if (host?.applySavedView) await host.applySavedView(view);
        else {
          const viewer = viewerOf();
          await viewer.setViewpoint(view.state);
          if (view.state.ghost) await setGhost(view.state.ghost.active);
        }
        return { id: view.id, name: view.name };
      },
      saveView: async (name, description) => {
        const state = viewerRef.current?.getViewpoint();
        if (!state) throw new Error('Trình xem chưa sẵn sàng.');
        const saved = await BimService.saveView({
          project_id: projectId,
          model_id: loadedIds[0] ?? null,
          name,
          description: description ?? null,
          state: { ...state, section: ensure().section },
          thumbnail_url: null,
          created_by: userName ?? null,
        });
        return { id: saved.id, name: saved.name };
      },
      showClashCluster: async (cluster, cellSize = 1) => {
        const viewer = viewerOf();
        const sessions = await BimService.getClashSessions(projectId);
        const latest =
          sessions.find((s) => loadedIds.includes(s.model_a) || loadedIds.includes(s.model_b)) ?? sessions[0];
        if (!latest) return { error: 'Chưa có phiên dò va chạm đã lưu. Hãy chạy công cụ Va chạm trước.' };
        const rows = (await BimService.getClashRecords(latest.id))
          .filter((row) => OPEN_CLASH.has(row.trang_thai) && row.tam && row.tam.every(Number.isFinite))
          .map((row) => ({
            id: row.id,
            center: row.tam!,
            a: row.guid_a,
            b: row.guid_b,
            depth: Number(row.do_sau) || 0,
          }));
        if (!rows.length) return { error: `Phiên “${latest.ten}” không còn va chạm đang mở.` };
        const clusters = clusterClashes(rows, cellSize);
        const chosen = clusters[cluster - 1];
        if (!chosen) return { error: `Chỉ có ${clusters.length} cụm va chạm.` };
        const groups = await byGuids([...new Set(chosen.rows.flatMap((row) => [row.a, row.b]))]);
        if (!groups.length) return { error: 'Cấu kiện của cụm chưa có trong mô hình đang hiển thị.' };
        await setGhost(true);
        await viewer.isolateMany(groups);
        await viewer.selectMany(groups.flatMap((g) => g.ids.map((id) => ({ modelId: g.modelId, expressId: id }))));
        await viewer.flyToElement(groups[0].modelId, groups[0].ids[0]);
        host?.onIsolationChange?.(true);
        return {
          cum: cluster,
          tong_so_cum: clusters.length,
          so_va_cham: chosen.rows.length,
          tam_m: chosen.center.map((v) => Math.round(v * 100) / 100) as [number, number, number],
          cap: chosen.rows.slice(0, 20).map((row) => ({ a: row.a, b: row.b, do_sau_mm: Math.round(row.depth * 1000) })),
          nguon: `Phiên dò va chạm “${latest.ten}”`,
        };
      },
      captureState,
      restoreState,
      checkpoint: async (label) => {
        ensure().undo.push(label, await captureState());
      },
      undo: async () => {
        const last = ensure().undo.pop();
        if (!last) return null;
        await restoreState(last.snapshot);
        return { label: last.label };
      },
      undoDepth: () => ensure().undo.depth,
    };

    const uniclass: UniclassToolContext = {
      modelIds: loadedIds,
      label: `${loadedIds.length} mô hình đang nạp`,
      codes: () => BimUniclassService.summary(loadedIds),
      elements: async (filter) => {
        const rows = await BimService.filterElements(loadedIds, uniclassConditions(filter));
        const map = new Map<string, number[]>();
        for (const row of rows) map.set(row.model_id, [...(map.get(row.model_id) ?? []), row.express_id]);
        return onStorey(
          [...map].map(([modelId, ids]) => ({ modelId, ids })),
          filter.storey,
        );
      },
    };
    return { controller, uniclass };
  }, [viewerRef, projectId, models, loadedIds, userName, host]);
}
