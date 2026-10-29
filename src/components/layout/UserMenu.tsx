import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Leaf, LogOut, Moon, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Theme } from '../../context/ThemeContext';
import { PalettePicker } from '../ui/PalettePicker';
import { Tabs } from '../ui/Tabs';
import { Tooltip } from '../ui/Tooltip';
import { toast } from '../ui/Toast';
import { cn } from '../../lib/utils';

const ROLE_LABELS: Record<string, string> = {
  officer: 'Chuyên viên',
  head_of_department: 'Trưởng phòng',
  director: 'Lãnh đạo Sở',
  admin: 'Quản trị',
};

/** Avatar + menu cài đặt cá nhân: chế độ nền, bộ màu, cỡ chữ, đăng xuất. */
export function UserMenu() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme, zoom, setZoom } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = profile?.full_name || 'Chuyên viên mẫu';
  const department = profile?.department || 'Phòng Quản lý Xây dựng';
  const role = ROLE_LABELS[profile?.role || ''] || '';
  const initials = name
    .split(' ')
    .slice(-2)
    .map((s) => s[0])
    .join('');

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={'Tài khoản ' + name}
        className={cn(
          'flex items-center gap-2.5 rounded-xl p-1 pr-2 text-left transition-colors hover:bg-subtle dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          open && 'bg-subtle dark:bg-slate-800 ring-1 ring-border dark:ring-slate-700',
        )}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-600 dark:bg-primary-500 text-xs font-bold text-white dark:text-white shadow-xs">
          {initials}
        </span>
        <span className="hidden sm:block text-xs leading-tight">
          <span className="block font-bold text-ink dark:text-slate-100">{name}</span>
          <span className="block text-2xs font-medium text-primary-700 dark:text-primary-300">
            {role ? role + ' · ' : ''}
            {department}
          </span>
        </span>
        <ChevronDown size={14} className="hidden sm:block text-ink-muted dark:text-slate-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Cài đặt cá nhân"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-4 text-xs shadow-dropdown animate-fade-in-down space-y-4"
        >
          <div className="flex items-center gap-3 border-b border-border dark:border-slate-700 pb-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-600 dark:bg-primary-500 text-sm font-bold text-white dark:text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink dark:text-slate-100">{name}</p>
              <p className="truncate text-2xs font-semibold text-primary-700 dark:text-primary-300">
                {role ? role + ' · ' : ''}
                {department}
              </p>
              {profile?.email && (
                <p className="truncate text-2xs text-ink-muted dark:text-slate-400">{profile.email}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">Chế độ nền</p>
            <Tabs<Theme>
              variant="pills"
              size="sm"
              ariaLabel="Chế độ nền"
              value={theme}
              onChange={setTheme}
              className="[&>button]:flex-1 [&>button]:justify-center"
              items={[
                {
                  id: 'light',
                  label: 'Sáng',
                  icon: <Sun size={13} className="text-warning-500 dark:text-warning-400" />,
                },
                {
                  id: 'nature',
                  label: 'Bảo vệ',
                  icon: <Leaf size={13} className="text-success-600 dark:text-success-400" />,
                },
                { id: 'dark', label: 'Tối', icon: <Moon size={13} className="text-info-500 dark:text-info-400" /> },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">
              Bộ màu chủ đạo
            </p>
            <PalettePicker />
          </div>

          <div className="space-y-1.5 border-t border-border dark:border-slate-700 pt-3">
            <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">
              <span>Cỡ chữ giao diện</span>
              <span className="font-mono text-primary-700 dark:text-primary-300">{zoom}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="Giảm cỡ chữ 10%">
                <button
                  type="button"
                  aria-label="Giảm cỡ chữ"
                  onClick={() => setZoom(Math.max(90, zoom - 10))}
                  disabled={zoom <= 90}
                  className="rounded-lg border border-border dark:border-slate-600 bg-subtle dark:bg-slate-900 p-1 hover:bg-muted dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  <ZoomOut size={12} />
                </button>
              </Tooltip>
              <input
                type="range"
                min="90"
                max="120"
                step="10"
                value={zoom}
                aria-label="Cỡ chữ giao diện"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-[var(--color-primary)]"
              />
              <Tooltip content="Tăng cỡ chữ 10%">
                <button
                  type="button"
                  aria-label="Tăng cỡ chữ"
                  onClick={() => setZoom(Math.min(120, zoom + 10))}
                  disabled={zoom >= 120}
                  className="rounded-lg border border-border dark:border-slate-600 bg-subtle dark:bg-slate-900 p-1 hover:bg-muted dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  <ZoomIn size={12} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="border-t border-border dark:border-slate-700 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut().catch((e: Error) => toast.error('Chưa đăng xuất được', { description: e.message }));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2 font-semibold text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900"
            >
              <LogOut size={14} />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
