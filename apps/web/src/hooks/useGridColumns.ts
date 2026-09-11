import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * useGridColumns — hook chuẩn hoá bề rộng cột cho toàn bộ bảng dữ liệu CIC-ERP.
 *
 * Khác biệt so với `useColumnResize` (bản cũ, vẫn giữ cho các bảng chưa migrate):
 *  1. Tự động co giãn (fit) tổng bề rộng các cột đúng bằng bề rộng khung chứa
 *     => hạn chế tối đa việc phải cuộn ngang mới xem hết nội dung.
 *  2. Khi kéo giãn 1 cột, phần chênh lệch được bù trừ sang các cột phía sau
 *     => tổng bề rộng giữ nguyên, bảng không bị phình ra ngoài khung.
 *  3. Ghi nhớ bề rộng theo `tableId` + user trong localStorage.
 */

export interface GridColumnSizing {
  key: string;
  /** Bề rộng mặc định (px) */
  defaultWidth: number;
  /** Bề rộng tối thiểu (px), mặc định 48 */
  minWidth?: number;
  /**
   * Trần bề rộng khi màn hình rộng (px). Bỏ trống => áp trần mặc định
   * cho cột KHÔNG khai báo `grow` (xem softMaxWidth), cột có `grow` thì
   * không giới hạn vì đó là cột chữ dùng để hút phần dư.
   */
  maxWidth?: number;
  /** Cột giữ nguyên bề rộng khi tự co giãn (STT, checkbox, nút thao tác) */
  fixed?: boolean;
  /** Trọng số ưu tiên giãn khi còn dư chỗ (mặc định 1) */
  grow?: number;
}

interface UseGridColumnsOptions {
  /** Khoá lưu localStorage — mỗi bảng một khoá riêng */
  tableId: string;
  userId?: string;
  columns: GridColumnSizing[];
  /** Khung cuộn của bảng — dùng để đo bề rộng khả dụng */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Bật/tắt chế độ tự co giãn vừa khung (mặc định bật) */
  autoFit?: boolean;
}

interface UseGridColumnsReturn {
  widths: Record<string, number>;
  totalWidth: number;
  containerWidth: number;
  isResizing: boolean;
  onResizeStart: (columnKey: string, e: React.MouseEvent) => void;
  resetWidths: () => void;
}

const DEFAULT_MIN_WIDTH = 48;

/**
 * Trần bề rộng của một cột khi màn hình rộng.
 * - Khai báo `maxWidth` => dùng đúng giá trị đó.
 * - Có `grow` (cột chữ: tên, nội dung, địa chỉ...) => không giới hạn, đây là
 *   nơi hút toàn bộ phần dư của màn hình lớn.
 * - Còn lại (mã số, ngày, trạng thái, số tiền...) => tối đa 1,5 lần bề rộng
 *   thiết kế, tránh cột ngắn bị kéo giãn tạo khoảng trắng vô nghĩa.
 */
function softMaxWidth(col: GridColumnSizing): number {
  if (typeof col.maxWidth === 'number') return col.maxWidth;
  if (typeof col.grow === 'number') return Number.POSITIVE_INFINITY;
  return Math.max(Math.round(col.defaultWidth * 1.5), col.defaultWidth + 56);
}

function getStorageKey(tableId: string, userId?: string): string {
  return `cic-grid-cols-${userId || 'anon'}-${tableId}`;
}

function buildDefaults(columns: GridColumnSizing[]): Record<string, number> {
  return Object.fromEntries(columns.map(c => [c.key, c.defaultWidth]));
}

function loadWidths(storageKey: string, columns: GridColumnSizing[]): Record<string, number> {
  const defaults = buildDefaults(columns);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Chỉ nhận giá trị hợp lệ; cột mới chưa có trong storage sẽ lấy mặc định
        const merged = { ...defaults };
        let hit = 0;
        for (const col of columns) {
          const v = (parsed as Record<string, unknown>)[col.key];
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            merged[col.key] = Math.max(v, col.minWidth ?? DEFAULT_MIN_WIDTH);
            hit++;
          }
        }
        if (hit > 0) return merged;
      }
    }
  } catch {
    // bỏ qua lỗi parse / localStorage bị chặn
  }
  return defaults;
}

function saveWidths(storageKey: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // localStorage đầy hoặc bị chặn — bỏ qua
  }
}

/**
 * Phân bổ lại bề rộng sao cho tổng đúng bằng `available`.
 * - Thừa chỗ: giãn các cột linh hoạt theo trọng số `grow`.
 * - Thiếu chỗ: thu hẹp dần các cột linh hoạt nhưng không nhỏ hơn `minWidth`.
 */
export function fitColumnWidths(
  base: Record<string, number>,
  columns: GridColumnSizing[],
  available: number,
): Record<string, number> {
  if (!available || available <= 0 || columns.length === 0) return base;

  const out: Record<string, number> = {};
  for (const col of columns) out[col.key] = base[col.key] ?? col.defaultWidth;

  const total = columns.reduce((sum, c) => sum + out[c.key], 0);
  const diff = Math.round(available - total);
  if (Math.abs(diff) < 2) return base;

  const flexible = columns.filter(c => !c.fixed);
  if (flexible.length === 0) return base;

  if (diff > 0) {
    // Chia phần dư theo kiểu "đổ nước": cột nào chạm trần thì dừng, phần thừa
    // dồn tiếp cho các cột còn chỗ.
    let remaining = diff;
    let pool = flexible.filter(c => out[c.key] < softMaxWidth(c));

    for (let pass = 0; pass < 6 && remaining > 0 && pool.length > 0; pass++) {
      const weights = pool.map(c => Math.max(0.0001, c.grow ?? 1));
      const sumWeight = weights.reduce((a, b) => a + b, 0);
      let used = 0;
      pool.forEach((col, i) => {
        const want = i === pool.length - 1
          ? remaining - used
          : Math.round((remaining * weights[i]) / sumWeight);
        const room = softMaxWidth(col) - out[col.key];
        const add = Math.max(0, Math.min(want, room));
        out[col.key] = out[col.key] + add;
        used += add;
      });
      if (used <= 0) break;
      remaining -= used;
      pool = pool.filter(c => out[c.key] < softMaxWidth(c));
    }

    // Mọi cột đã chạm trần mà vẫn dư: dồn hết vào cột chữ cuối cùng để bảng
    // vẫn vừa khít khung, không để lại khoảng hở bên phải.
    if (remaining > 0) {
      const sinks = flexible.filter(c => softMaxWidth(c) === Number.POSITIVE_INFINITY);
      const sink = (sinks.length > 0 ? sinks : flexible)[Math.max(0, (sinks.length > 0 ? sinks : flexible).length - 1)];
      if (sink) out[sink.key] = out[sink.key] + remaining;
    }
  } else {
    let need = -diff;
    for (let pass = 0; pass < 4 && need > 0; pass++) {
      const room = flexible.map(c => Math.max(0, out[c.key] - (c.minWidth ?? DEFAULT_MIN_WIDTH)));
      const totalRoom = room.reduce((a, b) => a + b, 0);
      if (totalRoom <= 0) break;
      const take = Math.min(need, totalRoom);
      let used = 0;
      flexible.forEach((col, i) => {
        if (room[i] <= 0 || used >= take) return;
        const share = Math.min(room[i], Math.round((take * room[i]) / totalRoom));
        const cut = Math.min(share, take - used);
        out[col.key] = out[col.key] - cut;
        used += cut;
      });
      if (used <= 0) break;
      need -= used;
    }
  }

  return out;
}

export function useGridColumns({
  tableId,
  userId,
  columns,
  containerRef,
  autoFit = true,
}: UseGridColumnsOptions): UseGridColumnsReturn {
  const storageKey = getStorageKey(tableId, userId);
  const columnsSig = useMemo(() => columns.map(c => `${c.key}:${c.defaultWidth}`).join('|'), [columns]);

  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(storageKey, columns));
  const [isResizing, setIsResizing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const widthsRef = useRef(widths);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  // Nạp lại khi đổi bảng / đổi người dùng / đổi cấu hình cột
  const initSigRef = useRef(`${storageKey}##${columnsSig}`);
  useEffect(() => {
    const sig = `${storageKey}##${columnsSig}`;
    if (initSigRef.current === sig) return;
    initSigRef.current = sig;
    setWidths(loadWidths(storageKey, columnsRef.current));
  }, [storageKey, columnsSig]);

  // ── Bắt khung cuộn kể cả khi nó mount muộn (bảng chỉ render sau khi tải
  //    xong dữ liệu). Effect không có mảng phụ thuộc => chạy sau mỗi lần
  //    render, chỉ setState khi phần tử thực sự đổi nên không gây vòng lặp. ──
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = containerRef?.current ?? null;
    setContainerEl(prev => (prev === el ? prev : el));
  });

  // ── Đo bề rộng khung chứa ─────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!containerEl) return;
    const measure = () => setContainerWidth(containerEl.clientWidth);
    measure();

    // Nghe thêm sự kiện resize/zoom của cửa sổ: ResizeObserver chỉ được giao
    // khi trang thực sự vẽ khung hình, nên có thể bỏ lỡ lúc tab bị ẩn hoặc khi
    // người dùng đổi mức zoom trình duyệt.
    window.addEventListener('resize', measure);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(containerEl);
    }

    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [containerEl]);

  // ── Tự co giãn vừa khung khi bề rộng khung / bộ cột thay đổi ──────────
  const lastFitRef = useRef<string>('');
  useEffect(() => {
    if (!autoFit || containerWidth <= 0) return;
    const sig = `${containerWidth}##${columnsSig}`;
    if (lastFitRef.current === sig) return;
    lastFitRef.current = sig;
    setWidths(prev => fitColumnWidths(prev, columnsRef.current, containerWidth));
  }, [autoFit, containerWidth, columnsSig]);

  // ── Kéo giãn cột (bù trừ sang các cột phía sau) ───────────────────────
  const onResizeStart = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const cols = columnsRef.current;
    const index = cols.findIndex(c => c.key === columnKey);
    if (index < 0) return;

    const target = cols[index];
    const targetMin = target.minWidth ?? DEFAULT_MIN_WIDTH;
    const startWidths: Record<string, number> = {};
    for (const col of cols) startWidths[col.key] = widthsRef.current[col.key] ?? col.defaultWidth;

    const followers = cols.slice(index + 1).filter(c => !c.fixed);
    const canCompensate = autoFit && followers.length > 0;
    const startX = e.clientX;

    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = { ...startWidths };
      let applied = Math.max(targetMin, startWidths[columnKey] + delta) - startWidths[columnKey];

      if (canCompensate) {
        if (applied > 0) {
          // Nới rộng cột hiện tại => lấy bớt chỗ của các cột phía sau
          const room = followers.map(c => Math.max(0, startWidths[c.key] - (c.minWidth ?? DEFAULT_MIN_WIDTH)));
          const totalRoom = room.reduce((a, b) => a + b, 0);
          const take = Math.min(applied, totalRoom);
          let used = 0;
          followers.forEach((col, i) => {
            if (room[i] <= 0 || used >= take) return;
            const share = Math.min(room[i], Math.round((take * room[i]) / totalRoom));
            const cut = Math.min(share, take - used);
            next[col.key] = startWidths[col.key] - cut;
            used += cut;
          });
          applied = used;
        } else if (applied < 0) {
          // Thu hẹp cột hiện tại => trả chỗ cho cột linh hoạt kế tiếp
          next[followers[0].key] = startWidths[followers[0].key] - applied;
        }
      }

      next[columnKey] = startWidths[columnKey] + applied;
      setWidths(next);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);
      saveWidths(storageKey, widthsRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [autoFit, storageKey]);

  const resetWidths = useCallback(() => {
    const defaults = buildDefaults(columnsRef.current);
    const fitted = autoFit && containerWidth > 0
      ? fitColumnWidths(defaults, columnsRef.current, containerWidth)
      : defaults;
    lastFitRef.current = `${containerWidth}##${columnsRef.current.map(c => `${c.key}:${c.defaultWidth}`).join('|')}`;
    setWidths(fitted);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // bỏ qua
    }
  }, [autoFit, containerWidth, storageKey]);

  const totalWidth = useMemo(
    () => columns.reduce((sum, c) => sum + (widths[c.key] ?? c.defaultWidth), 0),
    [columns, widths],
  );

  return { widths, totalWidth, containerWidth, isResizing, onResizeStart, resetWidths };
}

export default useGridColumns;
