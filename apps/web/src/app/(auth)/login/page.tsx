import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-primary">BuildAppraisal AI</h1>
        <p className="mt-2 text-muted-foreground">Hệ thống AI Hỗ trợ Thẩm định Dự án Xây dựng</p>
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">Đăng nhập hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">Email công vụ</label>
              <Input id="email" type="email" placeholder="nhanvien@dienbien.gov.vn" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">Mật khẩu</label>
              <Input id="password" type="password" />
            </div>
            <Link href="/dashboard" className="block w-full">
              <Button className="w-full" type="button">Đăng nhập</Button>
            </Link>
          </form>
        </CardContent>
      </Card>
      
      <p className="mt-8 text-sm text-muted-foreground">© 2025 Sở Xây dựng tỉnh Điện Biên</p>
    </div>
  );
}
