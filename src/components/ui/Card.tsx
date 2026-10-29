import React from 'react';
import { cn } from '../../lib/utils';

// ========================================
// CARD — ported from cic-hud Design System v2
// ========================================

export type CardVariant = 'default' | 'outlined' | 'elevated' | 'glass' | 'gradient';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children' | 'onClick'> {
  variant?: CardVariant;
  padding?: CardPadding;
  hover?: boolean;
  clickable?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-bg-surface border border-border shadow-card dark:bg-slate-900 dark:border-slate-800',
  outlined: 'bg-bg-surface border-2 border-border dark:bg-slate-900 dark:border-slate-700',
  elevated: 'bg-bg-surface border border-border-subtle shadow-card-hover dark:bg-slate-800 dark:border-slate-700',
  // Translucent only in light mode; dark surfaces stay full opacity per the project dark-mode rule.
  glass: 'bg-white/80 backdrop-blur-xl border border-border-subtle shadow-card dark:bg-slate-900 dark:border-slate-800',
  gradient:
    'bg-gradient-to-br from-bg-surface to-bg-subtle border border-border shadow-card ' +
    'dark:from-slate-900 dark:to-slate-800 dark:border-slate-800',
};

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
};

export const Card = React.forwardRef<HTMLElement, CardProps>(
  (
    { variant = 'default', padding = 'lg', hover = false, clickable = false, className, children, onClick, ...props },
    ref,
  ) => {
    const classes = cn(
      'rounded-xl transition-shadow duration-200 ease-out',
      variantStyles[variant],
      paddingStyles[padding],
      (hover || clickable) && 'hover:shadow-card-hover cursor-pointer',
      clickable &&
        'block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ring-offset-focus dark:ring-offset-slate-900',
      className,
    );

    if (clickable) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          className={classes}
          {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {children}
        </button>
      );
    }

    return (
      <div ref={ref as React.Ref<HTMLDivElement>} onClick={onClick} className={classes} {...props}>
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

// ========================================
// CARD HEADER
// ========================================

export interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, icon, action, className }) => (
  <div className={cn('flex items-start justify-between gap-4', className)}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <div className="p-2 rounded-lg shrink-0 bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-sm font-bold uppercase tracking-wider text-txt-primary dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5 text-txt-muted dark:text-slate-400">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

// ========================================
// CARD BODY
// ========================================

export interface CardBodyProps {
  className?: string;
  children: React.ReactNode;
}

export const CardBody: React.FC<CardBodyProps> = ({ className, children }) => (
  <div className={cn('mt-4', className)}>{children}</div>
);

// ========================================
// CARD FOOTER
// ========================================

export interface CardFooterProps {
  className?: string;
  children: React.ReactNode;
  divider?: boolean;
}

export const CardFooter: React.FC<CardFooterProps> = ({ className, children, divider = true }) => (
  <div className={cn('mt-4 pt-4', divider && 'border-t border-border dark:border-slate-800', className)}>
    {children}
  </div>
);

export default Card;
