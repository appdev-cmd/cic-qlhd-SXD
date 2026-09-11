"use client";

import { useEffect, useState } from "react";
import { Bell, User, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/Tooltip";

export function Header() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Đồng bộ trạng thái theme từ localStorage hoặc class
    const saved = localStorage.getItem("ba_theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else if (saved === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("ba_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("ba_theme", "light");
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 shrink-0 transition-colors">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Hệ thống Thẩm định Dự án Xây dựng
        </h1>
        <span className="hidden sm:inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Sở Xây dựng Điện Biên
        </span>
      </div>

      <div className="flex items-center space-x-2">
        <Tooltip content={isDark ? "Chuyển sang Giao diện Sáng" : "Chuyển sang Giao diện Tối"} placement="bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="h-9 w-9 p-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600 dark:text-slate-300" />}
          </Button>
        </Tooltip>

        <Tooltip content="Thông báo hệ thống" placement="bottom">
          <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-red-600"></span>
          </Button>
        </Tooltip>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <div className="flex items-center space-x-2.5 pl-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-xs shadow-sm">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden flex-col md:flex text-left">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Nguyễn Văn A</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Chuyên viên QLXD</span>
          </div>
        </div>
      </div>
    </header>
  );
}
