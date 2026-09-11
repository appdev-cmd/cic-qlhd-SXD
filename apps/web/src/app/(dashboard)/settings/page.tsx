import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cài đặt Hệ thống</h2>
        <p className="text-sm text-muted-foreground">
          Cấu hình tham số thẩm định, kết nối cơ sở dữ liệu và phân quyền cán bộ
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin Đơn vị Thẩm định</CardTitle>
            <CardDescription>Cơ quan chuyên môn về xây dựng trực thuộc</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Đơn vị:</span>
              <span className="font-medium">Sở Xây dựng tỉnh Điện Biên</span>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Cơ sở pháp lý:</span>
              <span className="font-medium">Nghị định 217/2026/NĐ-CP & Luật Xây dựng 2025</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Cổng DVC tích hợp:</span>
              <span className="font-medium">Hệ thống DVC Tân Dân tỉnh Điện Biên</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
