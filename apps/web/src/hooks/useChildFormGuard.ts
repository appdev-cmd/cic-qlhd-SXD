"use client";

import { useEffect, useRef } from 'react';
import { useSlidePanelSafe } from '../contexts/SlidePanelContext';

interface ChildFormGuardOptions {
  title?: string;
  message?: string;
  onDiscard?: () => void;
}

/**
 * Hook bảo vệ Slide Panel khi có một form con / modal / sub-form mở bên trên.
 * Tự động khóa Slide Panel cha và gắn cờ data-child-form-open để ngăn chặn
 * việc bấm nhầm ra backdrop làm đóng mất Slide Panel và dữ liệu đang thẩm định.
 */
export function useChildFormGuard(
  isChildFormOpen: boolean,
  options?: ChildFormGuardOptions
) {
  const slidePanelCtx = useSlidePanelSafe();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!isChildFormOpen) return;

    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-child-form-open', 'true');
    }

    if (slidePanelCtx) {
      slidePanelCtx.lockPanel();
      slidePanelCtx.setOnCloseBlocked(undefined, () => {
        if (slidePanelCtx.requestCloseWithConfirmation) {
          slidePanelCtx.requestCloseWithConfirmation(optionsRef.current);
        }
      });
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.body.removeAttribute('data-child-form-open');
      }
      if (slidePanelCtx) {
        slidePanelCtx.unlockPanel();
        slidePanelCtx.setOnCloseBlocked(undefined, null);
      }
    };
  }, [isChildFormOpen, slidePanelCtx]);
}

export default useChildFormGuard;
