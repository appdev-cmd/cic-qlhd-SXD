import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from './Tooltip';

// ========================================
// BUTTON — ported from cic-hud Design System v2
// ========================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  rounded?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-500 text-white shadow-card hover:bg-primary-600 hover:shadow-card-hover active:bg-primary-700 focus-visible:ring-primary-500 ' +
    'dark:bg-primary-600 dark:text-white dark:hover:bg-primary-500 dark:active:bg-primary-700',
  secondary:
    'bg-bg-surface text-txt-secondary border border-border shadow-sm hover:bg-bg-muted hover:border-border-subtle active:bg-bg-subtle focus-visible:ring-slate-400 ' +
    'dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:active:bg-slate-900',
  ghost:
    'bg-transparent text-txt-secondary hover:bg-bg-muted hover:text-txt-primary active:bg-bg-subtle focus-visible:ring-slate-400 ' +
    'dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:active:bg-slate-700',
  danger:
    'bg-danger-500 text-white shadow-card hover:bg-danger-600 hover:shadow-card-hover active:bg-danger-700 focus-visible:ring-danger-500 ' +
    'dark:bg-danger-600 dark:text-white dark:hover:bg-danger-500 dark:active:bg-danger-700',
  success:
    'bg-success-500 text-white shadow-card hover:bg-success-600 hover:shadow-card-hover active:bg-success-700 focus-visible:ring-success-500 ' +
    'dark:bg-success-600 dark:text-white dark:hover:bg-success-500 dark:active:bg-success-700',
  outline:
    'bg-transparent text-primary-600 border-2 border-primary-500 hover:bg-primary-50 active:bg-primary-100 focus-visible:ring-primary-500 ' +
    'dark:text-primary-300 dark:border-primary-400 dark:hover:bg-primary-900 dark:active:bg-primary-800',
  link:
    'bg-transparent text-primary-600 underline-offset-4 hover:underline hover:text-primary-700 active:text-primary-800 focus-visible:ring-primary-500 ' +
    'dark:text-primary-300 dark:hover:text-primary-200 dark:active:text-primary-100',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
  xl: 'px-6 py-3 text-lg gap-2.5',
};

const iconSizes: Record<ButtonSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-5 h-5',
};

const baseStyles =
  'inline-flex items-center justify-center font-bold select-none transition-all duration-200 ease-out active:scale-[0.98] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-focus dark:ring-offset-slate-900 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      rounded = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          rounded ? 'rounded-full' : 'rounded-xl',
          fullWidth && 'w-full',
          variant === 'link' && 'p-0 h-auto',
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className={cn(iconSizes[size], 'animate-spin')} aria-hidden="true" />}

        {!loading && leftIcon && (
          <span className={cn(iconSizes[size], 'inline-flex items-center justify-center')} aria-hidden="true">
            {leftIcon}
          </span>
        )}

        <span className={loading && !loadingText ? 'opacity-0' : undefined}>
          {loading && loadingText ? loadingText : children}
        </span>

        {!loading && rightIcon && (
          <span className={cn(iconSizes[size], 'inline-flex items-center justify-center')} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

// ========================================
// ICON BUTTON — icon-only, accessible label required; optional hover help via Tooltip
// ========================================

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'loadingText' | 'children'> {
  icon: React.ReactNode;
  'aria-label': string;
  /** Hover help rendered through the universal Tooltip (never the native title attribute). */
  tooltip?: React.ReactNode;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}

const iconOnlyPadding: Record<ButtonSize, string> = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
  xl: 'p-3',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      size = 'md',
      variant = 'ghost',
      className,
      'aria-label': ariaLabel,
      tooltip,
      tooltipPlacement = 'top',
      ...props
    },
    ref,
  ) => {
    const button = (
      <Button
        ref={ref}
        size={size}
        variant={variant}
        className={cn(iconOnlyPadding[size], className)}
        aria-label={ariaLabel}
        {...props}
      >
        <span className={cn(iconSizes[size], 'inline-flex items-center justify-center')} aria-hidden="true">
          {icon}
        </span>
      </Button>
    );

    if (!tooltip) return button;
    return (
      <Tooltip content={tooltip} placement={tooltipPlacement}>
        {button}
      </Tooltip>
    );
  },
);

IconButton.displayName = 'IconButton';

// ========================================
// BUTTON GROUP
// ========================================

export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  attached?: boolean;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({ children, className, attached = false }) => {
  if (!attached) {
    return (
      <div className={cn('inline-flex gap-2', className)} role="group">
        {children}
      </div>
    );
  }

  const count = React.Children.count(children);
  return (
    <div className={cn('inline-flex', className)} role="group">
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement<{ className?: string }>(child)) return child;
        const isFirst = index === 0;
        const isLast = index === count - 1;
        return React.cloneElement(child, {
          className: cn(
            child.props.className,
            !isFirst && '-ml-px',
            isFirst && !isLast && 'rounded-r-none',
            isLast && !isFirst && 'rounded-l-none',
            !isFirst && !isLast && 'rounded-none',
          ),
        });
      })}
    </div>
  );
};

export default Button;
