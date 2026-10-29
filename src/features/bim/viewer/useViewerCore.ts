// Lõi trình xem: truy cập mô hình, cập nhật Fragments, chất lượng hiển thị, camera, dò tia và chiếu toạ độ
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { fitCameraToBox } from './camera';
import { cameraPositionFor } from '../lib/viewCube';
import { unwrap } from '../lib/viewerConstants';
import type { ViewerContext } from './context';
import type { BimQuality, BimSelectedElement, BimViewPreset } from './types';

export function useViewerCore(ctx: ViewerContext) {
  const {
    worldRef,
    containerRef,
    fragmentsRef,
    loadedRef,
    ghostRef,
    settleTokenRef,
    qualityRef,
    movingRef,
    pendingFitRef,
    clipPlanesRef,
    visibilityRef,
  } = ctx;

  const getModel = (modelId: string | null | undefined) => (modelId ? (loadedRef.current.get(modelId) ?? null) : null);
  /**
   * Ép Fragments dựng lại hình học sau khi camera/hiển thị thay đổi. Worker trả hình học bất đồng bộ và
   * chỉ đưa vào scene ở lần update kế tiếp → lặp update tới khi các mô hình hết bận (tối đa ~8 giây).
   */
  const settleUpdate = () => {
    const token = ++settleTokenRef.current;
    let idleTicks = 0;
    let elapsed = 0;
    const tick = async () => {
      const fragments = fragmentsRef.current;
      if (token !== settleTokenRef.current || !fragments?.initialized) return;
      await fragments.core.update(true);
      const busy = [...loadedRef.current.values()].some((m) => m.isBusy);
      idleTicks = busy ? 0 : idleTicks + 1;
      elapsed += 250;
      if (idleTicks < 3 && elapsed < 8000) setTimeout(tick, 250);
    };
    setTimeout(tick, 50);
  };

  /**
   * Áp chất lượng hiển thị: "cao" = hậu kỳ (SSAO + viền), pixel ratio tới 1,5, hình học đầy đủ;
   * "nhanh" = tắt hậu kỳ, pixel ratio 1, Fragments hạ chất lượng đồ hoạ và bật LOD (cấu kiện xa vẽ dạng rút gọn).
   */
  const applyQuality = (quality: BimQuality) => {
    const world = worldRef.current;
    const fragments = fragmentsRef.current;
    if (!world?.renderer) return;
    qualityRef.current = quality;
    try {
      world.renderer.postproduction.enabled = quality === 'cao' && !movingRef.current && !ghostRef.current;
      world.renderer.three.setPixelRatio(quality === 'cao' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    } catch (err) {
      console.warn('Không đổi được chất lượng hiển thị:', err);
    }
    if (fragments?.initialized) {
      fragments.core.settings.graphicsQuality = quality === 'cao' ? 1 : 0.5;
      const lod =
        quality === 'cao' || ghostRef.current || world.camera.projection.current === 'Orthographic'
          ? FRAGS.LodMode.ALL_GEOMETRY
          : FRAGS.LodMode.DEFAULT;
      loadedRef.current.forEach((m) => m.setLodMode(lod).catch(() => undefined));
    }
    settleUpdate();
  };

  /** Đồng bộ kích thước khung & tỉ lệ camera; khôi phục camera nếu toạ độ bị NaN. Trả false nếu khung đang ẩn. */
  const ensureCameraReady = (): boolean => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world?.renderer || !el || el.clientWidth === 0 || el.clientHeight === 0) return false;
    world.renderer.resize();
    world.camera.updateAspect();
    const cam = world.camera.three;
    if ([cam.position.x, cam.position.y, cam.position.z].some((v) => !Number.isFinite(v))) {
      const box = sceneBox();
      if (box) fitCameraToBox(world.camera.controls, box, false);
      else world.camera.controls.setLookAt(15, 15, 15, 0, 0, 0, false);
    }
    return true;
  };

  const sceneBox = (): THREE.Box3 | null => {
    const box = new THREE.Box3();
    for (const m of loadedRef.current.values()) {
      if (m.box && !m.box.isEmpty()) box.union(m.box);
    }
    return box.isEmpty() ? null : box;
  };

  const fitCameraToScene = (smooth: boolean) => {
    const world = worldRef.current;
    const box = sceneBox();
    if (!world || !box) return;
    if (!ensureCameraReady()) {
      pendingFitRef.current = true;
      return;
    }
    pendingFitRef.current = false;
    const controls = world.camera.controls;
    fitCameraToBox(controls, box, smooth);
    settleUpdate();
  };

  /** Camera bay mượt tới hướng nhìn `dir` (từ tâm cảnh ra camera), giữ toàn cảnh trong khung */
  const viewDirection = (dir: [number, number, number]) => {
    const controls = worldRef.current?.camera?.controls;
    const box = sceneBox();
    if (!controls || !box || !ensureCameraReady()) return;
    const center = box.getCenter(new THREE.Vector3());
    const distance = box.getSize(new THREE.Vector3()).length() * 1.1;
    const [x, y, z] = cameraPositionFor([center.x, center.y, center.z], dir, distance);
    controls.setLookAt(x, y, z, center.x, center.y, center.z, true).catch(() => undefined);
    settleUpdate();
  };

  const viewPreset = (preset: BimViewPreset) => {
    const dirs: Record<BimViewPreset, [number, number, number]> = {
      iso: [0.6, 0.55, 0.6],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
    };
    viewDirection(dirs[preset]);
  };

  const flyToBox = (box: THREE.Box3) => {
    const controls = worldRef.current?.camera?.controls;
    if (!controls || box.isEmpty() || !ensureCameraReady()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius)) return;
    // Thiết bị nhỏ (AHU, tủ điện…) vẫn lùi đủ xa để thấy ngữ cảnh xung quanh: tối thiểu bán kính 4 m
    controls
      .fitToSphere(new THREE.Sphere(sphere.center, Math.max(sphere.radius * 1.8, 4)), true)
      .catch(() => undefined);
    settleUpdate();
  };

  /** Raycast tất cả mô hình đang hiển thị, lấy điểm gần nhất (bỏ qua phần bị mặt cắt loại bỏ) */
  const raycastAll = async (clientX: number, clientY: number) => {
    const world = worldRef.current;
    if (!world) return null;
    const mouse = new THREE.Vector2(clientX, clientY);
    const dom = world.renderer!.three.domElement;
    let best: {
      modelId: string;
      localId: number;
      point: THREE.Vector3;
      normal?: THREE.Vector3;
      distance: number;
    } | null = null;
    for (const [modelId, m] of loadedRef.current) {
      try {
        const hit = await m.raycast({ camera: world.camera.three, mouse, dom });
        if (!hit) continue;
        if (
          visibilityRef.current.get(modelId)?.contextOnly?.has(hit.localId) ||
          visibilityRef.current.get(modelId)?.annotationHidden?.has(hit.localId)
        )
          continue;
        const clipped = clipPlanesRef.current.some((p) => p.distanceToPoint(hit.point) < -1e-4);
        if (clipped) continue;
        if (!best || hit.distance < best.distance) {
          best = {
            modelId,
            localId: hit.localId,
            point: hit.point.clone(),
            normal: hit.normal?.clone(),
            distance: hit.distance,
          };
        }
      } catch {
        // mô hình đang bận
      }
    }
    return best;
  };

  const describeItem = async (modelId: string, expressId: number): Promise<BimSelectedElement> => {
    const m = getModel(modelId);
    const out: BimSelectedElement = { modelId, expressId };
    if (!m) return out;
    try {
      const [data] = await m.getItemsData([expressId], { attributesDefault: false, attributes: ['Name'] });
      out.guid = unwrap((data as any)?._guid) ?? undefined;
      out.name = unwrap((data as any)?.Name) ?? undefined;
      out.category = unwrap((data as any)?._category) ?? undefined;
    } catch {
      // thiếu thuộc tính vẫn chọn được theo expressId
    }
    return out;
  };

  const toScreen = (p: THREE.Vector3) => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world || !el) return null;
    const v = p.clone().project(world.camera.three);
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  };

  const placeLabel = (label: HTMLElement, anchor: THREE.Vector3) => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world || !el) return;
    const p = anchor.clone().project(world.camera.three);
    const visible = p.z < 1 && p.z > -1;
    label.style.display = visible ? 'flex' : 'none';
    label.style.left = `${((p.x + 1) / 2) * el.clientWidth}px`;
    label.style.top = `${((1 - p.y) / 2) * el.clientHeight - 6}px`;
  };

  /** Cỡ 1 điểm ảnh (m) tại khoảng cách d trước camera — dùng làm dung sai bắt điểm */
  const pixelWorldSize = (d: number) => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world || !el) return 0.01;
    const cam = world.camera.three as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    const h = Math.max(el.clientHeight, 1);
    if ((cam as any).isOrthographicCamera) return (cam.top - cam.bottom) / (cam.zoom || 1) / h;
    return (2 * d * Math.tan(((cam.fov || 60) * Math.PI) / 360)) / h;
  };

  return {
    getModel,
    settleUpdate,
    applyQuality,
    ensureCameraReady,
    sceneBox,
    fitCameraToScene,
    viewPreset,
    viewDirection,
    flyToBox,
    raycastAll,
    describeItem,
    toScreen,
    placeLabel,
    pixelWorldSize,
  };
}

export type ViewerCore = ReturnType<typeof useViewerCore>;
