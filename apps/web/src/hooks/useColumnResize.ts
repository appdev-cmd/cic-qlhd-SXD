import { useState, useCallback, useEffect, useRef } from 'react';

interface ColumnDef {
  key: string;
  defaultWidth: number; // px
  minWidth?: number;    // px, default 40
}

interface UseColumnResizeOptions {
  tableId: string;
  userId?: string;
  columns: ColumnDef[];
}

interface UseColumnResizeReturn {
  /** Current column widths in px, keyed by column key */
  columnWidths: Record<string, number>;
  /** Start resizing a column — attach to mousedown on drag handle */
  onResizeStart: (columnKey: string, e: React.MouseEvent) => void;
  /** Whether a column is currently being resized */
  isResizing: boolean;
  /** Reset all column widths to defaults */
  resetWidths: () => void;
}

function getStorageKey(tableId: string, userId?: string): string {
  return `col-widths-${userId || 'anon'}-${tableId}`;
}

function loadWidths(storageKey: string, columns: ColumnDef[] = []): Record<string, number> {
  if (!Array.isArray(columns)) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Validate: all column keys must be present and values must be numbers
      const valid = columns.every(c => typeof parsed[c.key] === 'number');
      if (valid) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  // Return defaults
  return Object.fromEntries(columns.map(c => [c.key, c.defaultWidth]));
}

function saveWidths(storageKey: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useColumnResize({ tableId, userId, columns }: UseColumnResizeOptions): UseColumnResizeReturn {
  const storageKey = getStorageKey(tableId, userId);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    loadWidths(storageKey, columns)
  );
  const [isResizing, setIsResizing] = useState(false);

  // Refs to track drag state without re-renders
  const dragRef = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);
  const widthsRef = useRef(columnWidths);

  // Keep ref in sync
  useEffect(() => {
    widthsRef.current = columnWidths;
  }, [columnWidths]);

  // Re-load from storage if userId changes
  useEffect(() => {
    setColumnWidths(loadWidths(storageKey, columns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const onResizeStart = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columns.find(c => c.key === columnKey);
    if (!col) return;

    const startWidth = widthsRef.current[columnKey] || col.defaultWidth;
    dragRef.current = {
      columnKey,
      startX: e.clientX,
      startWidth,
      minWidth: col.minWidth ?? 40,
    };
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const { columnKey: key, startX, startWidth: sw, minWidth } = dragRef.current;
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, sw + delta);
      setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);
      dragRef.current = null;
      // Persist
      setColumnWidths(prev => {
        saveWidths(storageKey, prev);
        return prev;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columns, storageKey]);

  const resetWidths = useCallback(() => {
    const defaults = Object.fromEntries(columns.map(c => [c.key, c.defaultWidth]));
    setColumnWidths(defaults);
    saveWidths(storageKey, defaults);
  }, [columns, storageKey]);

  return { columnWidths, onResizeStart, isResizing, resetWidths };
}
