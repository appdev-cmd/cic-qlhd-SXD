import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  UserCheck,
  Bot,
  Coins,
  MapPin,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileCheck,
  Sun,
  Moon,
  Leaf,
  ShieldCheck,
  Check,
  ZoomIn,
  ZoomOut,
  LogOut,
  Building,
  Sliders,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme, PRIMARY_COLORS, type Theme, type PrimaryColor } from '../context/ThemeContext';
import { SlidePanelStack } from '../components/SlidePanelStack';
import { AiChatWidget } from '../components/ai/AiChatWidget';
import { Tooltip } from '../components/ui/Tooltip';
import { useSlidePanel } from '../context/SlidePanelContext';

import {useAuth} from '../context/AuthContext';
import { PROJECT_PROCEDURES } from '../lib/projectProcedures';

interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  isAi?: boolean;
  isNew?: boolean;
  children?:NavItem[];
}

// Danh sách Menu chuẩn 9 phân hệ nghiệp vụ — đánh số thứ tự chuẩn chỉ theo mẫu quản trị
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: '1. Dashboard & Thống kê', shortLabel: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: '2. Quản lý Dự án', shortLabel: 'Dự án', icon: FolderKanban,  children:[
    {to:PROJECT_PROCEDURES.bcnckt.path,label:PROJECT_PROCEDURES.bcnckt.label,shortLabel:'BCNCKT',icon:ShieldCheck},
    {to:PROJECT_PROCEDURES.gpxd.path,label:PROJECT_PROCEDURES.gpxd.label,shortLabel:'GPXD',icon:FileText},
    {to:PROJECT_PROCEDURES.nghiem_thu.path,label:PROJECT_PROCEDURES.nghiem_thu.label,shortLabel:'Nghiệm thu',icon:FileCheck},
  ] },
  { to: '/organizations', label: '3. Tổ chức tham gia', shortLabel: 'Tổ chức', icon: Building2 },
  { to: '/personnel', label: '4. Cá nhân hành nghề', shortLabel: 'Cá nhân', icon: UserCheck },
  { to: '/legal-ai', label: '5. Trợ lý AI Pháp luật', shortLabel: 'AI Luật', icon: Bot, isAi: true },
  { to: '/cost-database', label: '6. Giá & Định mức ĐB', shortLabel: 'Giá VLXD', icon: Coins },
  { to: '/gis-map', label: '7. Bản đồ Quy hoạch', shortLabel: 'Bản đồ GIS', icon: MapPin },
  { to: '/documents', label: '8. Văn bản & In ấn A4', shortLabel: 'Văn bản A4', icon: FileText },
  { to: '/settings', label: '9. Cài đặt Hệ thống', shortLabel: 'Cài đặt', icon: Settings },
];

export function AppLayout() {
  const {profile,mode,signOut}=useAuth();
  const [authError,setAuthError]=useState('');
  const userName=profile?.full_name||'Chuyên viên mẫu';
  const userDepartment=profile?.department||'Phòng Quản lý Xây dựng';
  const initials=userName.split(' ').slice(-2).map(s=>s[0]).join('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const compactMenu = isCollapsed || isSmallScreen;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsSmallScreen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, primaryColor, setPrimaryColor, zoom, setZoom } = useTheme();
  const { closeAllPanels } = useSlidePanel();
  const location = useLocation();
  const modulePath = location.pathname.startsWith('/projects') || location.pathname.startsWith('/dossiers/')
    ? 'projects'
    : location.pathname.split('/')[1] || 'dashboard';
  const previousModulePath = useRef(modulePath);
  const [projectsExpanded,setProjectsExpanded]=useState(true);
  useEffect(()=>{
    if (previousModulePath.current !== modulePath) {
      closeAllPanels();
      previousModulePath.current = modulePath;
    }
  },[modulePath,closeAllPanels]);
  useEffect(()=>{if(location.pathname.startsWith('/projects')||location.pathname.startsWith('/dossiers/'))setProjectsExpanded(true);},[location.pathname]);

  // Đóng popover profile khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page text-ink select-none">
      {/* ─── SIDEBAR TRÁI ─── */}
      <aside
        style={{ width: compactMenu ? '76px' : '272px' }}
        className={cn(
          'h-full border-r border-border bg-surface flex flex-col justify-between shrink-0 transition-all duration-300 z-30'
        )}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo & Đơn vị chủ quản: UBND TỈNH ĐIỆN BIÊN (vàng ánh kim) & SỞ XÂY DỰNG (xanh óng ánh) */}
          <div className="h-20 px-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Huy hiệu biểu tượng chính quyền & ngành xây dựng */}
              <div className="relative w-11 h-11 shrink-0 rounded-xl p-[2px] bg-gradient-to-br from-amber-400 via-yellow-200 to-amber-600 shadow-md">
                <div className="w-full h-full rounded-[10px] bg-gradient-to-br from-blue-900 via-blue-700 to-blue-600 flex flex-col items-center justify-center text-white">
                  <Building size={16} className="text-amber-300 drop-shadow-sm" />
                  <span className="text-[8px] font-black tracking-widest text-yellow-200 leading-none mt-0.5">SXD</span>
                </div>
              </div>

              {!compactMenu && (
                <div className="flex flex-col min-w-0 justify-center flex-1 pr-1">
                  {/* Dòng trên: UBND TỈNH ĐIỆN BIÊN — Vàng ánh kim */}
                  <h2 className="text-gold-metallic text-[11.5px] font-black uppercase tracking-wider leading-tight whitespace-nowrap">
                    UBND Tỉnh Điện Biên
                  </h2>

                  {/* Dòng dưới: SỞ XÂY DỰNG — Màu xanh giống hệt Bộ Xây dựng bên IBST */}
                  <h1 className="bg-gradient-to-r from-blue-700 via-blue-400 to-blue-800 dark:from-blue-400 dark:via-blue-200 dark:to-blue-400 bg-clip-text text-[14px] font-black uppercase leading-tight tracking-wide text-transparent drop-shadow-sm whitespace-nowrap mt-0.5">
                    Sở Xây dựng
                  </h1>

                  {/* Phụ đề hệ thống */}
                  <p className="text-[8.5px] font-bold text-ink-muted uppercase tracking-tight whitespace-nowrap">
                    Hệ thống Thẩm định • AI
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
              className="hidden md:block p-1.5 rounded-lg hover:bg-subtle dark:hover:bg-slate-800 text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-200 transition-colors shrink-0"
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          {/* Menu Điều hướng với số thứ tự chuẩn mực */}
          <nav className="p-3 space-y-1 overflow-y-auto flex-1">
            {NAV_ITEMS.map(item=>{
              const Icon=item.icon;
              const active=location.pathname===item.to;
              const parentActive=!!item.children&&(location.pathname.startsWith('/projects')||location.pathname.startsWith('/dossiers/'));
              return <div key={item.to}>
                <div className="flex items-center gap-1 [&>div:first-child]:flex-1 [&>div:first-child]:min-w-0">
                  <Tooltip content={item.label} placement="right">
                    <NavLink to={item.to} end aria-label={item.label} className={cn('flex flex-1 items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors',active||parentActive?'bg-primary-50 dark:bg-slate-800 text-primary-800 dark:text-primary-300 font-semibold':'text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle',compactMenu&&'justify-center px-1')}>
                      <Icon size={18} className="shrink-0"/>
                      {!compactMenu&&<span className="flex-1">{item.label}</span>}
                      {!compactMenu&&item.badge&&<span className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-700 px-1.5">{item.badge}</span>}
                    </NavLink>
                  </Tooltip>
                  {item.children&&!compactMenu&&<Tooltip content={projectsExpanded?'Thu gọn phân hệ dự án':'Mở phân hệ dự án'} placement="right"><button type="button" aria-label="Các phân hệ quản lý dự án" aria-expanded={projectsExpanded} onClick={()=>setProjectsExpanded(!projectsExpanded)} className="p-1.5 rounded-lg text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle">{projectsExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button></Tooltip>}
                </div>
                {item.children&&(projectsExpanded||compactMenu)&&<div className={cn('space-y-1 mt-1 [&>div]:block',!compactMenu&&'ml-5 pl-2 border-l border-border dark:border-border')}>
                  {item.children.map(child=>{const ChildIcon=child.icon;const selected=location.pathname===child.to;return <Tooltip key={child.to} content={child.label} placement="right"><NavLink to={child.to} aria-label={child.label} className={cn('flex items-center gap-2 rounded-lg px-2 py-2.5 text-xs',selected?'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 font-semibold':'text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle',compactMenu&&'justify-center')}><ChildIcon size={15} className="shrink-0"/>{!compactMenu&&<span>{child.label}</span>}</NavLink></Tooltip>;})}
                </div>}
              </div>;
            })}
          </nav>

          {/* Footer Sidebar (Thông tin quy định pháp lý) */}
          {!compactMenu && (
            <div className="p-3.5 border-t border-border bg-subtle/50 text-3xs text-ink-muted leading-tight shrink-0">
              <p className="font-bold text-ink">BCNCKT: căn cứ theo thời điểm hồ sơ</p>
              <p className="mt-0.5">Kết quả tự động cần chuyên viên rà soát</p>
            </div>
          )}
        </div>
      </aside>

      {/* ─── NỘI DUNG CHÍNH (HEADER + MAIN VIEW) ─── */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header trên cùng */}
        <header className="h-16 px-3 sm:px-6 border-b border-border dark:border-slate-800 bg-surface dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0 z-20">
          {/* Tiêu đề trang / Breadcrumb */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-ink-muted dark:text-slate-400">
              <span className="hidden lg:inline">Hệ thống Nghiệp vụ Thẩm định</span>
              <span className="hidden lg:inline">/</span>
              <span className="truncate text-ink dark:text-slate-100 font-bold">
                {(location.pathname.startsWith('/projects/')?'Quản lý Dự án / ':'')+(NAV_ITEMS.flatMap(n=>[n,...(n.children||[])]).find(n=>n.to===location.pathname)?.label.replace(/^\d+\.\s*/, '') || (location.pathname.startsWith('/dossiers/')?'Quản lý Dự án / Hồ sơ nộp':'Bàn điều hành'))}
              </span>
            </div>

            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-3xs font-bold border border-emerald-500/20">
              <ShieldCheck size={12} />
              Cấp phép & Thẩm định Cấp tỉnh
            </span>
          </div>

          {/* Công cụ góc phải: Avatar Profile với Popup Cài Đặt Cá Nhân */}
          <div className="flex items-center gap-3">
            {/* Profile Cán bộ + Dropdown Cài đặt Cá nhân (Đồng bộ 100% cic-ibst) */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={cn(
                  'flex items-center gap-2.5 p-1 rounded-xl hover:bg-subtle transition-all cursor-pointer text-left',
                  userMenuOpen && 'bg-subtle ring-1 ring-border'
                )}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs"
                  style={{ backgroundColor: 'var(--color-primary, #00668c)' }}
                >
                  {initials}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight pr-1">
                  <p className="font-bold text-ink flex items-center gap-1.5">
                    {userName}
                  </p>
                  <p className="text-3xs text-primary-600 dark:text-primary-400 font-medium">{userDepartment}</p>
                </div>
              </button>

              {/* Popup Dropdown CÀI ĐẶT CÁ NHÂN (Chuẩn IBST) */}
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-surface border border-border shadow-xl p-4 z-50 animate-fade-in text-xs space-y-4">
                  {/* Header Thông tin User */}
                  <div className="flex items-center gap-3 pb-3 border-b border-border">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0"
                      style={{ backgroundColor: 'var(--color-primary, #00668c)' }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink truncate text-sm">{userName}</p>
                      <p className="text-3xs font-semibold text-primary-600 dark:text-primary-400 truncate">
                        {userDepartment}
                      </p>
                      <p className="text-3xs text-ink-muted truncate">{profile?.email||'Chuyên viên'}</p>
                    </div>
                  </div>

                  {/* Khối Cài Đặt Cá Nhân */}
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs font-bold text-ink-muted uppercase tracking-wider">
                        Cài đặt cá nhân
                      </span>
                      <Sliders size={12} className="text-ink-muted" />
                    </div>

                    {/* 1. Giao diện nền (Theme Switcher 3 Chế độ) */}
                    <div className="space-y-1.5">
                      <div className="text-2xs font-semibold text-ink-secondary">Giao diện nền</div>
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                        <button
                          type="button"
                          onClick={() => setTheme('light')}
                          className={cn(
                            'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                            theme === 'light'
                              ? 'bg-surface text-ink shadow-xs border border-border'
                              : 'text-ink-muted hover:text-ink'
                          )}
                        >
                          <Sun size={13} className="text-amber-500" />
                          Sáng
                        </button>

                        <button
                          type="button"
                          onClick={() => setTheme('nature')}
                          className={cn(
                            'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                            theme === 'nature'
                              ? 'bg-surface text-ink shadow-xs border border-border'
                              : 'text-ink-muted hover:text-ink'
                          )}
                        >
                          <Leaf size={13} className="text-emerald-500" />
                          Bảo vệ
                        </button>

                        <button
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={cn(
                            'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                            theme === 'dark'
                              ? 'bg-surface text-ink shadow-xs border border-border'
                              : 'text-ink-muted hover:text-ink'
                          )}
                        >
                          <Moon size={13} className="text-indigo-400" />
                          Tối
                        </button>
                      </div>
                    </div>

                    {/* 2. Màu sắc chủ đạo (Bảng chọn 9 Chấm Màu Chuẩn IBST) */}
                    <div className="space-y-1.5">
                      <div className="text-2xs font-semibold text-ink-secondary">Màu sắc chủ đạo</div>
                      <div className="grid grid-cols-9 gap-1.5 justify-items-center rounded-xl bg-muted p-2">
                        {PRIMARY_COLORS.map(({ id, name, hex }) => {
                          const isCurrent = primaryColor === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setPrimaryColor(id)}
                              data-tooltip={name}
                              className={cn(
                                'relative w-5 h-5 rounded-full transition-transform hover:scale-115 cursor-pointer flex items-center justify-center',
                                isCurrent && 'scale-110 ring-2 ring-offset-2 ring-offset-surface'
                              )}
                              style={{
                                backgroundColor: hex,
                                ...(isCurrent
                                  ? { boxShadow: `0 0 0 2px var(--bg-surface), 0 0 0 3.5px ${hex}` }
                                  : {}),
                              }}
                            >
                              {isCurrent && <Check size={11} className="text-white" strokeWidth={3} />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-3xs text-ink-muted">
                        Đang chọn:{' '}
                        <span className="font-bold text-ink">
                          {PRIMARY_COLORS.find((c) => c.id === primaryColor)?.name}
                        </span>
                      </p>
                    </div>

                    {/* 3. Cỡ chữ giao diện (Thu phóng Zoom) */}
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <div className="flex justify-between items-center text-2xs font-semibold text-ink-secondary">
                        <span>Cỡ chữ giao diện</span>
                        <span className="font-bold font-mono text-primary-600 dark:text-primary-400">{zoom}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setZoom(Math.max(90, zoom - 10))}
                          disabled={zoom <= 90}
                          data-tooltip="Giảm cỡ chữ 10%"
                          className="p-1 rounded-lg border border-border bg-subtle hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <ZoomOut size={12} />
                        </button>

                        <input
                          type="range"
                          min="90"
                          max="120"
                          step="10"
                          value={zoom}
                          onChange={(e) => setZoom(Number(e.target.value))}
                          className="flex-1 h-1.5 rounded-lg bg-muted appearance-none cursor-pointer accent-[var(--color-primary)]"
                        />

                        <button
                          type="button"
                          onClick={() => setZoom(Math.min(120, zoom + 10))}
                          disabled={zoom >= 120}
                          data-tooltip="Tăng cỡ chữ 10%"
                          className="p-1 rounded-lg border border-border bg-subtle hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <ZoomIn size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Nút Đăng xuất */}
                  <div className="pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {setUserMenuOpen(false);void signOut().catch(e=>setAuthError(e.message));}}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut size={14} />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Nội dung Màn hình thay đổi theo Route */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 bg-page dark:bg-slate-950">
              {authError&&<p role="alert" className="text-red-700 dark:text-red-300 p-3">{authError}</p>}<Outlet />
        </main>
      </div>

      {/* SlidePanel Ngăn xếp Đa tầng & Chatbot */}
      <SlidePanelStack sidebarWidth={compactMenu ? 76 : 272} />
      <AiChatWidget />
    </div>
  );
}
