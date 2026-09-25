/**
 * Số liệu điều hành: tổng hợp tại DB (RPC) ở chế độ live, tính trong bộ nhớ ở chế độ demo.
 */
import type { InvestmentForm, Project } from '../types/domain';
import { isDemoMode } from '../lib/dataMode';
import { requireSupabase } from '../lib/supabase';
import { loadDemo } from './demoSource';
import { unwrap } from './query';

export interface DashboardSummary {
  totalProjects: number;
  activeAppraisals: number;
  overdueCount: number;
  completedCount: number;
  supplementCount: number;
  onTimeRate: number;
  totalInvestment: number;
  totalSavings: number;
  approachingDeadlineCount: number;
}

export interface DashboardMonth {
  month: string; // T1..T12
  received: number;
  completed: number;
  onTimeRate: number | null;
  investmentBillion: number;
}

export interface DashboardInvestmentForm {
  form: InvestmentForm;
  projectCount: number;
  totalInvestment: number;
}

const ACTIVE: Project['slaStatus'][] = ['tiep_nhan', 'dang_tham_dinh', 'yeu_cau_bo_sung'];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (isDemoMode) {
    const { projects } = await loadDemo();
    const today = toIsoDate(new Date());
    const in7 = toIsoDate(new Date(Date.now() + 7 * 86_400_000));
    const overdue = projects.filter((p) => p.slaStatus === 'qua_han').length;
    return {
      totalProjects: projects.length,
      activeAppraisals: projects.filter((p) => ACTIVE.includes(p.slaStatus)).length,
      overdueCount: overdue,
      completedCount: projects.filter((p) => p.slaStatus === 'da_tham_dinh').length,
      supplementCount: projects.filter((p) => p.slaStatus === 'yeu_cau_bo_sung').length,
      onTimeRate: projects.length ? Math.round((1000 * (projects.length - overdue)) / projects.length) / 10 : 0,
      totalInvestment: projects.reduce((s, p) => s + p.totalInvestment, 0),
      totalSavings: projects.reduce((s, p) => s + p.estimatedSavings, 0),
      approachingDeadlineCount: projects.filter(
        (p) => ['tiep_nhan', 'dang_tham_dinh'].includes(p.slaStatus) && p.deadlineDate >= today && p.deadlineDate <= in7
      ).length,
    };
  }

  const rows = unwrap(await requireSupabase().rpc('dashboard_summary'), 'Không tải được số liệu tổng hợp') as Record<
    string,
    number | string
  >[];
  const r = rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    totalProjects: n('total_projects'),
    activeAppraisals: n('active_appraisals'),
    overdueCount: n('overdue_count'),
    completedCount: n('completed_count'),
    supplementCount: n('supplement_count'),
    onTimeRate: n('on_time_rate'),
    totalInvestment: n('total_investment'),
    totalSavings: n('total_savings'),
    approachingDeadlineCount: n('approaching_deadline_count'),
  };
}

export async function getDashboardMonthly(year = new Date().getFullYear()): Promise<DashboardMonth[]> {
  if (isDemoMode) {
    const { projects } = await loadDemo();
    const lastMonth = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    return Array.from({ length: lastMonth }, (_, i) => {
      const inMonth = projects.filter((p) => {
        const d = new Date(p.submissionDate);
        return d.getFullYear() === year && d.getMonth() === i;
      });
      const onTime = inMonth.filter((p) => p.slaStatus !== 'qua_han').length;
      return {
        month: `T${i + 1}`,
        received: inMonth.length,
        completed: inMonth.filter((p) => p.slaStatus === 'da_tham_dinh').length,
        onTimeRate: inMonth.length ? Math.round((1000 * onTime) / inMonth.length) / 10 : null,
        investmentBillion: Math.round(inMonth.reduce((s, p) => s + p.totalInvestment, 0) / 1e8) / 10,
      };
    });
  }

  const rows = unwrap(
    await requireSupabase().rpc('dashboard_monthly', { p_year: year }),
    'Không tải được thống kê theo tháng'
  ) as Record<string, number | string | null>[];
  return rows.map((r) => ({
    month: `T${r.month_no}`,
    received: Number(r.received),
    completed: Number(r.completed),
    onTimeRate: r.on_time_rate == null ? null : Number(r.on_time_rate),
    investmentBillion: Number(r.investment_billion),
  }));
}

export async function getDashboardByInvestmentForm(): Promise<DashboardInvestmentForm[]> {
  if (isDemoMode) {
    const { projects } = await loadDemo();
    const map = new Map<InvestmentForm, DashboardInvestmentForm>();
    for (const p of projects) {
      const form = p.investmentForm ?? 'dau_tu_cong';
      const cur = map.get(form) ?? { form, projectCount: 0, totalInvestment: 0 };
      cur.projectCount += 1;
      cur.totalInvestment += p.totalInvestment;
      map.set(form, cur);
    }
    return [...map.values()].sort((a, b) => b.projectCount - a.projectCount);
  }

  const rows = unwrap(
    await requireSupabase().rpc('dashboard_by_investment_form'),
    'Không tải được thống kê theo hình thức đầu tư'
  ) as Record<string, number | string>[];
  return rows.map((r) => ({
    form: r.investment_form as InvestmentForm,
    projectCount: Number(r.project_count),
    totalInvestment: Number(r.total_investment),
  }));
}
