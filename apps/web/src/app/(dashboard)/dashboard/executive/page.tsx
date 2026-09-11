"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  TrendingUp, 
  Clock, 
  ShieldCheck, 
  DollarSign, 
  MapPin, 
  FileCheck, 
  PieChart, 
  BarChart3, 
  Download,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from 'next/link';

export default function ExecutiveDashboard() {
  const districtStats = [
    { name: 'TP. Điện Biên Phủ', count: 18, totalVal: 720000000000, percentage: 39.1 },
    { name: 'Huyện Điện Biên', count: 10, totalVal: 380000000000, percentage: 20.6 },
    { name: 'Thị xã Mường Lay', count: 5, totalVal: 190000000000, percentage: 10.3 },
    { name: 'Huyện Tuần Giáo', count: 4, totalVal: 165000000000, percentage: 8.9 },
    { name: 'Huyện Mường Ảng', count: 3, totalVal: 110000000000, percentage: 6.0 },
    { name: 'Huyện Mường Chà', count: 2, totalVal: 82000000000, percentage: 4.4 },
    { name: 'Huyện Tủa Chùa', count: 2, totalVal: 75000000000, percentage: 4.1 },
    { name: 'Huyện Nậm Pồ', count: 2, totalVal: 55000000000, percentage: 3.0 },
    { name: 'Huyện Mường Nhé', count: 1, totalVal: 35000000000, percentage: 1.9 },
    { name: 'Huyện Điện Biên Đông', count: 1, totalVal: 30000000000, percentage: 1.6 },
  ];

  const capitalSources = [
    { name: 'Vốn đầu tư công (Ngân sách TW & Tỉnh)', percent: 62, color: 'bg-blue-600' },
    { name: 'Vốn sự nghiệp có tính chất ĐTXD', percent: 18, color: 'bg-emerald-500' },
    { name: 'Vốn ngoài ngân sách & Doanh nghiệp', percent: 20, color: 'bg-orange-500' },
  ];

  const keyProjects = [
    {
      code: 'SXD-DB-2026-0001',
      name: 'Trường Tiểu học Thanh Xương, Huyện Điện Biên',
      investor: 'Ban QLDA huyện Điện Biên',
      totalVal: 15000000000,
      slaDaysLeft: 3,
      status: 'APPRAISING',
      statusText: 'Đang thẩm định',
    },
    {
      code: 'SXD-DB-2026-0002',
      name: 'Nâng cấp đường giao thông nội thị Thị xã Mường Lay',
      investor: 'Ban QLDA các CT Giao thông tỉnh Điện Biên',
      totalVal: 45000000000,
      slaDaysLeft: 5,
      status: 'APPROVED',
      statusText: 'Đã phê duyệt',
    },
    {
      code: 'SXD-DB-2026-0003',
      name: 'Khu thương mại dịch vụ và nhà ở Him Lam',
      investor: 'Công ty CP Đầu tư Xây dựng Him Lam Điện Biên',
      totalVal: 120000000000,
      slaDaysLeft: 7,
      status: 'APPROVED',
      statusText: 'Đã cấp phép',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Dashboard Điều hành Lãnh đạo Sở
            </h2>
            <Badge variant="outline" className="text-blue-600 border-blue-200 dark:border-blue-800">
              Sở Xây dựng tỉnh Điện Biên
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tổng quan tiến độ thẩm định, phân bổ ngân sách TMĐT và an toàn hậu kiểm toàn tỉnh
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <BarChart3 className="h-4 w-4" /> Báo cáo chi tiết
            </Button>
          </Link>
          <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Download className="h-4 w-4" /> Xuất báo cáo Tỉnh ủy & UBND
          </Button>
        </div>
      </div>

      {/* KPI Cards Lãnh đạo */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng hồ sơ thụ lý (2026)
            </CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">48 hồ sơ</div>
            <p className="text-xs text-muted-foreground mt-1">
              TMĐT đăng ký: <strong className="text-blue-600 font-semibold">{formatCurrency(1842000000000)}</strong>
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Tỷ lệ giải quyết đúng hạn SLA
            </CardTitle>
            <Clock className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">97.9%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Trung bình <strong>8.4 ngày</strong> (Quy định NĐ 217/2026: 15 ngày)
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-teal-600 uppercase tracking-wider">
              Tiết kiệm qua thẩm tra AI
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">38,4 tỷ VNĐ</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cắt giảm định mức & trần dự phòng sai lệch
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
              Hậu kiểm an toàn thi công
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">18 công trình</div>
            <p className="text-xs text-muted-foreground mt-1">
              100% đạt chuẩn theo Luật Xây dựng 2025
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid 2 cột: Phân bổ địa bàn và Cơ cấu nguồn vốn */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Cột trái: Phân bổ trên 10 huyện/thị xã/TP Điện Biên */}
        <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  Phân bổ Hồ sơ Thẩm định theo Địa bàn (10 Huyện / Thị xã / TP)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Theo dõi phân bổ nguồn lực xây dựng toàn tỉnh Điện Biên
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                Tổng 10 địa bàn
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {districtStats.map((d) => (
              <div key={d.name} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{d.count} hồ sơ</span>
                    <strong className="text-blue-600 dark:text-blue-400 font-semibold">{formatCurrency(d.totalVal)}</strong>
                    <span className="text-slate-400 w-10 text-right">{d.percentage}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${d.percentage * 2.2}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cột phải: Cơ cấu nguồn vốn & Chỉ đạo nhanh */}
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-emerald-600" />
                Cơ cấu Nguồn vốn Đầu tư
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {capitalSources.map((c) => (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{c.name}</span>
                    <strong className="text-slate-900 dark:text-slate-100">{c.percent}%</strong>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div className={`${c.color} h-full rounded-full`} style={{ width: `${c.percent}%` }} />
                  </div>
                </div>
              ))}

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-muted-foreground leading-relaxed">
                Vốn đầu tư công chiếm tỷ trọng chủ đạo (62%), tập trung vào hạ tầng giao thông và giáo dục vùng biên giới Điện Biên.
              </div>
            </CardContent>
          </Card>

          {/* Hộp ghi chú chỉ đạo lãnh đạo */}
          <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20">
            <CardContent className="p-4 space-y-2 text-xs">
              <p className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                Chỉ đạo điều hành trọng tâm Quý I/2026:
              </p>
              <ul className="list-disc list-inside text-blue-800 dark:text-blue-300 space-y-1 leading-relaxed">
                <li>Ưu tiên thẩm định nhanh các công trình trường học đạt chuẩn quốc gia trước 30/4.</li>
                <li>Siết chặt định mức cước vận chuyển vật liệu cát, đá đồi dốc huyện Nậm Pồ, Mường Nhé.</li>
                <li>Tăng cường 100% hậu kiểm hiện trường sau khi cấp GPXD đối với công trình cấp II trở lên.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Danh sách các Dự án trọng điểm đang thẩm định */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Dự án Trọng điểm Đang Giám sát Tiến độ Thẩm định
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Theo dõi sát sao hạn định SLA theo Nghị định 217/2026/NĐ-CP
              </p>
            </div>
            <Link href="/dossiers">
              <Button variant="ghost" size="sm" className="text-xs text-blue-600">
                Xem toàn bộ hồ sơ &rarr;
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {keyProjects.map((p) => (
              <div key={p.code} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{p.code}</span>
                    <Badge variant={p.status === 'APPROVED' ? 'success' : 'info'} className="text-[10px]">
                      {p.statusText}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</h4>
                  <p className="text-xs text-muted-foreground">{p.investor}</p>
                </div>

                <div className="flex items-center gap-6 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Tổng mức đầu tư</span>
                    <strong className="text-sm text-slate-900 dark:text-slate-100 font-semibold">
                      {formatCurrency(p.totalVal)}
                    </strong>
                  </div>

                  <div className="text-right min-w-[90px]">
                    <span className="text-xs text-slate-400 block">Hạn SLA</span>
                    <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
                      Còn {p.slaDaysLeft} ngày
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
