import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import Link from "next/link";

const mockDossiers = [
  { id: "HS-2025-001", name: "Trường Tiểu học Thanh Xương", type: "BCNCKT", status: "APPRAISING", sla: "3 ngày", date: "05/03/2025" },
  { id: "HS-2025-002", name: "Đường nội thị Thị xã Mường Lay", type: "TKCS", status: "REVIEWING", sla: "12 ngày", date: "08/03/2025" },
  { id: "HS-2025-003", name: "Khu dân cư Him Lam", type: "GPXD", status: "PENDING_SIGNATURE", sla: "1 ngày", date: "02/03/2025" },
];

export default function SpecialistDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Tổng quan Thẩm định</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tổng hồ sơ</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">128</div>
            <p className="text-xs text-muted-foreground">+12% so với tháng trước</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đang thẩm định</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14</div>
            <p className="text-xs text-muted-foreground">4 hồ sơ cần xử lý ngay</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sắp hết hạn SLA</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">3</div>
            <p className="text-xs text-muted-foreground">Cần ưu tiên xử lý trong tuần</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hoàn thành tháng</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45</div>
            <p className="text-xs text-muted-foreground">Tỷ lệ đúng hạn: 98%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ cần xử lý gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3">Mã HS</th>
                  <th className="px-4 py-3">Tên dự án</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày nhận</th>
                  <th className="px-4 py-3">SLA còn lại</th>
                </tr>
              </thead>
              <tbody>
                {mockDossiers.map((d) => (
                  <tr key={d.id} className="border-b">
                    <td className="px-4 py-3 font-medium text-primary">
                      <Link href={`/dossiers/${d.id}`}>{d.id}</Link>
                    </td>
                    <td className="px-4 py-3">{d.name}</td>
                    <td className="px-4 py-3">{d.type}</td>
                    <td className="px-4 py-3">
                      <Badge variant={d.status === 'APPRAISING' ? 'info' : d.status === 'REVIEWING' ? 'warning' : 'success'}>
                        {d.status === 'APPRAISING' ? 'Đang thẩm định' : d.status === 'REVIEWING' ? 'Đang kiểm tra' : 'Chờ ký duyệt'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{d.date}</td>
                    <td className="px-4 py-3 text-red-500 font-medium">{d.sla}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
