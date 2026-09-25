import React, { useState } from 'react';
import {
  FolderKanban,
  FileCheck2,
  Clock,
  AlertTriangle,
  Coins,
  TrendingDown,
  Sparkles,
  Building2,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ChartDefs } from '../components/ChartDefs';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatCurrency, formatBillion, formatDate } from '../lib/utils';
import {
  MOCK_DASHBOARD_STATS,
  MOCK_CHART_MONTHLY,
  MOCK_CHART_BY_TYPE,
  MOCK_PROJECTS,
} from '../data/mockData';
import { useSlidePanel } from '../context/SlidePanelContext';
import { ProjectDetailSlidePanel } from './projects/ProjectDetailSlidePanel';

export function DashboardPage() {
  const { openPanel } = useSlidePanel();

  const handleOpenProject = (project: (typeof MOCK_PROJECTS)[0]) => {
    openPanel({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `Mã: ${project.code} • ${project.investorName}`,
      tabTitle: project.code,
      component: <ProjectDetailSlidePanel project={project} />,
      storageKey: `slidepanel-project-${project.id}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── BANNER CẢNH BÁO KHẨN CẤP T-2 ─── */}
      <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              Cảnh báo Hồ sơ Sắp đến hạn SLA (T-2 Ngày làm việc)
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Có <strong>{MOCK_DASHBOARD_STATS.warningApproachingSlaCount} hồ sơ</strong> cần hoàn thiện kết quả thẩm định trước ngày 05/10/2026 để tránh quá hạn giải quyết TTHC.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenProject(MOCK_PROJECTS[0])}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors shadow-xs"
        >
          Xử lý khẩn cấp
        </button>
      </div>

      {/* ─── CỤM 4 THẺ KPI CHÍNH ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Tổng hồ sơ đang thẩm định"
          value={MOCK_DASHBOARD_STATS.activeAppraisals}
          sublabel="Trên toàn bộ 10 huyện, thị, thành phố"
          icon={FolderKanban}
          iconColor="text-primary-500"
          iconBg="bg-primary-500/10"
          trend={{ value: '+4 hồ sơ', isPositive: true, label: 'so với tháng trước' }}
        />

        <KpiCard
          title="Tỷ lệ giải quyết đúng hạn SLA"
          value={`${MOCK_DASHBOARD_STATS.onTimeSlaRate}%`}
          sublabel="Quy định ngày làm việc NĐ 217/2026"
          icon={FileCheck2}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          trend={{ value: '+1.2%', isPositive: true, label: 'chỉ số hài lòng cao' }}
        />

        <KpiCard
          title="Vốn đầu tư đã thẩm định"
          value={formatBillion(MOCK_DASHBOARD_STATS.totalAppraisedInvestment)}
          sublabel="Tổng mức đầu tư các dự án năm 2026"
          icon={Coins}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
          trend={{ value: '148 dự án', isPositive: true, label: 'lũy kế từ đầu năm' }}
        />

        <KpiCard
          title="Kinh phí tiết giảm qua thẩm định"
          value={formatBillion(MOCK_DASHBOARD_STATS.totalSavingsAmount)}
          sublabel="Cắt giảm khối lượng thừa & đơn giá"
          icon={TrendingDown}
          iconColor="text-indigo-500"
          iconBg="bg-indigo-500/10"
          trend={{ value: '4.54%', isPositive: true, label: 'tiết kiệm cho ngân sách' }}
        />
      </div>

      {/* ─── HỆ THỐNG BIỂU ĐỒ RECHARTS (CÓ GLOW DEF TỪ CIC-IBST) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Biểu đồ Cột + Đường: Tiến độ hồ sơ & Tỷ lệ SLA */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-surface shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>Xu hướng Thẩm định & Tỷ lệ Đúng hạn SLA Năm 2026</span>
              </h3>
              <p className="text-2xs text-ink-muted mt-0.5">
                Thống kê số lượng hồ sơ tiếp nhận, hoàn thành và % đạt chỉ tiêu SLA theo tháng
              </p>
            </div>
            <span className="text-2xs font-semibold px-2.5 py-1 rounded-md bg-subtle text-primary-600 border border-border">
              Phòng QLXD
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={MOCK_CHART_MONTHLY} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <ChartDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[80, 100]} tick={{ fontSize: 11, fill: '#10b981' }} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                />
                <Bar yAxisId="left" dataKey="tiepNhan" name="Tiếp nhận" fill="url(#grad-primary)" radius={[4, 4, 0, 0]} filter="url(#shadowBar)" barSize={18} />
                <Bar yAxisId="left" dataKey="hoanThanh" name="Đã hoàn thành" fill="url(#grad-success)" radius={[4, 4, 0, 0]} barSize={18} />
                <Line yAxisId="right" type="monotone" dataKey="dungHanPct" name="% Đúng hạn SLA" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} filter="url(#glowKyKet)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ Donut: Cơ cấu Dự án theo Loại hình Đầu tư */}
        <div className="p-5 rounded-xl border border-border bg-surface shadow-card flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Phân loại theo Hình thức Đầu tư</h3>
            <p className="text-2xs text-ink-muted mt-0.5">Dự án công, PPP và kinh doanh Phụ lục IV</p>
          </div>

          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_CHART_BY_TYPE}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {MOCK_CHART_BY_TYPE.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center pointer-events-none">
              <span className="text-2xl font-bold font-mono text-ink">148</span>
              <p className="text-3xs text-ink-muted">Dự án</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border text-xs">
            {MOCK_CHART_BY_TYPE.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-ink-secondary">{item.name}</span>
                </div>
                <span className="font-bold font-mono text-ink">{item.value} DA</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── BẢNG DANH SÁCH DỰ ÁN TRỌNG ĐIỂM ĐANG THẨM ĐỊNH ─── */}
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-subtle/50">
          <div>
            <h3 className="text-sm font-bold text-ink">Dự án Trọng điểm Đang Thẩm định tại Sở Xây dựng</h3>
            <p className="text-2xs text-ink-muted mt-0.5">
              Theo dõi tiến độ, tình trạng SLA và rà soát AI tự động
            </p>
          </div>
          <span className="text-2xs font-semibold px-2.5 py-1 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
            {MOCK_PROJECTS.length} hồ sơ theo dõi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="thead-sticky">
              <tr>
                <th className="th-cell w-12 text-center">STT</th>
                <th className="th-cell">Mã & Tên Dự án</th>
                <th className="th-cell">Chủ đầu tư</th>
                <th className="th-cell">Địa điểm</th>
                <th className="th-cell text-right">Tổng mức đầu tư</th>
                <th className="th-cell text-center">Giai đoạn</th>
                <th className="th-cell text-center">Trạng thái SLA</th>
                <th className="th-cell">Chuyên viên thụ lý</th>
                <th className="th-cell text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PROJECTS.map((p, idx) => (
                <tr
                  key={p.id}
                  onClick={() => handleOpenProject(p)}
                  className="tr-stripe hover:bg-hover-row cursor-pointer transition-colors"
                >
                  <td className="td-cell text-center font-mono text-ink-muted">{idx + 1}</td>
                  <td className="td-cell">
                    <div className="flex flex-col">
                      <span className="font-bold text-ink hover:text-primary-600 transition-colors line-clamp-1">
                        {p.name}
                      </span>
                      <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5">
                        {p.code} • Nhóm {p.projectGroup} (Cấp {p.buildingGrade})
                      </span>
                    </div>
                  </td>
                  <td className="td-cell text-ink-secondary truncate max-w-[200px]">{p.investorName}</td>
                  <td className="td-cell text-ink-secondary">{p.location}</td>
                  <td className="td-cell text-right font-mono font-bold text-ink">
                    {formatCurrency(p.totalInvestment)}
                  </td>
                  <td className="td-cell text-center">
                    <span className="px-2 py-0.5 rounded-md bg-subtle border border-border text-2xs font-semibold text-ink-secondary uppercase">
                      {p.stage === 'bcnckt' ? 'BCNCKT' : p.stage === 'gpxd' ? 'Cấp GPXD' : 'Nghiệm thu'}
                    </span>
                  </td>
                  <td className="td-cell text-center">
                    <StatusBadge status={p.slaStatus} />
                  </td>
                  <td className="td-cell text-ink">{p.assignee}</td>
                  <td className="td-cell text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenProject(p)}
                      className="p-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-ink-muted hover:text-primary-600 transition-colors"
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
