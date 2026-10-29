import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Design options of a project (named model sets) compared by measured quantities; two options open side by side in 3D.
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { BimProposalService, type ProposalRow } from '../../services/BimProposalService';
import { barShare, compareMetrics } from '../../lib/proposalCompare';
import { disciplineLabels } from '../../lib/ifcLabels';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null, d: number) =>
  v === null ? '—' : formatNumber(v, d);
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const field =
  'w-full rounded-lg border border-border bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const BAR = '#2a78d6';

export const BimProposalWorkspace: React.FC<{
  projectId: string;
  canWrite: boolean;
  onCompare: (ids: string[]) => void;
}> = ({ projectId: project, canWrite, onCompare }) => {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['bim-proposals', project],
    queryFn: () => BimProposalService.list(project),
    enabled: !!project,
    retry: false,
  });
  const models = useQuery({
    queryKey: ['bim-proposal-models', project],
    queryFn: () => BimProposalService.models(project),
    enabled: !!project,
    retry: false,
  });
  const [rates, setRates] = useState({ m3: '', m2: '', kg: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; ten: string; mo_ta: string; model_ids: string[] } | null>(
    null,
  );
  useEffect(() => {
    setPicked((list.data ?? []).slice(0, 4).map((p) => p.id));
  }, [list.data]);

  const chosen = useMemo(() => (list.data ?? []).filter((p) => picked.includes(p.id)), [list.data, picked]);
  const metrics = useMemo(
    () =>
      compareMetrics(chosen, {
        m3: Number(rates.m3) || null,
        m2: Number(rates.m2) || null,
        kg: Number(rates.kg) || null,
      }),
    [chosen, rates],
  );
  const modelName = useMemo(() => new Map((models.data ?? []).map((m) => [m.id, m])), [models.data]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bim-proposals', project] });

  const save = async () => {
    if (!editing) return;
    if (!editing.ten.trim() || !editing.model_ids.length)
      return addToast({ type: 'error', message: 'Cần tên và ít nhất một mô hình.' });
    try {
      await BimProposalService.save(project, editing.id, editing.ten, editing.mo_ta, editing.model_ids);
      setEditing(null);
      refresh();
      addToast({ type: 'success', message: 'Đã lưu phương án.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const remove = async (p: ProposalRow) => {
    if (!window.confirm(`Xóa phương án “${p.ten}”?`)) return;
    try {
      await BimProposalService.remove(p.id);
      refresh();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <span className="text-xs text-txt-secondary">Chọn 2–4 phương án để so; “Xem 3D song song” cần đúng 2.</span>
        <div className="ml-auto flex gap-1.5">
          {canWrite && (
            <button
              type="button"
              className={btn}
              onClick={() => setEditing({ id: null, ten: '', mo_ta: '', model_ids: [] })}
            >
              <Plus className="h-3 w-3" aria-hidden /> Phương án mới
            </button>
          )}
          <button
            type="button"
            className={btn}
            disabled={chosen.length !== 2}
            onClick={() => onCompare(chosen.map((p) => p.id))}
          >
            <Columns2 className="h-3 w-3" aria-hidden /> Xem 3D song song
          </button>
        </div>
      </div>

      {list.error && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {errorText(list.error)}
        </p>
      )}

      {editing && (
        <section
          className="space-y-2 rounded-2xl border border-border bg-bg-surface p-3 dark:border-slate-700 dark:bg-slate-800"
          aria-label="Sửa phương án"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Tên phương án
              <BimInput
                className={field}
                value={editing.ten}
                onChange={(e) => setEditing({ ...editing, ten: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold">
              Mô tả
              <BimInput
                className={field}
                value={editing.mo_ta}
                onChange={(e) => setEditing({ ...editing, mo_ta: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="text-xs">
            <legend className="mb-1 font-semibold">Mô hình trong phương án</legend>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {(models.data ?? []).map((m) => (
                <label
                  key={m.id}
                  className="flex items-start gap-1.5 rounded-lg border border-border p-1.5 dark:border-slate-700"
                >
                  <BimInput
                    type="checkbox"
                    checked={editing.model_ids.includes(m.id)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        model_ids: e.target.checked
                          ? [...editing.model_ids, m.id]
                          : editing.model_ids.filter((x) => x !== m.id),
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.file_name}</span>
                    <span className="block truncate text-2xs text-txt-muted">
                      {disciplineLabels[m.discipline ?? ''] ?? m.discipline} · v{m.phien_ban ?? 1}
                      {m.ghi_chu_phien_ban ? ` · ${m.ghi_chu_phien_ban}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-1.5">
            <button type="button" className={btn} onClick={() => setEditing(null)}>
              Hủy
            </button>
            <button type="button" className={btn} onClick={() => void save()}>
              Lưu phương án
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(list.data ?? []).map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-start gap-2 rounded-2xl border p-3 shadow-sm dark:bg-slate-800 ${picked.includes(p.id) ? 'border-primary-400 bg-primary-50/40 dark:border-primary-600' : 'border-border bg-bg-surface dark:border-slate-700'}`}
          >
            <BimInput
              type="checkbox"
              className="mt-0.5"
              checked={picked.includes(p.id)}
              onChange={() => toggle(p.id)}
              aria-label={`Chọn ${p.ten}`}
            />
            <span className="min-w-0 flex-1 text-xs">
              <span className="flex items-center gap-1 font-bold text-txt-primary dark:text-white">{p.ten}</span>
              {p.mo_ta && <span className="mt-0.5 block text-2xs text-txt-secondary">{p.mo_ta}</span>}
              <span className="mt-1 block text-2xs text-txt-muted">
                {p.model_ids.map((id) => modelName.get(id)?.file_name ?? id).join(' · ')}
              </span>
            </span>
            {canWrite && (
              <span className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Sửa ${p.ten}`}
                  className="text-txt-muted hover:text-primary-600"
                  onClick={(e) => {
                    e.preventDefault();
                    setEditing({ id: p.id, ten: p.ten, mo_ta: p.mo_ta ?? '', model_ids: p.model_ids });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Xóa ${p.ten}`}
                  className="text-txt-muted hover:text-rose-600"
                  onClick={(e) => {
                    e.preventDefault();
                    void remove(p);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </label>
        ))}
        {list.isSuccess && !list.data.length && <p className="text-xs text-txt-muted">Dự án chưa có phương án nào.</p>}
      </div>

      {chosen.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-bg-surface shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <BimTable className="w-full min-w-[640px] text-xs" aria-label="Bảng so sánh phương án">
            <thead>
              <tr className="text-left text-txt-secondary">
                <th className="px-3 py-2">Chỉ số</th>
                {chosen.map((p) => (
                  <th key={p.id} className="px-3 py-2">
                    {p.ten}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-t border-border/70 dark:border-slate-700">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-txt-primary dark:text-white">
                    {m.label}
                    {m.unit && <span className="font-normal text-txt-muted"> ({m.unit})</span>}
                    {m.note && <span className="block text-2xs font-normal text-txt-muted">{m.note}</span>}
                  </th>
                  {m.values.map((v, i) => {
                    return (
                      <td key={i} className="px-3 py-2">
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          {v === null ? <span className="font-sans text-txt-muted">chưa có</span> : fmt(v, m.digits)}
                        </span>
                        <span className="mt-1 block h-1.5 rounded-full bg-bg-subtle dark:bg-slate-700" aria-hidden>
                          <span
                            className="block h-1.5 rounded-full"
                            style={{ width: `${barShare(m.values, v) * 100}%`, background: BAR }}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </BimTable>
          <div className="flex flex-wrap items-end gap-2 px-3 pb-2 text-2xs text-txt-muted">
            <span className="basis-full">
              Khối lượng đo trên cấu kiện của các mô hình trong phương án (thể tích bê tông, diện tích, chiều dài, trọng
              lượng thép). Nhập suất giá để có chi phí chỉ báo.
            </span>
            <label>
              Suất đ/m³
              <BimInput
                className={field}
                inputMode="decimal"
                value={rates.m3}
                onChange={(e) => setRates({ ...rates, m3: e.target.value })}
              />
            </label>
            <label>
              Suất đ/m²
              <BimInput
                className={field}
                inputMode="decimal"
                value={rates.m2}
                onChange={(e) => setRates({ ...rates, m2: e.target.value })}
              />
            </label>
            <label>
              Suất đ/kg thép
              <BimInput
                className={field}
                inputMode="decimal"
                value={rates.kg}
                onChange={(e) => setRates({ ...rates, kg: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
