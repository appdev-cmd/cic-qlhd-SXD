// Operations KPI of the current month (MTTR, MTBF, backlog, PM compliance, on time) from facility_kpi_monthly, with a
// plain CSS trend bar of the last months' completed orders (no chart library).
import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useFacilityKpis, useVnToday } from '../hooks/useFacilityOps';
import { buildKpiCards, monthLabel, type KpiCard } from '../lib/opsKpi';

const toneClass: Record<KpiCard['tone'], string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-rose-600',
  neutral: 'text-txt-primary dark:text-white',
};

export const BimOpsKpiCards: React.FC<{ projectId: string; showTrend?: boolean }> = ({ projectId, showTrend }) => {
  const query = useFacilityKpis(projectId);
  const today = useVnToday();
  const month = `${today.slice(0, 7)}-01`;
  const current = query.data?.find((row) => row.month.slice(0, 10) === month);
  const previous = query.data?.find((row) => row.month.slice(0, 10) < month);
  const cards = buildKpiCards(current, previous);
  const history = [...(query.data || [])].reverse().slice(-6);
  const peak = Math.max(1, ...history.map((row) => Math.max(row.created, row.completed)));
  if (query.isLoading)
    return (
      <p role="status" className="text-2xs text-txt-muted">
        Đang tính KPI vận hành…
      </p>
    );
  if (query.error)
    return (
      <p role="alert" className="text-2xs text-rose-600">
        Không tải được KPI: {query.error.message}
      </p>
    );
  return (
    <section aria-label="KPI vận hành" className="space-y-1.5">
      <p className="text-2xs text-txt-muted">
        KPI {monthLabel(month)}
        {previous ? ` · so với ${monthLabel(previous.month.slice(0, 10)).toLowerCase()}` : ''}
      </p>
      {!cards.length ? (
        <p className="rounded-xl border border-dashed border-border p-2 text-2xs text-txt-muted">
          Chưa có phiếu bảo trì trong tháng để tính KPI.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {cards.map((card) => (
            <div
              key={card.key}
              role="group"
              aria-label={card.label}
              className="rounded-xl border border-border bg-bg-subtle p-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <p className="flex items-center justify-between text-2xs text-txt-muted">
                <span>{card.label}</span>
                {card.trend === 'better' ? (
                  <ArrowUpRight aria-label="Tốt hơn tháng trước" className="h-3 w-3 text-emerald-600" />
                ) : card.trend === 'worse' ? (
                  <ArrowDownRight aria-label="Kém hơn tháng trước" className="h-3 w-3 text-rose-600" />
                ) : card.trend === 'same' ? (
                  <Minus aria-label="Như tháng trước" className="h-3 w-3 text-slate-400" />
                ) : null}
              </p>
              <p className={`text-sm font-bold tabular-nums ${toneClass[card.tone]}`}>{card.value}</p>
              <p className="truncate text-2xs text-txt-muted" data-tooltip={card.hint}>
                {card.hint}
              </p>
            </div>
          ))}
        </div>
      )}
      {showTrend && history.length > 1 && (
        <figure aria-label="Phiếu mới và hoàn tất theo tháng" className="space-y-1">
          <div className="flex h-20 items-end gap-2">
            {history.map((row) => (
              <div key={row.month} className="flex flex-1 flex-col items-center gap-0.5">
                <div className="flex h-16 w-full items-end justify-center gap-0.5">
                  <span
                    className="w-2.5 rounded-t bg-slate-300 dark:bg-slate-600"
                    style={{ height: `${(row.created / peak) * 100}%` }}
                    data-tooltip={`${row.created} phiếu mới`}
                  />
                  <span
                    className="w-2.5 rounded-t bg-primary-600"
                    style={{ height: `${(row.completed / peak) * 100}%` }}
                    data-tooltip={`${row.completed} hoàn tất`}
                  />
                </div>
                <span className="text-2xs text-txt-muted">{row.month.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <figcaption className="flex gap-3 text-2xs text-txt-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-slate-300 dark:bg-slate-600" /> Phiếu mới
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary-600" /> Hoàn tất
            </span>
          </figcaption>
        </figure>
      )}
    </section>
  );
};
