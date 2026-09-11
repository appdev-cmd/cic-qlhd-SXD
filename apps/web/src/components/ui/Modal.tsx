"use client";

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    fullHeight?: boolean;
    children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    size = 'md',
    fullHeight = false,
    children
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Quản lý trạng thái mở modal trên body & phím Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape, { capture: true });
            document.body.style.overflow = 'hidden';
            document.body.classList.add('modal-open');
            document.body.setAttribute('data-modal-open', 'true');
        }
        return () => {
            document.removeEventListener('keydown', handleEscape, { capture: true });
            document.body.style.overflow = 'unset';
            document.body.classList.remove('modal-open');
            document.body.removeAttribute('data-modal-open');
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        '2xl': 'max-w-6xl',
        '3xl': 'max-w-7xl',
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-1 sm:p-2"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/50 backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
            />

            {/* Modal Content */}
            <div
                ref={modalRef}
                onClick={(e) => e.stopPropagation()}
                className={`relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] ${sizeClasses[size]} w-full ${
                    fullHeight ? 'h-[98vh] max-h-[98vh]' : 'max-h-[90vh]'
                } flex flex-col animate-in fade-in zoom-in-95 duration-200 dark:ring-1 dark:ring-slate-700/40`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 truncate pr-4">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={`flex-1 ${fullHeight ? 'overflow-hidden flex flex-col p-2.5 sm:p-3' : 'overflow-y-auto px-6 py-5'}`}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
