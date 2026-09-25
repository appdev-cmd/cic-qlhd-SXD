import { useMemo } from 'react';
import { Coins, FileSpreadsheet } from 'lucide-react';
import { DataGrid, useDataGrid, type GridColumn } from '../components/grid/DataGrid';
import { GridToolbar } from '../components/grid/GridToolbar';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Tooltip } from '../components/ui/Tooltip';
import { useMaterialPrices } from '../hooks/useData';
import { useFilterState } from '../hooks/useFilterState';
import { downloadCsv } from '../lib/exportCsv';
import { cn, formatCurrency } from '../lib/utils';
import type { MaterialPrice } from '../types/domain';

const FILTER_DEFAULTS = { q: '', region: '', period: '' };

type PriceKey = 'name' | 'unit' | 'standardPrice' | 'marketPrice' | 'diff' | 'region' | 'period';

const diffPct = (p: MaterialPrice) => (p.standardPrice > 0 ? ((p.marketPrice - p.standardPrice) / p.standardPrice) * 100 : 0);

export function CostDatabasePage() {
  const { filters, setFilter, resetFilters, activeCount } = useFilterState('material_prices', FILTER_DEFAULTS);
  const { data: allPrices = [], isLoading, isFetching, error, refetch } = useMaterialPrices(filters.q || undefined);

  // Danh mục khu vực / kỳ công bố lấy từ dữ liệu thật (ít bản ghi) — lọc phụ tại client
  const regions = useMemo(() => [...new Set(allPrices.map((p) => p.region))].sort(), [allPrices]);
  const periods = useMemo(() => [...new Set(allPrices.map((p) => p.period))].sort().reverse(), [allPrices]);
  const prices = allPrices.filter(
    (p) => (!filters.region || p.region === filters.region) && (!filters.period || p.period === filters.period)
  );

  const columns = useMemo<GridColumn<MaterialPrice, PriceKey>[]>(
    () => [
      {
        key: 'name',
        header: 'Mã & Tên vật liệu xây dựng',
        width: 380,
        render: (p) => (
          <div className="flex flex-col py-0.5 min-w-0">
            <span className="font-bold text-ink line-clamp-1">{p.name}</span>
            <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5 truncate">
              {p.code} • {p.supplier}
            </span>
          </div>
        ),
      },
      { key: 'unit', header: 'ĐVT', width: 70, align: 'center', render: (p) => <span className="font-semibold">{p.unit}</span> },
      {
        key: 'standardPrice',
        header: 'Giá công bố liên sở',
        width: 170,
        align: 'right',
        render: (p) => <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{formatCurrency(p.standardPrice)}</span>,
      },
      {
        key: 'marketPrice',
        header: 'Giá thị trường khảo sát',
        width: 170,
        align: 'right',
        render: (p) => <span className="font-mono">{formatCurrency(p.marketPrice)}</span>,
      },
      {
        key: 'diff',
        header: 'Chênh lệch',
        width: 110,
        align: 'right',
        sortValue: diffPct,
        render: (p) => {
          const d = diffPct(p);
          return (
            <span
              className={cn(
                'font-mono font-semibold text-2xs',
                d > 5 ? 'text-rose-600 dark:text-rose-400' : d > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {d > 0 ? '+' : ''}
              {d.toFixed(1)}%
            </span>
          );
        },
      },
      { key: 'region', header: 'Khu vực áp dụng', width: 200, render: (p) => <span className="text-ink-secondary truncate block">{p.region}</span> },
      {
        key: 'period',
        header: 'Kỳ công bố',
        width: 110,
        align: 'center',
        render: (p) => (
          <span className="px-2 py-0.5 rounded bg-subtle border border-border text-3xs font-semibold text-ink-muted dark:bg-slate-800 dark:border-slate-700">
            {p.period}
          </span>
        ),
      },
    ],
    []
  );
  const grid = useDataGrid('material_prices', columns, { key: 'name', direction: 'asc' });

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border bg-surface shadow-card flex items-center gap-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-200">
          <Coins size={22} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Công bố giá vật liệu xây dựng liên Sở Xây dựng – Tài chính tỉnh Điện Biên</h3>
          <p className="text-2xs text-ink-muted mt-0.5">
            Căn cứ NĐ 206/2026/NĐ-CP và TT 37/2026/TT-BXD (khảo sát, công bố giá VLXD). Chênh lệch &gt; 5% được đánh dấu đỏ để rà soát khi
            kiểm tra tổng mức đầu tư.
          </p>
        </div>
      </div>

      <GridToolbar
        search={filters.q}
        onSearchChange={(v) => setFilter('q', v)}
        searchPlaceholder="Tìm tên vật liệu, mã, đơn vị cung ứng..."
        classification={
          <div className="w-52">
            <SearchableSelect
              value={filters.region}
              onChange={(v) => setFilter('region', v)}
              options={[{ value: '', label: 'Tất cả Khu vực' }, ...regions.map((r) => ({ value: r, label: r }))]}
            />
          </div>
        }
        time={
          <div className="w-40">
            <SearchableSelect
              value={filters.period}
              onChange={(v) => setFilter('period', v)}
              options={[{ value: '', label: 'Tất cả Kỳ công bố' }, ...periods.map((p) => ({ value: p, label: p }))]}
            />
          </div>
        }
        onReset={() => {
          resetFilters();
          grid.resetLayout();
        }}
        activeFilterCount={activeCount}
        resultCount={prices.length}
        resultUnit="vật liệu"
        actions={
          <Tooltip content="Xuất bảng giá đang lọc ra file Excel (CSV UTF-8)" placement="top">
            <button
              type="button"
              onClick={() =>
                downloadCsv(`gia-vlxd-dien-bien-${new Date().toISOString().slice(0, 10)}`, prices, [
                  { header: 'Mã', value: (p) => p.code },
                  { header: 'Tên vật liệu', value: (p) => p.name },
                  { header: 'ĐVT', value: (p) => p.unit },
                  { header: 'Giá công bố (VNĐ)', value: (p) => p.standardPrice },
                  { header: 'Giá thị trường (VNĐ)', value: (p) => p.marketPrice },
                  { header: 'Chênh lệch (%)', value: (p) => diffPct(p).toFixed(1) },
                  { header: 'Khu vực', value: (p) => p.region },
                  { header: 'Kỳ công bố', value: (p) => p.period },
                  { header: 'Đơn vị cung ứng', value: (p) => p.supplier },
                ])
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-xs font-medium text-ink dark:border-slate-800 dark:bg-slate-900"
            >
              <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </button>
          </Tooltip>
        }
      />

      <DataGrid
        columns={columns}
        rows={prices}
        grid={grid}
        getRowId={(p) => p.id}
        isLoading={isLoading || isFetching}
        error={error as Error | null}
        onRetry={() => refetch()}
      />
    </div>
  );
}
