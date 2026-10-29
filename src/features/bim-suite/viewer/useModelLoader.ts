// Nạp / gỡ mô hình theo danh sách (hàng đợi ưu tiên mô hình trong khung nhìn), tiến độ, lỗi theo từng mô hình.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import { loadFragBuffer as loadFragWithCache, pinFragCache, prefetchSignedUrls } from '../lib/fragCache';
import { ModelLoadQueue, modelRevision, modelSelectionKey, withModelLoadTimeout } from '../lib/modelLoadQueue';
import { orderModelsByView, readModelBounds, rememberModelBounds } from '../lib/modelBoundsCache';
import { toVec3 } from '../lib/viewerConstants';
import { removeHighlightOverdraw } from '../lib/fragmentHighlightGroups';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { ViewerAppearance } from './useAppearance';
import type { SectionGizmo } from './useSectionGizmo';
import type { BimLoadProgress } from './types';

export function useModelLoader(
  ctx: ViewerContext,
  models: BimModel[],
  setLoadedVersion: Dispatch<SetStateAction<number>>,
  core: Pick<ViewerCore, 'fitCameraToScene' | 'settleUpdate'>,
  appearance: Pick<ViewerAppearance, 'ghostAppearance' | 'forgetModelCaches' | 'notifySelectionCount'>,
  section: Pick<SectionGizmo, 'scheduleOutline'>,
) {
  const {
    worldRef,
    fragmentsRef,
    fragmentsReadyRef,
    loadedRef,
    modelQueueRef,
    loadBufferRef,
    modelsRef,
    userMovedRef,
    qualityRef,
    ghostRef,
    clipPlanesRef,
    colorsRef,
    visibilityRef,
    colorHiddenRef,
    selectionSetRef,
    selectionRef,
    onModelsLoadedRef,
    onLoadProgressRef,
  } = ctx;
  const { fitCameraToScene, settleUpdate } = core;
  const { ghostAppearance, forgetModelCaches, notifySelectionCount } = appearance;
  const { scheduleOutline } = section;
  const [loadingCount, setLoadingCount] = useState(0);
  const [loadProgress, setLoadProgress] = useState<string>('');
  // Tiến độ tổng của đợt nạp hiện tại (hiện thanh nhỏ không chặn thao tác khi đã có mô hình)
  const [loadStatus, setLoadStatus] = useState<BimLoadProgress | null>(null);
  // Đã có ít nhất một mô hình trên cảnh → không che màn hình khi nạp thêm
  const [hasLoadedModel, setHasLoadedModel] = useState(false);
  // Nạp lỗi theo từng mô hình (thử lại riêng từng mô hình)
  const [failedLoads, setFailedLoads] = useState<{ id: string; name: string; message: string }[]>([]);

  const modelKey = modelSelectionKey(models);

  useEffect(() => {
    const world = worldRef.current;
    const fragments = fragmentsRef.current;
    if (!world || !fragments) return;
    const bytes = new Map<string, { loaded: number; total: number; cached: boolean }>();
    let current = '';
    let pending: BimModel[] = [];
    let completed: BimModel[] = [];
    let lastEmit = 0;
    let alive = true;
    const notifyLoaded = () => {
      setLoadedVersion((v) => v + 1);
      onModelsLoadedRef.current?.([...loadedRef.current.keys()]);
    };
    const emit = (force = false) => {
      if (!alive) return;
      const now = Date.now();
      if (!force && now - lastEmit < 120) return;
      lastEmit = now;
      const wanted = [...completed, ...pending];
      const entries = wanted.map((m) => bytes.get(m.id)).filter((b) => !!b);
      const status: BimLoadProgress | null = pending.length
        ? {
            done: completed.length,
            total: wanted.length,
            current,
            bytesLoaded: entries.reduce((n, b) => n + b.loaded, 0),
            bytesKnown: entries.reduce((n, b) => n + b.total, 0),
            fromCache: entries.filter((b) => b.cached).length,
          }
        : null;
      setLoadStatus(status);
      onLoadProgressRef.current?.(status);
    };
    const queue = new ModelLoadQueue<BimModel, FRAGS.FragmentsModel>({
      load: (bm) =>
        withModelLoadTimeout(
          async (signal, touch) => {
            current = bm.file_name;
            setFailedLoads((list) => list.filter((f) => f.id !== bm.id));
            setLoadProgress(`Đang tải mô hình "${bm.file_name}"...`);
            emit(true);
            const customLoad = loadBufferRef.current;
            const buffer = customLoad
              ? await customLoad(bm)
              : await loadFragWithCache(bm, (progress) => {
                  if (!alive || signal.aborted || !queue.isWanted(bm)) return;
                  // Còn nhận dữ liệu thì chưa coi là treo (mạng chậm vẫn nạp được mô hình lớn)
                  touch();
                  bytes.set(bm.id, {
                    loaded: progress.loaded,
                    total: progress.total ?? progress.loaded,
                    cached: !!progress.fromCache,
                  });
                  setLoadProgress(
                    progress.fromCache ? `Mở "${bm.file_name}" từ bộ nhớ đệm...` : `Đang tải "${bm.file_name}"...`,
                  );
                  emit();
                });
            signal.throwIfAborted();
            if (!alive) throw new Error('Trình xem đã đóng');
            bytes.set(bm.id, {
              loaded: buffer.byteLength,
              total: buffer.byteLength,
              cached: bytes.get(bm.id)?.cached ?? false,
            });
            setLoadProgress(`Đang dựng hình học "${bm.file_name}"...`);
            emit(true);
            // Worker dựng hình học không báo tiến độ: cho bước này khoảng chờ dài hơn (vẫn dưới trần tuyệt đối)
            touch(180_000);
            await fragmentsReadyRef.current;
            signal.throwIfAborted();
            if (!alive) throw new Error('Trình xem đã đóng');
            const loaded = await fragments.core.load(new Uint8Array(buffer), {
              modelId: bm.id,
              camera: world.camera.three,
            });
            return loaded;
          },
          () => {
            if (alive) fragments.core.abort(bm.id);
          },
          { idleMs: 45_000, maxMs: 15 * 60_000 },
        ),
      // Nhiều mô hình chờ: nạp trước mô hình (đã biết khung bao từ lần mở trước) nằm trong khung nhìn
      prioritize: (waiting) => {
        const cam = world.camera.three;
        cam.updateMatrixWorld();
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
        );
        const toBox = (b: { min: [number, number, number]; max: [number, number, number] }) =>
          new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
        const primary = modelsRef.current[0]?.id;
        return orderModelsByView(
          waiting,
          (m) => readModelBounds(modelRevision(m)),
          { visible: (b) => frustum.intersectsBox(toBox(b)), distance: (b) => toBox(b).distanceToPoint(cam.position) },
          loadedRef.current.size === 0 && waiting[0]?.id === primary,
        );
      },
      attach: (bm, loaded) => {
        if (loadedRef.current.size === 0) userMovedRef.current = false;
        loadedRef.current.set(bm.id, loaded);
        // Worker swaps tiles/groups on view updates. Repair only those updates, not every render frame.
        loaded.onViewUpdated.add(() => {
          if (!ghostRef.current) return;
          for (const tile of loaded.tiles.values()) removeHighlightOverdraw(tile.geometry);
        });
        world.scene.three.add(loaded.object);
        if (loaded.box && !loaded.box.isEmpty())
          rememberModelBounds(modelRevision(bm), { min: toVec3(loaded.box.min), max: toVec3(loaded.box.max) });
        loaded
          .setLodMode(
            qualityRef.current === 'cao' || ghostRef.current || world.camera.projection.current === 'Orthographic'
              ? FRAGS.LodMode.ALL_GEOMETRY
              : FRAGS.LodMode.DEFAULT,
          )
          .catch(() => undefined);
        if (ghostRef.current)
          void loaded
            .getItemsIdsWithGeometry()
            .then((ids) => loaded.highlight(ids, ghostAppearance()))
            .catch(() => undefined);
        // Attach immediately; changing the selection does not cancel a still-wanted model.
        if (!userMovedRef.current) fitCameraToScene(false);
        else settleUpdate();
        notifyLoaded();
        if (clipPlanesRef.current.length) scheduleOutline();
      },
      remove: async (bm, loaded) => {
        loadedRef.current.delete(bm.id);
        colorsRef.current.delete(bm.id);
        visibilityRef.current.delete(bm.id);
        colorHiddenRef.current.delete(bm.id);
        // Nạp lại cùng ID (xử lý lại/đổi phiên bản) không được dùng hộp bao, tên hay lựa chọn cũ
        const hadSelection = !!selectionSetRef.current.get(bm.id)?.size;
        forgetModelCaches(bm.id, { selection: true });
        if (selectionRef.current?.modelId === bm.id) selectionRef.current = null;
        if (hadSelection) notifySelectionCount();
        world.scene.three.remove(loaded.object);
        notifyLoaded();
        if (clipPlanesRef.current.length) scheduleOutline();
        await fragments.core.disposeModel(bm.id);
      },
      changed: (loaded, waiting) => {
        completed = loaded;
        pending = waiting;
        setHasLoadedModel(loaded.length > 0);
        setLoadingCount(waiting.length);
        // Mô hình lỗi mà người dùng đã bỏ khỏi tổ hợp thì không còn báo lỗi
        const stillFailed = new Set(queue.failedModels().map((m) => m.id));
        setFailedLoads((list) =>
          list.some((f) => !stillFailed.has(f.id)) ? list.filter((f) => stillFailed.has(f.id)) : list,
        );
        emit(true);
        if (!waiting.length) settleUpdate();
      },
      error: (bm, error) => {
        console.error('Lỗi tải mô hình BIM:', error);
        const message = error instanceof Error ? error.message : 'Lỗi nạp mô hình BIM';
        setFailedLoads((list) => [...list.filter((f) => f.id !== bm.id), { id: bm.id, name: bm.file_name, message }]);
      },
    });
    modelQueueRef.current = queue;
    return () => {
      alive = false;
      queue.stop();
      if (modelQueueRef.current === queue) modelQueueRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ready = models.filter((m) => m.frag_path && m.status === 'ready');
    pinFragCache(ready);
    // Một yêu cầu lấy URL có chữ ký cho cả tổ hợp thay vì mỗi mô hình một yêu cầu
    if (!loadBufferRef.current && ready.length > 1) void prefetchSignedUrls(ready);
    modelQueueRef.current?.setModels(models);
  }, [modelKey]);

  return { loadingCount, loadProgress, loadStatus, hasLoadedModel, failedLoads, setFailedLoads };
}
