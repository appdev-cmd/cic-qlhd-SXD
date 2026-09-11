"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Plus, 
  ShieldCheck, 
  Search, 
  MapPin, 
  Calendar, 
  Clock, 
  Printer, 
  CheckCircle2,
  Building2,
  ExternalLink
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useEntityPanel } from "@/panels/useEntityPanel";
import { A4DocumentPreview } from "@/components/documents/A4DocumentPreview";
import { useChildFormGuard } from "@/hooks/useChildFormGuard";

export default function PermitsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPermitForA4, setSelectedPermitForA4] = useState<any>(null);
  const { open } = useEntityPanel();

  useChildFormGuard(!!selectedPermitForA4);

  const permits = [
    {
      id: 'permit-001',
      permitNumber: '01/GPXD-SXD',
      code: 'SXD-DB-2026-0003',
      projectName: 'Khu thương mại dịch vụ và nhà ở Him Lam',
      investor: 'Công ty CP Đầu tư Xây dựng Him Lam Điện Biên',
      location: 'Phường Him Lam, TP. Điện Biên Phủ, Tỉnh Điện Biên',
      issueDate: '2026-02-15',
      expireDate: '2027-02-15',
      grade: 'Cấp II',
      stories: '5 tầng + 1 tum',
      totalArea: '14.500 m²',
      status: 'ISSUED',
      statusText: 'Đã cấp giấy phép',
    },
    {
      id: 'permit-002',
      permitNumber: '02/GPXD-SXD',
      code: 'SXD-DB-2026-0004',
      projectName: 'Khách sạn Mường Thanh Điện Biên Grand (Giai đoạn 2)',
      investor: 'Tập đoàn Khách sạn Mường Thanh',
      location: 'Đường Võ Nguyên Giáp, TP. Điện Biên Phủ',
      issueDate: '2026-02-28',
      expireDate: '2027-02-28',
      grade: 'Cấp I',
      stories: '11 tầng',
      totalArea: '22.800 m²',
      status: 'ISSUED',
      statusText: 'Đã cấp giấy phép',
    },
    {
      id: 'permit-003',
      permitNumber: 'Chưa cấp số',
      code: 'SXD-DB-2026-0005',
      projectName: 'Trung tâm Hội chợ Triển lãm Văn hóa các Dân tộc Điện Biên',
      investor: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Điện Biên',
      location: 'Phường Thanh Trường, TP. Điện Biên Phủ',
      issueDate: '2026-03-05',
      expireDate: '—',
      grade: 'Cấp II',
      stories: '2 tầng',
      totalArea: '8.200 m²',
      status: 'PROCESSING',
      statusText: 'Đang thẩm tra cấp phép',
    },
  ];

  const filtered = permits.filter(p => 
    p.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.permitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cấp Giấy phép Xây dựng (GPXD)
          </h2>
          <p className="text-sm text-muted-foreground">
            Quản lý và cấp GPXD thuộc thẩm quyền Sở Xây dựng (Công trình Cấp I, Cấp II theo Luật Xây dựng 2025)
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tạo hồ sơ cấp phép mới
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hồ sơ tiếp nhận mới</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground mt-1">Chờ đối chiếu bản vẽ thiết kế</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đang xử lý thẩm tra</CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground mt-1">Trong hạn quy định SLA (10 ngày làm việc)</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đã cấp phép năm 2026</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">24</div>
            <p className="text-xs text-muted-foreground mt-1">100% cấp đúng thẩm quyền NĐ 217/2026</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo số giấy phép, tên công trình, chủ đầu tư..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Danh sách GPXD */}
      <div className="grid gap-4">
        {filtered.map((item) => (
          <Card key={item.id} className="border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/50">
                      {item.permitNumber}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span 
                      onClick={() => open('dossier', { id: item.code })}
                      className="text-xs text-slate-500 font-mono hover:text-blue-600 cursor-pointer"
                    >
                      Mã hồ sơ: {item.code}
                    </span>
                    <Badge variant={item.status === 'ISSUED' ? 'success' : 'warning'}>
                      {item.statusText}
                    </Badge>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {item.projectName}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{item.investor}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Cấp ngày: {formatDate(item.issueDate)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2 text-xs text-slate-500">
                    <span className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800">Cấp: <strong>{item.grade}</strong></span>
                    <span className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800">Quy mô: <strong>{item.stories}</strong></span>
                    <span className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800">Tổng sàn: <strong>{item.totalArea}</strong></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex md:flex-col gap-2 shrink-0 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setSelectedPermitForA4({
                      id: item.id,
                      code: item.code,
                      project: {
                        name: item.projectName,
                        investor: item.investor,
                        location: item.location,
                        constructionGrade: item.grade,
                        constructionType: 'Công trình dân dụng',
                        totalInvestment: 120000000000,
                      }
                    })}
                    className="text-xs h-8 gap-1.5 text-orange-600 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                  >
                    <Printer className="h-3.5 w-3.5" /> Xem Giấy phép A4
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => open('dossier', { id: item.code })}
                    className="text-xs h-8 gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Hồ sơ gốc
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal In Văn bản Chuẩn A4 */}
      {selectedPermitForA4 && (
        <A4DocumentPreview
          dossier={selectedPermitForA4}
          onClose={() => setSelectedPermitForA4(null)}
        />
      )}
    </div>
  );
}
