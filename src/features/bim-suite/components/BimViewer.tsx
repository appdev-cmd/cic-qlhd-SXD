import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimViewer.tsx
// Trình hiển thị 3D WebGL chuyên nghiệp (ThatOpen Components + Three.js + Fragments)
// - Ghép nhiều mô hình (liên bộ môn), chọn / tô sáng / bay tới cấu kiện
// - Ẩn, cô lập, chế độ xuyên thấu, lọc theo loại & tầng
// - Mặt cắt, hộp cắt, đo khoảng cách & cao độ
// - Tô màu theo nhóm (loại, nghiệm thu, so sánh phiên bản), góc nhìn lưu trữ
//
// Thành phần này chỉ ghép các phần trong features/bim/viewer/ và dựng lớp giao diện phủ:
//   context (ref dùng chung) · useViewerCore · geometry · useAppearance · useMeasureTool · useSectionGizmo
//   useMarqueeSelect · useMinimap · useViewerPointer · useViewerScene · useModelLoader · imperativeHandle (API BimViewerRef)

import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { Loader2, AlertCircle, Box, RefreshCw, AlertTriangle, X, Check } from 'lucide-react';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import { VIEW_CUBE_FACES, MEASURE_TITLES, quaternionToCss } from '../lib/viewerConstants';
import { cubeCellDirection, cubeDirectionLabel, type CubeFace } from '../lib/viewCube';
import type {
  BimMeasureMode,
  BimLoadProgress,
  BimCameraPose,
  BimQuality,
  BimSelectedElement,
  BimViewerRef,
} from '../viewer/types';
import { useViewerRefs } from '../viewer/context';
import { useViewerCore } from '../viewer/useViewerCore';
import { useGeometryQueries } from '../viewer/geometry';
import { useAppearance } from '../viewer/useAppearance';
import { useMeasureTool } from '../viewer/useMeasureTool';
import { useSectionGizmo } from '../viewer/useSectionGizmo';
import { useMarqueeSelect } from '../viewer/useMarqueeSelect';
import { useMinimap } from '../viewer/useMinimap';
import { useViewerPointer } from '../viewer/useViewerPointer';
import { useViewerScene } from '../viewer/useViewerScene';
import { useModelLoader } from '../viewer/useModelLoader';
import {
  type ViewerHandleDeps,
  createCameraApi,
  createViewpointApi,
  createVisibilityApi,
  createSelectionApi,
  createSectionApi,
  createMeasureApi,
  createLayersApi,
  createCaptureApi,
  createModelDataApi,
} from '../viewer/imperativeHandle';
import { createSunApi } from '../viewer/sunLayer';

CameraControls.install({ THREE });

/** Ô lưới 3×3 trên mỗi mặt khối lập phương: [cột, hàng] */
const CUBE_CELLS: [number, number][] = [0, 1, 2].flatMap((row) =>
  [0, 1, 2].map((col) => [col, row] as [number, number]),
);

export type {
  BimViewPreset,
  BimProjection,
  BimNavMode,
  BimQuality,
  BimPin,
  BimSpatialNode,
  BimMeasureMode,
  BimLoadProgress,
  BimCameraPose,
  SectionBoxHandleConfig,
  SectionHandleConfig,
  BimPickedFace,
  BimMeasureResult,
  BimSelectedElement,
  BimColorGroup,
  BimCategoryGroup,
  BimStoreyGroup,
  BimViewerRef,
} from '../viewer/types';

interface BimViewerProps {
  /** Mô hình hiển thị (mô hình chính + mô hình ghép) */
  models: BimModel[];
  /** Mô hình chính: dùng cho trạng thái xử lý/lỗi */
  activeModel?: BimModel | null;
  measureMode?: BimMeasureMode;
  darkBackground?: boolean;
  onRetry?: () => void;
  onElementSelected?: (element: BimSelectedElement | null, extra?: { additive: boolean; count: number }) => void;
  onPinClick?: (pinId: string) => void;
  onSelectionCountChange?: (count: number) => void;
  onModelsLoaded?: (modelIds: string[]) => void;
  onElementContextMenu?: (element: BimSelectedElement, position: { x: number; y: number }) => void;
  /** Tuỳ biến cách tải file .frag (mặc định tải từ kho bim-models) */
  loadFragBuffer?: (model: BimModel) => Promise<ArrayBuffer>;
  /** Hiện lớp chỉ số hiệu năng (FPS, tam giác, bộ nhớ) */
  showStats?: boolean;
  /** Bản đồ mặt bằng thu nhỏ ở góc dưới phải (tự bật khi đi bộ trong công trình) */
  showMinimap?: boolean;
  /** Chế độ quét chọn khung chữ nhật bằng chuột trái */
  boxSelectMode?: boolean;
  /** Camera thay đổi (dùng đồng bộ hai khung nhìn khi so sánh phiên bản) */
  onCameraChange?: (pose: BimCameraPose) => void;
  /** Tiến độ nạp tổ hợp mô hình (số mô hình xong / tổng, byte đã tải) — null khi không nạp */
  onLoadProgress?: (p: BimLoadProgress | null) => void;
  /** Tự hạ xuống chế độ "nhanh" khi FPS lúc xoay/lia thấp kéo dài (mặc định bật); gọi lại kèm FPS đo được */
  autoQuality?: boolean;
  onAutoQuality?: (quality: BimQuality, fps: number) => void;
  /** Vị trí của mô hình chính trong hàng đợi chuyển đổi (khi đang chờ) */
  queueInfo?: { vi_tri: number; tong_cho: number; dang_xu_ly: number } | null;
  /** Khoảng (px) mà thanh công cụ của trang chiếm ở đáy khung: lớp phủ góc dưới nằm trên khoảng này */
  overlayBottom?: number;
  className?: string;
}

export const BimViewer = forwardRef<BimViewerRef, BimViewerProps>(
  (
    {
      models,
      activeModel,
      measureMode = null,
      darkBackground,
      onRetry,
      onElementSelected,
      onModelsLoaded,
      onElementContextMenu,
      onPinClick,
      onSelectionCountChange,
      loadFragBuffer,
      showStats = false,
      queueInfo = null,
      onCameraChange,
      onLoadProgress,
      autoQuality = true,
      onAutoQuality,
      showMinimap = false,
      boxSelectMode = false,
      overlayBottom = 0,
      className = '',
    },
    ref,
  ) => {
    const ctx = useViewerRefs({
      models,
      measureMode,
      boxSelectMode,
      autoQuality,
      loadFragBuffer,
      onLoadProgress,
      onAutoQuality,
      onElementSelected,
      onElementContextMenu,
      onModelsLoaded,
      onCameraChange,
      onSelectionCountChange,
      onPinClick,
    });
    const {
      containerRef,
      labelLayerRef,
      iotHostRef,
      facilityHostRef,
      statsRef,
      cubeRef,
      snapMarkerRef,
      pickFaceRef,
      modelQueueRef,
      worldRef,
    } = ctx;
    // Tăng mỗi khi tập mô hình đã nạp thay đổi (dựng lại dữ liệu phụ như bản đồ thu nhỏ)
    const [loadedVersion, setLoadedVersion] = useState(0);

    const core = useViewerCore(ctx);
    const { settleUpdate, viewDirection } = core;
    const geometry = useGeometryQueries(ctx, core);
    const appearance = useAppearance(ctx, core);
    const measure = useMeasureTool(ctx, measureMode, core, geometry, appearance);
    const { measureHint, touchConfirm, confirmTouchPoint, cancelTouchPoint } = measure;
    const section = useSectionGizmo(ctx, core, geometry);
    const { pickingFace } = section;
    const { marqueeBox, marqueeCount, createMarqueeSession } = useMarqueeSelect(ctx, geometry, appearance);
    const {
      minimapRef,
      drawMinimap,
      handleMinimapPointerDown,
      handleMinimapPointerMove,
      handleMinimapPointerUp,
      minimapStoreys,
      gotoStorey,
    } = useMinimap(ctx, showMinimap, loadedVersion, core, geometry);
    const { hoverInfo, handleViewerKeyDown, attachPointerHandlers } = useViewerPointer(
      ctx,
      core,
      appearance,
      measure,
      section,
      { createMarqueeSession },
    );
    // Khởi tạo cảnh + gắn sự kiện (một lần), nền theo giao diện sáng / tối
    useViewerScene(ctx, darkBackground, { core, measure, section, drawMinimap, attachPointerHandlers });
    // Nạp / gỡ mô hình theo danh sách
    const { loadingCount, loadProgress, loadStatus, hasLoadedModel, failedLoads, setFailedLoads } = useModelLoader(
      ctx,
      models,
      setLoadedVersion,
      core,
      appearance,
      section,
    );

    // ------------------------------------------------------------
    // API điều khiển (BimViewerRef), chia nhóm trong viewer/imperativeHandle.ts
    // ------------------------------------------------------------
    const handleDeps: ViewerHandleDeps = { ctx, core, geometry, appearance, measure, section, setFailedLoads };
    useImperativeHandle(ref, () => ({
      ...createCameraApi(handleDeps),
      ...createViewpointApi(handleDeps),
      ...createVisibilityApi(handleDeps),
      ...createSelectionApi(handleDeps),
      ...createSectionApi(handleDeps),
      ...createMeasureApi(handleDeps),
      ...createLayersApi(handleDeps),
      ...createCaptureApi(handleDeps),
      ...createModelDataApi(handleDeps),
      ...createSunApi(handleDeps),
    }));

    const isModelProcessing = activeModel && (activeModel.status === 'uploaded' || activeModel.status === 'processing');
    const isModelError = activeModel && activeModel.status === 'error';

    /** Kéo khối lập phương điều hướng để xoay; bấm (không kéo) vào mặt để chọn hướng nhìn chuẩn */
    const cubeDragRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
    const handleCubePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      cubeDragRef.current = { x: e.clientX, y: e.clientY, dragged: false };
      let lastX = e.clientX;
      let lastY = e.clientY;
      const move = (ev: PointerEvent) => {
        const drag = cubeDragRef.current;
        const controls = worldRef.current?.camera.controls;
        if (!drag || !controls) return;
        if (!drag.dragged && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 3) return;
        drag.dragged = true;
        controls.rotate(-(ev.clientX - lastX) * 0.012, -(ev.clientY - lastY) * 0.012, false).catch(() => undefined);
        lastX = ev.clientX;
        lastY = ev.clientY;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (cubeDragRef.current?.dragged) settleUpdate();
        // Giữ cờ "đã kéo" tới sự kiện click ngay sau đó
        window.setTimeout(() => (cubeDragRef.current = null), 0);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    return (
      <div
        className={`relative w-full h-full min-h-[450px] bg-slate-100 dark:bg-slate-900 overflow-hidden ${className}`}
      >
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label="Khung xem mô hình BIM. Mũi tên để xoay, Shift + mũi tên hoặc A, D, Q, E để lia, W, S hoặc cộng, trừ để tiến lùi, Enter chọn cấu kiện ở giữa khung, ngoặc vuông để chuyển giữa các cấu kiện đang chọn."
          onKeyDown={handleViewerKeyDown}
          className={`w-full h-full absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${measureMode || pickingFace ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        <div ref={labelLayerRef} className="absolute inset-0 pointer-events-none z-10 overflow-hidden" />
        <div
          ref={iotHostRef}
          className="absolute inset-0 pointer-events-none z-[12] overflow-hidden"
          aria-label="Cảm biến IoT trên mô hình BIM"
        />
        <div
          ref={facilityHostRef}
          className="absolute inset-0 pointer-events-none z-[13] overflow-hidden"
          role="region"
          aria-label="Nhãn thiết bị bảo trì trên mô hình BIM"
        />

        {hoverInfo && !measureMode && (
          <div
            className="absolute z-20 px-2 py-1 rounded-lg bg-slate-900/90 text-white text-2xs shadow-lg pointer-events-none max-w-[280px] truncate dark:bg-slate-900"
            style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
          >
            {hoverInfo.text}
          </div>
        )}

        {showMinimap && (
          <div
            className="absolute right-3 z-20 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-600 shadow-lg"
            style={{ bottom: overlayBottom || 12 }}
          >
            <canvas
              ref={minimapRef}
              width={200}
              height={200}
              onPointerDown={handleMinimapPointerDown}
              onPointerMove={handleMinimapPointerMove}
              onPointerUp={handleMinimapPointerUp}
              className="block w-[200px] h-[200px] cursor-pointer touch-none"
              data-tooltip="Mặt bằng tại cao độ mắt — bấm để đi tới vị trí đó, kéo để quay hướng nhìn"
            />
            <span className="absolute top-1 left-1.5 text-3xs font-semibold text-slate-500 pointer-events-none">
              MẶT BẰNG
            </span>
            {minimapStoreys.length > 0 && (
              <BimSelect
                aria-label="Chọn tầng trên bản đồ thu nhỏ"
                className="absolute top-1 right-1 max-w-[110px] text-2xs rounded border border-slate-300 dark:border-slate-600 bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-1 py-0.5"
                value=""
                onChange={(e) => {
                  const storey = minimapStoreys[Number(e.target.value)];
                  if (storey) gotoStorey(storey.elevation);
                }}
              >
                <option value="">Đến tầng…</option>
                {minimapStoreys.map((s, i) => (
                  <option key={`${s.name}-${i}`} value={i}>
                    {s.name}
                  </option>
                ))}
              </BimSelect>
            )}
          </div>
        )}

        {section.sectionMessage && (
          <p
            role="status"
            className="absolute left-3 top-3 z-20 max-w-[65%] rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow dark:bg-amber-50"
          >
            {section.sectionMessage}
          </p>
        )}
        {showStats && (
          <div
            ref={statsRef}
            className="absolute left-3 z-20 px-2.5 py-1.5 rounded-lg bg-slate-900/85 text-emerald-300 font-mono text-2xs leading-4 whitespace-pre pointer-events-none shadow-lg dark:bg-slate-900"
            style={{ bottom: overlayBottom || 12 }}
          >
            Đang đo…
          </div>
        )}

        {/* Khối lập phương điều hướng */}
        <div
          className="absolute top-3 right-3 z-20 touch-none"
          style={{ perspective: '320px' }}
          onPointerDown={handleCubePointerDown}
          onClickCapture={(e) => {
            if (cubeDragRef.current?.dragged) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          data-tooltip="Bấm mặt, cạnh hoặc góc để xem theo hướng đó · kéo để xoay"
        >
          <div
            ref={cubeRef}
            className="relative w-[72px] h-[72px]"
            style={{
              transformStyle: 'preserve-3d',
              transform: `translateZ(-36px) ${quaternionToCss([0, 0, 0, 1])}`,
            }}
          >
            {VIEW_CUBE_FACES.map((face) => (
              // Mỗi mặt chia lưới 3×3: ô giữa = mặt, ô viền = cạnh, ô góc = góc (26 hướng nhìn)
              <div
                key={face.preset}
                className="absolute inset-0 grid grid-cols-[14px_1fr_14px] grid-rows-[14px_1fr_14px] bg-white/85 dark:bg-slate-700 border border-slate-300 dark:border-slate-500"
                style={{ transform: face.transform, backfaceVisibility: 'hidden' }}
              >
                {CUBE_CELLS.map(([col, row]) => {
                  const dir = cubeCellDirection(face.preset as CubeFace, col, row);
                  const center = col === 1 && row === 1;
                  const label = cubeDirectionLabel(dir);
                  return (
                    <button
                      key={`${col}-${row}`}
                      type="button"
                      data-tooltip={center ? face.label : `Nhìn từ ${label.toLowerCase()}`}
                      aria-label={center ? face.label : label}
                      data-cube-dir={dir.join(',')}
                      onClick={() => viewDirection(dir)}
                      className={`flex items-center justify-center min-w-0 min-h-0 hover:bg-primary-500 hover:text-white transition-colors ${
                        center ? 'text-2xs font-semibold text-slate-700 dark:text-slate-100' : ''
                      }`}
                    >
                      {center ? face.label : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Khung quét chọn nhiều đối tượng (Marquee Selection Box) */}
        {marqueeBox && marqueeBox.active && (
          <>
            <div
              className={`absolute pointer-events-none z-30 transition-none ${
                marqueeBox.isCrossing
                  ? 'border-2 border-dashed border-emerald-400 bg-emerald-500/15 backdrop-blur-[0.5px] dark:bg-emerald-500'
                  : 'border-2 border-solid border-sky-400 bg-sky-500/15 backdrop-blur-[0.5px] dark:bg-sky-500'
              }`}
              style={{
                left: Math.min(marqueeBox.startX, marqueeBox.currentX),
                top: Math.min(marqueeBox.startY, marqueeBox.currentY),
                width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
                height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
              }}
            >
              {/* Nhãn thông tin chế độ quét ở góc khung */}
              <div
                className={`absolute bottom-1 right-1 px-2 py-0.5 rounded text-2xs font-bold text-white shadow-md flex items-center gap-1.5 ${
                  marqueeBox.isCrossing ? 'bg-emerald-600/90 dark:bg-emerald-600' : 'bg-sky-600/90 dark:bg-sky-600'
                }`}
              >
                <span>{marqueeBox.isCrossing ? 'Quét chạm (Crossing)' : 'Quét trọn (Window)'}</span>
                {marqueeCount !== null && (
                  <span className="bg-black/30 px-1 py-0.2 rounded font-mono">{marqueeCount} cấu kiện</span>
                )}
              </div>
            </div>

            {/* Hướng dẫn thao tác nổi khi đang kéo quét */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs shadow-xl pointer-events-none flex items-center gap-2 border border-slate-700/60 backdrop-blur-md dark:bg-slate-900">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse dark:bg-emerald-400" />
              <span>Thả chuột để chọn</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-300">Giữ Ctrl/Shift để cộng dồn</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-300">Esc để hủy</span>
            </div>
          </>
        )}

        {measureHint && measureMode && !pickingFace && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-slate-900/80 text-white text-xs shadow-lg pointer-events-none max-w-[calc(100%-7rem)] text-center dark:bg-slate-900">
            {MEASURE_TITLES[measureMode]}: {measureHint}
            <span className="hidden sm:inline text-slate-300"> · Shift: khóa trục · Backspace: bỏ điểm cuối</span>
          </div>
        )}

        {pickingFace && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-700/90 text-white text-xs shadow-lg">
            <span>Bấm vào một mặt của cấu kiện để canh mặt cắt theo mặt đó</span>
            <button
              type="button"
              onClick={() => pickFaceRef.current?.(null)}
              className="px-1.5 rounded bg-white/20 hover:bg-white/30"
            >
              Hủy
            </button>
          </div>
        )}

        {touchConfirm && measureMode && (
          <div
            className="absolute z-30 flex gap-1 -translate-x-1/2"
            style={{ left: touchConfirm.x, top: touchConfirm.y + 18 }}
            role="group"
            aria-label="Xác nhận điểm đo"
          >
            <button
              type="button"
              onClick={confirmTouchPoint}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold shadow-lg"
            >
              <Check className="w-3.5 h-3.5" /> Đặt điểm
            </button>
            <button
              type="button"
              onClick={cancelTouchPoint}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white text-slate-700 text-xs shadow-lg border border-slate-200"
            >
              <X className="w-3.5 h-3.5" /> Bỏ
            </button>
          </div>
        )}

        {/* Điểm bắt khi đo */}
        <div
          ref={snapMarkerRef}
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 items-center pointer-events-none"
          style={{ display: 'none' }}
        >
          <i className="block w-3 h-3 border-2 border-amber-400 bg-amber-300/30 dark:bg-amber-300" />
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-900/85 text-amber-300 text-2xs font-semibold whitespace-nowrap dark:bg-slate-900" />
        </div>

        {loadingCount > 0 && !hasLoadedModel && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-[2px] text-white pointer-events-none dark:bg-slate-900">
            <Loader2 className="w-10 h-10 animate-spin text-primary-400 mb-3" />
            <p className="text-sm font-medium">{loadProgress}</p>
            {loadStatus && loadStatus.total > 1 && (
              <p className="text-xs text-slate-300 mt-1">
                Mô hình {Math.min(loadStatus.done + 1, loadStatus.total)}/{loadStatus.total}
                {loadStatus.bytesKnown > 0 && ` · ${(loadStatus.bytesLoaded / 1048576).toFixed(0)} MB`}
              </p>
            )}
          </div>
        )}

        {loadingCount > 0 && hasLoadedModel && loadStatus && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-30 w-[min(420px,calc(100%-2rem))] rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700 text-white shadow-xl px-3 py-2 pointer-events-none dark:bg-slate-900"
            style={{ bottom: overlayBottom || 48 }}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400 shrink-0" />
              <span className="font-semibold shrink-0">
                Đang ghép {loadStatus.done}/{loadStatus.total} mô hình
              </span>
              <span className="text-slate-300 truncate min-w-0">· {loadStatus.current}</span>
              <span className="text-slate-400 shrink-0 ml-auto">
                {(loadStatus.bytesLoaded / 1048576).toFixed(0)}
                {loadStatus.bytesKnown > loadStatus.bytesLoaded
                  ? `/${(loadStatus.bytesKnown / 1048576).toFixed(0)}`
                  : ''}{' '}
                MB
                {loadStatus.fromCache > 0 && ` · ${loadStatus.fromCache} từ bộ đệm`}
              </span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-slate-700 overflow-hidden dark:bg-slate-700">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${Math.max(4, (loadStatus.done / loadStatus.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {isModelProcessing && loadingCount === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md text-white p-6 text-center dark:bg-slate-900">
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary-600/30 to-indigo-500/20 border border-primary-400/40 flex items-center justify-center shadow-lg shadow-blue-500/10">
                <Box className="w-10 h-10 text-primary-400 animate-pulse" />
              </div>
              <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary-600 border-2 border-slate-900 flex items-center justify-center shadow">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
            </div>
            <h4 className="text-base md:text-lg font-bold text-white tracking-wide">
              Đang chuyển đổi & trích xuất dữ liệu mô hình BIM...
            </h4>
            <p className="text-xs md:text-sm text-slate-300 max-w-lg mt-2 leading-relaxed">
              Mô hình <span className="font-semibold text-primary-300">“{activeModel.file_name}”</span> đang được chuyển
              sang định dạng 3D Fragments (.frag) trực tiếp bằng WebAssembly và bóc tách cấu kiện, thuộc tính, khối
              lượng, vật liệu.
            </p>
            {activeModel.status === 'processing' && (
              <div className="mt-4 w-64 max-w-full">
                <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden dark:bg-slate-700">
                  <div
                    className="h-full bg-primary-500 transition-all duration-500"
                    style={{ width: `${Math.max(3, activeModel.tien_do ?? 0)}%` }}
                  />
                </div>
                <p className="text-2xs text-slate-400 mt-1">{activeModel.tien_do ?? 0}%</p>
              </div>
            )}
            <div className="mt-4 px-3.5 py-1.5 rounded-full bg-primary-950/80 border border-primary-500/40 text-xs text-primary-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping dark:bg-amber-400" />
              {activeModel.status === 'processing'
                ? 'Đang biên dịch 3D (WebAssembly)'
                : 'Đang khởi chạy chuyển đổi trên trình duyệt'}{' '}
              · tự động cập nhật khi hoàn tất
            </div>
          </div>
        )}

        {isModelError && loadingCount === 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/85 backdrop-blur-md text-white p-6 text-center dark:bg-slate-900">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-4 text-rose-400 dark:bg-rose-500">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h4 className="text-base md:text-lg font-bold text-rose-300">Chưa thể nạp mô hình BIM</h4>
            <p className="text-xs md:text-sm text-slate-300 max-w-md mt-2 leading-relaxed">
              {activeModel.error_message || 'Có lỗi xảy ra trong quá trình giải nén hoặc trích xuất hình học IFC.'}
            </p>
            {!activeModel.ifc_path && (
              <p className="mt-3 text-xs text-amber-300 max-w-md">
                Tệp IFC gốc không còn trên máy chủ nên không thể xử lý lại. Hãy xoá mô hình này trong danh sách mô hình
                rồi tải lại tệp IFC.
              </p>
            )}
            {onRetry && activeModel.ifc_path && (
              <button
                onClick={onRetry}
                className="mt-5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Thử chuyển đổi lại ngay
              </button>
            )}
          </div>
        )}

        {failedLoads.length > 0 && (
          <div className="absolute top-4 left-4 right-4 z-30 space-y-1.5" role="alert">
            {failedLoads.map((f) => (
              <div
                key={f.id}
                className="p-3 bg-rose-500/90 text-white rounded-xl shadow-lg backdrop-blur-md flex items-center gap-3 text-sm dark:bg-rose-500"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="flex-1 min-w-0">
                  Không mở được <span className="font-semibold">“{f.name}”</span>: {f.message}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFailedLoads((list) => list.filter((x) => x.id !== f.id));
                    modelQueueRef.current?.retry(f.id);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => setFailedLoads((list) => list.filter((x) => x.id !== f.id))}
                  className="text-white/80 hover:text-white text-xs shrink-0"
                >
                  Đóng
                </button>
              </div>
            ))}
          </div>
        )}

        {loadingCount === 0 && !activeModel && models.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none p-6 text-center">
            <Box className="w-12 h-12 mb-3 stroke-[1.5] text-slate-400/60" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Chưa có mô hình BIM để hiển thị</p>
            <p className="text-xs mt-1 text-slate-400">Tải lên tệp IFC (Revit, ArchiCAD, Tekla...) để bắt đầu</p>
          </div>
        )}
      </div>
    );
  },
);

BimViewer.displayName = 'BimViewer';
