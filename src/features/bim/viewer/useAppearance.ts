// Diện mạo cấu kiện: lựa chọn, màu nhóm, xuyên thấu (ghost), hiển thị/ẩn/cô lập và cô lập tầng IoT.
// Mọi thay đổi tô sáng xếp hàng qua queueAppearance để không đè nhau; thứ tự ưu tiên màu theo resolveItemAppearance.
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { applyBimVisibility } from '../lib/bimVisibility';
import { syncSelectionAppearance } from '../lib/selectionAppearance';
import { resolveItemAppearance } from '../lib/viewpointState';
import { SELECTION_MATERIAL } from '../lib/viewerConstants';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { BimColorGroup, VisibilityState } from './types';

export function useAppearance(ctx: ViewerContext, core: ViewerCore) {
  const {
    worldRef,
    loadedRef,
    selectionSetRef,
    selectionRef,
    hoverRef,
    nameCacheRef,
    boxesCacheRef,
    colorsRef,
    colorizeQueueRef,
    colorizeEpochRef,
    outlinerRef,
    visibilityRef,
    colorHiddenRef,
    ghostRef,
    ghostOpacityRef,
    iotFloorRef,
    qualityRef,
    movingRef,
    onSelectionCountChangeRef,
    onElementSelectedRef,
  } = ctx;
  const { getModel, settleUpdate, describeItem } = core;

  const ghostAppearance = (): FRAGS.MaterialDefinition => ({
    color: new THREE.Color('#94a3b8'),
    opacity: ghostOpacityRef.current,
    transparent: true,
    depthWrite: false,
    renderedFaces: FRAGS.RenderedFaces.TWO,
  });

  /**
   * Áp lại màu nhóm đã lưu (colorize) cho mô hình — sau mọi thao tác đổi độ trong suốt (ghost, kính tầng IoT)
   * vì Fragments đặt lại tô sáng khi đổi opacity. `ids`: chỉ áp cho các cấu kiện này (mặc định: mọi cấu kiện có màu).
   */
  const reapplyGroupColors = async (modelId: string, model: FRAGS.FragmentsModel, ids?: Iterable<number>) => {
    const materials = colorsRef.current.get(modelId);
    if (!materials) return;
    const byMaterial = new Map<FRAGS.MaterialDefinition, number[]>();
    const add = (material: FRAGS.MaterialDefinition | undefined, id: number) => {
      if (!material) return;
      const list = byMaterial.get(material);
      if (list) list.push(id);
      else byMaterial.set(material, [id]);
    };
    if (ids) for (const id of ids) add(materials.get(id), id);
    else materials.forEach((material, id) => add(material, id));
    for (const [material, list] of byMaterial) await model.highlight(list, material);
  };

  /** Phủ vật liệu xuyên thấu lên mọi cấu kiện có hình học của mô hình */
  const applyGhostToAll = async (model: FRAGS.FragmentsModel) => {
    await model.highlight(await model.getItemsIdsWithGeometry(), ghostAppearance());
  };

  /** Áp lại màu cho một cấu kiện theo thứ tự ưu tiên chung (xem resolveItemAppearance) */
  const restoreItemColor = async (modelId: string, id: number, ignoreSelection = false) => {
    const m = getModel(modelId);
    if (!m) return;
    const groupMat = colorsRef.current.get(modelId)?.get(id);
    switch (
      resolveItemAppearance({
        selected: !ignoreSelection && isSelected(modelId, id),
        groupColored: !!groupMat,
        ghost: ghostRef.current,
      })
    ) {
      case 'selection':
        await m.highlight([id], SELECTION_MATERIAL);
        break;
      case 'group':
        await m.highlight([id], groupMat!);
        break;
      case 'ghost':
        await m.highlight([id], ghostAppearance());
        break;
      default:
        await m.resetHighlight([id]);
    }
  };

  /** Quên mọi dữ liệu đệm theo mô hình (hộp bao, tên, lựa chọn) khi mô hình bị gỡ hoặc dịch toạ độ */
  const forgetModelCaches = (modelId: string, opts: { selection?: boolean } = {}) => {
    boxesCacheRef.current.delete(modelId);
    if (!opts.selection) return;
    const prefix = `${modelId}:`;
    for (const key of [...nameCacheRef.current.keys()]) if (key.startsWith(prefix)) nameCacheRef.current.delete(key);
    selectionSetRef.current.delete(modelId);
    if (hoverRef.current?.modelId === modelId) hoverRef.current = null;
  };

  const isSelected = (modelId: string, id: number) => !!selectionSetRef.current.get(modelId)?.has(id);

  const selectionList = () => {
    const out: { modelId: string; expressId: number }[] = [];
    selectionSetRef.current.forEach((ids, modelId) => ids.forEach((expressId) => out.push({ modelId, expressId })));
    return out;
  };

  const notifySelectionCount = () => onSelectionCountChangeRef.current?.(selectionList().length);

  /** Bỏ tô sáng toàn bộ cấu kiện đang chọn (trả lại màu nhóm/màu gốc) */
  const clearSelectionHighlight = async () => {
    for (const { modelId, expressId } of selectionList()) {
      await restoreItemColor(modelId, expressId, true);
    }
    selectionSetRef.current.clear();
    selectionRef.current = null;
  };

  const addToSelection = async (modelId: string, id: number) => {
    if (
      visibilityRef.current.get(modelId)?.contextOnly?.has(id) ||
      visibilityRef.current.get(modelId)?.annotationHidden?.has(id)
    )
      return;
    let set = selectionSetRef.current.get(modelId);
    if (!set) {
      set = new Set();
      selectionSetRef.current.set(modelId, set);
    }
    set.add(id);
    selectionRef.current = { modelId, id };
    const m = getModel(modelId);
    if (m) {
      if (ghostRef.current) await m.resetOpacity([id]);
      await m.highlight([id], SELECTION_MATERIAL);
    }
  };

  const removeFromSelection = async (modelId: string, id: number) => {
    selectionSetRef.current.get(modelId)?.delete(id);
    await restoreItemColor(modelId, id, true);
    if (selectionRef.current?.modelId === modelId && selectionRef.current.id === id) {
      const rest = selectionList();
      selectionRef.current = rest.length ? { modelId: rest[0].modelId, id: rest[0].expressId } : null;
    }
  };

  const queueAppearance = (task: () => Promise<void>) => {
    const pending = colorizeQueueRef.current.then(task);
    colorizeQueueRef.current = pending.catch(() => undefined);
    return pending;
  };

  const refreshSelectionAppearance = () =>
    syncSelectionAppearance(loadedRef.current, selectionSetRef.current, outlinerRef.current, ghostRef.current);

  const applySelection = (modelId: string | null, id: number | null, additive = false) =>
    queueAppearance(async () => {
      try {
        if (modelId === null || id === null) {
          await clearSelectionHighlight();
        } else if (additive) {
          if (isSelected(modelId, id)) await removeFromSelection(modelId, id);
          else await addToSelection(modelId, id);
        } else {
          await clearSelectionHighlight();
          await addToSelection(modelId, id);
        }
        await refreshSelectionAppearance();
        notifySelectionCount();
        settleUpdate();
      } catch (err) {
        console.warn('Không tô sáng được cấu kiện:', err);
      }
    });

  /** Chọn hàng loạt nhiều cấu kiện (tối ưu tô sáng theo lô trong 1 lần gọi) */
  const selectManyElements = (items: { modelId: string; expressId: number }[], options?: { additive?: boolean }) =>
    queueAppearance(async () => {
      try {
        const additive = !!options?.additive;
        if (!additive) {
          await clearSelectionHighlight();
        }
        const grouped = new Map<string, number[]>();
        for (const { modelId, expressId } of items) {
          if (
            visibilityRef.current.get(modelId)?.contextOnly?.has(expressId) ||
            visibilityRef.current.get(modelId)?.annotationHidden?.has(expressId)
          )
            continue;
          let set = selectionSetRef.current.get(modelId);
          if (!set) {
            set = new Set();
            selectionSetRef.current.set(modelId, set);
          }
          set.add(expressId);
          let list = grouped.get(modelId);
          if (!list) {
            list = [];
            grouped.set(modelId, list);
          }
          list.push(expressId);
        }
        for (const [modelId, ids] of grouped.entries()) {
          const m = getModel(modelId);
          if (m && ids.length) {
            await m.highlight(ids, SELECTION_MATERIAL);
            if (ghostRef.current) await m.resetOpacity(ids);
          }
        }
        await refreshSelectionAppearance();
        const total = selectionList();
        if (items.length > 0) {
          const last = items[items.length - 1];
          selectionRef.current = { modelId: last.modelId, id: last.expressId };
          const info = await describeItem(last.modelId, last.expressId);
          onElementSelectedRef.current?.(info, { additive, count: total.length });
        } else if (!additive) {
          selectionRef.current = null;
          onElementSelectedRef.current?.(null, { additive: false, count: 0 });
        }
        notifySelectionCount();
        settleUpdate();
      } catch (err) {
        console.warn('Lỗi chọn hàng loạt cấu kiện:', err);
      }
    });

  const applyVisibility = async (modelId: string) => {
    const m = getModel(modelId);
    const state = visibilityRef.current.get(modelId);
    if (!m) return;
    const floor = iotFloorRef.current?.get(modelId);
    // IoT floor isolation is temporary; manual visibility is restored when leaving it.
    const floorState = iotFloorRef.current
      ? {
          isolated: floor?.model === m ? floor.ids : new Set<number>(),
          hidden: new Set<number>(),
          filterHidden: new Set<number>(),
          classificationHidden: state?.classificationHidden,
          annotationHidden: state?.annotationHidden,
        }
      : state;
    await applyBimVisibility(m, floorState, iotFloorRef.current ? undefined : colorHiddenRef.current.get(modelId));
    settleUpdate();
  };

  const visibilityOf = (modelId: string): VisibilityState => {
    let state = visibilityRef.current.get(modelId);
    if (!state) {
      state = { isolated: null, hidden: new Set(), filterHidden: new Set() };
      visibilityRef.current.set(modelId, state);
    }
    return state;
  };

  /** Cô lập theo danh sách cấu kiện của từng mô hình (mô hình không có trong danh sách bị ẩn hết), bỏ ẩn tay */
  const isolateByModel = async (byModel: Map<string, number[]>) => {
    for (const id of loadedRef.current.keys()) {
      const state = visibilityOf(id);
      state.hidden.clear();
      state.isolated = new Set(byModel.get(id) || []);
      await applyVisibility(id);
    }
  };

  const restoreIotFloor = async () => {
    const previous = iotFloorRef.current;
    iotFloorRef.current = null;
    if (!previous) return;
    for (const [modelId, floor] of previous) {
      const model = getModel(modelId);
      if (!model || model !== floor.model || !floor.glassIds.length) continue;
      if (ghostRef.current) await model.setOpacity(floor.glassIds, ghostOpacityRef.current);
      else await model.resetOpacity(floor.glassIds);
      // Opacity operations can reset highlights: restore the user's material groups.
      await reapplyGroupColors(modelId, model, floor.glassIds);
    }
    for (const modelId of loadedRef.current.keys()) await applyVisibility(modelId);
    await refreshSelectionAppearance();
    settleUpdate();
  };

  /** Chế độ xuyên thấu: toàn bộ cấu kiện mờ, giữ màu nhóm và màu chọn */
  const setGhostMode = (active: boolean, opacity = 0.15) =>
    queueAppearance(async () => {
      ghostRef.current = active;
      ghostOpacityRef.current = Math.max(0.02, Math.min(0.5, opacity));
      // COLOR_PEN_SHADOWS renders an opaque depth/edge composite even for transparent
      // fragments. Use the normal renderer while looking through the building.
      if (worldRef.current?.renderer)
        worldRef.current.renderer.postproduction.enabled =
          !active && qualityRef.current === 'cao' && !movingRef.current;
      for (const [modelId, m] of loadedRef.current) {
        await m.setLodMode(
          active || qualityRef.current === 'cao' || worldRef.current?.camera.projection.current === 'Orthographic'
            ? FRAGS.LodMode.ALL_GEOMETRY
            : FRAGS.LodMode.DEFAULT,
        );
        if (active) {
          await m.resetHighlight(undefined);
          await applyGhostToAll(m);
        } else {
          await m.resetHighlight(undefined);
          await m.resetOpacity(undefined);
        }
        // Đổi độ trong suốt làm mất màu tô → áp lại màu nhóm & màu chọn
        await reapplyGroupColors(modelId, m);
        const sel = selectionRef.current;
        if (sel?.modelId === modelId) await m.highlight([sel.id], SELECTION_MATERIAL);
      }
      await refreshSelectionAppearance();
      settleUpdate();
    });

  /** Tô màu theo nhóm (thay thế hoặc cộng dồn); nhóm visible=false bị ẩn riêng (4D) */
  const colorize = (groups: BimColorGroup[] | null, options?: { accumulate?: boolean }) => {
    const epoch = options?.accumulate ? null : ++colorizeEpochRef.current;
    const p = colorizeQueueRef.current
      .then(async () => {
        if (epoch !== null && epoch !== colorizeEpochRef.current) return;
        const accumulate = options?.accumulate === true;
        if (!accumulate || groups === null) {
          for (const [modelId, m] of loadedRef.current) {
            if (colorsRef.current.get(modelId)?.size) await m.resetHighlight(undefined);
            // Fragment resetHighlight can also restore opacity. Preserve the building
            // context before applying the opaque device highlights again.
            if (ghostRef.current) await applyGhostToAll(m);
            colorsRef.current.set(modelId, new Map());
          }
        }
        // Keep schedule hiding separate from manual visibility. Restore it when 4D closes
        // or another colouring mode takes over, without revealing manually hidden items.
        const previouslyHidden = new Set(colorHiddenRef.current.keys());
        if (!accumulate || groups === null) colorHiddenRef.current.clear();
        for (const g of groups || []) {
          if (g.visible !== false) continue;
          let hidden = colorHiddenRef.current.get(g.modelId);
          if (!hidden) {
            hidden = new Set();
            colorHiddenRef.current.set(g.modelId, hidden);
          }
          g.ids.forEach((id) => hidden!.add(id));
        }
        for (const id of new Set([...previouslyHidden, ...colorHiddenRef.current.keys()])) await applyVisibility(id);
        if (!groups || groups.length === 0) {
          await refreshSelectionAppearance();
          settleUpdate();
          return;
        }
        for (const g of groups) {
          const m = getModel(g.modelId);
          if (!m || !g.ids || g.ids.length === 0) continue;
          const mat: FRAGS.MaterialDefinition = {
            color: new THREE.Color(g.color),
            renderedFaces: FRAGS.RenderedFaces.TWO,
            opacity: g.opacity ?? 1,
            transparent: (g.opacity ?? 1) < 1,
            depthWrite: (g.opacity ?? 1) >= 1,
          };
          let map = colorsRef.current.get(g.modelId);
          if (!map) {
            map = new Map();
            colorsRef.current.set(g.modelId, map);
          }
          g.ids.forEach((id) => map!.set(id, mat));
          await m.highlight(g.ids, mat);
          // The material already carries explicit opacity. resetOpacity() here
          // would switch Fragments back to preserving the original device color.
        }
        await refreshSelectionAppearance();
        settleUpdate();
      })
      .catch((err) => {
        console.error('Lỗi khi tô màu mô hình BIM:', err);
      });
    colorizeQueueRef.current = p;
    return p;
  };

  return {
    ghostAppearance,
    reapplyGroupColors,
    applyGhostToAll,
    restoreItemColor,
    forgetModelCaches,
    isSelected,
    selectionList,
    notifySelectionCount,
    clearSelectionHighlight,
    addToSelection,
    removeFromSelection,
    queueAppearance,
    refreshSelectionAppearance,
    applySelection,
    selectManyElements,
    applyVisibility,
    visibilityOf,
    isolateByModel,
    restoreIotFloor,
    setGhostMode,
    colorize,
  };
}

export type ViewerAppearance = ReturnType<typeof useAppearance>;
