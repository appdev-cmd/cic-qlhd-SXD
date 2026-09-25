import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, FileCheck2, AlertTriangle, Coins, TrendingDown, UserCheck } from 'lucide-react';
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
import { EntityLink } from '../components/ui/EntityLink';
import { DataGrid, useDataGrid, type GridColumn } from '../components/grid/DataGrid';
import {
  useDashboardByInvestmentForm,
  useDashboardMonthly,
  useDashboardSummary,
  useHolidays,
  useProjects,
} from '../hooks/useData';
import { useEntityPanel } from '../hooks/useEntityPanel';
import { useCurrentUser } from '../context/CurrentUserContext';
import { INVESTMENT_FORM_LABELS } from '../lib/projectClassification';
import { buildHolidaySet, evaluateSla, WARNING_THRESHOLDS } from '../lib/sla';
import { cn, formatBillion, formatCurrency, formatDate } from '../lib/utils';
import type { InvestmentForm, Project } from '../types/domain';

const FORM_COLORS: Record<InvestmentForm, string> = {
  dau_tu_cong: '#00668c',
  ppp: '#10b981',
  kinh_doanh: '#f59e0b',
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: '11px',
};

type PriorityRow = Project & { remaining: number; slaLabel: string; level: string };
type PriorityKey = 'name' | 'investorName' | 'deadlineDate' | 'remaining' | 'assignee' | 'slaStatus';

const LEVEL_CLASS: Record<string, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  urgent: 'text-orange-600 dark:text-orange-400',
  warning: 'text-amber-600 dark:text-amber-400',
  ok: 'text-emerald-600 dark:text-emerald-400',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { open } = useEntityPanel();
  const { currentUser } = useCurrentUser();
  const isOfficer = currentUser?.role === 'officer';

  const { data: summary } = useDashboardSummary();
  const { data: monthly = [] } = useDashboardMonthly();
  const { data: byForm = [] } = useDashboardByInvestmentForm();
  const { data: holidays = [] } = useHolidays();
  const holidaySet = useMemo(() => buildHolidaySet(holidays), [holidays]);

  // Hồ sơ đang xử lý (của tôi nếu là chuyên viên), sắp xếp theo hạn gần nhất — lọc tại DB
  const { data: activePage, isLoading, error } = useProjects({
    slaStatuses: ['tiep_nhan', 'dang_tham_dinh', 'qua_han'],
    assigneeStaffId: isOfficer ? currentUser?.id : undefined,
    sort: { key: 'deadlineDate', direction: 'asc' },
    pageSize: 50,
  });

  const priorityRows = useMemo<PriorityRow[]>(
    () =>
      (activePage?.rows ?? []).map((p) => {
        const s = evaluateSla(p, holidaySet);
        return { ...p, remaining: s.remainingWorkingDays, slaLabel: s.label, level: s.level };
      }),
    [activePage, holidaySet]
  );

  const urgent = priorityRows.filter((r) => r.level === 'overdue' || r.remaining <= WARNING_THRESHOLDS.urgent);

  const columns = useMemo<GridColumn<PriorityRow, PriorityKey>[]>(
    () => [
      {
        key: 'name',
        header: 'Mã & Tên Dự án',
        width: 360,
        render: (p) => (
          <div className="flex flex-col min-w-0">
            <EntityLink type="project" id={p.id} name={p.name} className="font-bold text-ink line-clamp-1" />
            <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5">
              {p.code} • Nhóm {p.projectGroup} (Cấp {p.buildingGrade})
            </span>
          </div>
        ),
      },
      {
        key: 'investorName',
        header: 'Chủ đầu tư',
        width: 220,
        render: (p) =>
          p.investorId ? (
            <EntityLink type="organization" id={p.investorId} name={p.investorName} className="text-ink-secondary truncate" />
          ) : (
            <span className="text-ink-secondary truncate block">{p.investorName}</span>
          ),
      },
      { key: 'assignee', header: 'Chuyên viên', width: 160, render: (p) => <span className="truncate block">{p.assignee || '—'}</span> },
      {
        key: 'deadlineDate',
        header: 'Hạn trả KQ',
        width: 110,
        align: 'center',
        render: (p) => <span className="font-mono text-2xs">{formatDate(p.deadlineDate)}</span>,
      },
      {
        key: 'remaining',
        header: 'Còn lại',
        width: 140,
        align: 'center',
        render: (p) => <span className={cn('text-2xs font-bold', LEVEL_CLASS[p.level])}>{p.slaLabel}</span>,
      },
      {
        key: 'slaStatus',
        header: 'Trạng thái',
        width: 140,
        align: 'center',
        render: (p) => <StatusBadge status={p.slaStatus} />,
      },
    ],
    []
  );
  const grid = useDataGrid('dashboard-priority', columns, { key: 'remaining', direction: 'asc' });

  const pieData = byForm.map((f) => ({
    name: INVESTMENT_FORM_LABELS[f.form],
    value: f.projectCount,
    color: FORM_COLORS[f.form],
  }));
  const totalByForm = byForm.reduce((s, f) => s + f.projectCount, 0);
  const savingsPct =
    summary && summary.totalInvestment > 0
      ? ((summary.totalSavings / (summary.totalInvestment + summary.totalSavings)) * 100).toFixed(2)
      : '0';

  return (
    <div className="space-y-6">
      {/* ─── CẢNH BÁO SLA (T-2 ngày làm việc & quá hạn) ─── */}
      {urgent.length > 0 && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                Cảnh báo hồ sơ đến hạn / quá hạn SLA{isOfficer ? ' của tôi' : ''}
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Có <strong>{urgent.length} hồ sơ</strong> còn ≤ {WARNING_THRESHOLDS.urgent} ngày làm việc hoặc đã quá hạn. Gần nhất:{' '}
                <strong>{urgent[0].code}</strong> — hạn {formatDate(urgent[0].deadlineDate)}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => open('project', { id: urgent[0].id, label: urgent[0].name })}
            className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
          >
            Xử lý hồ sơ gấp nhất
          </button>
        </div>
      )}

      {/* ─── KPI ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Hồ sơ đang giải quyết"
          value={summary?.activeAppraisals ?? '—'}
          sublabel={`Tổng ${summary?.totalProjects ?? 0} hồ sơ • ${summary?.supplementCount ?? 0} đang chờ bổ sung`}
          icon={FolderKanban}
          iconColor="text-primary-500"
          iconBg="bg-primary-500/10"
          onClick={() => navigate('/projects')}
        />
        <KpiCard
          title="Tỷ lệ đúng hạn SLA"
          value={summary ? `${summary.onTimeRate}%` : '—'}
          sublabel={`${summary?.overdueCount ?? 0} hồ sơ quá hạn • tính theo ngày làm việc`}
          icon={FileCheck2}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          onClick={() => navigate('/projects?sla=qua_han')}
        />
        <KpiCard
          title="Tổng mức đầu tư đã/đang thẩm định"
          value={summary ? formatBillion(summary.totalInvestment) : '—'}
          sublabel={`${summary?.completedCount ?? 0} hồ sơ đã có kết quả`}
          icon={Coins}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
        />
        <KpiCard
          title="Kinh phí tiết giảm qua thẩm định"
          value={summary ? formatBillion(summary.totalSavings) : '—'}
          sublabel={`≈ ${savingsPct}% so với tổng mức đề nghị`}
          icon={TrendingDown}
          iconColor="text-indigo-500"
          iconBg="bg-indigo-500/10"
        />
      </div>

      {/* ─── BIỂU ĐỒ ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-surface shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-ink">Hồ sơ tiếp nhận, hoàn thành & tỷ lệ đúng hạn năm {new Date().getFullYear()}</h3>
            <p className="text-2xs text-ink-muted mt-0.5">Tổng hợp tại CSDL theo ngày tiếp nhận hồ sơ</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <ChartDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#10b981' }} axisLine={false} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Bar yAxisId="left" dataKey="received" name="Tiếp nhận" fill="url(#grad-primary)" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar yAxisId="left" dataKey="completed" name="Đã có kết quả" fill="url(#grad-success)" radius={[4, 4, 0, 0]} barSize={18} />
                <Line yAxisId="right" type="monotone" dataKey="onTimeRate" name="% đúng hạn" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-border bg-surface shadow-card flex flex-col justify-between dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h3 className="text-sm font-bold text-ink">Phân loại theo hình thức đầu tư</h3>
            <p className="text-2xs text-ink-muted mt-0.5">Đầu tư công, PPP và kinh doanh (Phụ lục IV)</p>
          </div>
          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center pointer-events-none">
              <span className="text-2xl font-bold font-mono text-ink">{totalByForm}</span>
              <p className="text-3xs text-ink-muted">Dự án</p>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border text-xs dark:border-slate-800">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
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

      {/* ─── HỒ SƠ CẦN XỬ LÝ ƯU TIÊN ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              {isOfficer && <UserCheck size={15} className="text-primary-600 dark:text-primary-400" />}
              {isOfficer ? 'Hồ sơ tôi đang thụ lý' : 'Hồ sơ đang giải quyết — ưu tiên theo hạn'}
            </h3>
            <p className="text-2xs text-ink-muted mt-0.5">Số ngày còn lại tính theo ngày làm việc (đã trừ lễ, Tết)</p>
          </div>
          <span className="text-2xs font-semibold px-2.5 py-1 rounded-md bg-primary-50 text-primary-600 border border-primary-200 dark:bg-primary-900 dark:text-primary-200 dark:border-primary-800">
            {activePage?.total ?? 0} hồ sơ • TMĐT {formatCurrency(priorityRows.reduce((s, p) => s + p.totalInvestment, 0))}
          </span>
        </div>
        <DataGrid
          columns={columns}
          rows={priorityRows}
          grid={grid}
          getRowId={(p) => p.id}
          onRowClick={(p) => open('project', { id: p.id, label: p.name })}
          isLoading={isLoading}
          error={error as Error | null}
          maxHeight="420px"
          emptyMessage={isOfficer ? 'Bạn chưa được phân công hồ sơ nào đang giải quyết' : 'Không có hồ sơ đang giải quyết'}
        />
      </div>
    </div>
  );
}
