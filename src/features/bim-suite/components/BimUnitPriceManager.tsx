import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Giao diện CRUD đơn giá 5D DUY NHẤT (dùng chung cho bảng 5D và panel chi phí).
// Đơn giá theo loại cấu kiện IFC (+ vật liệu tùy chọn), nhân với khối lượng bóc từ mô hình.
import React, { useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { BimCostUnit, BimUnitPrice } from '@/features/bim-suite/types/bim.types';
import { useDeleteBimUnitPrice, useSaveBimUnitPrice } from '../hooks/useBim';
import { COST_UNITS, UNIT_LABELS } from '../lib/costing';
import { getIfcLabel } from '../lib/ifcLabels';
import { useConfirm } from '@/features/bim-suite/adapters/ui';

export interface PriceSuggestion {
  loai_cau_kien: string;
  don_vi: BimCostUnit;
}

interface Props {
  projectId: string;
  prices: BimUnitPrice[];
  canEdit?: boolean;
  /** Loại IFC có trong phạm vi khối lượng (gợi ý nhập) */
  categories?: string[];
  /** Nhóm thiếu đơn giá: nút thêm nhanh */
  suggestions?: PriceSuggestion[];
  defaultOpen?: boolean;
  className?: string;
}

const input =
  'min-w-0 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs';
const fmt = (n: number) => formatNumber(n, 0);

export function validatePriceDraft(draft: Partial<BimUnitPrice>): string | null {
  if (!draft.loai_cau_kien?.trim()) return 'Nhập loại cấu kiện IFC.';
  if (draft.don_gia == null || !Number.isFinite(Number(draft.don_gia)) || Number(draft.don_gia) < 0)
    return 'Đơn giá phải là số không âm.';
  if (draft.don_vi && !COST_UNITS.includes(draft.don_vi)) return 'Đơn vị tính không hợp lệ.';
  return null;
}

export const BimUnitPriceManager: React.FC<Props> = ({
  projectId,
  prices,
  canEdit = false,
  categories = [],
  suggestions = [],
  defaultOpen = false,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<Partial<BimUnitPrice> | null>(null);
  const [error, setError] = useState('');
  const save = useSaveBimUnitPrice(projectId);
  const remove = useDeleteBimUnitPrice(projectId);
  const confirm = useConfirm();
  const listId = `bim-price-categories-${projectId}`;

  const startDraft = (value: Partial<BimUnitPrice>) => {
    setOpen(true);
    setError('');
    setDraft({ don_vi: 'm3', ...value });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !draft) return;
    const problem = validatePriceDraft(draft);
    if (problem) return setError(problem);
    setError('');
    try {
      await save.mutateAsync({
        id: draft.id,
        project_id: projectId,
        loai_cau_kien: draft.loai_cau_kien!.trim().toUpperCase(),
        vat_lieu: draft.vat_lieu?.trim() || null,
        ma_dinh_muc: draft.ma_dinh_muc?.trim() || null,
        don_vi: (draft.don_vi || 'm3') as BimCostUnit,
        don_gia: Number(draft.don_gia),
        ghi_chu: draft.ghi_chu || null,
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được đơn giá');
    }
  };
  const del = async (price: BimUnitPrice) => {
    if (!(await confirm({ message: 'Xóa đơn giá này khỏi bảng giá dự án?', confirmText: 'Xóa', variant: 'danger' })))
      return;
    try {
      await remove.mutateAsync(price.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được đơn giá');
    }
  };

  return (
    <section
      aria-label="Bảng đơn giá"
      className={`rounded-xl border border-slate-200 dark:border-slate-700 text-xs ${className}`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-t-xl">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left font-semibold text-slate-700 dark:text-slate-200"
        >
          Bảng đơn giá dự án ({prices.length})
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => startDraft({})}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary-600 text-white text-2xs"
          >
            <Plus className="w-3 h-3" /> Thêm
          </button>
        )}
      </div>
      {open && (
        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
          {draft && canEdit && (
            <form
              onSubmit={submit}
              className="grid grid-cols-2 gap-1 p-2 rounded-lg border border-primary-300 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-950"
            >
              <BimInput
                required
                aria-label="Loại IFC đơn giá"
                placeholder="Loại IFC (ví dụ IFCCOLUMN)"
                className={input}
                list={listId}
                value={draft.loai_cau_kien || ''}
                onChange={(e) => setDraft({ ...draft, loai_cau_kien: e.target.value })}
              />
              <BimInput
                aria-label="Vật liệu đơn giá"
                placeholder="Vật liệu (để trống: chung)"
                className={input}
                value={draft.vat_lieu || ''}
                onChange={(e) => setDraft({ ...draft, vat_lieu: e.target.value })}
              />
              <BimInput
                aria-label="Mã định mức"
                placeholder="Mã định mức"
                className={input}
                value={draft.ma_dinh_muc || ''}
                onChange={(e) => setDraft({ ...draft, ma_dinh_muc: e.target.value })}
              />
              <BimSelect
                aria-label="Đơn vị đơn giá"
                className={input}
                value={draft.don_vi || 'm3'}
                onChange={(e) => setDraft({ ...draft, don_vi: e.target.value as BimCostUnit })}
              >
                {COST_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </BimSelect>
              <BimInput
                required
                type="number"
                min="0"
                step="any"
                aria-label="Đơn giá VNĐ"
                placeholder="Đơn giá (₫)"
                className={input}
                value={draft.don_gia ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, don_gia: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  aria-label="Hủy sửa đơn giá"
                  className="px-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 text-white disabled:opacity-60"
                >
                  {save.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Lưu
                </button>
              </div>
            </form>
          )}
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {getIfcLabel(c)}
              </option>
            ))}
          </datalist>
          {prices.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate text-slate-800 dark:text-slate-100">
                  {getIfcLabel(p.loai_cau_kien)} · {p.vat_lieu || 'Chung'}
                </span>
                <span className="block text-2xs text-slate-500 truncate">
                  {p.ma_dinh_muc || 'Không có mã định mức'}
                </span>
              </span>
              <span className="tabular-nums shrink-0">
                {fmt(Number(p.don_gia))} ₫/{UNIT_LABELS[p.don_vi]}
              </span>
              {canEdit && (
                <>
                  <button
                    type="button"
                    aria-label={`Sửa đơn giá ${p.loai_cau_kien}`}
                    onClick={() => startDraft({ ...p })}
                    className="p-0.5 text-slate-500 hover:text-primary-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa đơn giá ${p.loai_cau_kien}`}
                    disabled={remove.isPending}
                    onClick={() => void del(p)}
                    className="p-0.5 text-rose-500 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {prices.length === 0 && !draft && (
            <p className="px-2 py-2 text-2xs text-slate-500">
              Chưa khai báo đơn giá. Thêm đơn giá theo loại cấu kiện (ví dụ IFCCOLUMN · bê tông · m³) để nhân với khối
              lượng bóc từ mô hình.
            </p>
          )}
          {canEdit && suggestions.length > 0 && (
            <div className="pt-1">
              <p className="text-2xs text-slate-500 mb-1">Thiếu đơn giá — bấm để thêm nhanh:</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.slice(0, 8).map((m) => (
                  <button
                    key={m.loai_cau_kien}
                    type="button"
                    onClick={() => startDraft({ loai_cau_kien: m.loai_cau_kien, don_vi: m.don_vi })}
                    className="px-1.5 py-0.5 rounded-md border border-dashed border-amber-400 text-2xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  >
                    + {getIfcLabel(m.loai_cau_kien)} ({UNIT_LABELS[m.don_vi]})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="px-2 pb-2 text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
};
