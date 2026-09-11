"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    placement?: 'top' | 'bottom';
    className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, placement = 'top', className = '' }) => {
    const [mounted, setMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    const [effectivePlacement, setEffectivePlacement] = useState<'top' | 'bottom'>(placement);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!content) {
        return <>{children}</>;
    }

    const handleMouseEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Nếu phần tử quá gần mép trên màn hình (< 85px), tự động chuyển sang placement 'bottom' để không bị che
            const isNearTop = rect.top < 85;
            const actualPlacement = isNearTop ? 'bottom' : placement;
            setEffectivePlacement(actualPlacement);

            if (actualPlacement === 'bottom') {
                setCoords({
                    top: rect.bottom,
                    left: Math.max(16, Math.min(window.innerWidth - 16, rect.left + rect.width / 2)),
                });
            } else {
                setCoords({
                    top: rect.top,
                    left: Math.max(16, Math.min(window.innerWidth - 16, rect.left + rect.width / 2)),
                });
            }
            setIsVisible(true);
        }
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
    };

    const transformStyle = effectivePlacement === 'bottom'
        ? 'translate(-50%, 8px)'
        : 'translate(-50%, calc(-100% - 8px))';

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={className ? className : 'inline-block max-w-full min-w-0 align-middle'}
            >
                {children}
            </div>
            {mounted && isVisible && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: coords.top,
                        left: coords.left,
                        transform: transformStyle,
                    }}
                >
                    {typeof content === 'string' ? (
                        <div className="bg-slate-900/95 dark:bg-slate-800/95 text-slate-100 text-xs font-medium leading-relaxed px-3 py-2 rounded-lg shadow-xl border border-slate-700/60 backdrop-blur-md max-w-xs break-words">
                            {content}
                        </div>
                    ) : (
                        <div className="bg-slate-900/95 dark:bg-slate-800/95 text-slate-100 text-xs font-medium leading-relaxed px-3 py-2 rounded-lg shadow-xl border border-slate-700/60 backdrop-blur-md max-w-xs break-words">
                            {content}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};

export default Tooltip;
