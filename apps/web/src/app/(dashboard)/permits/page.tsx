import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PermitsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cấp giấy phép xây dựng</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý và tiếp nhận hồ sơ đề nghị cấp GPXD thuộc thẩm quyền Sở Xây dựng (công trình cấp I, II)
          </p>
        </div>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Tạo hồ sơ cấp phép mới
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hồ sơ tiếp nhận mới</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground mt-1">Chờ phân công thụ lý</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đang xử lý thẩm định</CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground mt-1">Trong hạn quy định SLA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đã cấp phép tháng này</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground mt-1">Theo NĐ 217/2026/NĐ-CP</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách hồ sơ cấp phép xây dựng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border text-center py-12 text-slate-500 text-sm">
            Hiện tại chưa có hồ sơ nào đang chờ cấp phép trong hàng đợi.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
