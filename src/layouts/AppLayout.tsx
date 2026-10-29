import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SlidePanelStack } from '../components/SlidePanelStack';
import { useSlidePanel } from '../context/SlidePanelContext';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { CommandPalette } from '../components/layout/CommandPalette';
import { useWorkCounts } from '../hooks/useWorkCounts';

const COLLAPSED_KEY = 'buildappraisal:sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Khung ứng dụng (U2): menu trái hai tông, thanh trên, tìm nhanh Ctrl+K, chuông hạn. */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [isSmallScreen, setIsSmallScreen] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const compact = collapsed || isSmallScreen;
  const counts = useWorkCounts();
  const { closeAllPanels } = useSlidePanel();
  const location = useLocation();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsSmallScreen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Đổi phân hệ thì đóng các Slide Panel của phân hệ trước.
  const modulePath =
    location.pathname.startsWith('/projects') || location.pathname.startsWith('/dossiers/')
      ? 'projects'
      : location.pathname.split('/')[1] || 'dashboard';
  const previousModulePath = useRef(modulePath);
  useEffect(() => {
    if (previousModulePath.current !== modulePath) {
      closeAllPanels();
      previousModulePath.current = modulePath;
    }
  }, [modulePath, closeAllPanels]);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // chỉ áp trong phiên
      }
      return !value;
    });

  // Ctrl+K / Cmd+K ở mọi nơi; "/" khi không gõ trong ô nhập và không có hộp thoại mở.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[role=dialog]'));
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.body.dataset.modalOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page dark:bg-slate-950 text-ink dark:text-slate-100 select-none">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-dropdown"
      >
        Bỏ qua menu, tới nội dung chính
      </a>
      <Sidebar compact={compact} collapsed={collapsed} onToggle={toggleCollapsed} counts={counts} />

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar counts={counts} onSearch={() => setPaletteOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-page dark:bg-slate-950 p-3 sm:p-6 focus:outline-none"
        >
          <Outlet />
        </main>
      </div>

      <SlidePanelStack sidebarWidth={compact ? 76 : 264} />
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
