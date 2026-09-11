"use client";

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export interface Column<T> {
    key: keyof T | string;
    header: string;
    width?: string;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    render?: (value: any, row: T, index: number) => React.ReactNode;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
    key: string;
    direction: SortDirection;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (row: T) => string;

    // Loading & Empty States
    isLoading?: boolean;
    emptyMessage?: string;
    emptyIcon?: React.ReactNode;

    // Sorting
    sortable?: boolean;
    defaultSort?: SortConfig;
    onSort?: (config: SortConfig) => void;

    // Pagination
    pagination?: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        pageSize: number;
        onPageChange: (page: number) => void;
    };

    // Selection
    selectable?: boolean;
    selectedKeys?: string[];
    onSelectionChange?: (keys: string[]) => void;

    // Row Actions
    onRowClick?: (row: T) => void;
    rowClassName?: (row: T) => string;

    // Styling
    compact?: boolean;
    stickyHeader?: boolean;
    className?: string;
}

function DataTable<T extends Record<string, any>>({
    data,
    columns,
    keyExtractor,
    isLoading = false,
    emptyMessage = 'Không có dữ liệu',
    emptyIcon,
    sortable = false,
    defaultSort,
    onSort,
    pagination,
    selectable = false,
    selectedKeys = [],
    onSelectionChange,
    onRowClick,
    rowClassName,
    compact = false,
    stickyHeader = true,
    className = '',
}: DataTableProps<T>) {
    const [sortConfig, setSortConfig] = useState<SortConfig>(defaultSort || { key: '', direction: null });

    const handleSort = (key: string) => {
        if (!sortable) return;

        let direction: SortDirection = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = null;
        }

        const newConfig = { key, direction };
        setSortConfig(newConfig);
        onSort?.(newConfig);
    };

    const sortedData = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction || onSort) return data;

        return [...data].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (aVal === bVal) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            const comparison = aVal < bVal ? -1 : 1;
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [data, sortConfig, onSort]);

    const handleSelectAll = () => {
        if (!onSelectionChange) return;

        if (selectedKeys.length === data.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(data.map(keyExtractor));
        }
    };

    const handleSelectRow = (key: string) => {
        if (!onSelectionChange) return;

        if (selectedKeys.includes(key)) {
            onSelectionChange(selectedKeys.filter(k => k !== key));
        } else {
            onSelectionChange([...selectedKeys, key]);
        }
    };

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) {
            return <ChevronsUpDown size={14} className="text-slate-400" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ChevronUp size={14} className="text-orange-500" />;
        }
        if (sortConfig.direction === 'desc') {
            return <ChevronDown size={14} className="text-orange-500" />;
        }
        return <ChevronsUpDown size={14} className="text-slate-400" />;
    };

    const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-3';
    const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3';

    return (
        <div className={`overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}>
            <div className="overflow-x-auto">
                <table className="w-full">
                    {/* Header */}
                    <thead className={stickyHeader ? 'cic-sticky-head' : 'bg-slate-50 dark:bg-slate-800'}>
                        <tr>
                            {selectable && (
                                <th className={`${headerPadding} w-12`}>
                                    <input
                                        type="checkbox"
                                        checked={selectedKeys.length === data.length && data.length > 0}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500"
                                    />
                                </th>
                            )}
                            {columns.map((col) => (
                                <th
                                    key={String(col.key)}
                                    onClick={() => col.sortable && handleSort(String(col.key))}
                                    style={{ width: col.width }}
                                    className={`
                    ${headerPadding}
                    text-left text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider
                    ${col.sortable ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none transition-colors' : ''}
                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                  `}
                                >
                                    <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''}`}>
                                        {col.header}
                                        {col.sortable && getSortIcon(String(col.key))}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody className="bg-white dark:bg-slate-900">
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12">
                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                        <span className="text-sm">Đang tải...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : sortedData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12">
                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                        {emptyIcon && <div className="mb-3">{emptyIcon}</div>}
                                        <span className="text-sm">{emptyMessage}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            sortedData.map((row, index) => {
                                const key = keyExtractor(row);
                                const isSelected = selectedKeys.includes(key);

                                return (
                                    <tr
                                        key={key}
                                        onClick={() => onRowClick?.(row)}
                                        className={`
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${isSelected ? 'bg-orange-50 dark:bg-orange-900/20' : `hover:bg-orange-50/30 dark:hover:bg-slate-800 ${index % 2 !== 0 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'}`}
                      border-b border-slate-100 dark:border-slate-800 last:border-b-0
                      transition-colors
                      ${rowClassName?.(row) || ''}
                    `}
                                    >
                                        {selectable && (
                                            <td className={`${cellPadding} w-12`} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectRow(key)}
                                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500"
                                                />
                                            </td>
                                        )}
                                        {columns.map((col) => {
                                            const value = row[col.key as keyof T];
                                            return (
                                                <td
                                                    key={String(col.key)}
                                                    data-tooltip-auto="true"
                                                    className={`
                            ${cellPadding}
                            text-sm text-slate-700 dark:text-slate-300
                            ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}
                          `}
                                                >
                                                    {col.render ? (
                                                        col.render(value, row, index)
                                                    ) : (
                                                        <div className="truncate max-w-md">{String(value ?? '')}</div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination && !isLoading && sortedData.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Hiển thị {((pagination.currentPage - 1) * pagination.pageSize) + 1} - {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} / {pagination.totalItems} kết quả
                    </p>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
                            disabled={pagination.currentPage <= 1}
                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft size={16} className="text-slate-600 dark:text-slate-300" />
                        </button>

                        {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                            let pageNum: number;
                            if (pagination.totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (pagination.currentPage <= 3) {
                                pageNum = i + 1;
                            } else if (pagination.currentPage >= pagination.totalPages - 2) {
                                pageNum = pagination.totalPages - 4 + i;
                            } else {
                                pageNum = pagination.currentPage - 2 + i;
                            }

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => pagination.onPageChange(pageNum)}
                                    className={`
                    w-8 h-8 rounded-lg text-sm font-medium transition-colors
                    ${pagination.currentPage === pageNum
                                            ? 'bg-orange-500 text-white'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }
                  `}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}

                        <button
                            onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
                            disabled={pagination.currentPage >= pagination.totalPages}
                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight size={16} className="text-slate-600 dark:text-slate-300" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DataTable;
