"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityLink } from "@/components/ui/EntityLink";
import { useEntityPanel } from "@/panels/useEntityPanel";
import { Plus, Search, RefreshCw, Layers } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api";

export default function DossiersPage() {
  const { openCreateDossier } = useEntityPanel();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const loadDossiers = async () => {
    setLoading(true);
    try {
      const res = await api.getDossiers();
      if (res && res.data) {
        setDossiers(res.data);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách hồ sơ từ Supabase:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDossiers();
  }, []);

  // Bộ lọc dữ liệu phía Client
  const filteredDossiers = useMemo(() => {
    return dossiers.filter((d) => {
      const matchSearch =
        !searchQuery ||
        (d.code && d.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.project?.name && d.project.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.notes && d.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType = !filterType || d.type === filterType;
      const matchStatus = !filterStatus || d.status === filterStatus;

      return matchSearch && matchType && matchStatus;
    });
  }, [dossiers, searchQuery, filterType, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Hồ sơ thẩm định & Cấp phép
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sở Xây dựng tỉnh Điện Biên — Hệ thống quản lý thẩm định NĐ 217/2026/NĐ-CP (Dữ liệu Supabase)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadDossiers}
            disabled={loading}
            className="h-9 w-9 text-slate-500"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => openCreateDossier(loadDossiers)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" /> Tiếp nhận hồ sơ mới
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          {/* Thứ tự thanh lọc chuẩn ERP: [1. Tìm kiếm] -> [2. Phân loại] -> [3. Phụ trách] -> [4. Trạng thái SLA] */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Tìm theo mã HS, tên dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Tất cả loại hồ sơ</option>
              <option value="APPRAISAL_BCNCKT">Báo cáo NCKT (Mẫu 01)</option>
              <option value="PERMIT_GPXD">Giấy phép xây dựng (GPXD)</option>
            </select>
            <select
              className="border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Phòng QLXD phụ trách</option>
              <option value="cv1">Chuyên viên 1</option>
              <option value="cv2">Chuyên viên 2</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="CHECKING">Kiểm tra hợp lệ</option>
              <option value="APPRAISING">Đang thẩm định</option>
              <option value="APPROVED">Đã phê duyệt</option>
              <option value="SUPPLEMENT_REQUIRED">Yêu cầu bổ sung</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Đang tải dữ liệu hồ sơ từ Supabase...
                    </td>
                  </tr>
                )}
                {!loading && filteredDossiers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Không tìm thấy hồ sơ phù hợp. Hãy bấm <strong>&ldquo;Tiếp nhận hồ sơ mới&rdquo;</strong> để tạo hồ sơ đầu tiên!
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredDossiers.map((d) => {
                    const projectName = d.project?.name || d.notes || 'Dự án đầu tư xây dựng';
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <EntityLink type="dossier" id={d.id}>
                            {d.code}
                          </EntityLink>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          <EntityLink type="dossier" id={d.id}>
                            {projectName}
                          </EntityLink>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {d.type === 'APPRAISAL_BCNCKT' ? 'BCNCKT' : 'Cấp GPXD'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              d.status === 'APPROVED'
                                ? 'success'
                                : d.status === 'APPRAISING'
                                ? 'info'
                                : 'warning'
                            }
                          >
                            {d.status === 'APPROVED'
                              ? 'Đã phê duyệt'
                              : d.status === 'APPRAISING'
                              ? 'Đang thẩm định'
                              : d.status === 'SUPPLEMENT_REQUIRED'
                              ? 'Yêu cầu bổ sung'
                              : 'Kiểm tra hợp lệ'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(d.receivedAt || d.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
