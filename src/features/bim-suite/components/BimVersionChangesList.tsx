import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G2: danh sách thay đổi giữa hai phiên bản (thêm mới / đã sửa / đã xóa), bấm để bay tới cấu kiện.
import React, { useMemo, useState } from 'react';
import { MinusCircle, PencilLine, PlusCircle } from 'lucide-react';
import type { BimVersionChange, BimVersionDiffRow } from '@/features/bim-suite/types/bim.types';
import { getIfcLabel } from '../lib/ifcLabels';

export const VERSION_CHANGE_STYLE: Record<BimVersionChange, { label: string; color: string; Icon: React.ElementType }> =
  {
    them_moi: { label: 'Thêm mới', color: '#16a34a', Icon: PlusCircle },
    da_sua: { label: 'Đã sửa', color: '#f59e0b', Icon: PencilLine },
    da_xoa: { label: 'Đã xóa', color: '#dc2626', Icon: MinusCircle },
  };
const fmt = (v: number) => formatNumber(v, 2);

export const BimVersionChangesList: React.FC<{
  rows: BimVersionDiffRow[];
  onPick: (row: BimVersionDiffRow) => void;
  removedNeedsSplit?: boolean;
  className?: string;
}> = ({ rows, onPick, removedNeedsSplit, className = '' }) => {
  const [tab, setTab] = useState<BimVersionChange | 'all'>('all');
  const [q, setQ] = useState('');
  const counts = useMemo(() => {
    const c: Record<BimVersionChange, number> = { them_moi: 0, da_sua: 0, da_xoa: 0 };
    for (const r of rows) c[r.trang_thai]++;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('vi');
    return rows
      .filter(
        (r) =>
          (tab === 'all' || r.trang_thai === tab) &&
          (!term || `${r.ten_cau_kien ?? ''} ${r.loai_cau_kien} ${r.global_id}`.toLocaleLowerCase('vi').includes(term)),
      )
      .slice(0, 300);
  }, [rows, tab, q]);
  return (
    <div
      className={`flex min-h-0 flex-col gap-1 text-2xs ${className}`}
      aria-label="Danh sách thay đổi giữa hai phiên bản"
    >
      <div role="tablist" className="flex flex-wrap gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          onClick={() => setTab('all')}
          className={`rounded-md px-1.5 py-0.5 font-semibold ${tab === 'all' ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-500'}`}
        >
          Tất cả {rows.length}
        </button>
        {(Object.keys(VERSION_CHANGE_STYLE) as BimVersionChange[]).map((k) => {
          const s = VERSION_CHANGE_STYLE[k];
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${tab === k ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-500'}`}
            >
              <s.Icon className="h-3 w-3" style={{ color: s.color }} aria-hidden /> {s.label} {counts[k]}
            </button>
          );
        })}
      </div>
      <BimInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm tên, loại, GlobalId…"
        aria-label="Tìm thay đổi"
        className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 dark:border-slate-600 dark:bg-slate-900"
      />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((r) => {
          const s = VERSION_CHANGE_STYLE[r.trang_thai];
          const delta =
            r.trang_thai === 'da_sua' && r.the_tich_cu !== null && r.the_tich_moi !== null
              ? r.the_tich_moi - r.the_tich_cu
              : null;
          return (
            <li key={`${r.trang_thai}:${r.global_id}`}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                data-tooltip={
                  r.trang_thai === 'da_xoa' && removedNeedsSplit
                    ? 'Mở khung phiên bản trước để xem cấu kiện đã xóa'
                    : r.global_id
                }
              >
                <s.Icon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: s.color }} aria-label={s.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-700 dark:text-slate-200">
                    {r.ten_cau_kien || getIfcLabel(r.loai_cau_kien)}
                  </span>
                  <span className="block truncate text-slate-400">
                    {getIfcLabel(r.loai_cau_kien)}
                    {delta !== null ? ` · thể tích ${delta > 0 ? '+' : ''}${fmt(delta)} m³` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-1 py-1 text-slate-400">Không có thay đổi khớp.</li>}
        {rows.length > 300 && shown.length === 300 && (
          <li className="px-1 py-1 text-slate-400">Hiện 300 dòng đầu, lọc để thu hẹp.</li>
        )}
      </ul>
    </div>
  );
};
