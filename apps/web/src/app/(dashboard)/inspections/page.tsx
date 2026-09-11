"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEntityPanel } from '@/panels/useEntityPanel';
import { 
  ClipboardCheck, 
  Search, 
  Filter, 
  Plus, 
  Calendar, 
  MapPin, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText,
  ShieldAlert
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { open } = useEntityPanel();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await api.getInspections();
        setInspections(data);
      } catch (err) {
        console.error('Lỗi tải danh sách hậu kiểm:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredInspections = inspections.filter((item) => {
    const matchesSearch = 
      item.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.dossierCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.inspector.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Đã hoàn thành</Badge>;
      case 'SCHEDULED':
        return <Badge variant="info" className="gap-1"><Clock className="h-3 w-3" /> Đã lên lịch</Badge>;
      case 'VIOLATION_RECORDED':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Có vi phạm</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Hậu kiểm Công trình Xây dựng
              </h2>
              <p className="text-sm text-muted-foreground">
                Tăng cường kiểm tra hiện trường sau thẩm định và sau cấp phép theo Luật Xây dựng sửa đổi 2025
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Lập kế hoạch kiểm tra mới
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng số đợt hậu kiểm
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{inspections.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Đợt kiểm tra hiện trường quý I/2026</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Đã kiểm tra đạt chuẩn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {inspections.filter(i => i.status === 'COMPLETED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Tuân thủ đúng TKCS & GPXD được duyệt</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Kế hoạch sắp tới
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {inspections.filter(i => i.status === 'SCHEDULED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Trong 15 ngày tới tại các huyện</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
              Tỷ lệ tuân thủ hiện trường
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">100%</div>
            <p className="text-xs text-muted-foreground mt-1">Toàn tỉnh Điện Biên (0 vi phạm nghiêm trọng)</p>
          </CardContent>
        </Card>
      </div>

      {/* Standard Filter Bar Layout (Quy chuẩn ERP) */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-3">
        {/* Vị trí 1: Tìm kiếm */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên công trình, mã hồ sơ, cán bộ kiểm tra..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Vị trí 2: Phân loại trạng thái */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Trạng thái:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-2 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="SCHEDULED">Đã lên lịch</option>
            <option value="COMPLETED">Đã hoàn thành</option>
            <option value="VIOLATION_RECORDED">Có vi phạm</option>
          </select>
        </div>
      </div>

      {/* Danh sách các đợt hậu kiểm */}
      <div className="grid gap-4">
        {filteredInspections.map((item) => (
          <Card key={item.id} className="border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span 
                      onClick={() => open('dossier', { id: item.dossierCode })}
                      className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {item.dossierCode}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="text-xs font-medium text-slate-500">{item.inspectionType}</span>
                    {getStatusBadge(item.status)}
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {item.projectName}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-xs text-slate-600 dark:text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{item.inspector}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Ngày kiểm tra: {formatDate(item.scheduleDate)}</span>
                    </div>
                  </div>

                  {/* Kết quả kiểm tra / Hiện trạng */}
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      <strong>Nội dung:</strong> {item.resultSummary}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                      <strong>Ghi nhận hiện trường:</strong> {item.findings}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex md:flex-col gap-2 shrink-0 justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => open('dossier', { id: item.dossierCode })}
                    className="text-xs h-8 gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" /> Xem hồ sơ gốc
                  </Button>
                  <Button 
                    size="sm" 
                    className="text-xs h-8 gap-1.5 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" /> Biên bản hiện trường
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredInspections.length === 0 && (
          <div className="p-12 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-400">Không tìm thấy đợt kiểm tra phù hợp với bộ lọc.</p>
          </div>
        )}
      </div>
    </div>
  );
}
