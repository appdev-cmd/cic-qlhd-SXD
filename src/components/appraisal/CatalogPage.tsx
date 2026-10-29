import React, { useEffect, useState } from 'react';
import { History, Pencil, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { CatalogEditor, CatalogHistory } from './CatalogEditor';
import { apiRequest, type Page } from '../../services/apiClient';
import { DossierGrid, type GridColumn } from './DossierGrid';
import { EntityLink } from '../ui/EntityLink';
import { SearchableSelect } from '../ui/SearchableSelect';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { PaginationBar } from '../ui/PaginationBar';
import { GridToolbar, GridSearchInput, GridCount } from '../ui/grid/GridToolbar';
import { FilterChips, type FilterChip } from '../ui/grid/FilterChips';
import { useFilterState } from '../../hooks/useFilterState';
import { formatDate, formatCurrency } from '../../lib/utils';

type Row = { id: string; [key: string]: any };
type Kind = 'organizations' | 'personnel' | 'material_prices';
const PAGE_SIZE = 50;
const names: Record<Kind, string> = {
  organizations: 'Tổ chức tham gia',
  personnel: 'Cá nhân hành nghề',
  material_prices: 'Giá vật liệu',
};
const units: Record<Kind, string> = {
  organizations: 'tổ chức',
  personnel: 'cá nhân',
  material_prices: 'mục giá',
};
const labels: Record<string, string> = {
  investor: 'Chủ đầu tư',
  consultant_design: 'Tư vấn thiết kế',
  consultant_audit: 'Tư vấn thẩm tra',
  contractor: 'Nhà thầu',
  supervisor: 'Tư vấn giám sát',
  hieu_luc: 'Còn hiệu lực',
  sap_het_han: 'Sắp hết hạn',
  het_han: 'Hết hạn',
  tam_dung: 'Tạm dừng',
  thu_hoi: 'Thu hồi',
  active: 'Hoạt động',
  suspended: 'Tạm dừng',
};
/** Single-line cell; AutoTableTooltip shows the full text when it is cut off. */
const clip = (text: React.ReactNode) => <span className="block truncate">{text}</span>;

export function CatalogPage({ kind }: { kind: Kind }) {
  const [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [history, setHistory] = useState<Row | null>(null);
  const defaults = {
    search: '',
    category: 'all',
    status: 'all',
    sort: kind === 'personnel' ? 'full_name' : 'name',
    direction: 'asc',
  };
  const [filters, setFilters] = useFilterState('catalog-' + kind, defaults);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<
    (Page<Row> & { categories: string[]; statuses: string[]; canEdit?: boolean }) | null
  >(null);
  useEffect(() => setOffset(0), [JSON.stringify(filters)]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    const timer = setTimeout(() => {
      apiRequest<Page<Row> & { categories: string[]; statuses: string[] }>(
        '/catalog/' + kind + '?' + new URLSearchParams({ ...filters, offset: String(offset) }),
      )
        .then((p) => {
          if (active) setData(p);
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setData(null);
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, JSON.stringify(filters), offset, version]);
  const resetFilters = () => {
    setFilters({ ...filters, search: '', category: 'all', status: 'all' });
    setOffset(0);
  };
  const isPrices = kind === 'material_prices';
  // Widths keep the table within ~1050 px (1366 px screen with the menu); secondary columns fold away below 2xl/xl/lg.
  const columns: GridColumn<Row>[] = [
    {
      label: 'Mã',
      sortKey: 'code',
      value: (r) => r.code || '—',
      render: (r) => clip(r.code || '—'),
      width: 140,
      hideBelow: '2xl',
    },
    {
      label: kind === 'personnel' ? 'Họ và tên' : 'Tên',
      sortKey: kind === 'personnel' ? 'full_name' : 'name',
      value: (r) => r.full_name || r.name,
      width: 240,
      render: (r) =>
        isPrices ? (
          clip(r.name)
        ) : (
          <EntityLink
            type={kind === 'organizations' ? 'organization' : 'personnel'}
            id={r.id}
            name={r.full_name || r.name}
            className="block"
          />
        ),
    },
  ];
  const money = (value: unknown) => (
    <span className="block whitespace-nowrap font-mono tabular-nums">
      {value == null ? 'Chưa có' : formatCurrency(Number(value))}
    </span>
  );
  if (isPrices)
    columns.push(
      { label: 'Đơn vị', sortKey: 'unit', value: (r) => r.unit || '—', width: 100 },
      {
        label: 'Giá công bố',
        sortKey: 'standard_price',
        value: (r) => Number(r.standard_price || 0),
        render: (r) => money(r.standard_price),
        width: 160,
      },
      {
        label: 'Giá thị trường',
        sortKey: 'market_price',
        value: (r) => Number(r.market_price || 0),
        render: (r) => money(r.market_price),
        width: 160,
        hideBelow: 'lg',
      },
      {
        label: 'Địa bàn',
        sortKey: 'region',
        value: (r) => r.region || '—',
        render: (r) => clip(r.region || '—'),
        width: 160,
        hideBelow: '2xl',
      },
      { label: 'Kỳ công bố', sortKey: 'period', value: (r) => r.period || '—', width: 130 },
      {
        label: 'Nhà cung cấp',
        sortKey: 'supplier',
        value: (r) => r.supplier || '—',
        render: (r) => clip(r.supplier || '—'),
        width: 180,
        hideBelow: '2xl',
      },
    );
  else
    columns.push(
      {
        label: kind === 'organizations' ? 'Loại tổ chức' : 'Đơn vị',
        sortKey: kind === 'organizations' ? 'type' : 'org_name',
        value: (r) => labels[r.type] || r.org_name || r.type || '—',
        render: (r) =>
          kind === 'personnel' && r.org_id ? (
            <EntityLink type="organization" id={r.org_id} name={r.org_name || 'Xem đơn vị'} className="block" />
          ) : (
            clip(labels[r.type] || r.org_name || r.type || '—')
          ),
        width: 190,
      },
      {
        label: 'Chứng chỉ',
        sortKey: 'cert_number',
        value: (r) => r.cert_number || 'Chưa ghi nhận',
        render: (r) => clip(r.cert_number || 'Chưa ghi nhận'),
        width: 150,
        hideBelow: 'xl',
      },
      { label: 'Hạng', sortKey: 'cert_grade', value: (r) => r.cert_grade || '—', width: 80, hideBelow: '2xl' },
      {
        label: 'Hết hạn',
        sortKey: 'cert_expiry',
        value: (r) => r.cert_expiry || '',
        render: (r) => (r.cert_expiry ? formatDate(r.cert_expiry) : 'Chưa ghi nhận'),
        width: 110,
        hideBelow: 'lg',
      },
      {
        label: 'Trạng thái ghi nhận',
        sortKey: 'status',
        value: (r) => labels[r.status] || r.status || 'Chưa xác định',
        render: (r) => clip(labels[r.status] || r.status || 'Chưa xác định'),
        width: 150,
      },
    );
  columns.push({
    label: 'Thao tác',
    value: (r) => r.code || '',
    width: 170,
    render: (r) => (
      <div className="flex gap-2">
        {data?.canEdit && (
          <Button size="xs" variant="secondary" leftIcon={<Pencil size={12} />} onClick={() => setEditing(r)}>
            Sửa
          </Button>
        )}
        <Button size="xs" variant="ghost" leftIcon={<History size={12} />} onClick={() => setHistory(r)}>
          Lịch sử
        </Button>
      </div>
    ),
  });

  const categoryLabel = (value: string) => labels[value] || value;
  const chips: FilterChip[] = [];
  if (filters.search.trim())
    chips.push({
      id: 'search',
      label: 'Từ khóa',
      value: filters.search,
      onRemove: () => setFilters({ ...filters, search: '' }),
    });
  if (filters.category !== 'all')
    chips.push({
      id: 'category',
      label: 'Phân loại',
      value: categoryLabel(filters.category),
      onRemove: () => setFilters({ ...filters, category: 'all' }),
    });
  if (filters.status !== 'all')
    chips.push({
      id: 'status',
      label: isPrices ? 'Kỳ giá' : 'Trạng thái',
      value: categoryLabel(filters.status),
      onRemove: () => setFilters({ ...filters, status: 'all' }),
    });

  // For material prices the "status" facet is the publication period, so it sits in the period slot.
  const statusSelect = (
    <div className="w-48">
      <SearchableSelect
        value={filters.status}
        onChange={(status) => setFilters({ ...filters, status })}
        options={[
          { value: 'all', label: isPrices ? 'Tất cả kỳ giá' : 'Tất cả trạng thái' },
          ...(data?.statuses || []).map((value) => ({ value, label: categoryLabel(value) })),
        ]}
      />
    </div>
  );
  const rows = data?.items || [];
  const showEmpty = Boolean(data) && !busy && rows.length === 0;

  return (
    <div className="space-y-4 text-ink dark:text-slate-100">
      <PageHeader
        className="[&>div]:mb-0"
        title={names[kind]}
        description={
          isPrices
            ? 'Đối chiếu văn bản công bố và kỳ giá trước khi dùng; chưa kết nối tự động với nguồn công bố giá.'
            : 'Dữ liệu trong phạm vi quyền truy cập. Đối chiếu chứng chỉ với nguồn cấp trước khi xác nhận năng lực.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={14} />}
              loading={busy && Boolean(data)}
              loadingText="Đang tải…"
              disabled={busy}
              onClick={() => setVersion((n) => n + 1)}
            >
              Tải lại
            </Button>
            {data?.canEdit && (
              <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing(null)}>
                Thêm mới
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-2">
        <GridToolbar
          search={
            <GridSearchInput
              value={filters.search}
              onChange={(search) => setFilters({ ...filters, search })}
              label="Tìm danh mục"
              placeholder="Tìm tên, mã, chứng chỉ…"
            />
          }
          classification={
            <div className="w-48">
              <SearchableSelect
                value={filters.category}
                onChange={(category) => setFilters({ ...filters, category })}
                options={[
                  { value: 'all', label: 'Tất cả phân loại' },
                  ...(data?.categories || []).map((value) => ({ value, label: categoryLabel(value) })),
                ]}
              />
            </div>
          }
          status={isPrices ? undefined : statusSelect}
          period={isPrices ? statusSelect : undefined}
          onReset={resetFilters}
          count={
            data ? (
              <GridCount total={data.total} unit={units[kind]} detail={busy ? 'đang tải' : undefined} />
            ) : (
              <GridCount total={0} unit={units[kind]} detail="đang tải" />
            )
          }
        />
        <FilterChips chips={chips} onClearAll={resetFilters} />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {showEmpty ? (
        <div className="rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
          {chips.length ? (
            <EmptyState
              variant="search"
              title="Không có bản ghi khớp bộ lọc"
              description="Thử bỏ bớt điều kiện lọc hoặc tìm theo mã, số chứng chỉ."
            >
              <Button variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={resetFilters}>
                Đặt lại bộ lọc
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              variant="folder"
              title={'Chưa có ' + names[kind].toLowerCase() + ' trong phạm vi quyền truy cập'}
              description={
                data?.canEdit ? 'Thêm bản ghi đầu tiên để dùng khi tiếp nhận và thẩm định hồ sơ.' : undefined
              }
              actionLabel={data?.canEdit ? 'Thêm mới' : undefined}
              onAction={data?.canEdit ? () => setEditing(null) : undefined}
            />
          )}
        </div>
      ) : (
        <DossierGrid
          storageKey={'catalog-' + kind}
          columns={columns}
          rows={rows}
          loading={!data && busy}
          serverSort={{ key: filters.sort, direction: filters.direction }}
          onSort={(sort, direction) => setFilters({ ...filters, sort, direction })}
          showRowNumbers
          rowOffset={offset}
        />
      )}
      <PaginationBar
        page={Math.floor(offset / PAGE_SIZE) + 1}
        totalPages={Math.ceil((data?.total || 0) / PAGE_SIZE)}
        total={data?.total || 0}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => setOffset((p - 1) * PAGE_SIZE)}
        unit={units[kind]}
      />
      {editing !== undefined && (
        <CatalogEditor
          kind={kind}
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setVersion((n) => n + 1);
          }}
        />
      )}
      {history && <CatalogHistory kind={kind} row={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
