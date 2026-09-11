"use client";

import React from 'react';
import { FileX, Search, Users, Package, FileText, AlertCircle } from 'lucide-react';
import Button from './button';

export type EmptyStateType = 'no-data' | 'no-results' | 'no-access' | 'error' | 'custom';

interface EmptyStateProps {
    type?: EmptyStateType;
    title?: string;
    message?: string;
    icon?: React.ReactNode;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

const defaultConfigs: Record<EmptyStateType, { icon: React.ReactNode; title: string; message: string }> = {
    'no-data': {
        icon: <FileText size={48} />,
        title: 'Chưa có dữ liệu',
        message: 'Bắt đầu bằng cách tạo mục đầu tiên',
    },
    'no-results': {
        icon: <Search size={48} />,
        title: 'Không tìm thấy kết quả',
        message: 'Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc',
    },
    'no-access': {
        icon: <Users size={48} />,
        title: 'Không có quyền truy cập',
        message: 'Bạn không có quyền xem nội dung này',
    },
    'error': {
        icon: <AlertCircle size={48} />,
        title: 'Đã xảy ra lỗi',
        message: 'Vui lòng thử lại sau hoặc liên hệ quản trị viên',
    },
    'custom': {
        icon: <FileX size={48} />,
        title: 'Không có dữ liệu',
        message: '',
    },
};

const EmptyState: React.FC<EmptyStateProps> = ({
    type = 'no-data',
    title,
    message,
    icon,
    action,
    className = '',
}) => {
    const config = defaultConfigs[type];

    return (
        <div className={`flex flex-col items-center justify-center py-12 px-4 animate-in fade-in zoom-in-95 duration-300 ${className}`}>
            {/* Icon */}
            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4 animate-bounce-slow">
                {icon || config.icon}
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">
                {title || config.title}
            </h3>

            {/* Message */}
            {(message || config.message) && (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">
                    {message || config.message}
                </p>
            )}

            {/* Action Button */}
            {action && (
                <Button
                    variant="primary"
                    size="md"
                    onClick={action.onClick}
                    className="mt-6"
                >
                    {action.label}
                </Button>
            )}
        </div>
    );
};

export default EmptyState;
