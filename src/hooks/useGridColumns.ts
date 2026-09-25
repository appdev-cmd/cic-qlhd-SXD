import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SortSpec } from '../data-access/query';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bỏ qua
  }
}

/**
 * Độ rộng cột có thể kéo thay đổi, lưu localStorage theo storageKey.
 */
export function useColumnResize(storageKey: string, defaultWidths: Record<string, number>, minWidth = 60) {
  const key = `cic_grid_widths_${storageKey}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => load(key, defaultWidths));
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const startResize = useCallback(
    (columnKey: string, event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widthsRef.current[columnKey] ?? defaultWidths[columnKey] ?? 120;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (e: PointerEvent) => {
        const next = Math.max(minWidth, Math.round(startWidth + e.clientX - startX));
        setWidths((prev) => ({ ...prev, [columnKey]: next }));
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        save(key, widthsRef.current);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [defaultWidths, key, minWidth]
  );

  const resetWidths = useCallback(() => {
    setWidths(defaultWidths);
    try {
      localStorage.removeItem(key);
    } catch {
      // bỏ qua
    }
  }, [defaultWidths, key]);

  return { widths, startResize, resetWidths };
}

/**
 * Sắp xếp theo cột (bấm tiêu đề: tăng dần → giảm dần → mặc định), lưu localStorage.
 */
export function useGridSort<K extends string>(storageKey: string, defaultSort: SortSpec<K> | null) {
  const key = `cic_grid_sort_${storageKey}`;
  const [sort, setSort] = useState<SortSpec<K> | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as SortSpec<K> | null) : defaultSort;
    } catch {
      return defaultSort;
    }
  });

  useEffect(() => save(key, sort), [key, sort]);

  const toggleSort = useCallback(
    (column: K) => {
      setSort((prev) => {
        if (!prev || prev.key !== column) return { key: column, direction: 'asc' };
        if (prev.direction === 'asc') return { key: column, direction: 'desc' };
        return defaultSort;
      });
    },
    [defaultSort]
  );

  const resetSort = useCallback(() => setSort(defaultSort), [defaultSort]);

  return { sort, toggleSort, resetSort };
}
