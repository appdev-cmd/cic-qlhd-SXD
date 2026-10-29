import { useEffect, useRef } from 'react';
import { useFilterState } from './useFilterState';
import { clampWidth, redistributeWidths } from '../lib/dataTable';

export interface ColumnResizeOptions<K extends string | number> {
  /**
   * Ordered ids of the visible resizable columns. When given, header cells are located by
   * `[data-col-id]` instead of their position in the row (needed once columns can be hidden).
   */
  columns?: readonly K[];
  /** Minimum width in px (default 100, the historical grid minimum). */
  min?: number;
}

type Widths<K extends string | number> = Partial<Record<K, number>>;

/**
 * Persisted column widths (scoped localStorage via useFilterState) with pointer drag and keyboard nudging.
 * `fitWidth` keeps the table width constant by trading width with the neighbouring column.
 */
export function useColumnResize<K extends string | number = number>(key: string, fitWidth = false) {
  const [widths, setWidths] = useFilterState<Widths<K>>(key, {});
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  /** Measure the header cells taking part in a fit-width trade. */
  const measure = (cell: Element | null | undefined, id: K, options?: ColumnResizeOptions<K>) => {
    const row = cell?.closest('tr');
    if (!row) return null;
    if (options?.columns) {
      const ids = [...options.columns];
      const sizes = ids.map(
        (column) =>
          row.querySelector(`[data-col-id="${CSS.escape(String(column))}"]`)?.getBoundingClientRect().width || 0,
      );
      return { ids, sizes, index: ids.indexOf(id) };
    }
    const cells = Array.from(row.children);
    return {
      ids: cells.map((_, i) => i as K),
      sizes: cells.map((c) => c.getBoundingClientRect().width),
      index: Number(id),
    };
  };

  const applyFit = (snapshot: NonNullable<ReturnType<typeof measure>>, delta: number, min: number) => {
    const next = redistributeWidths(snapshot.sizes, snapshot.index, delta, min);
    setWidths((prev) => ({ ...prev, ...Object.fromEntries(snapshot.ids.map((id, i) => [id, next[i]])) }));
  };

  const start = (index: K, event: React.PointerEvent, options?: ColumnResizeOptions<K>) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const min = options?.min ?? 100;
    const origin = event.clientX;
    const cell = event.currentTarget.parentElement;
    const width = cell?.getBoundingClientRect().width || 180;
    let move: (e: PointerEvent) => void;
    if (fitWidth) {
      const snapshot = measure(cell, index, options);
      if (!snapshot || snapshot.index < 0 || snapshot.index >= snapshot.ids.length - 1) return;
      move = (e) => applyFit(snapshot, e.clientX - origin, Math.min(min, 80));
    } else {
      move = (e) => setWidths((prev) => ({ ...prev, [index]: clampWidth(width + e.clientX - origin, min) }));
    }
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      cleanup.current = null;
    };
    cleanup.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  };

  /** Keyboard resize from a focused separator element (its parent is the header cell). */
  const nudge = (index: K, delta: number, separator: Element, options?: ColumnResizeOptions<K>) => {
    const min = options?.min ?? 100;
    const cell = separator.parentElement;
    if (fitWidth) {
      const snapshot = measure(cell, index, options);
      if (snapshot && snapshot.index >= 0 && snapshot.index < snapshot.ids.length - 1)
        applyFit(snapshot, delta, Math.min(min, 80));
      return;
    }
    const current = widths[index] ?? cell?.getBoundingClientRect().width ?? 180;
    setWidths((prev) => ({ ...prev, [index]: clampWidth(current + delta, min) }));
  };

  /** Drop the stored width of one column, or of every column when called without an id. */
  const reset = (index?: K) =>
    setWidths((prev) => {
      if (index === undefined) return {};
      const next = { ...prev };
      delete next[index];
      return next;
    });

  return { widths: widths as Record<K, number>, start, nudge, reset };
}
