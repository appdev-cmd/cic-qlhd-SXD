import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import { DossierGrid } from './DossierGrid';
import { EntityLink } from '../ui/EntityLink';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';

type Summary = {
  cases: { total: number; in_progress: number; documents: number; reviewed: number; supplements: number };
  projects: { total: number };
  procedures: { id: string; total: number }[];
  months: { id: string; total: number }[];
  recent: { id: string; name: string; project_id: string; project_name: string; status: string }[];
};

const states: Record<string, string> = {
  intake: 'Tiếp nhận',
  analyzing: 'Đang kiểm tra',
  analyzed: 'Đã kiểm tra',
  reviewed: 'Đã rà soát',
  request_supplement: 'Cần bổ sung',
};

const chartAxis = { fill: 'var(--text-muted)', fontSize: 11 };
const chartGrid = 'var(--border-default)';
const chartColor = 'var(--ring-focus)';

export function CloudDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    apiRequest<Summary>('/dashboard')
      .then((summary) => { if (active) setData(summary); })
      .catch((cause) => {
        if (active) {
          setError(cause.message);
          setData(null);
        }
      });
    return () => { active = false; };
  }, [version]);

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener('appraisal:changed', refresh);
    return () => window.removeEventListener('appraisal:changed', refresh);
  }, []);

  const procedureData = useMemo(() => (data?.procedures ?? []).map((item) => ({
    name: PROJECT_PROCEDURES[item.id as keyof typeof PROJECT_PROCEDURES]?.label || item.id,
    total: item.total,
  })), [data]);
  const monthlyData = useMemo(() => (data?.months ?? []).map((item) => ({
    month: item.id.split('-').reverse().join('/'),
    total: item.total,
  })), [data]);

  const button = 'rounded-lg border border-border dark:border-border px-3 text-sm';
  return (
    <div className="space-y-6 text-ink dark:text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard &amp; Thống kê</h1>
        <div className="flex gap-3">
          <button type="button" className={`${button} min-w-[84px] shrink-0 whitespace-nowrap py-2`} onClick={() => setVersion((current) => current + 1)}>Tải lại</button>
        </div>
      </div>

      <p className="text-sm text-ink-muted dark:text-ink-muted">
        Thống kê hồ sơ và dự án trong phạm vi quyền của bạn.
      </p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      {!data && !error && <p>Đang tổng hợp dữ liệu…</p>}

      {data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Dự án', data.projects.total],
            ['Lần nộp hồ sơ', data.cases.total],
            ['Tài liệu', data.cases.documents],
            ['Đang xử lý', data.cases.in_progress],
            ['Đã rà soát nội bộ', data.cases.reviewed],
            ['Hồ sơ cần bổ sung', data.cases.supplements],
          ].map(([label, value]) => (
            <section key={label} className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5">
              <h2 className="text-sm text-ink-muted dark:text-ink-muted">{label}</h2>
              <p className="mt-3 text-2xl font-bold text-primary-700 dark:text-primary-400">{value}</p>
            </section>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5">
            <div className="mb-4">
              <h2 className="font-semibold">Lần nộp theo nghiệp vụ</h2>
              <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted">So sánh số hồ sơ đã nộp ở từng nhóm nghiệp vụ</p>
            </div>
            {procedureData.length > 0 ? (
              <div className="dashboard-chart h-[300px] w-full" role="img" aria-label="Biểu đồ số lần nộp hồ sơ theo nghiệp vụ">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={procedureData} layout="vertical" margin={{ top: 4, right: 34, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={chartAxis} />
                    <YAxis type="category" dataKey="name" width={205} axisLine={false} tickLine={false} tick={chartAxis} />
                    <Bar dataKey="total" name="Lần nộp" fill={chartColor} radius={[0, 7, 7, 0]} maxBarSize={34}>
                      <LabelList dataKey="total" position="right" fill="var(--text-primary)" fontSize={12} fontWeight={600} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-16 text-center text-sm text-ink-muted dark:text-ink-muted">Chưa có dữ liệu nghiệp vụ trong phạm vi lọc.</p>}
          </section>

          <section className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5">
            <div className="mb-4">
              <h2 className="font-semibold">Lần nộp theo tháng</h2>
              <p className="mt-1 text-xs text-ink-muted dark:text-ink-muted">Diễn biến lượng hồ sơ tiếp nhận theo thời gian</p>
            </div>
            {monthlyData.length > 0 ? (
              <div className="dashboard-chart h-[300px] w-full" role="img" aria-label="Biểu đồ số lần nộp hồ sơ theo tháng">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 14, right: 12, bottom: 4, left: -18 }}>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={chartAxis} tickMargin={10} minTickGap={16} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={chartAxis} />
                    <Bar dataKey="total" name="Lần nộp" fill={chartColor} radius={[7, 7, 0, 0]} maxBarSize={54}>
                      <LabelList dataKey="total" position="top" fill="var(--text-primary)" fontSize={12} fontWeight={600} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-16 text-center text-sm text-ink-muted dark:text-ink-muted">Chưa có dữ liệu theo tháng trong phạm vi lọc.</p>}
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">Hồ sơ cập nhật gần đây</h2>
          <DossierGrid storageKey="dashboard-recent" rows={data.recent} columns={[
            { label: 'Hồ sơ', value: (row) => row.name, width: 340, render: (row) => <EntityLink type="dossier" id={row.id} name={row.name} /> },
            { label: 'Dự án', value: (row) => row.project_name || '', width: 340, render: (row) => row.project_id ? <EntityLink type="project" id={row.project_id} name={row.project_name || 'Xem dự án'} /> : 'Chưa gắn dự án' },
            { label: 'Trạng thái', value: (row) => states[row.status] || 'Đang xử lý' },
          ]} />
        </section>
      </>}
    </div>
  );
}
