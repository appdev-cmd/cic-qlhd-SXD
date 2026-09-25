import { useContext, useEffect } from 'react';
import { pushModalLayer } from '../lib/modalLayer';
import { PanelIdContext, useSlidePanel } from '../context/SlidePanelContext';

/**
 * Khóa Slide Panel cha khi form con / modal / lightbox đang mở:
 * backdrop và phím Esc chỉ tác động lên lớp con, không đóng panel.
 */
export function useChildFormGuard(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    return pushModalLayer();
  }, [isOpen]);
}

/**
 * Chặn mất dữ liệu khi form có thay đổi chưa lưu:
 * - Đánh dấu panel chứa form là "có thay đổi" → đóng panel phải xác nhận.
 * - Cảnh báo khi tải lại / đóng tab trình duyệt.
 * isDirty nên tính bằng JSON.stringify(current) !== JSON.stringify(initial).
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const panelId = useContext(PanelIdContext);
  const { updatePanelUnsavedStatus } = useSlidePanel();

  useEffect(() => {
    if (!panelId) return;
    updatePanelUnsavedStatus(panelId, isDirty);
    return () => updatePanelUnsavedStatus(panelId, false);
  }, [panelId, isDirty, updatePanelUnsavedStatus]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

/** Tiện ích so sánh trạng thái form theo quy chuẩn (JSON.stringify). */
export function isFormDirty<T>(current: T, initial: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}
