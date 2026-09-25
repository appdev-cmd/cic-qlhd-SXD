import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface SlidePanelEntry {
  id: string;
  title: string;
  subtitle?: string;
  tabTitle?: string;
  icon?: React.ReactNode;
  component: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  side?: 'right' | 'left';
  isSplitView?: boolean;
  hasUnsavedChanges?: boolean;
}

interface SlidePanelContextType {
  stack: SlidePanelEntry[];
  openPanel: (panel: SlidePanelEntry) => void;
  closePanel: (id?: string) => void;
  closeAllPanels: () => void;
  bringToFront: (id: string) => void;
  updatePanelUnsavedStatus: (id: string, hasUnsaved: boolean) => void;
  updatePanelMeta: (id: string, meta: Partial<Pick<SlidePanelEntry, 'title' | 'subtitle' | 'tabTitle'>>) => void;
}

const SlidePanelContext = createContext<SlidePanelContextType | undefined>(undefined);

/** Mã panel đang bao bọc component (để form con tự đánh dấu "có thay đổi chưa lưu"). */
export const PanelIdContext = createContext<string | null>(null);

export function SlidePanelProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<SlidePanelEntry[]>([]);

  const openPanel = useCallback((panel: SlidePanelEntry) => {
    setStack((prev) => {
      // Nếu đã tồn tại panel cùng id thì cập nhật nội dung và đưa lên đầu
      const existingIdx = prev.findIndex((p) => p.id === panel.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        next.splice(existingIdx, 1);
        return [...next, panel];
      }
      return [...prev, panel];
    });
  }, []);

  const closePanel = useCallback((id?: string) => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      if (!id) {
        return prev.slice(0, -1);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const closeAllPanels = useCallback(() => {
    setStack([]);
  }, []);

  const bringToFront = useCallback((id: string) => {
    setStack((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const target = prev[idx];
      const next = [...prev];
      next.splice(idx, 1);
      return [...next, target];
    });
  }, []);

  const updatePanelUnsavedStatus = useCallback((id: string, hasUnsaved: boolean) => {
    setStack((prev) =>
      prev.some((p) => p.id === id && Boolean(p.hasUnsavedChanges) !== hasUnsaved)
        ? prev.map((p) => (p.id === id ? { ...p, hasUnsavedChanges: hasUnsaved } : p))
        : prev
    );
  }, []);

  const updatePanelMeta = useCallback(
    (id: string, meta: Partial<Pick<SlidePanelEntry, 'title' | 'subtitle' | 'tabTitle'>>) => {
      setStack((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target) return prev;
        const changed = (Object.keys(meta) as (keyof typeof meta)[]).some((k) => target[k] !== meta[k]);
        return changed ? prev.map((p) => (p.id === id ? { ...p, ...meta } : p)) : prev;
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      stack,
      openPanel,
      closePanel,
      closeAllPanels,
      bringToFront,
      updatePanelUnsavedStatus,
      updatePanelMeta,
    }),
    [stack, openPanel, closePanel, closeAllPanels, bringToFront, updatePanelUnsavedStatus, updatePanelMeta]
  );

  return <SlidePanelContext.Provider value={value}>{children}</SlidePanelContext.Provider>;
}

export function useSlidePanel() {
  const context = useContext(SlidePanelContext);
  if (!context) {
    throw new Error('useSlidePanel must be used within a SlidePanelProvider');
  }
  return context;
}
