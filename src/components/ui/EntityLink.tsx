import React from 'react';
import { cn } from '../../lib/utils';
import { useSlidePanel } from '../../context/SlidePanelContext';

export interface EntityLinkProps {
  type: 'project' | 'organization' | 'personnel';
  id: string;
  name: string;
  className?: string;
  onClick?: () => void;
}

export function EntityLink({ type, id, name, className, onClick }: EntityLinkProps) {
  const { openPanel } = useSlidePanel();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
      return;
    }
    // Mở nhanh panel tương ứng
    // Các trang sẽ tự cung cấp panel chi tiết qua context hoặc custom action
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'text-inherit hover:text-primary-600 dark:hover:text-primary-400 no-underline cursor-pointer font-medium text-left transition-colors truncate max-w-full',
        className
      )}
    >
      {name}
    </button>
  );
}
