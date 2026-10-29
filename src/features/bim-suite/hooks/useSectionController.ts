// Trạng thái mặt cắt của tab Mô hình BIM: bảng Mặt cắt (mặt phẳng / hộp cắt theo mét), mặt cắt của góc nhìn đã áp,
// tay kéo trên mô hình, viền cắt, nắp cắt, danh sách tầng, canh theo mặt và cắt theo tầng. Đồng bộ xuống BimViewer qua viewerRef.
import { useEffect, useState, type RefObject } from 'react';
import type { BimClipPlaneState, BimModel } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../components/BimViewer';
import { resolveSectionLocation } from '../lib/sectionLocation';
import {
  computeSectionPlanes,
  defaultSectionState,
  normalizeBoxRange,
  planeFromFace,
  type BimSectionState,
} from '../lib/sectionState';
import { storeyKey } from '../lib/filterAggregation';

export function useSectionController({
  viewerRef,
  models,
  loadedIds,
}: {
  viewerRef: RefObject<BimViewerRef | null>;
  models: BimModel[];
  loadedIds: string[];
}) {
  const [sectionOpen, setSectionOpen] = useState(false);
  // Trạng thái mặt cắt theo mét; null = chưa đặt (mở bảng thì lấy mặc định theo hộp bao cảnh)
  const [sectionState, setSectionState] = useState<BimSectionState | null>(null);
  const [aligningFace, setAligningFace] = useState(false);
  const [sectionStoreys, setSectionStoreys] = useState<string[]>([]);
  /** Mặt cắt đến từ góc nhìn lưu/vướng mắc — tách khỏi mặt cắt của bảng Mặt cắt */
  const [viewClipPlanes, setViewClipPlanes] = useState<BimClipPlaneState[] | null>(null);
  const [sectionDrag, setSectionDrag] = useState(false);

  // Mặt cắt: bảng Mặt cắt đang mở thì dùng mặt cắt của bảng; khi đóng thì giữ mặt cắt của góc nhìn
  // đã áp (nếu có). Nạp thêm mô hình không được xoá mặt cắt của góc nhìn.
  useEffect(() => {
    if (sectionOpen) setViewClipPlanes(null);
  }, [sectionOpen]);
  // Mở bảng lần đầu: mặt cắt mặc định theo hộp bao cảnh hiện tại
  useEffect(() => {
    if (sectionOpen && !sectionState) setSectionState(defaultSectionState(viewerRef.current?.getSceneBox() ?? null));
  }, [sectionOpen, sectionState, loadedIds.length > 0]);
  useEffect(() => {
    if (!sectionOpen) {
      viewerRef.current?.setClipPlanes(viewClipPlanes ?? []);
      return;
    }
    // Theo mét: không phụ thuộc hộp bao cảnh nên nạp thêm mô hình không làm trôi mặt cắt
    viewerRef.current?.setClipPlanes(computeSectionPlanes(sectionState));
  }, [sectionOpen, sectionState, loadedIds, viewClipPlanes]);
  // Viền màu tại chỗ cắt (tắt được trong bảng mặt cắt)
  useEffect(() => {
    viewerRef.current?.setSectionOutline(
      sectionOpen ? sectionState?.outline !== false : (sectionState?.outline ?? true),
    );
  }, [sectionOpen, sectionState?.outline, loadedIds.length > 0]);
  // Nắp cắt tô kín mặt cắt (tắt được trong bảng mặt cắt)
  useEffect(() => {
    viewerRef.current?.setSectionCaps(sectionOpen ? sectionState?.caps !== false : (sectionState?.caps ?? true));
  }, [sectionOpen, sectionState?.caps, loadedIds.length > 0]);
  // Danh sách tầng (gộp mọi mô hình đang nạp) cho ô chọn tầng của bảng mặt cắt
  useEffect(() => {
    if (!sectionOpen || loadedIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const byKey = new Map<string, { name: string; elevation: number }>();
      for (const modelId of loadedIds) {
        const list = (await viewerRef.current?.getStoreys(modelId).catch(() => [])) ?? [];
        for (const s of list) {
          const key = storeyKey(s.name);
          const elevation = s.elevation ?? Number.POSITIVE_INFINITY;
          const prev = byKey.get(key);
          if (!prev || elevation < prev.elevation) byKey.set(key, { name: s.name, elevation });
        }
      }
      if (!cancelled)
        setSectionStoreys(
          [...byKey.values()]
            .sort((a, b) => a.elevation - b.elevation || a.name.localeCompare(b.name, 'vi', { numeric: true }))
            .map((s) => s.name),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionOpen, loadedIds]);

  // Tay kéo mặt cắt trực tiếp trên mô hình
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!sectionOpen || !sectionDrag || !sectionState || sectionState.mode !== 'plane') {
      viewer.setSectionHandle(null);
      return;
    }
    viewer.setSectionHandle({
      axis: sectionState.axis,
      normal: sectionState.normal ?? null,
      position: sectionState.position,
      onDrag: (position) => setSectionState((prev) => (prev ? { ...prev, position } : prev)),
    });
  }, [
    sectionOpen,
    sectionDrag,
    sectionState?.mode,
    sectionState?.axis,
    JSON.stringify(sectionState?.normal ?? null),
    loadedIds,
  ]);

  /** Canh mặt cắt theo một mặt bấm trên mô hình */
  const alignSectionToFace = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (aligningFace) {
      viewer.cancelPickFace();
      return;
    }
    setAligningFace(true);
    try {
      const face = await viewer.pickFace();
      const plane = face ? planeFromFace(face.point, face.normal) : null;
      if (plane)
        setSectionState((prev) => ({
          ...(prev ?? defaultSectionState(viewer.getSceneBox())),
          mode: 'plane',
          ...plane,
        }));
    } finally {
      setAligningFace(false);
    }
  };

  /** Cắt theo tầng: mặt cắt ngang ở cao độ sàn + độ cao, hoặc hộp cắt từ sàn tầng này tới sàn tầng trên */
  const sectionAtStorey = async (name: string, offset: number): Promise<string | null> => {
    const viewer = viewerRef.current;
    if (!viewer) return 'Trình xem chưa sẵn sàng.';
    const loaded = models.filter((m) => loadedIds.includes(m.id));
    const mode = sectionState?.mode ?? 'plane';
    if (mode === 'plane') {
      const result = await resolveSectionLocation({ storey: name, offset }, loaded, viewer);
      if ('error' in result) return result.error;
      setSectionState((prev) => ({
        ...(prev ?? defaultSectionState(viewer.getSceneBox())),
        mode: 'plane',
        axis: 'y',
        normal: null,
        position: result.elevation,
      }));
      return null;
    }
    const floor = await resolveSectionLocation({ storey: name, offset: 0 }, loaded, viewer);
    if ('error' in floor) return floor.error;
    const next = sectionStoreys[sectionStoreys.indexOf(name) + 1];
    const top = next ? await resolveSectionLocation({ storey: next, offset: 0 }, loaded, viewer) : null;
    const hi = top && !('error' in top) && top.elevation > floor.elevation ? top.elevation - 0.05 : null;
    setSectionState((prev) => {
      const base = prev ?? defaultSectionState(viewer.getSceneBox(), 'box');
      return { ...base, mode: 'box', box: { ...base.box, y: [floor.elevation - 0.05, hi] } };
    });
    return null;
  };

  // Hộp cắt: kéo trực tiếp 6 mặt trên mô hình
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!sectionOpen || !sectionDrag || !sectionState || sectionState.mode !== 'box') {
      viewer.setSectionBoxHandles(null);
      return;
    }
    viewer.setSectionBoxHandles({
      box: sectionState.box,
      onDrag: (axis, range) => {
        const scene = viewerRef.current?.getSceneBox();
        const i = { x: 0, y: 1, z: 2 }[axis];
        // Kéo chạm biên cảnh → không giới hạn phía đó (mô hình nạp sau vẫn hiện đủ)
        const next = scene ? normalizeBoxRange(range, scene.min[i], scene.max[i]) : range;
        setSectionState((prev) => (prev ? { ...prev, box: { ...prev.box, [axis]: next } } : prev));
      },
    });
  }, [sectionOpen, sectionDrag, sectionState?.mode, sectionState?.box, loadedIds]);

  return {
    sectionOpen,
    setSectionOpen,
    sectionState,
    setSectionState,
    aligningFace,
    sectionStoreys,
    viewClipPlanes,
    setViewClipPlanes,
    sectionDrag,
    setSectionDrag,
    alignSectionToFace,
    sectionAtStorey,
  };
}
