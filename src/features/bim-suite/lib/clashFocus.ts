// features/bim/lib/clashFocus.ts
// Phóng tới một va chạm: chọn cả hai cấu kiện, đặt camera đóng khung cả hai, đánh dấu tâm va chạm;
// chế độ "ngữ cảnh" chỉ hiện hai cấu kiện và các cấu kiện trong bán kính 2 m.
// Chỉ dùng các phương thức sẵn có của BimViewerRef (truyền vào dạng cấu trúc, không phụ thuộc component).

import type { BimClashRow } from '@/features/bim-suite/types/bim.types';
import { cameraPoseForBox, type Box3Like, type CameraPoseLike } from './clashGrouping';

export type ClashFocusMode = 'frame' | 'context';

export interface ClashFocusRequest {
  clash: BimClashRow;
  mode: ClashFocusMode;
  /** Tâm vùng giao nhau (toạ độ thế giới) — vị trí đặt dấu */
  center: [number, number, number];
  /** Khung bao chung của hai cấu kiện (hoặc vùng quanh tâm nếu chưa đọc được khung bao) */
  box: Box3Like;
  /** Chế độ ngữ cảnh: cấu kiện cần hiện (hai cấu kiện + mọi cấu kiện cách ≤ 2 m), theo mô hình */
  contextGroups?: { modelId: string; ids: number[] }[];
  /** Vùng ngữ cảnh (khung bao chung nới 2 m) */
  contextBox?: Box3Like;
}

/** Phần BimViewerRef cần để phóng tới va chạm */
export interface ClashFocusViewer {
  selectMany: (items: { modelId: string; expressId: number }[], options?: { additive?: boolean }) => Promise<void>;
  getCameraPose: () => CameraPoseLike | null;
  setCameraPose: (pose: CameraPoseLike) => void;
  isolateMany: (groups: { modelId: string; ids: number[] }[]) => Promise<void>;
  flyToElement?: (modelId: string, expressId: number) => Promise<void>;
  /** Tùy chọn: dấu tại tâm va chạm (null để xóa) */
  setClashMarker?: (center: [number, number, number] | null, label?: string) => void;
}

/**
 * Tạo hàm xử lý `onFocusClash` cho BimClashPanel. Ví dụ trong ProjectBimTab:
 *   onFocusClash={createClashFocusHandler(() => viewerRef.current)}
 */
export function createClashFocusHandler(getViewer: () => ClashFocusViewer | null | undefined) {
  return async (req: ClashFocusRequest) => {
    const viewer = getViewer();
    if (!viewer) return;
    const { clash } = req;
    const items = [
      { modelId: clash.modelA, expressId: clash.idA },
      { modelId: clash.modelB, expressId: clash.idB },
    ].filter((i) => i.expressId >= 0);
    if (req.mode === 'context' && req.contextGroups?.length) await viewer.isolateMany(req.contextGroups);
    if (items.length) await viewer.selectMany(items);
    viewer.setCameraPose(
      cameraPoseForBox(req.mode === 'context' && req.contextBox ? req.contextBox : req.box, viewer.getCameraPose()),
    );
    viewer.setClashMarker?.(req.center, '!');
  };
}
