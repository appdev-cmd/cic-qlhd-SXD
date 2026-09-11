import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function DossiersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Danh sách Hồ sơ</h2>
        <Button><Plus className="mr-2 h-4 w-4" /> Tiếp nhận hồ sơ mới</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <Input placeholder="Tìm kiếm mã, tên dự án..." className="max-w-sm" />
            <select className="border border-input rounded-md px-3 text-sm bg-background">
              <option value="">Tất cả loại</option>
              <option value="bcnckt">BCNCKT</option>
              <option value="gpxd">Cấp phép xây dựng</option>
            </select>
            <select className="border border-input rounded-md px-3 text-sm bg-background">
              <option value="">Tất cả trạng thái</option>
              <option value="reviewing">Đang kiểm tra</option>
              <option value="appraising">Đang thẩm định</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
           <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3">Mã HS</th>
                  <th className="px-4 py-3">Tên dự án</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày nhận</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-4 py-3 font-medium text-primary"><Link href="/dossiers/HS-2025-001">HS-2025-001</Link></td>
                  <td className="px-4 py-3">Trường Tiểu học Thanh Xương</td>
                  <td className="px-4 py-3">BCNCKT</td>
                  <td className="px-4 py-3"><Badge variant="info">Đang thẩm định</Badge></td>
                  <td className="px-4 py-3">05/03/2025</td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-medium text-primary"><Link href="/dossiers/HS-2025-002">HS-2025-002</Link></td>
                  <td className="px-4 py-3">Đường nội thị Thị xã Mường Lay</td>
                  <td className="px-4 py-3">TKCS</td>
                  <td className="px-4 py-3"><Badge variant="warning">Đang kiểm tra</Badge></td>
                  <td className="px-4 py-3">08/03/2025</td>
                </tr>
              </tbody>
            </table>
        </CardContent>
      </Card>
    </div>
  );
}
