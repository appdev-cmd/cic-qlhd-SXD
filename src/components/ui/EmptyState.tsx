import React from 'react';
import { Inbox, Search, AlertCircle, FolderOpen, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'search' | 'error' | 'folder';
  className?: string;
  children?: React.ReactNode;
}

const iconMap = {
  default: <Inbox className="w-12 h-12" />,
  search: <Search className="w-12 h-12" />,
  error: <AlertCircle className="w-12 h-12" />,
  folder: <FolderOpen className="w-12 h-12" />,
};

/** Placeholder for lists, search results and folders with no data. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  variant = 'default',
  className,
  children,
}) => {
  const label = action?.label || actionLabel;
  const handleAction = action?.onClick || onAction;

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8', className)}>
      <div className="w-20 h-20 rounded-xl flex items-center justify-center mb-6 bg-bg-muted text-txt-muted dark:bg-slate-800 dark:text-slate-400">
        {icon || iconMap[variant]}
      </div>

      <h3 className="text-lg font-semibold mb-2 text-center text-txt-secondary dark:text-slate-200">{title}</h3>

      {description && (
        <p className="text-sm text-center max-w-md mb-6 text-txt-muted dark:text-slate-400">{description}</p>
      )}

      {label && handleAction && (
        <Button onClick={handleAction} leftIcon={<Plus className="w-4 h-4" />}>
          {label}
        </Button>
      )}

      {children}
    </div>
  );
};

export default EmptyState;
