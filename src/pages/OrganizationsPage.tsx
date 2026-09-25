import { useMemo } from 'react';
import { Eye } from 'lucide-react';
import { DataGrid, useDataGrid, type GridColumn } from '../components/grid/DataGrid';
import { GridToolbar } from '../components/grid/GridToolbar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { EntityLink } from '../components/ui/EntityLink';
import { Tooltip } from '../components/ui/Tooltip';
import { ORGANIZATION_TYPE_LABELS } from '../components/entity/OrganizationDetailPanel';
import { useOrganizations } from '../hooks/useData';
import { useFilterState } from '../hooks/useFilterState';
import { useEntityPanel } from '../hooks/useEntityPanel';
import { useDeepLinkPanel } from '../hooks/useDeepLinkPanel';
import { formatDate } from '../lib/utils';
import type { Organization } from '../types/domain';

const FILTER_DEFAULTS = { q: '', type: '', status: '' };

type OrgColumnKey = 'name' | 'type' | 'certificate' | 'activeProjectsCount' | 'status';

export function OrganizationsPage() {
  useDeepLinkPanel('organization');
  const { open } = useEntityPanel();
  const { filters, setFilter, resetFilters, activeCount } = useFilterState('organizations', FILTER_DEFAULTS);

  const { data: organizations = [], isLoading, isFetching, error, refetch } = useOrganizations({
    search: filters.q || undefined,
    type: (filters.type || undefined) as Organization['type'] | undefined,
    status: (filters.status || undefined) as Organization['status'] | undefined,
  });

  const columns = useMemo<GridColumn<Organization, OrgColumnKey>[]>(
    () => [
      {
        key: 'name',
        header: 'Mã & Tên Tổ chức',
        width: 380,
        render: (org) => (
          <div className="flex flex-col py-0.5 min-w-0">
            <EntityLink type="organization" id={org.id} name={org.name} className="font-bold text-ink" />
            <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5 truncate">
              {org.code} • MST: {org.taxCode}
            </span>
          </div>
        ),
      },
      {
        key: 'type',
        header: 'Phân loại',
        width: 190,
        sortValue: (org) => ORGANIZATION_TYPE_LABELS[org.type]?.label,
        render: (org) => {
          const conf = ORGANIZATION_TYPE_LABELS[org.type] ?? {
            label: 'Khác',
            cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          };
          return <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${conf.cls}`}>{conf.label}</span>;
        },
      },
      {
        key: 'certificate',
        header: 'Chứng chỉ Năng lực',
        width: 210,
        sortValue: (org) => org.certificateNumber,
        render: (org) =>
          org.certificateNumber ? (
            <div className="flex flex-col text-2xs min-w-0">
              <span className="font-mono font-bold text-ink truncate">{org.certificateNumber}</span>
              <span className="text-3xs text-ink-muted truncate">
                Hạng {org.certificateGrade ?? '—'} (Hạn: {formatDate(org.certificateExpiry)})
              </span>
            </div>
          ) : (
            <span className="text-ink-muted italic">Cơ quan Nhà nước</span>
          ),
      },
      {
        key: 'activeProjectsCount',
        header: 'Dự án tại Tỉnh',
        width: 120,
        align: 'center',
        render: (org) => (
          <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{org.activeProjectsCount} DA</span>
        ),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 150,
        align: 'center',
        render: (org) => <StatusBadge status={org.status} />,
      },
    ],
    []
  );

  const grid = useDataGrid('organizations', columns, { key: 'name', direction: 'asc' });
  const openDetail = (org: Organization) => open('organization', { id: org.id, label: org.name });

  return (
    <div className="space-y-4">
      <GridToolbar
        search={filters.q}
        onSearchChange={(v) => setFilter('q', v)}
        searchPlaceholder="Tìm tên đơn vị, MST, đại diện, địa chỉ... (hỗ trợ không dấu, viết tắt)"
        classification={
          <div className="w-52">
            <SearchableSelect
              value={filters.type}
              onChange={(v) => setFilter('type', v)}
              options={[
                { value: '', label: 'Tất cả Loại hình' },
                ...Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, c]) => ({ value, label: c.label })),
              ]}
            />
          </div>
        }
        status={
          <div className="w-44">
            <SearchableSelect
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={[
                { value: '', label: 'Tất cả Trạng thái' },
                { value: 'hieu_luc', label: 'Còn hiệu lực' },
                { value: 'sap_het_han', label: 'Sắp hết hạn (<90 ngày)' },
                { value: 'het_han', label: 'Đã hết hạn' },
              ]}
            />
          </div>
        }
        onReset={() => {
          resetFilters();
          grid.resetLayout();
        }}
        activeFilterCount={activeCount}
        resultCount={organizations.length}
        resultUnit="tổ chức"
      />

      <DataGrid
        columns={columns}
        rows={organizations}
        grid={grid}
        getRowId={(o) => o.id}
        onRowClick={openDetail}
        isLoading={isLoading || isFetching}
        error={error as Error | null}
        onRetry={() => refetch()}
        rowActions={(org) => (
          <Tooltip content="Xem chi tiết tổ chức" placement="left">
            <button
              type="button"
              onClick={() => openDetail(org)}
              className="p-1.5 rounded-md hover:bg-subtle text-ink-muted hover:text-primary-600 dark:hover:bg-slate-800 dark:hover:text-primary-400"
            >
              <Eye size={14} />
            </button>
          </Tooltip>
        )}
        actionsWidth={72}
      />
    </div>
  );
}
