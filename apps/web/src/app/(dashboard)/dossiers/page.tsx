import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityLink } from "@/components/ui/EntityLink";
import { Plus, Search } from "lucide-react";

export default function DossiersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Hồ sơ thẩm định & Cấp phép</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sở Xây dựng tỉnh Điện Biên — Hệ thống quản lý thẩm định NĐ 217/2026/NĐ-CP</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="mr-2 h-4 w-4" /> Tiếp nhận hồ sơ mới</Button>
      </div>

      <Card>
        <CardHeader>
          {/* Thứ tự thanh lọc chuẩn ERP: [1. Tìm kiếm] -> [2. Phân loại] -> [3. Phụ trách] -> [4. Trạng thái SLA] */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Tìm theo mã HS, tên dự án..." className="pl-9" />
            </div>
            <select className="border border-input rounded-md px-3 py-1.5 text-sm bg-background">
              <option value="">Tất cả loại hồ sơ</option>
              <option value="bcnckt">Báo cáo NCKT (Mẫu 01)</option>
              <option value="tkcs">Thiết kế cơ sở (TKCS)</option>
              <option value="gpxd">Giấy phép xây dựng (GPXD)</option>
            </select>
            <select className="border border-input rounded-md px-3 py-1.5 text-sm bg-background">
              <option value="">Phòng QLXD phụ trách</option>
              <option value="cv1">Chuyên viên 1</option>
              <option value="cv2">Chuyên viên 2</option>
            </select>
            <select className="border border-input rounded-md px-3 py-1.5 text-sm bg-background">
              <option value="">Tất cả trạng thái</option>
              <option value="checking">Kiểm tra hợp lệ</option>
              <option value="appraising">Đang thẩm định</option>
              <option value="approved">Đã phê duyệt</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
           <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Mã HS</th>
                  <th className="px-4 py-3">Tên dự án</th>
                  <th className="px-4 py-3">Loại thủ tục</th>
                  <th className="px-4 py-3">Trạng thái SLA</th>
                  <th className="px-4 py-3">Ngày tiếp nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0001">SXD-DB-2026-0001</EntityLink>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0001">Trường Tiểu học Thanh Xương</EntityLink>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">BCNCKT (Nhóm C)</td>
                  <td className="px-4 py-3"><Badge variant="info">Đang thẩm định (còn 3 ngày)</Badge></td>
                  <td className="px-4 py-3 text-slate-500">01/03/2026</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0002">SXD-DB-2026-0002</EntityLink>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0002">Đường nội thị Thị xã Mường Lay</EntityLink>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">BCNCKT (Nhóm B)</td>
                  <td className="px-4 py-3"><Badge variant="warning">Kiểm tra hợp lệ</Badge></td>
                  <td className="px-4 py-3 text-slate-500">08/03/2026</td>
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0003">SXD-DB-2026-0003</EntityLink>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <EntityLink type="dossier" id="SXD-DB-2026-0003">Khu thương mại dịch vụ và nhà ở Him Lam</EntityLink>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">Cấp GPXD (Cấp II)</td>
                  <td className="px-4 py-3"><Badge variant="info">Đang thẩm duyệt</Badge></td>
                  <td className="px-4 py-3 text-slate-500">02/03/2026</td>
                </tr>
              </tbody>
            </table>
        </CardContent>
      </Card>
    </div>
  );
}

