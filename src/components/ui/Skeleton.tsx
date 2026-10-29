import React from 'react';
import { cn } from '../../lib/utils';

// ========================================
// SKELETON — ported from cic-hud Design System v2
// cic-hud relies on a global `.skeleton` CSS class; here the shimmer is built from
// Tailwind utilities (animate-shimmer keyframes in tailwind.config.js).
// ========================================

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
  animation?: 'pulse' | 'shimmer' | 'none';
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: 'rounded h-4',
  circular: 'rounded-full',
  rectangular: 'rounded-none',
  rounded: 'rounded-xl',
};

const animationStyles = {
  pulse: 'animate-pulse motion-reduce:animate-none bg-slate-200 dark:bg-slate-700',
  shimmer:
    'animate-shimmer motion-reduce:animate-none bg-[length:200%_100%] bg-gradient-to-r ' +
    'from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800',
  none: 'bg-slate-200 dark:bg-slate-700',
};

const toCss = (v: string | number | undefined) => (typeof v === 'number' ? `${v}px` : v);

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className,
  animation = 'shimmer',
}) => {
  const style: React.CSSProperties = { width: toCss(width), height: toCss(height) };

  // Circular uses one dimension for both sides.
  if (variant === 'circular') {
    style.height = style.height || style.width;
    style.width = style.width || style.height;
  }

  return (
    <div
      className={cn(variantStyles[variant], animationStyles[animation], className)}
      style={style}
      aria-hidden="true"
    />
  );
};

// ========================================
// SKELETON TEXT — multiple lines
// ========================================

export interface SkeletonTextProps {
  lines?: number;
  lastLineWidth?: string;
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

const spacingStyles = {
  sm: 'space-y-1.5',
  md: 'space-y-2',
  lg: 'space-y-3',
};

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = '75%',
  spacing = 'md',
  className,
}) => (
  <div className={cn(spacingStyles[spacing], className)}>
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} variant="text" width={index === lines - 1 ? lastLineWidth : '100%'} />
    ))}
  </div>
);

// ========================================
// SKELETON CARD
// ========================================

export interface SkeletonCardProps {
  className?: string;
  hasImage?: boolean;
  hasAvatar?: boolean;
  lines?: number;
}

const surface = 'rounded-xl border bg-bg-surface border-border-subtle dark:bg-slate-900 dark:border-slate-800';

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className,
  hasImage = false,
  hasAvatar = true,
  lines = 2,
}) => (
  <div className={cn(surface, 'p-6', className)}>
    {hasImage && <Skeleton variant="rounded" height={160} className="mb-4" />}

    {hasAvatar && (
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" className="mb-2" />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
    )}

    <SkeletonText lines={lines} />
  </div>
);

// ========================================
// TABLE SKELETON — grid-shaped placeholder (div based, no <table>)
// ========================================

export interface TableSkeletonProps {
  columns?: number;
  rows?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ columns = 4, rows = 5, className }) => (
  <div className={cn('overflow-hidden rounded-xl border border-border-subtle dark:border-slate-800', className)}>
    <div className="px-4 py-3 flex gap-4 border-b bg-bg-subtle border-border-subtle dark:bg-slate-800 dark:border-slate-700">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={`header-${i}`} variant="text" height={14} className="flex-1" />
      ))}
    </div>

    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div
        key={`row-${rowIdx}`}
        className="px-4 py-3 flex gap-4 border-b last:border-0 border-border-subtle dark:border-slate-800"
      >
        {Array.from({ length: columns }).map((_, colIdx) => (
          <Skeleton key={`cell-${rowIdx}-${colIdx}`} variant="text" className="flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// ========================================
// SKELETON STAT CARD
// ========================================

export const SkeletonStatCard: React.FC<{ className?: string; compact?: boolean }> = ({
  className,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className={cn(surface, 'p-3.5 h-[98px]', className)}>
        <div className="flex justify-between items-start mb-2">
          <Skeleton variant="rounded" width={32} height={32} />
          <Skeleton variant="rounded" width={40} height={16} />
        </div>
        <Skeleton variant="text" width="40%" height={20} className="mb-1" />
        <Skeleton variant="text" width="60%" height={8} />
      </div>
    );
  }
  return (
    <div className={cn(surface, 'p-6 h-36', className)}>
      <div className="flex justify-between items-start mb-4">
        <Skeleton variant="rounded" width={44} height={44} />
        <Skeleton variant="rounded" width={60} height={24} />
      </div>
      <Skeleton variant="text" width="50%" height={32} className="mb-2" />
      <Skeleton variant="text" width="70%" height={12} />
    </div>
  );
};

// ========================================
// SKELETON AVATAR GROUP
// ========================================

export interface SkeletonAvatarGroupProps {
  count?: number;
  size?: number;
  className?: string;
}

export const SkeletonAvatarGroup: React.FC<SkeletonAvatarGroupProps> = ({ count = 4, size = 32, className }) => (
  <div className={cn('flex -space-x-2', className)}>
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton
        key={i}
        variant="circular"
        width={size}
        height={size}
        className="border-2 border-bg-surface dark:border-slate-900"
      />
    ))}
  </div>
);

export default Skeleton;
