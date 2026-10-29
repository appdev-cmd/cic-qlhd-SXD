// Công cụ đo trên mô hình: phép đo là dữ liệu (dựng lại được từ góc nhìn đã lưu), điểm bắt, xem trước,
// hoàn tác, xác nhận điểm trên cảm ứng, đo theo lựa chọn (khoảng hở, hộp bao) và ghim tâm va chạm.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import type { BimMeasurementRecord } from '@/features/bim/types/bim.types';
import { meshClearance } from '../lib/clearance';
import {
  MEASURE_COLORS,
  axisLock,
  describeMeasurement,
  newMeasurementId,
  perpendicularFoot,
  previewText,
  requiredPoints,
} from '../lib/measureRecords';
import { MEASURE_HINTS, SNAP_LABEL, toVec3 } from '../lib/viewerConstants';
import { Vec3, pickSnap } from '../lib/measureMath';
import { toCssPx } from '@/features/bim/adapters/utils';
import { disposeObject, makeLine } from './sceneObjects';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { GeometryQueries } from './geometry';
import type { ViewerAppearance } from './useAppearance';
import type { BimMeasureMode, BimMeasureResult, Measurement, MeasureHit } from './types';

export function useMeasureTool(
  ctx: ViewerContext,
  measureMode: BimMeasureMode,
  core: ViewerCore,
  geometry: GeometryQueries,
  appearance: ViewerAppearance,
) {
  const {
    worldRef,
    containerRef,
    labelLayerRef,
    measureModeRef,
    measurementsRef,
    pendingRef,
    previewRef,
    touchHitRef,
    snapEnabledRef,
    clashMarkerRef,
    clipPlanesRef,
    snapMarkerRef,
  } = ctx;
  const { getModel, settleUpdate, sceneBox, raycastAll, toScreen, placeLabel, pixelWorldSize } = core;
  const { readTriangles } = geometry;
  const { selectionList } = appearance;
  const [measureHint, setMeasureHint] = useState<string | null>(null);
  // Cảm ứng: chạm để xem điểm bắt, bấm "Đặt điểm" để xác nhận
  const [touchConfirm, setTouchConfirm] = useState<{ x: number; y: number } | null>(null);

  const makeMarker = (point: THREE.Vector3, color: string) => {
    const box = sceneBox();
    const size = box ? Math.max(box.getSize(new THREE.Vector3()).length() / 400, 0.03) : 0.05;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: false }),
    );
    marker.renderOrder = 999;
    marker.position.copy(point);
    return marker;
  };

  const hintFor = (mode: BimMeasureMode, step: number) => {
    if (!mode) return null;
    const list = MEASURE_HINTS[mode];
    return list[Math.min(step, list.length - 1)];
  };

  const makeLabel = (record: BimMeasurementRecord, text: string) => {
    const label = document.createElement('div');
    label.className =
      'absolute -translate-x-1/2 -translate-y-full flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-md text-2xs font-semibold text-white shadow-md whitespace-nowrap pointer-events-auto';
    label.style.background = MEASURE_COLORS[record.kind];
    label.dataset.measureId = record.id;
    const span = document.createElement('span');
    span.textContent = text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = 'Xóa phép đo này';
    remove.setAttribute('aria-label', `Xóa phép đo ${text}`);
    remove.className =
      'ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-black/25 leading-none';
    remove.textContent = '×';
    remove.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    remove.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeMeasurement(record.id);
    });
    label.append(span, remove);
    labelLayerRef.current?.appendChild(label);
    return label;
  };

  const updateLabels = () => {
    for (const m of measurementsRef.current) placeLabel(m.label, m.anchor);
    const clash = clashMarkerRef.current;
    if (clash) placeLabel(clash.el, clash.anchor);
    const preview = previewRef.current;
    if (preview?.anchor) placeLabel(preview.label, preview.anchor);
  };

  /** Dựng hình học của một phép đo theo loại */
  const buildMeasurementGroup = (rec: BimMeasurementRecord) => {
    const color = MEASURE_COLORS[rec.kind];
    const pts = rec.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const group = new THREE.Group();
    const markers = (list: THREE.Vector3[]) => list.forEach((p) => group.add(makeMarker(p, color)));
    switch (rec.kind) {
      case 'elevation':
        markers(pts.slice(0, 1));
        break;
      case 'distance':
      case 'clearance':
        markers(pts.slice(0, 2));
        group.add(makeLine(pts.slice(0, 2), color, rec.kind === 'clearance' && !!rec.approximate));
        break;
      case 'slope': {
        const [a, b] = pts;
        markers([a, b]);
        group.add(makeLine([a, b], color));
        group.add(makeLine([a, new THREE.Vector3(b.x, a.y, b.z), b], color, true));
        break;
      }
      case 'angle':
        markers(pts.slice(0, 3));
        group.add(makeLine(pts.slice(0, 3), color));
        break;
      case 'perpendicular': {
        const [a, b] = pts;
        const foot = new THREE.Vector3(...perpendicularFoot(rec));
        markers([a, b]);
        group.add(makeLine([b, foot], color));
        group.add(makeLine([a, foot], color, true));
        break;
      }
      case 'area': {
        markers(pts);
        group.add(makeLine([...pts, pts[0]], color));
        // Mặt tô trong suốt (quạt tam giác từ đỉnh đầu)
        const positions: number[] = [];
        for (let i = 1; i < pts.length - 1; i++)
          positions.push(...toVec3(pts[0]), ...toVec3(pts[i]), ...toVec3(pts[i + 1]));
        const fillGeom = new THREE.BufferGeometry();
        fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const fill = new THREE.Mesh(
          fillGeom,
          new THREE.MeshBasicMaterial({
            color: '#10b981',
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        fill.renderOrder = 997;
        group.add(fill);
        break;
      }
      case 'bbox': {
        const box = new THREE.Box3(pts[0].clone().min(pts[1]), pts[0].clone().max(pts[1]));
        const helper = new THREE.Box3Helper(box, new THREE.Color(color));
        (helper.material as THREE.LineBasicMaterial).depthTest = false;
        helper.renderOrder = 998;
        group.add(helper);
        break;
      }
    }
    return group;
  };

  const addMeasurement = (record: BimMeasurementRecord) => {
    const world = worldRef.current;
    if (!world) return;
    const group = buildMeasurementGroup(record);
    world.scene.three.add(group);
    const { text, anchor } = describeMeasurement(record);
    const label = makeLabel(record, text);
    measurementsRef.current.push({ record, group, label, anchor: new THREE.Vector3(...anchor) });
    updateLabels();
    settleUpdate();
  };

  const disposeMeasurement = (m: Measurement) => {
    // Khung xem bị gỡ giữa chừng (lỗi, nạp nóng) có thể để lại phần tử đo chưa đủ nhóm hình hoặc nhãn
    if (m?.group) worldRef.current?.scene.three.remove(m.group);
    disposeObject(m?.group);
    m?.label?.remove();
  };

  const removeMeasurement = (id: string) => {
    const index = measurementsRef.current.findIndex((m) => m.record.id === id);
    if (index < 0) return;
    disposeMeasurement(measurementsRef.current[index]);
    measurementsRef.current.splice(index, 1);
    settleUpdate();
  };

  const hidePreview = () => {
    const preview = previewRef.current;
    if (!preview) return;
    worldRef.current?.scene.three.remove(preview.line);
    disposeObject(preview.line);
    preview.label.remove();
    previewRef.current = null;
  };

  /** Đoạn xem trước (rubber-band) từ điểm vừa đặt tới vị trí con trỏ, kèm số đo tạm */
  const updatePreview = (hit: MeasureHit | null, lock: boolean) => {
    const pending = pendingRef.current;
    const mode = measureModeRef.current;
    const world = worldRef.current;
    if (!pending || !pending.points.length || !hit || !mode || !world) {
      hidePreview();
      return;
    }
    const last = pending.points[pending.points.length - 1];
    const cursor = lock ? new THREE.Vector3(...axisLock(toVec3(last), toVec3(hit.point)).point) : hit.point.clone();
    const points = mode === 'area' && pending.points.length >= 2 ? [last, cursor, pending.points[0]] : [last, cursor];
    let preview = previewRef.current;
    if (!preview) {
      const line = makeLine(points, MEASURE_COLORS[mode], true);
      world.scene.three.add(line);
      const label = document.createElement('div');
      label.className =
        'absolute -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-2xs font-semibold whitespace-nowrap pointer-events-none dark:bg-slate-900';
      label.dataset.measurePreview = 'true';
      labelLayerRef.current?.appendChild(label);
      preview = { line, label, anchor: null };
      previewRef.current = preview;
    } else {
      preview.line.geometry.dispose();
      preview.line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      preview.line.computeLineDistances();
    }
    preview.label.textContent = `${previewText(mode, pending.points.map(toVec3), toVec3(cursor))}${lock ? ' · khóa trục' : ''}`;
    preview.anchor = last.clone().add(cursor).multiplyScalar(0.5);
    placeLabel(preview.label, preview.anchor);
  };

  const removePending = () => {
    hidePreview();
    const pending = pendingRef.current;
    if (!pending) return;
    worldRef.current?.scene.three.remove(pending.group);
    disposeObject(pending.group);
    pendingRef.current = null;
  };

  /** Vẽ lại các điểm đang đặt dở (sau khi hoàn tác điểm cuối) */
  const redrawPending = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const color = MEASURE_COLORS[pending.kind];
    disposeObject(pending.group);
    pending.group.clear();
    pending.points.forEach((p, i) => {
      pending.group.add(makeMarker(p, color));
      if (i > 0) pending.group.add(makeLine([pending.points[i - 1], p], color));
    });
  };

  const clearMeasurements = () => {
    for (const m of measurementsRef.current) disposeMeasurement(m);
    measurementsRef.current = [];
    removePending();
    settleUpdate();
  };

  const finishArea = () => {
    const pending = pendingRef.current;
    if (!pending || measureModeRef.current !== 'area' || pending.points.length < 3) return;
    const points = pending.points.map(toVec3);
    removePending();
    addMeasurement({ id: newMeasurementId(), kind: 'area', points });
    setMeasureHint(hintFor('area', 0));
  };

  const handleMeasureClick = (hit: MeasureHit, clientX: number, clientY: number, lock = false) => {
    const world = worldRef.current;
    const mode = measureModeRef.current;
    if (!world || !mode) return;
    let point = hit.point.clone();

    if (mode === 'elevation') {
      // Fragments dùng trục Y hướng lên (tương ứng trục Z của IFC)
      addMeasurement({ id: newMeasurementId(), kind: 'elevation', points: [toVec3(point)] });
      return;
    }

    if (!pendingRef.current) {
      const group = new THREE.Group();
      world.scene.three.add(group);
      pendingRef.current = { kind: mode, points: [], group, normal: hit.normal?.clone() };
    }
    const pending = pendingRef.current;
    const color = MEASURE_COLORS[mode];
    if (lock && pending.points.length) {
      point = new THREE.Vector3(...axisLock(toVec3(pending.points[pending.points.length - 1]), toVec3(point)).point);
    }

    // Vùng diện tích: bấm lại gần đỉnh đầu → khép vùng
    if (mode === 'area' && pending.points.length >= 3) {
      const first = toScreen(pending.points[0]);
      const rect = containerRef.current!.getBoundingClientRect();
      if (first && Math.hypot(first.x - toCssPx(clientX - rect.left), first.y - toCssPx(clientY - rect.top)) < 12) {
        finishArea();
        return;
      }
    }

    pending.points.push(point);
    pending.group.add(makeMarker(point, color));
    if (pending.points.length > 1) pending.group.add(makeLine(pending.points.slice(-2), color));
    hidePreview();

    if (pending.points.length < requiredPoints(mode)) {
      setMeasureHint(hintFor(mode, pending.points.length));
      return;
    }
    const n =
      pending.normal && pending.normal.lengthSq() > 1e-9
        ? pending.normal.clone().normalize()
        : new THREE.Vector3(0, 1, 0);
    const record: BimMeasurementRecord = {
      id: newMeasurementId(),
      kind: mode,
      points: pending.points.map(toVec3),
      ...(mode === 'perpendicular' ? { normal: toVec3(n) } : {}),
    };
    removePending();
    addMeasurement(record);
    setMeasureHint(hintFor(mode, 0));
  };

  /** Backspace: bỏ điểm vừa đặt; không còn điểm đang đặt thì xoá phép đo gần nhất */
  const undoMeasure = () => {
    const pending = pendingRef.current;
    if (pending?.points.length) {
      pending.points.pop();
      const left = pending.points.length;
      if (!left) removePending();
      else {
        redrawPending();
        hidePreview();
      }
      setMeasureHint(hintFor(measureModeRef.current, left));
      settleUpdate();
      return true;
    }
    const last = measurementsRef.current[measurementsRef.current.length - 1];
    if (!last) return false;
    removeMeasurement(last.record.id);
    return true;
  };

  /** Ghim tâm vùng va chạm: chấm đỏ luôn nổi trên mô hình + nhãn, vạch đứng giúp thấy cao độ */
  const setClashMarker = (center: [number, number, number] | null) => {
    const prev = clashMarkerRef.current;
    if (prev) {
      worldRef.current?.scene.three.remove(prev.group);
      disposeObject(prev.group);
      prev.el.remove();
      clashMarkerRef.current = null;
    }
    const world = worldRef.current;
    if (!center || !world || !center.every(Number.isFinite)) {
      settleUpdate();
      return;
    }
    const anchor = new THREE.Vector3(...center);
    const group = new THREE.Group();
    const r = Math.max(pixelWorldSize(world.camera.three.position.distanceTo(anchor)) * 7, 0.03);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#dc2626', depthTest: false, transparent: true, opacity: 0.9 }),
    );
    dot.position.copy(anchor);
    dot.renderOrder = 999;
    group.add(dot);
    group.add(
      makeLine(
        [anchor.clone().add(new THREE.Vector3(0, -r * 6, 0)), anchor.clone().add(new THREE.Vector3(0, r * 6, 0))],
        '#dc2626',
      ),
    );
    group.userData.clashMarker = true;
    world.scene.three.add(group);
    const el = document.createElement('div');
    el.className =
      'absolute -translate-x-1/2 -translate-y-full px-1.5 py-0.5 rounded bg-rose-600 text-white text-2xs font-semibold whitespace-nowrap pointer-events-none shadow dark:bg-rose-600';
    el.textContent = 'Điểm va chạm';
    el.dataset.clashMarker = 'true';
    labelLayerRef.current?.appendChild(el);
    clashMarkerRef.current = { group, el, anchor };
    placeLabel(el, anchor);
    settleUpdate();
  };

  /** Khoảng cách gần nhất giữa đúng hai cấu kiện đang chọn (lưới tam giác thật, quá nặng thì theo hộp bao) */
  const measureSelectionClearance = async (): Promise<BimMeasureResult> => {
    const picked = selectionList();
    if (picked.length !== 2)
      return { ok: false, message: 'Chọn đúng hai cấu kiện (Ctrl + bấm) để đo khoảng hở giữa chúng.' };
    const meshes = await Promise.all(
      picked.map(async ({ modelId, expressId }) => (await readTriangles(modelId, [expressId])).get(expressId) ?? null),
    );
    let result = meshes[0] && meshes[1] ? meshClearance(meshes[0], meshes[1]) : null;
    if (!result) {
      // Thiếu lưới tam giác: tính theo hộp bao
      const boxes = await Promise.all(
        picked.map(({ modelId, expressId }) => getModel(modelId)?.getMergedBox([expressId])),
      );
      const [ba, bb] = boxes;
      if (!ba || !bb || ba.isEmpty() || bb.isEmpty())
        return { ok: false, message: 'Không đọc được hình học của cấu kiện đang chọn.' };
      const b = bb.clampPoint(ba.getCenter(new THREE.Vector3()), new THREE.Vector3());
      const a = ba.clampPoint(b, new THREE.Vector3());
      result = {
        distance: a.distanceTo(b),
        a: toVec3(a),
        b: toVec3(bb.clampPoint(a, new THREE.Vector3())),
        exact: false,
      };
    }
    const record: BimMeasurementRecord = {
      id: newMeasurementId(),
      kind: 'clearance',
      points: [result.a, result.b],
      ...(result.exact ? {} : { approximate: true }),
    };
    addMeasurement(record);
    return { ok: true, message: describeMeasurement(record).text };
  };

  const measureSelectionBox = async (): Promise<BimMeasureResult> => {
    const picked = selectionList();
    if (!picked.length) return { ok: false, message: 'Chọn cấu kiện trên mô hình trước.' };
    const box = new THREE.Box3();
    const byModel = new Map<string, number[]>();
    picked.forEach(({ modelId, expressId }) => byModel.set(modelId, [...(byModel.get(modelId) ?? []), expressId]));
    for (const [modelId, ids] of byModel) {
      const b = await getModel(modelId)?.getMergedBox(ids);
      if (b && !b.isEmpty()) box.union(b);
    }
    if (box.isEmpty()) return { ok: false, message: 'Không đọc được hình học của cấu kiện đang chọn.' };
    const record: BimMeasurementRecord = {
      id: newMeasurementId(),
      kind: 'bbox',
      points: [toVec3(box.min), toVec3(box.max)],
    };
    addMeasurement(record);
    return { ok: true, message: describeMeasurement(record).text };
  };

  /** Dò tia có bắt điểm: đỉnh, trung điểm cạnh, cạnh, mặt */
  const raycastSnap = async (clientX: number, clientY: number): Promise<MeasureHit | null> => {
    const world = worldRef.current;
    const base = await raycastAll(clientX, clientY);
    if (!world || !base) return null;
    const plain: MeasureHit = { point: base.point, normal: base.normal, kind: 'mat' };
    if (!snapEnabledRef.current) return plain;
    const m = getModel(base.modelId);
    if (!m) return plain;
    try {
      const results = await m.raycastWithSnapping({
        camera: world.camera.three,
        mouse: new THREE.Vector2(clientX, clientY),
        dom: world.renderer!.three.domElement,
        snappingClasses: [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE, FRAGS.SnappingClass.FACE],
      });
      const hits = (results || [])
        .filter((r) => !clipPlanesRef.current.some((p) => p.distanceToPoint(r.point) < -1e-4))
        .map((r) => ({
          kind: (r.snappingClass === FRAGS.SnappingClass.POINT
            ? 'point'
            : r.snappingClass === FRAGS.SnappingClass.LINE
              ? 'line'
              : 'face') as 'point' | 'line' | 'face',
          point: toVec3(r.point),
          edge:
            r.snappedEdgeP1 && r.snappedEdgeP2
              ? ([toVec3(r.snappedEdgeP1), toVec3(r.snappedEdgeP2)] as [Vec3, Vec3])
              : undefined,
          distance: r.distance,
        }));
      const snap = pickSnap(hits, pixelWorldSize(base.distance) * 10);
      if (!snap) return plain;
      return { point: new THREE.Vector3(...snap.point), normal: base.normal, kind: snap.kind };
    } catch {
      return plain;
    }
  };

  /** Rê chuột khi đang đo: hiện điểm bắt (đỉnh/trung điểm/cạnh/mặt) */
  const showSnapIndicator = (hit: MeasureHit | null) => {
    const el = snapMarkerRef.current;
    if (!el) return;
    const s = hit ? toScreen(hit.point) : null;
    if (!hit || !s) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    const text = el.querySelector('span');
    if (text) text.textContent = SNAP_LABEL[hit.kind];
  };

  useEffect(() => {
    removePending();
    showSnapIndicator(null);
    touchHitRef.current = null;
    setTouchConfirm(null);
    setMeasureHint(hintFor(measureMode, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureMode]);

  // Khi đang đo: Enter khép vùng diện tích · Backspace/Delete/Ctrl+Z bỏ điểm cuối (hết điểm thì xoá phép đo cuối)
  useEffect(() => {
    if (!measureMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter' && measureMode === 'area') {
        e.preventDefault();
        finishArea();
        return;
      }
      const undo =
        e.key === 'Backspace' || e.key === 'Delete' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z');
      if (!undo) return;
      e.preventDefault();
      e.stopPropagation();
      undoMeasure();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureMode]);

  /** Cảm ứng: hiện điểm bắt vừa chạm và chờ người dùng bấm "Đặt điểm" (ngón tay che điểm bấm) */
  const showTouchCandidate = (snapHit: MeasureHit | null, clientX: number, clientY: number) => {
    touchHitRef.current = snapHit ? { hit: snapHit, clientX, clientY } : null;
    showSnapIndicator(snapHit);
    updatePreview(snapHit, false);
    setTouchConfirm(snapHit ? toScreen(snapHit.point) : null);
  };

  /** Cảm ứng khi đo: xác nhận điểm bắt đang hiển thị */
  const confirmTouchPoint = () => {
    const pending = touchHitRef.current;
    touchHitRef.current = null;
    setTouchConfirm(null);
    showSnapIndicator(null);
    if (pending) handleMeasureClick(pending.hit, pending.clientX, pending.clientY, false);
  };
  const cancelTouchPoint = () => {
    touchHitRef.current = null;
    setTouchConfirm(null);
    showSnapIndicator(null);
    hidePreview();
  };

  return {
    measureHint,
    touchConfirm,
    makeMarker,
    hintFor,
    updateLabels,
    addMeasurement,
    removeMeasurement,
    hidePreview,
    updatePreview,
    removePending,
    clearMeasurements,
    finishArea,
    handleMeasureClick,
    undoMeasure,
    setClashMarker,
    measureSelectionClearance,
    measureSelectionBox,
    raycastSnap,
    showSnapIndicator,
    showTouchCandidate,
    confirmTouchPoint,
    cancelTouchPoint,
  };
}

export type MeasureTool = ReturnType<typeof useMeasureTool>;
