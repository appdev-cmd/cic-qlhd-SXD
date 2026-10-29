// Mặt cắt: mặt phẳng cắt, viền màu và nắp cắt tô kín tại chỗ cắt, tay kéo mặt cắt (TransformControls), hộp cắt 6 tay nắm
// kéo trực tiếp trên mô hình và bấm chọn mặt cấu kiện để canh mặt cắt.
import { useEffect, useRef, useState } from 'react';
import { SectionBatchClient } from '../lib/sectionBatchClient';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { BimClipPlaneState } from '@/features/bim-suite/types/bim.types';
import { boxInsideAll, boxTouchesPlane } from '../lib/sectionOutline';
import { capColor } from '../lib/sectionCaps';
import { toVec3 } from '../lib/viewerConstants';
import { disposeObject, isCoarsePointer } from './sceneObjects';
import type { BimWorld, ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { GeometryQueries } from './geometry';
import type { BimPickedFace, SectionAxis, SectionBoxHandleConfig, SectionHandleConfig } from './types';

export function useSectionGizmo(ctx: ViewerContext, core: ViewerCore, geometry: GeometryQueries) {
  const {
    worldRef,
    containerRef,
    loadedRef,
    boxesCacheRef,
    clipPlanesRef,
    outlineEnabledRef,
    outlineRef,
    outlineEpochRef,
    outlineTimerRef,
    capsEnabledRef,
    capsRef,
    capStatsRef,
    sectionOverlayKeyRef,
    modelsRef,
    pickFaceRef,
    sectionHandleRef,
    boxHandlesRef,
    boxDragRef,
    boxDragEndedAtRef,
  } = ctx;
  const { sceneBox, settleUpdate, raycastAll, pixelWorldSize } = core;
  const { collectBoxes, readTriangles, itemShown } = geometry;
  const [pickingFace, setPickingFace] = useState(false);
  const [sectionMessage, setSectionMessage] = useState('');
  const batchWorker = useRef<SectionBatchClient | null>(null);
  useEffect(
    () => () => {
      batchWorker.current?.cancel();
      hatchTextureRef.current?.dispose();
    },
    [],
  );

  const clearOutline = () => {
    const lines = outlineRef.current;
    if (lines) {
      worldRef.current?.scene.three.remove(lines);
      disposeObject(lines);
      outlineRef.current = null;
    }
    const caps = capsRef.current;
    if (caps) {
      worldRef.current?.scene.three.remove(caps);
      setCapsPostproduction(caps, false);
      // Vân gạch dùng chung cho mọi lần dựng: chỉ huỷ hình học và vật liệu
      caps.traverse((o: any) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      capsRef.current = null;
    }
    capStatsRef.current = { triangles: 0, items: 0 };
    setSectionMessage('');
  };

  /**
   * Nắp đi qua lượt "loại trừ" của hậu kỳ: lượt nét viền của ThatOpen dò cạnh theo màu nên vân gạch chéo bị
   * tô thành nét xám dày đặc. Lượt loại trừ vẽ lại nắp với màu gốc (vẫn đúng độ sâu) sau nét viền và SSAO.
   * Chỉ bật khi đang có nắp: tốn thêm một lượt vẽ cảnh khi camera đứng yên (lúc xoay hậu kỳ đã tắt).
   */
  const setCapsPostproduction = (group: THREE.Group, on: boolean) => {
    try {
      const pp = worldRef.current?.renderer?.postproduction;
      if (!pp) return;
      const pass = pp.excludedObjectsPass;
      group.traverse((o: any) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (on) pass.addExcludedMaterial(o.material as THREE.Material);
        else pass.removeExcludedMaterial(o.material as THREE.Material);
      });
      if (pp.excludedObjectsEnabled !== on) pp.excludedObjectsEnabled = on;
    } catch {
      // hậu kỳ chưa khởi tạo: nắp vẫn hiện qua lượt vẽ thường
    }
  };

  /** Ẩn ngay viền/nắp cũ khi mặt cắt đổi (tránh nắp lơ lửng ở vị trí cũ trong lúc kéo) */
  const hideStaleOverlay = () => {
    if (outlineRef.current) outlineRef.current.visible = false;
    if (capsRef.current) capsRef.current.visible = false;
  };

  const overlayKey = () => {
    const planes = clipPlanesRef.current
      .map(
        (p) =>
          `${p.normal
            .toArray()
            .map((n) => n.toFixed(6))
            .join(',')}:${p.constant.toFixed(5)}`,
      )
      .join('|');
    const models = [...loadedRef.current.entries()]
      .map(
        ([id, m]) =>
          `${id}@${m.object.position
            .toArray()
            .map((n) => n.toFixed(3))
            .join(',')}`,
      )
      .join(';');
    return `${planes}#${models}#${outlineEnabledRef.current ? 1 : 0}${capsEnabledRef.current ? 1 : 0}`;
  };

  // Đang dựng viền/nắp (để báo trạng thái cho kiểm thử)
  const building = useRef(false);

  /**
   * Dựng viền và nắp sau khi mặt cắt dừng thay đổi; chạy theo lô nhỏ, nhường luồng chính giữa các lô.
   * Chỉ dựng lại khi mặt cắt, tập mô hình hoặc tuỳ chọn viền/nắp đổi; force: luôn dựng (VD sau khi ẩn/hiện cấu kiện).
   */
  const scheduleOutline = (force = false) => {
    const key = overlayKey();
    if (!force && key === sectionOverlayKeyRef.current) return;
    window.clearTimeout(outlineTimerRef.current);
    outlineTimerRef.current = undefined;
    const epoch = ++outlineEpochRef.current;
    batchWorker.current?.cancel();
    sectionOverlayKeyRef.current = key;
    if ((!outlineEnabledRef.current && !capsEnabledRef.current) || !clipPlanesRef.current.length) {
      clearOutline();
      settleUpdate();
      return;
    }
    hideStaleOverlay();
    outlineTimerRef.current = window.setTimeout(() => {
      outlineTimerRef.current = undefined;
      void buildOutline(epoch);
    }, 350);
  };

  /** Vân gạch chéo dùng chung cho mọi nắp (nhân với màu bộ môn) */
  const hatchTextureRef = useRef<THREE.Texture | null>(null);
  const hatchTexture = () => {
    if (hatchTextureRef.current) return hatchTextureRef.current;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    g.lineWidth = 5;
    for (let k = -64; k <= 128; k += 32) {
      g.beginPath();
      g.moveTo(k, 64);
      g.lineTo(k + 64, 0);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    hatchTextureRef.current = tex;
    return tex;
  };

  const buildOutline = async (epoch: number) => {
    const world = worldRef.current;
    const scene = sceneBox();
    if (!world || !scene) return;
    const cancelled = () => epoch !== outlineEpochRef.current || !worldRef.current;
    building.current = true;
    try {
      setSectionMessage('Đang dựng mặt cắt…');
      await buildOverlay(world, scene, cancelled);
    } catch (error) {
      if (!cancelled()) setSectionMessage(error instanceof Error ? error.message : 'Không dựng được mặt cắt.');
    } finally {
      if (epoch === outlineEpochRef.current) building.current = false;
    }
  };

  const buildOverlay = async (world: BimWorld, scene: THREE.Box3, cancelled: () => boolean) => {
    const planes = clipPlanesRef.current.map((p) => ({ normal: toVec3(p.normal), constant: p.constant }));
    const wantOutline = outlineEnabledRef.current;
    const wantCaps = capsEnabledRef.current;
    const offset = Math.max(scene.getSize(new THREE.Vector3()).length() / 20000, 0.002);
    const MAX_ITEMS = 1500;
    const MAX_SEGMENTS = 400_000;
    const MAX_CAP_TRIANGLES = 600_000;
    const SLICE = 120;
    const positions: number[] = [];
    // Nắp gom theo màu bộ môn: một mesh cho mỗi màu
    const caps = new Map<string, { positions: number[]; uvs: number[]; normals: number[] }>();
    let capTriangles = 0;
    let capItems = 0;
    let items = 0,
      candidates = 0,
      limited = false;
    for (const modelId of [...loadedRef.current.keys()]) {
      const boxes = boxesCacheRef.current.get(modelId) ?? (await collectBoxes(modelId).catch(() => []));
      if (cancelled()) return;
      const matching = boxes.filter(
        (b) =>
          itemShown(modelId, b.id) &&
          planes.some((pl) => boxTouchesPlane(b.min, b.max, pl)) &&
          boxInsideAll(b.min, b.max, planes),
      );
      candidates += matching.length;
      const ids = matching.map((b) => b.id).slice(0, Math.max(0, MAX_ITEMS - items));
      limited ||= ids.length < matching.length;
      items += ids.length;
      let bucket: { positions: number[]; uvs: number[]; normals: number[] } | undefined;
      if (wantCaps) {
        const color = capColor(modelsRef.current.find((m) => m.id === modelId)?.discipline);
        bucket = caps.get(color);
        if (!bucket) {
          bucket = { positions: [], uvs: [], normals: [] };
          caps.set(color, bucket);
        }
      }
      for (let i = 0; i < ids.length; i += SLICE) {
        const tris = await readTriangles(modelId, ids.slice(i, i + SLICE), cancelled);
        if (cancelled()) return;
        batchWorker.current ??= new SectionBatchClient();
        const result = await batchWorker.current.run({
          triangles: [...tris.values()],
          planes,
          offset,
          outline: wantOutline,
          caps: wantCaps,
          maxSegments: Math.max(0, MAX_SEGMENTS - positions.length / 6),
          maxCapTriangles: Math.max(0, MAX_CAP_TRIANGLES - capTriangles),
        });
        if (cancelled()) return;
        for (const value of result.outline) positions.push(value);
        if (bucket) {
          for (const value of result.positions) bucket.positions.push(value);
          for (const value of result.uvs) bucket.uvs.push(value);
          for (const value of result.normals) bucket.normals.push(value);
        }
        capTriangles += result.triangles;
        capItems += result.items;
        limited ||= result.limited;
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled()) return;
      }
    }
    if (cancelled()) return;
    clearOutline();
    if (positions.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: '#e11d48' }));
      lines.renderOrder = 995;
      lines.userData.sectionOutline = true;
      world.scene.three.add(lines);
      outlineRef.current = lines;
    }
    if (capTriangles > 0) {
      const group = new THREE.Group();
      group.name = 'section-caps';
      group.userData.sectionCaps = true;
      const map = hatchTexture();
      for (const [color, data] of caps) {
        if (!data.positions.length) continue;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
        // Pháp tuyến phẳng của mặt cắt: hậu kỳ (đổ bóng SSAO, nét viền) cần pháp tuyến đúng, thiếu thì nắp bị tô tối
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
        geom.computeBoundingSphere();
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshBasicMaterial({
            color,
            map,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          }),
        );
        mesh.renderOrder = 994;
        mesh.userData.sectionCaps = true;
        group.add(mesh);
      }
      world.scene.three.add(group);
      setCapsPostproduction(group, true);
      capsRef.current = group;
      capStatsRef.current = { triangles: capTriangles, items: capItems, candidates, processed: items, limited };
    }
    capStatsRef.current = { ...capStatsRef.current, candidates, processed: items, limited };
    setSectionMessage(
      limited
        ? `Đã dựng mặt cắt cho ${items}/${candidates} cấu kiện trong ngân sách hình học. Thu hẹp tầng hoặc hộp cắt để xem đầy đủ.`
        : '',
    );
    settleUpdate();
  };

  const applyClipPlanes = (planes: THREE.Plane[]) => {
    const world = worldRef.current;
    if (!world?.renderer) return;
    clipPlanesRef.current = planes;
    world.renderer.three.clippingPlanes = planes;
    scheduleOutline();
    settleUpdate();
  };

  /** Bấm chọn mặt cấu kiện (canh mặt cắt): pháp tuyến quay về phía người xem */
  const resolvePickFace = async (clientX: number, clientY: number) => {
    const done = pickFaceRef.current;
    const world = worldRef.current;
    if (!done || !world) return;
    const hit = await raycastAll(clientX, clientY);
    if (!hit?.normal || hit.normal.lengthSq() < 1e-9) return;
    const n = hit.normal.clone().normalize();
    const toCamera = world.camera.three.position.clone().sub(hit.point);
    if (n.dot(toCamera) < 0) n.negate();
    done({ modelId: hit.modelId, expressId: hit.localId, point: toVec3(hit.point), normal: toVec3(n) });
  };

  // ------------------------------------------------------------
  // Hộp cắt kéo trực tiếp 6 mặt
  // ------------------------------------------------------------
  const BOX_AXES: SectionAxis[] = ['x', 'y', 'z'];

  /** Cạnh hộp cắt theo mét (null → biên cảnh) */
  const resolvedBoxRanges = (config: SectionBoxHandleConfig, scene: THREE.Box3) => {
    const min = scene.min.toArray();
    const max = scene.max.toArray();
    const lo: number[] = [];
    const hi: number[] = [];
    BOX_AXES.forEach((a, i) => {
      const [l, h] = config.box[a];
      lo[i] = Math.min(Math.max(l ?? min[i], min[i]), max[i]);
      hi[i] = Math.max(Math.min(h ?? max[i], max[i]), lo[i]);
    });
    return { lo, hi, min, max };
  };

  /**
   * Vị trí và cỡ 6 tay nắm. Cỡ tính theo điểm ảnh trên màn hình (9 px chuột, 16 px cảm ứng) tại đúng khoảng cách
   * tới camera nên không bé xíu khi nhìn xa hay che màn hình khi phóng gần; lùi vào trong hộp để không bị mặt cắt che.
   */
  const layoutBoxHandles = () => {
    const state = boxHandlesRef.current;
    const scene = sceneBox();
    const cam = worldRef.current?.camera.three;
    if (!state || !scene) return;
    const { lo, hi } = resolvedBoxRanges(state.config, scene);
    const size = scene.getSize(new THREE.Vector3()).length();
    const inset = Math.max(size / 2000, 0.005);
    state.edges.box.min.set(lo[0] + inset, lo[1] + inset, lo[2] + inset);
    state.edges.box.max.set(hi[0] - inset, hi[1] - inset, hi[2] - inset);
    const targetPx = isCoarsePointer() ? 16 : 9;
    const face = new THREE.Vector3();
    state.handles.forEach((h) => {
      const { axisIndex, side } = h.userData as { axisIndex: number; side: 0 | 1 };
      const pos = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      pos[axisIndex] = side === 0 ? lo[axisIndex] : hi[axisIndex];
      face.set(pos[0], pos[1], pos[2]);
      const r = Math.max(pixelWorldSize(cam ? cam.position.distanceTo(face) : size) * targetPx, 1e-3);
      pos[axisIndex] += side === 0 ? r * 1.2 : -r * 1.2;
      h.position.set(pos[0], pos[1], pos[2]);
      h.scale.setScalar(r);
    });
  };

  const disposeBoxHandles = () => {
    const state = boxHandlesRef.current;
    if (!state) return;
    worldRef.current?.scene.three.remove(state.group);
    state.group.traverse((o: any) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    boxHandlesRef.current = null;
    boxDragRef.current = null;
  };

  const pickBoxHandle = (clientX: number, clientY: number) => {
    const state = boxHandlesRef.current;
    const world = worldRef.current;
    const el = containerRef.current;
    if (!state || !world || !el) return null;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, world.camera.three);
    const hit = ray.intersectObjects(state.handles, false)[0];
    return hit ? (hit.object as THREE.Mesh) : null;
  };

  /** Toạ độ mới dọc trục kéo: điểm gần nhất giữa tia chuột và đường thẳng qua tay nắm */
  const dragAxisValue = (clientX: number, clientY: number, start: THREE.Vector3, axisIndex: number) => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world || !el) return null;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, world.camera.three);
    const d = new THREE.Vector3().setComponent(axisIndex, 1);
    const r = ray.ray.direction;
    const w0 = start.clone().sub(ray.ray.origin);
    const b = d.dot(r);
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-6) return null; // nhìn dọc theo trục kéo
    const t = (b * r.dot(w0) - d.dot(w0)) / denom;
    return start.getComponent(axisIndex) + t;
  };

  /** Kéo tay nắm hộp cắt: bắt sự kiện ở pha capture để camera không xoay theo. Trả hàm gỡ sự kiện. */
  const attachBoxHandleDrag = (world: BimWorld, domEl: HTMLCanvasElement) => {
    const handleBoxPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !boxHandlesRef.current) return;
      const handle = pickBoxHandle(e.clientX, e.clientY);
      if (!handle) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const { axis, side } = handle.userData as { axis: SectionAxis; side: 0 | 1 };
      boxDragRef.current = { axis, side, start: handle.position.clone(), handle };
      world.camera.controls.enabled = false;
      domEl.setPointerCapture?.(e.pointerId);
      domEl.style.cursor = 'grabbing';
    };
    const handleBoxPointerMove = (e: PointerEvent) => {
      const state = boxHandlesRef.current;
      if (!state) return;
      const drag = boxDragRef.current;
      if (!drag) {
        if (e.buttons === 0) domEl.style.cursor = pickBoxHandle(e.clientX, e.clientY) ? 'grab' : '';
        return;
      }
      e.stopImmediatePropagation();
      const scene = sceneBox();
      const axisIndex = BOX_AXES.indexOf(drag.axis);
      const value = dragAxisValue(e.clientX, e.clientY, drag.start, axisIndex);
      if (!scene || value === null) return;
      const { lo, hi, min, max } = resolvedBoxRanges(state.config, scene);
      const v = Math.min(max[axisIndex], Math.max(min[axisIndex], value));
      const gap = 0.01;
      const range: [number, number] =
        drag.side === 0
          ? [Math.min(v, hi[axisIndex] - gap), hi[axisIndex]]
          : [lo[axisIndex], Math.max(v, lo[axisIndex] + gap)];
      state.config = { ...state.config, box: { ...state.config.box, [drag.axis]: range } };
      layoutBoxHandles();
      state.config.onDrag(drag.axis, range);
    };
    const handleBoxPointerUp = (e: PointerEvent) => {
      if (!boxDragRef.current) return;
      e.stopImmediatePropagation();
      boxDragRef.current = null;
      boxDragEndedAtRef.current = performance.now();
      world.camera.controls.enabled = true;
      domEl.releasePointerCapture?.(e.pointerId);
      domEl.style.cursor = '';
      settleUpdate();
    };
    domEl.addEventListener('pointerdown', handleBoxPointerDown, { capture: true });
    domEl.addEventListener('pointermove', handleBoxPointerMove, { capture: true });
    domEl.addEventListener('pointerup', handleBoxPointerUp, { capture: true });
    return () => {
      domEl.removeEventListener('pointerdown', handleBoxPointerDown, { capture: true });
      domEl.removeEventListener('pointermove', handleBoxPointerMove, { capture: true });
      domEl.removeEventListener('pointerup', handleBoxPointerUp, { capture: true });
    };
  };

  const setClipPlanes = (planes: BimClipPlaneState[]) =>
    applyClipPlanes(planes.map((p) => new THREE.Plane(new THREE.Vector3(...p.normal), p.constant)));

  const setSectionOutline = (enabled: boolean) => {
    outlineEnabledRef.current = enabled;
    scheduleOutline();
  };

  /** Bật/tắt nắp cắt (tô kín mặt cắt từng cấu kiện theo màu bộ môn) */
  const setSectionCaps = (enabled: boolean) => {
    capsEnabledRef.current = enabled;
    scheduleOutline();
  };

  const getSectionCapStats = () => ({
    ...capStatsRef.current,
    pending: outlineTimerRef.current !== undefined || building.current,
  });

  /** Chờ người dùng bấm một mặt cấu kiện; null nếu hủy (Esc) */
  const pickFace = () =>
    new Promise<BimPickedFace | null>((resolve) => {
      pickFaceRef.current?.(null);
      pickFaceRef.current = (face) => {
        pickFaceRef.current = null;
        setPickingFace(false);
        resolve(face);
      };
      setPickingFace(true);
    });

  const cancelPickFace = () => pickFaceRef.current?.(null);

  /** Tay kéo mặt cắt trên mô hình; vị trí theo mét (n·x) */
  const setSectionHandle = (config: SectionHandleConfig | null) => {
    const world = worldRef.current;
    if (!world) return;
    const existing = sectionHandleRef.current;
    if (existing) {
      world.scene.three.remove(existing.anchor);
      const helper = (existing.controls as any).getHelper?.() ?? (existing.controls as any);
      world.scene.three.remove(helper);
      existing.controls.detach();
      existing.controls.dispose();
      sectionHandleRef.current = null;
    }
    const box = sceneBox();
    if (!config || !box) {
      settleUpdate();
      return;
    }
    // Tay kéo nằm trên mặt cắt, trục kéo (Z cục bộ) trùng pháp tuyến: dùng được cả mặt cắt xiên
    const n = config.normal
      ? new THREE.Vector3(...config.normal).normalize()
      : new THREE.Vector3().setComponent({ x: 0, y: 1, z: 2 }[config.axis], 1);
    const center = box.getCenter(new THREE.Vector3());
    const anchor = new THREE.Object3D();
    anchor.position.copy(center).addScaledVector(n, config.position - n.dot(center));
    anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    world.scene.three.add(anchor);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 8; i++) {
      const v = n.dot(
        new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
      );
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }

    const controls = new TransformControls(world.camera.three, world.renderer!.three.domElement);
    controls.setMode('translate');
    controls.setSpace('local');
    controls.showX = false;
    controls.showY = false;
    controls.showZ = true;
    controls.setSize(isCoarsePointer() ? 1.3 : 0.8);
    controls.attach(anchor);
    const helper = (controls as any).getHelper?.() ?? controls;
    world.scene.three.add(helper as any);

    controls.addEventListener('dragging-changed', (e: any) => {
      world.camera.controls.enabled = !e.value;
    });
    controls.addEventListener('objectChange', () => {
      const value = Math.min(hi, Math.max(lo, n.dot(anchor.position)));
      config.onDrag(value);
    });

    sectionHandleRef.current = { controls, anchor, normal: n, onDrag: config.onDrag };
    settleUpdate();
  };

  /** Hộp cắt kéo trực tiếp: 6 tay nắm ở tâm 6 mặt */
  const setSectionBoxHandles = (config: SectionBoxHandleConfig | null) => {
    const world = worldRef.current;
    if (!world) return;
    if (!config || !sceneBox()) {
      disposeBoxHandles();
      settleUpdate();
      return;
    }
    if (!boxHandlesRef.current) {
      const group = new THREE.Group();
      const edges = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#f59e0b'));
      (edges.material as THREE.LineBasicMaterial).depthTest = false;
      edges.renderOrder = 996;
      group.add(edges);
      const handles: THREE.Mesh[] = [];
      const geom = new THREE.SphereGeometry(1, 16, 12);
      BOX_AXES.forEach((axis, axisIndex) => {
        ([0, 1] as const).forEach((side) => {
          const mesh = new THREE.Mesh(
            geom,
            new THREE.MeshBasicMaterial({
              color: axis === 'y' ? '#2563eb' : axis === 'x' ? '#dc2626' : '#16a34a',
              depthTest: false,
              transparent: true,
              opacity: 0.9,
            }),
          );
          mesh.renderOrder = 999;
          mesh.userData = { axis, axisIndex, side };
          handles.push(mesh);
          group.add(mesh);
        });
      });
      world.scene.three.add(group);
      boxHandlesRef.current = { group, edges, handles, config };
    } else {
      boxHandlesRef.current.config = config;
    }
    layoutBoxHandles();
    settleUpdate();
  };

  return {
    pickingFace,
    sectionMessage,
    clearOutline,
    scheduleOutline,
    applyClipPlanes,
    resolvePickFace,
    layoutBoxHandles,
    disposeBoxHandles,
    attachBoxHandleDrag,
    setClipPlanes,
    setSectionOutline,
    setSectionCaps,
    getSectionCapStats,
    pickFace,
    cancelPickFace,
    setSectionHandle,
    setSectionBoxHandles,
  };
}

export type SectionGizmo = ReturnType<typeof useSectionGizmo>;
