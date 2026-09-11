"use client";

import React, { useState, useCallback } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';
import Button from './button';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string | React.ReactNode;
    variant?: ConfirmDialogVariant;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
}

const variantConfig: Record<ConfirmDialogVariant, {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    buttonVariant: 'danger' | 'primary' | 'success';
}> = {
    danger: {
        icon: <AlertTriangle size={24} />,
        iconBg: 'bg-red-100 dark:bg-red-900/30',
        iconColor: 'text-red-600 dark:text-red-400',
        buttonVariant: 'danger',
    },
    warning: {
        icon: <AlertTriangle size={24} />,
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
        iconColor: 'text-amber-600 dark:text-amber-400',
        buttonVariant: 'primary',
    },
    info: {
        icon: <Info size={24} />,
        iconBg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600 dark:text-blue-400',
        buttonVariant: 'primary',
    },
    success: {
        icon: <CheckCircle size={24} />,
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        buttonVariant: 'success',
    },
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    variant = 'danger',
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    isLoading = false,
}) => {
    if (!isOpen) return null;

    const config = variantConfig[variant];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Dialog */}
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-2xl animate-fade-in">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="p-6">
                    {/* Icon */}
                    <div className="flex justify-center mb-4">
                        <div className={`w-14 h-14 rounded-full ${config.iconBg} ${config.iconColor} flex items-center justify-center`}>
                            {config.icon}
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <div className="text-sm text-center text-slate-600 dark:text-slate-300 mb-6">
                        {message}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            fullWidth
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            {cancelText}
                        </Button>
                        <Button
                            variant={config.buttonVariant}
                            fullWidth
                            onClick={onConfirm}
                            isLoading={isLoading}
                        >
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;

// Hook for easier usage
interface UseConfirmDialogState {
    isOpen: boolean;
    variant: ConfirmDialogVariant;
    title: string;
    message: string;
    onConfirm: () => void;
}

export const useConfirmDialog = () => {
    const [state, setState] = useState<UseConfirmDialogState>({
        isOpen: false,
        variant: 'danger',
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const confirm = useCallback((options: {
        variant?: ConfirmDialogVariant;
        title: string;
        message: string;
    }) => {
        return new Promise<boolean>((resolve) => {
            setState({
                isOpen: true,
                variant: options.variant || 'danger',
                title: options.title,
                message: options.message,
                onConfirm: () => {
                    setState(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
            });
        });
    }, []);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, isOpen: false }));
    }, []);

    return {
        ...state,
        confirm,
        close,
    };
};
