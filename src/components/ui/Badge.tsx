import React from 'react';
import { cn } from '../../lib/utils';

// ========================================
// BADGE — ported from cic-hud Design System v2.2
// Simple label chip; use StatusBadge for status/SLA badges.
// ========================================

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral' | 'outline';

export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-200',
  success: 'bg-success-50 text-success-700 dark:bg-success-900 dark:text-success-200',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-900 dark:text-warning-200',
  danger: 'bg-danger-50 text-danger-700 dark:bg-danger-900 dark:text-danger-200',
  info: 'bg-info-50 text-info-700 dark:bg-info-900 dark:text-info-200',
  outline: 'bg-transparent border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300',
};

// Project type scale floors at 10px (text-2xs), so xs no longer drops to 9px as in cic-hud.
const sizeStyles: Record<BadgeSize, string> = {
  xs: 'text-2xs px-1.5 py-0.5',
  sm: 'text-2xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'sm', className }) => (
  <span
    className={cn(
      'inline-flex items-center font-semibold rounded-full whitespace-nowrap',
      variantStyles[variant],
      sizeStyles[size],
      className,
    )}
  >
    {children}
  </span>
);

export default Badge;
