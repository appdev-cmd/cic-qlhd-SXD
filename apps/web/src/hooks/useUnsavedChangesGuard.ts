"use client";

import { useEffect, useRef } from 'react';
import { useSlidePanelSafe } from '../contexts/SlidePanelContext';

interface UnsavedChangesGuardOptions {
  title?: string;
  message?: string;
  onDiscard?: () => void;
}

/**
 * Custom Hook bảo vệ các Form mở trên Slide Panel khi có thay đổi chưa lưu (isDirty = true).
 * Tự động khóa panel (lockPanel), đăng ký callback chặn đóng (setOnCloseBlocked),
 * và tự mở lại panel (unlockPanel) khi form đã lưu thành công hoặc reset về trạng thái cũ.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options?: UnsavedChangesGuardOptions
) {
  const slidePanelCtx = useSlidePanelSafe();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!slidePanelCtx) return;

    if (isDirty) {
      slidePanelCtx.lockPanel();
      slidePanelCtx.setOnCloseBlocked(undefined, () => {
        if (slidePanelCtx.requestCloseWithConfirmation) {
          slidePanelCtx.requestCloseWithConfirmation(optionsRef.current);
        }
      });
    } else {
      slidePanelCtx.unlockPanel();
      slidePanelCtx.setOnCloseBlocked(undefined, null);
    }

    return () => {
      if (slidePanelCtx && isDirty) {
        slidePanelCtx.unlockPanel();
        slidePanelCtx.setOnCloseBlocked(undefined, null);
      }
    };
  }, [isDirty, slidePanelCtx]);

  // Bắt sự kiện F5 / Tắt tab trình duyệt khi có thay đổi chưa lưu
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  /** Helper dành cho nút Hủy/Quay lại trong Form */
  const handleGuardClose = () => {
    if (isDirty && slidePanelCtx?.requestCloseWithConfirmation) {
      slidePanelCtx.requestCloseWithConfirmation(optionsRef.current);
    } else if (slidePanelCtx) {
      slidePanelCtx.closePanel();
    }
  };

  /** Helper dành cho khi Lưu thành công - Mở khóa và Đóng panel mà không hỏi lại */
  const handleSaveClose = () => {
    if (slidePanelCtx) {
      slidePanelCtx.forceClosePanel();
    }
  };

  return { handleGuardClose, handleSaveClose };
}

export default useUnsavedChangesGuard;
