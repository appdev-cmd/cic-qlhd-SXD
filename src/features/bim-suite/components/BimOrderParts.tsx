import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Replacement parts of a work order: name/code, quantity, unit, unit cost; locked once the order is closed.
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useOrderParts } from '../hooks/useFacilityOps';
import { FacilityOpsService, type MaintenanceOrder } from '../services/FacilityOpsService';
import { formatVnd } from '../lib/costing';

const input =
  'min-w-0 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const EMPTY = { part_name: '', part_code: '', quantity: '1', unit: 'cái', unit_cost: '' };

export const BimOrderParts: React.FC<{
  order: Pick<MaintenanceOrder, 'id' | 'project_id' | 'status'>;
  canEdit?: boolean;
}> = ({ order, canEdit }) => {
  const parts = useOrderParts(order.id);
  const cache = useQueryClient();
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = order.status === 'completed' || order.status === 'cancelled';
  const editable = !!canEdit && !locked;
  const total = (parts.data || []).reduce((sum, part) => sum + Number(part.total_cost || 0), 0);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await cache.invalidateQueries({ queryKey: ['facility-order-parts', order.id] });
      await cache.invalidateQueries({ queryKey: ['facility-kpi', order.project_id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được vật tư');
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    run(async () => {
      const quantity = Number(draft.quantity.replace(',', '.'));
      if (!draft.part_name.trim()) throw new Error('Cần tên vật tư.');
      if (!(quantity > 0)) throw new Error('Số lượng phải lớn hơn 0.');
      const unitCost = draft.unit_cost === '' ? null : Number(draft.unit_cost);
      if (unitCost !== null && !(unitCost >= 0)) throw new Error('Đơn giá không hợp lệ.');
      await FacilityOpsService.addPart(order, {
        part_name: draft.part_name.trim(),
        part_code: draft.part_code.trim() || null,
        quantity,
        unit: draft.unit.trim() || 'cái',
        unit_cost: unitCost,
      });
      setDraft(EMPTY);
    });
  return (
    <section aria-label="Vật tư thay thế" className="space-y-2 text-xs">
      <p className="font-semibold text-txt-primary dark:text-white">
        Vật tư thay thế {parts.data?.length ? `(${parts.data.length} · ${formatVnd(total)})` : ''}
      </p>
      {parts.isLoading ? (
        <p className="text-txt-muted">Đang tải vật tư…</p>
      ) : parts.error ? (
        <p role="alert" className="text-rose-600">
          {parts.error.message}
        </p>
      ) : (
        <ul className="space-y-1">
          {(parts.data || []).map((part) => (
            <li
              key={part.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 dark:border-slate-700"
            >
              <span className="flex-1 truncate">
                {part.part_name}
                {part.part_code ? ` · ${part.part_code}` : ''}
              </span>
              <span className="tabular-nums">
                {formatNumber(Number(part.quantity), 2)} {part.unit}
              </span>
              <span className="tabular-nums text-txt-muted">
                {part.unit_cost === null ? '—' : formatVnd(Number(part.total_cost))}
              </span>
              {editable && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Bỏ vật tư ${part.part_name}`}
                  className="text-txt-muted hover:text-rose-600"
                  onClick={() => void run(() => FacilityOpsService.removePart(part.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
          {!parts.data?.length && <li className="text-txt-muted">Chưa ghi vật tư.</li>}
        </ul>
      )}
      {editable && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <BimInput
            aria-label="Tên vật tư"
            placeholder="Tên vật tư"
            value={draft.part_name}
            onChange={(e) => setDraft({ ...draft, part_name: e.target.value })}
            className={`${input} col-span-2`}
          />
          <BimInput
            aria-label="Mã vật tư"
            placeholder="Mã"
            value={draft.part_code}
            onChange={(e) => setDraft({ ...draft, part_code: e.target.value })}
            className={input}
          />
          <BimInput
            aria-label="Số lượng vật tư"
            inputMode="decimal"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            className={input}
          />
          <BimInput
            aria-label="Đơn vị vật tư"
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            className={input}
          />
          <BimInput
            aria-label="Đơn giá vật tư (VND)"
            placeholder="Đơn giá"
            inputMode="numeric"
            value={draft.unit_cost}
            onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })}
            className={input}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className={`${btn} col-span-2 sm:col-span-6`}
          >
            <Plus className="h-3 w-3" /> Thêm vật tư
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
};
