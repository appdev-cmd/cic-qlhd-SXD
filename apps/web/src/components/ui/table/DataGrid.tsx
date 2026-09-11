"use client";

import React, { forwardRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GridColumnSizing } from '@/hooks/useGridColumns';

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  UNIVERSAL DATA GRID — bộ primitive chuẩn hoá 100% bảng dữ liệu CIC-ERP
 * ══════════════════════════════════════════════════════════════════════════
 *  Quy chuẩn được bảo đảm bởi bộ component này:
 *   • Header dính (sticky) + cùng một style nền/chữ/viền ở mọi bảng.
 *   • Tiêu đề cột TỰ XUỐNG DÒNG khi dài (không cắt cụt bằng "...").
 *   • Nút sắp xếp CHỈ HIỆN khi rê chuột vào ô tiêu đề (hoặc đang sắp xếp).
 *   • Rãnh kéo giãn cột (splitter) CHỈ HIỆN khi rê chuột vào ô tiêu đề.
 *   • Cột chữ tự xuống dòng — cột số/tiền/ngày không bao giờ xuống dòng.
 *   • Bề rộng cột tự co vừa khung chứa (xem hooks/useGridColumns.ts).
 */

export type GridAlign = 'left' | 'center' | 'right';

export interface GridColumn extends GridColumnSizing {
  /** Nhãn hiển thị trên header */
  label?: React.ReactNode;
  align?: GridAlign;
  /** Có giá trị => cột cho phép bấm để sắp xếp */
  sortKey?: string;
  /** true = nội dung số/tiền/ngày => không xuống dòng, căn phải */
  numeric?: boolean;
  /** Class bổ sung cho ô tiêu đề (thường dùng để đổi màu chữ) */
  headerClassName?: string;
  /** Class bổ sung cho ô dữ liệu */
  cellClassName?: string;
  /** Cho phép kéo giãn (mặc định true) */
  resizable?: boolean;
}

export type GridSortDir = 'asc' | 'desc' | null;

/* ─────────────────────────────────────────────────────────────────────────
   Khung cuộn — mọi bảng dùng chung một kiểu khung, viền, bo góc và cuộn
   ───────────────────────────────────────────────────────────────────────── */

interface GridScrollerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Đang kéo giãn cột => khoá bôi đen văn bản */
  isResizing?: boolean;
  /**
   * true = khung bảng chiếm trọn chiều cao khung cha và tự cuộn bên trong.
   * CHỈ dùng cho layout full-screen (trang CRM: cả shell cố định, trang không
   * cuộn được). Mặc định false: bảng dài tự nhiên theo lượng dữ liệu và cuộn
   * cùng với trang.
   */
  fill?: boolean;
  /**
   * Giới hạn chiều cao khung bảng (bảng tự cuộn bên trong). CHỈ dùng cho bảng
   * phụ nằm trong Modal / Slide Panel / tab con. TUYỆT ĐỐI không dùng cho bảng
   * danh sách chính của trang — bảng đó phải dài tự nhiên theo dữ liệu.
   */
  maxHeight?: string;
  /** Bỏ viền + bo góc (khi bảng nằm trong Slide Panel / thẻ đã có viền) */
  bare?: boolean;
}

export const GridScroller = forwardRef<HTMLDivElement, GridScrollerProps>(function GridScroller(
  { isResizing, fill = false, maxHeight, bare = false, className, style, children, ...rest },
  ref,
) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [needsScrollX, setNeedsScrollX] = React.useState(false);
  const flagRef = React.useRef(false);

  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  // Chỉ bật cuộn ngang khi bảng thực sự rộng hơn khung. Ở chế độ mặc định khung
  // để `overflow: visible` nên hàng tiêu đề dính được theo trang (sticky), còn
  // khi buộc phải cuộn ngang thì khung mới trở thành vùng cuộn.
  // Đo xem bảng có rộng hơn khung không. Chạy sau MỖI lần render (đồng bộ với
  // lúc useGridColumns tự co bề rộng cột) nên không phụ thuộc vào thời điểm
  // ResizeObserver / requestAnimationFrame được giao.
  const measureRef = React.useRef<() => void>(() => {});
  measureRef.current = () => {
    if (fill || maxHeight) return;
    const el = innerRef.current;
    if (!el) return;
    const table = el.querySelector('table');
    const tableWidth = table ? table.getBoundingClientRect().width : 0;
    const next = tableWidth > el.clientWidth + 1;
    if (next !== flagRef.current) {
      flagRef.current = next;
      setNeedsScrollX(next);
    }
  };

  React.useLayoutEffect(() => {
    measureRef.current();
  });

  // Theo dõi thêm thay đổi kích thước khung / cửa sổ (đổi cỡ, zoom, thu sidebar)
  React.useEffect(() => {
    if (fill || maxHeight) return;
    const el = innerRef.current;
    if (!el) return;
    const onChange = () => measureRef.current();
    window.addEventListener('resize', onChange);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onChange);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', onChange);
      ro?.disconnect();
    };
  }, [fill, maxHeight]);

  return (
    <div
      ref={setRefs}
      data-no-tooltip
      data-fill={fill ? 'true' : undefined}
      data-bounded={!fill && maxHeight ? 'true' : undefined}
      data-overflow-x={!fill && !maxHeight && needsScrollX ? 'true' : undefined}
      className={cn(
        'cic-grid-scroll no-auto-tooltip',
        !bare && 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm',
        fill && 'flex-1 min-h-0 h-full',
        isResizing && 'select-none cursor-col-resize',
        className,
      )}
      style={maxHeight ? { maxHeight, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   Bảng + colgroup
   ───────────────────────────────────────────────────────────────────────── */

interface GridTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Tổng bề rộng các cột (px) — lấy từ useGridColumns */
  totalWidth?: number;
}

export function GridTable({ totalWidth, className, style, children, ...rest }: GridTableProps) {
  return (
    <table
      data-no-tooltip
      className={cn('cic-grid-table no-auto-tooltip', className)}
      style={{ width: totalWidth || '100%', minWidth: '100%', ...style }}
      {...rest}
    >
      {children}
    </table>
  );
}

export function GridColgroup({
  columns,
  widths,
}: {
  columns: GridColumn[];
  widths: Record<string, number>;
}) {
  return (
    <colgroup>
      {columns.map(col => (
        <col key={col.key} style={{ width: widths[col.key] ?? col.defaultWidth }} />
      ))}
    </colgroup>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Header
   ───────────────────────────────────────────────────────────────────────── */

export function GridHead({ className, children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('cic-grid-head', className)} {...rest}>
      {children}
    </thead>
  );
}

export function GridBody({ className, children, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('cic-grid-body', className)} {...rest}>
      {children}
    </tbody>
  );
}

const ALIGN_TEXT: Record<GridAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

interface GridThProps {
  col: GridColumn;
  width?: number;
  /** Khoá đang được sắp xếp hiện tại */
  activeSortKey?: string | null;
  sortDir?: GridSortDir;
  onSort?: (sortKey: string) => void;
  onResizeStart?: (columnKey: string, e: React.MouseEvent) => void;
  /** Ẩn rãnh kéo giãn (thường dùng cho cột cuối cùng) */
  hideResizer?: boolean;
  className?: string;
  /** Nội dung header tuỳ biến (checkbox, icon…) thay cho `col.label` */
  children?: React.ReactNode;
}

export function GridTh({
  col,
  width,
  activeSortKey,
  sortDir,
  onSort,
  onResizeStart,
  hideResizer = false,
  className,
  children,
}: GridThProps) {
  // Tiêu đề cột LUÔN căn giữa (quy chuẩn chung), phần thân ô mới theo `align`
  const sortable = Boolean(col.sortKey && onSort);
  const isActive = Boolean(col.sortKey && activeSortKey === col.sortKey && sortDir);
  const showResizer = !hideResizer && col.resizable !== false && Boolean(onResizeStart);

  return (
    <th
      scope="col"
      style={{ width, minWidth: col.minWidth }}
      className={cn(
        'cic-grid-th text-center text-slate-600 dark:text-slate-300',
        col.headerClassName,
        className,
      )}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1',
          sortable && 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors',
        )}
        onClick={sortable ? () => onSort?.(col.sortKey as string) : undefined}
      >
        {children ?? <span className="cic-grid-th-label">{col.label}</span>}
        {sortable && (
          <span className={cn('cic-grid-sort', isActive && 'is-active')}>
            {isActive
              ? sortDir === 'asc'
                ? <ArrowUp size={12} />
                : <ArrowDown size={12} />
              : <ArrowUpDown size={12} />}
          </span>
        )}
      </div>

      {showResizer && (
        <span
          role="separator"
          aria-orientation="vertical"
          className="cic-grid-resizer"
          onMouseDown={e => onResizeStart?.(col.key, e)}
          onClick={e => e.stopPropagation()}
        />
      )}
    </th>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Ô dữ liệu — helper class dùng chung cho <td>
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Sinh class chuẩn cho ô dữ liệu theo cấu hình cột:
 *  - cột số  => không xuống dòng, căn phải, tabular-nums
 *  - cột chữ => tự xuống dòng khi dài
 */
export function gridCellClass(col: GridColumn, extra?: string): string {
  const align: GridAlign = col.align ?? (col.numeric ? 'right' : 'left');
  return cn(
    'cic-grid-cell',
    col.numeric ? 'cic-grid-cell--num' : align === 'center' ? 'cic-grid-cell--center' : 'cic-grid-cell--text',
    ALIGN_TEXT[align],
    col.cellClassName,
    extra,
  );
}

/** Class ô chữ (tự xuống dòng) — dùng khi không có object cột */
export const GRID_CELL_TEXT = 'cic-grid-cell cic-grid-cell--text';
/** Class ô số/tiền/ngày (không xuống dòng, căn phải) */
export const GRID_CELL_NUM = 'cic-grid-cell cic-grid-cell--num';
/** Class ô căn giữa (STT, icon, trạng thái) */
export const GRID_CELL_CENTER = 'cic-grid-cell cic-grid-cell--center';

/* ─────────────────────────────────────────────────────────────────────────
   Số thứ tự (STT)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Định dạng STT chuẩn toàn hệ thống: luôn tối thiểu 2 chữ số — 01, 02, … 10, 99, 100.
 * Truyền vào số thứ tự bắt đầu từ 1 (thường là `index + 1`).
 */
export function formatStt(order: number): string {
  return String(order).padStart(2, '0');
}

/* ─────────────────────────────────────────────────────────────────────────
   Dòng trạng thái: đang tải / rỗng
   ───────────────────────────────────────────────────────────────────────── */

export function GridStateRow({
  colSpan,
  children,
  className,
}: {
  colSpan: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn('px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400', className)}
      >
        {children}
      </td>
    </tr>
  );
}

export default {
  GridScroller,
  GridTable,
  GridColgroup,
  GridHead,
  GridBody,
  GridTh,
  GridStateRow,
};
