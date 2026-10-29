import React from 'react';
import { cn } from '../../lib/utils';

// ========================================
// SECTION HEADER — ported from cic-hud Design System v2
// Replaces the repeated "text-xs font-bold uppercase tracking-wider" label pattern.
// ========================================

export type SectionHeaderSize = 'xs' | 'sm' | 'md' | 'lg';

export interface SectionHeaderProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  size?: SectionHeaderSize;
  className?: string;
  /** Add bottom margin (default: true) */
  mb?: boolean;
}

const sizeStyles: Record<SectionHeaderSize, string> = {
  xs: 'text-2xs tracking-[0.15em]',
  sm: 'text-xs tracking-wider',
  md: 'text-sm tracking-wide',
  lg: 'text-base tracking-normal',
};

const iconSizes: Record<SectionHeaderSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  action,
  size = 'sm',
  className,
  mb = true,
}) => (
  <div className={cn('flex items-center justify-between gap-3', mb && 'mb-3', className)}>
    <h4
      className={cn('font-bold uppercase flex items-center gap-2 text-txt-muted dark:text-slate-400', sizeStyles[size])}
    >
      {icon && <span className={cn(iconSizes[size], 'shrink-0 inline-flex items-center justify-center')}>{icon}</span>}
      {title}
    </h4>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default SectionHeader;
