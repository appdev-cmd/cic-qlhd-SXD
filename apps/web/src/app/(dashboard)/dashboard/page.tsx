"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { EntityLink } from "@/components/ui/EntityLink";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api";

export default function SpecialistDashboard() {
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getDossiers();
      if (res && res.data) {
        setDossiers(res.data);
      }
    } catch (err) {
      console.error("Lỗi nạp dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const total = dossiers.length;
  const appraising = dossiers.filter((d) => d.status === "APPRAISING").length;
  const checking = dossiers.filter((d) => d.status === "CHECKING").length;
  const approved = dossiers.filter((d) => d.status === "APPROVED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Tổng quan Thẩm định & Giám sát SLA
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Phòng Quản lý Xây dựng — Sở Xây dựng tỉnh Điện Biên
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tổng hồ sơ tiếp nhận</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : total}</div>
            <p className="text-xs text-muted-foreground">Từ DVC Tân Dân & Tiếp nhận trực tiếp</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đang thẩm định</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : appraising}</div>
            <p className="text-xs text-muted-foreground">Theo quy định NĐ 217/2026</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kiểm tra hợp lệ</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{loading ? "..." : checking}</div>
            <p className="text-xs text-muted-foreground">Thời hạn thụ lý: 05 ngày làm việc</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Đã phê duyệt</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{loading ? "..." : approved}</div>
            <p className="text-xs text-muted-foreground">Tỷ lệ đúng hạn: 100%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ cần xử lý trong tuần</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Mã HS</th>
                  <th className="px-4 py-3">Tên dự án</th>
                  <th className="px-4 py-3">Loại thủ tục</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày nhận</th>
                  <th className="px-4 py-3">Hạn SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      Đang tải danh sách hồ sơ từ Supabase...
                    </td>
                  </tr>
                )}
                {!loading && dossiers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      Chưa có hồ sơ nào trong hệ thống.
                    </td>
                  </tr>
                )}
                {!loading &&
                  dossiers.map((d) => {
                    const projectName = d.project?.name || d.notes || "Dự án đầu tư xây dựng";
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
                          {d.type === "APPRAISAL_BCNCKT" ? "BCNCKT" : "Cấp GPXD"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              d.status === "APPROVED"
                                ? "success"
                                : d.status === "APPRAISING"
                                ? "info"
                                : "warning"
                            }
                          >
                            {d.status === "APPROVED"
                              ? "Đã phê duyệt"
                              : d.status === "APPRAISING"
                              ? "Đang thẩm định"
                              : d.status === "SUPPLEMENT_REQUIRED"
                              ? "Yêu cầu bổ sung"
                              : "Kiểm tra hợp lệ"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(d.receivedAt || d.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-blue-600 font-medium">
                          {d.status === "APPROVED" ? "Hoàn tất" : "Còn 3 ngày LV"}
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
