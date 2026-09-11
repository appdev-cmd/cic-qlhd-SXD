"use client";

import React, { useEffect, useCallback, useState } from 'react';
import { X, FileText, AlertTriangle } from 'lucide-react';
import { useSlidePanel, PanelEntry } from '@/contexts/SlidePanelContext';
import { useIsMobile } from '@/hooks';
import { toast } from 'sonner';
import { Tooltip } from './Tooltip';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_GAP = 20;           // px base gap between sidebar and first panel (expanded)
const COLLAPSED_BASE_GAP = 60; // px base gap when sidebar collapsed (larger to prevent tab clipping)
const STACKING_OFFSET = 20;   // px additional gap per stacked panel
const TAB_WIDTH = 34;          // px tab thickness (protrudes left of panel edge)
const TAB_LENGTH = 148;        // px fixed tab length (vertical)
const TAB_GAP = 3;             // px gap between adjacent tabs

// ─── Single Panel ────────────────────────────────────────────────────────────

interface SlidePanelItemProps {
    panel: PanelEntry;
    index: number;
    total: number;
    onClose: () => void;
    isExiting?: boolean;
    isSidebarCollapsed: boolean;
    isMobile: boolean;
    onWidthChange?: (id: string, width: number) => void;
    parentWidth?: number;
    sidebarWidth: number;
}

/** Kiểm tra toàn diện xem có modal, dialog, alertdialog, popup hoặc form con nào đang mở đè lên slide panel không */
function hasActiveChildModalOrDialog(): boolean {
    if (typeof document === 'undefined') return false;
    if (
        document.body.classList.contains('modal-open') ||
        document.body.getAttribute('data-modal-open') === 'true' ||
        document.body.getAttribute('data-child-form-open') === 'true'
    ) {
        return true;
    }

    // 1. Kiểm tra các dialog, modal có role chuẩn
    const dialogs = document.querySelectorAll(
        '[role="dialog"]:not(.slide-panel-stacked), [role="alertdialog"], [data-modal-open="true"], [data-child-form-open="true"], .modal-backdrop'
    );
    if (dialogs.length > 0) return true;

    // 2. Kiểm tra các lớp phủ modal/dialog fixed overlay (z-index >= 60) nằm ngoài viewport slide panel
    const fixedOverlays = document.querySelectorAll('.fixed.inset-0');
    for (let i = 0; i < fixedOverlays.length; i++) {
        const el = fixedOverlays[i] as HTMLElement;
        // Bỏ qua nếu chính là SlidePanelContainer hoặc bên trong SlidePanelItem backdrop
        if (el.querySelector('.slide-panel-viewport') || el.classList.contains('slide-panel-viewport')) {
            continue;
        }
        const style = window.getComputedStyle(el);
        const z = parseInt(style.zIndex, 10);
        if (!isNaN(z) && z >= 60) {
            return true;
        }
    }

    return false;
}

const SlidePanelItem: React.FC<SlidePanelItemProps> = ({ panel, index, total, onClose, isExiting, isSidebarCollapsed, isMobile, onWidthChange, parentWidth, sidebarWidth }) => {
    const isTopPanel = index === total - 1;
    // Larger base gap when collapsed pushes panel right, preventing tab from being clipped
    const baseGap = isSidebarCollapsed ? COLLAPSED_BASE_GAP : BASE_GAP;

    const handleBackdropClick = (e: React.MouseEvent) => {
        // Nếu có modal hoặc form con đang mở trên slide panel, chặn tuyệt đối không cho đóng slide panel
        if (hasActiveChildModalOrDialog()) {
            e.stopPropagation();
            return;
        }
        if (isTopPanel) {
            onClose();
        }
    };

    const resolvedParentWidth = index > 0
        ? (parentWidth !== undefined 
            ? parentWidth 
            : (window.innerWidth - sidebarWidth - (baseGap + (index - 1) * STACKING_OFFSET)))
        : undefined;

    // Panel luôn full-size: primary panel chiếm trọn bề ngang (trừ khoảng hở cho tab),
    // các panel thứ cấp giật cấp vào STACKING_OFFSET từ panel cha. Bỏ qua panel.width.
    const defaultWidth = index === 0
        ? `calc(100% - ${baseGap}px)`
        : `calc(${resolvedParentWidth !== undefined ? `${resolvedParentWidth}px` : `100% - ${baseGap + (index - 1) * STACKING_OFFSET}px`} - ${STACKING_OFFSET}px)`;

    const maxWidthLimit = index > 0
        ? (resolvedParentWidth !== undefined ? resolvedParentWidth - STACKING_OFFSET : undefined)
        : undefined;

    const maxWidthOffset = baseGap + index * STACKING_OFFSET;

    // ResizeObserver to track actual width in real-time (for tab positioning on window resize)
    useEffect(() => {
        const panelElement = document.getElementById(`slide-panel-${panel.id}`);
        if (!panelElement) return;

        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const w = entry.contentRect.width;
                onWidthChange?.(panel.id, w);
            }
        });

        observer.observe(panelElement);
        return () => {
            observer.disconnect();
            onWidthChange?.(panel.id, 0);
        };
    }, [panel.id, onWidthChange]);

    return (
        <div
            className="absolute inset-0 flex justify-end"
            style={{ zIndex: 60 + index }}
        >
            {/* Backdrop */}
            <div
                className={`absolute inset-0 transition-colors duration-200 ${isTopPanel
                    ? 'bg-gray-900/30 dark:bg-gray-900/40 cursor-pointer'
                    : 'bg-transparent pointer-events-none'
                    } ${isExiting ? 'slide-panel-backdrop-exit' : 'slide-panel-backdrop-enter'}`}
                onClick={isTopPanel ? handleBackdropClick : undefined}
                aria-hidden="true"
            />

            {/* Panel Body — close to sidebar edge, fixed full-size (không co giãn) */}
            <div
                id={`slide-panel-${panel.id}`}
                className={`relative h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700
          flex flex-col overflow-hidden slide-panel-stacked
          ${isExiting ? 'slide-panel-exit' : 'slide-panel-enter'}`}
                style={{
                    width: defaultWidth,
                    maxWidth: isMobile
                        ? '100%'
                        : (maxWidthLimit !== undefined
                            ? `${maxWidthLimit}px`
                            : `calc(100% - ${maxWidthOffset}px)`),
                    ...(isTopPanel ? {} : {
                        filter: 'brightness(0.97)',
                    }),
                }}
                role="dialog"
                aria-modal={isTopPanel}
                aria-label={panel.title || 'Panel'}
            >
                {/* Close Button — vùng chạm ≥44px trên mobile (full-screen) */}
                {isTopPanel && (
                    <Tooltip content="Đóng panel (ESC)" placement="bottom">
                        <button
                            onClick={onClose}
                            className="absolute top-3 right-3 z-30 p-2 md:p-1.5 rounded-lg
                  text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100
                  bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700
                  backdrop-blur-xs border border-slate-200/70 dark:border-slate-700/70 shadow-2xs
                  transition-all duration-150 cursor-pointer"
                            aria-label="Đóng"
                        >
                            <X size={18} className="w-5 h-5" />
                        </button>
                    </Tooltip>
                )}

                {/* Content */}
                <div className="flex flex-col flex-1 h-full overflow-y-auto overflow-x-hidden">
                    {panel.component}
                </div>
            </div>
        </div>
    );
};

// ─── Folder Tabs — vertical tabs hugging each panel's left edge ──────────────

interface PanelTabsOverlayProps {
    panels: PanelEntry[];
    sidebarWidth: number;
    isSidebarCollapsed: boolean;
    onFocus: (id: string) => void;
    onClose: (id: string) => void;
    panelWidths: Record<string, number>;
}

const PanelTabsOverlay: React.FC<PanelTabsOverlayProps> = ({ panels, sidebarWidth, isSidebarCollapsed, onFocus, onClose, panelWidths }) => {
    if (panels.length === 0) return null;

    return (
        <>
            {panels.map((panel, index) => {
                const isTopPanel = index === panels.length - 1;
                const title = panel.title || `Panel ${index + 1}`;
                const displayTitle = title.length > 24 ? title.slice(0, 24) + '…' : title;

                // Adjacent stacking: tabs sit right below each other
                const tabTop = 16 + index * (TAB_LENGTH + TAB_GAP);

                const getInitialLeftEdge = () => {
                    const baseGap = isSidebarCollapsed ? COLLAPSED_BASE_GAP : BASE_GAP;
                    const stackOffset = baseGap + index * STACKING_OFFSET;
                    const initialWidth = window.innerWidth - sidebarWidth - stackOffset;
                    return window.innerWidth - initialWidth;
                };

                const panelWidth = panelWidths[panel.id];
                const leftEdge = panelWidth !== undefined 
                    ? (window.innerWidth - panelWidth) 
                    : getInitialLeftEdge();

                const tabPositionStyle: React.CSSProperties = {
                    right: `calc(100% - ${leftEdge + 1}px)`,
                    top: `${tabTop}px`,
                    zIndex: 60 + panels.length + index + 1,
                };

                return (
                    <div
                        key={panel.id}
                        className="slide-panel-tab pointer-events-auto absolute"
                        style={tabPositionStyle}
                    >
                        <Tooltip content={panel.title || 'Panel'} placement="bottom">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isTopPanel) {
                                        onFocus(panel.id);
                                    }
                                }}
                                className={`group flex flex-col items-center gap-1.5 pt-2.5 pb-2
                                    rounded-l-xl border border-r-0
                                    transition-all duration-200
                                    ${isTopPanel
                                        ? 'bg-blue-600 dark:bg-blue-500 border-blue-700 dark:border-blue-600 text-white shadow-xl shadow-blue-500/30 dark:shadow-blue-700/50'
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600 shadow-lg shadow-slate-900/15 dark:shadow-slate-950/50 cursor-pointer'
                                    }`}
                                style={{ width: `${TAB_WIDTH}px`, height: `${TAB_LENGTH}px` }}
                            >
                                {/* Icon */}
                                <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${isTopPanel
                                    ? 'text-blue-200'
                                    : 'text-slate-400 dark:text-slate-500'
                                    }`}>
                                    {panel.icon || <FileText size={14} />}
                                </span>

                                {/* Title — vertical, reads bottom-to-top */}
                                <span
                                    className="flex-1 min-h-0 overflow-hidden text-xs font-semibold whitespace-nowrap"
                                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textOverflow: 'ellipsis' }}
                                >
                                    {displayTitle}
                                </span>

                                {/* × Close — ONLY on topmost panel */}
                                {isTopPanel && (
                                    <Tooltip content="Đóng tab này">
                                        <span
                                            onClick={(e) => { e.stopPropagation(); onClose(panel.id); }}
                                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center
                                                rounded-full
                                                text-blue-200 hover:text-white hover:bg-blue-700 dark:hover:bg-blue-600
                                                transition-all duration-150 cursor-pointer"
                                        >
                                            <X size={12} strokeWidth={2.5} />
                                        </span>
                                    </Tooltip>
                                )}
                            </button>
                        </Tooltip>
                    </div>
                );
            })}
        </>
    );
};

// ─── Panel Container ─────────────────────────────────────────────────────────

interface SlidePanelContainerProps {
    isSidebarCollapsed?: boolean;
}

export const SlidePanelContainer: React.FC<SlidePanelContainerProps> = ({ isSidebarCollapsed = false }) => {
    const { panels, closePanel, focusPanel, hasOpenPanels, closingPanels, isTopPanelLocked, confirmState, dismissConfirmDialog, confirmDiscardChanges } = useSlidePanel();
    const isMobile = useIsMobile();
    const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});

    const handleWidthChange = useCallback((id: string, width: number) => {
        setPanelWidths(prev => {
            if (width === 0) {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            if (prev[id] === width) return prev;
            return { ...prev, [id]: width };
        });
    }, []);

    const guardedClose = useCallback((id?: string) => {
        closePanel(id);
    }, [closePanel]);

    const guardedFocus = useCallback((id: string) => {
        if (isTopPanelLocked) {
            closePanel();
            return;
        }
        focusPanel(id);
    }, [focusPanel, isTopPanelLocked, closePanel]);

    useEffect(() => {
        if (!hasOpenPanels) return;
        const handleEscapeKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (hasActiveChildModalOrDialog()) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                guardedClose();
            }
        };
        window.addEventListener('keydown', handleEscapeKey, { capture: true });
        return () => window.removeEventListener('keydown', handleEscapeKey, { capture: true });
    }, [hasOpenPanels, guardedClose]);

    useEffect(() => {
        if (hasOpenPanels) {
            document.body.classList.add('slide-panel-open');
        } else {
            document.body.classList.remove('slide-panel-open');
        }
        return () => document.body.classList.remove('slide-panel-open');
    }, [hasOpenPanels]);

    if (!hasOpenPanels) return null;

    const sidebarWidth = isSidebarCollapsed ? 80 : 256;

    const isAllExiting = panels.length > 0 && closingPanels.size === panels.length;

    const handleContainerBackdropClick = (e: React.MouseEvent) => {
        if (hasActiveChildModalOrDialog()) {
            e.stopPropagation();
            return;
        }
        guardedClose();
    };

    return (
        <div className="fixed inset-0 z-[60]">
            {/* Full-screen backdrop — frosted glass dims the sidebar */}
            <div
                className={`absolute inset-0 bg-gray-900/20 dark:bg-gray-900/40 backdrop-blur-[2px] transition-colors duration-200 ${isAllExiting ? 'slide-panel-backdrop-exit' : 'slide-panel-backdrop-enter'}`}
                onClick={handleContainerBackdropClick}
                aria-hidden="true"
            />

            {/* Panel viewport — after sidebar */}
            <style>{`
        @media (min-width: 768px) {
          .slide-panel-viewport {
            left: ${sidebarWidth}px !important;
          }
        }
      `}</style>
            <div
                className="slide-panel-viewport absolute inset-0 overflow-visible"
                style={{ left: 0 }}
            >
                {panels.map((panel, index) => {
                    const parentWidth = index > 0 ? panelWidths[panels[index - 1].id] : undefined;
                    return (
                        <SlidePanelItem
                            key={panel.id}
                            panel={panel}
                            index={index}
                            total={panels.length}
                            onClose={() => guardedClose(panel.id)}
                            isExiting={closingPanels.has(panel.id)}
                            isSidebarCollapsed={isSidebarCollapsed}
                            isMobile={isMobile}
                            onWidthChange={handleWidthChange}
                            parentWidth={parentWidth}
                            sidebarWidth={sidebarWidth}
                        />
                    );
                })}
            </div>

            {/* Tab Ears — OUTSIDE viewport, in the fixed container. */}
            {!isMobile && (
                <PanelTabsOverlay
                    panels={panels}
                    sidebarWidth={sidebarWidth}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onFocus={(id) => guardedFocus(id)}
                    onClose={(id) => guardedClose(id)}
                    panelWidths={panelWidths}
                />
            )}

            {/* Unsaved Changes Confirmation Modal */}
            {confirmState?.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
                        role="alertdialog"
                        aria-modal="true"
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex-shrink-0">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    {confirmState.title || 'Bạn có thay đổi chưa lưu'}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {confirmState.message || 'Thông tin bạn vừa nhập hoặc chỉnh sửa chưa được lưu lại. Bạn có chắc chắn muốn thoát và bỏ qua các thay đổi này?'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={dismissConfirmDialog}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                            >
                                Tiếp tục chỉnh sửa
                            </button>
                            <button
                                type="button"
                                onClick={confirmDiscardChanges}
                                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                            >
                                Hủy thay đổi & Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SlidePanelContainer;
