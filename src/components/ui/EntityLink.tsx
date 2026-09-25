import React from 'react';
import { cn } from '../../lib/utils';
import { useEntityPanel, type EntityType } from '../../hooks/useEntityPanel';

export interface EntityLinkProps {
  type: EntityType;
  id: string;
  /** Tên hiển thị (hoặc truyền children) */
  name?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Hiển thị TÊN thực thể và mở Slide Panel chi tiết khi bấm (không điều hướng toàn trang).
 * Kế thừa màu chữ xung quanh, hover đổi màu, không gạch chân.
 */
export function EntityLink({ type, id, name, children, className }: EntityLinkProps) {
  const { open } = useEntityPanel();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(type, { id, label: name });
      }}
      className={cn(
        'text-inherit hover:text-blue-600 dark:hover:text-blue-400 no-underline cursor-pointer text-left transition-colors max-w-full truncate align-baseline',
        className
      )}
    >
      {children ?? name}
    </button>
  );
}
