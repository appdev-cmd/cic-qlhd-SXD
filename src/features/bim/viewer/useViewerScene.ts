// Khởi tạo cảnh ThatOpen (renderer hậu kỳ, camera, viền chọn, ghim, Fragments worker), vòng cập nhật mỗi khung
// (nhãn, khối lập phương, bản đồ thu nhỏ, tự hạ chất lượng, chỉ số hiệu năng), đổi kích thước và dọn dẹp khi gỡ.
import { useEffect } from 'react';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import CameraControls from 'camera-controls';
import { FRAGMENTS_WORKER_URL } from '../lib/fragmentsWorker';
import { SELECTION_COLOR, quaternionToCss, toVec3 } from '../lib/viewerConstants';
import type { BimWorld, ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { MeasureTool } from './useMeasureTool';
import type { SectionGizmo } from './useSectionGizmo';
import type { BimCameraPose } from './types';

export interface ViewerSceneDeps {
  core: Pick<ViewerCore, 'settleUpdate' | 'applyQuality' | 'fitCameraToScene'>;
  measure: Pick<MeasureTool, 'updateLabels' | 'clearMeasurements'>;
  section: Pick<SectionGizmo, 'layoutBoxHandles' | 'disposeBoxHandles'>;
  drawMinimap: (force?: boolean) => void;
  attachPointerHandlers: (world: BimWorld, domEl: HTMLCanvasElement) => () => void;
}

export function useViewerScene(ctx: ViewerContext, darkBackground: boolean | undefined, deps: ViewerSceneDeps) {
  const {
    containerRef,
    componentsRef,
    worldRef,
    outlinerRef,
    pickerRef,
    markerRef,
    fragmentsRef,
    fragmentsReadyRef,
    loadedRef,
    movingRef,
    qualityRef,
    ghostRef,
    boxHandlesRef,
    onCameraChangeRef,
    appliedPoseRef,
    userMovedRef,
    cubeRef,
    autoQualityRef,
    autoDowngradedRef,
    onAutoQualityRef,
    statsRef,
    pendingFitRef,
    iotFocusEpochRef,
    iotFloorRef,
    iotLayerRef,
    facilityLayerRef,
    outlineTimerRef,
    outlineEpochRef,
    pickFaceRef,
    sectionHandleRef,
    modelQueueRef,
  } = ctx;
  const { settleUpdate, applyQuality, fitCameraToScene } = deps.core;
  const { updateLabels, clearMeasurements } = deps.measure;
  const { layoutBoxHandles, disposeBoxHandles } = deps.section;
  const { drawMinimap, attachPointerHandlers } = deps;

  useEffect(() => {
    if (!containerRef.current) return;

    const components = new OBC.Components();
    componentsRef.current = components;
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>();
    worldRef.current = world;

    world.scene = new OBC.SimpleScene(components);
    // Renderer hậu kỳ: viền cấu kiện + đổ bóng mềm (SSAO) + khử răng cưa
    world.renderer = new OBCF.PostproductionRenderer(components, containerRef.current, {
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      antialias: true,
    });
    world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    world.renderer.three.localClippingEnabled = false;
    // Camera chuyển được giữa phối cảnh / trực giao và chế độ đi bộ
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    // Projection switches replace camera.three. Fragments must receive that exact
    // camera, otherwise worker culling keeps using the previous perspective view.
    const handleProjectionChange = (camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
      for (const model of loadedRef.current.values()) model.useCamera(camera);
      settleUpdate();
    };
    world.camera.projection.onChanged.add(handleProjectionChange);

    const controls = world.camera.controls;
    if (controls?.mouseButtons) {
      controls.mouseButtons.middle = CameraControls.ACTION.TRUCK;
      // Giữ chuột phải để lia; nhấp phải không kéo vẫn mở menu cấu kiện.
      controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    }
    controls.dollyToCursor = true;

    components.init();
    world.scene.setup();
    world.camera.controls.setLookAt(15, 15, 15, 0, 0, 0);

    try {
      world.renderer.postproduction.enabled = true;
      world.renderer.postproduction.style = OBCF.PostproductionAspect.COLOR_PEN_SHADOWS;
      const outliner = components.get(OBCF.Outliner);
      outliner.world = world;
      outliner.color = new THREE.Color(SELECTION_COLOR);
      outliner.thickness = 3;
      outliner.fillOpacity = 0;
      outliner.enabled = true;
      outlinerRef.current = outliner;
    } catch (err) {
      console.warn('Không bật được hiển thị nâng cao:', err);
    }

    // Chọn nhanh cấu kiện dưới con trỏ bằng GPU (dùng cho rê chuột)
    try {
      pickerRef.current = new OBC.FastModelPicker(components, world);
    } catch {
      pickerRef.current = null;
    }
    // Ghim vướng mắc / hồ sơ trên mô hình
    try {
      markerRef.current = components.get(OBCF.Marker);
      markerRef.current.setupEvents(world, true);
    } catch {
      markerRef.current = null;
    }

    const fragments = components.get(OBC.FragmentsManager);
    fragmentsRef.current = fragments;
    fragmentsReadyRef.current = (async () => {
      if (!fragments.initialized) {
        // Worker tự lưu trữ — không phụ thuộc unpkg.com (xem lib/fragmentsWorker.ts)
        fragments.init(FRAGMENTS_WORKER_URL);
      }
    })();

    // Khi xoay/lia: tắt hậu kỳ (SSAO + viền) — tốn gấp 3–4 lần một lượt vẽ thường; bật lại khi camera dừng
    const setMoving = (moving: boolean) => {
      if (movingRef.current === moving) return;
      movingRef.current = moving;
      if (qualityRef.current !== 'cao') return;
      try {
        world.renderer!.postproduction.enabled = !moving && !ghostRef.current;
      } catch {
        /* hậu kỳ chưa sẵn sàng */
      }
    };
    const poseKey = (p: BimCameraPose) => [...p.position, ...p.target].map((n) => n.toFixed(3)).join(',');
    let poseFrame = 0;
    // camera-controls không phải lúc nào cũng phát 'rest' (VD sau setLookAt không hiệu ứng) → dự phòng bằng hẹn giờ
    let restTimer: number | undefined;
    const handleUpdate = () => {
      setMoving(true);
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(handleRest, 220);
      if (fragments.initialized) fragments.core.update();
      // Tay nắm hộp cắt giữ nguyên cỡ trên màn hình khi phóng to/thu nhỏ
      if (boxHandlesRef.current) layoutBoxHandles();
      if (onCameraChangeRef.current && !poseFrame) {
        poseFrame = requestAnimationFrame(() => {
          poseFrame = 0;
          const pos = new THREE.Vector3();
          const tgt = new THREE.Vector3();
          controls.getPosition(pos);
          controls.getTarget(tgt);
          const pose: BimCameraPose = { position: toVec3(pos), target: toVec3(tgt) };
          if (poseKey(pose) === appliedPoseRef.current) return;
          onCameraChangeRef.current?.(pose);
        });
      }
    };
    const handleRest = () => {
      window.clearTimeout(restTimer);
      if (!movingRef.current) return;
      setMoving(false);
      if (fragments.initialized) fragments.core.update(true);
    };
    const handleControlStart = () => {
      userMovedRef.current = true;
      setMoving(true);
    };
    controls.addEventListener('update', handleUpdate);
    controls.addEventListener('rest', handleRest);
    controls.addEventListener('controlstart', handleControlStart);
    world.renderer.onAfterUpdate.add(updateLabels);
    // Khối lập phương điều hướng: ghi thẳng transform vào DOM
    let lastQuat = '';
    world.renderer.onAfterUpdate.add(() => {
      const cube = cubeRef.current;
      if (!cube) return;
      const q = world.camera.three.quaternion;
      const key = `${q.x.toFixed(3)},${q.y.toFixed(3)},${q.z.toFixed(3)},${q.w.toFixed(3)}`;
      if (key === lastQuat) return;
      lastQuat = key;
      cube.style.transform = `translateZ(-36px) ${quaternionToCss([q.x, q.y, q.z, q.w])}`;
    });
    world.renderer.onAfterUpdate.add(() => drawMinimap());
    // Đo FPS trong lúc xoay/lia: thấp kéo dài (< 20 FPS trong ≥ 2 s thao tác) → tự chuyển "nhanh" một lần
    let moveFrames = 0;
    let moveSince = 0;
    world.renderer.onAfterUpdate.add(() => {
      if (!movingRef.current || qualityRef.current !== 'cao' || !autoQualityRef.current || autoDowngradedRef.current) {
        moveFrames = 0;
        moveSince = 0;
        return;
      }
      const now = performance.now();
      if (!moveSince) moveSince = now;
      moveFrames++;
      const elapsed = now - moveSince;
      if (elapsed < 2000) return;
      const fps = (moveFrames * 1000) / elapsed;
      moveFrames = 0;
      moveSince = now;
      if (fps < 20) {
        autoDowngradedRef.current = true;
        applyQuality('nhanh');
        onAutoQualityRef.current?.('nhanh', Math.round(fps));
      }
    });
    // Hậu kỳ vẽ nhiều lượt mỗi khung → tự cộng dồn bộ đếm của three.js, đọc rồi đặt lại mỗi khung
    world.renderer.three.info.autoReset = false;
    let frames = 0;
    let renderedFrames = 0;
    let lastRenderedAt = 0;
    const frameTimes: number[] = [];
    let statsAt = performance.now();
    let lastFrame = { triangles: 0, calls: 0 };
    world.renderer.onAfterUpdate.add(() => {
      const info = world.renderer!.three.info;
      const rendered = info.render.calls > 0;
      if (rendered) {
        lastFrame = { triangles: info.render.triangles, calls: info.render.calls };
        renderedFrames++;
        const at = performance.now();
        if (movingRef.current && lastRenderedAt) {
          frameTimes.push(at - lastRenderedAt);
          if (frameTimes.length > 240) frameTimes.shift();
        }
        lastRenderedAt = movingRef.current ? at : 0;
      }
      info.reset();
      // Chỉ số hiệu năng (FPS, tam giác, bộ nhớ) — chỉ tính khi lớp hiển thị đang mở
      const el = statsRef.current;
      if (!el) return;
      frames += Number(rendered);
      const now = performance.now();
      if (now - statsAt < 500) return;
      const fps = (frames * 1000) / (now - statsAt);
      frames = 0;
      statsAt = now;
      const mem = (performance as any).memory?.usedJSHeapSize as number | undefined;
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null;
      el.dataset.renderedFrames = String(renderedFrames);
      el.dataset.p95FrameMs = p95 === null ? '' : String(p95);
      el.dataset.jsHeapBytes = mem === undefined ? '' : String(mem);
      el.textContent = [
        `${fps.toFixed(0)} FPS`,
        p95 === null ? '' : `p95 khung hình ${p95.toFixed(1)} ms`,
        `${(lastFrame.triangles / 1000).toFixed(0)}k tam giác · ${lastFrame.calls} lệnh vẽ / khung`,
        `${info.memory.geometries} hình học · ${info.memory.textures} texture`,
        mem ? `Bộ nhớ JS ${(mem / 1048576).toFixed(0)} MB` : '',
        `Hậu kỳ: ${world.renderer!.postproduction.enabled ? 'bật' : 'tắt'}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!world.renderer || !el || el.clientWidth === 0 || el.clientHeight === 0) return;
      world.renderer.resize();
      world.camera.updateAspect();
      if (pendingFitRef.current) fitCameraToScene(false);
    });
    resizeObserver.observe(containerRef.current);

    const detachPointer = attachPointerHandlers(world, world.renderer.three.domElement);

    return () => {
      detachPointer();
      iotFocusEpochRef.current++;
      iotFloorRef.current = null;
      iotLayerRef.current?.dispose();
      iotLayerRef.current = null;
      facilityLayerRef.current?.dispose();
      facilityLayerRef.current = null;
      window.clearTimeout(outlineTimerRef.current);
      outlineEpochRef.current++;
      pickFaceRef.current?.(null);
      disposeBoxHandles();
      controls.removeEventListener('update', handleUpdate);
      controls.removeEventListener('rest', handleRest);
      controls.removeEventListener('controlstart', handleControlStart);
      world.camera.projection.onChanged.remove(handleProjectionChange);
      window.clearTimeout(restTimer);
      resizeObserver.disconnect();
      clearMeasurements();
      if (sectionHandleRef.current) {
        sectionHandleRef.current.controls.detach();
        sectionHandleRef.current.controls.dispose();
        sectionHandleRef.current = null;
      }
      modelQueueRef.current?.stop();
      modelQueueRef.current = null;
      outlinerRef.current = null;
      loadedRef.current.clear();
      worldRef.current = null;
      fragmentsRef.current = null;
      fragmentsReadyRef.current = null;
      try {
        components.dispose();
      } catch {
        // cleanup
      }
    };
  }, []);

  // Nền theo giao diện sáng / tối
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const dark = darkBackground ?? document.documentElement.classList.contains('dark');
    world.scene.three.background = new THREE.Color(dark ? '#0f172a' : '#eef2f7');
  }, [darkBackground]);
}
