import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Building2, ChartNoAxesCombined, FileStack, Files, FolderOpen, RefreshCw } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { apiRequest } from '../../services/apiClient';
import { formatDateTime } from '../../lib/utils';
import { SUBMISSION_STATUS } from '../../lib/projectProcedures';
import { DossierGrid } from './DossierGrid';
import { EntityLink } from '../ui/EntityLink';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Tooltip } from '../ui/Tooltip';
import { dashboardMonths, number, percent, procedureStyles, statusStyles, type DashboardSummary } from './dashboardData';
import '../../styles/dashboard.css';

const muted = 'text-ink-muted dark:text-slate-400';
const card = 'min-w-0 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 shadow-sm';
const axis = { fill: 'var(--text-muted)', fontSize: 11 };

function ChartCard({ heading, description, badge, children, className = '' }: {
  heading: string; description: string; badge?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return <section className={`${card} p-5 sm:p-6 ${className}`}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold text-ink dark:text-slate-100">{heading}</h2><p className={`mt-1.5 text-xs leading-relaxed ${muted}`}>{description}</p></div>
      {badge}
    </div>
    {children}
  </section>;
}

function EmptyChart({ children = 'Chưa có lần nộp hồ sơ trong phạm vi quyền.' }: { children?: React.ReactNode }) {
  return <div className={`flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm ${muted}`}><ChartNoAxesCombined size={30} strokeWidth={1.4} /><p>{children}</p></div>;
}

export function CloudDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [updated, setUpdated] = useState('');
  const [range, setRange] = useState<'6' | '12' | 'all'>('12');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [hover, setHover] = useState<{ anchor: Element; content: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setHover(null);
    apiRequest<DashboardSummary>('/dashboard', { signal: controller.signal })
      .then(summary => { if (!controller.signal.aborted) { setData(summary); setUpdated(new Date().toISOString()); } })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause.message); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);

  useEffect(() => {
    const refresh = () => setVersion(current => current + 1);
    window.addEventListener('appraisal:changed', refresh);
    return () => window.removeEventListener('appraisal:changed', refresh);
  }, []);

  const months = useMemo(() => dashboardMonths(data?.months || []), [data]);
  const visibleMonths = range === 'all' ? months : months.slice(-Number(range));
  const activeMonth = visibleMonths.find(month => month.id === selectedMonth) || visibleMonths[visibleMonths.length - 1];
  const statuses = useMemo(() => {
    const counts = new Map((data?.statuses || []).map(item => [item.id, item.total]));
    const rows = statusStyles.map(item => ({ ...item, total: counts.get(item.id) || 0 }));
    const other = (data?.statuses || []).filter(item => !statusStyles.some(style => style.id === item.id)).reduce((sum, item) => sum + item.total, 0);
    return other ? [...rows, { id: 'other', label: 'Trạng thái khác', color: 'var(--chart-other)', total: other }] : rows;
  }, [data]);
  const procedureRows = useMemo(() => {
    const rows = procedureStyles.map(style => ({ ...style, total: data?.procedures.find(item => item.id === style.id)?.total || 0 }));
    const other = (data?.procedures || []).filter(item => !procedureStyles.some(style => style.id === item.id)).reduce((sum, item) => sum + item.total, 0);
    return other ? [...rows, { id: 'other', label: 'Nghiệp vụ khác', short: 'Khác', color: 'var(--chart-other)', total: other }] : rows;
  }, [data]);
  const total = data?.cases.total || 0;
  const topProjects = data?.top_projects || [];
  const peak = Math.max(...topProjects.map(project => project.total), 1);
  const badge = 'rounded-lg bg-subtle dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-ink-muted dark:text-slate-300';

  return <div className="dashboard-visuals space-y-5 text-ink dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Dashboard &amp; Thống kê</h1><p className={`mt-2 text-sm ${muted}`}>Tổng quan dự án và hồ sơ trong phạm vi quyền của bạn.</p></div>
      <div className="flex items-center gap-3">
        {updated && <span className={`hidden text-xs md:inline ${muted}`}>Cập nhật {formatDateTime(updated)}</span>}
        <button type="button" disabled={loading} onClick={() => setVersion(current => current + 1)} className="flex items-center gap-2 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-ink dark:text-slate-200 hover:bg-subtle dark:hover:bg-slate-800 disabled:opacity-60"><RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />{loading ? 'Đang tải' : 'Tải lại'}</button>
      </div>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-slate-900 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {!data && !error && <div role="status" className={`${card} p-8 text-center ${muted}`}>Đang tổng hợp dữ liệu…</div>}

    {data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Dự án', value: data.projects.total, note: 'Dự án trong phạm vi quản lý', icon: Building2 },
          { label: 'Hồ sơ gốc', value: data.cases.dossiers, note: 'Không đếm trùng lần bổ sung', icon: FolderOpen },
          { label: 'Lần nộp hồ sơ', value: total, note: 'Gồm nộp lần đầu và bổ sung', icon: FileStack },
          { label: 'Tài liệu', value: data.cases.documents, note: 'Tài liệu của các lần nộp', icon: Files },
        ].map(item => <section key={item.label} className={`${card} flex items-start justify-between gap-3 p-5`}>
          <div><h2 className={`text-sm ${muted}`}>{item.label}</h2><p className="my-2 text-3xl font-bold tracking-tight text-ink dark:text-slate-100">{number(item.value)}</p><p className={`text-xs ${muted}`}>{item.note}</p></div>
          <span className="rounded-xl bg-primary-50 dark:bg-slate-800 p-3 text-primary-600 dark:text-primary-300"><item.icon size={21} strokeWidth={1.7} /></span>
        </section>)}
      </div>

      <div className={`${card} flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5 text-sm`}>
        <span className={`flex items-center gap-2 ${muted}`}><Activity size={16} />Trạng thái các lần nộp</span>
        <span className="text-ink dark:text-slate-200">Đang xử lý <strong className="ml-1 tabular-nums">{number(data.cases.in_progress)}</strong></span>
        <span className="text-amber-700 dark:text-amber-300">Cần bổ sung <strong className="ml-1 tabular-nums">{number(data.cases.supplements)}</strong><span className={`ml-2 text-xs ${muted}`}>({percent(data.cases.supplements, total)})</span></span>
        <span className="text-emerald-700 dark:text-emerald-300">Đã rà soát nội bộ <strong className="ml-1 tabular-nums">{number(data.cases.reviewed)}</strong></span>
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        <ChartCard heading="Xu hướng tiếp nhận" description="Lần nộp theo tháng tạo hồ sơ, phân theo nghiệp vụ." className="xl:col-span-2" badge={<div role="group" aria-label="Khoảng thời gian biểu đồ" className="flex rounded-lg bg-subtle dark:bg-slate-800 p-1">{[{ id: '6', label: '6 tháng' }, { id: '12', label: '12 tháng' }, { id: 'all', label: 'Tất cả' }].map(item => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => { setRange(item.id as typeof range); setHover(null); }} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${range === item.id ? 'bg-surface dark:bg-slate-700 text-primary-700 dark:text-primary-300 shadow-sm' : 'text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-200'}`}>{item.label}</button>)}</div>}>
          {visibleMonths.length ? <>
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {procedureRows.map(item => <span key={item.id} className={`flex items-center gap-2 ${muted}`}><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.short}</span>)}
              <span className={`flex items-center gap-2 ${muted}`}><span className="w-4 border-t-2 border-dashed border-ink-muted dark:border-slate-400" />Tổng lần nộp</span>
            </div>
            <div className="h-[270px] min-w-0 sm:h-[290px]" aria-label="Biểu đồ cột chồng số lần nộp theo tháng và nghiệp vụ" onMouseLeave={() => setHover(null)}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleMonths} margin={{ top: 25, right: 18, left: -18, bottom: 5 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axis} tickMargin={12} minTickGap={20} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={axis} domain={[0, 'auto']} />
                  {procedureRows.map(item => <Bar key={item.id} dataKey={item.id} stackId="submissions" fill={item.color} maxBarSize={44} isAnimationActive={false}
                    onMouseEnter={(entry, _index, event) => setHover({ anchor: event.currentTarget, content: `${entry.payload.label} · ${item.short}: ${number(entry.payload[item.id])} lần nộp · Tổng: ${number(entry.payload.total)}` })}
                    onMouseLeave={() => setHover(null)} onClick={entry => setSelectedMonth(entry.payload.id)} />)}
                  <Line type="linear" dataKey="total" stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 3, fill: 'var(--bg-surface)', strokeWidth: 2 }} activeDot={false} isAnimationActive={false}>
                    {visibleMonths.length <= 12 && <LabelList dataKey="total" position="top" offset={12} fill="var(--text-primary)" fontSize={12} fontWeight={600} formatter={value => number(Number(value))} />}
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border dark:border-slate-800 pt-4">
              <div className="w-40"><SearchableSelect value={activeMonth?.id} onChange={setSelectedMonth} options={visibleMonths.map(month => ({ value: month.id, label: month.label }))} placeholder="Chọn tháng" /></div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-live="polite">{procedureRows.map(item => <span key={item.id} className={muted}>{item.short} <strong className="ml-1 text-ink dark:text-slate-200">{number(activeMonth?.[item.id as 'bcnckt' | 'gpxd' | 'nghiem_thu' | 'other'] || 0)}</strong></span>)}<span className="font-semibold text-ink dark:text-slate-100">Tổng {number(activeMonth?.total || 0)}</span></div>
            </div>
          </> : <EmptyChart />}
        </ChartCard>

        <ChartCard heading="Cơ cấu trạng thái" description="Trạng thái hiện tại của tất cả các lần nộp." badge={<span className={badge}>{number(total)} lần nộp</span>}>
          {total ? <>
            <div className="relative mx-auto h-[210px] max-w-[290px]" aria-label="Biểu đồ vòng phân bố trạng thái hồ sơ" onMouseLeave={() => setHover(null)}>
              <ResponsiveContainer width="100%" height="100%"><PieChart>
                <Pie data={statuses.filter(item => item.total > 0)} dataKey="total" nameKey="label" innerRadius={68} outerRadius={94} paddingAngle={2} cornerRadius={5} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}
                  onMouseEnter={(entry, _index, event) => setHover({ anchor: event.currentTarget, content: `${entry.name}: ${number(entry.value)} lần nộp (${percent(entry.value, total)})` })} onMouseLeave={() => setHover(null)}>
                  {statuses.filter(item => item.total > 0).map(item => <Cell key={item.id} fill={item.color} />)}
                </Pie>
              </PieChart></ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold tracking-tight">{number(total)}</span><span className={`mt-1 text-xs ${muted}`}>lần nộp hồ sơ</span></div>
            </div>
            <ul className="mt-2 space-y-2.5" aria-label="Số lần nộp từng trạng thái">{statuses.map(item => <li key={item.id} className="flex items-center justify-between gap-2 text-xs"><span className={`flex items-center gap-2 ${muted}`}><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><span className="flex items-center gap-3"><strong className="tabular-nums">{number(item.total)}</strong><span className={`w-12 text-right tabular-nums ${muted}`}>{percent(item.total, total)}</span></span></li>)}</ul>
          </> : <EmptyChart />}
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard heading="Khối lượng theo nghiệp vụ" description="So sánh số lần nộp và tỷ trọng trong tổng hồ sơ." badge={<span className={badge}>3 nghiệp vụ</span>}>
          {total ? <div className="space-y-6 pt-2" aria-label="Biểu đồ thanh số lần nộp theo nghiệp vụ">{procedureRows.map(item => <div key={item.id}>
            <div className="mb-2.5 flex items-center justify-between gap-3"><span className="text-sm font-medium">{item.label}</span><span className="whitespace-nowrap text-sm font-semibold tabular-nums">{number(item.total)} <span className={`ml-2 text-xs font-normal ${muted}`}>{percent(item.total, total)}</span></span></div>
            <div className="[&>div]:w-full"><Tooltip content={`${item.label}: ${number(item.total)} / ${number(total)} lần nộp (${percent(item.total, total)})`} placement="top">
              <div tabIndex={0} role="img" aria-label={`${item.label}: ${number(item.total)} lần nộp, ${percent(item.total, total)}`} className="h-3.5 w-full overflow-hidden rounded-full bg-subtle dark:bg-slate-800"><div className="h-full rounded-full" style={{ width: percent(item.total, total).replace(',', '.'), backgroundColor: item.color }} /></div>
            </Tooltip></div>
          </div>)}</div> : <EmptyChart />}
          {total > 0 && <p className={`mt-6 border-t border-border dark:border-slate-800 pt-4 text-xs leading-relaxed ${muted}`}>Mỗi lần nộp được tính vào một nghiệp vụ. Lần bổ sung vẫn được tính riêng.</p>}
        </ChartCard>

        <ChartCard heading="Dự án có nhiều lần nộp" description="6 dự án đứng đầu theo khối lượng hồ sơ đã nộp." badge={<span className={badge}>Lần nộp / hồ sơ gốc</span>}>
          {topProjects.length ? <ol className="space-y-3.5" aria-label="Biểu đồ xếp hạng khối lượng hồ sơ của dự án">{topProjects.map((project, index) => <li key={project.id} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-subtle dark:bg-slate-800 text-xs font-semibold text-ink-muted dark:text-slate-400">{index + 1}</span>
            <div className="min-w-0 flex-1"><div className="mb-2 flex items-center justify-between gap-3"><EntityLink type="project" id={project.id} name={project.name} className="text-xs" /><span className="whitespace-nowrap text-xs tabular-nums"><strong>{number(project.total)}</strong><span className={muted}> / {number(project.dossiers)}</span></span></div>
              <div role="img" aria-label={`${project.total} lần nộp, ${project.dossiers} hồ sơ gốc`} className="h-1.5 overflow-hidden rounded-full bg-subtle dark:bg-slate-800"><div className="h-full rounded-full" style={{ width: `${project.total / peak * 100}%`, backgroundColor: 'var(--chart-bcnckt)' }} /></div>
            </div>
          </li>)}</ol> : <EmptyChart>Chưa có hồ sơ được gắn với dự án trong phạm vi quyền.</EmptyChart>}
          {topProjects.length > 0 && <p className={`mt-5 flex items-center gap-1.5 text-xs ${muted}`}><ArrowUpRight size={14} />Bấm tên dự án để mở thông tin chi tiết.</p>}
        </ChartCard>
      </div>

      <section className="space-y-3 pt-1"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Hồ sơ cập nhật gần đây</h2><span className={`text-xs ${muted}`}>10 lần nộp gần nhất</span></div>
        <DossierGrid storageKey="dashboard-recent" rows={data.recent} columns={[
          { label: 'Hồ sơ', value: row => row.name, width: 340, render: row => <EntityLink type="dossier" id={row.id} name={row.name} /> },
          { label: 'Dự án', value: row => row.project_name || '', width: 340, render: row => row.project_id ? <EntityLink type="project" id={row.project_id} name={row.project_name || 'Xem dự án'} /> : 'Chưa gắn dự án' },
          { label: 'Trạng thái', value: row => SUBMISSION_STATUS[row.status] || 'Trạng thái khác' },
        ]} />
      </section>
    </>}
    {hover && <Tooltip anchor={hover.anchor} content={hover.content} placement="top">{null}</Tooltip>}
  </div>;
}
