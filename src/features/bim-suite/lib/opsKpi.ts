import { formatNumber, formatDateTime } from '@/lib/utils';
// Operations KPI cards from the facility_kpi_monthly view (current month compared with the previous one).
import type { KpiMonth } from '../services/FacilityOpsService';

export interface KpiCard {
  key: 'mttr' | 'mtbf' | 'backlog' | 'pm' | 'on_time';
  label: string;
  value: string;
  hint: string;
  /** better = improved on the previous month, worse = declined */
  trend: 'better' | 'worse' | 'same' | 'none';
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}
const fmt = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : formatNumber(value, digits);
const trend = (
  current: number | null,
  previous: number | null | undefined,
  lowerIsBetter: boolean,
): KpiCard['trend'] => {
  if (current === null || previous === null || previous === undefined) return 'none';
  if (current === previous) return 'same';
  return current < previous === lowerIsBetter ? 'better' : 'worse';
};
const pctTone = (value: number | null): KpiCard['tone'] =>
  value === null ? 'neutral' : value >= 90 ? 'good' : value >= 70 ? 'warn' : 'bad';

export function buildKpiCards(current: KpiMonth | undefined, previous?: KpiMonth): KpiCard[] {
  if (!current) return [];
  return [
    {
      key: 'mttr',
      label: 'MTTR',
      value: current.mttr_hours === null ? '—' : `${fmt(current.mttr_hours)} giờ`,
      hint: `Thời gian sửa trung bình · ${current.failures} sự cố trong tháng`,
      trend: trend(current.mttr_hours, previous?.mttr_hours, true),
      tone: 'neutral',
    },
    {
      key: 'mtbf',
      label: 'MTBF',
      value: current.mtbf_hours === null ? '—' : `${fmt(current.mtbf_hours, 0)} giờ`,
      hint: current.failures ? `Giữa hai sự cố · ${current.asset_count} thiết bị` : 'Chưa có sự cố trong tháng',
      trend: trend(current.mtbf_hours, previous?.mtbf_hours, false),
      tone: 'neutral',
    },
    {
      key: 'backlog',
      label: 'Tồn đọng',
      value: fmt(current.backlog, 0),
      hint: `${current.created} phiếu mới · ${current.completed} hoàn tất`,
      trend: trend(current.backlog, previous?.backlog, true),
      tone: current.backlog > current.completed ? 'warn' : 'neutral',
    },
    {
      key: 'pm',
      label: 'Tuân thủ PM',
      value: current.pm_compliance_pct === null ? '—' : `${fmt(current.pm_compliance_pct)}%`,
      hint: `${current.pm_on_time}/${current.pm_due} phiếu định kỳ đúng hạn`,
      trend: trend(current.pm_compliance_pct, previous?.pm_compliance_pct, false),
      tone: pctTone(current.pm_compliance_pct),
    },
    {
      key: 'on_time',
      label: 'Hoàn tất đúng hạn',
      value: current.on_time_pct === null ? '—' : `${fmt(current.on_time_pct)}%`,
      hint: current.sla_total
        ? `${current.on_time}/${current.completed} phiếu · SLA đạt ${fmt(current.sla_met_pct)}%`
        : `${current.on_time}/${current.completed} phiếu`,
      trend: trend(current.on_time_pct, previous?.on_time_pct, false),
      tone: pctTone(current.on_time_pct),
    },
  ];
}
export const monthLabel = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
