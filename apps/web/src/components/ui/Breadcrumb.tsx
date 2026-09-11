"use client";

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    showHome?: boolean;
    onHomeClick?: () => void;
    separator?: React.ReactNode;
    className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({
    items,
    showHome = true,
    onHomeClick,
    separator,
    className = '',
}) => {
    const allItems: BreadcrumbItem[] = showHome
        ? [{ label: 'Trang chủ', onClick: onHomeClick, icon: <Home size={14} />, href: undefined }, ...items]
        : items;

    return (
        <nav className={`flex items-center ${className}`} aria-label="Breadcrumb">
            <ol className="flex items-center flex-wrap gap-1">
                {allItems.map((item, index) => {
                    const isLast = index === allItems.length - 1;
                    const hasAction = item.onClick || item.href;

                    return (
                        <li key={index} className="flex items-center">
                            {hasAction && !isLast ? (
                                <button
                                    onClick={item.onClick}
                                    className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                                >
                                    {item.icon}
                                    {item.label}
                                </button>
                            ) : (
                                <span
                                    className={`flex items-center gap-1.5 text-sm font-medium ${isLast
                                        ? 'text-slate-800 dark:text-slate-100'
                                        : 'text-slate-500 dark:text-slate-400'
                                        }`}
                                >
                                    {item.icon}
                                    {item.label}
                                </span>
                            )}

                            {!isLast && (
                                <span className="mx-2 text-slate-300 dark:text-slate-600">
                                    {separator || <ChevronRight size={14} />}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export default Breadcrumb;
