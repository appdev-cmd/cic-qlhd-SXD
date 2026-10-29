// Quét chọn khung chữ nhật (Marquee): kéo trái → phải quét trọn (Window), phải → trái quét chạm (Crossing).
import { useState } from 'react';
import * as THREE from 'three';
import { trianglesHitRect } from '../lib/marqueeGeometry';
import { toCssPx } from '@/features/bim/adapters/utils';
import type { BimWorld, ViewerContext } from './context';
import type { GeometryQueries } from './geometry';
import type { ViewerAppearance } from './useAppearance';
import type { MarqueeBox } from './types';

export function useMarqueeSelect(ctx: ViewerContext, geometry: GeometryQueries, appearance: ViewerAppearance) {
  const {
    worldRef,
    containerRef,
    loadedRef,
    boxesCacheRef,
    clipPlanesRef,
    measureModeRef,
    pickFaceRef,
    boxSelectModeRef,
  } = ctx;
  const { collectBoxes, readTriangles, itemShown } = geometry;
  const { selectManyElements } = appearance;
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const [marqueeCount, setMarqueeCount] = useState<number | null>(null);

  /**
   * Tìm cấu kiện nằm trong hoặc giao với khung quét màn hình (Marquee Box).
   * Kéo phải → trái: quét chạm (Crossing). Kéo trái → phải: quét trọn (Window).
   * `exact`: với quét chạm, cấu kiện chỉ chạm khung bằng hộp bao được kiểm tra lại bằng hình chiếu lưới tam giác thật.
   */
  const getElementsInScreenBox = async (
    boxX1: number,
    boxY1: number,
    boxX2: number,
    boxY2: number,
    exact = false,
  ): Promise<{ modelId: string; expressId: number }[]> => {
    const world = worldRef.current;
    const el = containerRef.current;
    if (!world || !el) return [];

    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width === 0 || height === 0) return [];

    const camera = world.camera.three;
    camera.updateMatrixWorld();

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const rect = {
      left: Math.min(boxX1, boxX2),
      right: Math.max(boxX1, boxX2),
      top: Math.min(boxY1, boxY2),
      bottom: Math.max(boxY1, boxY2),
    };
    const isCrossing = boxX2 < boxX1;

    const results: { modelId: string; expressId: number }[] = [];
    // Quét chạm: cấu kiện có hộp bao chạm khung nhưng không nằm trọn → cần kiểm tra lưới tam giác
    const uncertain: { modelId: string; expressId: number }[] = [];
    const centers: { modelId: string; expressId: number; cx: number; cy: number }[] = [];
    const tempBox = new THREE.Box3();
    const tempV = new THREE.Vector3();

    for (const [modelId] of loadedRef.current.entries()) {
      const boxes = boxesCacheRef.current.get(modelId) ?? (await collectBoxes(modelId));
      if (!boxes.length) continue;
      for (const b of boxes) {
        const expressId = b.id;
        if (!itemShown(modelId, expressId)) continue;
        tempBox.min.set(b.min[0], b.min[1], b.min[2]);
        tempBox.max.set(b.max[0], b.max[1], b.max[2]);
        // Bỏ qua nếu bị mặt cắt loại bỏ
        if (clipPlanesRef.current.length > 0) {
          const center = tempBox.getCenter(tempV);
          if (clipPlanesRef.current.some((p) => p.distanceToPoint(center) < -1e-4)) continue;
        }
        if (!frustum.intersectsBox(tempBox)) continue;

        // Chiếu 8 đỉnh hộp bao lên màn hình
        let minSx = Infinity;
        let maxSx = -Infinity;
        let minSy = Infinity;
        let maxSy = -Infinity;
        for (let c = 0; c < 8; c++) {
          tempV.set(c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]);
          tempV.applyMatrix4(projScreenMatrix);
          const sx = ((tempV.x + 1) / 2) * width;
          const sy = ((1 - tempV.y) / 2) * height;
          if (sx < minSx) minSx = sx;
          if (sx > maxSx) maxSx = sx;
          if (sy < minSy) minSy = sy;
          if (sy > maxSy) maxSy = sy;
        }
        const contained = minSx >= rect.left && maxSx <= rect.right && minSy >= rect.top && maxSy <= rect.bottom;
        if (isCrossing) {
          const overlaps = !(maxSx < rect.left || minSx > rect.right || maxSy < rect.top || minSy > rect.bottom);
          if (!overlaps) continue;
          if (contained) results.push({ modelId, expressId });
          else uncertain.push({ modelId, expressId });
        } else if (contained) {
          results.push({ modelId, expressId });
        } else {
          const center = tempBox.getCenter(tempV).applyMatrix4(projScreenMatrix);
          centers.push({ modelId, expressId, cx: ((center.x + 1) / 2) * width, cy: ((1 - center.y) / 2) * height });
        }
      }
    }

    if (isCrossing) {
      // Kiểm tra lưới thật chỉ khi thả chuột và số lượng vừa phải (giữ phản hồi < 200 ms); còn lại theo hộp bao
      const REFINE_LIMIT = 400;
      if (!exact || uncertain.length > REFINE_LIMIT) {
        results.push(...uncertain);
      } else {
        const byModel = new Map<string, number[]>();
        uncertain.forEach((u) => byModel.set(u.modelId, [...(byModel.get(u.modelId) ?? []), u.expressId]));
        for (const [modelId, ids] of byModel) {
          const tris = await readTriangles(modelId, ids);
          for (const id of ids) {
            const t = tris.get(id);
            // Không đọc được lưới: giữ kết quả theo hộp bao
            if (!t || t.length < 9 || trianglesHitRect(t, projScreenMatrix.elements, width, height, rect))
              results.push({ modelId, expressId: id });
          }
        }
      }
    }

    // Dự phòng: quét trọn mà cấu kiện to quá không lọt trọn, lấy cấu kiện có tâm nằm trong khung
    if (!isCrossing && results.length === 0) {
      for (const c of centers) {
        if (c.cx >= rect.left && c.cx <= rect.right && c.cy >= rect.top && c.cy <= rect.bottom)
          results.push({ modelId: c.modelId, expressId: c.expressId });
      }
    }
    return results;
  };

  /**
   * Trạng thái một lượt kéo quét chọn trên khung 3D (Shift + chuột trái hoặc chế độ quét chọn).
   * Bộ xử lý con trỏ của trình xem gọi begin/move/release; Esc gọi cancel.
   */
  const createMarqueeSession = (world: BimWorld, domEl: HTMLCanvasElement) => {
    let marqueeStartPos: { x: number; y: number } | null = null;
    let marqueeTriggerBtn: number | null = null;
    let isMarqueeDragging = false;
    let marqueeCalcTimer: number | undefined;

    const clearCalcTimer = () => window.clearTimeout(marqueeCalcTimer);

    const begin = (e: PointerEvent) => {
      // Quét chọn bằng Shift + chuột trái hoặc bật chế độ quét chọn trên thanh công cụ (không áp khi đang đo: Shift = khóa trục)
      if (
        e.button === 0 &&
        !measureModeRef.current &&
        !pickFaceRef.current &&
        (e.shiftKey || boxSelectModeRef.current)
      ) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          marqueeStartPos = { x: toCssPx(e.clientX - rect.left), y: toCssPx(e.clientY - rect.top) };
          marqueeTriggerBtn = e.button;
          isMarqueeDragging = false;
        }
      }
    };

    /** true = đang kéo quét chọn (không xử lý rê chuột/đo) */
    const move = (e: PointerEvent): boolean => {
      // Quét chọn hộp bằng chuột trái; chuột phải luôn dành cho lia camera.
      if (marqueeStartPos && marqueeTriggerBtn !== null) {
        const isLeftPressed = marqueeTriggerBtn === 0 && (e.buttons & 1) !== 0;

        if (isLeftPressed) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const curX = toCssPx(e.clientX - rect.left);
            const curY = toCssPx(e.clientY - rect.top);
            const dist = Math.hypot(curX - marqueeStartPos.x, curY - marqueeStartPos.y);

            if (dist > 5) {
              if (!isMarqueeDragging) {
                isMarqueeDragging = true;
                world.camera.controls.enabled = false;
                domEl.style.cursor = 'crosshair';
                try {
                  domEl.setPointerCapture?.(e.pointerId);
                } catch {
                  /* ignore */
                }
              }

              const box: MarqueeBox = {
                startX: marqueeStartPos.x,
                startY: marqueeStartPos.y,
                currentX: curX,
                currentY: curY,
                isCrossing: marqueeStartPos.x > curX,
                active: true,
              };
              setMarqueeBox(box);

              window.clearTimeout(marqueeCalcTimer);
              marqueeCalcTimer = window.setTimeout(async () => {
                if (!isMarqueeDragging) return;
                const items = await getElementsInScreenBox(box.startX, box.startY, box.currentX, box.currentY);
                setMarqueeCount(items.length);
              }, 60);

              return true; // dừng tại đây, không xử lý hover khi đang kéo quét chọn
            }
          }
        }
      }
      return false;
    };

    /** Thả chuột: đang kéo thì trả lời hứa chọn các cấu kiện trong khung; không thì null (xử lý bấm thường) */
    const release = (e: PointerEvent): Promise<void> | null => {
      // Nếu đang trong trạng thái quét chọn hộp (đã kéo chuột > 5px)
      if (isMarqueeDragging && marqueeStartPos) {
        try {
          domEl.releasePointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        e.preventDefault();
        e.stopPropagation();

        const rect = containerRef.current?.getBoundingClientRect();
        const endX = rect ? toCssPx(e.clientX - rect.left) : marqueeStartPos.x;
        const endY = rect ? toCssPx(e.clientY - rect.top) : marqueeStartPos.y;
        const sX = marqueeStartPos.x;
        const sY = marqueeStartPos.y;

        isMarqueeDragging = false;
        marqueeStartPos = null;
        marqueeTriggerBtn = null;
        setMarqueeBox(null);
        setMarqueeCount(null);
        world.camera.controls.enabled = true;
        domEl.style.cursor = '';

        return (async () => {
          const items = await getElementsInScreenBox(sX, sY, endX, endY, true);
          const additive = e.ctrlKey || e.metaKey || (e.button === 0 && e.shiftKey);
          await selectManyElements(items, { additive });
        })();
      }

      // Shift+click hoặc chế độ quét chọn mà không kéo.
      if (marqueeStartPos) {
        marqueeStartPos = null;
        marqueeTriggerBtn = null;
        isMarqueeDragging = false;
        setMarqueeBox(null);
        setMarqueeCount(null);
        world.camera.controls.enabled = true;
        domEl.style.cursor = '';
      }
      return null;
    };

    const cancel = () => {
      if (isMarqueeDragging) {
        window.clearTimeout(marqueeCalcTimer);
        isMarqueeDragging = false;
        marqueeStartPos = null;
        marqueeTriggerBtn = null;
        setMarqueeBox(null);
        setMarqueeCount(null);
        world.camera.controls.enabled = true;
        domEl.style.cursor = '';
      }
    };

    return { begin, move, release, cancel, clearCalcTimer };
  };

  return { marqueeBox, marqueeCount, getElementsInScreenBox, createMarqueeSession };
}

export type MarqueeSelect = ReturnType<typeof useMarqueeSelect>;
