import { formatNumber, formatDateTime } from '@/lib/utils';
// API điều khiển của trình xem (BimViewerRef) chia theo nhóm; BimViewer gộp các nhóm trong useImperativeHandle.
import type { Dispatch, SetStateAction } from 'react';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { captureVisibility, planVisibility } from '../lib/viewpointState';
import { sanitizeMeasurements } from '../lib/measureRecords';
import { toVec3, unwrap } from '../lib/viewerConstants';
import { resolveIotFloor, type IotFloorGeometry } from '../lib/iotFloorView';
import type { LazySpatialTree } from '../lib/spatialTree';
import { IotSensorLayer } from './iotSensorLayer';
import { FacilityAssetLayer } from './facilityAssetLayer';
import { categoryItemIds } from './geometry';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { GeometryQueries } from './geometry';
import type { ViewerAppearance } from './useAppearance';
import type { MeasureTool } from './useMeasureTool';
import type { SectionGizmo } from './useSectionGizmo';
import type { BimViewerRef, BimColorGroup, BimCategoryGroup, BimSpatialNode } from './types';

export interface ViewerHandleDeps {
  ctx: ViewerContext;
  core: ViewerCore;
  geometry: GeometryQueries;
  appearance: ViewerAppearance;
  measure: MeasureTool;
  section: SectionGizmo;
  setFailedLoads: Dispatch<SetStateAction<{ id: string; name: string; message: string }[]>>;
}

/** Camera và khung nhìn: khớp mô hình, hướng nhìn chuẩn, phép chiếu, chế độ điều hướng, chất lượng, tư thế camera */
export const createCameraApi = ({
  ctx,
  core,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  | 'fitToModel'
  | 'resetView'
  | 'setView'
  | 'getSceneBox'
  | 'setProjection'
  | 'viewPlan'
  | 'setNavMode'
  | 'setQuality'
  | 'focus'
  | 'getCameraPose'
  | 'setCameraPose'
> => {
  const { containerRef, worldRef, qualityRef, fragmentsRef, loadedRef, ghostRef, appliedPoseRef } = ctx;
  const { getModel, settleUpdate, applyQuality, ensureCameraReady, sceneBox, fitCameraToScene, viewPreset } = core;
  return {
    fitToModel: () => fitCameraToScene(true),
    resetView: () => {
      if (sceneBox()) fitCameraToScene(true);
      else {
        worldRef.current?.camera?.controls?.setLookAt(15, 15, 15, 0, 0, 0, true);
        settleUpdate();
      }
    },
    setView: viewPreset,
    getSceneBox: () => {
      const box = sceneBox();
      return box ? { min: toVec3(box.min), max: toVec3(box.max) } : null;
    },
    setProjection: async (projection) => {
      const world = worldRef.current;
      if (!world) return;
      await world.camera.projection.set(projection);
      // Orthographic zoom does not reduce camera distance. Distance-based LOD
      // otherwise turns a close floor plan into bounding boxes and drops labels.
      const lod =
        projection === 'Orthographic' || qualityRef.current === 'cao' || ghostRef.current
          ? FRAGS.LodMode.ALL_GEOMETRY
          : FRAGS.LodMode.DEFAULT;
      await Promise.all([...loadedRef.current.values()].map((model) => model.setLodMode(lod)));
      settleUpdate();
    },
    viewPlan: async (groups) => {
      const world = worldRef.current;
      if (!world || !ensureCameraReady()) return;
      const bounds = new THREE.Box3();
      const boxes = await Promise.all(
        groups.map(async (group) => {
          const model = getModel(group.modelId);
          return model && group.ids.length ? model.getMergedBox(group.ids) : null;
        }),
      );
      for (const box of boxes) if (box && !box.isEmpty()) bounds.union(box);
      if (bounds.isEmpty()) throw new Error('Không có hình học mặt bằng để định vị.');
      await world.camera.projection.set('Orthographic');
      await Promise.all([...loadedRef.current.values()].map((model) => model.setLodMode(FRAGS.LodMode.ALL_GEOMETRY)));
      const center = bounds.getCenter(new THREE.Vector3());
      const distance = Math.max(bounds.getSize(new THREE.Vector3()).length() * 2, 20);
      await world.camera.controls.setLookAt(
        center.x,
        center.y + distance,
        center.z + 0.001,
        center.x,
        center.y,
        center.z,
        false,
      );
      await world.camera.controls.fitToBox(bounds, true, {
        paddingLeft: 3,
        paddingRight: 3,
        paddingTop: 3,
        paddingBottom: 3,
      });
      settleUpdate();
    },
    setNavMode: (mode) => {
      try {
        worldRef.current?.camera.set(mode);
      } catch (err) {
        console.warn('Không đổi được chế độ điều hướng:', err);
      }
    },
    setQuality: (quality) => applyQuality(quality),
    focus: () => containerRef.current?.focus({ preventScroll: true }),
    getCameraPose: () => {
      const controls = worldRef.current?.camera?.controls;
      if (!controls) return null;
      const pos = new THREE.Vector3();
      const tgt = new THREE.Vector3();
      controls.getPosition(pos);
      controls.getTarget(tgt);
      return { position: toVec3(pos), target: toVec3(tgt) };
    },
    setCameraPose: (pose) => {
      const controls = worldRef.current?.camera?.controls;
      if (!controls) return;
      appliedPoseRef.current = [...pose.position, ...pose.target].map((n) => n.toFixed(3)).join(',');
      controls.setLookAt(...pose.position, ...pose.target, false).catch(() => undefined);
      fragmentsRef.current?.core.update();
    },
  };
};

/** Góc nhìn lưu trữ: camera + mặt cắt + hiển thị + lựa chọn + ghost + phép đo */
export const createViewpointApi = ({
  ctx,
  core,
  appearance,
  measure,
  section,
}: ViewerHandleDeps): Pick<BimViewerRef, 'getViewpoint' | 'setViewpoint'> => {
  const {
    worldRef,
    selectionSetRef,
    loadedRef,
    selectionRef,
    visibilityRef,
    ghostRef,
    ghostOpacityRef,
    clipPlanesRef,
    measurementsRef,
  } = ctx;
  const { settleUpdate, ensureCameraReady } = core;
  const { applySelection, selectManyElements, applyVisibility, visibilityOf } = appearance;
  const { addMeasurement, clearMeasurements } = measure;
  const { applyClipPlanes } = section;
  return {
    getViewpoint: () => {
      const world = worldRef.current;
      if (!world) return null;
      const target = world.camera.controls.getTarget(new THREE.Vector3());
      const sel = selectionRef.current;
      const loadedIds = [...loadedRef.current.keys()];
      const visibility = captureVisibility(loadedIds, (id) => visibilityRef.current.get(id));
      // Trường cũ vẫn ghi cho mô hình đang chọn (hoặc mô hình đầu tiên) để BCF và bản cũ đọc được
      const legacyModel = sel?.modelId ?? loadedIds[0];
      const legacy = legacyModel ? visibility[legacyModel] : undefined;
      const selection = [...selectionSetRef.current.entries()]
        .filter(([modelId, ids]) => ids.size && loadedRef.current.has(modelId))
        .map(([modelId, ids]) => ({ modelId, ids: [...ids] }));
      return {
        camera: {
          position: toVec3(world.camera.three.position),
          target: toVec3(target),
          fov: (world.camera.three as THREE.PerspectiveCamera).fov,
        },
        sectionPlanes: clipPlanesRef.current.map((p) => ({ normal: toVec3(p.normal), constant: p.constant })),
        isolatedIds: legacy?.isolated?.length ? legacy.isolated : undefined,
        hiddenIds: legacy?.hidden.length ? legacy.hidden : undefined,
        selectedIds: sel ? [sel.id] : undefined,
        modelIds: legacyModel ? [legacyModel, ...loadedIds.filter((id) => id !== legacyModel)] : loadedIds,
        visibility,
        selection: selection.length ? selection : undefined,
        ghost: { active: ghostRef.current, opacity: ghostOpacityRef.current },
        measurements: measurementsRef.current.length ? measurementsRef.current.map((m) => m.record) : undefined,
      };
    },
    setViewpoint: async (vp) => {
      const world = worldRef.current;
      if (!world || !ensureCameraReady()) return;
      const [px, py, pz] = vp.camera.position;
      const [tx, ty, tz] = vp.camera.target;
      const cam = world.camera.three;
      if (
        cam instanceof THREE.PerspectiveCamera &&
        Number.isFinite(vp.camera.fov) &&
        vp.camera.fov! > 5 &&
        vp.camera.fov! < 120 &&
        cam.fov !== vp.camera.fov
      ) {
        cam.fov = vp.camera.fov!;
        cam.updateProjectionMatrix();
      }
      world.camera.controls.setLookAt(px, py, pz, tx, ty, tz, true);
      applyClipPlanes((vp.sectionPlanes || []).map((p) => new THREE.Plane(new THREE.Vector3(...p.normal), p.constant)));
      // Phép đo lưu cùng góc nhìn: dựng lại đúng như lúc lưu (góc nhìn không có phép đo thì xoá phép đo hiện tại)
      clearMeasurements();
      sanitizeMeasurements(vp.measurements).forEach(addMeasurement);
      const loadedIds = [...loadedRef.current.keys()];
      const plan = planVisibility(vp, loadedIds);
      for (const [id, entry] of plan) {
        const state = visibilityOf(id);
        state.hidden = entry.hidden;
        state.isolated = entry.isolated;
        // Góc nhìn mới đã gộp phần ẩn của bộ lọc/cây vào hidden: bỏ lớp lọc cũ để thấy đúng như lúc lưu
        if (vp.visibility) {
          state.filterHidden = new Set();
          state.classificationHidden?.clear();
        }
        await applyVisibility(id);
      }
      const selection = vp.selection
        ?.filter((s) => loadedRef.current.has(s.modelId))
        .flatMap((s) => s.ids.map((expressId) => ({ modelId: s.modelId, expressId })));
      if (selection?.length) await selectManyElements(selection);
      else if (vp.selectedIds?.length) {
        const legacyModel = vp.modelIds?.find((id) => loadedRef.current.has(id)) ?? loadedIds[0];
        if (legacyModel) await applySelection(legacyModel, vp.selectedIds[0]);
      } else {
        // Góc nhìn không có lựa chọn: bỏ lựa chọn của góc nhìn trước (kể cả cấu kiện đang bị ẩn)
        await selectManyElements([]);
      }
      settleUpdate();
    },
  };
};

/** Hiển thị: ẩn, cô lập, lọc, theo danh mục, xuyên thấu (ghost), tô màu nhóm */
type VisibilityApi = Pick<
  BimViewerRef,
  | 'hideElements'
  | 'isolateElements'
  | 'isolateMany'
  | 'isolateCategories'
  | 'xrayCategories'
  | 'highlightCategories'
  | 'showAll'
  | 'setClassificationHidden'
  | 'setFilterHidden'
  | 'setGhostMode'
  | 'colorize'
>;

export const createVisibilityApi = (deps: ViewerHandleDeps): VisibilityApi => {
  const api = visibilityApi(deps);
  // Ẩn/hiện cấu kiện khi đang cắt: dựng lại viền và nắp để không còn nắp của cấu kiện đã ẩn
  const refreshSection =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const out = await fn(...args);
      if (deps.ctx.clipPlanesRef.current.length) deps.section.scheduleOutline(true);
      return out;
    };
  return {
    ...api,
    hideElements: refreshSection(api.hideElements),
    isolateElements: refreshSection(api.isolateElements),
    isolateMany: refreshSection(api.isolateMany),
    isolateCategories: refreshSection(api.isolateCategories),
    showAll: refreshSection(api.showAll),
    setClassificationHidden: refreshSection(api.setClassificationHidden),
    setFilterHidden: refreshSection(api.setFilterHidden),
  };
};

const visibilityApi = ({ ctx, core, geometry, appearance }: ViewerHandleDeps): VisibilityApi => {
  const { loadedRef } = ctx;
  const { settleUpdate } = core;
  const { findCategoryItems } = geometry;
  const { applyVisibility, visibilityOf, isolateByModel, setGhostMode, colorize } = appearance;
  return {
    hideElements: async (modelId, ids) => {
      const state = visibilityOf(modelId);
      ids.forEach((id) => state.hidden.add(id));
      if (state.isolated) ids.forEach((id) => state.isolated!.delete(id));
      await applyVisibility(modelId);
    },
    isolateElements: async (modelId, ids) => {
      if (ids.length === 0) return;
      await isolateByModel(new Map([[modelId, ids]]));
    },
    isolateMany: async (groups) => {
      const byModel = new Map(groups.map((g) => [g.modelId, g.ids]));
      if (groups.every((g) => g.ids.length === 0)) return;
      await isolateByModel(byModel);
      settleUpdate();
    },
    isolateCategories: async (categoryNames: string[]) => {
      const groups = await findCategoryItems(categoryNames);
      const totalFound = groups.reduce((count, group) => count + group.ids.length, 0);
      if (totalFound > 0) {
        await isolateByModel(new Map(groups.map((g) => [g.modelId, g.ids])));
        settleUpdate();
      }
      return { found: totalFound };
    },
    xrayCategories: async (categoryNames: string[], color?: string) => {
      const groups: BimColorGroup[] = (await findCategoryItems(categoryNames))
        .filter((g) => g.ids.length)
        .map((g) => ({ modelId: g.modelId, color: color || '#2563eb', ids: g.ids }));
      return { found: groups.reduce((count, group) => count + group.ids.length, 0), groups };
    },
    highlightCategories: async (categoryNames: string[], color?: string) => {
      const groups: BimColorGroup[] = (await findCategoryItems(categoryNames))
        .filter((g) => g.ids.length)
        .map((g) => ({ modelId: g.modelId, color: color || '#7c3aed', ids: g.ids }));
      return { found: groups.reduce((count, group) => count + group.ids.length, 0), groups };
    },
    showAll: async () => {
      for (const id of loadedRef.current.keys()) {
        const state = visibilityOf(id);
        state.hidden.clear();
        state.isolated = null;
        state.classificationHidden?.clear();
        await applyVisibility(id);
      }
    },
    setClassificationHidden: async (modelId, ids) => {
      visibilityOf(modelId).classificationHidden = new Set(ids);
      await applyVisibility(modelId);
    },
    setFilterHidden: async (modelId, ids) => {
      visibilityOf(modelId).filterHidden = new Set(ids);
      await applyVisibility(modelId);
    },
    setGhostMode,
    colorize,
  };
};

/** Lựa chọn cấu kiện và bay tới cấu kiện */
export const createSelectionApi = ({
  ctx,
  core,
  appearance,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  'setSelection' | 'flyToElement' | 'flyToGuid' | 'selectMany' | 'setBoxSelectMode' | 'isBoxSelectMode' | 'getSelection'
> => {
  const { boxSelectModeRef, loadedRef } = ctx;
  const { getModel, flyToBox, describeItem } = core;
  const { selectionList, applySelection, selectManyElements } = appearance;
  return {
    setSelection: (modelId, expressId) => {
      applySelection(modelId, expressId);
    },
    flyToElement: async (modelId, expressId) => {
      if (
        ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(expressId) ||
        ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(expressId)
      )
        return;
      const m = getModel(modelId);
      if (!m) return;
      await applySelection(modelId, expressId);
      try {
        flyToBox(await m.getMergedBox([expressId]));
      } catch (err) {
        console.warn('Không bay tới được cấu kiện:', err);
      }
    },
    flyToGuid: async (guid) => {
      for (const [modelId, m] of loadedRef.current) {
        const [localId] = await m.getLocalIdsByGuids([guid]);
        if (
          localId === null ||
          localId === undefined ||
          ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(localId) ||
          ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(localId)
        )
          continue;
        await applySelection(modelId, localId);
        flyToBox(await m.getMergedBox([localId]));
        return describeItem(modelId, localId);
      }
      return null;
    },
    selectMany: async (items, options) => {
      await selectManyElements(items, options);
    },
    setBoxSelectMode: (enabled) => {
      boxSelectModeRef.current = enabled;
    },
    isBoxSelectMode: () => boxSelectModeRef.current,
    getSelection: () => selectionList(),
  };
};

/** Mặt cắt, hộp cắt, viền cắt, chọn mặt canh mặt cắt */
export const createSectionApi = ({
  section,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  | 'setClipPlanes'
  | 'setSectionOutline'
  | 'setSectionCaps'
  | 'getSectionCapStats'
  | 'pickFace'
  | 'cancelPickFace'
  | 'setSectionHandle'
  | 'setSectionBoxHandles'
> => {
  const {
    setClipPlanes,
    setSectionOutline,
    setSectionCaps,
    getSectionCapStats,
    pickFace,
    cancelPickFace,
    setSectionHandle,
    setSectionBoxHandles,
  } = section;
  return {
    setClipPlanes,
    setSectionOutline,
    setSectionCaps,
    getSectionCapStats,
    pickFace,
    cancelPickFace,
    setSectionHandle,
    setSectionBoxHandles,
  };
};

/** Đo đạc và ghim tâm va chạm */
export const createMeasureApi = ({
  ctx,
  measure,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  | 'clearMeasurements'
  | 'getMeasurements'
  | 'setMeasurements'
  | 'removeMeasurement'
  | 'undoMeasure'
  | 'measureSelectionClearance'
  | 'measureSelectionBox'
  | 'setClashMarker'
  | 'setSnapping'
> => {
  const { measurementsRef, snapEnabledRef } = ctx;
  const {
    addMeasurement,
    removeMeasurement,
    clearMeasurements,
    undoMeasure,
    setClashMarker,
    measureSelectionClearance,
    measureSelectionBox,
  } = measure;
  return {
    clearMeasurements,
    getMeasurements: () => measurementsRef.current.map((m) => m.record),
    setMeasurements: (records) => {
      clearMeasurements();
      sanitizeMeasurements(records).forEach(addMeasurement);
    },
    removeMeasurement,
    undoMeasure,
    measureSelectionClearance,
    measureSelectionBox,
    setClashMarker,
    setSnapping: (enabled) => {
      snapEnabledRef.current = enabled;
    },
  };
};

/** Lớp phủ: cảm biến IoT, thiết bị bảo trì, ghim vướng mắc, ảnh nền mặt đất */
export const createLayersApi = ({
  ctx,
  core,
  appearance,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  | 'getIotOverlayHost'
  | 'resetIotFloorView'
  | 'focusIotSensors'
  | 'setIotSensors'
  | 'setFacilityAssets'
  | 'setPins'
  | 'setGroundImage'
> => {
  const {
    worldRef,
    markerRef,
    iotLayerRef,
    facilityLayerRef,
    facilityHostRef,
    iotFocusEpochRef,
    iotFloorRef,
    iotHostRef,
    loadedRef,
    colorHiddenRef,
    groundRef,
    onElementSelectedRef,
    onPinClickRef,
  } = ctx;
  const { getModel, settleUpdate, sceneBox, fitCameraToScene, flyToBox } = core;
  const {
    notifySelectionCount,
    clearSelectionHighlight,
    queueAppearance,
    refreshSelectionAppearance,
    applyVisibility,
    visibilityOf,
    restoreIotFloor,
  } = appearance;
  return {
    getIotOverlayHost: () => iotHostRef.current,
    resetIotFloorView: async () => {
      ++iotFocusEpochRef.current;
      await queueAppearance(restoreIotFloor);
    },
    focusIotSensors: async (groups, floorKey) => {
      const epoch = ++iotFocusEpochRef.current;
      if (!groups) {
        await queueAppearance(async () => {
          if (epoch !== iotFocusEpochRef.current) return;
          await restoreIotFloor();
          colorHiddenRef.current.clear();
          for (const modelId of loadedRef.current.keys()) {
            const state = visibilityOf(modelId);
            state.isolated = null;
            state.hidden.clear();
            state.filterHidden.clear();
            await applyVisibility(modelId);
          }
          if (epoch === iotFocusEpochRef.current) fitCameraToScene(true);
        });
        return { found: 0, total: 0, applied: true };
      }
      if (floorKey) {
        const floors = await Promise.all(
          [...loadedRef.current].map(async ([modelId, model]) => {
            const floor = await resolveIotFloor(model, floorKey);
            if (!floor || !floor.ids.size) return null;
            model.object.updateMatrixWorld(true);
            return { modelId, floor, box: await model.getMergedBox([...floor.ids]) };
          }),
        );
        const bounds = new THREE.Box3();
        const byModel = new Map<string, IotFloorGeometry>();
        let glassCount = 0;
        let found = 0;
        for (const result of floors) {
          if (!result || result.box.isEmpty()) continue;
          byModel.set(result.modelId, result.floor);
          bounds.union(result.box);
          glassCount += result.floor.glassIds.length;
          found += result.floor.ids.size;
        }
        if (epoch !== iotFocusEpochRef.current) return { found: 0, total: 0, applied: false };
        if (bounds.isEmpty()) {
          await queueAppearance(async () => {
            if (epoch === iotFocusEpochRef.current) await restoreIotFloor();
          });
          return { found: 0, total: 0, applied: false };
        }
        let applied = false;
        await queueAppearance(async () => {
          if (epoch !== iotFocusEpochRef.current) return;
          await restoreIotFloor();
          if (epoch !== iotFocusEpochRef.current) return;
          await clearSelectionHighlight();
          notifySelectionCount();
          onElementSelectedRef.current?.(null, { additive: false, count: 0 });
          iotFloorRef.current = byModel;
          for (const modelId of loadedRef.current.keys()) await applyVisibility(modelId);
          for (const floor of byModel.values())
            if (floor.glassIds.length) await floor.model.setOpacity(floor.glassIds, 0.12);
          await refreshSelectionAppearance();
          if (epoch !== iotFocusEpochRef.current) return;
          bounds.expandByVector(new THREE.Vector3(3, 2, 3));
          flyToBox(bounds);
          applied = true;
        });
        return { found, total: found, applied, isolated: applied, glassCount: applied ? glassCount : 0 };
      }
      const total = groups.reduce((count, group) => count + group.guids.length, 0);
      const results = await Promise.all(
        groups.map(async (group) => {
          const model = getModel(group.modelId);
          if (!model) return { box: null, found: 0 };
          const ids = (await model.getLocalIdsByGuids(group.guids)).filter(
            (id): id is number => typeof id === 'number',
          );
          if (!ids.length) return { box: null, found: 0 };
          model.object.updateMatrixWorld(true);
          return { box: await model.getMergedBox(ids), found: ids.length };
        }),
      );
      if (epoch !== iotFocusEpochRef.current) return { found: 0, total, applied: false };
      const bounds = new THREE.Box3();
      let found = 0;
      for (const result of results)
        if (result.box && !result.box.isEmpty()) {
          bounds.union(result.box);
          found += result.found;
        }
      if (bounds.isEmpty()) return { found: 0, total, applied: false };
      // getMergedBox already returns world coordinates, including the federation offset.
      // Keep some facade context around the equipment on the selected floor.
      bounds.expandByVector(new THREE.Vector3(6, 2, 6));
      flyToBox(bounds);
      return { found, total, applied: true };
    },
    setIotSensors: (config) => {
      if (!iotLayerRef.current && config && iotHostRef.current) {
        iotLayerRef.current = new IotSensorLayer(
          iotHostRef.current,
          () => worldRef.current?.camera.three ?? null,
          (modelId) => {
            const m = getModel(modelId);
            return m ? `${m.object.uuid}:${m.object.position.toArray().join(',')}` : null;
          },
          async (modelId, guid) => {
            const m = getModel(modelId);
            if (!m) return null;
            const [id] = await m.getLocalIdsByGuids([guid]);
            if (typeof id !== 'number') return null;
            m.object.updateMatrixWorld(true);
            // Fragments BoxManager already applies object.matrixWorld (including federation offset).
            // Applying the model offset again moves every sensor away from its equipment.
            const box = await m.getMergedBox([id]);
            return box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : null;
          },
        );
      }
      iotLayerRef.current?.update(config);
    },
    setFacilityAssets: (config) => {
      if (!facilityLayerRef.current && config && facilityHostRef.current) {
        facilityLayerRef.current = new FacilityAssetLayer(
          facilityHostRef.current,
          () => worldRef.current?.camera.three ?? null,
          (modelId) => {
            const model = getModel(modelId);
            return model ? `${model.object.uuid}:${model.object.position.toArray().join(',')}` : null;
          },
          async (modelId, guid) => {
            const model = getModel(modelId);
            if (!model) return null;
            const [id] = await model.getLocalIdsByGuids([guid]);
            if (typeof id !== 'number') return null;
            model.object.updateMatrixWorld(true);
            const box = await model.getMergedBox([id]);
            // Fragment bounds already include the federation transform.
            return box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : null;
          },
        );
      }
      facilityLayerRef.current?.update(config);
    },
    setPins: async (pins) => {
      const world = worldRef.current;
      const marker = markerRef.current;
      if (!world || !marker) return;
      marker.dispose();
      for (const pin of pins) {
        let modelId = pin.modelId && getModel(pin.modelId) ? pin.modelId : null;
        let localId = pin.expressId ?? null;
        if (pin.guid) {
          for (const [id, m] of loadedRef.current) {
            if (modelId && modelId !== id) continue;
            const [found] = await m.getLocalIdsByGuids([pin.guid]);
            if (typeof found === 'number') {
              modelId = id;
              localId = found;
              break;
            }
          }
        }
        if (!modelId || localId === null) continue;
        const box = await getModel(modelId)!.getMergedBox([localId]);
        if (!box || box.isEmpty()) continue;
        const el = document.createElement('div');
        el.className =
          'flex items-center justify-center w-6 h-6 rounded-full text-2xs font-bold text-white shadow-lg border-2 border-white cursor-pointer';
        el.style.background = pin.color;
        el.textContent = pin.label;
        if (pin.title) el.title = pin.title;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onPinClickRef.current?.(pin.id);
        });
        marker.create(world, el, box.getCenter(new THREE.Vector3()), true);
      }
    },
    setGroundImage: async (config) => {
      const world = worldRef.current;
      if (!world) return;
      const old = groundRef.current;
      if (old) {
        world.scene.three.remove(old);
        old.geometry.dispose();
        (old.material as THREE.MeshBasicMaterial).map?.dispose();
        (old.material as THREE.Material).dispose();
        groundRef.current = null;
      }
      if (!config) {
        settleUpdate();
        return;
      }
      const texture = await new THREE.TextureLoader().loadAsync(config.url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = world.renderer!.three.capabilities.getMaxAnisotropy();
      const w = Math.max(config.maxX - config.minX, 0.01);
      const d = Math.max(config.maxZ - config.minZ, 0.01);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: config.opacity ?? 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      const box = sceneBox();
      mesh.position.set(
        (config.minX + config.maxX) / 2,
        config.elevation ?? (box ? box.min.y - 0.05 : 0),
        (config.minZ + config.maxZ) / 2,
      );
      mesh.renderOrder = -1;
      mesh.userData.isGround = true;
      world.scene.three.add(mesh);
      groundRef.current = mesh;
      settleUpdate();
    },
  };
};

/** Ảnh chụp khung nhìn (kèm khung tên) */
export const createCaptureApi = ({
  ctx,
}: ViewerHandleDeps): Pick<BimViewerRef, 'captureScreenshot' | 'captureWithTitleBlock' | 'getCanvas'> => {
  const { worldRef } = ctx;
  return {
    getCanvas: () => worldRef.current?.renderer?.three.domElement ?? null,
    captureScreenshot: () => {
      const renderer = worldRef.current?.renderer?.three;
      if (!renderer) return '';
      return renderer.domElement.toDataURL('image/png');
    },
    captureWithTitleBlock: ({ title, subtitle, note }) => {
      const source = worldRef.current?.renderer?.three.domElement;
      if (!source) return '';
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height + Math.round(source.height * 0.11);
      const ctx = canvas.getContext('2d');
      if (!ctx) return source.toDataURL('image/png');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
      // Đóng dấu chìm tên người xuất trên toàn ảnh (J5) — nhận diện nguồn khi ảnh bị chia sẻ ra ngoài
      if (note) {
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = '#0f172a';
        ctx.font = `600 ${Math.max(14, Math.round(source.width / 55))}px sans-serif`;
        ctx.translate(source.width / 2, source.height / 2);
        ctx.rotate(-Math.PI / 9);
        const step = Math.max(160, Math.round(source.width / 5));
        for (let y = -source.height; y < source.height; y += step * 0.6) {
          for (let x = -source.width; x < source.width; x += step * 2) ctx.fillText(note, x, y);
        }
        ctx.restore();
      }
      const blockTop = source.height;
      const blockHeight = canvas.height - blockTop;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(2, canvas.width / 900);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, canvas.width - ctx.lineWidth, canvas.height - ctx.lineWidth);
      ctx.beginPath();
      ctx.moveTo(0, blockTop);
      ctx.lineTo(canvas.width, blockTop);
      ctx.stroke();
      const pad = blockHeight * 0.22;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold ' + Math.round(blockHeight * 0.3) + 'px sans-serif';
      ctx.fillText(title, pad, blockTop + blockHeight * 0.42);
      ctx.fillStyle = '#475569';
      ctx.font = Math.round(blockHeight * 0.22) + 'px sans-serif';
      if (subtitle) ctx.fillText(subtitle, pad, blockTop + blockHeight * 0.72);
      const stamp = note || formatDateTime(new Date());
      const width = ctx.measureText(stamp).width;
      ctx.fillText(stamp, canvas.width - width - pad, blockTop + blockHeight * 0.72);
      return canvas.toDataURL('image/png');
    },
  };
};

/** Dữ liệu mô hình: thuộc tính, danh mục, tầng, cây không gian, hộp bao, lưới tam giác, GUID, độ dịch ghép */
export const createModelDataApi = ({
  ctx,
  core,
  geometry,
  appearance,
  setFailedLoads,
}: ViewerHandleDeps): Pick<
  BimViewerRef,
  | 'retryModel'
  | 'getItemAttributes'
  | 'getCategories'
  | 'getStoreys'
  | 'getSpatialTree'
  | 'getBoxOf'
  | 'getBoxes'
  | 'getItemTriangles'
  | 'getItemsBrief'
  | 'setModelOffset'
  | 'getLocalIdsByGuids'
  | 'getCoordinationOffset'
  | 'mapGuidsToIds'
> => {
  const { modelQueueRef } = ctx;
  const { getModel, settleUpdate } = core;
  const { collectBoxes, storeysOf, readTriangles } = geometry;
  const { forgetModelCaches } = appearance;
  return {
    retryModel: (modelId) => {
      setFailedLoads((list) => list.filter((f) => f.id !== modelId));
      modelQueueRef.current?.retry(modelId);
    },
    getItemAttributes: async (modelId, expressId) => {
      if (
        ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(expressId) ||
        ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(expressId)
      )
        return null;
      const m = getModel(modelId);
      if (!m) return null;
      try {
        const [data] = await m.getItemsData([expressId], { attributesDefault: true });
        if (!data) return null;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v)) continue;
          out[k] = unwrap(v);
        }
        return out;
      } catch {
        return null;
      }
    },
    getCategories: async (modelId) => {
      const m = getModel(modelId);
      if (!m) return [];
      // Chỉ lấy cấu kiện có hình học (bỏ IFCPROJECT, IFCPERSONANDORGANIZATION...)
      const withGeometry = new Set(
        (await m.getItemsIdsWithGeometry()).filter(
          (express_id) =>
            !ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(express_id) &&
            !ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(express_id),
        ),
      );
      const categories = await m.getCategories();
      const result: BimCategoryGroup[] = [];
      for (const category of categories) {
        const ids = await categoryItemIds(m, [new RegExp(`^${category}$`)], withGeometry);
        if (ids.length) result.push({ category, ids });
      }
      return result;
    },
    getStoreys: async (modelId) => {
      const m = getModel(modelId);
      return m ? storeysOf(modelId, m) : [];
    },
    getSpatialTree: async (modelId) => {
      const m = getModel(modelId);
      if (!m) return [];
      const root = await m.getSpatialStructure();
      const withGeometry = new Set(
        (await m.getItemsIdsWithGeometry()).filter(
          (express_id) =>
            !ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(express_id) &&
            !ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(express_id),
        ),
      );
      // Dựng cây từ dưới lên: danh sách cấu kiện của nút cha = gộp của các nút con (không quét lại nhánh)
      const containerIds: number[] = [];
      let counter = 0;
      const build = (node: any, parentKey: string): BimSpatialNode | null => {
        if (!node) return null;
        const localId = typeof node.localId === 'number' ? node.localId : null;
        const category = String(node.category || '');
        const key = `${parentKey}/${category || 'item'}-${localId ?? counter++}`;
        const children: BimSpatialNode[] = [];
        for (const child of node.children || []) {
          const built = build(child, key);
          if (built) children.push(built);
        }
        let ids: number[];
        if (children.length === 0) ids = localId !== null && withGeometry.has(localId) ? [localId] : [];
        else {
          const set = new Set<number>();
          for (const c of children) for (const id of c.ids) set.add(id);
          if (localId !== null && withGeometry.has(localId)) set.add(localId);
          ids = [...set];
        }
        if (ids.length === 0 && children.length === 0) return null;
        // Chỉ đọc tên sẵn cho nút nhóm (công trình, tầng, phòng); tên cấu kiện lá đọc khi mở nút
        if (localId !== null && children.length > 0) containerIds.push(localId);
        return { key, name: category || 'Nhóm', category, localId, ids, children };
      };
      const tree: BimSpatialNode[] = [];
      for (const n of root?.children || []) {
        const built = build(n, 'root');
        if (built) tree.push(built);
      }

      const readNames = async (ids: number[]) => {
        const names = new Map<number, string>();
        if (!ids.length || !getModel(modelId)) return names;
        const data = await m.getItemsData(ids, { attributesDefault: false, attributes: ['Name', 'LongName'] });
        ids.forEach((id, i) => {
          const name = unwrap((data[i] as any)?.Name) || unwrap((data[i] as any)?.LongName);
          if (name) names.set(id, String(name));
        });
        return names;
      };
      if (containerIds.length) {
        const names = await readNames(containerIds);
        const stack = [...tree];
        while (stack.length) {
          const n = stack.pop()!;
          if (n.localId !== null && names.has(n.localId)) n.name = names.get(n.localId)!;
          stack.push(...n.children);
        }
      }
      return Object.assign(tree, { resolveNames: readNames }) as LazySpatialTree<BimSpatialNode>;
    },
    getBoxOf: async (modelId, ids) => {
      const m = getModel(modelId);
      if (!m || ids.length === 0) return null;
      const box = await m.getMergedBox(ids);
      return box && !box.isEmpty() ? { min: toVec3(box.min), max: toVec3(box.max) } : null;
    },
    getBoxes: (modelId, ids) => collectBoxes(modelId, ids),
    getItemTriangles: (modelId, ids) => readTriangles(modelId, ids),
    getItemsBrief: async (modelId, ids) => {
      ids = ids.filter(
        (express_id) =>
          !ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(express_id) &&
          !ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(express_id),
      );
      const m = getModel(modelId);
      const result: Record<number, { name?: string; category?: string; guid?: string }> = {};
      if (!m || ids.length === 0) return result;
      const CHUNK = 2000;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const data = await m.getItemsData(slice, { attributesDefault: false, attributes: ['Name'] });
        data.forEach((item: any, k: number) => {
          result[slice[k]] = {
            name: unwrap(item?.Name) as string | undefined,
            category: unwrap(item?._category) as string | undefined,
            guid: unwrap(item?._guid) as string | undefined,
          };
        });
      }
      return result;
    },
    setModelOffset: (modelId, offset) => {
      const m = getModel(modelId);
      if (!m) return;
      m.object.position.set(offset[0], offset[1], offset[2]);
      m.object.updateMatrixWorld(true);
      // Hộp bao đệm đã cộng độ dịch cũ: chọn quét, bản đồ thu nhỏ và va chạm phải đọc lại
      forgetModelCaches(modelId);
      settleUpdate();
    },
    getLocalIdsByGuids: async (modelId, guids) => {
      const m = getModel(modelId);
      if (!m || guids.length === 0) return [];
      const ids = await m.getLocalIdsByGuids(guids);
      return ids.filter(
        (x): x is number =>
          typeof x === 'number' &&
          !(
            ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(x) ||
            ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(x)
          ),
      );
    },
    getCoordinationOffset: async (modelId, baseModelId) => {
      const m = getModel(modelId);
      const base = getModel(baseModelId);
      if (!m || !base) return null;
      try {
        const own = await m.getCoordinationMatrix();
        const ref = await base.getCoordinationMatrix();
        const t = own.clone().invert().multiply(ref);
        const p = new THREE.Vector3().setFromMatrixPosition(t);
        return [p.x, p.y, p.z];
      } catch {
        return null;
      }
    },
    mapGuidsToIds: async (modelId, guids) => {
      const m = getModel(modelId);
      if (!m || guids.length === 0) return guids.map(() => null);
      const ids = await m.getLocalIdsByGuids(guids);
      return guids.map((_, i) =>
        typeof ids[i] === 'number' &&
        !(
          ctx.visibilityRef.current.get(modelId)?.contextOnly?.has(ids[i] as number) ||
          ctx.visibilityRef.current.get(modelId)?.annotationHidden?.has(ids[i] as number)
        )
          ? (ids[i] as number)
          : null,
      );
    },
  };
};
