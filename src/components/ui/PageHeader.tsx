import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

// ========================================
// PAGE HEADER — ported from cic-hud Design System v2.1
// ========================================

export interface PageHeaderAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  /** Hide on mobile */
  hideOnMobile?: boolean;
}

/**
 * Breadcrumb entry. Navigation is callback-only (no `href`): internal navigation goes through
 * EntityLink / useEntityPanel, never <a>/<Link>.
 */
export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Classes for the icon tile (include dark: variants) */
  iconColor?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Action slot (right side) */
  actions?: React.ReactNode;
  /** Badge / status next to the title */
  badge?: React.ReactNode;
  /** Stats row below the title */
  stats?: React.ReactNode;
  /** Tabs row */
  tabs?: React.ReactNode;
  className?: string;
  /** Stick to the top with an opaque background */
  sticky?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon,
  iconColor = 'bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-300',
  breadcrumbs,
  actions,
  badge,
  stats,
  tabs,
  className,
  sticky = false,
}) => (
  <div className={cn(sticky && 'sticky top-0 z-20 bg-bg-app dark:bg-slate-950', className)}>
    <div className={tabs || stats ? 'pb-0' : 'mb-6'}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-txt-muted dark:text-slate-400">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" aria-hidden="true" />}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="rounded transition-colors hover:text-txt-secondary dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className="font-medium text-txt-secondary dark:text-slate-200"
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <div className={cn('p-2.5 rounded-lg shrink-0', iconColor)}>{icon}</div>}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold truncate text-txt-primary dark:text-slate-100">{title}</h1>
              {badge && <div className="shrink-0">{badge}</div>}
            </div>
            {description && (
              <p className="text-sm mt-0.5 line-clamp-2 text-txt-muted dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {stats && <div className="mt-4">{stats}</div>}
      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  </div>
);

export default PageHeader;
