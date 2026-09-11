import { Bell, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <h1 className="text-xl font-semibold">Hệ thống Thẩm định Dự án Xây dựng</h1>
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-1.5 flex h-2 w-2 rounded-full bg-red-600"></span>
        </Button>
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden flex-col md:flex">
            <span className="text-sm font-medium">Nguyễn Văn A</span>
            <span className="text-xs text-muted-foreground">Chuyên viên QLXD</span>
          </div>
        </div>
      </div>
    </header>
  );
}
