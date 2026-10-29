import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  /**
   * Fill the viewport (e.g. route-level Suspense fallback). Unlike cic-hud this renders an in-flow
   * full-height block, not a fixed overlay — overlays must go through ReviewModal (Child Form Guard).
   */
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

/** Reusable loading spinner. */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', text, fullScreen = false }) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2
        className={`${sizeClasses[size]} animate-spin text-primary-500 dark:text-primary-400`}
        aria-hidden="true"
      />
      {text ? (
        <p className="text-sm animate-pulse text-txt-muted dark:text-slate-400">{text}</p>
      ) : (
        <span className="sr-only">Đang tải…</span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-bg-app dark:bg-slate-950">{content}</div>
    );
  }

  return <div className="flex items-center justify-center p-8">{content}</div>;
};

/** Skeleton loader for cards. */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  const bar = 'bg-bg-muted dark:bg-slate-700';
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl shadow-card border p-6 animate-pulse bg-bg-surface border-border dark:bg-slate-900 dark:border-slate-800"
          aria-hidden="true"
        >
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-xl ${bar}`} />
            <div className="flex-1 space-y-3">
              <div className={`h-5 rounded w-3/4 ${bar}`} />
              <div className={`h-4 rounded w-1/2 ${bar}`} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className={`h-3 rounded w-full ${bar}`} />
            <div className={`h-3 rounded w-4/5 ${bar}`} />
          </div>
          <div className="mt-4 flex gap-2">
            <div className={`h-8 rounded-full w-20 ${bar}`} />
            <div className={`h-8 rounded-full w-16 ${bar}`} />
          </div>
        </div>
      ))}
    </>
  );
};

/** Skeleton rows for use inside an existing grid body (DossierGrid / MasterTable). */
export const TableRowSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 4 }) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse" aria-hidden="true">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <td key={colIndex} className="px-6 py-4">
            <div className="h-4 rounded w-full bg-bg-muted dark:bg-slate-700" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export default LoadingSpinner;
