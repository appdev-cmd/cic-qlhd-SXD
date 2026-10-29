import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimFilterPanel.tsx
// Lọc hiển thị theo loại cấu kiện, tầng / phân đoạn và theo mô hình — gộp từ MỌI mô hình đang hiển thị
// (đọc trực tiếp từ mô hình 3D); danh sách ẩn áp lên từng mô hình.

import React, { useEffect, useMemo, useState } from 'react';
import { Filter, X, Loader2, Layers, Shapes, LayoutGrid, Boxes } from 'lucide-react';
import type { BimCategoryGroup, BimStoreyGroup } from './BimViewer';
import { getIfcLabel } from '../lib/ifcLabels';
import {
  aggregateCategories,
  aggregateStoreys,
  computeHiddenByModel,
  countHidden,
  type AggregatedCategory,
  type AggregatedStorey,
} from '../lib/filterAggregation';

export interface BimFilterModel {
  id: string;
  name: string;
}

interface BimFilterPanelProps {
  /** Các mô hình đang hiển thị (đã nạp) */
  models: BimFilterModel[];
  classificationPanel?: React.ReactNode;
  loadCategories: (modelId: string) => Promise<BimCategoryGroup[]>;
  loadStoreys: (modelId: string) => Promise<BimStoreyGroup[]>;
  /** Danh sách ẩn theo từng mô hình (luôn đủ khoá cho mọi mô hình; mảng rỗng = bỏ lọc) */
  onHiddenChange: (hiddenByModel: Record<string, number[]>) => void;
  onClose: () => void;
  /** Xem mặt bằng của một tầng trên mọi mô hình (chiếu trực giao từ trên + cắt theo cao độ tầng) */
  onPlanView?: (storey: AggregatedStorey) => void;
}

type Tab = 'loai' | 'tang' | 'mo_hinh' | 'uniclass';

export const BimFilterPanel: React.FC<BimFilterPanelProps> = ({
  models,
  classificationPanel,
  loadCategories,
  loadStoreys,
  onHiddenChange,
  onClose,
  onPlanView,
}) => {
  const [tab, setTab] = useState<Tab>('loai');
  const [categories, setCategories] = useState<AggregatedCategory[] | null>(null);
  const [storeys, setStoreys] = useState<AggregatedStorey[] | null>(null);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [hiddenStoreys, setHiddenStoreys] = useState<Set<string>>(new Set());
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const modelKey = models.map((m) => m.id).join('|');
  const nameOf = useMemo(() => new Map(models.map((m) => [m.id, m.name])), [modelKey]);

  useEffect(() => {
    let cancelled = false;
    setCategories(null);
    setStoreys(null);
    Promise.all(
      models.map(async (m) => {
        const [c, s] = await Promise.all([loadCategories(m.id).catch(() => []), loadStoreys(m.id).catch(() => [])]);
        return { modelId: m.id, categories: c, storeys: s };
      }),
    ).then((rows) => {
      if (cancelled) return;
      setCategories(
        aggregateCategories(rows).sort((a, b) => getIfcLabel(a.category).localeCompare(getIfcLabel(b.category), 'vi')),
      );
      setStoreys(aggregateStoreys(rows));
    });
    return () => {
      cancelled = true;
    };
    // Nạp lại khi tập mô hình đổi; giữ nguyên lựa chọn ẩn để áp tiếp lên mô hình mới nạp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  const hiddenByModel = useMemo(
    () =>
      categories && storeys
        ? computeHiddenByModel({
            modelIds: models.map((m) => m.id),
            categories,
            storeys,
            hiddenCategories: hiddenCats,
            hiddenStoreys,
            hiddenModels,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, storeys, hiddenCats, hiddenStoreys, hiddenModels, modelKey],
  );
  const hiddenCount = hiddenByModel ? countHidden(hiddenByModel) : 0;

  useEffect(() => {
    if (hiddenByModel) onHiddenChange(hiddenByModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenByModel]);

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const breakdown = (byModel: Record<string, number[]>) =>
    models.length > 1
      ? Object.entries(byModel)
          .filter(([, ids]) => ids.length)
          .map(([id, ids]) => `${nameOf.get(id) ?? id}: ${formatNumber(ids.length, 2)}`)
          .join('\n')
      : undefined;

  const modelTotals = useMemo(() => {
    const totals = new Map<string, number>();
    categories?.forEach((c) =>
      Object.entries(c.byModel).forEach(([id, ids]) => totals.set(id, (totals.get(id) ?? 0) + ids.length)),
    );
    return totals;
  }, [categories]);

  const loading = categories === null || storeys === null;
  const tabs: [Tab, string, React.ComponentType<{ className?: string }>][] = [
    ['loai', 'Loại', Shapes],
    ['tang', 'Tầng', Layers],
    ['mo_hinh', 'Mô hình', Boxes],
    ...(classificationPanel
      ? [['uniclass', 'Uniclass', Filter] as [Tab, string, React.ComponentType<{ className?: string }>]]
      : []),
  ];

  const showAllInTab = () => {
    if (tab === 'loai') setHiddenCats(new Set());
    else if (tab === 'tang') setHiddenStoreys(new Set());
    else setHiddenModels(new Set());
  };
  const hideAllInTab = () => {
    if (tab === 'loai') setHiddenCats(new Set(categories!.map((c) => c.category)));
    else if (tab === 'tang') setHiddenStoreys(new Set(storeys!.map((s) => s.key)));
    else setHiddenModels(new Set(models.map((m) => m.id)));
  };

  return (
    <div
      className="absolute top-3 left-3 z-20 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-5.5rem)] flex flex-col rounded-2xl bg-white/95 dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl text-xs"
      role="region"
      aria-label="Lọc hiển thị"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 min-w-0">
          <Filter className="w-4 h-4 text-primary-600 shrink-0" />
          <span className="truncate">
            {tab === 'uniclass'
              ? 'Lọc Uniclass · Phạm vi Phân tích / AI'
              : `Lọc hiển thị · ${models.length === 1 ? models[0].name : `${models.length} mô hình`}`}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          data-tooltip="Đóng"
          aria-label="Đóng bộ lọc"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 pt-2">
        <div
          className={`grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900`}
          role="tablist"
        >
          {tabs.map(([t, label, Icon]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-1 py-1 rounded-md font-medium ${
                tab === t
                  ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-300 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
      </div>

      {classificationPanel && (
        <div className={tab === 'uniclass' ? 'overflow-y-auto p-3' : 'hidden'}>{classificationPanel}</div>
      )}
      {tab === 'uniclass' ? null : models.length === 0 ? (
        <p className="p-4 text-center text-slate-400">Chưa có mô hình nào đã nạp.</p>
      ) : loading ? (
        <div className="p-6 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc cấu trúc {models.length} mô hình...
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-slate-500">
            <span aria-live="polite">{formatNumber(hiddenCount, 2)} cấu kiện đang ẩn</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-primary-600 dark:text-primary-400 hover:underline"
                onClick={showAllInTab}
              >
                Hiện hết
              </button>
              <button type="button" className="text-slate-500 hover:underline" onClick={hideAllInTab}>
                Ẩn hết
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {tab === 'loai' &&
              categories!.map((c) => (
                <label
                  key={c.category}
                  data-tooltip={breakdown(c.byModel)}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <BimInput
                    type="checkbox"
                    className="accent-primary-600"
                    checked={!hiddenCats.has(c.category)}
                    onChange={() => toggle(hiddenCats, c.category, setHiddenCats)}
                  />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{getIfcLabel(c.category)}</span>
                  {models.length > 1 && (
                    <span className="text-2xs text-slate-400">
                      {Object.values(c.byModel).filter((ids) => ids.length).length} mô hình
                    </span>
                  )}
                  <span className="text-2xs text-slate-400 tabular-nums">{formatNumber(c.total, 2)}</span>
                </label>
              ))}
            {tab === 'tang' &&
              (storeys!.length === 0 ? (
                <p className="p-4 text-center text-slate-400">Các mô hình không khai báo tầng / phân đoạn.</p>
              ) : (
                [...storeys!].reverse().map((s) => (
                  <label
                    key={s.key}
                    data-tooltip={breakdown(s.byModel)}
                    className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
                  >
                    <BimInput
                      type="checkbox"
                      className="accent-primary-600"
                      checked={!hiddenStoreys.has(s.key)}
                      onChange={() => toggle(hiddenStoreys, s.key, setHiddenStoreys)}
                    />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{s.name}</span>
                    {onPlanView && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onPlanView(s);
                        }}
                        className="p-0.5 rounded text-slate-400 hover:text-primary-600"
                        data-tooltip="Xem mặt bằng tầng này"
                        aria-label={`Xem mặt bằng ${s.name}`}
                      >
                        <LayoutGrid className="w-3 h-3" />
                      </button>
                    )}
                    <span className="text-2xs text-slate-400 tabular-nums">{formatNumber(s.total, 2)}</span>
                  </label>
                ))
              ))}
            {tab === 'mo_hinh' &&
              models.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <BimInput
                    type="checkbox"
                    className="accent-primary-600"
                    checked={!hiddenModels.has(m.id)}
                    onChange={() => toggle(hiddenModels, m.id, setHiddenModels)}
                  />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200" data-tooltip={m.name}>
                    {m.name}
                  </span>
                  <span className="text-2xs text-slate-400 tabular-nums">
                    {formatNumber(modelTotals.get(m.id) ?? 0, 2)}
                  </span>
                </label>
              ))}
          </div>
        </>
      )}
    </div>
  );
};
