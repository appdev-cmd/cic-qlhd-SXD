import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  delay?: number;
  anchor?: Element | null;
}

export function Tooltip({ content, children, placement = 'top', className, delay = 200, anchor }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setCoords({ top: placement === 'bottom' ? rect.bottom + 8 : rect.top - 8, left: rect.left + rect.width / 2 });
    setIsVisible(true);
    return () => setIsVisible(false);
  }, [anchor, placement]);

  const showTooltip = () => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        let top = 0;
        let left = 0;

        switch (placement) {
          case 'top':
            top = rect.top - 8;
            left = rect.left + rect.width / 2;
            break;
          case 'bottom':
            top = rect.bottom + 8;
            left = rect.left + rect.width / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2;
            left = rect.left - 8;
            break;
          case 'right':
            top = rect.top + rect.height / 2;
            left = rect.right + 8;
            break;
        }

        setCoords({ top, left });
        setIsVisible(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  const tooltipPortal =
    isVisible && typeof document !== 'undefined'
      ? createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform:
                placement === 'top'
                  ? 'translate(-50%, -100%)'
                  : placement === 'bottom'
                    ? 'translate(-50%, 0)'
                    : placement === 'left'
                      ? 'translate(-100%, -50%)'
                      : 'translate(0, -50%)',
            }}
            className={cn(
              'z-[9999] max-w-xs px-2.5 py-1.5 text-xs text-slate-100 font-medium rounded-lg',
              'bg-slate-900/95 dark:bg-slate-800/95 shadow-xl border border-slate-700/60 backdrop-blur-md',
              'pointer-events-none animate-fade-in transition-all',
              className,
            )}
          >
            {content}
          </div>,
          document.getElementById('tooltip-root') || document.body,
        )
      : null;

  if (anchor) return tooltipPortal;
  return (
    <div
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className="inline-block"
    >
      {children}
      {tooltipPortal}
    </div>
  );
}
