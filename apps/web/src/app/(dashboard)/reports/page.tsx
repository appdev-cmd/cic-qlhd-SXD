"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  PieChart, 
  Download, 
  FileText, 
  BarChart3, 
  Calendar, 
  TrendingDown, 
  ShieldCheck, 
  Printer, 
  Filter,
  CheckCircle2,
  Building2
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('Q1_2026');

  const reportTables = [
    {
      category: '1. Thẩm định Báo cáo NCKT / Thiết kế cơ sở',
      count: 28,
      submittedVal: 1250000000000,
      approvedVal: 1222000000000,
      savings: 28000000000,
      complianceRate: '98.2%',
    },
    {
      category: '2. Thẩm định Báo cáo Kinh tế - Kỹ thuật (KT-KT)',
      count: 14,
      submittedVal: 210000000000,
      approvedVal: 204500000000,
      savings: 5500000000,
      complianceRate: '96.5%',
    },
    {
      category: '3. Cấp Giấy phép Xây dựng (Cấp I & II)',
      count: 6,
      submittedVal: 382000000000,
      approvedVal: 377100000000,
      savings: 4900000000,
      complianceRate: '100%',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Báo cáo & Thống kê Nghiệp vụ Thẩm định
          </h2>
          <p className="text-sm text-muted-foreground">
            Tổng hợp dữ liệu thẩm định, cắt giảm dự toán và an toàn xây dựng tỉnh Điện Biên (Nghị định 217/2026/NĐ-CP)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 text-xs">
            <Printer className="h-4 w-4" /> In báo cáo (A4)
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-4 w-4" /> Xuất Excel báo cáo
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng giá trị cắt giảm ngân sách
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">38.400.000.000 VNĐ</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tiết kiệm ~2.08% tổng mức đầu tư qua rà soát định mức Thông tư 12/2021
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Tiến độ giải quyết hồ sơ đúng hạn
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">97.9%</div>
            <p className="text-xs text-muted-foreground mt-1">
              47/48 hồ sơ hoàn thành đúng và trước thời hạn SLA 15 ngày làm việc
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
              Tuân thủ Quy chuẩn Kỹ thuật
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">98.2%</div>
            <p className="text-xs text-muted-foreground mt-1">
              100% hồ sơ được quét tự động qua AI Quy chuẩn QCVN 01 & QCVN 06
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bảng báo cáo chi tiết */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Tổng hợp Kết quả Thẩm định theo Loại Thủ tục (Quý I/2026)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Số liệu trích xuất từ Hệ thống Quản lý CSDL Thẩm định Sở Xây dựng Điện Biên
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Kỳ báo cáo:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="text-xs py-1.5 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200"
              >
                <option value="Q1_2026">Quý I/2026</option>
                <option value="YEAR_2025">Cả năm 2025</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Loại thủ tục thẩm định</th>
                <th className="py-3 px-4 font-semibold text-center">Số lượng</th>
                <th className="py-3 px-4 font-semibold text-right">TMĐT Đăng ký (VNĐ)</th>
                <th className="py-3 px-4 font-semibold text-right">TMĐT Sau thẩm định (VNĐ)</th>
                <th className="py-3 px-4 font-semibold text-right text-emerald-600">Giá trị giảm trừ (VNĐ)</th>
                <th className="py-3 px-4 font-semibold text-center">Tỷ lệ tuân thủ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reportTables.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{r.category}</td>
                  <td className="py-3 px-4 text-center">{r.count}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(r.submittedVal)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(r.approvedVal)}</td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatCurrency(r.savings)}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="success" className="text-[10px]">{r.complianceRate}</Badge>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50/80 dark:bg-slate-800/80 font-bold border-t border-slate-200 dark:border-slate-700">
                <td className="py-3 px-4 text-slate-900 dark:text-slate-100">TỔNG CỘNG TOÀN TỈNH:</td>
                <td className="py-3 px-4 text-center">48</td>
                <td className="py-3 px-4 text-right">{formatCurrency(1842000000000)}</td>
                <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">{formatCurrency(1803600000000)}</td>
                <td className="py-3 px-4 text-right text-emerald-600">{formatCurrency(38400000000)}</td>
                <td className="py-3 px-4 text-center">
                  <Badge variant="success" className="text-[10px]">98.1%</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
