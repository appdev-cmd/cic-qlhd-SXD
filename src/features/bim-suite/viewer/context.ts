// Ngữ cảnh dùng chung của trình xem BIM: toàn bộ ref (cảnh ThatOpen, mô hình đã nạp, lựa chọn, hiển thị,
// mặt cắt, đo đạc...) và ref gọi lại mới nhất từ props. Các hook trong thư mục này nhận đối tượng này.
import { useRef } from 'react';
import type * as THREE from 'three';
import type * as OBC from '@thatopen/components';
import type * as FRAGS from '@thatopen/fragments';
import type * as OBCF from '@thatopen/components-front';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { ModelLoadQueue } from '../lib/modelLoadQueue';
import type { IotFloorGeometry } from '../lib/iotFloorView';
import type { IotSensorLayer } from './iotSensorLayer';
import type { FacilityAssetLayer } from './facilityAssetLayer';
import type {
  BimCameraPose,
  BimLoadProgress,
  BimMeasureMode,
  BimPickedFace,
  BimQuality,
  BimSelectedElement,
  Measurement,
  MeasureHit,
  SectionAxis,
  SectionBoxHandleConfig,
  VisibilityState,
} from './types';

export type BimWorld = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>;
export type ElementBox = { id: number; min: [number, number, number]; max: [number, number, number] };

/** Props của BimViewer mà ngữ cảnh giữ bản mới nhất trong ref (đọc được từ các hàm tạo một lần) */
export interface ViewerRefProps {
  models: BimModel[];
  measureMode: BimMeasureMode;
  boxSelectMode: boolean;
  autoQuality: boolean;
  loadFragBuffer?: (model: BimModel) => Promise<ArrayBuffer>;
  onLoadProgress?: (p: BimLoadProgress | null) => void;
  onAutoQuality?: (quality: BimQuality, fps: number) => void;
  onElementSelected?: (element: BimSelectedElement | null, extra?: { additive: boolean; count: number }) => void;
  onElementContextMenu?: (element: BimSelectedElement, position: { x: number; y: number }) => void;
  onModelsLoaded?: (modelIds: string[]) => void;
  onCameraChange?: (pose: BimCameraPose) => void;
  onSelectionCountChange?: (count: number) => void;
  onPinClick?: (pinId: string) => void;
}

export function useViewerRefs(props: ViewerRefProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  // Người dùng đã tự xoay/lia camera trong lúc nạp → không tự khớp khung nhìn lại khi nạp xong
  const userMovedRef = useRef(false);
  const onLoadProgressRef = useRef(props.onLoadProgress);
  onLoadProgressRef.current = props.onLoadProgress;
  const autoQualityRef = useRef(props.autoQuality);
  autoQualityRef.current = props.autoQuality;
  const onAutoQualityRef = useRef(props.onAutoQuality);
  onAutoQualityRef.current = props.onAutoQuality;
  // Đã tự hạ chất lượng một lần trong phiên → không lặp lại (người dùng có thể bật lại "cao" thủ công)
  const autoDowngradedRef = useRef(false);

  // Quét chọn nhiều đối tượng (Marquee Box Selection)
  const boxSelectModeRef = useRef(props.boxSelectMode);
  boxSelectModeRef.current = props.boxSelectMode;
  const boxesCacheRef = useRef<Map<string, ElementBox[]>>(new Map());

  // ThatOpen references
  const worldRef = useRef<BimWorld | null>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const pickerRef = useRef<OBC.FastModelPicker | null>(null);
  const markerRef = useRef<OBCF.Marker | null>(null);
  const iotLayerRef = useRef<IotSensorLayer | null>(null);
  const facilityLayerRef = useRef<FacilityAssetLayer | null>(null);
  const facilityHostRef = useRef<HTMLDivElement>(null);
  const iotFocusEpochRef = useRef(0);
  const iotFloorRef = useRef<Map<string, IotFloorGeometry> | null>(null);
  const iotHostRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<{ modelId: string; id: number } | null>(null);
  const selectionSetRef = useRef<Map<string, Set<number>>>(new Map());
  const nameCacheRef = useRef<Map<string, string>>(new Map());
  // Khối lập phương điều hướng cập nhật trực tiếp DOM — không dựng lại React theo từng khung hình
  const cubeRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<BimQuality>('cao');
  const movingRef = useRef(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const fragmentsRef = useRef<OBC.FragmentsManager | null>(null);
  const fragmentsReadyRef = useRef<Promise<void> | null>(null);
  const loadedRef = useRef<Map<string, FRAGS.FragmentsModel>>(new Map());
  const modelQueueRef = useRef<ModelLoadQueue<BimModel, FRAGS.FragmentsModel> | null>(null);
  const loadBufferRef = useRef(props.loadFragBuffer);
  loadBufferRef.current = props.loadFragBuffer;

  const selectionRef = useRef<{ modelId: string; id: number } | null>(null);
  const colorsRef = useRef<Map<string, Map<number, FRAGS.MaterialDefinition>>>(new Map());
  const colorizeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const colorizeEpochRef = useRef(0);
  const outlinerRef = useRef<OBCF.Outliner | null>(null);
  const visibilityRef = useRef<Map<string, VisibilityState>>(new Map());
  const colorHiddenRef = useRef<Map<string, Set<number>>>(new Map());
  const ghostRef = useRef(false);
  const ghostOpacityRef = useRef(0.15);
  const clipPlanesRef = useRef<THREE.Plane[]>([]);
  const pendingFitRef = useRef(false);
  const sectionHandleRef = useRef<{
    controls: TransformControls;
    anchor: THREE.Object3D;
    normal: THREE.Vector3;
    onDrag: (p: number) => void;
  } | null>(null);
  const settleTokenRef = useRef(0);
  // Viền màu tại chỗ cắt
  const outlineEnabledRef = useRef(false);
  const outlineRef = useRef<THREE.LineSegments | null>(null);
  const outlineEpochRef = useRef(0);
  const outlineTimerRef = useRef<number | undefined>(undefined);
  // Nắp cắt: tô kín mặt cắt từng cấu kiện (dựng cùng lượt với viền, chỉ khi mặt cắt/mô hình đổi)
  const capsEnabledRef = useRef(false);
  const capsRef = useRef<THREE.Group | null>(null);
  const capStatsRef = useRef<{
    triangles: number;
    items: number;
    candidates?: number;
    processed?: number;
    limited?: boolean;
  }>({ triangles: 0, items: 0 });
  /** Khoá của lần dựng viền/nắp gần nhất (mặt cắt + mô hình + tuỳ chọn) — trùng thì không dựng lại */
  const sectionOverlayKeyRef = useRef('');
  // Bấm chọn một mặt để canh mặt cắt
  const pickFaceRef = useRef<((face: BimPickedFace | null) => void) | null>(null);
  const modelsRef = useRef(props.models);
  modelsRef.current = props.models;
  // Chuyển vòng giữa các cấu kiện đang chọn bằng bàn phím
  const cycleRef = useRef(-1);
  // Ghim tâm vùng va chạm
  const clashMarkerRef = useRef<{ group: THREE.Group; el: HTMLDivElement; anchor: THREE.Vector3 } | null>(null);

  // Đo đạc
  const measureModeRef = useRef<BimMeasureMode>(props.measureMode);
  measureModeRef.current = props.measureMode;
  const measurementsRef = useRef<Measurement[]>([]);
  const pendingRef = useRef<{
    kind: Exclude<BimMeasureMode, null>;
    points: THREE.Vector3[];
    group: THREE.Group;
    normal?: THREE.Vector3;
  } | null>(null);
  const previewRef = useRef<{ line: THREE.Line; label: HTMLDivElement; anchor: THREE.Vector3 | null } | null>(null);
  // Cảm ứng: chạm để xem điểm bắt, bấm "Đặt điểm" để xác nhận
  const touchHitRef = useRef<{ hit: MeasureHit; clientX: number; clientY: number } | null>(null);
  const snapEnabledRef = useRef(true);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const boxHandlesRef = useRef<{
    group: THREE.Group;
    edges: THREE.Box3Helper;
    handles: THREE.Mesh[];
    config: SectionBoxHandleConfig;
  } | null>(null);
  const boxDragRef = useRef<{ axis: SectionAxis; side: 0 | 1; start: THREE.Vector3; handle: THREE.Mesh } | null>(null);
  const boxDragEndedAtRef = useRef(0);
  const snapMarkerRef = useRef<HTMLDivElement>(null);

  const onElementSelectedRef = useRef(props.onElementSelected);
  onElementSelectedRef.current = props.onElementSelected;
  const onContextMenuRef = useRef(props.onElementContextMenu);
  onContextMenuRef.current = props.onElementContextMenu;
  const onModelsLoadedRef = useRef(props.onModelsLoaded);
  onModelsLoadedRef.current = props.onModelsLoaded;
  const onCameraChangeRef = useRef(props.onCameraChange);
  onCameraChangeRef.current = props.onCameraChange;
  // Tư thế camera vừa nhận từ khung nhìn kia → không phát ngược lại (tránh vòng lặp đồng bộ)
  const appliedPoseRef = useRef('');
  const onSelectionCountChangeRef = useRef(props.onSelectionCountChange);
  onSelectionCountChangeRef.current = props.onSelectionCountChange;
  const onPinClickRef = useRef(props.onPinClick);
  onPinClickRef.current = props.onPinClick;

  return {
    containerRef,
    labelLayerRef,
    userMovedRef,
    onLoadProgressRef,
    autoQualityRef,
    onAutoQualityRef,
    autoDowngradedRef,
    boxSelectModeRef,
    boxesCacheRef,
    worldRef,
    componentsRef,
    pickerRef,
    markerRef,
    iotLayerRef,
    facilityLayerRef,
    facilityHostRef,
    iotFocusEpochRef,
    iotFloorRef,
    iotHostRef,
    hoverRef,
    selectionSetRef,
    nameCacheRef,
    cubeRef,
    qualityRef,
    movingRef,
    statsRef,
    fragmentsRef,
    fragmentsReadyRef,
    loadedRef,
    modelQueueRef,
    loadBufferRef,
    selectionRef,
    colorsRef,
    colorizeQueueRef,
    colorizeEpochRef,
    outlinerRef,
    visibilityRef,
    colorHiddenRef,
    ghostRef,
    ghostOpacityRef,
    clipPlanesRef,
    pendingFitRef,
    sectionHandleRef,
    settleTokenRef,
    outlineEnabledRef,
    outlineRef,
    outlineEpochRef,
    outlineTimerRef,
    capsEnabledRef,
    capsRef,
    capStatsRef,
    sectionOverlayKeyRef,
    pickFaceRef,
    modelsRef,
    cycleRef,
    clashMarkerRef,
    measureModeRef,
    measurementsRef,
    pendingRef,
    previewRef,
    touchHitRef,
    snapEnabledRef,
    groundRef,
    boxHandlesRef,
    boxDragRef,
    boxDragEndedAtRef,
    snapMarkerRef,
    onElementSelectedRef,
    onContextMenuRef,
    onModelsLoadedRef,
    onCameraChangeRef,
    appliedPoseRef,
    onSelectionCountChangeRef,
    onPinClickRef,
  };
}

export type ViewerContext = ReturnType<typeof useViewerRefs>;
