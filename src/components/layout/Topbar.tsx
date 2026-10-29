import { useLocation } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { AiChatWidget } from '../ai/AiChatWidget';
import { DeadlineBell } from './DeadlineBell';
import { UserMenu } from './UserMenu';
import { findNav } from '../../layouts/navigation';
import type { WorkCounts } from '../../hooks/useWorkCounts';

/** Thanh trên: breadcrumb đầy đủ, ô tìm nhanh (Ctrl+K), Trợ lý AI, chuông hạn, tài khoản. */
export function Topbar({ counts, onSearch }: { counts: WorkCounts | null; onSearch: () => void }) {
  const location = useLocation();
  const { group, item } = findNav(location.pathname);
  const crumbs = [
    group?.label,
    item?.label || (location.pathname.startsWith('/dossiers/') ? 'Chi tiết hồ sơ' : undefined),
  ].filter(Boolean) as string[];
  if (location.pathname.startsWith('/dev/')) crumbs.splice(0, crumbs.length, 'Phát triển', 'Bộ component');

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border dark:border-slate-800 bg-surface dark:bg-slate-900 px-3 sm:px-6 z-20">
      <nav aria-label="Vị trí trang" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <li key={c} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <ChevronRight size={14} className="hidden shrink-0 text-ink-muted dark:text-slate-500 xl:block" />
              )}
              <span
                aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                className={
                  i === crumbs.length - 1
                    ? 'truncate font-bold text-ink dark:text-slate-100'
                    : 'hidden shrink-0 font-medium text-ink-muted dark:text-slate-400 xl:inline'
                }
              >
                {c}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <Tooltip content="Tìm nhanh hồ sơ, dự án, trang (Ctrl+K)" placement="bottom">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Tìm nhanh (Ctrl+K)"
          aria-keyshortcuts="Control+K"
          className="flex items-center gap-2 rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 px-3 py-1.5 text-sm text-ink-muted dark:text-slate-400 transition-colors hover:border-primary-300 dark:hover:border-primary-700 hover:text-ink dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:w-56 xl:w-72"
        >
          <Search size={16} className="shrink-0" />
          <span className="hidden flex-1 truncate text-left lg:inline">Tìm hồ sơ, dự án…</span>
          <kbd className="hidden rounded-md border border-border dark:border-slate-600 bg-surface dark:bg-slate-900 px-1.5 font-mono text-2xs text-ink-muted dark:text-slate-400 lg:inline">
            Ctrl K
          </kbd>
        </button>
      </Tooltip>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <AiChatWidget />
        <DeadlineBell counts={counts} />
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border dark:bg-slate-700 sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
