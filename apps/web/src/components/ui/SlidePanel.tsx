"use client";

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSlidePanel, PanelEntry } from '@/contexts/SlidePanelContext';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** Kiểm tra xem có modal, dialog con nào đang mở đè lên slide panel không */
function hasActiveChildModalOrDialog(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.body.getAttribute('data-child-form-open') === 'true') {
    return true;
  }
  const dialogs = document.querySelectorAll(
    '[role="dialog"]:not(.slide-panel-root), [role="alertdialog"], [data-child-form-open="true"]'
  );
  return dialogs.length > 0;
}

export const SlidePanelContainer: React.FC = () => {
  const {
    panels,
    closePanel,
    confirmState,
    dismissConfirmDialog,
    confirmDiscardChanges,
  } = useSlidePanel();

  if (panels.length === 0 && !confirmState?.isOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent, panelId: string, isTop: boolean) => {
    if (e.target !== e.currentTarget) return;
    // Chặn tuyệt đối không đóng Slide Panel khi có modal con hoặc subform đang mở
    if (hasActiveChildModalOrDialog()) {
      e.stopPropagation();
      return;
    }
    if (isTop) {
      closePanel(panelId);
    }
  };

  return (
    <>
      {/* Stack các Slide Panel */}
      {panels.map((panel, idx) => {
        const isTop = idx === panels.length - 1;
        const offsetPx = (panels.length - 1 - idx) * 24; // Hiệu ứng giật cấp panel cha

        return (
          <div
            key={panel.id}
            role="dialog"
            aria-modal="true"
            onClick={(e) => handleBackdropClick(e, panel.id, isTop)}
            className={cn(
              "slide-panel-root fixed inset-0 z-50 flex justify-end transition-colors duration-200",
              isTop ? "bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px]" : "pointer-events-none"
            )}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: panel.width || '640px',
                maxWidth: 'calc(100vw - 32px)',
                marginRight: `${offsetPx}px`,
              }}
              className={cn(
                "pointer-events-auto flex flex-col h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 transition-all duration-300 animate-in slide-in-from-right",
                !isTop && "opacity-80 scale-[0.98] origin-right"
              )}
            >
              {panel.component}
            </div>
          </div>
        );
      })}

      {/* Confirmation Modal khi có Unsaved Changes */}
      {confirmState?.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {confirmState.title || 'Dữ liệu chưa được lưu'}
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {confirmState.message || 'Các thay đổi bạn vừa nhập sẽ bị mất nếu đóng bảng này ngay bây giờ. Bạn có chắc muốn tiếp tục không?'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={dismissConfirmDialog}
              >
                Tiếp tục chỉnh sửa
              </Button>
              <button
                type="button"
                onClick={confirmDiscardChanges}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Hủy thay đổi & Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SlidePanelContainer;
