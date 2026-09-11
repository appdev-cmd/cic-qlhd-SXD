"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
    primary: `
    bg-orange-500 hover:bg-orange-600 active:bg-orange-700
    text-white font-bold
    shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30
    dark:bg-orange-500 dark:hover:bg-orange-600
  `,
    secondary: `
    bg-slate-100 hover:bg-slate-200 active:bg-slate-300
    text-slate-700 font-semibold
    dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200
  `,
    ghost: `
    bg-transparent hover:bg-slate-100 active:bg-slate-200
    text-slate-600 font-medium
    dark:hover:bg-slate-800 dark:text-slate-300
  `,
    danger: `
    bg-red-500 hover:bg-red-600 active:bg-red-700
    text-white font-bold
    shadow-lg shadow-red-500/20 hover:shadow-red-500/30
  `,
    success: `
    bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
    text-white font-bold
    shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30
  `,
    outline: `
    bg-transparent border border-slate-200 hover:border-slate-300
    text-slate-700 font-semibold
    hover:bg-slate-50
    dark:border-slate-800 dark:hover:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
    xs: 'px-2.5 py-1.5 text-xs rounded-lg gap-1',
    sm: 'px-3 py-2 text-sm rounded-lg gap-1.5',
    md: 'px-4 py-2.5 text-sm rounded-lg gap-2',
    lg: 'px-6 py-3 text-base rounded-lg gap-2.5',
    icon: 'h-9 w-9 p-0 rounded-lg justify-center',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            children,
            variant = 'primary',
            size = 'md',
            isLoading = false,
            leftIcon,
            rightIcon,
            fullWidth = false,
            disabled,
            className = '',
            ...props
        },
        ref
    ) => {
        const isDisabled = disabled || isLoading;

        return (
            <button
                ref={ref}
                disabled={isDisabled}
                className={`
          inline-flex items-center justify-center
          transition-all duration-200 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
          dark:focus-visible:ring-offset-slate-900
          disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${isDisabled ? '' : 'hover:scale-[1.02] active:scale-[0.98]'}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
                {...props}
            >
                {isLoading && (
                    <Loader2 className="animate-spin" size={size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
                )}
                {!isLoading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
                {children && <span>{children}</span>}
                {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
            </button>
        );
    }
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
export default Button;
