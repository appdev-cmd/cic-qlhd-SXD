// features/bim/components/VirtualRows.tsx
// Danh sách ảo hóa đơn giản (chiều cao dòng cố định): chỉ vẽ các dòng trong khung nhìn + vài dòng đệm,
// đủ để cây 100 nghìn cấu kiện cuộn mượt mà không cần thêm thư viện.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface VirtualRowsProps<T> {
  items: T[];
  rowHeight: number;
  /** Chiều cao tối đa của khung cuộn (px) */
  maxHeight?: number;
  overscan?: number;
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Cuộn tới dòng này khi thay đổi (VD cấu kiện đang chọn) */
  scrollToIndex?: number | null;
  className?: string;
  ariaLabel?: string;
}

export function windowRange(scrollTop: number, viewport: number, rowHeight: number, count: number, overscan: number) {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { first, last };
}

export function VirtualRows<T>({
  items,
  rowHeight,
  maxHeight = 560,
  overscan = 8,
  getKey,
  renderRow,
  scrollToIndex,
  className = '',
  ariaLabel,
}: VirtualRowsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const total = items.length * rowHeight;
  const height = Math.min(total, maxHeight);

  // Danh sách co lại (thu gọn nhánh, lọc) → đưa vị trí cuộn về trong phạm vi
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && scrollTop > Math.max(0, total - height)) {
      const next = Math.max(0, total - height);
      el.scrollTop = next;
      setScrollTop(next);
    }
  }, [total, height, scrollTop]);

  useEffect(() => {
    const el = ref.current;
    if (!el || scrollToIndex == null || scrollToIndex < 0) return;
    const top = scrollToIndex * rowHeight;
    if (top < el.scrollTop || top + rowHeight > el.scrollTop + height) {
      el.scrollTop = Math.max(0, top - height / 2);
      setScrollTop(el.scrollTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex]);

  const { first, last } = windowRange(scrollTop, height || maxHeight, rowHeight, items.length, overscan);
  const rows: React.ReactNode[] = [];
  for (let i = first; i < last; i++) {
    rows.push(
      <div
        key={getKey(items[i], i)}
        role="listitem"
        style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }}
      >
        {renderRow(items[i], i)}
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      className={`overflow-y-auto ${className}`}
      style={{ height, position: 'relative' }}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
      role="list"
      aria-label={ariaLabel}
      data-total-rows={items.length}
    >
      <div style={{ height: total, position: 'relative' }}>{rows}</div>
    </div>
  );
}
