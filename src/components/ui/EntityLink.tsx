import React from 'react';
import { cn } from '../../lib/utils';
import { useEntityPanel } from '../../hooks/useEntityPanel';

export interface EntityLinkProps {
  type: 'project' | 'organization' | 'personnel' | 'dossier';
  id: string;
  name: string;
  className?: string;
  onClick?: () => void;
}

export function EntityLink({ type, id, name, className, onClick }: EntityLinkProps) {
  const { open } = useEntityPanel();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
      return;
    }
    open(type, { id, name });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'text-inherit hover:text-primary-600 dark:hover:text-primary-400 no-underline cursor-pointer font-medium text-left transition-colors truncate max-w-full',
        className,
      )}
    >
      {name}
    </button>
  );
}
