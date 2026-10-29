// features/bim/components/BimToolbar.tsx
// Thanh công cụ 3D chia nhóm: Điều hướng · Hiển thị · Mặt cắt & đo · Phối hợp

import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Camera,
  Scissors,
  Ruler,
  Eye,
  EyeOff,
  RotateCcw,
  Focus,
  Box,
  Ghost,
  Palette,
  Filter,
  Bookmark,
  MoveVertical,
  ChevronUp,
  Trash2,
  ScanEye,
  Footprints,
  SquareStack,
  Gauge,
  Zap,
  CalendarClock,
  ClipboardCheck,
  HelpCircle,
  Hexagon,
  TriangleRight,
  TrendingUp,
  SquareDashedBottom,
  Magnet,
  Map as MapIcon,
  BoxSelect,
  Undo2,
  ArrowLeftRight,
  Scan,
} from 'lucide-react';
import type { BimMeasureMode, BimNavMode, BimProjection, BimQuality, BimViewPreset } from './BimViewer';

export type BimColorMode = 'none' | 'category' | 'acceptance' | 'linked' | 'version' | 'tien_do';

/** Nút của các bảng chưa có trong BuildSIA (mỗi giai đoạn chuyển mã bật thêm); ẩn thay vì để nút không làm gì. */
export type BimToolbarFeature =
  | 'basemap'
  | 'filter'
  | 'colorMode'
  // Tô màu theo tiến độ hiện trường (nghiệm thu, rồi % thực tế của công việc tiến độ gắn cấu kiện)
  | 'colorProgress'
  | 'section'
  | 'clash'
  | 'schedule'
  | 'acceptance'
  | 'views'
  | 'captureIssue'
  | 'help';

interface BimToolbarProps {
  hiddenFeatures?: ReadonlySet<BimToolbarFeature>;
  selectedCount: number;
  isBoxSelectActive?: boolean;
  onToggleBoxSelect?: () => void;
  isIsolated: boolean;
  isGhostMode: boolean;
  isSectionOpen: boolean;
  isFilterOpen: boolean;
  isViewsOpen: boolean;
  isClashOpen: boolean;
  isScheduleOpen: boolean;
  isFullscreen: boolean;
  measureMode: BimMeasureMode;
  snapping: boolean;
  colorMode: BimColorMode;
  projection: BimProjection;
  navMode: BimNavMode;
  quality: BimQuality;
  showStats: boolean;
  showMinimap: boolean;
  isBasemapOpen: boolean;
  canCompareVersion: boolean;
  onFit: () => void;
  onResetView: () => void;
  onViewPreset: (preset: BimViewPreset) => void;
  onProjection: (projection: BimProjection) => void;
  onNavMode: (mode: BimNavMode) => void;
  onQuality: (quality: BimQuality) => void;
  onToggleStats: () => void;
  onToggleMinimap: () => void;
  onToggleBasemap: () => void;
  onHideSelected: () => void;
  onIsolateSelected: () => void;
  onShowAll: () => void;
  onToggleGhost: () => void;
  onToggleSection: () => void;
  onToggleFilter: () => void;
  onToggleViews: () => void;
  onToggleClash: () => void;
  onToggleSchedule: () => void;
  onGroupAcceptance: () => void;
  onOpenHelp: () => void;
  onMeasureMode: (mode: BimMeasureMode) => void;
  onClearMeasurements: () => void;
  /** Bỏ điểm đo cuối hoặc phép đo cuối (Backspace) */
  onUndoMeasure?: () => void;
  /** Khoảng hở giữa hai cấu kiện đang chọn */
  onMeasureClearance?: () => void;
  /** Kích thước hộp bao của cấu kiện đang chọn */
  onMeasureBox?: () => void;
  onToggleSnapping: () => void;
  onColorMode: (mode: BimColorMode) => void;
  onCaptureIssue: () => void;
  onExportImage: () => void;
  onToggleFullscreen: () => void;
  /**
   * Báo khoảng cần chừa ở đáy khung 3D (px, tính cả thanh công cụ khi xuống hai hàng) để các lớp phủ
   * góc dưới (bản đồ thu nhỏ, chỉ số, chú giải, tiến độ nạp) không bị thanh công cụ che.
   */
  onReserveChange?: (px: number) => void;
}

const Btn: React.FC<{
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, active, disabled, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-tooltip={title}
    aria-label={title}
    aria-pressed={active}
    className={`relative p-2 rounded-lg transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
      active
        ? 'bg-primary-600 text-white shadow-sm'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/70'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />;

/** Nút có menu bật lên phía trên */
const MenuBtn: React.FC<{
  title: string;
  active?: boolean;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}> = ({ title, active, icon, children }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Btn title={title} active={active || open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center">
          {icon}
          <ChevronUp className="w-2.5 h-2.5 -ml-0.5 opacity-60" />
        </span>
      </Btn>
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 min-w-[180px] p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl text-xs z-40">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode; hint?: string }> = ({
  active,
  onClick,
  children,
  hint,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
      active
        ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold'
        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
    }`}
  >
    <span>{children}</span>
    {hint && <kbd className="text-2xs text-slate-400 font-mono">{hint}</kbd>}
  </button>
);

const VIEW_PRESETS: { key: BimViewPreset; label: string }[] = [
  { key: 'iso', label: 'Phối cảnh' },
  { key: 'top', label: 'Mặt bằng (trên xuống)' },
  { key: 'front', label: 'Mặt đứng trước' },
  { key: 'back', label: 'Mặt đứng sau' },
  { key: 'left', label: 'Mặt bên trái' },
  { key: 'right', label: 'Mặt bên phải' },
  { key: 'bottom', label: 'Nhìn từ dưới lên' },
];

const COLOR_MODES: { key: BimColorMode; label: string }[] = [
  { key: 'none', label: 'Màu gốc của mô hình' },
  { key: 'category', label: 'Theo loại cấu kiện' },
  { key: 'acceptance', label: 'Theo trạng thái nghiệm thu' },
  { key: 'tien_do', label: 'Tiến độ hiện trường (nghiệm thu · tiến độ dự án)' },
  { key: 'linked', label: 'Cấu kiện có hồ sơ liên kết' },
  { key: 'version', label: 'Thay đổi so với phiên bản trước' },
];

export const BimToolbar: React.FC<BimToolbarProps> = (p) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const hide = (feature: BimToolbarFeature) => p.hiddenFeatures?.has(feature) ?? false;
  const onReserve = p.onReserveChange;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onReserve || typeof ResizeObserver === 'undefined') return;
    const report = () => {
      const parent = el.offsetParent as HTMLElement | null;
      if (parent) onReserve(Math.max(0, Math.round(parent.clientHeight - el.offsetTop + 8)));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    if (el.offsetParent) ro.observe(el.offsetParent);
    return () => ro.disconnect();
  }, [onReserve]);
  return (
    <div
      ref={rootRef}
      // Không dùng overflow ở đây: overflow-x sẽ cắt mất các menu bật lên phía trên
      className="absolute bottom-2 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-wrap justify-center items-center gap-0.5 p-1 bg-white/95 dark:bg-slate-800 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700 w-max max-w-[calc(100%-1rem)]"
      role="toolbar"
      aria-label="Công cụ mô hình BIM"
    >
      {/* Điều hướng */}
      <Btn title="Xem toàn bộ (F)" onClick={p.onFit}>
        <Focus className="w-4 h-4" />
      </Btn>
      <MenuBtn title="Hướng nhìn chuẩn" icon={<Box className="w-4 h-4" />}>
        {(close) =>
          VIEW_PRESETS.map((v) => (
            <MenuItem
              key={v.key}
              onClick={() => {
                p.onViewPreset(v.key);
                close();
              }}
            >
              {v.label}
            </MenuItem>
          ))
        }
      </MenuBtn>
      <MenuBtn
        title="Kiểu chiếu & điều hướng"
        active={p.projection === 'Orthographic' || p.navMode !== 'Orbit' || p.quality === 'nhanh'}
        icon={<SquareStack className="w-4 h-4" />}
      >
        {(close) => (
          <>
            <p className="px-2.5 pt-1 pb-0.5 text-2xs uppercase tracking-wide text-slate-400">Kiểu chiếu</p>
            <MenuItem
              active={p.projection === 'Perspective'}
              onClick={() => {
                p.onProjection('Perspective');
                close();
              }}
            >
              Phối cảnh
            </MenuItem>
            <MenuItem
              active={p.projection === 'Orthographic'}
              onClick={() => {
                p.onProjection('Orthographic');
                close();
              }}
            >
              Trực giao
            </MenuItem>
            <p className="px-2.5 pt-1.5 pb-0.5 text-2xs uppercase tracking-wide text-slate-400">Điều hướng</p>
            <MenuItem
              active={p.navMode === 'Orbit'}
              onClick={() => {
                p.onNavMode('Orbit');
                close();
              }}
            >
              Xoay quanh mô hình
            </MenuItem>
            <MenuItem
              active={p.navMode === 'FirstPerson'}
              onClick={() => {
                p.onNavMode('FirstPerson');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <Footprints className="w-3.5 h-3.5" /> Đi bộ trong công trình
              </span>
            </MenuItem>
            <MenuItem
              active={p.navMode === 'Plan'}
              onClick={() => {
                p.onNavMode('Plan');
                close();
              }}
            >
              Xem mặt bằng
            </MenuItem>
            <MenuItem
              active={p.showMinimap}
              onClick={() => {
                p.onToggleMinimap();
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <MapIcon className="w-3.5 h-3.5" /> Bản đồ mặt bằng thu nhỏ
              </span>
            </MenuItem>
            {!hide('basemap') && (
              <MenuItem
                active={p.isBasemapOpen}
                onClick={() => {
                  p.onToggleBasemap();
                  close();
                }}
              >
                <span className="flex items-center gap-2">
                  <MapIcon className="w-3.5 h-3.5 text-emerald-600" /> Nền bản đồ / ảnh flycam
                </span>
              </MenuItem>
            )}
            <p className="px-2.5 pt-1.5 pb-0.5 text-2xs uppercase tracking-wide text-slate-400">
              Chất lượng hiển thị
            </p>
            <MenuItem
              active={p.quality === 'cao'}
              onClick={() => {
                p.onQuality('cao');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5" /> Cao (viền + đổ bóng)
              </span>
            </MenuItem>
            <MenuItem
              active={p.quality === 'nhanh'}
              onClick={() => {
                p.onQuality('nhanh');
                close();
              }}
            >
              Ưu tiên tốc độ
            </MenuItem>
            <MenuItem
              active={p.showStats}
              onClick={() => {
                p.onToggleStats();
                close();
              }}
            >
              Hiện chỉ số hiệu năng (FPS)
            </MenuItem>
          </>
        )}
      </MenuBtn>
      <Btn title="Đặt lại camera" onClick={p.onResetView}>
        <RotateCcw className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* Hiển thị & Chọn */}
      {p.onToggleBoxSelect && (
        <Btn
          title={
            p.isBoxSelectActive
              ? 'Đang bật chế độ quét chọn hộp (Bấm để tắt)'
              : 'Bật chế độ quét chọn nhiều cấu kiện (hoặc Shift + kéo chuột trái)'
          }
          active={p.isBoxSelectActive}
          onClick={p.onToggleBoxSelect}
        >
          <BoxSelect className="w-4 h-4" />
        </Btn>
      )}
      {p.selectedCount > 1 && (
        <span
          className="px-1.5 text-2xs font-semibold text-primary-600 dark:text-primary-300 whitespace-nowrap"
          data-tooltip="Giữ Shift + kéo chuột trái hoặc bật quét chọn để chọn thêm cấu kiện"
        >
          {p.selectedCount} chọn
        </span>
      )}
      <Btn title="Ẩn cấu kiện đang chọn (H)" disabled={p.selectedCount === 0} onClick={p.onHideSelected}>
        <EyeOff className="w-4 h-4" />
      </Btn>
      <Btn
        title="Cô lập cấu kiện đang chọn (I)"
        disabled={p.selectedCount === 0}
        active={p.isIsolated}
        onClick={p.onIsolateSelected}
      >
        <ScanEye className="w-4 h-4" />
      </Btn>
      <Btn title="Hiện tất cả (Shift+H)" onClick={p.onShowAll}>
        <Eye className="w-4 h-4" />
      </Btn>
      <Btn title="Chế độ xuyên thấu (G)" active={p.isGhostMode} onClick={p.onToggleGhost}>
        <Ghost className="w-4 h-4" />
      </Btn>
      {!hide('filter') && (
        <Btn title="Lọc theo loại / tầng" active={p.isFilterOpen} onClick={p.onToggleFilter}>
          <Filter className="w-4 h-4" />
        </Btn>
      )}
      {!hide('colorMode') && (
        <MenuBtn title="Tô màu mô hình" active={p.colorMode !== 'none'} icon={<Palette className="w-4 h-4" />}>
          {(close) =>
            COLOR_MODES.filter(
              (c) => (c.key !== 'version' || p.canCompareVersion) && (c.key !== 'tien_do' || !hide('colorProgress')),
            ).map((c) => (
              <MenuItem
                key={c.key}
                active={p.colorMode === c.key}
                onClick={() => {
                  p.onColorMode(c.key);
                  close();
                }}
              >
                {c.label}
              </MenuItem>
            ))
          }
        </MenuBtn>
      )}

      <Divider />

      {/* Mặt cắt & đo */}
      {!hide('section') && (
        <Btn title="Mặt cắt / Hộp cắt (C)" active={p.isSectionOpen} onClick={p.onToggleSection}>
          <Scissors className="w-4 h-4" />
        </Btn>
      )}
      <MenuBtn title="Đo đạc" active={!!p.measureMode} icon={<Ruler className="w-4 h-4" />}>
        {(close) => (
          <>
            <MenuItem
              active={p.measureMode === 'distance'}
              hint="M"
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'distance' ? null : 'distance');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <Ruler className="w-3.5 h-3.5" /> Đo khoảng cách
              </span>
            </MenuItem>
            <MenuItem
              active={p.measureMode === 'elevation'}
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'elevation' ? null : 'elevation');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <MoveVertical className="w-3.5 h-3.5" /> Đo cao độ điểm
              </span>
            </MenuItem>
            <MenuItem
              active={p.measureMode === 'area'}
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'area' ? null : 'area');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <Hexagon className="w-3.5 h-3.5" /> Đo diện tích (vùng đa giác)
              </span>
            </MenuItem>
            <MenuItem
              active={p.measureMode === 'angle'}
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'angle' ? null : 'angle');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <TriangleRight className="w-3.5 h-3.5" /> Đo góc
              </span>
            </MenuItem>
            <MenuItem
              active={p.measureMode === 'slope'}
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'slope' ? null : 'slope');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Đo độ dốc
              </span>
            </MenuItem>
            <MenuItem
              active={p.measureMode === 'perpendicular'}
              onClick={() => {
                p.onMeasureMode(p.measureMode === 'perpendicular' ? null : 'perpendicular');
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <SquareDashedBottom className="w-3.5 h-3.5" /> Khoảng cách vuông góc tới mặt
              </span>
            </MenuItem>
            {p.onMeasureClearance && (
              <MenuItem
                onClick={() => {
                  p.onMeasureClearance?.();
                  close();
                }}
              >
                <span className="flex items-center gap-2">
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Khoảng hở giữa 2 cấu kiện đang chọn
                </span>
              </MenuItem>
            )}
            {p.onMeasureBox && (
              <MenuItem
                onClick={() => {
                  p.onMeasureBox?.();
                  close();
                }}
              >
                <span className="flex items-center gap-2">
                  <Scan className="w-3.5 h-3.5" /> Kích thước hộp bao cấu kiện đang chọn
                </span>
              </MenuItem>
            )}
            <MenuItem
              active={p.snapping}
              onClick={() => {
                p.onToggleSnapping();
                close();
              }}
            >
              <span className="flex items-center gap-2">
                <Magnet className="w-3.5 h-3.5" /> Bắt điểm (đỉnh, trung điểm, cạnh)
              </span>
            </MenuItem>
            {p.onUndoMeasure && (
              <MenuItem
                hint="Backspace"
                onClick={() => {
                  p.onUndoMeasure?.();
                  close();
                }}
              >
                <span className="flex items-center gap-2">
                  <Undo2 className="w-3.5 h-3.5" /> Hoàn tác điểm / phép đo cuối
                </span>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                p.onClearMeasurements();
                close();
              }}
            >
              <span className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Trash2 className="w-3.5 h-3.5" /> Xóa các phép đo
              </span>
            </MenuItem>
          </>
        )}
      </MenuBtn>

      <Divider />

      {/* Kiểm tra & tiến độ */}
      {!hide('clash') && (
        <Btn title="Dò va chạm giữa các mô hình" active={p.isClashOpen} onClick={p.onToggleClash}>
          <Zap className="w-4 h-4" />
        </Btn>
      )}
      {!hide('schedule') && (
        <Btn title="Mô phỏng tiến độ" active={p.isScheduleOpen} onClick={p.onToggleSchedule}>
          <CalendarClock className="w-4 h-4" />
        </Btn>
      )}
      {!hide('acceptance') && (
        <Btn
          title={
            p.selectedCount > 1
              ? `Lập biên bản nghiệm thu cho ${p.selectedCount} cấu kiện đang chọn`
              : 'Lập biên bản nghiệm thu cho cấu kiện đang chọn'
          }
          disabled={p.selectedCount === 0}
          onClick={p.onGroupAcceptance}
        >
          <ClipboardCheck className="w-4 h-4" />
        </Btn>
      )}

      <Divider />

      {/* Phối hợp */}
      {!hide('views') && (
        <Btn title="Góc nhìn đã lưu" active={p.isViewsOpen} onClick={p.onToggleViews}>
          <Bookmark className="w-4 h-4" />
        </Btn>
      )}
      <MenuBtn title="Chụp ảnh mô hình" icon={<Camera className="w-4 h-4" />}>
        {(close) => (
          <>
            {!hide('captureIssue') && (
              <MenuItem
                onClick={() => {
                  p.onCaptureIssue();
                  close();
                }}
              >
                Chụp & báo vướng mắc
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                p.onExportImage();
                close();
              }}
            >
              Xuất ảnh PNG kèm khung tên
            </MenuItem>
          </>
        )}
      </MenuBtn>
      {!hide('help') && (
        <Btn title="Hướng dẫn sử dụng & phím tắt" onClick={p.onOpenHelp}>
          <HelpCircle className="w-4 h-4" />
        </Btn>
      )}
      <Btn title={p.isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} onClick={p.onToggleFullscreen}>
        {p.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </Btn>
    </div>
  );
};
