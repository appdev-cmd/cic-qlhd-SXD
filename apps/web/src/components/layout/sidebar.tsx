import Link from "next/link";
import { LayoutDashboard, FolderOpen, FileText, MessageSquare, PieChart, Settings, ClipboardCheck, BarChart3 } from "lucide-react";

export function Sidebar() {
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
    <aside className="hidden w-64 flex-col border-r bg-background md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-lg font-bold text-primary">BuildAppraisal AI</h2>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
