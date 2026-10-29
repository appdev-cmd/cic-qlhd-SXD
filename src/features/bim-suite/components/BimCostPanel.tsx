import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimCostPanel.tsx
// Bóc tách chi phí 5D: khai báo đơn giá theo loại cấu kiện / vật liệu, nhân với khối lượng từ mô hình

import React, { useMemo, useState } from 'react';
import { Coins, Loader2, AlertTriangle, Download, FileSpreadsheet } from 'lucide-react';
import { BimEstimateImportModal } from './BimEstimateImportModal';
import { BimCostRow, BimModel, type BimQuantitySummaryRow } from '@/features/bim-suite/types/bim.types';
import { useBimQuantitySummaryMany, useBimUnitPrices } from '../hooks/useBim';
import { buildCostRows, COST_ISSUES, formatVnd, UNIT_LABELS } from '../lib/costing';
import { getIfcLabel } from '../lib/ifcLabels';
import { BimService } from '../services/BimService';
import { BimPriceVersions } from './BimPriceVersions';
import { BimBoqPanel } from './BimBoqPanel';
import { BimEstimateVersions } from './BimEstimateVersions';
import { BimUnitPriceManager } from './BimUnitPriceManager';

interface BimCostPanelProps {
  projectId: string;
  model?: BimModel | null;
  /** Mô hình đang hiển thị (ghép liên bộ môn) — chi phí tính trên toàn bộ */
  models?: BimModel[];
  canEdit?: boolean;
  onSelectElements?: (items: { modelId: string; expressId: number }[]) => void;
  className?: string;
  scopedQuantities?: BimQuantitySummaryRow[];
  scopeLabel?: string;
}

export const BimCostPanel: React.FC<BimCostPanelProps> = ({
  projectId,
  model,
  models,
  canEdit,
  onSelectElements,
  scopedQuantities,
  scopeLabel,
  className = '',
}) => {
  const shown = useMemo(
    () => (models?.length ? models.filter((m) => m.status === 'ready') : model ? [model] : []),
    [models, model],
  );
  const [scope, setScope] = useState('recommended');
  const targets = useMemo(
    () =>
      scope === 'all'
        ? shown
        : scope === 'recommended'
          ? [shown.find((m) => m.discipline === 'KET_CAU') || shown[0]].filter((m): m is BimModel => !!m)
          : shown.filter((m) => m.id === scope),
    [scope, shown],
  );
  const shownIds = useMemo(() => targets.map((m) => m.id), [targets]);
  const qtyQuery = useBimQuantitySummaryMany(shownIds);
  const priceQuery = useBimUnitPrices(projectId);
  const quantities = useMemo(
    () =>
      scopedQuantities ? scopedQuantities.filter((row) => shownIds.includes(row.model_id)) : (qtyQuery.data ?? []),
    [scopedQuantities, shownIds, qtyQuery.data],
  );
  const prices = priceQuery.data ?? [];
  const loadingQty = !scopedQuantities && qtyQuery.isLoading,
    loadingPrices = priceQuery.isLoading;
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);
  const [filter, setFilter] = useState('');

  const cost = useMemo(() => buildCostRows(quantities, prices), [quantities, prices]);
  const filteredRows = cost.rows.filter((r) =>
    `${r.loai_cau_kien} ${getIfcLabel(r.loai_cau_kien)} ${r.vat_lieu} ${r.phan_doan_tang} ${r.issue ? COST_ISSUES[r.issue] : ''}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filteredRows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const trace = async (row: BimCostRow) => {
    if (!onSelectElements) return;
    setTracing(true);
    setActionError(null);
    try {
      const elements = await BimService.getQuantitySourceElements(row);
      if (!elements.length) throw new Error('Không tìm thấy cấu kiện nguồn trong phiên bản mô hình.');
      onSelectElements(elements);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không tìm được cấu kiện nguồn');
    } finally {
      setTracing(false);
    }
  };

  const exportCsv = () => {
    if (qtyQuery.error || priceQuery.error) return;
    const head = [
      'Mô hình nguồn',
      'Phiên bản',
      'Loại cấu kiện',
      'Vật liệu',
      'Vị trí',
      'Mã định mức',
      'Khối lượng',
      'Đơn vị',
      'Đơn giá',
      'Thành tiền',
      'Tình trạng',
      'Nguồn khối lượng',
    ];
    const body = cost.rows.map((r) => [
      targets.find((m) => m.id === r.model_id)?.file_name || r.model_id,
      targets.find((m) => m.id === r.model_id)?.phien_ban || 1,
      getIfcLabel(r.loai_cau_kien),
      r.vat_lieu,
      r.phan_doan_tang,
      r.ma_dinh_muc || '',
      r.khoi_luong ?? '',
      r.don_vi ? UNIT_LABELS[r.don_vi] : '',
      r.don_gia ?? '',
      r.thanh_tien ?? '',
      r.issue ? COST_ISSUES[r.issue] : 'Đã tính',
      r.uoc_tinh_hinh_hoc ? 'Ước tính hình học' : 'Qto mô hình',
    ]);
    const csv = [
      ['Dự án', projectId, 'Ngày dữ liệu', new Date().toISOString()],
      ['Phạm vi', targets.map((m) => `${m.file_name} v${m.phien_ban || 1}`).join('; ')],
      ['Mức bao phủ', `${cost.rows.length - cost.missing}/${cost.rows.length} nhóm`],
      head,
      ...body,
      [],
      ['TỔNG PHẦN ĐÃ TÍNH', '', '', '', '', '', '', '', '', cost.total],
    ]
      .map((line) => line.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `chi_phi_bim_${shown.length > 1 ? `${shown.length}_mo_hinh` : shown[0]?.file_name || projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (shown.length === 0)
    return (
      <p className={`text-xs text-slate-400 italic p-3 ${className}`}>
        Chọn một mô hình đã xử lý xong để bóc tách chi phí.
      </p>
    );
  if (qtyQuery.error || priceQuery.error)
    return (
      <div role="alert" className="p-3 text-xs text-rose-600">
        Không tải được dữ liệu chi phí: {(qtyQuery.error || priceQuery.error)?.message}
        <button
          type="button"
          onClick={() => {
            void qtyQuery.refetch();
            void priceQuery.refetch();
          }}
          className="ml-2 underline"
        >
          Thử lại
        </button>
      </div>
    );
  if (loadingQty || loadingPrices) {
    return (
      <div className={`flex items-center justify-center gap-2 text-xs text-slate-400 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải dữ liệu khối lượng...
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-2 pb-2">
        <Coins className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Chi phí sơ bộ từ mô hình{shown.length > 1 ? ` · ${shown.length} mô hình` : ''}
        </span>
        <span className="flex-1" />
        {canEdit && (
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="p-1 rounded text-slate-400 hover:text-emerald-600"
            data-tooltip="Nhập đơn giá từ file dự toán Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={exportCsv}
          className="p-1 rounded text-slate-400 hover:text-primary-600"
          data-tooltip="Xuất CSV"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
      <BimPriceVersions projectId={projectId} prices={prices} canEdit={canEdit} />
      {scopeLabel && (
        <p className="my-2 text-2xs text-slate-600 dark:text-slate-300">
          Phạm vi khối lượng: {scopeLabel}. BOQ và lịch sử đơn giá bên dưới là dữ liệu toàn dự án.
        </p>
      )}
      <BimBoqPanel projectId={projectId} models={shown} canEdit={canEdit} onSelectElements={onSelectElements} />
      {importOpen && (
        <BimEstimateImportModal
          projectId={projectId}
          quantities={quantities}
          prices={prices}
          onClose={() => setImportOpen(false)}
        />
      )}
      <label className="text-2xs text-slate-500 mb-2">
        Nguồn đo bóc
        <BimSelect
          aria-label="Nguồn đo bóc chi phí"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setPage(0);
          }}
          className="w-full p-1 rounded border bg-white dark:bg-slate-900"
        >
          <option value="recommended">
            Nguồn đề xuất: {shown.find((m) => m.discipline === 'KET_CAU')?.file_name || shown[0]?.file_name}
          </option>
          {shown.map((m) => (
            <option key={m.id} value={m.id}>
              {m.file_name} · v{m.phien_ban || 1}
            </option>
          ))}
          <option value="all">Mọi mô hình — cần đối soát trùng khối lượng</option>
        </BimSelect>
      </label>
      {scope === 'all' && targets.length > 1 && (
        <p className="text-2xs text-amber-700 mb-2">
          Tổng liên bộ môn có thể trùng cùng đối tượng vật lý. Chọn mô hình chịu trách nhiệm đo bóc hoặc ánh xạ BOQ theo
          công tác trước khi dùng nghiệp vụ.
        </p>
      )}

      <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900/40 border border-amber-200 dark:border-amber-900">
        <div className="text-2xs uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Giá trị phần đã tính được
        </div>
        <div className="text-xl font-black text-amber-700 dark:text-amber-300 tabular-nums">
          {cost.rows.length > cost.missing ? formatVnd(cost.total) : 'Chưa đủ dữ liệu'}
        </div>
        <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
          {cost.total > 0 ? `${formatNumber(cost.total, 2)} ₫ · ` : ''}
          {cost.rows.length - cost.missing}/{cost.rows.length} nhóm đã tính · {cost.missingQuantity} nhóm thiếu khối
          lượng · {cost.ambiguousPrice} nhóm cần chọn đơn giá
        </div>
      </div>
      <BimEstimateVersions projectId={projectId} models={targets} rows={cost.rows} canEdit={canEdit} />
      {actionError && (
        <p role="alert" className="text-xs text-rose-600 mt-2">
          {actionError}
        </p>
      )}

      {cost.hasEstimated && (
        <p className="mt-2 flex items-start gap-1.5 text-2xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          Một phần khối lượng được ước tính từ hình học (IFC không kèm bộ số lượng) — chỉ dùng tham khảo, không thay thế
          dự toán.
        </p>
      )}

      {/* Bảng đơn giá: giao diện CRUD dùng chung với bảng khối lượng */}
      <BimUnitPriceManager
        projectId={projectId}
        prices={prices}
        canEdit={canEdit}
        categories={[...new Set(quantities.map((q) => q.loai_cau_kien))]}
        suggestions={cost.missingByCategory}
        className="mt-3"
      />

      {/* Bảng chi phí */}
      <BimInput
        aria-label="Tìm dòng chi phí"
        placeholder="Tìm loại, vật liệu, tầng hoặc lỗi dữ liệu…"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(0);
        }}
        className="mt-2 rounded border p-1 text-xs bg-white dark:bg-slate-900"
      />
      <div className="mt-3 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <BimTable className="w-full text-2xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Loại · vật liệu</th>
              <th className="px-2 py-1.5 text-right font-semibold">Khối lượng</th>
              <th className="px-2 py-1.5 text-right font-semibold">Thành tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {filteredRows.slice(currentPage * 50, (currentPage + 1) * 50).map((r, i) => (
              <tr
                key={`${r.model_id}-${r.loai_cau_kien}-${r.vat_lieu}-${r.phan_doan_tang}-${i}`}
                className={r.thanh_tien === null ? 'opacity-60' : ''}
              >
                <td className="px-2 py-1">
                  <span className="block truncate text-slate-800 dark:text-slate-100">
                    {getIfcLabel(r.loai_cau_kien)}
                  </span>
                  <span className="block text-3xs text-slate-400 truncate">
                    {[r.vat_lieu || 'Không có vật liệu', r.phan_doan_tang].filter(Boolean).join(' · ')}
                  </span>
                  {onSelectElements && (
                    <button
                      type="button"
                      disabled={tracing}
                      onClick={() => void trace(r)}
                      className="text-3xs text-primary-600 hover:underline"
                    >
                      Xem cấu kiện nguồn
                    </button>
                  )}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {r.khoi_luong !== null
                    ? `${formatNumber(r.khoi_luong, 2)} ${r.don_vi ? UNIT_LABELS[r.don_vi] : ''}`
                    : `${formatNumber(r.so_luong, 2)} cấu kiện`}
                </td>
                <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                  {r.thanh_tien !== null ? (
                    <span className="text-slate-800 dark:text-slate-100">{formatNumber(r.thanh_tien, 0)}</span>
                  ) : (
                    <span className="text-2xs text-amber-600">{r.issue ? COST_ISSUES[r.issue] : 'Chưa tính được'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </BimTable>
      </div>
      <div className="flex items-center gap-2 text-2xs mt-1">
        <button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          Trước
        </button>
        <span>
          Trang {currentPage + 1}/{pages} · {filteredRows.length} dòng
        </span>
        <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
          Sau
        </button>
      </div>
    </div>
  );
};
