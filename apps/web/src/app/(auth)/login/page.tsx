"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Building2, UserCheck, AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";

const DEMO_ACCOUNTS = [
  {
    roleName: "Chuyên viên QLXD",
    email: "chuyenvien1@dienbien.gov.vn",
    password: "password123",
    badge: "Thẩm định hồ sơ",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  {
    roleName: "Trưởng phòng QLXD",
    email: "truongphong@dienbien.gov.vn",
    password: "password123",
    badge: "Phê duyệt & Chuyển",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  },
  {
    roleName: "Giám đốc Sở",
    email: "giamdoc@dienbien.gov.vn",
    password: "password123",
    badge: "Ký duyệt kết quả",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  },
  {
    roleName: "Quản trị hệ thống",
    email: "admin@dienbien.gov.vn",
    password: "password123",
    badge: "Toàn quyền Admin",
    badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("chuyenvien1@dienbien.gov.vn");
  const [password, setPassword] = useState("password123");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      setError("Vui lòng nhập email công vụ");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await api.login({ email, password });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDemoAccount = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 transition-colors">
      <div className="mb-6 text-center max-w-md">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          BuildAppraisal AI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-medium">
          Hệ thống AI Hỗ trợ Thẩm định Dự án Xây dựng
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Sở Xây dựng tỉnh Điện Biên
        </div>
      </div>

      <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-800/90 backdrop-blur">
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
            Đăng nhập hệ thống công vụ
          </CardTitle>
          <CardDescription className="text-center text-xs">
            Sử dụng tài khoản thư điện tử công vụ do Sở Xây dựng cấp
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/50 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="email">
                Email công vụ
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nhanvien@dienbien.gov.vn"
                className="h-10 text-sm bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                Mật khẩu
              </label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 text-sm bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Button
              className="w-full h-10 font-semibold gap-2 shadow-sm"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  Đăng nhập
                </>
              )}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-800 px-2 text-muted-foreground font-medium">
                Hoặc chọn nhanh tài khoản mẫu
              </span>
            </div>
          </div>

          {/* Quick Select Demo Accounts */}
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => {
              const isSelected = email === acc.email;
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSelectDemoAccount(acc)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {acc.roleName}
                  </span>
                  <span className={`mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${acc.badgeColor}`}>
                    {acc.badge}
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground truncate w-full">
                    {acc.email}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <p>© 2026 Sở Xây dựng tỉnh Điện Biên — Bản quyền phần mềm thẩm định công trình</p>
        <p className="mt-0.5 text-[11px] opacity-75">Tuân thủ Nghị định 217/2026/NĐ-CP & Luật Xây dựng 2025</p>
      </footer>
    </div>
  );
}
