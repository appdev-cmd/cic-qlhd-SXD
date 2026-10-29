// Tương tác con trỏ & bàn phím trên khung 3D: chọn / chọn cộng dồn, menu ngữ cảnh, rê chuột, đo, chọn mặt,
// quét chọn (qua useMarqueeSelect), kéo tay nắm hộp cắt (qua useSectionGizmo) và phím điều hướng.
import React, { useState } from 'react';
import * as THREE from 'three';
import { cycleIndex, viewerKeyAction, MOVE_STEP_RATIO } from '../lib/viewerKeyboard';
import { HOVER_MATERIAL } from '../lib/viewerConstants';
import { toCssPx } from '@/features/bim/adapters/utils';
import type { BimWorld, ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { ViewerAppearance } from './useAppearance';
import type { MeasureTool } from './useMeasureTool';
import type { SectionGizmo } from './useSectionGizmo';
import type { MarqueeSelect } from './useMarqueeSelect';

export function useViewerPointer(
  ctx: ViewerContext,
  core: ViewerCore,
  appearance: ViewerAppearance,
  measure: MeasureTool,
  section: SectionGizmo,
  marquee: Pick<MarqueeSelect, 'createMarqueeSession'>,
) {
  const {
    worldRef,
    containerRef,
    loadedRef,
    pickerRef,
    fragmentsRef,
    hoverRef,
    nameCacheRef,
    selectionRef,
    cycleRef,
    movingRef,
    measureModeRef,
    pickFaceRef,
    userMovedRef,
    onElementSelectedRef,
    onContextMenuRef,
  } = ctx;
  const { getModel, settleUpdate, raycastAll, describeItem, flyToBox } = core;
  const { isSelected, selectionList, applySelection, queueAppearance, restoreItemColor } = appearance;
  const { undoMeasure, raycastSnap, showSnapIndicator, updatePreview, handleMeasureClick, showTouchCandidate } =
    measure;
  const { resolvePickFace, attachBoxHandleDrag } = section;
  const { createMarqueeSession } = marquee;
  const [hoverInfo, setHoverInfo] = useState<{ text: string; x: number; y: number } | null>(null);

  /** Chọn cấu kiện tại một điểm màn hình rồi báo ra ngoài như khi bấm chuột */
  const pickAt = async (clientX: number, clientY: number, additive = false) => {
    const hit = await raycastAll(clientX, clientY);
    if (!hit) return null;
    await applySelection(hit.modelId, hit.localId, additive);
    const info = await describeItem(hit.modelId, hit.localId);
    onElementSelectedRef.current?.(info, { additive, count: selectionList().length });
    return info;
  };

  /** ] / [: chuyển lần lượt giữa các cấu kiện đang chọn (bay tới và hiện thuộc tính) */
  const cycleSelection = async (direction: 1 | -1) => {
    const list = selectionList();
    if (!list.length) return;
    const index = cycleIndex(cycleRef.current < list.length ? cycleRef.current : -1, list.length, direction);
    cycleRef.current = index;
    const item = list[index];
    selectionRef.current = { modelId: item.modelId, id: item.expressId };
    const box = await getModel(item.modelId)?.getMergedBox([item.expressId]);
    if (box && !box.isEmpty()) flyToBox(box);
    const info = await describeItem(item.modelId, item.expressId);
    onElementSelectedRef.current?.(info, { additive: true, count: list.length });
  };

  /** Bàn phím khi khung 3D đang được chọn: xoay, lia, tiến lùi, chọn ở giữa khung, chuyển cấu kiện */
  const handleViewerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement) !== e.currentTarget) return;
    const world = worldRef.current;
    if (!world) return;
    if (e.key === 'Escape' && pickFaceRef.current) {
      pickFaceRef.current(null);
      e.preventDefault();
      return;
    }
    const action = viewerKeyAction(e, { measuring: !!measureModeRef.current });
    if (!action || action.type === 'undo-point') return;
    const controls = world.camera.controls;
    const step = Math.max(controls.distance * MOVE_STEP_RATIO, 0.2);
    switch (action.type) {
      case 'orbit':
        controls
          .rotate(THREE.MathUtils.degToRad(action.azimuthDeg), THREE.MathUtils.degToRad(action.polarDeg), true)
          .catch(() => undefined);
        break;
      case 'pan':
        controls.truck(action.x * step, -action.y * step, true).catch(() => undefined);
        break;
      case 'dolly':
        if (world.camera.projection.current === 'Orthographic')
          controls
            .zoom((world.camera.three as THREE.OrthographicCamera).zoom * 0.15 * action.amount, true)
            .catch(() => undefined);
        else controls.dolly(action.amount * step, true).catch(() => undefined);
        break;
      case 'pick-center': {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) void pickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
        break;
      }
      case 'cycle':
        void cycleSelection(action.direction);
        break;
      case 'undo-measure':
        if (!undoMeasure()) return;
        break;
    }
    userMovedRef.current = true;
    e.preventDefault();
    e.stopPropagation();
    settleUpdate();
  };

  /**
   * Gắn bộ xử lý con trỏ / phím lên canvas của cảnh: bấm chọn, menu ngữ cảnh (cả nhấn giữ cảm ứng), đo, chọn mặt,
   * quét chọn, rê chuột tô sáng + tên cấu kiện, nhấp đúp bay tới. Trả hàm gỡ toàn bộ sự kiện và hẹn giờ.
   */
  const attachPointerHandlers = (world: BimWorld, domEl: HTMLCanvasElement) => {
    const marquee = createMarqueeSession(world, domEl);
    const downPos = { x: 0, y: 0 };
    let pointerDragged = false;
    // Nhấn giữ trên cảm ứng = chuột phải (menu ngữ cảnh)
    let longPressTimer: number | undefined;
    let longPressFired = false;
    const LONG_PRESS_MS = 550;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button === 1) e.preventDefault();
      downPos.x = e.clientX;
      downPos.y = e.clientY;
      pointerDragged = false;
      longPressFired = false;
      window.clearTimeout(longPressTimer);
      // Bấm vào mô hình thì khung 3D nhận phím điều hướng
      if (document.activeElement !== containerRef.current) containerRef.current?.focus({ preventScroll: true });
      if (e.pointerType === 'touch' && e.isPrimary && !measureModeRef.current && !pickFaceRef.current) {
        const { clientX, clientY } = e;
        longPressTimer = window.setTimeout(async () => {
          if (pointerDragged || loadedRef.current.size === 0) return;
          longPressFired = true;
          const info = await pickAt(clientX, clientY);
          if (!info) return;
          const rect = containerRef.current!.getBoundingClientRect();
          onContextMenuRef.current?.(info, { x: toCssPx(clientX - rect.left), y: toCssPx(clientY - rect.top) });
        }, LONG_PRESS_MS);
      }

      marquee.begin(e);
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const handlePointerUp = async (e: PointerEvent) => {
      marquee.clearCalcTimer();
      window.clearTimeout(longPressTimer);
      if (longPressFired) {
        longPressFired = false;
        return;
      }

      const marqueeSelection = marquee.release(e);
      if (marqueeSelection) {
        await marqueeSelection;
        return;
      }

      if (pointerDragged || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) return;
      if (loadedRef.current.size === 0) return;

      if (e.button === 2) {
        const hit = await raycastAll(e.clientX, e.clientY);
        if (!hit) return;
        // Bấm phải vào cấu kiện đang nằm trong lựa chọn nhiều: giữ nguyên lựa chọn (cô lập/ẩn/đo cho cả nhóm)
        if (!isSelected(hit.modelId, hit.localId)) await applySelection(hit.modelId, hit.localId);
        const info = await describeItem(hit.modelId, hit.localId);
        onElementSelectedRef.current?.(info);
        const rect = containerRef.current!.getBoundingClientRect();
        onContextMenuRef.current?.(info, { x: toCssPx(e.clientX - rect.left), y: toCssPx(e.clientY - rect.top) });
        return;
      }
      if (e.button !== 0) return;

      if (pickFaceRef.current) {
        await resolvePickFace(e.clientX, e.clientY);
        return;
      }
      if (measureModeRef.current) {
        const snapHit = await raycastSnap(e.clientX, e.clientY);
        if (e.pointerType === 'touch') {
          // Ngón tay che điểm bấm: hiện điểm bắt và chờ xác nhận thay vì đặt điểm ngay
          showTouchCandidate(snapHit, e.clientX, e.clientY);
          return;
        }
        if (snapHit) handleMeasureClick(snapHit, e.clientX, e.clientY, e.shiftKey);
        return;
      }
      const hit = await raycastAll(e.clientX, e.clientY);
      if (!hit) {
        await applySelection(null, null);
        onElementSelectedRef.current?.(null);
        return;
      }
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      await applySelection(hit.modelId, hit.localId, additive);
      const info = await describeItem(hit.modelId, hit.localId);
      onElementSelectedRef.current?.(info, { additive, count: selectionList().length });
    };
    const handleContext = (e: MouseEvent) => e.preventDefault();
    const handleDblClick = async (e: MouseEvent) => {
      if (measureModeRef.current) return;
      const hit = await raycastAll(e.clientX, e.clientY);
      if (!hit) return;
      const box = await getModel(hit.modelId)?.getMergedBox([hit.localId]);
      if (box) flyToBox(box);
    };

    // Rê chuột: tô sáng nhẹ + hiện tên cấu kiện
    let hoverTimer: number | undefined;
    let snapTimer: number | undefined;
    const clearHover = async () => {
      const prev = hoverRef.current;
      hoverRef.current = null;
      setHoverInfo(null);
      if (!prev) return;
      // Xếp hàng cùng ghost/tô màu/chọn để không đè trạng thái đang được áp dở
      await queueAppearance(async () => {
        const now = hoverRef.current;
        if (isSelected(prev.modelId, prev.id) || (now?.modelId === prev.modelId && now.id === prev.id)) return;
        await restoreItemColor(prev.modelId, prev.id);
        fragmentsRef.current?.core.update(true);
      });
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (
        e.buttons &&
        Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > (e.pointerType === 'touch' ? 10 : 4)
      ) {
        pointerDragged = true;
        window.clearTimeout(longPressTimer);
      }
      if (loadedRef.current.size === 0) return;

      if (marquee.move(e)) return; // dừng tại đây, không xử lý hover khi đang kéo quét chọn
      if (loadedRef.current.size === 0) return;
      if (measureModeRef.current) {
        window.clearTimeout(snapTimer);
        if (e.buttons !== 0 || movingRef.current) return;
        if (e.pointerType === 'touch') return;
        const lock = e.shiftKey;
        snapTimer = window.setTimeout(async () => {
          if (!measureModeRef.current) return;
          const snap = await raycastSnap(e.clientX, e.clientY);
          if (!measureModeRef.current) return;
          showSnapIndicator(snap);
          updatePreview(snap, lock);
        }, 60);
        return;
      }
      window.clearTimeout(hoverTimer);
      // Đang kéo chuột xoay/lia hoặc camera còn trôi: bỏ qua dò cấu kiện dưới con trỏ (đọc GPU gây giật)
      if (e.buttons !== 0 || movingRef.current) return;
      hoverTimer = window.setTimeout(async () => {
        const picker = pickerRef.current;
        const el = containerRef.current;
        if (!picker || !el) return;
        const rect = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        let hit: { modelId: string; localId: number } | null;
        try {
          hit = await picker.getItemAt(ndc);
        } catch {
          hit = null;
        }
        if (!hit) {
          await clearHover();
          return;
        }
        const prev = hoverRef.current;
        if (prev && prev.modelId === hit.modelId && prev.id === hit.localId) {
          setHoverInfo((info) =>
            info ? { ...info, x: toCssPx(e.clientX - rect.left), y: toCssPx(e.clientY - rect.top) } : info,
          );
          return;
        }
        const target = hit;
        hoverRef.current = { modelId: target.modelId, id: target.localId };
        await queueAppearance(async () => {
          if (prev && !isSelected(prev.modelId, prev.id)) await restoreItemColor(prev.modelId, prev.id);
          // Con trỏ đã rời đi trong lúc chờ hàng đợi: không tô hover muộn
          const now = hoverRef.current;
          if (now?.modelId !== target.modelId || now.id !== target.localId) return;
          if (!isSelected(target.modelId, target.localId))
            await getModel(target.modelId)?.highlight([target.localId], HOVER_MATERIAL);
          fragmentsRef.current?.core.update(true);
        });
        const key = `${hit.modelId}:${hit.localId}`;
        let text = nameCacheRef.current.get(key) || '';
        if (!text) {
          const info = await describeItem(hit.modelId, hit.localId);
          text = [info.name, info.category].filter(Boolean).join(' · ') || `Cấu kiện #${hit.localId}`;
          nameCacheRef.current.set(key, text);
        }
        setHoverInfo({ text, x: toCssPx(e.clientX - rect.left), y: toCssPx(e.clientY - rect.top) });
      }, 90);
    };
    const handlePointerLeave = () => {
      window.clearTimeout(hoverTimer);
      clearHover();
    };

    const detachBoxHandleDrag = attachBoxHandleDrag(world, domEl);

    domEl.addEventListener('pointermove', handlePointerMove);
    domEl.addEventListener('pointerleave', handlePointerLeave);

    domEl.addEventListener('pointerdown', handlePointerDown);
    domEl.addEventListener('pointerup', handlePointerUp);
    domEl.addEventListener('mousedown', handleMouseDown);
    domEl.addEventListener('auxclick', handleAuxClick);
    domEl.addEventListener('contextmenu', handleContext);
    domEl.addEventListener('dblclick', handleDblClick);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pickFaceRef.current) pickFaceRef.current(null);
      if (e.key === 'Escape') marquee.cancel();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      marquee.clearCalcTimer();
      window.clearTimeout(hoverTimer);
      window.clearTimeout(snapTimer);
      window.clearTimeout(longPressTimer);
      detachBoxHandleDrag();
      domEl.removeEventListener('pointermove', handlePointerMove);
      domEl.removeEventListener('pointerleave', handlePointerLeave);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      domEl.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('mousedown', handleMouseDown);
      domEl.removeEventListener('auxclick', handleAuxClick);
      domEl.removeEventListener('contextmenu', handleContext);
      domEl.removeEventListener('dblclick', handleDblClick);
    };
  };

  return { hoverInfo, pickAt, cycleSelection, handleViewerKeyDown, attachPointerHandlers };
}
