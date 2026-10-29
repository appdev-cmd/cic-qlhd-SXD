import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useMemo, useState } from 'react';
import { Boxes, ClipboardCheck, Coins, Crosshair, Download, Layers, Loader2, Search, Sigma } from 'lucide-react';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import { useBimUnitPrices } from '../hooks/useBim';
import { useBim5dOverview, useBimBoqContracts, useBimBoqOverview } from '../hooks/useBimPlan';
import { Bim5dService } from '../services/Bim5dService';
import { BimBoqService } from '../services/BimBoqService';
import { downloadCsv } from '../lib/csv';
import { BimAutoLinkBoq } from './BimAutoLinkBoq';
import { BimBoqPanel } from './BimBoqPanel';
import { BimUnitPriceManager } from './BimUnitPriceManager';
import { getIfcLabel } from '../lib/ifcLabels';
import { buildCostRows, COST_ISSUES, UNIT_LABELS, quantityForUnit, type Cost5dRow } from '../lib/costing';
import { quantityKey, sumKnown } from '../lib/quantity5d';
import { reconcileBoq } from '../lib/boqReconciliation';
import { formatShortCurrency } from '@/features/bim-suite/adapters/utils';

export interface BimQuantityTableProps {
  projectId?: string;
  projectName?: string;
  model?: BimModel | null;
  models?: BimModel[];
  canEdit?: boolean;
  onSelectElements?: (items: { modelId: string; expressId: number }[]) => void;
  onSelectGuids?: (guids: string[]) => Promise<void>;
  className?: string;
}
type GroupBy = 'cau_kien_vat_lieu' | 'chi_tiet' | 'loai_cau_kien' | 'vat_lieu' | 'phan_doan_tang' | 'model_id';
const GROUPS: Record<GroupBy, string> = {
  cau_kien_vat_lieu: 'Cấu kiện & Vật liệu',
  chi_tiet: 'Chi tiết theo Tầng / Vị trí',
  loai_cau_kien: 'Loại cấu kiện IFC',
  vat_lieu: 'Vật liệu',
  phan_doan_tang: 'Vị trí / Tầng',
  model_id: 'Mô hình bộ môn',
};
const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? '—' : formatNumber(n, digits);
const money = (n: number | null | undefined) => (n == null ? '—' : formatShortCurrency(n));
const input =
  'min-w-0 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs';
const cell = 'px-2 py-2 text-right tabular-nums whitespace-nowrap border-b border-slate-100 dark:border-slate-700';
const EMPTY_MODELS: BimModel[] = [];

export const BimQuantityTable: React.FC<BimQuantityTableProps> = ({
  projectId: suppliedProjectId,
  projectName,
  model,
  models,
  canEdit = false,
  onSelectElements,
  className = '',
}) => {
  const projectId = suppliedProjectId || model?.project_id || models?.[0]?.project_id || '';
  const shown = useMemo(
    () =>
      (models || (model ? [model] : EMPTY_MODELS)).filter((m) => m.status === 'ready' && m.project_id === projectId),
    [models, model, projectId],
  );
  const [mode, setMode] = useState<'element' | 'boq'>('element');
  const [scope, setScope] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('cau_kien_vat_lieu');
  const [search, setSearch] = useState('');
  const [priceManager, setPriceManager] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [page, setPage] = useState(0);

  const validScope = scope === 'all' || shown.some((m) => m.id === scope) ? scope : 'all';
  const targets = useMemo(() => shown.filter((m) => validScope === 'all' || m.id === validScope), [shown, validScope]);
  const ids = targets.map((m) => m.id);
  const names = new Map(shown.map((m) => [m.id, m.file_name.replace(/\.(ifc|ifczip|zip)$/i, '')]));

  // Mỗi chế độ chỉ tải phần của mình; tổng hợp và nối dữ liệu ở máy chủ (không tải cấu kiện về trình duyệt).
  const overviewQuery = useBim5dOverview(projectId, ids, mode === 'element');
  const priceQuery = useBimUnitPrices(projectId);
  const contractsQuery = useBimBoqContracts(projectId, mode === 'boq');
  const boqQuery = useBimBoqOverview(projectId, { modelIds: ids }, mode === 'boq' && ids.length > 0);
  const prices = priceQuery.data || [];
  const groupsData = overviewQuery.data?.groups;
  const rows = useMemo(
    () => buildCostRows(groupsData || [], priceQuery.data || []).rows,
    [groupsData, priceQuery.data],
  );
  const searchText = search.trim().toLocaleLowerCase('vi');
  const filtered = rows.filter((r) =>
    `${getIfcLabel(r.loai_cau_kien)} ${r.loai_cau_kien} ${r.vat_lieu} ${r.phan_doan_tang} ${r.ma_dinh_muc || ''}`
      .toLocaleLowerCase('vi')
      .includes(searchText),
  );
  const rawQuantities = new Map((groupsData || []).map((q) => [quantityKey(q), q]));
  const groups = new Map<string, { label: string; sub: string; rows: Cost5dRow[] }>();
  for (const row of filtered) {
    const key =
      groupBy === 'chi_tiet'
        ? quantityKey(row)
        : groupBy === 'cau_kien_vat_lieu'
          ? JSON.stringify([row.loai_cau_kien, row.vat_lieu])
          : String(row[groupBy] || '');
    const label =
      groupBy === 'model_id'
        ? names.get(row.model_id || '') || row.model_id || ''
        : groupBy === 'vat_lieu'
          ? row.vat_lieu || 'Không có vật liệu'
          : groupBy === 'phan_doan_tang'
            ? row.phan_doan_tang || 'Chưa gán tầng'
            : getIfcLabel(row.loai_cau_kien);
    const sub =
      groupBy === 'chi_tiet'
        ? [row.vat_lieu, row.phan_doan_tang, names.get(row.model_id || '')].filter(Boolean).join(' · ')
        : groupBy === 'cau_kien_vat_lieu'
          ? row.vat_lieu || 'Không có vật liệu'
          : '';
    const group = groups.get(key) || { label, sub, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const elementGroups = [...groups.entries()].map(([key, group]) => {
    const units = new Set(group.rows.map((r) => r.don_vi));
    const unit = units.size === 1 ? group.rows[0].don_vi : null;
    const unitPrices = new Set(group.rows.map((r) => r.don_gia));
    return {
      key,
      ...group,
      unit,
      quantity: unit ? sumKnown(group.rows.map((r) => r.khoi_luong)) : null,
      completed: unit ? sumKnown(group.rows.map((r) => r.completedQuantity)) : null,
      price: unitPrices.size === 1 ? group.rows[0].don_gia : null,
      value: sumKnown(group.rows.map((r) => r.thanh_tien)),
      completedValue: sumKnown(group.rows.map((r) => r.completedValue)),
      physical: (['m3', 'm2', 'm', 'kg'] as const)
        .map((unit) => {
          const value = sumKnown(
            group.rows.map((r) => {
              const raw = rawQuantities.get(quantityKey(r));
              return raw ? quantityForUnit(raw, unit) : null;
            }),
          );
          return value === null ? '' : `${fmt(value)} ${UNIT_LABELS[unit]}`;
        })
        .filter(Boolean)
        .join(' · '),
      count: group.rows.reduce((n, r) => n + r.so_luong, 0),
    };
  });
  elementGroups.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.label.localeCompare(b.label, 'vi'));
  const contracts = contractsQuery.data || [];
  const contractName = new Map(contracts.map((x) => [x.ma_hop_dong, x.ten_hop_dong]));
  const activeContract = contracts.some((c) => c.ma_hop_dong === contractFilter) ? contractFilter : 'all';
  const boqList = boqQuery.data;
  const boqRows = (boqList?.rows || [])
    .filter(
      (i) =>
        (activeContract === 'all' || i.ma_hop_dong === activeContract) &&
        `${i.ma_hieu_cong_viec || ''} ${i.ten_cong_viec} ${contractName.get(i.ma_hop_dong) || ''}`
          .toLocaleLowerCase('vi')
          .includes(searchText),
    )
    .map((item) => {
      const mapping = item.mapping?.in_scope ? item.mapping : null;
      const measurement = mapping ? reconcileBoq(item, mapping, mapping.measure) : null;
      return {
        item,
        mapping,
        outOfScope: !!item.mapping && !item.mapping.in_scope,
        measurement,
        value:
          item.thanh_tien ?? (item.khoi_luong != null && item.don_gia != null ? item.khoi_luong * item.don_gia : null),
        acceptedValue:
          item.gia_tri_nghiem_thu ??
          (item.khoi_luong_nghiem_thu != null && item.don_gia != null
            ? item.khoi_luong_nghiem_thu * item.don_gia
            : null),
      };
    });
  const error = mode === 'element' ? overviewQuery.error || priceQuery.error : contractsQuery.error || boqQuery.error;
  const busy =
    mode === 'element'
      ? overviewQuery.isLoading || priceQuery.isLoading
      : contractsQuery.isLoading || boqQuery.isLoading;
  const knownTotal =
    mode === 'element'
      ? filtered.reduce((n, r) => n + (r.thanh_tien || 0), 0)
      : boqRows.reduce((n, r) => n + (r.value || 0), 0);
  const completedValues =
    mode === 'element' ? filtered.map((r) => r.completedValue) : boqRows.map((r) => r.acceptedValue);
  const completedTotal = sumKnown(completedValues);
  const unknownCosts =
    mode === 'element'
      ? filtered.filter((r) => r.thanh_tien === null).length
      : boqRows.filter((r) => r.value === null).length;
  const count = mode === 'element' ? elementGroups.length : boqRows.length;
  const activePage = Math.min(page, Math.max(0, Math.ceil(count / 50) - 1));
  const pageStart = activePage * 50;
  const missingPrices = useMemo(() => buildCostRows(groupsData || [], prices).missingByCategory, [groupsData, prices]);

  const highlight = async (load: () => Promise<{ modelId: string; expressId: number }[]>) => {
    if (!onSelectElements) return;
    setSelecting(true);
    setActionError('');
    try {
      const items = (await load()).filter((e) => ids.includes(e.modelId));
      if (!items.length) throw new Error('Không tìm thấy cấu kiện nguồn trong các mô hình đang mở.');
      onSelectElements(items);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không tô sáng được cấu kiện');
    } finally {
      setSelecting(false);
    }
  };
  const selectGroup = (source: Cost5dRow[]) =>
    highlight(() =>
      Bim5dService.groupElements(
        source
          .filter((r) => !!r.model_id)
          .map((r) => ({
            model_id: r.model_id!,
            loai_cau_kien: r.loai_cau_kien,
            vat_lieu: r.vat_lieu,
            phan_doan_tang: r.phan_doan_tang,
          })),
      ),
    );
  const exportExcel = async () => {
    if (error || busy) return;
    setExporting(true);
    setActionError('');
    try {
      const data =
        mode === 'element'
          ? filtered.map((r) => ({
              'Mô hình': names.get(r.model_id || ''),
              'Loại IFC': r.loai_cau_kien,
              'Vật liệu': r.vat_lieu,
              Tầng: r.phan_doan_tang,
              'Số cấu kiện': r.so_luong,
              'Đơn vị': r.don_vi ? UNIT_LABELS[r.don_vi] : '',
              'Khối lượng mô hình': r.khoi_luong,
              'Đơn giá': r.don_gia,
              'Thành tiền mô hình': r.thanh_tien,
              'KL theo tiến độ': r.completedQuantity,
              'Giá trị theo tiến độ': r.completedValue,
              'Cấu kiện có tiến độ': r.progressLinked,
              'Cảnh báo': r.issue ? COST_ISSUES[r.issue] : '',
              'Ước tính hình học': r.uoc_tinh_hinh_hoc ? 'Có' : '',
            }))
          : boqRows.map((r) => ({
              'Hợp đồng': contractName.get(r.item.ma_hop_dong) || r.item.ma_hop_dong,
              'Mã công tác': r.item.ma_hieu_cong_viec,
              'Công việc': r.item.ten_cong_viec,
              'Đơn vị': r.item.don_vi_tinh,
              'KL HĐ': r.item.khoi_luong,
              'KL mô hình đã ánh xạ': r.measurement?.modelQuantity ?? null,
              'KL nghiệm thu': r.item.khoi_luong_nghiem_thu,
              'Đơn giá': r.item.don_gia,
              'Giá trị HĐ': r.value,
              'Giá trị nghiệm thu': r.acceptedValue,
              'Cấu kiện liên kết': r.item.mapping?.so_guid ?? 0,
            }));
      const header = Object.keys(data[0] ?? {});
      const slug = (projectName || projectId).replace(/[^\p{L}\p{N}]+/gu, '_');
      downloadCsv(`BIM_KhoiLuong_${mode === 'element' ? 'CauKien' : 'BOQ'}_${slug}.csv`, [
        [
          `Dự án: ${projectName || projectId}`,
          `Phạm vi: ${validScope === 'all' ? 'Các mô hình đang mở' : names.get(validScope) || validScope}`,
          'Ô trống: chưa đủ dữ liệu, không quy đổi thành 0',
        ],
        header,
        ...data.map((row) => header.map((k) => (row as Record<string, string | number | null | undefined>)[k])),
      ]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không xuất được tệp CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-0 bg-white dark:bg-slate-800 rounded-xl overflow-hidden text-xs ${className}`}>
      <div className="shrink-0 space-y-1.5 overflow-y-auto border-b border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800 max-h-[52%]">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-900">
          {(['element', 'boq'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={mode === tab}
              onClick={() => {
                setMode(tab);
                setPage(0);
              }}
              className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 text-2xs font-bold transition-colors ${mode === tab ? 'bg-white text-primary-600 shadow-xs dark:bg-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'element' ? <Boxes className="h-3.5 w-3.5 shrink-0" /> : <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{tab === 'element' ? 'Theo Cấu kiện mô hình' : 'Theo BOQ Hợp đồng'}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {[
            {
              label: mode === 'element' ? 'Chi phí mô hình' : 'Giá trị BOQ HĐ',
              value: knownTotal,
              tone: 'blue',
            },
            {
              label: mode === 'element' ? 'Theo tiến độ' : 'Đã nghiệm thu',
              value: completedTotal,
              tone: 'emerald',
            },
            {
              label: 'Giá trị còn lại',
              value: completedTotal !== null && !unknownCosts ? Math.max(0, knownTotal - completedTotal) : null,
              tone: 'amber',
            },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="truncate text-3xs font-semibold uppercase tracking-tight text-slate-500" data-tooltip={k.label}>
                {k.label}
              </div>
              <div
                className={`mt-0.5 truncate text-xs font-black tabular-nums ${k.tone === 'blue' ? 'text-primary-600' : k.tone === 'emerald' ? 'text-emerald-600' : 'text-amber-600'}`}
              >
                {busy || error ? '—' : money(k.value)}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <label className="flex min-w-0 items-center gap-1">
            <Layers className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <BimSelect
              aria-label="Phạm vi mô hình"
              className={input}
              value={validScope}
              onChange={(e) => {
                setScope(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">Tất cả {shown.length} mô hình đang mở</option>
              <optgroup label="Theo mô hình IFC">
                {shown.map((m) => (
                  <option key={m.id} value={m.id}>
                    {names.get(m.id)}
                  </option>
                ))}
              </optgroup>
            </BimSelect>
          </label>
          {mode === 'element' ? (
            <div className="flex min-w-0 gap-1">
              <BimSelect
                aria-label="Nhóm khối lượng"
                className={input}
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as GroupBy);
                  setPage(0);
                }}
              >
                {Object.entries(GROUPS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </BimSelect>
              <button
                type="button"
                data-tooltip="Bảng đơn giá"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-2xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                onClick={() => setPriceManager((v) => !v)}
              >
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                Đơn giá
              </button>
            </div>
          ) : (
            <BimSelect
              aria-label="Hợp đồng BOQ"
              className={input}
              value={activeContract}
              onChange={(e) => {
                setContractFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">Tất cả {contracts.length} hợp đồng dự án</option>
              {contracts.map((c) => (
                <option key={c.ma_hop_dong} value={c.ma_hop_dong}>
                  {c.ten_hop_dong || c.ma_hop_dong}
                </option>
              ))}
            </BimSelect>
          )}
        </div>
        <div className="flex gap-1">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <BimInput
              aria-label="Tìm kiếm khối lượng"
              className={`${input} pl-7`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Tìm cấu kiện, vật liệu, mã công tác…"
            />
          </label>
          <button
            type="button"
            disabled={busy || !!error || exporting || !count}
            onClick={exportExcel}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-2xs font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
        {!!unknownCosts && !busy && !error && (
          <p
            className="truncate rounded-md bg-amber-50 px-2 py-1 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            data-tooltip={
              mode === 'element'
                ? 'Giá trị theo % thực tế của công việc tiến độ gắn cấu kiện là quy đổi tham khảo. Dấu —: thiếu đơn giá, khối lượng hoặc liên kết tiến độ.'
                : 'Khối lượng nghiệm thu lấy từ BOQ hợp đồng.'
            }
          >
            {unknownCosts} dòng chưa đủ khối lượng/đơn giá · Bấm &ldquo;Đơn giá&rdquo; để khai báo.
          </p>
        )}
        {actionError && (
          <p role="alert" className="text-rose-600">
            {actionError}
          </p>
        )}
        {priceManager && mode === 'element' && (
          <BimUnitPriceManager
            projectId={projectId}
            prices={prices}
            canEdit={canEdit}
            categories={[...new Set(rows.map((r) => r.loai_cau_kien))]}
            suggestions={missingPrices}
            defaultOpen
            className="max-h-64 overflow-auto"
          />
        )}
        {mode === 'boq' && boqList?.truncated && (
          <p role="status" className="text-amber-700 text-2xs">
            Đang hiển thị {formatNumber(boqList.loaded, 2)}/{formatNumber(boqList.total, 2)} công tác BOQ;
            thu hẹp theo hợp đồng để xem đủ.
          </p>
        )}
      </div>
      {busy ? (
        <div role="status" className="p-4 flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang tải bảng khối lượng…
        </div>
      ) : error ? (
        <p role="alert" className="p-3 text-rose-600">
          Không tải được bảng khối lượng: {error.message}
        </p>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto">
            <BimTable className="w-full text-2xs min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-500">
                <tr>
                  {(mode === 'element'
                    ? [
                        'Cấu kiện / Vật liệu',
                        'Số CK',
                        'ĐVT',
                        'KL mô hình',
                        'KL theo tiến độ',
                        'Đơn giá (₫)',
                        'Thành tiền (₫)',
                        'GT theo tiến độ (₫)',
                      ]
                    : [
                        'Công tác BOQ / Hợp đồng',
                        'CK gắn mô hình',
                        'ĐVT',
                        'KL HĐ',
                        'KL nghiệm thu',
                        'Đơn giá (₫)',
                        'Giá trị HĐ (₫)',
                        'GT nghiệm thu (₫)',
                      ]
                  ).map((label, i) => (
                    <th
                      key={label}
                      className={`px-2 py-2 ${i === 0 ? 'text-left min-w-52' : 'text-right whitespace-nowrap'}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mode === 'element'
                  ? elementGroups.slice(pageStart, pageStart + 50).map((group) => (
                      <tr key={group.key} className="hover:bg-primary-50/50 dark:hover:bg-slate-700/40">
                        <td className={`${cell} text-left whitespace-normal`}>
                          <button
                            type="button"
                            disabled={!onSelectElements || selecting}
                            onClick={() => selectGroup(group.rows)}
                            className="text-left font-semibold text-primary-700 dark:text-primary-300 disabled:text-slate-700 dark:disabled:text-slate-300"
                          >
                            <Crosshair className="w-3 h-3 inline mr-1" />
                            {group.label}
                          </button>
                          <div className="text-2xs text-slate-500">{group.sub}</div>
                          {group.quantity === null && group.physical && (
                            <div className="text-3xs text-slate-500">IFC: {group.physical}</div>
                          )}
                          {group.rows.some((r) => r.uoc_tinh_hinh_hoc) && (
                            <div className="text-3xs text-amber-600">Có khối lượng ước tính hình học</div>
                          )}
                          {group.rows.some((r) => r.issue) && (
                            <div className="text-3xs text-amber-700">
                              {[...new Set(group.rows.flatMap((r) => (r.issue ? [COST_ISSUES[r.issue]] : [])))].join(
                                ' · ',
                              )}
                            </div>
                          )}
                        </td>
                        <td className={cell}>{fmt(group.count, 0)}</td>
                        <td className={cell}>{group.unit ? UNIT_LABELS[group.unit] : '—'}</td>
                        <td className={cell}>{fmt(group.quantity)}</td>
                        <td className={`${cell} text-emerald-700`}>{fmt(group.completed)}</td>
                        <td className={cell}>{fmt(group.price, 0)}</td>
                        <td className={`${cell} font-semibold`}>{fmt(group.value, 0)}</td>
                        <td className={`${cell} font-semibold text-emerald-700`}>{fmt(group.completedValue, 0)}</td>
                      </tr>
                    ))
                  : boqRows
                      .slice(pageStart, pageStart + 50)
                      .map(({ item, mapping, outOfScope, measurement, value, acceptedValue }) => (
                        <tr key={item.ma_boq} className="hover:bg-emerald-50/50 dark:hover:bg-slate-700/40">
                          <td className={`${cell} text-left whitespace-normal`}>
                            <button
                              type="button"
                              disabled={!mapping || !onSelectElements || selecting}
                              onClick={() => void highlight(() => BimBoqService.mappingElements(item.ma_boq))}
                              className="text-left font-semibold text-primary-700 dark:text-primary-300 disabled:text-slate-700 dark:disabled:text-slate-300"
                            >
                              {item.ten_cong_viec}
                            </button>
                            <div className="text-2xs text-slate-500">
                              {item.ma_hieu_cong_viec} · {contractName.get(item.ma_hop_dong) ?? ''}
                            </div>
                            <div className="text-3xs text-slate-500">
                              {measurement
                                ? `KL mô hình: ${fmt(measurement.modelQuantity)} · ${measurement.issue || 'Đã ánh xạ'}`
                                : outOfScope
                                  ? 'Ánh xạ nằm ngoài mô hình đang mở'
                                  : 'Chưa ánh xạ mô hình'}
                            </div>
                          </td>
                          <td className={cell}>{item.mapping?.so_guid ?? 0}</td>
                          <td className={cell}>{item.don_vi_tinh}</td>
                          <td className={cell}>{fmt(item.khoi_luong)}</td>
                          <td className={`${cell} text-emerald-700`}>{fmt(item.khoi_luong_nghiem_thu)}</td>
                          <td className={cell}>{fmt(item.don_gia, 0)}</td>
                          <td className={`${cell} font-semibold`}>{fmt(value, 0)}</td>
                          <td className={`${cell} font-semibold text-emerald-700`}>{fmt(acceptedValue, 0)}</td>
                        </tr>
                      ))}
              </tbody>
              {!count && (
                <tbody>
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      {mode === 'element'
                        ? 'Chưa có khối lượng phù hợp trong các mô hình đang mở.'
                        : 'Chưa có công tác BOQ phù hợp với phạm vi đã chọn.'}
                    </td>
                  </tr>
                </tbody>
              )}
            </BimTable>
          </div>
          <div className="shrink-0 border-t p-2 flex items-center justify-between text-2xs text-slate-500">
            <span className="flex items-center gap-1">
              <Sigma className="w-3 h-3" />
              {count} {mode === 'element' ? 'nhóm cấu kiện' : 'công tác BOQ'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!activePage} onClick={() => setPage(activePage - 1)}>
                Trước
              </button>
              {activePage + 1}/{Math.max(1, Math.ceil(count / 50))}
              <button type="button" disabled={pageStart + 50 >= count} onClick={() => setPage(activePage + 1)}>
                Sau
              </button>
            </div>
          </div>
        </>
      )}
      {mode === 'boq' && canEdit && (
        <div className="shrink-0 max-h-[45%] overflow-auto border-t p-2 space-y-2">
          <BimAutoLinkBoq projectId={projectId} models={targets} canEdit={canEdit} />
          <button
            type="button"
            aria-expanded={mappingOpen}
            onClick={() => setMappingOpen((v) => !v)}
            className="text-primary-600 font-semibold"
          >
            {mappingOpen ? 'Thu gọn đối chiếu BOQ' : 'Đối chiếu / ánh xạ BOQ thủ công'}
          </button>
          {mappingOpen && (
            <BimBoqPanel projectId={projectId} models={targets} canEdit={canEdit} onSelectElements={onSelectElements} />
          )}
        </div>
      )}
    </div>
  );
};
