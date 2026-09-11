"use client";

import React from 'react';

/**
 * ResponsiveTable — bảng dữ liệu thích ứng cho CIC ERP.
 *
 * Định hướng mobile (xem [plans/mobile-responsive-plan.md]):
 *   • ≥ md (768px): render <table> đầy đủ, cuộn ngang khi cần (overflow-x-auto).
 *   • < md: render danh sách CARD — mỗi hàng là 1 card dễ chạm, chỉ hiện
 *     các cột được đánh dấu (mặc định: tất cả; có thể ẩn bớt bằng `hideOnMobile`).
 *
 * Dùng làm component dùng chung để nhân rộng pattern "bảng ↔ card" (vốn mới chỉ
 * có ở ContractList) ra toàn bộ trang danh sách. Style khớp design token slate.
 *
 * @example
 * <ResponsiveTable
 *   data={payments}
 *   rowKey={(p) => p.id}
 *   onRowClick={(p) => openDetail(p.id)}
 *   columns={[
 *     { key: 'code', header: 'Mã', cell: (p) => p.code, primary: true },
 *     { key: 'amount', header: 'Số tiền', align: 'right', cell: (p) => formatVND(p.amount) },
 *     { key: 'status', header: 'Trạng thái', cell: (p) => <Badge>{p.status}</Badge>, mobileLabel: 'TT' },
 *     { key: 'note', header: 'Ghi chú', cell: (p) => p.note, hideOnMobile: true },
 *   ]}
 * />
 */

export interface ResponsiveColumn<T> {
    /** Khoá duy nhất của cột (dùng cho React key). */
    key: string;
    /** Tiêu đề cột (header bảng). */
    header: React.ReactNode;
    /** Nội dung ô — nhận row + index, trả JSX/string. */
    cell: (row: T, index: number) => React.ReactNode;
    /** Căn lề nội dung (mặc định 'left'). */
    align?: 'left' | 'center' | 'right';
    /** Class thêm cho <td>/<th> của cột (vd width). */
    className?: string;
    /**
     * Cột "chính" trên mobile — hiện nổi bật ở đầu card (tiêu đề card),
     * không kèm nhãn. Thường là mã/tên. Nên đánh dấu đúng 1 cột.
     */
    primary?: boolean;
    /** Ẩn cột này trong card mobile (vẫn hiện ở bảng desktop). */
    hideOnMobile?: boolean;
    /** Nhãn hiển thị cạnh giá trị trong card mobile (mặc định = header). */
    mobileLabel?: React.ReactNode;
}

export interface ResponsiveTableProps<T> {
    data: T[];
    columns: ResponsiveColumn<T>[];
    /** Khoá React cho mỗi hàng. */
    rowKey: (row: T, index: number) => string | number;
    /** Bấm vào hàng/card (vd mở chi tiết). */
    onRowClick?: (row: T, index: number) => void;
    /** Đang tải → hiện skeleton. */
    loading?: boolean;
    /** Số dòng skeleton khi loading (mặc định 5). */
    skeletonRows?: number;
    /** Nội dung khi rỗng (mặc định "Không có dữ liệu"). */
    emptyMessage?: React.ReactNode;
    /** Override render card mobile cho toàn quyền tuỳ biến. */
    renderMobileCard?: (row: T, index: number) => React.ReactNode;
    /** Class cho khung bảng desktop. */
    className?: string;
    /** Class cho khung danh sách card mobile. */
    mobileClassName?: string;
}

const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

export function ResponsiveTable<T>({
    data,
    columns,
    rowKey,
    onRowClick,
    loading = false,
    skeletonRows = 5,
    emptyMessage = 'Không có dữ liệu',
    renderMobileCard,
    className = '',
    mobileClassName = '',
}: ResponsiveTableProps<T>) {
    const mobileColumns = columns.filter(c => !c.hideOnMobile);
    const primaryCol = mobileColumns.find(c => c.primary);
    const detailCols = mobileColumns.filter(c => !c.primary);

    /** Card mobile mặc định: tiêu đề là cột primary, còn lại là cặp nhãn–giá trị. */
    const defaultMobileCard = (row: T, index: number) => (
        <div
            key={rowKey(row, index)}
            onClick={onRowClick ? () => onRowClick(row, index) : undefined}
            className={`bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors ${
                onRowClick ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800' : ''
            }`}
        >
            {primaryCol && (
                <div className="font-bold text-slate-900 dark:text-slate-100 mb-2 break-words">
                    {primaryCol.cell(row, index)}
                </div>
            )}
            <div className="space-y-1.5">
                {detailCols.map(col => (
                    <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
                            {col.mobileLabel ?? col.header}
                        </span>
                        <span className={`text-slate-700 dark:text-slate-200 min-w-0 break-words ${alignClass(col.align)}`}>
                            {col.cell(row, index)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <>
            {/* ── Desktop: bảng đầy đủ (≥ md) ── */}
            <div className={`hidden md:block bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto ${className}`}>
                <table className="w-full text-left text-sm">
                    <thead className="cic-sticky-head">
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    className={`sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 ${alignClass(col.align)} ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                        {loading ? (
                            Array.from({ length: skeletonRows }).map((_, i) => (
                                <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                                    {columns.map(col => (
                                        <td key={col.key} className="px-3 py-4">
                                            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            data.map((row, index) => (
                                <tr
                                    key={rowKey(row, index)}
                                    onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                                    className={`border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors ${
                                        onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''
                                    }`}
                                >
                                    {columns.map(col => (
                                        <td key={col.key} data-tooltip-auto="true" className={`px-3 py-3 ${alignClass(col.align)} ${col.className || ''}`}>
                                            {col.cell(row, index)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Mobile: danh sách card (< md) ── */}
            <div className={`md:hidden space-y-3 ${mobileClassName}`}>
                {loading ? (
                    Array.from({ length: Math.min(3, skeletonRows) }).map((_, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse h-[140px]" />
                    ))
                ) : data.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-8 text-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 shadow-sm">
                        {emptyMessage}
                    </div>
                ) : (
                    data.map((row, index) =>
                        renderMobileCard
                            ? <React.Fragment key={rowKey(row, index)}>{renderMobileCard(row, index)}</React.Fragment>
                            : defaultMobileCard(row, index)
                    )
                )}
            </div>
        </>
    );
}

export default ResponsiveTable;
