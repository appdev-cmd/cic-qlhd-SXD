export type DashboardSummary = {
  cases: { total: number; dossiers: number; in_progress: number; documents: number; reviewed: number; supplements: number };
  projects: { total: number };
  procedures: { id: string; total: number }[];
  months: { id: string; total: number; procedures: Record<string, number> }[];
  statuses: { id: string; total: number }[];
  top_projects: { id: string; name: string; total: number; dossiers: number }[];
  recent: { id: string; name: string; project_id: string; project_name: string; status: string }[];
  sla?: { id: string; total: number }[];
};

export const procedureStyles = [
  { id: 'bcnckt', label: 'Thẩm định BCNCKT', short: 'BCNCKT', color: 'var(--chart-bcnckt)' },
  { id: 'gpxd', label: 'Cấp giấy phép xây dựng', short: 'GPXD', color: 'var(--chart-gpxd)' },
  { id: 'nghiem_thu', label: 'Hậu kiểm & Nghiệm thu', short: 'Nghiệm thu', color: 'var(--chart-inspection)' },
];

export const statusStyles = [
  { id: 'intake', label: 'Tiếp nhận', color: 'var(--chart-intake)' },
  { id: 'analyzing', label: 'Đang kiểm tra', color: 'var(--chart-analyzing)' },
  { id: 'analyzed', label: 'Đã kiểm tra', color: 'var(--chart-analyzed)' },
  { id: 'request_supplement', label: 'Cần bổ sung', color: 'var(--chart-supplement)' },
  { id: 'reviewed', label: 'Đã rà soát nội bộ', color: 'var(--chart-reviewed)' },
];

export const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
export const percent = (value: number, total: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(total ? value / total * 100 : 0) + '%';

export function dashboardMonths(months: DashboardSummary['months']) {
  const valid = months.filter(item => /^\d{4}-(0[1-9]|1[0-2])$/.test(item.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!valid.length) return [];
  const source = new Map(valid.map(item => [item.id, item]));
  const serial = (id: string) => Number(id.slice(0, 4)) * 12 + Number(id.slice(5)) - 1;
  const rows = [];
  for (let cursor = serial(valid[0].id); cursor <= serial(valid[valid.length - 1].id); cursor++) {
    const id = `${Math.floor(cursor / 12)}-${String(cursor % 12 + 1).padStart(2, '0')}`;
    const item = source.get(id);
    const known = procedureStyles.reduce((sum, procedure) => sum + (item?.procedures?.[procedure.id] || 0), 0);
    rows.push({ id, label: id.slice(5) + '/' + id.slice(0, 4), total: item?.total || 0,
      bcnckt: item?.procedures?.bcnckt || 0, gpxd: item?.procedures?.gpxd || 0,
      nghiem_thu: item?.procedures?.nghiem_thu || 0, other: Math.max(0, (item?.total || 0) - known) });
  }
  return rows;
}
