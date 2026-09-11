"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { EntityLink } from "@/components/ui/EntityLink";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api";

const DEFAULT_DEMO_DOSSIERS = [
  {
    id: "d-001",
    code: "SXD-DB-2026-0001",
    type: "APPRAISAL_BCNCKT",
    status: "APPRAISING",
    receivedAt: "2026-03-01T08:00:00Z",
    project: {
      id: "p-001",
      name: "Trường Tiểu học Thanh Xương, Huyện Điện Biên",
      investor: "Ban Quản lý dự án huyện Điện Biên",
    },
    daysLeft: 3,
  },
  {
    id: "d-002",
    code: "SXD-DB-2026-0002",
    type: "APPRAISAL_TKCS",
    status: "APPROVED",
    receivedAt: "2026-02-20T08:00:00Z",
    project: {
      id: "p-002",
      name: "Nâng cấp đường giao thông nội thị Thị xã Mường Lay",
      investor: "Ban QLDA các CT Giao thông tỉnh Điện Biên",
    },
    daysLeft: 0,
  },
  {
    id: "d-003",
    code: "SXD-DB-2026-0003",
    type: "PERMIT",
    status: "APPROVED",
    receivedAt: "2026-02-25T08:00:00Z",
    project: {
      id: "p-003",
      name: "Khu dịch vụ thương mại Him Lam Điện Biên",
      investor: "Công ty CP Đầu tư Xây dựng Him Lam Điện Biên",
    },
    daysLeft: 0,
  },
  {
    id: "d-004",
    code: "SXD-DB-2026-0004",
    type: "APPRAISAL_BCNCKT",
    status: "APPRAISING",
    receivedAt: "2026-03-05T08:00:00Z",
    project: {
      id: "p-004",
      name: "Kè chống sạt lở bờ sông Nậm Rốm giai đoạn 2",
      investor: "Sở Nông nghiệp và PTNT tỉnh Điện Biên",
    },
    daysLeft: 4,
  },
  {
    id: "d-005",
    code: "SXD-DB-2026-0005",
    type: "APPRAISAL_TKCS",
    status: "SUPPLEMENT_REQUIRED",
    receivedAt: "2026-03-02T08:00:00Z",
    project: {
      id: "p-005",
      name: "Cải tạo, sửa chữa Trụ sở Huyện ủy Nậm Pồ",
      investor: "UBND Huyện Nậm Pồ",
    },
    daysLeft: 5,
  },
  {
    id: "d-006",
    code: "SXD-DB-2026-0006",
    type: "APPRAISAL_BCNCKT",
    status: "CHECKING",
    receivedAt: "2026-03-08T08:00:00Z",
    project: {
      id: "p-006",
      name: "Nhà văn hóa trung tâm Huyện Mường Nhé",
      investor: "Ban QLDA huyện Mường Nhé",
    },
    daysLeft: 5,
  },
];

export default function SpecialistDashboard() {
  const [dossiers, setDossiers] = useState<any[]>(DEFAULT_DEMO_DOSSIERS);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getDossiers();
      if (res && res.data && res.data.length > 0) {
        setDossiers(res.data);
      } else {
        setDossiers(DEFAULT_DEMO_DOSSIERS);
      }
    } catch {
      // Khi API chưa có dữ liệu hoặc chưa đăng nhập, sử dụng bộ hồ sơ mẫu chuẩn Điện Biên
      setDossiers(DEFAULT_DEMO_DOSSIERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const total = dossiers.length;
  const appraising = dossiers.filter((d) => d.status === "APPRAISING").length;
  const checking = dossiers.filter(
    (d) => d.status === "CHECKING" || d.status === "SUPPLEMENT_REQUIRED"
  ).length;
  const approved = dossiers.filter((d) => d.status === "APPROVED").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Tổng quan Thẩm định & Giám sát SLA
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Nghị định 217/2026/NĐ-CP
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
            Phòng Quản lý Xây dựng — Sở Xây dựng tỉnh Điện Biên
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Làm mới dữ liệu từ cơ sở dữ liệu" placement="bottom">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng hồ sơ tiếp nhận
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {loading ? "..." : total}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span className="font-semibold text-blue-600 dark:text-blue-400">DVC Tỉnh & Sở</span> • Tiếp nhận trực tiếp
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đang thẩm định
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {loading ? "..." : appraising}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Theo quy trình thời hạn NĐ 217/2026
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Kiểm tra & Bổ sung
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-amber-600 dark:text-amber-400">
            {loading ? "..." : checking}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Thời hạn thụ lý: Tối đa 05 ngày làm việc
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đã phê duyệt
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {loading ? "..." : approved}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Tỷ lệ đúng hạn: 100%
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Hồ sơ cần xử lý trong tuần
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Hiển thị {dossiers.length} hồ sơ gần nhất
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-[11px] font-bold uppercase text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3.5">Mã HS</th>
                <th className="px-4 py-3.5">Tên dự án & Chủ đầu tư</th>
                <th className="px-4 py-3.5">Loại thủ tục</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5">Ngày nhận</th>
                <th className="px-4 py-3.5 text-right">Hạn SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {dossiers.map((d) => {
                const projectName = d.project?.name || d.notes || "Dự án đầu tư xây dựng";
                const investorName = d.project?.investor || "Ban Quản lý dự án";

                return (
                  <tr
                    key={d.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-semibold text-xs text-primary dark:text-sky-400 whitespace-nowrap">
                      <EntityLink type="dossier" id={d.id}>
                        {d.code}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm line-clamp-1">
                        <EntityLink type="dossier" id={d.id}>
                          {projectName}
                        </EntityLink>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5 flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{investorName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {d.type === "APPRAISAL_BCNCKT"
                        ? "BCNCKT"
                        : d.type === "APPRAISAL_TKCS"
                        ? "Thiết kế cơ sở"
                        : "Cấp GPXD"}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <Badge
                        variant={
                          d.status === "APPROVED"
                            ? "success"
                            : d.status === "APPRAISING"
                            ? "info"
                            : d.status === "SUPPLEMENT_REQUIRED"
                            ? "warning"
                            : "secondary"
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
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(d.receivedAt || d.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {d.status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn tất
                        </span>
                      ) : d.daysLeft && d.daysLeft <= 3 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                          <Clock className="h-3.5 w-3.5" /> Còn {d.daysLeft} ngày LV
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                          <Clock className="h-3.5 w-3.5" /> Còn {d.daysLeft || 5} ngày LV
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
