"use client";

/**
 * PageSkeletons - Các component Skeleton chuyên nghiệp cho từng loại trang
 * Thay thế spinner "Đang tải..." bằng hiệu ứng shimmer mượt mà
 */

import React from 'react';
import { Skeleton } from './Skeleton';

// ============================================
// DASHBOARD SKELETON
// ============================================
export const DashboardSkeleton: React.FC = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-7 w-32 mb-2" />
                    <Skeleton className="h-2 w-16" />
                </div>
            ))}
        </div>

        {/* Chart Area */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-5 w-40" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-20 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
            </div>
            <div className="flex items-end gap-3 h-48">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="flex-1 rounded-t-md"
                        style={{ height: `${30 + Math.random() * 70}%` }}
                    />
                ))}
            </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Contracts */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
                <Skeleton className="h-5 w-36 mb-4" />
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="flex-1">
                                <Skeleton className="h-3.5 w-full mb-1.5" />
                                <Skeleton className="h-2.5 w-2/3" />
                            </div>
                            <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Insights */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
                <Skeleton className="h-5 w-28 mb-4" />
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                            <Skeleton className="h-3.5 w-32 mb-2" />
                            <Skeleton className="h-2.5 w-full mb-1" />
                            <Skeleton className="h-2.5 w-4/5" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

// ============================================
// LIST PAGE SKELETON (Contracts, Personnel, etc.)
// ============================================
export const ListPageSkeleton: React.FC = () => (
    <div className="space-y-4 animate-in fade-in duration-300">
        {/* Header + Filters */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-2">
                <Skeleton className="h-9 w-64 rounded-lg" />
                <Skeleton className="h-9 w-24 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <Skeleton className="h-2.5 w-16 mb-2" />
                    <Skeleton className="h-5 w-24" />
                </div>
            ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-6 gap-4 p-4 border-b border-slate-100 dark:border-slate-800">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 w-full" />
                ))}
            </div>
            {/* Table Rows */}
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-6 gap-4 p-4 border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3.5 w-20" />
                </div>
            ))}
        </div>
    </div>
);

// ============================================
// DETAIL PAGE SKELETON (Contract Detail, etc.)
// ============================================
export const DetailPageSkeleton: React.FC = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
        {/* Back button + Title */}
        <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div>
                <Skeleton className="h-6 w-64 mb-1.5" />
                <Skeleton className="h-3 w-32" />
            </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
                    <Skeleton className="h-3 w-20 mb-3" />
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-2.5 w-full" />
                </div>
            ))}
        </div>

        {/* Tabs Skeleton */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-lg" />
                ))}
            </div>
            <div className="p-6 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 flex-1" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

// ============================================
// FORM PAGE SKELETON
// ============================================
export const FormPageSkeleton: React.FC = () => (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 dark:bg-slate-950 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 w-full max-w-4xl shadow-2xl space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i}>
                        <Skeleton className="h-3 w-20 mb-2" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Skeleton className="h-10 w-24 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
        </div>
    </div>
);

// ============================================
// ANALYTICS SKELETON
// ============================================
export const AnalyticsSkeleton: React.FC = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <div className="flex gap-2">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
                    <Skeleton className="h-4 w-32 mb-4" />
                    <Skeleton className="h-52 w-full rounded-xl" />
                </div>
            ))}
        </div>
    </div>
);
