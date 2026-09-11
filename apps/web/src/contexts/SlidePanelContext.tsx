"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export interface PanelEntry {
  id: string;
  component: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  url?: string;
  width?: string;
}

export interface ConfirmState {
  isOpen: boolean;
  title?: string;
  message?: string;
  targetId?: string;
  onDiscard?: () => void;
}

interface SlidePanelContextType {
  panels: PanelEntry[];
  openPanel: (entry: Omit<PanelEntry, 'id'> & { id?: string }) => string;
  closePanel: (id?: string) => boolean;
  closeAllPanels: () => boolean;
  lockPanel: (id?: string) => void;
  unlockPanel: (id?: string) => void;
  isTopPanelLocked: boolean;
  setOnCloseBlocked: (id: string | undefined, callback: (() => void) | null) => void;
  forceClosePanel: (id?: string) => void;
  confirmState: ConfirmState | null;
  requestCloseWithConfirmation: (
    options?: { title?: string; message?: string; onDiscard?: () => void },
    targetId?: string
  ) => void;
  dismissConfirmDialog: () => void;
  confirmDiscardChanges: () => void;
}

const SlidePanelContext = createContext<SlidePanelContextType | null>(null);

export const SlidePanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [panels, setPanels] = useState<PanelEntry[]>([]);
  const [lockedPanelIds, setLockedPanelIds] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const onCloseBlockedCallbacks = useRef<Map<string, () => void>>(new Map());

  const isTopPanelLocked = panels.length > 0 && lockedPanelIds.has(panels[panels.length - 1].id);

  const lockPanel = useCallback((id?: string) => {
    setPanels((curr) => {
      const targetId = id || (curr.length > 0 ? curr[curr.length - 1].id : null);
      if (targetId) {
        setLockedPanelIds((prev) => new Set(prev).add(targetId));
      }
      return curr;
    });
  }, []);

  const unlockPanel = useCallback((id?: string) => {
    setPanels((curr) => {
      const targetId = id || (curr.length > 0 ? curr[curr.length - 1].id : null);
      if (targetId) {
        setLockedPanelIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
      return curr;
    });
  }, []);

  const setOnCloseBlocked = useCallback((id: string | undefined, callback: (() => void) | null) => {
    const targetId = id || (panels.length > 0 ? panels[panels.length - 1].id : '__default__');
    if (callback) {
      onCloseBlockedCallbacks.current.set(targetId, callback);
    } else {
      onCloseBlockedCallbacks.current.delete(targetId);
    }
  }, [panels]);

  const requestCloseWithConfirmation = useCallback(
    (options?: { title?: string; message?: string; onDiscard?: () => void }, targetId?: string) => {
      setConfirmState({
        isOpen: true,
        title: options?.title || 'Thay đổi chưa được lưu',
        message: options?.message || 'Bạn có dữ liệu đang nhập chưa lưu. Đóng bảng này sẽ hủy bỏ các thay đổi.',
        targetId: targetId || (panels.length > 0 ? panels[panels.length - 1].id : undefined),
        onDiscard: options?.onDiscard,
      });
    },
    [panels]
  );

  const dismissConfirmDialog = useCallback(() => {
    setConfirmState(null);
  }, []);

  const forceClosePanel = useCallback((id?: string) => {
    setPanels((prev) => {
      if (prev.length === 0) return prev;
      const targetId = id || prev[prev.length - 1].id;
      setLockedPanelIds((locked) => {
        const next = new Set(locked);
        next.delete(targetId);
        return next;
      });
      onCloseBlockedCallbacks.current.delete(targetId);
      return prev.filter((p) => p.id !== targetId);
    });
  }, []);

  const confirmDiscardChanges = useCallback(() => {
    if (confirmState?.onDiscard) {
      confirmState.onDiscard();
    }
    const targetId = confirmState?.targetId;
    setConfirmState(null);
    forceClosePanel(targetId);
  }, [confirmState, forceClosePanel]);

  const closePanel = useCallback(
    (id?: string): boolean => {
      if (panels.length === 0) return true;
      const targetId = id || panels[panels.length - 1].id;

      // Kiểm tra panel có bị khóa hay không
      if (lockedPanelIds.has(targetId)) {
        const callback = onCloseBlockedCallbacks.current.get(targetId) || onCloseBlockedCallbacks.current.get('__default__');
        if (callback) {
          callback();
        } else {
          requestCloseWithConfirmation(undefined, targetId);
        }
        return false;
      }

      forceClosePanel(targetId);
      return true;
    },
    [panels, lockedPanelIds, requestCloseWithConfirmation, forceClosePanel]
  );

  const closeAllPanels = useCallback((): boolean => {
    if (panels.some((p) => lockedPanelIds.has(p.id))) {
      requestCloseWithConfirmation();
      return false;
    }
    setPanels([]);
    setLockedPanelIds(new Set());
    onCloseBlockedCallbacks.current.clear();
    return true;
  }, [panels, lockedPanelIds, requestCloseWithConfirmation]);

  const openPanel = useCallback((entry: Omit<PanelEntry, 'id'> & { id?: string }): string => {
    const id = entry.id || `panel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setPanels((prev) => {
      // Nếu panel id đã tồn tại thì đưa lên top
      const filtered = prev.filter((p) => p.id !== id);
      return [...filtered, { ...entry, id }];
    });
    return id;
  }, []);

  // Lắng nghe phím ESC để đóng panel trên cùng
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Kiểm tra xem có child modal nào đang mở trên panel không
        if (typeof document !== 'undefined') {
          if (document.body.getAttribute('data-child-form-open') === 'true') {
            return; // Ưu tiên cho child modal xử lý ESC
          }
        }
        if (confirmState?.isOpen) {
          dismissConfirmDialog();
          return;
        }
        if (panels.length > 0) {
          closePanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panels, confirmState, closePanel, dismissConfirmDialog]);

  return (
    <SlidePanelContext.Provider
      value={{
        panels,
        openPanel,
        closePanel,
        closeAllPanels,
        lockPanel,
        unlockPanel,
        isTopPanelLocked,
        setOnCloseBlocked,
        forceClosePanel,
        confirmState,
        requestCloseWithConfirmation,
        dismissConfirmDialog,
        confirmDiscardChanges,
      }}
    >
      {children}
    </SlidePanelContext.Provider>
  );
};

export function useSlidePanel() {
  const ctx = useContext(SlidePanelContext);
  if (!ctx) {
    throw new Error('useSlidePanel must be used within a SlidePanelProvider');
  }
  return ctx;
}

export function useSlidePanelSafe() {
  return useContext(SlidePanelContext);
}
