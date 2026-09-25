import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Layers, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { PanelIdContext, useSlidePanel, type SlidePanelEntry } from '../context/SlidePanelContext';
import { isModalLayerOpen } from '../lib/modalLayer';
import { Tooltip } from './ui/Tooltip';
import { ConfirmDialog } from './ui/Modal';

// ─── Constants theo chuẩn qlda-ddcn-ht-selfhost ────────────────────────────────
const TAB_WIDTH = 34;        // px — chiều rộng tai thỏ
const TAB_LENGTH = 142;      // px — chiều cao tai thỏ
const MIN_PANEL_WIDTH = 420; // px — chiều rộng tối thiểu của panel

// ─── Viên tay cầm kéo dãn chiều rộng (Grab Handle Pill) ────────────────────────
interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  resizing: boolean;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ onPointerDown, resizing }) => (
  <div
    onPointerDown={onPointerDown}
    aria-label="Kéo sang trái/phải để thay đổi chiều rộng"
    className="group pointer-events-auto absolute top-0 bottom-0 z-40 flex w-6 cursor-col-resize items-center justify-center touch-none select-none"
    style={{ left: -12 }}
  >
    {/* Đường viền dọc */}
    <div
      className={cn(
        'h-full w-0.5 transition-colors',
        resizing
          ? 'w-1 bg-primary-500 shadow-xs shadow-primary-500/40'
          : 'bg-transparent group-hover:w-1 group-hover:bg-primary-400/70'
      )}
    />

    {/* Viên tay cầm — Grab Handle Pill */}
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-3.5 flex-col items-center justify-center gap-1 rounded-full border shadow-md transition-all',
        resizing
          ? 'border-primary-500 bg-primary-500 text-white scale-110 shadow-primary-500/30 ring-2 ring-primary-400/30'
          : 'border-border bg-surface text-ink-muted group-hover:scale-105 group-hover:border-primary-400 group-hover:bg-primary-50 group-hover:text-primary-500 dark:border-slate-700/80 dark:bg-slate-800'
      )}
    >
      <span className={cn('h-1 w-1 rounded-full transition-colors', resizing ? 'bg-white' : 'bg-ink-muted/70 group-hover:bg-primary-500')} />
      <span className={cn('h-1 w-1 rounded-full transition-colors', resizing ? 'bg-white' : 'bg-ink-muted/70 group-hover:bg-primary-500')} />
      <span className={cn('h-1 w-1 rounded-full transition-colors', resizing ? 'bg-white' : 'bg-ink-muted/70 group-hover:bg-primary-500')} />
    </div>
  </div>
);

// ─── Component Chính: SlidePanelStack ──────────────────────────────────────────
interface SlidePanelStackProps {
  sidebarWidth?: number;
}

export function SlidePanelStack({ sidebarWidth: propSidebarWidth }: SlidePanelStackProps = {}) {
  const { stack, closePanel, closeAllPanels, bringToFront } = useSlidePanel();
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});
  // Trạng thái Phóng to toàn màn hình (MẶC ĐỊNH LUÔN LÀ TRUE THEO YÊU CẦU NGƯỜI DÙNG)
  const [maximizedPanels, setMaximizedPanels] = useState<Record<string, boolean>>({});
  const [resizing, setResizing] = useState(false);
  const [, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const activePanelRef = useRef<SlidePanelEntry | null>(null);
  // Panel đang chờ xác nhận đóng (có thay đổi chưa lưu)
  const [pendingClose, setPendingClose] = useState<SlidePanelEntry | 'all' | null>(null);

  /** Đóng panel theo quy chuẩn: bỏ qua khi có form con/modal; hỏi xác nhận khi có thay đổi chưa lưu. */
  const requestClose = useCallback(
    (panel: SlidePanelEntry | null | undefined) => {
      if (!panel) return;
      if (panel.hasUnsavedChanges) {
        setPendingClose(panel);
        return;
      }
      closePanel(panel.id);
    },
    [closePanel]
  );

  const topPanel = stack.length > 0 ? stack[stack.length - 1] : null;
  activePanelRef.current = topPanel;

  // Lắng nghe thay đổi kích thước cửa sổ trình duyệt
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Chiều rộng thanh Sidebar bên trái (mặc định 272px khi mở, 76px khi thu gọn)
  const getSidebarWidth = useCallback(() => {
    if (propSidebarWidth !== undefined) return propSidebarWidth;
    if (typeof document !== 'undefined') {
      const aside = document.querySelector('aside');
      if (aside) return aside.clientWidth;
    }
    return 272;
  }, [propSidebarWidth]);

  // Chiều rộng Full: chiếm trọn vẹn khu vực làm việc Main Content (bên phải Sidebar),
  // Cột tai thỏ chạm khít 100% vào mép phải của thanh Sidebar (khe hở = 0px hoàn hảo)
  const getFullPanelWidth = useCallback(() => {
    if (typeof window === 'undefined') return 1100;
    const sbW = getSidebarWidth();
    return Math.max(MIN_PANEL_WIDTH, window.innerWidth - sbW - 32.7);
  }, [getSidebarWidth]);

  // Chiều rộng chuẩn (khi thu nhỏ để xem đồng thời bảng danh sách dự án): chiếm khoảng 60% vùng Main Content
  const getStandardPanelWidth = useCallback(() => {
    if (typeof window === 'undefined') return 800;
    const sbW = getSidebarWidth();
    const availableW = window.innerWidth - sbW;
    return Math.max(MIN_PANEL_WIDTH, Math.min(1050, Math.round(availableW * 0.60)));
  }, [getSidebarWidth]);

  // Khôi phục độ rộng đã lưu từ localStorage (nếu có)
  useEffect(() => {
    stack.forEach((panel) => {
      if (panel.storageKey && typeof window !== 'undefined') {
        const saved = localStorage.getItem(panel.storageKey);
        if (saved) {
          const w = parseInt(saved, 10);
          if (w >= MIN_PANEL_WIDTH && w < window.innerWidth - 80) {
            setPanelWidths((prev) => ({ ...prev, [panel.id]: w }));
          }
        }
      }
    });
  }, [stack]);

  // Đóng bằng phím Escape — lắng nghe ở pha capture để kiểm tra lớp con TRƯỚC khi modal con tự đóng
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack.length === 0 || pendingClose) return;
      if (isModalLayerOpen()) return; // Esc chỉ dành cho form con / modal đang mở
      // Đánh dấu đã xử lý: hộp xác nhận vừa mở không được nhận lại chính phím Esc này
      e.preventDefault();
      requestClose(activePanelRef.current);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [stack.length, requestClose, pendingClose]);

  // Toggle Phóng to (Full) / Thu nhỏ (60%)
  const toggleMaximize = useCallback((panelId: string) => {
    setMaximizedPanels((prev) => {
      const isCurrentlyMaximized = prev[panelId] !== false; // Mặc định là true
      return { ...prev, [panelId]: !isCurrentlyMaximized };
    });
  }, []);

  // Xử lý kéo resize độ rộng từ mép trái panel
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!topPanel) return;
    e.preventDefault();
    setResizing(true);

    const isMax = maximizedPanels[topPanel.id] !== false;
    const startX = e.clientX;
    const currentW = isMax
      ? getFullPanelWidth()
      : (panelWidths[topPanel.id] || topPanel.defaultWidth || getStandardPanelWidth());

    // Khi người dùng chủ động kéo tay, chuyển trạng thái Maximize sang false
    setMaximizedPanels((prev) => ({ ...prev, [topPanel.id]: false }));

    const maxAllowedWidth = window.innerWidth - getSidebarWidth() - 32.7;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = startX - moveEvent.clientX; // Kéo sang trái = mở rộng
      const newW = Math.max(MIN_PANEL_WIDTH, Math.min(maxAllowedWidth, currentW + deltaX));
      setPanelWidths((prev) => ({ ...prev, [topPanel.id]: newW }));
    };

    const handlePointerUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (topPanel.storageKey) {
        localStorage.setItem(
          topPanel.storageKey,
          String(panelWidths[topPanel.id] || currentW)
        );
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (stack.length === 0 || !topPanel) return null;

  // Xác định xem topPanel có đang ở trạng thái Full không (MẶC ĐỊNH LÀ TRUE)
  const isTopMaximized = maximizedPanels[topPanel.id] !== false;

  const currentWidth = isTopMaximized
    ? getFullPanelWidth()
    : (panelWidths[topPanel.id] || topPanel.defaultWidth || getStandardPanelWidth());

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {/* ─── Backdrop mờ nền: chỉ phủ lên vùng Main Content, để lộ thanh Sidebar hoàn toàn ─── */}
      <div
        onClick={() => {
          if (isModalLayerOpen()) return;
          requestClose(topPanel);
        }}
        className="absolute top-0 bottom-0 right-0 bg-black/40 dark:bg-black/55 backdrop-blur-xs pointer-events-auto transition-opacity duration-200 cursor-pointer"
        style={{ left: `${getSidebarWidth()}px` }}
        aria-hidden="true"
      />

      {/* ─── Khung Panel trượt chính — Neo sát phải, thẳng hàng 100% ─── */}
      <div
        className="absolute top-0 bottom-0 right-0 flex flex-col pointer-events-auto bg-surface border-l border-border shadow-2xl transition-transform duration-240 ease-out translate-x-0"
        style={{
          width: `${currentWidth}px`,
          transition: resizing ? 'none' : 'width 200ms ease-out',
        }}
      >
        {/* Tay kéo dãn chiều rộng — nằm chính xác ở mép trái thẳng hàng của Panel */}
        <ResizeHandle onPointerDown={handlePointerDown} resizing={resizing} />

        {/* ══════════ CỘT TAI THỎ (TAB EARS) THEO CHUẨN qlda-ddcn-ht-selfhost ══════════ */}
        {/* Neo chính xác ở mép ngoài bên trái của Panel, các tab thẳng tắp 1 hàng dọc theo thứ tự mở */}
        <div
          className="absolute right-full top-0 flex flex-col gap-1.5 pointer-events-none z-30"
          style={{ marginRight: -1 }} // Khít viền panel
        >
          {stack.map((panel) => {
            const isActive = panel.id === topPanel.id;
            const rawTitle = panel.tabTitle || panel.title || '';
            const displayTitle = rawTitle.length > 22 ? rawTitle.slice(0, 22) + '…' : rawTitle;

            return (
              <button
                key={panel.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isActive) bringToFront(panel.id);
                }}
                aria-label={panel.title}
                className={cn(
                  'pointer-events-auto group flex flex-col items-center gap-1.5 rounded-l-xl border border-r-0 pb-2 pt-2.5 shadow-md transition-all duration-150 select-none cursor-pointer',
                  isActive
                    ? 'border-primary-600 bg-primary-600 dark:bg-primary-500 text-white shadow-primary-900/20 z-10 scale-[1.02] origin-right'
                    : 'border-border bg-surface text-ink-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-primary-900/30 hover:scale-[1.01] origin-right'
                )}
                style={{ width: TAB_WIDTH, height: TAB_LENGTH }}
              >
                {/* 1. Icon trên cùng của tai thỏ */}
                <span className={cn('shrink-0', isActive ? 'text-white/90' : 'text-ink-muted group-hover:text-primary-500')}>
                  {panel.icon ?? <FileText size={14} />}
                </span>

                {/* 2. Text dọc chuẩn mực (writingMode: vertical-rl + rotate 180deg) */}
                <span
                  className="min-h-0 flex-1 overflow-hidden whitespace-nowrap text-[0.625rem] font-bold tracking-tight select-none"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {displayTitle}
                </span>

                {/* 3. Nút X đóng ngay trên tai thỏ */}
                {isActive ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      requestClose(panel);
                    }}
                    aria-label="Đóng panel này (Esc)"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/25 hover:text-white cursor-pointer"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </span>
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      requestClose(panel);
                    }}
                    aria-label="Đóng panel này"
                    className="opacity-0 group-hover:opacity-100 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 transition-all cursor-pointer"
                  >
                    <X size={10} strokeWidth={2} />
                  </span>
                )}
              </button>
            );
          })}

          {/* Nút "Đóng tất" khi có từ 2 panel trở lên */}
          {stack.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (stack.some((p) => p.hasUnsavedChanges)) setPendingClose('all');
                else closeAllPanels();
              }}
              className="pointer-events-auto group flex flex-col items-center gap-1 rounded-l-xl border border-r-0 pt-2 pb-1.5 bg-red-50/90 dark:bg-red-950 border-red-200 dark:border-red-800/80 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 shadow-sm transition-all hover:scale-[1.02] origin-right cursor-pointer"
              style={{ width: TAB_WIDTH }}
              aria-label="Đóng tất cả các panel"
            >
              <Layers size={13} className="shrink-0" />
              <span
                className="min-h-0 flex-1 overflow-hidden text-[0.5625rem] font-bold whitespace-nowrap select-none"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Đóng tất
              </span>
            </button>
          )}
        </div>

        {/* ══════════ NỘI DUNG CÁC PANEL TRONG STACK ══════════ */}
        {/* Giữ nguyên DOM của tất cả các panel để bảo toàn 100% trạng thái form, cuộn trang */}
        <div className="relative w-full h-full overflow-hidden flex flex-col">
          {stack.map((panel) => {
            const isActive = panel.id === topPanel.id;

            return (
              <div
                key={panel.id}
                className={cn(
                  'absolute inset-0 flex flex-col bg-surface',
                  isActive ? 'z-20 opacity-100 pointer-events-auto' : 'z-10 opacity-0 pointer-events-none'
                )}
                style={{
                  visibility: isActive ? 'visible' : 'hidden',
                  transition: 'opacity 120ms ease-out',
                }}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isActive}
                aria-label={panel.title}
              >
                {/* Header Panel — tuân thủ quy chuẩn Non-Overlapping UI với pr-24 */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-subtle/70 shrink-0 pr-24 relative">
                  <div className="flex flex-col truncate min-w-0">
                    <h3 className="text-sm font-bold text-ink truncate flex items-center gap-2">
                      {panel.icon ? (
                        <span className="text-primary-600 dark:text-primary-400 shrink-0">{panel.icon}</span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                      )}
                      <span>{panel.title}</span>
                    </h3>
                    {panel.subtitle && (
                      <p className="text-2xs text-ink-muted truncate mt-0.5">{panel.subtitle}</p>
                    )}
                  </div>

                  {/* Cụm nút Thao tác: Toggle Maximize/Full & Đóng X (đặt absolute góc phải) */}
                  <div className="absolute right-3.5 top-3 flex items-center gap-1.5 z-30">
                    <Tooltip
                      content={isTopMaximized ? 'Thu nhỏ cửa sổ (60%)' : 'Mở rộng toàn màn hình (Full)'}
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => toggleMaximize(panel.id)}
                        className="p-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-ink-muted hover:text-ink transition-colors cursor-pointer"
                      >
                        {isTopMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                      </button>
                    </Tooltip>

                    <Tooltip content="Đóng panel (Esc)" placement="bottom">
                      <button
                        type="button"
                        onClick={() => requestClose(panel)}
                        className="p-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-ink-muted hover:text-red-500 hover:border-red-300 dark:hover:border-red-800 transition-colors cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* Nội dung bên trong Panel */}
                <div className="flex-1 overflow-y-auto p-5 overflow-x-hidden">
                  <PanelIdContext.Provider value={panel.id}>{panel.component}</PanelIdContext.Provider>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={pendingClose !== null}
        tone="danger"
        title="Có thay đổi chưa lưu"
        message={
          pendingClose === 'all'
            ? 'Một số panel đang có dữ liệu nhập chưa lưu. Đóng tất cả và bỏ các thay đổi này?'
            : 'Biểu mẫu trong panel này có dữ liệu chưa lưu. Đóng panel và bỏ các thay đổi?'
        }
        confirmLabel="Đóng & bỏ thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        onCancel={() => setPendingClose(null)}
        onConfirm={() => {
          if (pendingClose === 'all') closeAllPanels();
          else if (pendingClose) closePanel(pendingClose.id);
          setPendingClose(null);
        }}
      />
    </div>
  );
}
