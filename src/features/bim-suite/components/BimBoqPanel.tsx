import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BimModel, BimCostUnit } from '@/features/bim-suite/types/bim.types';
import { useBimBoqContracts, useBimBoqFacets, useBimBoqOverview, useScheduleTasks } from '../hooks/useBimPlan';
import { BimBoqService as service } from '../services/BimBoqService';
import { reconcileBoq } from '../lib/boqReconciliation';
import { convertUnit } from '../lib/estimateImport';
import { UNIT_LABELS } from '../lib/costing';

/**
 * Đối soát BOQ hợp đồng ↔ mô hình theo từng công tác. Đo bóc, tập cấu kiện nguồn và nhóm loại/tầng
 * đều tính ở máy chủ (bim_boq_overview, bim_boq_facets, bim_boq_save_mapping): không tải cấu kiện.
 */
export const BimBoqPanel: React.FC<{
  projectId: string;
  models: BimModel[];
  canEdit?: boolean;
  onSelectElements?: (items: { modelId: string; expressId: number }[]) => void;
}> = ({ projectId, models, canEdit, onSelectElements }) => {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const contracts = useBimBoqContracts(projectId, open);
  const [contract, setContract] = useState(''),
    [itemId, setItemId] = useState(''),
    [modelId, setModelId] = useState(''),
    [category, setCategory] = useState(''),
    [floor, setFloor] = useState(''),
    [coefficient, setCoefficient] = useState(1),
    [taskId, setTaskId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0);
  const selectedContract = contract || contracts.data?.[0]?.ma_hop_dong || '';
  const overview = useBimBoqOverview(
    projectId,
    { modelIds: null, contract: selectedContract },
    open && !!selectedContract,
  );
  const schedule = useScheduleTasks(open && itemId ? projectId : undefined);
  const tasks = { data: schedule.data?.filter((t) => !t.la_tom_tat) };
  const model = modelId ? models.find((m) => m.id === modelId) : models[0];
  const facets = useBimBoqFacets(open && itemId ? model?.id : undefined);
  const items = overview.data?.rows || [];
  const item = items.find((i) => i.ma_boq === itemId);
  const mapping = item?.mapping || null;
  const candidates = useMemo(
    () =>
      (facets.data || [])
        .filter((f) => (!category || f.loai_cau_kien === category) && (!floor || f.phan_doan_tang === floor))
        .reduce((n, f) => n + f.so_luong, 0),
    [facets.data, category, floor],
  );
  const current = item && mapping ? reconcileBoq(item, mapping, mapping.measure) : null;
  const queryError = contracts.error || overview.error || facets.error;
  const loading = contracts.isLoading || overview.isLoading || facets.isLoading;
  const cls = 'w-full rounded border p-1.5 bg-white dark:bg-slate-900 text-xs';
  const number = (n: number | null | undefined) =>
    n == null ? '—' : formatNumber(n, 3);
  const choose = (id: string) => {
    setItemId(id);
    const saved = items.find((i) => i.ma_boq === id)?.mapping;
    setModelId(saved?.model_id || models[0]?.id || '');
    setCoefficient(saved?.coefficient || 1);
    setTaskId(saved?.task_id || '');
    setCategory('');
    setFloor('');
    setError(null);
  };
  const refresh = () => cache.invalidateQueries({ queryKey: ['bim-boq'] });
  const save = async () => {
    if (!item || !model) return;
    setBusy(true);
    setError(null);
    try {
      const unit = convertUnit(item.don_vi_tinh)?.unit;
      if (!unit) throw new Error('Chưa hỗ trợ đơn vị hợp đồng này.');
      if (!candidates) throw new Error('Tập cấu kiện nguồn đang rỗng.');
      await service.save({
        project_id: projectId,
        boq_id: item.ma_boq,
        model_id: model.id,
        category: category || null,
        floor: floor || null,
        unit: unit as BimCostUnit,
        coefficient,
        task_id: taskId || null,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được ánh xạ');
    } finally {
      setBusy(false);
    }
  };
  const trace = async () => {
    if (!item || !mapping || !onSelectElements) return;
    setBusy(true);
    setError(null);
    try {
      onSelectElements(await service.mappingElements(item.ma_boq));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tô sáng được cấu kiện nguồn');
    } finally {
      setBusy(false);
    }
  };
  const exportRow = async () => {
    if (!item || !mapping || !current) return;
    setBusy(true);
    try {
      const elements = await service.mappingElements(item.ma_boq);
      const metadata = models.find((m) => m.id === mapping.model_id);
      const rows: (string | number)[][] = [
        ['Ngày', new Date().toISOString()],
        ['Dự án', projectId],
        ['Hợp đồng', selectedContract],
        ['BOQ', item.ma_boq, item.ten_cong_viec],
        ['Mô hình', mapping.model_id, metadata?.file_name || '', `v${metadata?.phien_ban || 1}`],
        ['Đơn vị hợp đồng', item.don_vi_tinh],
        ['Phép đo', UNIT_LABELS[mapping.unit]],
        ['Hệ số', mapping.coefficient],
        ['Khối lượng mô hình', current.modelQuantity ?? 'Thiếu dữ liệu'],
        ['Hợp đồng', current.contractQuantity ?? ''],
        ['Đã nghiệm thu', current.acceptedQuantity ?? ''],
        ['Chênh lệch', current.difference ?? ''],
        ['Ước tính hình học', current.estimated],
        ['Trạng thái', current.issue || 'Đủ dữ liệu'],
        ...elements.map((e) => ['Cấu kiện', e.expressId]),
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `BOQ-${item.ma_boq}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xuất được CSV');
    } finally {
      setBusy(false);
    }
  };
  const filtered = items.filter(
      (i) => !search || `${i.ten_cong_viec} ${i.ma_hieu_cong_viec}`.toLowerCase().includes(search.toLowerCase()),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 30)),
    currentPage = Math.min(page, pages - 1);
  const categories = [...new Set((facets.data || []).map((f) => f.loai_cau_kien))].sort();
  const floors = [
    ...new Set(
      (facets.data || [])
        .filter((f) => !category || f.loai_cau_kien === category)
        .map((f) => f.phan_doan_tang)
        .filter((f): f is string => !!f),
    ),
  ].sort();
  return (
    <details
      className="my-3 rounded-xl border p-3 text-xs"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="font-semibold cursor-pointer">Đối soát BOQ hợp đồng ↔ mô hình</summary>
      <div className="space-y-2 mt-2">
        <p className="text-slate-500">
          Mỗi công tác chọn một mô hình nguồn và đại lượng riêng. Số nghiệm thu lấy từ BOQ; không thay số thanh toán.
        </p>
        {queryError ? (
          <p role="alert" className="text-rose-600">
            {queryError.message}{' '}
            <button
              type="button"
              onClick={() => {
                void contracts.refetch();
                if (selectedContract) void overview.refetch();
                if (model) void facets.refetch();
              }}
            >
              Thử lại
            </button>
          </p>
        ) : loading ? (
          <p>Đang tải dữ liệu đối soát…</p>
        ) : null}
        {!contracts.isLoading && !contracts.error && !contracts.data?.length ? (
          <p>Chưa có hợp đồng trong dự án.</p>
        ) : (
          <>
            <BimSelect
              aria-label="Hợp đồng đối soát"
              value={selectedContract}
              onChange={(e) => {
                setContract(e.target.value);
                setItemId('');
                setPage(0);
              }}
              className={cls}
            >
              {contracts.data?.map((c) => (
                <option key={c.ma_hop_dong} value={c.ma_hop_dong}>
                  {c.ten_hop_dong}
                </option>
              ))}
            </BimSelect>
            <BimInput
              aria-label="Tìm công tác BOQ"
              placeholder="Tìm công tác BOQ…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className={cls}
            />
            {!overview.isLoading && !overview.error && overview.data?.total === 0 && (
              <p>Hợp đồng chưa có dòng BOQ. Nhập BOQ tại hồ sơ hợp đồng để đối soát.</p>
            )}
            {overview.data?.truncated && (
              <p role="status" className="text-amber-700">
                Đang hiển thị {overview.data.loaded}/{overview.data.total} công tác của hợp đồng.
              </p>
            )}
            <div className="max-h-48 overflow-auto">
              {filtered.slice(currentPage * 30, (currentPage + 1) * 30).map((i) => (
                <button
                  type="button"
                  key={i.ma_boq}
                  onClick={() => choose(i.ma_boq)}
                  className={`block w-full text-left border-b p-2 ${itemId === i.ma_boq ? 'bg-primary-50 dark:bg-primary-950' : ''}`}
                >
                  {i.ma_hieu_cong_viec} · {i.ten_cong_viec}
                  <small className="block text-slate-500">
                    {i.mapping ? 'Đã ánh xạ' : 'Chưa ánh xạ'} · {number(i.khoi_luong)} {i.don_vi_tinh}
                  </small>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
                Trước
              </button>
              <span>
                {currentPage + 1}/{pages} · {filtered.length} công tác
              </span>
              <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
                Sau
              </button>
            </div>
          </>
        )}
        {item && (
          <>
            <b>{item.ten_cong_viec}</b>
            {mapping && !models.some((m) => m.id === mapping.model_id) && (
              <p className="text-amber-700">
                Mô hình nguồn {mapping.model_id} chưa được nạp. Mở đúng phiên bản trong bộ ghép để tô sáng; chọn nguồn
                mới sẽ thay ánh xạ đã lưu.
              </p>
            )}
            {canEdit && (
              <>
                <BimSelect
                  aria-label="Mô hình nguồn BOQ"
                  value={model?.id || ''}
                  onChange={(e) => {
                    setModelId(e.target.value);
                    setCategory('');
                    setFloor('');
                  }}
                  className={cls}
                >
                  <option value="">Chọn mô hình nguồn đang nạp</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.file_name} · v{m.phien_ban || 1}
                    </option>
                  ))}
                </BimSelect>
                <BimSelect
                  aria-label="Loại cấu kiện BOQ"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setFloor('');
                  }}
                  className={cls}
                >
                  <option value="">Mọi loại trong mô hình</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </BimSelect>
                <BimSelect
                  aria-label="Tầng nguồn BOQ"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className={cls}
                >
                  <option value="">Mọi tầng</option>
                  {floors.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </BimSelect>
                <label>
                  Hệ số phân bổ
                  <BimInput
                    aria-label="Hệ số BOQ"
                    type="number"
                    min="0.000001"
                    step="any"
                    value={coefficient}
                    onChange={(e) => setCoefficient(Number(e.target.value))}
                    className={cls}
                  />
                </label>
                <BimSelect
                  aria-label="Công việc tiến độ của BOQ"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className={cls}
                >
                  <option value="">Chưa gắn công việc tiến độ</option>
                  {tasks.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.ma_wbs} · {t.ten}
                    </option>
                  ))}
                </BimSelect>
                <p>
                  {formatNumber(candidates, 2)} cấu kiện · Phép đo:{' '}
                  {convertUnit(item.don_vi_tinh)?.unit || 'Chưa hỗ trợ'}. Lưu sẽ thay tập nguồn của công tác này.
                </p>
                <button
                  type="button"
                  disabled={busy || loading || !!queryError || !candidates}
                  onClick={() => void save()}
                  className="rounded bg-primary-600 text-white px-3 py-2 disabled:opacity-50"
                >
                  Lưu ánh xạ BOQ
                </button>
              </>
            )}
            {current && (
              <>
                <p>
                  Khối lượng mô hình: <b>{number(current.modelQuantity)}</b> · Hợp đồng:{' '}
                  {number(current.contractQuantity)} · Nghiệm thu: {number(current.acceptedQuantity)} {item.don_vi_tinh}
                </p>
                <p>
                  Chênh lệch: {number(current.difference)} · Giá trị mô hình: {number(current.modelValue)} ₫
                </p>
                <p className="text-amber-700">
                  {current.issue || 'Đủ đại lượng đo'} · {current.estimated}/{current.selected} cấu kiện có nguồn ước
                  tính.
                </p>
                {taskId && (
                  <p>
                    Công việc tiến độ: {tasks.data?.find((t) => t.id === taskId)?.ten || taskId}. Giá trị theo thời gian
                    cần quy tắc phân bổ được duyệt.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || loading || !!queryError}
                  onClick={() => void trace()}
                  className="text-primary-600 mr-3"
                >
                  Tô sáng cấu kiện nguồn
                </button>
                <button
                  type="button"
                  disabled={busy || loading || !!queryError}
                  onClick={() => void exportRow()}
                  className="text-primary-600"
                >
                  Xuất đối soát CSV
                </button>
                {canEdit && mapping?.id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await service.remove(mapping.id);
                        await refresh();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Không gỡ được ánh xạ');
                      }
                    }}
                    className="text-rose-600 ml-3"
                  >
                    Gỡ ánh xạ
                  </button>
                )}
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-rose-600">
            {error}
          </p>
        )}
      </div>
    </details>
  );
};
