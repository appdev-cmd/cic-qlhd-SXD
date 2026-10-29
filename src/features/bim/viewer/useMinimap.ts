// Bản đồ mặt bằng thu nhỏ (đi bộ trong công trình): vẽ mặt bằng tại cao độ mắt, vị trí/hướng camera,
// bấm để đi tới, kéo để quay hướng nhìn, chọn tầng để đổi cao độ mắt.
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MinimapTransform, fitExtent, mapToWorld, drawPlan, drawCamera } from '../lib/minimap';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { GeometryQueries } from './geometry';

export function useMinimap(
  ctx: ViewerContext,
  showMinimap: boolean,
  loadedVersion: number,
  core: ViewerCore,
  geometry: GeometryQueries,
) {
  const { worldRef, loadedRef } = ctx;
  const { sceneBox, settleUpdate } = core;
  const { collectBoxes, storeysOf } = geometry;

  const minimapRef = useRef<HTMLCanvasElement>(null);
  const minimapStateRef = useRef<{
    key: string;
    boxes: Float32Array | null;
    band: number | null;
    plan: HTMLCanvasElement | null;
    transform: MinimapTransform | null;
    lastDraw: number;
  }>({ key: '', boxes: null, band: null, plan: null, transform: null, lastDraw: 0 });

  const drawMinimap = (force = false) => {
    const canvas = minimapRef.current;
    const world = worldRef.current;
    const st = minimapStateRef.current;
    if (!canvas || !world) return;
    const now = performance.now();
    if (!force && now - st.lastDraw < 80) return;
    st.lastDraw = now;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dark = document.documentElement.classList.contains('dark');
    if (!st.boxes) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Đang dựng mặt bằng…', canvas.width / 2, canvas.height / 2);
      return;
    }
    const box = sceneBox();
    if (!box) return;
    const cam = world.camera.three;
    const eye = cam.position.y;
    const band = Math.round(eye / 0.5);
    if (!st.plan || st.band !== band || !st.transform) {
      st.transform = fitExtent(
        { minX: box.min.x, minZ: box.min.z, maxX: box.max.x, maxZ: box.max.z },
        canvas.width,
        canvas.height,
      );
      st.plan = st.plan || document.createElement('canvas');
      st.plan.width = canvas.width;
      st.plan.height = canvas.height;
      const pctx = st.plan.getContext('2d');
      if (pctx) drawPlan(pctx, st.boxes, eye, st.transform, dark);
      st.band = band;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(st.plan, 0, 0);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    drawCamera(ctx, st.transform, { x: cam.position.x, z: cam.position.z }, { x: dir.x, z: dir.z });
  };

  useEffect(() => {
    if (!showMinimap) return;
    const st = minimapStateRef.current;
    const key = [...loadedRef.current.keys()].sort().join(',');
    if (st.key === key && st.boxes) {
      drawMinimap(true);
      return;
    }
    let cancelled = false;
    st.key = key;
    st.boxes = null;
    st.plan = null;
    drawMinimap(true);
    (async () => {
      const flat: number[] = [];
      for (const modelId of loadedRef.current.keys()) {
        const list = await collectBoxes(modelId).catch(() => []);
        list.forEach((b) => flat.push(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]));
      }
      if (cancelled) return;
      st.boxes = new Float32Array(flat);
      st.band = null;
      drawMinimap(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMinimap, loadedVersion]);

  const minimapPoint = (clientX: number, clientY: number) => {
    const st = minimapStateRef.current;
    const canvas = minimapRef.current;
    if (!st.transform || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    return mapToWorld(
      st.transform,
      ((clientX - r.left) / r.width) * canvas.width,
      ((clientY - r.top) / r.height) * canvas.height,
    );
  };

  /** Bấm: đi tới điểm đó (giữ hướng nhìn). Kéo: quay người nhìn về phía con trỏ (giữ vị trí đứng). */
  const minimapDragRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    minimapDragRef.current = { x: e.clientX, y: e.clientY, dragged: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handleMinimapPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = minimapDragRef.current;
    const world = worldRef.current;
    if (!drag || !world) return;
    if (!drag.dragged && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    drag.dragged = true;
    const p = minimapPoint(e.clientX, e.clientY);
    if (!p) return;
    const cam = world.camera.three;
    const dx = p.x - cam.position.x;
    const dz = p.z - cam.position.z;
    if (Math.hypot(dx, dz) < 0.2) return;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const reach = Math.max(world.camera.controls.distance, 1);
    const flat = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(reach);
    world.camera.controls
      .setLookAt(
        cam.position.x,
        cam.position.y,
        cam.position.z,
        cam.position.x + flat.x,
        cam.position.y + dir.y * reach,
        cam.position.z + flat.z,
        false,
      )
      .catch(() => undefined);
    drawMinimap(true);
  };
  const handleMinimapPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = minimapDragRef.current;
    minimapDragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const world = worldRef.current;
    if (!drag || drag.dragged || !world) {
      settleUpdate();
      return;
    }
    const p = minimapPoint(e.clientX, e.clientY);
    if (!p) return;
    const cam = world.camera.three;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const eye = cam.position.y;
    world.camera.controls.setLookAt(p.x, eye, p.z, p.x + dir.x, eye + dir.y, p.z + dir.z, true).catch(() => undefined);
    settleUpdate();
  };

  /** Tầng để chọn trên bản đồ thu nhỏ: đưa mắt người xem tới cao độ sàn + 1,6 m */
  const [minimapStoreys, setMinimapStoreys] = useState<{ name: string; elevation: number }[]>([]);
  useEffect(() => {
    if (!showMinimap) return;
    let cancelled = false;
    (async () => {
      const byName = new Map<string, number>();
      for (const [modelId, m] of loadedRef.current) {
        const list = await storeysOf(modelId, m).catch(() => []);
        for (const s of list) {
          if (s.elevation === null || s.elevation === undefined || !Number.isFinite(s.elevation)) continue;
          const prev = byName.get(s.name);
          byName.set(s.name, prev === undefined ? s.elevation : Math.min(prev, s.elevation));
        }
      }
      if (!cancelled)
        setMinimapStoreys(
          [...byName].map(([name, elevation]) => ({ name, elevation })).sort((a, b) => a.elevation - b.elevation),
        );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMinimap, loadedVersion]);
  const gotoStorey = (elevation: number) => {
    const world = worldRef.current;
    if (!world) return;
    const cam = world.camera.three;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const eye = elevation + 1.6;
    world.camera.controls
      .setLookAt(cam.position.x, eye, cam.position.z, cam.position.x + dir.x * 5, eye, cam.position.z + dir.z * 5, true)
      .catch(() => undefined);
    minimapStateRef.current.band = null;
    settleUpdate();
  };

  return {
    minimapRef,
    drawMinimap,
    handleMinimapPointerDown,
    handleMinimapPointerMove,
    handleMinimapPointerUp,
    minimapStoreys,
    gotoStorey,
  };
}
