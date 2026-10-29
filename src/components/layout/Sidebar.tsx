import { NavLink, useLocation } from 'react-router-dom';
import { Building, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import { NAV_GROUPS, findNav, type NavItem } from '../../layouts/navigation';
import { urgentTotal, type WorkCounts } from '../../hooks/useWorkCounts';

function countHelp(item: NavItem, counts: WorkCounts | null) {
  const c = item.procedure && counts?.[item.procedure];
  if (!c) return item.label;
  const parts = [
    c.overdue && `${c.overdue} quá hạn`,
    c.supplementOverdue && `${c.supplementOverdue} quá hạn bổ sung`,
    c.dueSoon && `${c.dueSoon} sắp đến hạn`,
  ].filter(Boolean);
  return parts.length ? `${item.label} — ${parts.join(' · ')}` : item.label;
}

/** Menu trái — nền tối hai tông theo bộ màu chủ đạo (--brand-*), nhóm theo nghiệp vụ. */
export function Sidebar({
  compact,
  collapsed,
  onToggle,
  counts,
}: {
  compact: boolean;
  collapsed: boolean;
  onToggle: () => void;
  counts: WorkCounts | null;
}) {
  const location = useLocation();
  const current = findNav(location.pathname).item;

  return (
    <aside
      style={{ width: compact ? '76px' : '264px' }}
      aria-label="Menu chính"
      className="h-full bg-brand-sidebar dark:bg-brand-sidebar text-white dark:text-white border-r border-brand-sidebar-border dark:border-brand-sidebar-border flex flex-col shrink-0 transition-[width] duration-300 z-30"
    >
      {/* Logo & đơn vị chủ quản */}
      <div className="h-16 px-3.5 border-b border-brand-sidebar-border dark:border-brand-sidebar-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 shrink-0 rounded-xl border border-brand-accent/60 dark:border-brand-accent/60 bg-brand-sidebar-panel dark:bg-brand-sidebar-panel flex flex-col items-center justify-center shadow-md">
            <Building size={16} className="text-brand-logo dark:text-brand-logo" />
            <span className="text-2xs font-black tracking-widest text-brand-accent dark:text-brand-accent leading-none mt-0.5">
              SXD
            </span>
          </div>
          {!compact && (
            <div className="flex flex-col min-w-0 justify-center flex-1">
              <p className="text-2xs font-bold uppercase tracking-wider leading-tight whitespace-nowrap text-brand-accent dark:text-brand-accent">
                UBND Tỉnh Điện Biên
              </p>
              <p className="text-sm font-black uppercase leading-tight tracking-wide whitespace-nowrap text-white dark:text-white">
                Sở Xây dựng
              </p>
              <p className="text-2xs font-medium whitespace-nowrap text-white/60 dark:text-white/60">
                Hệ thống thẩm định · AI
              </p>
            </div>
          )}
        </div>
        <Tooltip content={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} placement="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className="hidden lg:block p-1.5 rounded-lg text-white/60 dark:text-white/60 hover:bg-white/10 dark:hover:bg-white/10 hover:text-white dark:hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </Tooltip>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4" aria-label="Điều hướng">
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            {compact ? (
              <div className="mx-2 mb-2 border-t border-brand-sidebar-border dark:border-brand-sidebar-border first:hidden" />
            ) : (
              <p className="px-3 pb-1.5 text-2xs font-bold uppercase tracking-wider text-white/45 dark:text-white/45">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = current?.to === item.to;
                const count = item.procedure ? counts?.[item.procedure] : undefined;
                const urgent = urgentTotal(count);
                const overdue = (count?.overdue || 0) + (count?.supplementOverdue || 0);
                return (
                  <li key={item.to}>
                    <Tooltip content={countHelp(item, counts)} placement="right">
                      <NavLink
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        aria-label={countHelp(item, counts)}
                        className={cn(
                          'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
                          active
                            ? 'bg-brand-sidebar-active dark:bg-brand-sidebar-active text-brand-nav-active-text dark:text-brand-nav-active-text font-semibold'
                            : 'text-white/75 dark:text-white/75 hover:bg-white/[0.07] dark:hover:bg-white/[0.07] hover:text-white dark:hover:text-white',
                          compact && 'justify-center px-1',
                        )}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand-accent dark:bg-brand-accent"
                          />
                        )}
                        <span className="relative shrink-0">
                          <Icon
                            size={18}
                            className={
                              active ? 'text-brand-accent dark:text-brand-accent' : 'text-white/70 dark:text-white/70'
                            }
                          />
                          {compact && urgent > 0 && (
                            <span
                              aria-hidden
                              className={cn(
                                'absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-sidebar dark:border-brand-sidebar',
                                overdue ? 'bg-danger-500 dark:bg-danger-400' : 'bg-brand-accent dark:bg-brand-accent',
                              )}
                            />
                          )}
                        </span>
                        {!compact && <span className="flex-1 truncate">{item.label}</span>}
                        {!compact && urgent > 0 && (
                          <span
                            aria-hidden
                            className={cn(
                              'min-w-[1.375rem] rounded-full px-1.5 text-center text-2xs font-black leading-5',
                              overdue
                                ? 'bg-danger-500 dark:bg-danger-500 text-white dark:text-white'
                                : 'bg-brand-accent dark:bg-brand-accent text-brand-sidebar dark:text-brand-sidebar',
                            )}
                          >
                            {urgent > 99 ? '99+' : urgent}
                          </span>
                        )}
                      </NavLink>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!compact && (
        <div className="m-3 rounded-xl border border-brand-sidebar-border dark:border-brand-sidebar-border bg-brand-sidebar-panel dark:bg-brand-sidebar-panel p-3 text-2xs leading-snug shrink-0">
          <p className="flex items-center gap-1.5 font-bold text-brand-sidebar-status dark:text-brand-sidebar-status">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-sidebar-status-dot dark:bg-brand-sidebar-status-dot" />
            Căn cứ theo thời điểm hồ sơ
          </p>
          <p className="mt-1 text-white/60 dark:text-white/60">Kết quả tự động cần chuyên viên rà soát</p>
        </div>
      )}
    </aside>
  );
}
