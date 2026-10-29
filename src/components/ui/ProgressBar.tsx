import React from 'react';
import { cn } from '../../lib/utils';

// ========================================
// PROGRESS BAR — ported from cic-hud Design System v2
// ========================================

export type ProgressBarSize = 'xs' | 'sm' | 'md' | 'lg';
export type ProgressBarColor = 'auto' | 'emerald' | 'amber' | 'blue' | 'primary' | 'red' | 'slate';

export interface ProgressBarProps {
  /** Value 0-100 */
  value: number;
  /** 'auto' picks green (>= 80) / amber (>= 40) / grey from the value */
  color?: ProgressBarColor;
  size?: ProgressBarSize;
  /** Show percentage label */
  showLabel?: boolean;
  /** Custom label text (overrides percentage) */
  label?: string;
  className?: string;
}

const sizeStyles: Record<ProgressBarSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const colorStyles: Record<Exclude<ProgressBarColor, 'auto'>, string> = {
  emerald: 'bg-gradient-to-r from-success-400 to-success-500 dark:from-success-500 dark:to-success-400',
  amber: 'bg-gradient-to-r from-warning-400 to-warning-500 dark:from-warning-500 dark:to-warning-400',
  blue: 'bg-gradient-to-r from-info-400 to-info-500 dark:from-info-500 dark:to-info-400',
  primary: 'bg-gradient-to-r from-primary-400 to-primary-500 dark:from-primary-500 dark:to-primary-400',
  red: 'bg-gradient-to-r from-danger-400 to-danger-500 dark:from-danger-500 dark:to-danger-400',
  slate: 'bg-slate-300 dark:bg-slate-600',
};

function getAutoColor(value: number): string {
  if (value >= 80) return colorStyles.emerald;
  if (value >= 40) return colorStyles.amber;
  return colorStyles.slate;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'auto',
  size = 'sm',
  showLabel = false,
  label,
  className,
}) => {
  const clampedValue = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
  const fillColor = color === 'auto' ? getAutoColor(clampedValue) : colorStyles[color];
  const text = label || `${clampedValue.toFixed(0)}%`;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn('flex-1 rounded-full overflow-hidden bg-bg-muted dark:bg-slate-800', sizeStyles[size])}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedValue)}
        aria-valuetext={text}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', fillColor)}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {(showLabel || label) && (
        <span className="text-2xs font-bold tabular-nums whitespace-nowrap text-txt-muted dark:text-slate-400">
          {text}
        </span>
      )}
    </div>
  );
};

export default ProgressBar;
