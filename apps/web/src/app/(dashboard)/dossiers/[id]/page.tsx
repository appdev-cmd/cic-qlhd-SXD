import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileIcon, Clock, CheckCircle2 } from "lucide-react";

export default async function DossierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Dự án Trường Tiểu học Thanh Xương</h2>
          <p className="text-muted-foreground">Mã HS: {id} | Báo cáo Nghiên cứu Khả thi</p>
        </div>
        <div className="text-right">
          <Badge variant="info" className="mb-2">Đang thẩm định</Badge>
          <div className="flex items-center text-sm font-medium text-red-600">
            <Clock className="mr-1 h-4 w-4" /> Thời hạn còn lại: 3 ngày
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground block">Chủ đầu tư:</span><span className="font-medium">UBND Huyện Điện Biên</span></div>
              <div><span className="text-muted-foreground block">Địa điểm:</span><span className="font-medium">Xã Thanh Xương, H. Điện Biên</span></div>
              <div><span className="text-muted-foreground block">Nhóm dự án:</span><span className="font-medium">Nhóm C</span></div>
              <div><span className="text-muted-foreground block">Cấp công trình:</span><span className="font-medium">Cấp III</span></div>
              <div><span className="text-muted-foreground block">Tổng mức đầu tư:</span><span className="font-medium">15.000.000.000 VNĐ</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tài liệu đính kèm</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-2 border rounded-md hover:bg-slate-50 cursor-pointer">
                <FileIcon className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">To_Trinh_Tham_Dinh.pdf</span>
              </div>
              <div className="flex items-center gap-3 p-2 border rounded-md hover:bg-slate-50 cursor-pointer">
                <FileIcon className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Ban_Ve_Thiet_Ke_Co_So.pdf</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader><CardTitle>Quy trình thẩm định</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div><p className="text-sm font-medium">Tiếp nhận hồ sơ</p><p className="text-xs text-muted-foreground">05/03/2025</p></div>
                </div>
                <div className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div><p className="text-sm font-medium">Kiểm tra thành phần</p><p className="text-xs text-muted-foreground">06/03/2025</p></div>
                </div>
                <div className="flex gap-3 relative before:absolute before:left-2.5 before:top-6 before:h-8 before:w-0.5 before:bg-blue-200">
                  <div className="h-5 w-5 rounded-full border-2 border-blue-500 bg-blue-100 flex items-center justify-center mt-0.5"><div className="h-2 w-2 rounded-full bg-blue-500" /></div>
                  <div><p className="text-sm font-medium text-blue-600">Thẩm định chuyên môn</p><p className="text-xs text-muted-foreground">Đang thực hiện</p></div>
                </div>
                <div className="flex gap-3 pt-6">
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 mt-0.5" />
                  <div><p className="text-sm font-medium text-muted-foreground">Phê duyệt & Trả kết quả</p></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
