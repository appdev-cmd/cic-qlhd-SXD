import React, { useState } from 'react';
import { MasterTable, type Column } from '../components/MasterTable';
import { TableToolbar } from '../components/TableToolbar';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { MOCK_MATERIAL_PRICES, type MaterialPrice } from '../data/mockData';
import { formatCurrency } from '../lib/utils';
import { Coins, FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import { matchesSmartSearch } from '../lib/smartSearch';

export function CostDatabasePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');

  const filteredPrices = MOCK_MATERIAL_PRICES.filter((p) => {
    const matchSearch =
      matchesSmartSearch(p.name, searchQuery) ||
      matchesSmartSearch(p.code, searchQuery) ||
      matchesSmartSearch(p.supplier, searchQuery);

    const matchRegion = regionFilter === 'all' || p.region === regionFilter;
    return matchSearch && matchRegion;
  });

  const columns: Column<MaterialPrice>[] = [
    {
      header: 'Mã & Tên Vật liệu Xây dựng',
      accessor: (p) => (
        <div className="flex flex-col py-0.5">
          <span className="font-bold text-ink hover:text-primary-600 transition-colors line-clamp-1">
            {p.name}
          </span>
          <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5">
            Mã: {p.code} • Đơn vị cung ứng: {p.supplier}
          </span>
        </div>
      ),
      width: '45%',
    },
    {
      header: 'Đơn vị tính',
      accessor: (p) => <span className="font-semibold text-ink-secondary">{p.unit}</span>,
      className: 'text-center',
      width: '10%',
    },
    {
      header: 'Giá Công bố Liên sở (VNĐ)',
      accessor: (p) => (
        <span className="font-mono font-bold text-primary-600 text-right block">
          {formatCurrency(p.standardPrice)}
        </span>
      ),
      className: 'text-right',
      width: '18%',
    },
    {
      header: 'Khu vực áp dụng',
      accessor: (p) => <span className="text-ink-secondary">{p.region}</span>,
      width: '15%',
    },
    {
      header: 'Kỳ công bố',
      accessor: (p) => (
        <span className="px-2 py-0.5 rounded bg-subtle border border-border text-3xs font-semibold text-ink-muted">
          {p.period}
        </span>
      ),
      className: 'text-center',
      width: '12%',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ─── BANNER CÔNG BỐ GIÁ LIÊN SỞ ─── */}
      <div className="p-4 rounded-xl border border-primary-500/20 bg-surface shadow-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-500/10 text-primary-600">
            <Coins size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">
              Bảng Công bố Giá Vật liệu Xây dựng Liên Sở Xây dựng – Tài chính Tỉnh Điện Biên
            </h3>
            <p className="text-2xs text-ink-muted mt-0.5">
              Áp dụng kỳ Tháng 09/2026 • Căn cứ theo Nghị định số 206/2026/NĐ-CP và Thông tư số 38/2026/TT-BXD
            </p>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-xs font-semibold text-ink transition-colors"
        >
          <Download size={14} />
          <span>Tải file Excel Công bố</span>
        </button>
      </div>

      <TableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Tìm kiếm tên vật liệu, mã, đơn vị cung ứng..."
        resultCount={filteredPrices.length}
        onResetFilters={() => {
          setSearchQuery('');
          setRegionFilter('all');
        }}
        filters={
          <div className="w-48">
            <SearchableSelect
              value={regionFilter}
              onChange={setRegionFilter}
              options={[
                { value: 'all', label: 'Tất cả Khu vực' },
                { value: 'TP. Điện Biên Phủ', label: 'TP. Điện Biên Phủ' },
                { value: 'Huyện Mường Ảng', label: 'Huyện Mường Ảng' },
                { value: 'Toàn tỉnh Điện Biên', label: 'Toàn tỉnh Điện Biên' },
              ]}
            />
          </div>
        }
      />

      <MasterTable
        columns={columns}
        data={filteredPrices}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
