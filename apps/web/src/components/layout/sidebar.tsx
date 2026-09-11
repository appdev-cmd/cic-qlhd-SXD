"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  MessageSquare,
  PieChart,
  Settings,
  ClipboardCheck,
  BarChart3,
  Building2,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Tổng quan", href: "/dashboard", icon: LayoutDashboard },
    { name: "Dashboard Lãnh đạo", href: "/dashboard/executive", icon: BarChart3 },
    { name: "Hồ sơ thẩm định", href: "/dossiers", icon: FolderOpen },
    { name: "Cấp phép xây dựng", href: "/permits", icon: FileText },
    { name: "Hậu kiểm xây dựng", href: "/inspections", icon: ClipboardCheck },
    { name: "Trợ lý pháp luật", href: "/assistant", icon: MessageSquare },
    { name: "Báo cáo", href: "/reports", icon: PieChart },
    { name: "Cài đặt", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="hidden w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:flex shrink-0 transition-colors">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
            BuildAppraisal
          </h2>
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Sở Xây dựng Điện Biên
          </span>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-xs border border-blue-200/60 dark:border-blue-800"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
