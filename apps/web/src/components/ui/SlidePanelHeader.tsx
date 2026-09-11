"use client";

import React from 'react';
import { X } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { cn } from '@/lib/utils';

export interface SlidePanelHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  className?: string;
  closeTooltip?: string;
}

export const SlidePanelHeader: React.FC<SlidePanelHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
  onClose,
  className,
  closeTooltip = "Đóng panel (Esc)",
}) => {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-6 py-4 backdrop-blur-md z-20",
        // BẮT BUỘC chừa khoảng cách an toàn pr-16 để không bị nút X đè lên
        "pr-16",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h2>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {actions}
        </div>
      )}

      {/* Nút X đóng panel cố định ở góc trên bên phải */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30">
        <Tooltip content={closeTooltip} placement="bottom">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng panel"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default SlidePanelHeader;
