"use client";

import React from 'react';
import { useEntityPanel, EntityType } from '@/panels/useEntityPanel';
import { Tooltip } from './Tooltip';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

export interface EntityLinkProps {
  type: EntityType;
  id?: string | null;
  children: React.ReactNode;
  className?: string;
  title?: string;
  showIcon?: boolean;
}

const ENTITY_TOOLTIPS: Record<EntityType, string> = {
  dossier: 'Xem nhanh hồ sơ thẩm định (Slide Panel)',
  project: 'Xem chi tiết dự án đầu tư xây dựng',
  permit: 'Xem giấy phép xây dựng',
  investor: 'Xem thông tin chủ đầu tư',
  staff: 'Xem thông tin cán bộ phụ trách',
};

export const EntityLink: React.FC<EntityLinkProps> = ({
  type,
  id,
  children,
  className,
  title,
  showIcon = false,
}) => {
  const { open } = useEntityPanel();

  if (!id) {
    return <span className={className}>{children}</span>;
  }

  const tooltipContent = title || ENTITY_TOOLTIPS[type] || 'Xem chi tiết';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    open(type, { id });
  };

  return (
    <Tooltip content={tooltipContent} placement="top">
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick(e as any);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors focus:outline-none focus:underline",
          className
        )}
      >
        <span>{children}</span>
        {showIcon && <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />}
      </span>
    </Tooltip>
  );
};

export default EntityLink;
