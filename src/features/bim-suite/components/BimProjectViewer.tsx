import { formatNumber } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Không gian mô hình của một dự án: danh sách mô hình và phiên bản, tải IFC, trình xem 3D với thanh công cụ, cây cấu
// kiện, bảng thuộc tính, so sánh hai phiên bản (B1); lọc theo loại/tầng/Uniclass, chọn nhanh và bộ chọn thông minh,
// mặt cắt, góc nhìn đã lưu, bản vẽ cạnh mô hình (B2); vướng mắc/RFI và BCF, dò va chạm, liên kết cấu kiện với tài
// liệu/nhiệm vụ, nghiệm thu, checklist hiện trường, nhãn QR và tô màu mô hình (B3). Dùng nguyên các thành phần chuyển từ
// cic-hud; khi các mô-đun còn lại (4D/5D…) đã chuyển, ProjectBimTab của cic-hud sẽ thay khung này.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileCheck2,
  FileDiff,
  Eye,
  EyeOff,
  FileText,
  GitCompare,
  Info,
  ListTree,
  Loader2,
  MessageSquareWarning,
  QrCode,
  RotateCcw,
  Leaf,
  Network,
  Shapes,
  Sparkles,
  Sun,
  Wrench,
  Sigma,
  Trash2,
  Upload,
  X,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Cpu,
} from 'lucide-react';
import type {
  BimClashRow,
  BimIssue,
  BimModel,
  BimSavedView,
  BimVersionDiffRow,
  BimViewpoint,
} from '../types/bim.types';
import {
  BimViewer,
  type BimMeasureMode,
  type BimNavMode,
  type BimProjection,
  type BimQuality,
  type BimSelectedElement,
  type BimViewerRef,
} from './BimViewer';
import { BimToolbar, type BimColorMode, type BimToolbarFeature } from './BimToolbar';
import { BimUploadModal } from './BimUploadModal';
import { SpatialTree } from './SpatialTree';
import { PropertyInspector } from './PropertyInspector';
import { BimVersionChangesList } from './BimVersionChangesList';
import { BimFilterPanel } from './BimFilterPanel';
import { BimSectionPanel } from './BimSectionPanel';
import { BimSavedViewsPanel } from './BimSavedViewsPanel';
import { BimSmartSetsPanel, type SmartSetColoring } from './BimSmartSetsPanel';
import { BimQuickSelect } from './BimQuickSelect';
import { BimHelpPanel } from './BimHelpPanel';
import { BimUniclassPanel } from './BimUniclassPanel';
import { BimDrawingPane } from './BimDrawingPane';
import { BimClashPanel } from './BimClashPanel';
import { BimIssuesPanel, type BimIssueDraft } from './BimIssuesPanel';
import { BimAcceptanceModal } from './BimAcceptanceModal';
import { BimQrLabelModal, type QrLabelItem } from './BimQrLabelModal';
import { BimFieldPanel } from './field/BimFieldPanel';
import { Bim4DPanel } from './Bim4DPanel';
import { BimQuantityTable } from './BimQuantityTable';
import { BimVariationPanel } from './variation/BimVariationPanel';
import { BimAnalyticsPanel } from './BimAnalyticsPanel';
import { BimBasemapPanel } from './BimBasemapPanel';
import { BimSiteTab } from './sun/BimSiteTab';
import { Bim6dTab } from './sustain/Bim6dTab';
import { BimTracePanel } from './trace/BimTracePanel';
import { BimAiPanel } from './BimAiPanel';
import { BimOperationsPanel } from './BimOperationsPanel';
import type { AiViewerHost } from '../hooks/useAiViewerController';
import type { FutureDisplay, ScheduleState } from '../lib/schedule4d';
import { createClashFocusHandler } from '../lib/clashFocus';
import { getIfcLabel } from '../lib/ifcLabels';
import { useBimColoring } from '../hooks/useBimColoring';
import { useSearchParams } from '../adapters/router';
import { BimService } from '../services/BimService';
import { useSectionController } from '../hooks/useSectionController';
import {
  boxAroundBounds,
  defaultSectionState,
  normalizeSectionState,
  positionThroughBounds,
  sectionStateFromPlanes,
  type SceneBounds,
} from '../lib/sectionState';
import { viewpointHasIsolation } from '../lib/viewpointState';
import {
  isModelId,
  pickReviewVersions,
  readModelParam,
  readReviewLink,
  STATE_PARAM,
  MODEL_PARAM,
} from '../lib/reviewLink';
import { BimAppraisalCapture } from './BimAppraisalCapture';
import type { AggregatedStorey } from '../lib/filterAggregation';
import { disciplineLabels } from '../lib/ifcLabels';
import {
  useBimElementDetail,
  useBimIssues,
  useBimModels,
  useBimVersionDiff,
  useDeleteBimModel,
  useRetryBimModel,
} from '../hooks/useBim';
import { useAuth, useBimAccess } from '../adapters/context';
import { useConfirm } from '../adapters/ui';
import { useToast } from '../adapters/toast';
import { formatDateTime } from '../adapters/utils';
import { convertBimModelInBrowser, isModelConvertingInBrowser } from '../lib/browserIfcConverter';

// Các bảng chưa chuyển sang BuildSIA (nền bản đồ B6, mô phỏng 4D và tô màu theo tiến độ hiện trường B5): ẩn nút.
const pendingFeatures: ReadonlySet<BimToolbarFeature> = new Set();

type AcceptanceTarget = {
  guid: string;
  title?: string;
  modelId?: string;
  extraGuids?: string[];
  elements?: { modelId: string; guid: string }[];
};

const cdeZoneLabel: Record<string, string> = {
  wip: 'WIP',
  shared: 'SHARED',
  cho_phat_hanh: 'ĐANG THẨM TRA',
  published: 'PUBLISHED',
  archived: 'ARCHIVE',
};

const statusLabel: Record<BimModel['status'], string> = {
  uploaded: 'Chờ chuyển đổi',
  processing: 'Đang chuyển đổi',
  ready: 'Sẵn sàng',
  error: 'Lỗi chuyển đổi',
};

/** Nhóm các phiên bản của cùng một mô hình (model_goc_id trỏ về bản đầu), bản mới nhất đứng đầu. */
export function groupModelVersions(models: BimModel[]): BimModel[][] {
  const chains = new Map<string, BimModel[]>();
  for (const model of models) {
    const root = model.model_goc_id ?? model.id;
    chains.set(root, [...(chains.get(root) ?? []), model]);
  }
  return [...chains.values()]
    .map((chain) => chain.sort((a, b) => (b.phien_ban ?? 1) - (a.phien_ban ?? 1)))
    .sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
}

export default function BimProjectViewer({
  projectId,
  projectName,
  onOpenSchedule,
  onOpenSustain,
}: {
  projectId: string;
  projectName?: string;
  /** Opens the project schedule (Tiến độ tab of the workspace). */
  onOpenSchedule?: () => void;
  /** Opens the project sustainability workspace (Bền vững tab). */
  onOpenSustain?: () => void;
}) {
  const access = useBimAccess();
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const viewerRef = useRef<BimViewerRef>(null);
  const compareRef = useRef<BimViewerRef>(null);
  const modelsQuery = useBimModels(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  // ?bimModel=<id>[,…]: appraisal evidence opens the pinned (possibly older) version instead of the latest one.
  const [reviewIds, setReviewIds] = useState<string[]>(() => readModelParam(searchParams));
  const chains = useMemo(() => groupModelVersions(modelsQuery.data ?? []), [modelsQuery.data]);
  const latest = useMemo(() => pickReviewVersions(chains, reviewIds), [chains, reviewIds]);
  const reviewModels = useMemo(() => latest.filter((m) => reviewIds.includes(m.id)), [latest, reviewIds]);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeModel = latest.find((m) => m.id === activeId) ?? latest[0] ?? null;
  const displayModels = useMemo(
    () => latest.filter((m) => m.status === 'ready' && !hiddenIds.has(m.id)),
    [latest, hiddenIds],
  );

  const [selected, setSelected] = useState<BimSelectedElement | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const [fallbackAttributes, setFallbackAttributes] = useState<Record<string, unknown> | null>(null);
  const element = useBimElementDetail(selected?.modelId, selected?.expressId);

  const [measureMode, setMeasureMode] = useState<BimMeasureMode>(null);
  const [snapping, setSnapping] = useState(true);
  const [isIsolated, setIsIsolated] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [projection, setProjection] = useState<BimProjection>('Perspective');
  const [navMode, setNavMode] = useState<BimNavMode>('Orbit');
  const [quality, setQuality] = useState<BimQuality>('cao');
  const [showStats, setShowStats] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [boxSelect, setBoxSelect] = useState(false);
  const [toolbarReserve, setToolbarReserve] = useState(0);
  const [colorMode, setColorMode] = useState<BimColorMode>('none');
  const [clashOpen, setClashOpen] = useState(false);
  const [clashRows, setClashRows] = useState<BimClashRow[] | null>(null);
  const [rightTab, setRightTab] = useState<
    'props' | 'issues' | 'field' | 'analytics' | 'qty' | 'co' | 'site' | 'sustain' | 'trace' | 'ops' | 'ai'
  >('props');
  const [basemapOpen, setBasemapOpen] = useState(false);
  // Issues feed the analytics dashboard only while that tab is open.
  const issuesQuery = useBimIssues(rightTab === 'analytics' ? projectId : '');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<{ groups: Record<ScheduleState, string[]>; future: FutureDisplay } | null>(
    null,
  );
  // Stable: the 4D panel re-applies whenever this callback changes.
  const applySchedule = useCallback(
    (groups: Record<ScheduleState, string[]> | null, _date: Date, future: FutureDisplay) =>
      setSchedule(groups ? { groups, future } : null),
    [],
  );
  const [issueDraft, setIssueDraft] = useState<BimIssueDraft | null>(null);
  const [acceptance, setAcceptance] = useState<AcceptanceTarget | null>(null);
  const [qrItems, setQrItems] = useState<QrLabelItem[] | null>(null);
  const pendingIssueRef = useRef<BimIssue | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [sideTab, setSideTab] = useState<'tree' | 'models' | 'sets'>('tree');
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return 280;
    try {
      const saved = Number(localStorage.getItem('bim-left-panel-width'));
      if (Number.isFinite(saved) && saved >= 180 && saved <= 560) return saved;
    } catch {
      /* ignore */
    }
    return 280;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    try {
      const saved = Number(localStorage.getItem('bim-right-panel-width'));
      if (Number.isFinite(saved) && saved >= 260 && saved <= 760) return saved;
    } catch {
      /* ignore */
    }
    return 400;
  });
  const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(null);

  const startResize = useCallback(
    (side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;
      setDraggingSide(side);
      let latestWidth = startWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === 'left') {
          const raw = startWidth + delta;
          if (raw < 120) {
            setLeftCollapsed(true);
            return;
          }
          setLeftCollapsed(false);
          latestWidth = Math.min(560, Math.max(180, Math.round(raw)));
          setLeftWidth(latestWidth);
        } else {
          const raw = startWidth - delta;
          if (raw < 160) {
            setRightCollapsed(true);
            return;
          }
          setRightCollapsed(false);
          latestWidth = Math.min(760, Math.max(260, Math.round(raw)));
          setRightWidth(latestWidth);
        }
      };

      const onUp = () => {
        setDraggingSide(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        try {
          localStorage.setItem(side === 'left' ? 'bim-left-panel-width' : 'bim-right-panel-width', String(latestWidth));
        } catch {
          /* ignore */
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [leftWidth, rightWidth],
  );
  const [browserProgress, setBrowserProgress] = useState<Record<string, { percent: number; message: string }>>({});
  const [setColoring, setSetColoring] = useState<SmartSetColoring | null>(null);
  const [viewMarkup, setViewMarkup] = useState<{ name: string; image: string } | null>(null);
  const {
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
  } = useSectionController({ viewerRef, models: displayModels, loadedIds });
  // Tô màu: kết quả va chạm, bộ chọn / Uniclass, rồi chế độ trên thanh công cụ (loại, nghiệm thu, liên kết, phiên bản).
  const legend = useBimColoring({
    projectId,
    loadedIds,
    colorMode,
    activeModel: activeModel?.status === 'ready' ? activeModel : null,
    clashRows,
    setColoring,
    scheduleGroups: schedule?.groups ?? null,
    scheduleFutureDisplay: schedule?.future ?? 'hide',
    viewerRef,
  });
  const colorizeSet = (coloring: SmartSetColoring | null) => {
    setClashRows(null);
    setColorMode('none');
    setSetColoring(coloring);
  };
  const clearColoring = () => {
    setSetColoring(null);
    setClashRows(null);
    setColorMode('none');
  };
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Chế độ thẩm tra: chỉ hiện các phiên bản đã chốt (người xem có thể hiện thêm), báo khi phiên bản không còn.
  const reviewSetup = useRef(false);
  useEffect(() => {
    if (reviewSetup.current || !reviewIds.length || !modelsQuery.data) return;
    reviewSetup.current = true;
    const found = reviewIds.filter((id) => modelsQuery.data!.some((m) => m.id === id));
    if (found.length < reviewIds.length)
      addToast({
        type: 'warning',
        title: 'Phiên bản đang thẩm tra',
        message: found.length
          ? 'Một số phiên bản mô hình trong liên kết không còn hoặc bạn không có quyền xem.'
          : 'Không tìm thấy phiên bản mô hình trong liên kết (đã xóa hoặc không có quyền). Đang hiển thị phiên bản mới nhất.',
      });
    if (!found.length) {
      setReviewIds([]);
      return;
    }
    setHiddenIds(new Set(latest.filter((m) => !found.includes(m.id)).map((m) => m.id)));
    setActiveId(found[0]);
    // Once, after the model list first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsQuery.data]);
  const leaveReview = () => {
    setReviewIds([]);
    setHiddenIds(new Set());
    const next = new URLSearchParams(searchParams);
    next.delete(MODEL_PARAM);
    setSearchParams(next, { replace: true });
  };

  // So sánh phiên bản: bản trước của mô hình đang chọn hiển thị ở khung trái, đồng bộ camera.
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const activeChain = chains.find((chain) => chain.some((m) => m.id === activeModel?.id)) ?? [];
  const compareBase = activeChain.find((m) => m.id === compareBaseId && m.status === 'ready') ?? null;
  const diff = useBimVersionDiff(compareBase?.id, compareBase ? activeModel?.id : null);

  const retry = useRetryBimModel(projectId);
  const remove = useDeleteBimModel(projectId);

  const triggerBrowserConversion = useCallback(
    async (model: BimModel) => {
      if (isModelConvertingInBrowser(model.id)) return;
      setBrowserProgress((prev) => ({
        ...prev,
        [model.id]: { percent: 5, message: 'Đang khởi chạy chuyển đổi 3D trên trình duyệt...' },
      }));
      try {
        const res = await convertBimModelInBrowser(model, {
          onProgress: (percent, message) => {
            setBrowserProgress((prev) => ({
              ...prev,
              [model.id]: { percent, message },
            }));
          },
        });
        if (!res.skipped) {
          await modelsQuery.refetch();
        }
      } catch (err) {
        addToast({
          type: 'error',
          title: `Chuyển đổi ${model.file_name} thất bại`,
          message: err instanceof Error ? err.message : 'Không thể chuyển đổi tệp IFC trên trình duyệt.',
        });
        await modelsQuery.refetch();
      } finally {
        setBrowserProgress((prev) => {
          const next = { ...prev };
          delete next[model.id];
          return next;
        });
      }
    },
    [addToast, modelsQuery],
  );

  // Tự động chuyển đổi các mô hình đang ở trạng thái 'uploaded' trực tiếp trên trình duyệt (WebAssembly, không cần Docker)
  useEffect(() => {
    if (!access.canWrite || uploadOpen) return;
    const waiting = latest.find(
      (m) => m.status === 'uploaded' && m.uploaded_by !== 'Chuyển từ qa-si-xd' && !isModelConvertingInBrowser(m.id),
    );
    if (!waiting) return;
    void triggerBrowserConversion(waiting);
  }, [access.canWrite, latest, triggerBrowserConversion, uploadOpen]);

  const selectElement = useCallback(async (next: BimSelectedElement | null) => {
    setSelected(next);
    setFallbackAttributes(null);
    if (next) setFallbackAttributes((await viewerRef.current?.getItemAttributes(next.modelId, next.expressId)) ?? null);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

  const run = (action: () => Promise<void> | void, failure: string) => async () => {
    try {
      await action();
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : failure });
    }
  };

  const filterModels = useMemo(
    () => displayModels.filter((m) => loadedIds.includes(m.id)).map((m) => ({ id: m.id, name: m.file_name })),
    [displayModels, loadedIds],
  );
  const selectionByModel = () => {
    const list = viewerRef.current?.getSelection() ?? [];
    const items = list.length ? list : selected ? [{ modelId: selected.modelId, expressId: selected.expressId }] : [];
    const map = new Map<string, number[]>();
    for (const { modelId, expressId } of items) map.set(modelId, [...(map.get(modelId) ?? []), expressId]);
    return map;
  };
  /** Khung bao (mét) của các cấu kiện đang chọn trên mọi mô hình. */
  const selectionBounds = async (): Promise<SceneBounds | null> => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const [modelId, ids] of selectionByModel()) {
      const box = await viewer.getBoxOf(modelId, ids);
      if (!box) continue;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], box.min[i]);
        max[i] = Math.max(max[i], box.max[i]);
      }
    }
    return Number.isFinite(min[0]) ? { min, max } : null;
  };
  /** Cắt tại cấu kiện đang chọn: mặt cắt qua tâm, hoặc hộp cắt bao quanh có lề 5%. */
  const cutAtSelection = async () => {
    const bounds = await selectionBounds();
    if (!bounds) {
      addToast({ type: 'info', message: 'Chọn một hoặc nhiều cấu kiện trên mô hình trước.' });
      return;
    }
    setSectionState((prev) => {
      const base = prev ?? defaultSectionState(viewerRef.current?.getSceneBox() ?? null);
      return base.mode === 'plane'
        ? { ...base, position: positionThroughBounds(base, bounds) }
        : { ...base, box: boxAroundBounds(bounds) };
    });
  };
  /** Mặt bằng một tầng: chiếu trực giao từ trên và hộp cắt theo cao độ của tầng. */
  const showStoreyPlan = async (storey: AggregatedStorey) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [modelId, ids] of Object.entries(storey.byModel)) {
      if (!ids.length) continue;
      const box = await viewer.getBoxOf(modelId, ids);
      if (!box) continue;
      lo = Math.min(lo, box.min[1]);
      hi = Math.max(hi, box.max[1]);
    }
    if (!Number.isFinite(lo)) return;
    const pad = (hi - lo) * 0.05;
    const base = defaultSectionState(viewer.getSceneBox(), 'box');
    setSectionState({ ...base, box: { ...base.box, y: [lo - pad, hi + pad] } });
    setSectionOpen(true);
    setFilterOpen(false);
    setProjection('Orthographic');
    await viewer.setProjection('Orthographic');
    viewer.setView('top');
    addToast({
      type: 'info',
      title: 'Mặt bằng ' + storey.name,
      message: 'Đã chiếu trực giao và cắt theo cao độ tầng.',
    });
  };
  /** Góc nhìn hiện tại kèm trạng thái mặt cắt (để mở lại và chỉnh tiếp). */
  const captureViewpoint = (): BimViewpoint | null => {
    const vp = viewerRef.current?.getViewpoint();
    if (!vp) return null;
    const sectionActive = sectionOpen || !!viewClipPlanes?.length;
    return { ...vp, section: sectionActive && sectionState ? sectionState : null };
  };
  /** Áp góc nhìn đã lưu: camera, mặt cắt, hiển thị theo mô hình, lựa chọn, xuyên thấu, ghi chú. */
  const applySavedView = async (view: BimSavedView) => {
    setViewMarkup(view.state.markup ? { name: view.name, image: view.state.markup } : null);
    await applyViewpoint(view.state);
  };
  const applyViewpoint = async (vp: BimViewpoint) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setSectionOpen(false);
    setViewClipPlanes(vp.sectionPlanes?.length ? vp.sectionPlanes : null);
    const scene = viewer.getSceneBox();
    setSectionState(
      vp.section ? normalizeSectionState(vp.section, scene) : sectionStateFromPlanes(vp.sectionPlanes, scene),
    );
    await viewer.setViewpoint(vp);
    if (vp.ghost && vp.ghost.active !== isGhostMode) {
      setIsGhostMode(vp.ghost.active);
      await viewer.setGhostMode(vp.ghost.active, vp.ghost.opacity);
    }
    setIsIsolated(viewpointHasIsolation(vp));
  };
  const isolate = (groups: { modelId: string; ids: number[] }[]) => {
    void viewerRef.current?.isolateMany(groups);
    setIsIsolated(true);
  };
  const select = (items: { modelId: string; expressId: number }[]) => void viewerRef.current?.selectMany(items);
  // Page-level actions for the model assistant, so its section and visibility changes go through the page state.
  const aiHost: AiViewerHost = {
    setSection: (state) => {
      if (!state) return setSectionOpen(false);
      setSectionState(state);
      setSectionOpen(true);
    },
    applySavedView,
    showAll: async () => {
      await viewerRef.current?.showAll();
      setIsIsolated(false);
      clearColoring();
    },
    setModelsVisible: (ids, visible) =>
      setHiddenIds((current) => {
        const next = new Set(current);
        for (const id of ids) {
          if (visible) next.delete(id);
          else next.add(id);
        }
        return next;
      }),
    showOnlyModels: (ids) => setHiddenIds(new Set(displayModels.filter((m) => !ids.includes(m.id)).map((m) => m.id))),
    onIsolationChange: setIsIsolated,
    onSelect: (element) => void selectElement(element),
  };

  const pickChange = async (row: BimVersionDiffRow) => {
    if (!activeModel) return;
    if (row.express_id_moi !== null) await viewerRef.current?.flyToElement(activeModel.id, row.express_id_moi);
    else if (compareBase && row.express_id_cu !== null)
      await compareRef.current?.flyToElement(compareBase.id, row.express_id_cu);
  };

  // ── Vướng mắc (B3) ──
  const buildIssueDraft = (withScreenshot: boolean): BimIssueDraft => ({
    modelId: selected?.modelId,
    screenshot: withScreenshot ? viewerRef.current?.captureScreenshot() || null : null,
    viewpoint: captureViewpoint(),
    guid: selected?.guid || element.data?.global_id || null,
    expressId: selected?.expressId ?? null,
    elementName: element.data?.ten_cau_kien || selected?.name || null,
  });
  const captureIssue = () => {
    if (!access.canWrite) {
      addToast({ type: 'warning', message: 'Bạn chỉ có quyền xem vướng mắc của dự án.' });
      return;
    }
    setIssueDraft(buildIssueDraft(true));
    setRightTab('issues');
  };
  const applyIssueView = async (issue: BimIssue) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (issue.viewpoint?.camera) await applyViewpoint(issue.viewpoint);
    if (!issue.target_element_guid) return;
    if (!issue.viewpoint?.camera) {
      const found = await viewer.flyToGuid(issue.target_element_guid);
      if (found) void selectElement(found);
      return;
    }
    for (const modelId of loadedIds) {
      const [id] = await viewer.getLocalIdsByGuids(modelId, [issue.target_element_guid]);
      if (id !== undefined) {
        viewer.setSelection(modelId, id);
        void selectElement({ modelId, expressId: id, guid: issue.target_element_guid });
        return;
      }
    }
  };
  /** Mở vị trí vướng mắc; mô hình của vướng mắc đang ẩn thì hiện lại rồi áp khi đã tải. */
  const showIssue = async (issue: BimIssue) => {
    if (issue.model_id && !loadedIds.includes(issue.model_id) && latest.some((m) => m.id === issue.model_id)) {
      pendingIssueRef.current = issue;
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(issue.model_id!);
        return next;
      });
      return;
    }
    await applyIssueView(issue);
  };
  useEffect(() => {
    const issue = pendingIssueRef.current;
    if (issue?.model_id && loadedIds.includes(issue.model_id)) {
      pendingIssueRef.current = null;
      void applyIssueView(issue);
    }
    // applyIssueView reads the latest viewer state; only a model load should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedIds]);

  // ── Va chạm (B3) ──
  const focusClash = useMemo(() => createClashFocusHandler(() => viewerRef.current), []);
  const showClash = async (clash: BimClashRow) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    await viewer.selectMany([
      { modelId: clash.modelA, expressId: clash.idA },
      { modelId: clash.modelB, expressId: clash.idB },
    ]);
    await viewer.flyToElement(clash.modelA, clash.idA);
    void selectElement({
      modelId: clash.modelA,
      expressId: clash.idA,
      guid: clash.guidA,
      name: clash.nameA,
      category: clash.categoryA,
    });
  };
  const createClashIssue = async (clash: BimClashRow) => {
    await showClash(clash);
    // Chờ khung hình sau khi phóng tới để ảnh chụp có cặp cấu kiện.
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIssueDraft({
      modelId: clash.modelA,
      screenshot: viewerRef.current?.captureScreenshot() || null,
      viewpoint: captureViewpoint(),
      guid: clash.guidA || null,
      expressId: clash.idA,
      elementName: clash.nameA,
      title: `Va chạm: ${clash.nameA} ↔ ${clash.nameB}`,
      issueType: 'va_cham',
      description: `Phát hiện khi dò va chạm trên mô hình.\n- Cấu kiện A: ${clash.nameA} (${getIfcLabel(clash.categoryA)})\n- Cấu kiện B: ${clash.nameB} (${getIfcLabel(clash.categoryB)})\n- Độ cắm sâu: ${(clash.depth * 1000).toFixed(0)} mm · thể tích giao khung bao: ${clash.overlap.toFixed(3)} m³`,
    });
    setRightTab('issues');
  };

  // ── Nghiệm thu, nhãn QR (B3) ──
  /** GUID của các cấu kiện đang chọn (tối đa `limit`), kèm tên và loại. */
  const selectedBriefs = async (limit: number) => {
    const viewer = viewerRef.current;
    const out: { modelId: string; guid: string; name?: string | null; category?: string | null }[] = [];
    if (!viewer) return out;
    for (const [modelId, ids] of selectionByModel()) {
      const slice = ids.slice(0, Math.max(0, limit - out.length));
      if (!slice.length) break;
      const brief = await viewer.getItemsBrief(modelId, slice);
      for (const id of slice) {
        const b = brief[id];
        if (b?.guid) out.push({ modelId, guid: b.guid, name: b.name, category: b.category });
      }
    }
    if (!out.length && selected?.guid)
      out.push({ modelId: selected.modelId, guid: selected.guid, name: selected.name, category: selected.category });
    return out;
  };
  const openGroupAcceptance = run(async () => {
    const items = await selectedBriefs(500);
    if (!items.length) {
      addToast({ type: 'info', message: 'Chọn cấu kiện (có GUID) trên mô hình trước khi lập biên bản.' });
      return;
    }
    setAcceptance({
      guid: items[0].guid,
      modelId: items[0].modelId,
      title: items.length > 1 ? undefined : (items[0].name ?? undefined),
      extraGuids: items.slice(1).map((i) => i.guid),
      elements: items.map(({ modelId, guid }) => ({ modelId, guid })),
    });
  }, 'Không đọc được cấu kiện đang chọn.');
  const openQrLabels = run(async () => {
    const items = await selectedBriefs(200);
    if (!items.length) {
      addToast({ type: 'info', message: 'Chọn cấu kiện (có GUID) trên mô hình trước khi tạo nhãn QR.' });
      return;
    }
    setQrItems(items.map(({ guid, name, category }) => ({ guid, name, category })));
  }, 'Không đọc được cấu kiện đang chọn.');

  // Liên kết sâu: ?bimGuid=<GlobalId> (nhãn QR, dẫn chứng thẩm tra), ?bimIssue=<mã vướng mắc>, ?bimView=<góc nhìn đã
  // lưu> và ?bimState=<góc nhìn đóng băng của dẫn chứng>. Với ?bimModel= chờ đúng phiên bản đó tải xong rồi tìm GUID
  // trong phiên bản đó.
  const deepGuid = searchParams.get('bimGuid');
  const deepIssue = searchParams.get('bimIssue');
  const deepView = searchParams.get('bimView');
  const deepState = searchParams.get(STATE_PARAM);
  const reviewLoaded = reviewModels.length > 0 && reviewModels.every((m) => loadedIds.includes(m.id));
  const hasLoaded = reviewIds.length ? reviewLoaded : loadedIds.length > 0;
  useEffect(() => {
    if (!hasLoaded || (!deepGuid && !deepIssue && !deepView && !deepState)) return;
    const link = readReviewLink(searchParams);
    const next = new URLSearchParams(searchParams);
    for (const key of ['bimGuid', 'bimIssue', 'bimView', STATE_PARAM]) next.delete(key);
    setSearchParams(next, { replace: true });
    void (async () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (link.state) {
        await applyViewpoint(link.state);
        if (link.partial)
          addToast({
            type: 'info',
            title: 'Góc nhìn thẩm tra',
            message: 'Đã áp camera và mặt cắt; trạng thái ẩn/cô lập quá lớn để mở qua liên kết.',
          });
      } else if (link.viewId) {
        const views = await BimService.getSavedViews(projectId).catch(() => null);
        const view = views?.find((v) => v.id === link.viewId);
        if (view) await applySavedView(view);
        else
          addToast({
            type: 'warning',
            message: 'Góc nhìn đã lưu không còn hoặc bạn không có quyền xem. Đang mở mô hình ở góc nhìn mặc định.',
          });
      }
      if (deepGuid) {
        let found: BimSelectedElement | null = null;
        for (const modelId of reviewModels.map((m) => m.id)) {
          const [id] = await viewer.getLocalIdsByGuids(modelId, [deepGuid]);
          if (id === undefined) continue;
          if (!link.state) await viewer.flyToElement(modelId, id);
          viewer.setSelection(modelId, id);
          found = { modelId, expressId: id, guid: deepGuid };
          break;
        }
        if (!found && !reviewModels.length) found = (await viewer.flyToGuid(deepGuid)) ?? null;
        if (found) void selectElement(found);
        else
          addToast({
            type: 'warning',
            message: reviewModels.length
              ? `Không tìm thấy cấu kiện ${deepGuid} trong phiên bản đang thẩm tra.`
              : `Không tìm thấy cấu kiện ${deepGuid} trong các mô hình đang mở.`,
          });
      }
      if (deepIssue) {
        const page = await BimService.getIssuesPage(projectId, { limit: 500 }).catch(() => null);
        const issue = page?.rows.find((i) => i.id === deepIssue);
        if (issue) {
          setRightTab('issues');
          await showIssue(issue);
        }
      }
    })();
    // Chạy một lần khi mô hình (hoặc phiên bản đang thẩm tra) đã tải và URL có tham số.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoaded, deepGuid, deepIssue, deepView, deepState]);

  const removeModel = async (model: BimModel) => {
    const ok = await confirm({
      title: 'Xóa mô hình',
      message: `Xóa "${model.file_name}" (phiên bản ${model.phien_ban ?? 1})? Quản trị có thể khôi phục trong thời gian lưu giữ.`,
      confirmText: 'Xóa',
    });
    if (ok) remove.mutate(model.id);
  };

  const wideMode = leftCollapsed && rightCollapsed;
  const activeLeftTab = !displayModels.length ? 'models' : sideTab;
  const pendingOrErrorCount = latest.filter((m) => m.status !== 'ready').length;
  const allReadyHidden =
    latest.filter((m) => m.status === 'ready').length > 0 &&
    latest.filter((m) => m.status === 'ready').every((m) => hiddenIds.has(m.id));
  const gridColsClass =
    leftCollapsed && rightCollapsed
      ? 'xl:grid-cols-[minmax(0,1fr)]'
      : leftCollapsed
        ? 'xl:grid-cols-[minmax(0,1fr)_10px_var(--bim-right-w)]'
        : rightCollapsed
          ? 'xl:grid-cols-[var(--bim-left-w)_10px_minmax(0,1fr)]'
          : 'xl:grid-cols-[var(--bim-left-w)_10px_minmax(0,1fr)_10px_var(--bim-right-w)]';

  return (
    <div
      className={`grid gap-2 xl:gap-0 ${gridColsClass} ${draggingSide ? 'select-none cursor-col-resize' : ''}`}
      style={
        {
          '--bim-left-w': `${leftWidth}px`,
          '--bim-right-w': `${rightWidth}px`,
        } as React.CSSProperties
      }
    >
      <aside
        className={
          leftCollapsed
            ? 'hidden'
            : 'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm xl:h-[calc(100vh-100px)]'
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border bg-bg-subtle/40 px-2 py-1.5">
          <div
            role="tablist"
            aria-label="Công cụ cấu kiện"
            className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg bg-bg-subtle p-0.5"
          >
            {(
              [
                ['tree', 'Cấu kiện', ListTree, null],
                ['models', 'Mô hình', Boxes, latest.length],
                ['sets', 'Bộ chọn', Shapes, null],
              ] as const
            ).map(([key, label, Icon, badge]) => {
              const selectedTab = activeLeftTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selectedTab}
                  disabled={key !== 'models' && !displayModels.length}
                  onClick={() => setSideTab(key)}
                  className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-2xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    selectedTab
                      ? 'bg-bg-surface text-primary-600 shadow-xs dark:text-primary-300'
                      : 'text-txt-muted hover:text-txt-primary'
                  }`}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="truncate">{label}</span>
                  {badge !== null ? (
                    <span
                      className={`rounded-full px-1 text-3xs font-bold tabular-nums ${
                        pendingOrErrorCount > 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-bg-subtle text-txt-secondary'
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {access.canWrite ? (
              <button
                type="button"
                className="doc-button doc-primary cursor-pointer !px-2 !py-1 !text-2xs"
                data-tooltip="Tải tệp mô hình IFC hoặc IFCZIP"
                onClick={() => setUploadOpen(true)}
              >
                <Upload size={12} />
                Tải IFC
              </button>
            ) : null}
            <button
              type="button"
              className="doc-icon cursor-pointer !p-1"
              data-tooltip="Thu gọn bảng bên trái (kéo cạnh phải để thay đổi độ rộng)"
              aria-label="Thu gọn cột trái"
              onClick={() => setLeftCollapsed(true)}
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
        </div>

        {activeLeftTab !== 'models' && pendingOrErrorCount > 0 ? (
          <button
            type="button"
            onClick={() => setSideTab('models')}
            className="flex shrink-0 cursor-pointer items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-2.5 py-1 text-left text-2xs text-amber-900 hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <span className="truncate font-medium">Có {pendingOrErrorCount} mô hình đang xử lý hoặc cần kiểm tra</span>
            <span className="shrink-0 font-semibold underline">Xem →</span>
          </button>
        ) : null}

        {activeLeftTab === 'models' ? (
          <section aria-labelledby="bim-model-list" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-2.5 py-1.5 text-2xs text-txt-muted">
              <h2 id="bim-model-list" className="font-semibold text-txt-secondary">
                Danh sách mô hình ({latest.length})
              </h2>
              {latest.filter((m) => m.status === 'ready').length > 1 ? (
                <button
                  type="button"
                  className="cursor-pointer font-medium text-primary-600 hover:underline dark:text-primary-400"
                  onClick={() => {
                    if (allReadyHidden) {
                      setHiddenIds(new Set());
                    } else {
                      setHiddenIds(new Set(latest.filter((m) => m.status === 'ready').map((m) => m.id)));
                    }
                  }}
                >
                  {allReadyHidden ? 'Hiện tất cả' : 'Ẩn tất cả'}
                </button>
              ) : null}
            </div>
            {modelsQuery.isLoading ? (
              <p role="status" className="p-3 text-xs text-txt-muted">
                Đang tải danh sách mô hình…
              </p>
            ) : modelsQuery.error ? (
              <p role="alert" className="p-3 text-xs text-rose-700">
                {modelsQuery.error instanceof Error ? modelsQuery.error.message : 'Không tải được danh sách mô hình.'}
              </p>
            ) : !latest.length ? (
              <p className="p-3 text-xs text-txt-muted">
                Dự án chưa có mô hình. {access.canWrite ? 'Bấm "Tải IFC" ở góc trên để bắt đầu.' : ''}
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                {chains.map((chain) => {
                  const model = chain.find((m) => reviewIds.includes(m.id)) ?? chain[0];
                  const reviewing = model.id !== chain[0].id || reviewIds.includes(model.id);
                  const hidden = hiddenIds.has(model.id);
                  const active = model.id === activeModel?.id;
                  const hasOlderVersion =
                    chain.some((older) => (older.phien_ban ?? 1) < (model.phien_ban ?? 1)) && model.status === 'ready';
                  const showActions =
                    ((model.status === 'uploaded' || model.status === 'processing') &&
                      access.canWrite &&
                      !browserProgress[model.id]) ||
                    (model.status === 'error' && access.canWrite) ||
                    hasOlderVersion;

                  return (
                    <li
                      key={model.id}
                      data-tooltip={`${model.file_name} · Tải lên: ${formatDateTime(model.created_at)}`}
                      className={`rounded-xl border px-2.5 py-1.5 text-2xs transition-colors ${
                        active
                          ? 'border-primary-300 bg-primary-50/80 dark:bg-primary-950'
                          : 'border-border hover:bg-bg-subtle/50'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 cursor-pointer text-left"
                          onClick={() => setActiveId(model.id)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <strong className="block truncate text-xs font-semibold text-txt-primary">
                            {model.file_name}
                          </strong>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {model.status === 'ready' ? (
                            <button
                              type="button"
                              className="doc-icon cursor-pointer !p-1"
                              aria-label={hidden ? `Hiện ${model.file_name}` : `Ẩn ${model.file_name}`}
                              aria-pressed={!hidden}
                              onClick={() =>
                                setHiddenIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(model.id)) next.delete(model.id);
                                  else next.add(model.id);
                                  return next;
                                })
                              }
                            >
                              {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          ) : null}
                          {(access.canManage || access.isOrgAdmin) && !reviewing ? (
                            <button
                              type="button"
                              className="doc-icon cursor-pointer !p-1 text-txt-muted hover:text-rose-600"
                              aria-label={`Xóa ${model.file_name}`}
                              onClick={() => void removeModel(model)}
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-txt-muted">
                        <span
                          className={
                            model.status === 'error'
                              ? 'font-semibold text-rose-700'
                              : model.status === 'ready'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-700'
                          }
                        >
                          {model.status === 'processing' || model.status === 'uploaded' ? (
                            <Loader2 size={10} className="mr-0.5 inline animate-spin" />
                          ) : model.status === 'error' ? (
                            <AlertTriangle size={10} className="mr-0.5 inline" />
                          ) : null}
                          {browserProgress[model.id]
                            ? `${browserProgress[model.id].percent}%`
                            : `${statusLabel[model.status]}${model.status === 'processing' && model.tien_do ? ` ${model.tien_do}%` : ''}`}
                        </span>
                        {model.status === 'ready' ? (
                          <span>· {formatNumber(model.element_count ?? 0, 2)} CK</span>
                        ) : null}
                        <span>
                          · {disciplineLabels[model.discipline] ?? model.discipline} v{model.phien_ban ?? 1}
                          {chain.length > 1 ? `/${chain.length}` : ''}
                          {reviewing ? ' (thẩm tra)' : ''}
                        </span>
                        <span
                          className="rounded bg-bg-subtle px-1 font-mono text-3xs font-semibold"
                          data-tooltip="Trạng thái CDE (ISO 19650) trong Hồ sơ tài liệu"
                        >
                          {cdeZoneLabel[model.trang_thai_cde ?? 'wip'] ?? model.trang_thai_cde}
                        </span>
                      </p>
                      {browserProgress[model.id] ? (
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg-subtle">
                          <div
                            className="h-full bg-primary-600 transition-all duration-200"
                            style={{ width: `${Math.min(100, Math.max(5, browserProgress[model.id].percent))}%` }}
                          />
                        </div>
                      ) : null}
                      {model.status === 'error' && model.error_message ? (
                        <p className="mt-0.5 break-words text-2xs text-rose-700">{model.error_message}</p>
                      ) : null}
                      {showActions ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(model.status === 'uploaded' || model.status === 'processing') &&
                          access.canWrite &&
                          !browserProgress[model.id] ? (
                            <button
                              type="button"
                              className="doc-button cursor-pointer !px-2 !py-0.5 !text-2xs"
                              onClick={() => void triggerBrowserConversion(model)}
                            >
                              <Cpu size={11} />
                              Chuyển đổi ngay
                            </button>
                          ) : null}
                          {model.status === 'error' && access.canWrite ? (
                            <button
                              type="button"
                              className="doc-button cursor-pointer !px-2 !py-0.5 !text-2xs"
                              onClick={() => retry.mutate(model.id)}
                            >
                              <RotateCcw size={11} />
                              Chuyển đổi lại
                            </button>
                          ) : null}
                          {hasOlderVersion ? (
                            <BimSelect
                              aria-label={`So sánh ${model.file_name} với phiên bản trước`}
                              className="doc-input !py-0.5 !text-2xs"
                              value={active ? (compareBaseId ?? '') : ''}
                              onChange={(e) => {
                                setActiveId(model.id);
                                setCompareBaseId(e.target.value || null);
                              }}
                            >
                              <option value="">So sánh với…</option>
                              {chain
                                .filter((older) => (older.phien_ban ?? 1) < (model.phien_ban ?? 1))
                                .map((older) => (
                                  <option key={older.id} value={older.id} disabled={older.status !== 'ready'}>
                                    Phiên bản {older.phien_ban ?? 1}
                                  </option>
                                ))}
                            </BimSelect>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : activeLeftTab === 'sets' ? (
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2">
            <BimQuickSelect
              projectId={projectId}
              models={displayModels}
              canEdit={access.canWrite}
              onSelect={select}
              onIsolate={isolate}
            />
            <BimSmartSetsPanel
              projectId={projectId}
              models={displayModels}
              canEdit={access.canWrite}
              currentUserName={currentUser?.name}
              onSelect={select}
              onIsolate={isolate}
              onColorize={setSetColoring}
            />
          </div>
        ) : (
          <SpatialTree
            className="min-h-0 flex-1"
            models={displayModels}
            selectedModelId={selected?.modelId}
            selectedExpressId={selected?.expressId}
            onSelectElement={(el, modelId) => {
              void viewerRef.current?.flyToElement(modelId, el.express_id);
              void selectElement({ modelId, expressId: el.express_id, guid: el.global_id ?? undefined });
            }}
            loadSpatialTree={(modelId) => viewerRef.current?.getSpatialTree(modelId) ?? Promise.resolve([])}
            onHiddenChange={(ids, modelId) => void viewerRef.current?.hideElements(modelId, ids)}
            onSelectExpressId={(expressId, modelId) => {
              void viewerRef.current?.flyToElement(modelId, expressId);
              void selectElement({ modelId, expressId });
            }}
          />
        )}
      </aside>

      {!leftCollapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để thay đổi độ rộng bảng bên trái"
          data-tooltip="Kéo trái/phải để thay đổi độ rộng · Nhấp đúp để đặt lại mặc định"
          onPointerDown={(e) => startResize('left', e)}
          onDoubleClick={() => {
            setLeftWidth(280);
            try {
              localStorage.setItem('bim-left-panel-width', '280');
            } catch {
              /* ignore */
            }
          }}
          className="group relative hidden cursor-col-resize items-center justify-center xl:flex"
        >
          <div
            className={`h-full w-[2px] rounded-full transition-colors ${
              draggingSide === 'left' ? 'bg-primary-500' : 'bg-transparent group-hover:bg-primary-400/60'
            }`}
          />
          <div
            className={`absolute h-12 w-1.5 rounded-full transition-all ${
              draggingSide === 'left'
                ? 'h-16 bg-primary-600 shadow-xs'
                : 'bg-border group-hover:h-16 group-hover:bg-primary-500'
            }`}
          />
        </div>
      ) : null}

      <section
        ref={stageRef}
        aria-label="Khung nhìn mô hình"
        className="relative flex h-[calc(100vh-100px)] min-h-[580px] flex-col overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm"
      >
        {reviewModels.length ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-50"
          >
            <FileCheck2 size={14} />
            <strong>Phiên bản đang thẩm tra:</strong>
            <span className="min-w-0 flex-1 break-words">
              {reviewModels
                .map((m) => {
                  const newest = chains.find((chain) => chain.some((c) => c.id === m.id))?.[0];
                  return `${m.file_name} v${m.phien_ban ?? 1}${newest && newest.id !== m.id ? ` (mới nhất v${newest.phien_ban ?? 1})` : ''}`;
                })
                .join(' · ')}{' '}
              — chỉ xem, đúng phiên bản đã chốt trong bộ hồ sơ.
            </span>
            {isModelId(searchParams.get('appraisal')) ? (
              <BimAppraisalCapture
                engagementId={searchParams.get('appraisal')!}
                modelId={reviewModels[0]?.id ?? null}
                viewer={() => viewerRef.current}
                globalIds={async () =>
                  (await selectedBriefs(200)).filter((b) => b.modelId === reviewModels[0]?.id).map((b) => b.guid)
                }
              />
            ) : null}
            <button type="button" className="doc-button py-1" onClick={leaveReview}>
              Về phiên bản mới nhất
            </button>
          </div>
        ) : null}
        <div className="relative flex min-h-0 flex-1">
          {compareBase ? (
            <div className="relative w-1/2 border-r border-border">
              <BimViewer
                ref={compareRef}
                models={[compareBase]}
                activeModel={compareBase}
                onCameraChange={(pose) => viewerRef.current?.setCameraPose(pose)}
                className="h-full"
              />
              <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-amber-600 px-2 py-0.5 text-2xs font-semibold text-white dark:bg-amber-600">
                Trước · v{compareBase.phien_ban ?? 1}
              </span>
            </div>
          ) : null}
          <div className="relative min-w-0 flex-1">
            <BimViewer
              ref={viewerRef}
              models={displayModels}
              activeModel={activeModel}
              measureMode={measureMode}
              boxSelectMode={boxSelect}
              overlayBottom={toolbarReserve}
              showStats={showStats}
              showMinimap={showMinimap || navMode === 'FirstPerson'}
              onRetry={activeModel ? () => retry.mutate(activeModel.id) : undefined}
              onElementSelected={(el) => void selectElement(el)}
              onSelectionCountChange={setSelectionCount}
              onModelsLoaded={setLoadedIds}
              onCameraChange={compareBase ? (pose) => compareRef.current?.setCameraPose(pose) : undefined}
              onAutoQuality={(q, fps) => {
                setQuality(q);
                addToast({
                  type: 'info',
                  title: 'Đã chuyển sang chế độ ưu tiên tốc độ',
                  message: `Máy chỉ đạt ${fps} FPS khi xoay mô hình nên đã tắt hiệu ứng hậu kỳ.`,
                });
              }}
              className="h-full"
            />
            {compareBase ? (
              <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-primary-600 px-2 py-0.5 text-2xs font-semibold text-white">
                Sau · v{activeModel?.phien_ban ?? 2}
              </span>
            ) : null}
            {sectionOpen && sectionState ? (
              <BimSectionPanel
                state={sectionState}
                sceneBox={viewerRef.current?.getSceneBox() ?? null}
                onChange={setSectionState}
                onClose={() => {
                  setSectionOpen(false);
                  setSectionDrag(false);
                  if (aligningFace) viewerRef.current?.cancelPickFace();
                }}
                dragOnModel={sectionDrag}
                onToggleDragOnModel={() => setSectionDrag((v) => !v)}
                onCutAtSelection={() => void cutAtSelection()}
                selectionCount={Math.max(selectionCount, selected ? 1 : 0)}
                onAlignToFace={alignSectionToFace}
                aligning={aligningFace}
                storeys={sectionStoreys}
                onPickStorey={sectionAtStorey}
              />
            ) : null}
            {filterOpen && !sectionOpen ? (
              <BimFilterPanel
                models={filterModels}
                classificationPanel={
                  <BimUniclassPanel
                    models={displayModels}
                    onSelect={select}
                    onIsolate={isolate}
                    onColorize={(groups) =>
                      setSetColoring(
                        groups
                          ? {
                              title: 'Uniclass',
                              groups,
                              legend: [...new Set(groups.map((g) => g.label))].map((label) => ({
                                color: groups.find((g) => g.label === label)!.color,
                                label,
                                count: groups.filter((g) => g.label === label).reduce((s, g) => s + g.ids.length, 0),
                              })),
                            }
                          : null,
                      )
                    }
                  />
                }
                loadCategories={(modelId) => viewerRef.current?.getCategories(modelId) ?? Promise.resolve([])}
                loadStoreys={(modelId) => viewerRef.current?.getStoreys(modelId) ?? Promise.resolve([])}
                onHiddenChange={(byModel) => {
                  for (const [modelId, ids] of Object.entries(byModel))
                    void viewerRef.current?.setFilterHidden(modelId, ids);
                }}
                onPlanView={(storey) => void showStoreyPlan(storey)}
                onClose={() => {
                  loadedIds.forEach((modelId) => void viewerRef.current?.setFilterHidden(modelId, []));
                  setFilterOpen(false);
                }}
              />
            ) : null}
            {viewsOpen ? (
              <BimSavedViewsPanel
                projectId={projectId}
                modelId={activeModel?.status === 'ready' ? activeModel.id : undefined}
                canEdit={access.canWrite}
                currentUserName={currentUser?.name}
                getViewpoint={captureViewpoint}
                captureThumbnail={() => viewerRef.current?.captureScreenshot() ?? ''}
                onApply={applySavedView}
                getCanvas={() => viewerRef.current?.getCanvas() ?? null}
                onClose={() => setViewsOpen(false)}
              />
            ) : null}
            {viewMarkup ? (
              <div className="absolute left-3 top-3 z-30 w-72 overflow-hidden rounded-xl border-2 border-rose-400 bg-bg-surface shadow-2xl">
                <div className="flex items-center gap-2 bg-rose-50 px-2 py-1 text-2xs text-rose-700 dark:bg-rose-50">
                  <span className="flex-1 truncate font-semibold">Ghi chú: {viewMarkup.name}</span>
                  <button type="button" aria-label="Đóng ghi chú" onClick={() => setViewMarkup(null)}>
                    <X size={13} />
                  </button>
                </div>
                {/* Ảnh ghi chú là data URL do trình duyệt tạo khi lưu góc nhìn. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewMarkup.image} alt={'Ghi chú góc nhìn ' + viewMarkup.name} className="w-full" />
              </div>
            ) : null}
            {clashOpen && displayModels.length && !sectionOpen && !filterOpen ? (
              <BimClashPanel
                projectId={projectId}
                models={displayModels}
                versionChains={chains}
                canEdit={access.canWrite}
                currentUserName={currentUser?.name}
                onFocusClash={focusClash}
                getBoxes={async (modelId) => (await viewerRef.current?.getBoxes(modelId)) ?? []}
                getItemsBrief={async (modelId, ids) => (await viewerRef.current?.getItemsBrief(modelId, ids)) ?? {}}
                getItemTriangles={async (modelId, ids) =>
                  (await viewerRef.current?.getItemTriangles(modelId, ids)) ?? new Map()
                }
                mapGuidsToIds={async (modelId, guids) =>
                  (await viewerRef.current?.mapGuidsToIds(modelId, guids)) ?? guids.map(() => null)
                }
                onRequestModels={(ids) =>
                  setHiddenIds((current) => new Set([...current].filter((id) => !ids.includes(id))))
                }
                onSelectClash={(clash) => void showClash(clash)}
                onCreateIssue={(clash) => void createClashIssue(clash)}
                onHighlight={(rows) => {
                  setSetColoring(null);
                  setColorMode('none');
                  setClashRows(rows);
                }}
                onClose={() => {
                  setClashOpen(false);
                  setClashRows(null);
                  viewerRef.current?.setClashMarker(null);
                }}
              />
            ) : null}
            {legend.length && (colorMode !== 'none' || clashRows?.length || setColoring) ? (
              <div className="absolute right-3 top-14 z-20 max-h-[45%] w-56 overflow-y-auto rounded-xl border border-border bg-bg-surface/95 p-2 text-2xs shadow-lg">
                <div className="mb-1 flex items-center gap-2">
                  <strong className="flex-1 truncate">
                    {setColoring?.title ?? (clashRows?.length ? 'Va chạm' : 'Chú giải')}
                  </strong>
                  <button type="button" aria-label="Bỏ tô màu" onClick={clearColoring}>
                    <X size={12} />
                  </button>
                </div>
                {legend.map((item) => (
                  <p key={item.label} className="flex items-center gap-2 py-0.5">
                    <span className="size-3 shrink-0 rounded-sm" style={{ background: item.color }} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="tabular-nums text-txt-muted">{formatNumber(item.count, 2)}</span>
                  </p>
                ))}
              </div>
            ) : null}
            <div className=" absolute right-3 top-3 z-20 flex items-center gap-1.5">
              {leftCollapsed ? (
                <button
                  type="button"
                  className="doc-button cursor-pointer bg-bg-surface/90 backdrop-blur-xs !px-2.5 !py-1.5 !text-xs shadow-sm"
                  onClick={() => setLeftCollapsed(false)}
                  data-tooltip="Hiện danh sách mô hình & cây cấu kiện"
                >
                  <PanelLeftOpen size={14} />
                  Mô hình ({latest.length})
                </button>
              ) : null}
              <button
                type="button"
                className={
                  'doc-button cursor-pointer bg-bg-surface/90 backdrop-blur-xs !px-2.5 !py-1.5 !text-xs shadow-sm ' +
                  (wideMode ? 'doc-primary' : '')
                }
                onClick={() => {
                  const nextWide = !wideMode;
                  setLeftCollapsed(nextWide);
                  setRightCollapsed(nextWide);
                }}
                data-tooltip={
                  wideMode ? 'Khôi phục 2 bảng điều khiển hai bên' : 'Thu gọn 2 bảng bên để mở rộng tối đa mô hình 3D'
                }
              >
                {wideMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {wideMode ? 'Hiện 2 cột bên' : 'Mở rộng 3D'}
              </button>
              {displayModels.length ? (
                <button
                  type="button"
                  aria-pressed={drawingOpen}
                  className={
                    'doc-button cursor-pointer bg-bg-surface/90 backdrop-blur-xs !px-2.5 !py-1.5 !text-xs shadow-sm ' +
                    (drawingOpen ? 'doc-primary' : '')
                  }
                  onClick={() => setDrawingOpen((v) => !v)}
                >
                  <FileText size={14} />
                  Bản vẽ
                </button>
              ) : null}
              <button
                type="button"
                className="doc-button cursor-pointer bg-bg-surface/90 backdrop-blur-xs !px-2 !py-1.5 !text-xs shadow-sm"
                onClick={() => setRightCollapsed((v) => !v)}
                data-tooltip={rightCollapsed ? 'Hiện bảng công cụ bên phải' : 'Thu gọn bảng công cụ bên phải'}
                aria-label={rightCollapsed ? 'Hiện cột phải' : 'Thu gọn cột phải'}
              >
                {rightCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
              </button>
            </div>
          </div>
          {drawingOpen ? (
            <BimDrawingPane projectId={projectId} onClose={() => setDrawingOpen(false)} className="w-[45%]" />
          ) : null}
        </div>
        {basemapOpen ? (
          <BimBasemapPanel
            projectId={projectId}
            model={activeModel?.status === 'ready' ? activeModel : null}
            canEdit={access.canWrite}
            currentUserName={currentUser?.name}
            getSceneBox={() => viewerRef.current?.getSceneBox() ?? null}
            apply={async (cfg) => viewerRef.current?.setGroundImage(cfg)}
            onClose={() => setBasemapOpen(false)}
          />
        ) : null}
        {scheduleOpen ? (
          <Bim4DPanel
            projectId={projectId}
            canEdit={access.canWrite}
            selectedGuid={selected?.guid ?? null}
            displayModelIds={loadedIds}
            getSelectionElements={async () =>
              (await selectedBriefs(5000)).map(({ modelId, guid }) => ({ modelId, guid }))
            }
            onApply={applySchedule}
            onOpenSchedule={onOpenSchedule}
            onClose={() => {
              setScheduleOpen(false);
              setSchedule(null);
            }}
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <BimToolbar
            hiddenFeatures={pendingFeatures}
            selectedCount={selectionCount}
            isBoxSelectActive={boxSelect}
            onToggleBoxSelect={() => setBoxSelect((v) => !v)}
            isIsolated={isIsolated}
            isGhostMode={isGhostMode}
            isSectionOpen={sectionOpen}
            isFilterOpen={filterOpen}
            isViewsOpen={viewsOpen}
            isClashOpen={clashOpen}
            isScheduleOpen={scheduleOpen}
            isFullscreen={fullscreen}
            measureMode={measureMode}
            snapping={snapping}
            colorMode={colorMode}
            projection={projection}
            navMode={navMode}
            quality={quality}
            showStats={showStats}
            showMinimap={showMinimap}
            isBasemapOpen={basemapOpen}
            canCompareVersion={!!activeModel?.model_goc_id && activeModel.status === 'ready'}
            onFit={() => viewerRef.current?.fitToModel()}
            onResetView={() => viewerRef.current?.resetView()}
            onViewPreset={(preset) => viewerRef.current?.setView(preset)}
            onProjection={(p) => {
              setProjection(p);
              void viewerRef.current?.setProjection(p);
            }}
            onNavMode={(mode) => {
              setNavMode(mode);
              viewerRef.current?.setNavMode(mode);
            }}
            onQuality={(q) => {
              setQuality(q);
              viewerRef.current?.setQuality(q);
            }}
            onToggleStats={() => setShowStats((v) => !v)}
            onToggleMinimap={() => setShowMinimap((v) => !v)}
            onToggleBasemap={() => setBasemapOpen((v) => !v)}
            onHideSelected={run(async () => {
              for (const item of viewerRef.current?.getSelection() ?? [])
                await viewerRef.current?.hideElements(item.modelId, [item.expressId]);
            }, 'Không ẩn được cấu kiện.')}
            onIsolateSelected={run(async () => {
              const groups = new Map<string, number[]>();
              for (const item of viewerRef.current?.getSelection() ?? [])
                groups.set(item.modelId, [...(groups.get(item.modelId) ?? []), item.expressId]);
              await viewerRef.current?.isolateMany([...groups].map(([modelId, ids]) => ({ modelId, ids })));
              setIsIsolated(true);
            }, 'Không cô lập được cấu kiện.')}
            onShowAll={run(async () => {
              await viewerRef.current?.showAll();
              setIsIsolated(false);
            }, 'Không hiện lại được mô hình.')}
            onToggleGhost={run(async () => {
              await viewerRef.current?.setGhostMode(!isGhostMode);
              setIsGhostMode((v) => !v);
            }, 'Không bật được chế độ xuyên thấu.')}
            onToggleSection={() => setSectionOpen((v) => !v)}
            onToggleFilter={() => setFilterOpen((v) => !v)}
            onToggleViews={() => setViewsOpen((v) => !v)}
            onToggleClash={() => {
              if (clashOpen) {
                setClashRows(null);
                viewerRef.current?.setClashMarker(null);
              }
              setClashOpen((v) => !v);
              setFilterOpen(false);
              setSectionOpen(false);
            }}
            onToggleSchedule={() => {
              if (scheduleOpen) setSchedule(null);
              setScheduleOpen((v) => !v);
              setClashOpen(false);
            }}
            onGroupAcceptance={() => void openGroupAcceptance()}
            onOpenHelp={() => setHelpOpen(true)}
            onMeasureMode={setMeasureMode}
            onClearMeasurements={() => viewerRef.current?.clearMeasurements()}
            onUndoMeasure={() => viewerRef.current?.undoMeasure()}
            onMeasureClearance={run(async () => {
              await viewerRef.current?.measureSelectionClearance();
            }, 'Cần chọn đúng hai cấu kiện để đo khoảng hở.')}
            onMeasureBox={run(async () => {
              await viewerRef.current?.measureSelectionBox();
            }, 'Chọn một cấu kiện để đo kích thước.')}
            onToggleSnapping={() => {
              viewerRef.current?.setSnapping(!snapping);
              setSnapping((v) => !v);
            }}
            onColorMode={(mode) => {
              setSetColoring(null);
              setClashRows(null);
              setColorMode((current) => (current === mode ? 'none' : mode));
            }}
            onCaptureIssue={captureIssue}
            onExportImage={() => {
              const url = viewerRef.current?.captureWithTitleBlock({
                title: activeModel?.file_name ?? 'Mô hình BIM',
                subtitle: currentUser ? `Xuất bởi ${currentUser.name}` : undefined,
              });
              if (!url) return;
              const link = document.createElement('a');
              link.href = url;
              link.download = `${(activeModel?.file_name ?? 'mo-hinh').replace(/\.[^.]+$/, '')}.png`;
              link.click();
            }}
            onToggleFullscreen={toggleFullscreen}
            onReserveChange={setToolbarReserve}
          />
        </div>
      </section>

      {!rightCollapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để thay đổi độ rộng bảng bên phải"
          data-tooltip="Kéo trái/phải để thay đổi độ rộng · Nhấp đúp để đặt lại mặc định"
          onPointerDown={(e) => startResize('right', e)}
          onDoubleClick={() => {
            setRightWidth(400);
            try {
              localStorage.setItem('bim-right-panel-width', '400');
            } catch {
              /* ignore */
            }
          }}
          className="group relative hidden cursor-col-resize items-center justify-center xl:flex"
        >
          <div
            className={`h-full w-[2px] rounded-full transition-colors ${
              draggingSide === 'right' ? 'bg-primary-500' : 'bg-transparent group-hover:bg-primary-400/60'
            }`}
          />
          <div
            className={`absolute h-12 w-1.5 rounded-full transition-all ${
              draggingSide === 'right'
                ? 'h-16 bg-primary-600 shadow-xs'
                : 'bg-border group-hover:h-16 group-hover:bg-primary-500'
            }`}
          />
        </div>
      ) : null}

      <aside
        className={
          rightCollapsed
            ? 'hidden'
            : 'flex min-w-0 flex-row overflow-hidden rounded-2xl border border-border bg-bg-surface shadow-sm xl:h-[calc(100vh-100px)]'
        }
      >
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {(() => {
            const rightTabItems = [
              ['props', 'Thuộc tính', 'Chi tiết thuộc tính cấu kiện', Info],
              ['issues', 'Vướng mắc', 'Vướng mắc & BCF', MessageSquareWarning],
              ['field', 'Hiện trường', 'Nghiệm thu & Hiện trường', ClipboardList],
              ['analytics', 'Phân tích', 'Kiểm định & Phân tích', FileCheck2],
              ['qty', 'Khối lượng', 'Khối lượng & Chi phí 5D', Sigma],
              ['co', 'Lệnh thay đổi', 'Biến động & Lệnh thay đổi', FileDiff],
              ['site', 'Khu đất', 'Môi trường & Khu đất', Sun],
              ['sustain', 'Bền vững', 'Năng lượng & Carbon 6D', Leaf],
              ['trace', 'Truy vết', 'Truy vết hệ thống MEP', Network],
              ['ops', 'Vận hành', 'Tài sản & Vận hành 7D', Wrench],
              ['ai', 'Trợ lý', 'Trợ lý BIM AI', Sparkles],
            ] as const;
            const currentTabMeta = rightTabItems.find(([k]) => k === rightTab) ?? rightTabItems[0];
            const CurrentIcon = currentTabMeta[3];
            return (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-subtle/40 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <CurrentIcon size={13} className="shrink-0 text-primary-600 dark:text-primary-400" />
                  <h2 className="truncate text-xs font-semibold text-txt-primary">{currentTabMeta[2]}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {rightTab === 'props' && selected ? (
                    <button
                      type="button"
                      className="doc-button cursor-pointer !px-2 !py-0.5 !text-2xs"
                      onClick={() => void openQrLabels()}
                    >
                      <QrCode size={12} />
                      Nhãn QR{selectionCount > 1 ? ` (${selectionCount})` : ''}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="doc-icon cursor-pointer !p-1"
                    data-tooltip="Thu gọn bảng bên phải (kéo cạnh trái để thay đổi độ rộng)"
                    aria-label="Thu gọn cột phải"
                    onClick={() => setRightCollapsed(true)}
                  >
                    <PanelRightClose size={13} />
                  </button>
                </div>
              </div>
            );
          })()}

          {compareBase ? (
            <section className="shrink-0 border-b border-border bg-amber-50/40 dark:bg-amber-950">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold">
                  <GitCompare size={13} />
                  Thay đổi v{compareBase.phien_ban ?? 1} → v{activeModel?.phien_ban ?? 2}
                </h3>
                <button
                  type="button"
                  className="doc-icon !p-1"
                  aria-label="Đóng so sánh"
                  onClick={() => setCompareBaseId(null)}
                >
                  <X size={13} />
                </button>
              </div>
              {diff.isLoading ? (
                <p role="status" className="p-2.5 text-xs text-txt-muted">
                  Đang đối chiếu cấu kiện…
                </p>
              ) : diff.error ? (
                <p role="alert" className="p-2.5 text-xs text-rose-700">
                  {diff.error instanceof Error ? diff.error.message : 'Không so sánh được hai phiên bản.'}
                </p>
              ) : (
                <BimVersionChangesList
                  rows={diff.data ?? []}
                  onPick={(row) => void pickChange(row)}
                  className="max-h-[28vh]"
                />
              )}
            </section>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rightTab === 'props' ? (
              <PropertyInspector
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                element={element.data ?? null}
                fallbackAttributes={fallbackAttributes}
                isLoading={!!selected && element.isLoading}
                projectId={projectId}
                modelId={selected?.modelId}
                canEdit={access.canWrite}
                currentUserName={currentUser?.name}
                onOpenAcceptance={(guid) =>
                  setAcceptance({ guid, modelId: selected?.modelId, title: element.data?.ten_cau_kien ?? undefined })
                }
                onCreateIssue={access.canWrite ? () => captureIssue() : undefined}
              />
            ) : rightTab === 'issues' ? (
              <BimIssuesPanel
                className="min-h-0 flex-1 rounded-none border-0 shadow-none"
                projectId={projectId}
                projectName={projectName}
                modelId={activeModel?.status === 'ready' ? activeModel.id : undefined}
                canEdit={access.canWrite}
                currentUser={currentUser ? { id: currentUser.id, name: currentUser.name } : null}
                draft={issueDraft}
                onDraftConsumed={() => setIssueDraft(null)}
                onRequestDraft={() => buildIssueDraft(true)}
                onShowIssue={(issue) => void showIssue(issue)}
              />
            ) : rightTab === 'qty' ? (
              <BimQuantityTable
                className="min-h-0 flex-1 rounded-none border-0 shadow-none"
                projectId={projectId}
                projectName={projectName}
                models={displayModels.filter((m) => loadedIds.includes(m.id))}
                canEdit={access.canWrite}
                onSelectElements={select}
              />
            ) : rightTab === 'co' ? (
              <BimVariationPanel
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                projectId={projectId}
                viewerRef={viewerRef}
                canEdit={access.canWrite}
                canManage={access.canManage}
              />
            ) : rightTab === 'analytics' ? (
              <BimAnalyticsPanel
                className="min-h-0 flex-1 rounded-none border-0 shadow-none"
                projectId={projectId}
                projectName={projectName}
                displayModels={displayModels.filter((m) => loadedIds.includes(m.id))}
                activeModel={activeModel?.status === 'ready' ? activeModel : null}
                issues={issuesQuery.data ?? []}
                canEdit={access.canWrite}
                currentUserName={currentUser?.name}
                organizationId={access.organizationId ?? undefined}
                canManageStandards={access.isOrgAdmin}
                onLocateElement={(modelId, expressId, guid) => {
                  void viewerRef.current?.flyToElement(modelId, expressId);
                  void selectElement({ modelId, expressId, guid });
                }}
                onSelectElements={select}
                onColorize={colorizeSet}
                onDraftIssue={
                  access.canWrite
                    ? (d) => {
                        setIssueDraft({ ...buildIssueDraft(false), title: d.title, description: d.description });
                        setRightTab('issues');
                      }
                    : undefined
                }
              />
            ) : rightTab === 'site' ? (
              <BimSiteTab
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                projectId={projectId}
                viewerRef={viewerRef}
                models={displayModels}
                loadedIds={loadedIds}
                canEdit={access.canWrite}
              />
            ) : rightTab === 'sustain' ? (
              <Bim6dTab
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                projectId={projectId}
                viewerRef={viewerRef}
                models={displayModels.filter((m) => loadedIds.includes(m.id))}
                canEdit={access.canWrite}
                selectedGuid={selected?.guid ?? undefined}
                selectedModelId={selected?.modelId}
                onColorize={colorizeSet}
                onOpenSustain={onOpenSustain}
              />
            ) : rightTab === 'trace' ? (
              <BimTracePanel
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                viewerRef={viewerRef}
                selection={selected}
              />
            ) : rightTab === 'ops' ? (
              <BimOperationsPanel
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                projectId={projectId}
                projectName={projectName}
                viewerRef={viewerRef}
                models={displayModels}
                loadedIds={loadedIds}
                selection={selected}
                onLocateGuid={(guid) => void viewerRef.current?.flyToGuid(guid)}
                onColorize={colorizeSet}
              />
            ) : rightTab === 'ai' ? (
              <BimAiPanel
                className="min-h-0 flex-1 rounded-none border-0 shadow-none"
                projectId={projectId}
                viewerRef={viewerRef}
                models={displayModels}
                loadedIds={loadedIds}
                canEdit={access.canWrite}
                host={aiHost}
                userName={currentUser?.name}
              />
            ) : (
              <BimFieldPanel
                className="min-h-0 flex-1 overflow-y-auto bg-bg-surface"
                projectId={projectId}
                viewerRef={viewerRef}
                canEdit={access.canWrite}
                selection={selected}
              />
            )}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Bảng bên phải"
          className="flex w-[58px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-l border-border bg-bg-subtle/40 p-1"
        >
          {(
            [
              ['props', 'Thuộc tính', Info],
              ['issues', 'Vướng mắc', MessageSquareWarning],
              ['field', 'Hiện trường', ClipboardList],
              ['analytics', 'Phân tích', FileCheck2],
              ['qty', 'Khối lượng', Sigma],
              ['co', 'Lệnh thay đổi', FileDiff],
              ['site', 'Khu đất', Sun],
              ['sustain', 'Bền vững', Leaf],
              ['trace', 'Truy vết', Network],
              ['ops', 'Vận hành', Wrench],
              ['ai', 'Trợ lý', Sparkles],
            ] as const
          ).map(([key, label, Icon]) => {
            const active = rightTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                data-tooltip={label}
                onClick={() => setRightTab(key)}
                className={`flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center transition-colors ${
                  active
                    ? 'bg-primary-600 text-white shadow-xs dark:bg-primary-500'
                    : 'text-txt-muted hover:bg-bg-surface hover:text-txt-primary'
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="w-full truncate text-3xs font-medium leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {helpOpen ? <BimHelpPanel onClose={() => setHelpOpen(false)} /> : null}
      {acceptance ? (
        <BimAcceptanceModal
          isOpen
          onClose={() => setAcceptance(null)}
          guid={acceptance.guid}
          elementName={acceptance.title}
          extraGuids={acceptance.extraGuids}
          groupElements={acceptance.elements}
          projectId={projectId}
          modelId={acceptance.modelId}
          canEdit={access.canWrite}
          currentUserName={currentUser?.name}
        />
      ) : null}
      {qrItems ? (
        <BimQrLabelModal
          projectId={projectId}
          projectName={projectName}
          items={qrItems}
          onClose={() => setQrItems(null)}
        />
      ) : null}
      {uploadOpen ? (
        <BimUploadModal
          isOpen
          onClose={() => setUploadOpen(false)}
          projectId={projectId}
          existingModels={latest}
          defaultPreviousModelId={null}
          uploadedBy={currentUser?.name}
          onSuccess={() => void modelsQuery.refetch()}
        />
      ) : null}
    </div>
  );
}
