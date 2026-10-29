import { formatNumber, formatDateTime } from '@/lib/utils';
'use client';
// Use of the BIM viewer tools over the last 30 days (which tools reach real work), from bim_su_dung.
import React from 'react';
import { Activity } from 'lucide-react';
import { useBimUsage } from '../hooks/useBimField';
import { toolLabel } from '../lib/bimReport';

export const BimUsageSummary: React.FC<{ projectId: string; days?: number }> = ({ projectId, days = 30 }) => {
  const { data = [], error } = useBimUsage(projectId, days);
  if (error) return <p className="text-2xs text-rose-600">Không tải được mức sử dụng: {error.message}</p>;
  if (data.length === 0) return null;
  const max = data[0].so_lan || 1;
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-muted">
        <Activity className="h-3.5 w-3.5 text-primary-600" aria-hidden /> Mức sử dụng công cụ · {days} ngày
      </div>
      <div className="space-y-1">
        {data.slice(0, 10).map((r) => (
          <div key={r.cong_cu} className="flex items-center gap-2 text-2xs">
            <span
              className="w-32 shrink-0 truncate text-txt-secondary dark:text-slate-300"
              data-tooltip={toolLabel(r.cong_cu)}
            >
              {toolLabel(r.cong_cu)}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle dark:bg-slate-700">
              <span
                className="block h-full rounded-full bg-primary-500"
                style={{ width: `${(r.so_lan / max) * 100}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums text-txt-muted">
              {formatNumber(r.so_lan, 2)} · {r.so_nguoi} người
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
