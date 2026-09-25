import { cn } from '../lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

export interface KpiCardProps {
  title: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  className?: string;
  onClick?: () => void;
}

export function KpiCard({
  title,
  value,
  sublabel,
  icon: Icon,
  iconColor = 'text-primary-500',
  iconBg = 'bg-primary-500/10',
  trend,
  className,
  onClick,
}: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border border-border bg-surface shadow-card transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-card-hover hover:border-primary-400/50',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-ink-muted truncate uppercase tracking-wider">{title}</p>
          <h4 className="mt-1 text-2xl font-bold tracking-tight text-ink font-mono truncate">{value}</h4>
          {sublabel && <p className="mt-1 text-2xs text-ink-muted truncate">{sublabel}</p>}
        </div>

        <div className={cn('p-2.5 rounded-xl shrink-0 flex items-center justify-center', iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
      </div>

      {trend && (
        <div className="mt-3 pt-2.5 border-t border-border flex items-center gap-1.5 text-2xs font-medium">
          {trend.isPositive ? (
            <TrendingUp size={13} className="text-emerald-500 shrink-0" />
          ) : (
            <TrendingDown size={13} className="text-rose-500 shrink-0" />
          )}
          <span className={trend.isPositive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
            {trend.value}
          </span>
          {trend.label && <span className="text-ink-muted">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
