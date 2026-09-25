import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  className?: string;
  /** Class cho phần tử bao ngoài (mặc định inline-block). Dùng "block" / "flex" khi cần chiếm trọn chiều ngang. */
  triggerClassName?: string;
  delay?: number;
}

const TRANSFORMS: Record<TooltipPlacement, string> = {
  top: 'translate(-50%, -100%)',
  bottom: 'translate(-50%, 0)',
  left: 'translate(-100%, -50%)',
  right: 'translate(0, -50%)',
};

export function computeTooltipCoords(rect: DOMRect, placement: TooltipPlacement) {
  switch (placement) {
    case 'bottom':
      return { top: rect.bottom + 8, left: rect.left + rect.width / 2 };
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - 8 };
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + 8 };
    default:
      return { top: rect.top - 8, left: rect.left + rect.width / 2 };
  }
}

/** Bong bóng tooltip Dark Glassmorphism, render qua Portal ở lớp z-[9999]. */
export function TooltipBubble({
  content,
  top,
  left,
  placement,
  className,
}: {
  content: React.ReactNode;
  top: number;
  left: number;
  placement: TooltipPlacement;
  className?: string;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="tooltip"
      style={{ position: 'fixed', top: `${top}px`, left: `${left}px`, transform: TRANSFORMS[placement] }}
      className={cn(
        'z-[9999] max-w-xs px-2.5 py-1.5 text-xs text-slate-100 font-medium rounded-lg whitespace-pre-line break-words',
        'bg-slate-900/95 dark:bg-slate-800/95 shadow-xl border border-slate-700/60 backdrop-blur-md',
        'pointer-events-none animate-fade-in transition-all',
        className
      )}
    >
      {content}
    </div>,
    document.getElementById('tooltip-root') || document.body
  );
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  className,
  triggerClassName = 'inline-block',
  delay = 200,
}: TooltipProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = () => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        setCoords(computeTooltipCoords(triggerRef.current.getBoundingClientRect(), placement));
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCoords(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className={triggerClassName}
      data-has-tooltip=""
    >
      {children}
      {coords && (
        <TooltipBubble content={content} top={coords.top} left={coords.left} placement={placement} className={className} />
      )}
    </div>
  );
}
