
"use client";

import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    retryLabel?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
    title = "Đã xảy ra lỗi",
    message = "Không thể tải dữ liệu. Vui lòng thử lại sau.",
    onRetry,
    retryLabel = "Thử lại"
}) => {
    return (
        <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} />
            </div>
            <h3 className="text-lg font-black text-rose-700 dark:text-rose-400 mb-2">
                {title}
            </h3>
            <p className="text-sm font-medium text-rose-600/80 dark:text-rose-400/80 max-w-xs mb-6">
                {message}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition-colors shadow-lg shadow-rose-200 dark:shadow-none"
                >
                    <RefreshCcw size={16} />
                    {retryLabel}
                </button>
            )}
        </div>
    );
};

export default ErrorState;
