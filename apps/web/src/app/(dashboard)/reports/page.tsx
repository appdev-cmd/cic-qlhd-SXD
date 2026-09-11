import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Báo cáo & Thống kê Thẩm định</h2>
          <p className="text-sm text-muted-foreground">
            Tổng hợp dữ liệu thẩm định dự án xây dựng toàn tỉnh Điện Biên
          </p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Xuất báo cáo Excel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tiến độ giải quyết hồ sơ</CardTitle>
            <PieChart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span>Đúng và trước hạn:</span>
                <span className="font-semibold text-emerald-600">92%</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>Đang xử lý trong hạn:</span>
                <span className="font-semibold text-blue-600">6%</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Quá hạn:</span>
                <span className="font-semibold text-red-600">2%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tổng giá trị cắt giảm sau thẩm định</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">14.850.000.000 VNĐ</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tiết kiệm ngân sách nhà nước thông qua kiểm soát định mức & suất vốn đầu tư
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
