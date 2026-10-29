import React from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from './Tooltip';

// ========================================
// FORM SECTION — ported from cic-hud Design System v2.1
// Titled wrapper laying form fields out on a responsive grid.
// ========================================

export interface FormSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Action slot (right side) */
  action?: React.ReactNode;
  /** Grid columns (default 2) */
  columns?: 1 | 2 | 3 | 4;
  /** Pad the content on a subtle background */
  contentPadding?: boolean;
  /** Divider below the section */
  divider?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  icon,
  action,
  columns = 2,
  contentPadding = false,
  divider = true,
  collapsible = false,
  defaultCollapsed = false,
  children,
  className,
}) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const toggle = () => setCollapsed((c) => !c);

  return (
    <div
      className={cn(
        divider && 'border-b pb-6 mb-6 last:border-0 last:mb-0 last:pb-0 border-border dark:border-slate-800',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 mb-4',
          collapsible &&
            'cursor-pointer select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        )}
        {...(collapsible
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': !collapsed,
              onClick: toggle,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              },
            }
          : {})}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 text-primary-500 dark:text-primary-400">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-bold uppercase tracking-wider text-txt-primary dark:text-slate-100">{title}</h3>
            {description && (
              <p className="text-xs mt-0.5 font-normal normal-case tracking-normal text-txt-muted dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action && (
            // Keep clicks inside the action slot from toggling the section.
            <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
          {collapsible && (
            <ChevronDown
              className={cn(
                'w-4 h-4 transition-transform duration-200 text-txt-muted dark:text-slate-400',
                !collapsed && 'rotate-180',
              )}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          className={cn(
            'grid gap-4',
            GRID_COLS[columns],
            contentPadding && 'p-4 rounded-xl bg-bg-subtle dark:bg-slate-800',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// ========================================
// FORM FIELD — label + control wrapper
// ========================================

/** Same shape as cic-hud's FieldInfoButton content; rendered here through the universal Tooltip. */
export interface FieldInfoContent {
  title: string;
  description: string;
  example?: string;
  /** Important note, highlighted */
  note?: string;
}

export interface FormFieldProps {
  label: string;
  required?: boolean;
  /** Field help shown via an (i) button next to the label */
  info?: FieldInfoContent;
  error?: string;
  hint?: string;
  /** Span all grid columns */
  fullWidth?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

const FieldInfo: React.FC<FieldInfoContent> = ({ title, description, example, note }) => (
  <Tooltip
    placement="top"
    content={
      <div className="space-y-1 text-left">
        <p className="font-semibold text-slate-100 dark:text-slate-100">{title}</p>
        <p className="font-normal text-slate-300 dark:text-slate-300">{description}</p>
        {example && <p className="font-normal italic text-slate-400 dark:text-slate-400">Ví dụ: {example}</p>}
        {note && <p className="font-normal text-warning-300 dark:text-warning-300">Lưu ý: {note}</p>}
      </div>
    }
  >
    <button
      type="button"
      aria-label={`Hướng dẫn: ${title}`}
      className="inline-flex items-center justify-center rounded-full text-txt-muted hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <Info className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </Tooltip>
);

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  info,
  error,
  hint,
  fullWidth = false,
  children,
  className,
  htmlFor,
}) => (
  <div className={cn(fullWidth && 'col-span-full', className)}>
    <div className="flex items-center gap-1.5 mb-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wide text-txt-secondary dark:text-slate-300"
      >
        {label}
        {required && (
          <span className="ml-1 text-danger-500 dark:text-danger-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {info && <FieldInfo {...info} />}
    </div>
    {children}
    {error && (
      <p className="mt-1 text-xs text-danger-600 dark:text-danger-400" role="alert">
        {error}
      </p>
    )}
    {hint && !error && <p className="mt-1 text-xs text-txt-placeholder dark:text-slate-500">{hint}</p>}
  </div>
);

export default FormSection;
