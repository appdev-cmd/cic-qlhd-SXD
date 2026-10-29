// Kiểu dữ liệu công khai của trình xem BIM (BimViewer.tsx xuất lại để mã gọi không phải đổi đường dẫn)
import type * as THREE from 'three';
import type { BimClipPlaneState, BimMeasurementRecord, BimViewpoint } from '@/features/bim/types/bim.types';
import type { SnapKind } from '../lib/measureMath';
import type { BimIotSensorConfig } from './iotSensorLayer';
import type { FacilityAssetLayerConfig } from './facilityAssetLayer';

export type BimViewPreset = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export type BimProjection = 'Perspective' | 'Orthographic';
export type BimNavMode = 'Orbit' | 'FirstPerson' | 'Plan';
export type BimQuality = 'cao' | 'nhanh';

/** Ghim hiển thị trên mô hình (vướng mắc, hồ sơ...) */
export interface BimPin {
  id: string;
  guid?: string;
  modelId?: string;
  expressId?: number;
  color: string;
  label: string;
  title?: string;
}

export interface BimSpatialNode {
  key: string;
  name: string;
  category: string;
  localId: number | null;
  ids: number[];
  children: BimSpatialNode[];
}
export type BimMeasureMode = 'distance' | 'elevation' | 'area' | 'angle' | 'slope' | 'perpendicular' | null;

export type SectionAxis = 'x' | 'y' | 'z';

/** Tiến độ nạp một tổ hợp mô hình */
export interface BimLoadProgress {
  /** Số mô hình đã nạp xong trong đợt */
  done: number;
  /** Tổng số mô hình trong đợt */
  total: number;
  /** Byte đã tải (mạng + cache) */
  bytesLoaded: number;
  /** Byte tổng đã biết (những mô hình đã bắt đầu tải) */
  bytesKnown: number;
  /** Mô hình đang tải gần nhất */
  current: string;
  /** Số mô hình lấy từ bộ nhớ đệm */
  fromCache: number;
}

export interface BimCameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SectionBoxHandleConfig {
  /** Cạnh hộp theo mét; null = biên của cảnh */
  box: Record<SectionAxis, [number | null, number | null]>;
  /** Khoảng mới theo mét (đã giới hạn trong cảnh) */
  onDrag: (axis: SectionAxis, range: [number, number]) => void;
}

export interface SectionHandleConfig {
  axis: SectionAxis;
  /** Pháp tuyến khi canh theo mặt đã bấm (null = theo trục) */
  normal?: [number, number, number] | null;
  /** Vị trí mặt cắt n·x theo mét */
  position: number;
  onDrag: (position: number) => void;
}

/** Mặt vừa bấm (canh mặt cắt theo mặt) */
export interface BimPickedFace {
  modelId: string;
  expressId: number;
  point: [number, number, number];
  normal: [number, number, number];
}

/** Kết quả công cụ đo dựa trên lựa chọn (khoảng hở, hộp bao) */
export interface BimMeasureResult {
  ok: boolean;
  message: string;
}

export interface MeasureHit {
  point: THREE.Vector3;
  normal?: THREE.Vector3;
  kind: SnapKind;
}

export interface BimSelectedElement {
  modelId: string;
  expressId: number;
  guid?: string;
  name?: string;
  category?: string;
}

export interface BimColorGroup {
  modelId: string;
  color: string;
  ids: number[];
  opacity?: number;
  visible?: boolean;
}

export interface BimCategoryGroup {
  category: string;
  ids: number[];
}

export interface BimStoreyGroup {
  localId: number;
  name: string;
  ids: number[];
  /** Cao độ IFC đã chuẩn hóa trong hệ tọa độ mô hình đang ghép, nếu có. */
  elevation?: number | null;
  /** Sàn thuộc tầng, dùng làm mốc hình học thay cho khung bao dầm/cột nghiêng. */
  floorIds?: number[];
}

/** Lớp phủ phân tích nắng: một ô vuông nằm ngang tại mỗi điểm mẫu, màu theo giờ nắng hoặc trạng thái bóng. */
export interface BimSunOverlay {
  points: Float32Array;
  colors: Float32Array;
  count: number;
  cell: number;
  opacity?: number;
  /** Hướng về mặt trời (hệ trình xem) để vẽ tia chỉ hướng; null khi không vẽ. */
  sun?: [number, number, number] | null;
  /** Pháp tuyến từng điểm (mặt đứng): ô vuông xoay vuông góc pháp tuyến; không có thì nằm ngang. */
  normals?: Float32Array;
}

export interface BimViewerRef {
  fitToModel: () => void;
  resetView: () => void;
  setView: (preset: BimViewPreset) => void;
  setSelection: (modelId: string | null, expressId: number | null) => void;
  flyToElement: (modelId: string, expressId: number) => Promise<void>;
  flyToGuid: (guid: string) => Promise<BimSelectedElement | null>;
  hideElements: (modelId: string, ids: number[]) => Promise<void>;
  isolateElements: (modelId: string, ids: number[]) => Promise<void>;
  /** Cô lập cấu kiện trên nhiều mô hình cùng lúc */
  isolateMany: (groups: { modelId: string; ids: number[] }[]) => Promise<void>;
  /** Cô lập trực tiếp theo danh mục / lớp IFC trên toàn bộ các mô hình đang mở */
  isolateCategories: (categories: string[]) => Promise<{ found: number }>;
  /** Bật X-Ray trực tiếp theo danh mục / lớp IFC */
  xrayCategories: (categories: string[], color?: string) => Promise<{ found: number; groups: BimColorGroup[] }>;
  /** Tô màu trực tiếp theo danh mục / lớp IFC */
  highlightCategories: (categories: string[], color?: string) => Promise<{ found: number; groups: BimColorGroup[] }>;
  showAll: () => Promise<void>;
  setFilterHidden: (modelId: string, ids: number[]) => Promise<void>;
  setClassificationHidden: (modelId: string, ids: number[]) => Promise<void>;
  setGhostMode: (active: boolean, opacity?: number) => Promise<void>;
  colorize: (groups: BimColorGroup[] | null, options?: { accumulate?: boolean }) => Promise<void>;
  setClipPlanes: (planes: BimClipPlaneState[]) => void;
  getSceneBox: () => { min: [number, number, number]; max: [number, number, number] } | null;
  clearMeasurements: () => void;
  /** Bật/tắt bắt điểm (đỉnh, trung điểm, cạnh) khi đo */
  setSnapping: (enabled: boolean) => void;
  getViewpoint: () => BimViewpoint | null;
  setViewpoint: (vp: BimViewpoint) => Promise<void>;
  captureScreenshot: () => string;
  /** Canvas của khung 3D (quay video trình chiếu góc nhìn). */
  getCanvas: () => HTMLCanvasElement | null;
  getItemAttributes: (modelId: string, expressId: number) => Promise<Record<string, unknown> | null>;
  getCategories: (modelId: string) => Promise<BimCategoryGroup[]>;
  getStoreys: (modelId: string) => Promise<BimStoreyGroup[]>;
  getLocalIdsByGuids: (modelId: string, guids: string[]) => Promise<number[]>;
  /** Độ dịch để đưa mô hình về hệ toạ độ của mô hình gốc, tính từ ma trận điều phối lưu trong file .frag */
  getCoordinationOffset: (modelId: string, baseModelId: string) => Promise<[number, number, number] | null>;
  /** Ảnh nền mặt đất (bản đồ / ảnh flycam) đặt dưới mô hình; toạ độ theo mét trong hệ của trình xem (mặt bằng XZ) */
  setGroundImage: (
    config: {
      url: string;
      minX: number;
      minZ: number;
      maxX: number;
      maxZ: number;
      opacity?: number;
      elevation?: number;
    } | null,
  ) => Promise<void>;
  /** Như trên nhưng giữ đúng thứ tự (null nếu GUID không có trong mô hình) */
  mapGuidsToIds: (modelId: string, guids: string[]) => Promise<(number | null)[]>;
  setProjection: (projection: BimProjection) => Promise<void>;
  setNavMode: (mode: BimNavMode) => void;
  setQuality: (quality: BimQuality) => void;
  /** Chọn nhiều cấu kiện (thay thế hoặc cộng dồn additive) */
  selectMany: (items: { modelId: string; expressId: number }[], options?: { additive?: boolean }) => Promise<void>;
  /** Bật/tắt chế độ quét chọn khung chữ nhật (kể cả với chuột trái) */
  setBoxSelectMode: (enabled: boolean) => void;
  isBoxSelectMode: () => boolean;
  getSelection: () => { modelId: string; expressId: number }[];
  setPins: (pins: BimPin[]) => Promise<void>;
  setFacilityAssets: (config: FacilityAssetLayerConfig | null) => void;
  setIotSensors: (config: BimIotSensorConfig | null) => void;
  getIotOverlayHost: () => HTMLElement | null;
  focusIotSensors: (
    groups: { modelId: string; guids: string[] }[] | null,
    floorKey?: string,
  ) => Promise<{ found: number; total: number; applied: boolean; isolated?: boolean; glassCount?: number }>;
  resetIotFloorView: () => Promise<void>;
  getSpatialTree: (modelId: string) => Promise<BimSpatialNode[]>;
  /** Bật tay kéo mặt cắt trên mô hình; vị trí theo mét (n·x) */
  setSectionHandle: (config: SectionHandleConfig | null) => void;
  /** Vẽ viền màu tại chỗ cắt (giao lưới tam giác với mặt cắt) */
  setSectionOutline: (enabled: boolean) => void;
  /** Nắp cắt: tô kín mặt cắt từng cấu kiện (màu theo bộ môn, vân gạch chéo) */
  setSectionCaps: (enabled: boolean) => void;
  /** Số tam giác/cấu kiện của nắp cắt đang hiển thị; pending = đang chờ hoặc đang dựng */
  getSectionCapStats: () => {
    triangles: number;
    items: number;
    pending: boolean;
    candidates?: number;
    processed?: number;
    limited?: boolean;
  };
  /** Chờ người dùng bấm một mặt cấu kiện; null nếu hủy (Esc) */
  pickFace: () => Promise<BimPickedFace | null>;
  cancelPickFace: () => void;
  /** Phép đo đang hiển thị (lưu cùng góc nhìn) */
  getMeasurements: () => BimMeasurementRecord[];
  setMeasurements: (records: BimMeasurementRecord[]) => void;
  removeMeasurement: (id: string) => void;
  /** Bỏ điểm vừa đặt; không còn điểm đang đặt thì xoá phép đo cuối. Trả false nếu không còn gì để hoàn tác */
  undoMeasure: () => boolean;
  /** Khoảng cách gần nhất giữa hai cấu kiện đang chọn */
  measureSelectionClearance: () => Promise<BimMeasureResult>;
  /** Kích thước hộp bao của các cấu kiện đang chọn */
  measureSelectionBox: () => Promise<BimMeasureResult>;
  /** Nạp lại một mô hình bị lỗi */
  retryModel: (modelId: string) => void;
  /** Ghim đánh dấu một điểm thế giới (tâm vùng va chạm); null = gỡ */
  setClashMarker: (center: [number, number, number] | null) => void;
  /** Đưa focus bàn phím vào khung 3D */
  focus: () => void;
  getCameraPose: () => BimCameraPose | null;
  /** Đặt camera tức thì (không hiệu ứng) — đồng bộ khung nhìn so sánh */
  setCameraPose: (pose: BimCameraPose) => void;
  /** Hộp cắt kéo trực tiếp: 6 tay nắm ở tâm 6 mặt; trả khoảng mới theo mét */
  setSectionBoxHandles: (config: SectionBoxHandleConfig | null) => void;
  /** Khung bao của một nhóm cấu kiện (dùng để xem mặt bằng theo tầng) */
  getBoxOf: (
    modelId: string,
    ids: number[],
  ) => Promise<{ min: [number, number, number]; max: [number, number, number] } | null>;
  /** Fit an orthographic floor plan to its actual footprint, independent of site size. */
  viewPlan: (groups: { modelId: string; ids: number[] }[]) => Promise<void>;
  /** Khung bao riêng của từng cấu kiện (dò va chạm); chỉ trả cấu kiện có hình học */
  getBoxes: (
    modelId: string,
    ids?: number[],
  ) => Promise<{ id: number; min: [number, number, number]; max: [number, number, number] }[]>;
  /** Lưới tam giác (toạ độ thế giới, 9 số/tam giác) của từng cấu kiện — dò va chạm pha hẹp */
  getItemTriangles: (modelId: string, ids: number[]) => Promise<Map<number, Float32Array>>;
  /** Tam giác (toạ độ thế giới) của mọi cấu kiện đang hiện, gồm khối bối cảnh, bỏ không gian/lỗ mở/chú giải: vật cản tia nắng. */
  getSunObstacles: (opts?: {
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
    /** Mặc định true (khối bối cảnh che nắng). False khi tính diện tích chiếm đất của riêng công trình. */
    includeContext?: boolean;
    /** GlobalId cần bỏ theo mô hình (ví dụ cấu kiện ghi ngoài phạm vi trong sổ xác minh). */
    excludeGuids?: Record<string, string[]>;
  }) => Promise<{
    parts: Float32Array[];
    /** Cấu kiện của từng phần (cùng thứ tự với parts); context = khối bối cảnh. */
    meta: { modelId: string; localId: number; context: boolean }[];
    items: number;
    box: { min: [number, number, number]; max: [number, number, number] } | null;
  }>;
  /** Khối bối cảnh dựng từ OpenStreetMap (tam giác toạ độ trình xem); null để gỡ. Khối đang hiện che nắng như khối bối cảnh của mô hình. */
  setContextMasses: (tris: Float32Array | null, opts?: { visible?: boolean }) => void;
  /** Vẽ hoặc xóa (null) lớp phủ giờ nắng / bóng đổ. */
  setSunOverlay: (overlay: BimSunOverlay | null) => void;
  /** Tên và loại của một nhóm cấu kiện (đọc thẳng từ mô hình, không cần CSDL) */
  getItemsBrief: (
    modelId: string,
    ids: number[],
  ) => Promise<Record<number, { name?: string; category?: string; guid?: string }>>;
  /** Dịch mô hình ghép về đúng toạ độ (x, y, z tính theo mét) */
  setModelOffset: (modelId: string, offset: [number, number, number]) => void;
  /** Ảnh chụp kèm khung tên để in/báo cáo */
  captureWithTitleBlock: (info: { title: string; subtitle?: string; note?: string }) => string;
}

export interface VisibilityState {
  isolated: Set<number> | null;
  hidden: Set<number>;
  filterHidden: Set<number>;
  classificationHidden?: Set<number>;
  annotationHidden?: Set<number>;
  contextOnly?: Set<number>;
}

export interface Measurement {
  record: BimMeasurementRecord;
  group: THREE.Group;
  label: HTMLDivElement;
  anchor: THREE.Vector3;
}

export interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isCrossing: boolean;
  active: boolean;
}
