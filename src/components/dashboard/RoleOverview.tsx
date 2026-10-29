import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, FileInput, Timer, UserRound } from 'lucide-react';
import { KpiTile } from '../ui/KpiTile';
import { DataTable } from '../ui/DataTable';
import { Tooltip } from '../ui/Tooltip';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import { cn, formatNumber } from '../../lib/utils';
import type { DashboardPerformance, MyWork, OfficerStats, PeriodStats } from '../appraisal/dashboardData';

const PROCEDURES = ['bcnckt', 'gpxd', 'nghiem_thu'] as const;
const LEADER_ROLES = ['head_of_department', 'director', 'admin'];
const EMPTY: MyWork = { queue: 0, ownQueue: 0, overdue: 0, dueSoon: 0, supplementOverdue: 0 };

/** % change vs the previous period; undefined when there is no baseline. */
function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function pointChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return undefined;
  return Math.round((current - previous) * 10) / 10;
}

function Cell({
  value,
  tone,
  label,
  onOpen,
}: {
  value: number;
  tone: 'default' | 'danger' | 'warning';
  label: string;
  onOpen: () => void;
}) {
  if (!value) return <span className="text-ink-muted dark:text-slate-500">0</span>;
  return (
    <Tooltip content={'Mở danh sách: ' + label}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'min-w-[2.25rem] rounded-lg px-2 py-0.5 font-mono font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          tone === 'danger' &&
            'bg-danger-50 dark:bg-danger-900 text-danger-700 dark:text-danger-200 hover:bg-danger-100 dark:hover:bg-danger-800',
          tone === 'warning' &&
            'bg-warning-50 dark:bg-warning-900 text-warning-800 dark:text-warning-100 hover:bg-warning-100 dark:hover:bg-warning-800',
          tone === 'default' &&
            'bg-primary-50 dark:bg-slate-800 text-primary-700 dark:text-primary-200 hover:bg-primary-100 dark:hover:bg-slate-700',
        )}
      >
        {formatNumber(value)}
      </button>
    </Tooltip>
  );
}

function MyWorkCard({ mine, leader }: { mine: Record<string, MyWork>; leader: boolean }) {
  const navigate = useNavigate();
  const open = (procedure: string, query: string) =>
    navigate(PROJECT_PROCEDURES[procedure as 'bcnckt'].path + '?' + query);
  const total = PROCEDURES.reduce((sum, p) => sum + (mine[p]?.queue || 0), 0);
  return (
    <section className="min-w-0 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink dark:text-slate-100">
            <UserRound size={17} className="text-primary-600 dark:text-primary-300" />
            Việc của tôi
          </h2>
          <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
            {leader
              ? 'Hồ sơ chờ anh/chị rà soát và hồ sơ được phân công cho anh/chị.'
              : 'Hồ sơ được phân công cho anh/chị đang ở bước xử lý.'}{' '}
            Bấm số để mở danh sách đã lọc.
          </p>
        </div>
        <span className="rounded-full bg-primary-50 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-primary-700 dark:text-primary-200">
          {formatNumber(total)} hồ sơ {leader ? 'chờ rà soát' : 'đang xử lý'}
        </span>
      </div>
      <DataTable
        storageKey="dashboard-my-work"
        rows={PROCEDURES.map((p) => ({ id: p, label: PROJECT_PROCEDURES[p].label, ...(mine[p] || EMPTY) }))}
        stickyHeader={false}
        columns={[
          {
            id: 'procedure',
            header: 'Nghiệp vụ',
            width: 200,
            cell: (r) => <span className="font-medium">{r.label}</span>,
          },
          {
            id: 'queue',
            header: leader ? 'Chờ tôi rà soát' : 'Chờ tôi xử lý',
            align: 'center',
            width: 130,
            sortValue: (r) => r.queue,
            cell: (r) => (
              <Cell value={r.queue} tone="default" label={r.label} onOpen={() => open(r.id, 'scope=queue')} />
            ),
          },
          {
            id: 'overdue',
            header: 'Quá hạn',
            align: 'center',
            width: 100,
            sortValue: (r) => r.overdue,
            cell: (r) => (
              <Cell
                value={r.overdue}
                tone="danger"
                label={r.label + ' — quá hạn của tôi'}
                onOpen={() => open(r.id, 'scope=mine&sla=overdue')}
              />
            ),
          },
          {
            id: 'due_soon',
            header: 'Sắp đến hạn',
            align: 'center',
            width: 110,
            sortValue: (r) => r.dueSoon,
            cell: (r) => (
              <Cell
                value={r.dueSoon}
                tone="warning"
                label={r.label + ' — sắp đến hạn của tôi'}
                onOpen={() => open(r.id, 'scope=mine&sla=due_soon')}
              />
            ),
          },
          {
            id: 'supplement_overdue',
            header: 'Quá hạn bổ sung',
            align: 'center',
            width: 130,
            sortValue: (r) => r.supplementOverdue,
            cell: (r) => (
              <Cell
                value={r.supplementOverdue}
                tone="danger"
                label={r.label + ' — quá hạn bổ sung'}
                onOpen={() => open(r.id, 'scope=mine&sla=supplement_overdue')}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function PeriodKpis({ current, previous, days }: { current: PeriodStats; previous: PeriodStats; days: number }) {
  const label = `so với ${days} ngày trước đó`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label={`Tiếp nhận ${days} ngày qua`}
        value={formatNumber(current.received)}
        icon={<FileInput size={18} />}
        trend={change(current.received, previous.received)}
        trendLabel={label}
        help="Số lần nộp hồ sơ được tạo trong kỳ (gồm lần bổ sung)."
      />
      <KpiTile
        label="Hoàn tất trong kỳ"
        value={formatNumber(current.completed)}
        tone="info"
        icon={<CheckCircle2 size={18} />}
        trend={change(current.completed, previous.completed)}
        trendLabel={label}
        hint={current.completedLate ? `${formatNumber(current.completedLate)} trễ hạn` : undefined}
        help="Hồ sơ có kết quả (hoàn tất rà soát) trong kỳ, không tính hồ sơ từ chối hoặc dừng."
      />
      <KpiTile
        label="Tỷ lệ đúng hạn"
        value={current.onTimeRate === null ? '—' : formatNumber(current.onTimeRate, 1) + '%'}
        tone={current.onTimeRate === null ? 'default' : current.onTimeRate >= 90 ? 'success' : 'warning'}
        icon={<Clock size={18} />}
        trend={pointChange(current.onTimeRate, previous.onTimeRate)}
        trendLabel={'điểm % ' + label}
        help="Tỷ lệ hồ sơ hoàn tất không muộn hơn hạn xử lý pháp định (NĐ 217/2026, NĐ 207/2026)."
      />
      <KpiTile
        label="Thời gian xử lý TB"
        value={current.averageDays === null ? '—' : formatNumber(current.averageDays, 1) + ' ngày'}
        icon={<Timer size={18} />}
        trend={change(current.averageDays, previous.averageDays)}
        trendGood="down"
        trendLabel={label}
        help="Số ngày lịch bình quân từ khi tạo lần nộp đến khi hoàn tất, với hồ sơ hoàn tất trong kỳ."
      />
    </div>
  );
}

function OfficerTable({ officers }: { officers: OfficerStats[] }) {
  const open = (o: OfficerStats) => o.on_track + o.due_soon + o.overdue + o.paused + o.supplement_overdue;
  return (
    <section className="min-w-0 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-5 shadow-card">
      <div className="mb-4">
        <h2 className="font-semibold text-ink dark:text-slate-100">Hạn xử lý theo chuyên viên</h2>
        <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
          Hồ sơ đang mở và kết quả hoàn tất theo người phụ trách; sắp xếp theo số quá hạn.
        </p>
      </div>
      <DataTable
        storageKey="dashboard-officers"
        rows={officers}
        getRowId={(o) => o.id || 'unassigned'}
        stickyHeader={false}
        emptyMessage="Chưa có hồ sơ được phân công."
        columns={[
          {
            id: 'name',
            header: 'Chuyên viên',
            width: 220,
            sortValue: (o) => o.name,
            cell: (o) => <span className="font-medium">{o.name}</span>,
          },
          {
            id: 'open',
            header: 'Đang mở',
            align: 'right',
            width: 110,
            sortValue: open,
            cell: (o) => (
              <div className="flex items-center justify-end gap-2">
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted dark:bg-slate-800 lg:flex">
                  {(
                    [
                      ['overdue', 'bg-danger-500 dark:bg-danger-400'],
                      ['supplement_overdue', 'bg-danger-300 dark:bg-danger-600'],
                      ['due_soon', 'bg-warning-500 dark:bg-warning-400'],
                      ['on_track', 'bg-success-500 dark:bg-success-400'],
                      ['paused', 'bg-violet-400 dark:bg-violet-500'],
                    ] as const
                  ).map(([key, color]) => (
                    <span key={key} className={color} style={{ width: open(o) ? (o[key] / open(o)) * 100 + '%' : 0 }} />
                  ))}
                </span>
                <span className="font-mono tabular-nums">{formatNumber(open(o))}</span>
              </div>
            ),
          },
          {
            id: 'overdue',
            header: 'Quá hạn',
            align: 'right',
            width: 100,
            sortValue: (o) => o.overdue + o.supplement_overdue,
            cell: (o) => (
              <span
                className={cn(
                  'font-mono tabular-nums',
                  o.overdue + o.supplement_overdue
                    ? 'font-bold text-danger-700 dark:text-danger-300'
                    : 'text-ink-muted dark:text-slate-500',
                )}
              >
                {formatNumber(o.overdue + o.supplement_overdue)}
              </span>
            ),
          },
          {
            id: 'due_soon',
            header: 'Sắp đến hạn',
            align: 'right',
            width: 110,
            sortValue: (o) => o.due_soon,
            cell: (o) => (
              <span
                className={cn(
                  'font-mono tabular-nums',
                  o.due_soon
                    ? 'font-bold text-warning-700 dark:text-warning-300'
                    : 'text-ink-muted dark:text-slate-500',
                )}
              >
                {formatNumber(o.due_soon)}
              </span>
            ),
          },
          {
            id: 'paused',
            header: 'Chờ bổ sung',
            align: 'right',
            width: 110,
            hideBelow: 'xl',
            sortValue: (o) => o.paused,
            cell: (o) => <span className="font-mono tabular-nums">{formatNumber(o.paused)}</span>,
          },
          {
            id: 'completed',
            header: 'Hoàn tất (đúng / trễ)',
            align: 'right',
            width: 150,
            hideBelow: 'lg',
            sortValue: (o) => o.completed + o.completed_late,
            cell: (o) => (
              <span className="font-mono tabular-nums">
                {formatNumber(o.completed)} / {formatNumber(o.completed_late)}
              </span>
            ),
          },
          {
            id: 'rate',
            header: 'Đúng hạn',
            align: 'right',
            width: 100,
            sortValue: (o) => o.onTimeRate ?? -1,
            cell: (o) =>
              o.onTimeRate === null ? (
                <span className="text-ink-muted dark:text-slate-500">—</span>
              ) : (
                <span
                  className={cn(
                    'font-mono font-bold tabular-nums',
                    o.onTimeRate >= 90
                      ? 'text-success-700 dark:text-success-300'
                      : 'text-warning-700 dark:text-warning-300',
                  )}
                >
                  {formatNumber(o.onTimeRate, 1)}%
                </span>
              ),
          },
        ]}
      />
    </section>
  );
}

/**
 * Phần đầu dashboard theo vai trò (U5): việc của tôi, KPI 30 ngày so với kỳ trước,
 * và — với trưởng phòng / lãnh đạo / quản trị — hạn xử lý theo chuyên viên.
 */
export function RoleOverview({ performance, role }: { performance: DashboardPerformance; role?: string }) {
  const leader = LEADER_ROLES.includes(role || '');
  const { period, officers, mine } = performance;
  return (
    <div className="space-y-5">
      <PeriodKpis current={period.current} previous={period.previous} days={period.days} />
      <div className={cn('grid min-w-0 gap-5', leader && 'xl:grid-cols-5')}>
        <div className={cn('min-w-0', leader && 'xl:col-span-2')}>
          <MyWorkCard mine={mine} leader={leader} />
        </div>
        {leader && (
          <div className="min-w-0 xl:col-span-3">
            <OfficerTable officers={officers} />
          </div>
        )}
      </div>
    </div>
  );
}

/** CSV (UTF-8 BOM, mở được bằng Excel) tổng hợp KPI, hạn xử lý và số liệu theo chuyên viên. */
export function dashboardCsv(
  performance: DashboardPerformance | undefined,
  sla: { id: string; total: number }[] | undefined,
  slaLabel: (id: string) => string,
  today: string,
) {
  const rows: (string | number)[][] = [
    ['Báo cáo tổng hợp hồ sơ — Sở Xây dựng tỉnh Điện Biên'],
    ['Ngày lập', today],
    [],
  ];
  if (performance) {
    const { current, previous, days } = performance.period;
    rows.push([`Chỉ số ${days} ngày`, 'Kỳ này', 'Kỳ trước']);
    rows.push(['Tiếp nhận', current.received, previous.received]);
    rows.push(['Hoàn tất', current.completed, previous.completed]);
    rows.push(['Hoàn tất trễ hạn', current.completedLate, previous.completedLate]);
    rows.push(['Tỷ lệ đúng hạn (%)', current.onTimeRate ?? '', previous.onTimeRate ?? '']);
    rows.push(['Thời gian xử lý TB (ngày)', current.averageDays ?? '', previous.averageDays ?? '']);
    rows.push([]);
  }
  if (sla?.length) {
    rows.push(['Hạn xử lý', 'Số lần nộp']);
    sla.forEach((s) => rows.push([slaLabel(s.id), s.total]));
    rows.push([]);
  }
  if (performance?.officers.length) {
    rows.push([
      'Chuyên viên',
      'Trong hạn',
      'Sắp đến hạn',
      'Quá hạn',
      'Chờ bổ sung',
      'Quá hạn bổ sung',
      'Hoàn tất đúng hạn',
      'Hoàn tất trễ',
      'Tỷ lệ đúng hạn (%)',
    ]);
    performance.officers.forEach((o) =>
      rows.push([
        o.name,
        o.on_track,
        o.due_soon,
        o.overdue,
        o.paused,
        o.supplement_overdue,
        o.completed,
        o.completed_late,
        o.onTimeRate ?? '',
      ]),
    );
  }
  const escape = (v: string | number) => {
    const text = String(v);
    return /[",;\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n');
}
