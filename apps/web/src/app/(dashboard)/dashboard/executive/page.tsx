import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExecutiveDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard Lãnh đạo Sở</h2>
        <span className="text-sm text-muted-foreground">Sở Xây dựng tỉnh Điện Biên</span>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tổng hồ sơ tháng</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">245</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tỷ lệ đúng hạn</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">96.5%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Thời gian xử lý TB</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">4.2 ngày</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Đang chờ ký</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">12</div></CardContent>
        </Card>
      </div>

      <Card className="h-64 flex items-center justify-center bg-slate-50">
        <p className="text-muted-foreground">[Biểu đồ phân bố theo loại công trình placeholder]</p>
      </Card>
    </div>
  );
}
