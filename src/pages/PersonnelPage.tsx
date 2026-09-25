import { useMemo } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';
import { DataGrid, useDataGrid, type GridColumn } from '../components/grid/DataGrid';
import { GridToolbar } from '../components/grid/GridToolbar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { EntityLink } from '../components/ui/EntityLink';
import { Tooltip } from '../components/ui/Tooltip';
import { useOrganizations, usePersonnelList } from '../hooks/useData';
import { useFilterState } from '../hooks/useFilterState';
import { useEntityPanel } from '../hooks/useEntityPanel';
import { useDeepLinkPanel } from '../hooks/useDeepLinkPanel';
import { cn, formatDate } from '../lib/utils';
import type { Personnel } from '../types/domain';

const FILTER_DEFAULTS = { q: '', grade: '', org: '', status: '' };

type PersonnelColumnKey = 'fullName' | 'certNumber' | 'specialties' | 'certGrade' | 'certExpiry' | 'activeProjectsCount' | 'status';

const GRADE_CLASS: Record<Personnel['certGrade'], string> = {
  I: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  II: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  III: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

export function PersonnelPage() {
  useDeepLinkPanel('personnel');
  const { open } = useEntityPanel();
  const { filters, setFilter, resetFilters, activeCount } = useFilterState('personnel', FILTER_DEFAULTS);
  const { data: organizations = [] } = useOrganizations();

  const { data: personnel = [], isLoading, isFetching, error, refetch } = usePersonnelList({
    search: filters.q || undefined,
    certGrade: (filters.grade || undefined) as Personnel['certGrade'] | undefined,
    status: (filters.status || undefined) as Personnel['status'] | undefined,
    orgId: filters.org || undefined,
  });

  const columns = useMemo<GridColumn<Personnel, PersonnelColumnKey>[]>(
    () => [
      {
        key: 'fullName',
        header: 'Họ tên & Đơn vị Công tác',
        width: 320,
        render: (p) => (
          <div className="flex items-center gap-2.5 py-0.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-50 border border-primary-200 flex items-center justify-center font-bold text-xs text-primary-600 shrink-0 dark:bg-primary-900 dark:border-primary-800 dark:text-primary-200">
              {p.fullName.split(' ').slice(-1)[0]?.[0]}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <EntityLink type="personnel" id={p.id} name={p.fullName} className="font-bold text-ink" />
                {p.hasConflictWarning && (
                  <Tooltip content="Cảnh báo: quá tải dự án hoặc chứng chỉ hết hạn" placement="top">
                    <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                  </Tooltip>
                )}
              </div>
              <span className="text-3xs text-ink-muted truncate">{p.orgName}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'certNumber',
        header: 'Số Chứng chỉ Hành nghề',
        width: 190,
        render: (p) => (
          <div className="flex flex-col min-w-0">
            <span className="font-mono font-bold text-primary-600 dark:text-primary-400 truncate">{p.certNumber}</span>
            <span className="text-3xs text-ink-muted truncate">{p.certIssuer}</span>
          </div>
        ),
      },
      {
        key: 'specialties',
        header: 'Lĩnh vực Chuyên môn',
        width: 240,
        sortValue: (p) => p.specialties.join(', '),
        render: (p) => <span className="text-2xs text-ink-secondary line-clamp-2">{p.specialties.join(' • ')}</span>,
      },
      {
        key: 'certGrade',
        header: 'Hạng',
        width: 90,
        align: 'center',
        render: (p) => (
          <span className={cn('px-2 py-0.5 rounded text-2xs font-bold font-mono', GRADE_CLASS[p.certGrade])}>
            Hạng {p.certGrade}
          </span>
        ),
      },
      {
        key: 'certExpiry',
        header: 'Hết hạn CCHN',
        width: 120,
        align: 'center',
        render: (p) => <span className="font-mono text-2xs">{formatDate(p.certExpiry)}</span>,
      },
      {
        key: 'activeProjectsCount',
        header: 'Dự án',
        width: 80,
        align: 'center',
        render: (p) => <span className="font-mono font-bold text-ink">{p.activeProjectsCount}</span>,
      },
      {
        key: 'status',
        header: 'Tình trạng',
        width: 150,
        align: 'center',
        render: (p) => <StatusBadge status={p.status} />,
      },
    ],
    []
  );

  const grid = useDataGrid('personnel', columns, { key: 'fullName', direction: 'asc' });
  const openDetail = (p: Personnel) => open('personnel', { id: p.id, label: p.fullName });

  return (
    <div className="space-y-4">
      <GridToolbar
        search={filters.q}
        onSearchChange={(v) => setFilter('q', v)}
        searchPlaceholder="Tìm họ tên, số CCHN, đơn vị, chuyên môn..."
        classification={
          <div className="w-40">
            <SearchableSelect
              value={filters.grade}
              onChange={(v) => setFilter('grade', v)}
              options={[
                { value: '', label: 'Tất cả Hạng CCHN' },
                { value: 'I', label: 'Hạng I' },
                { value: 'II', label: 'Hạng II' },
                { value: 'III', label: 'Hạng III' },
              ]}
            />
          </div>
        }
        assignee={
          <div className="w-60">
            <SearchableSelect
              value={filters.org}
              onChange={(v) => setFilter('org', v)}
              placeholder="Đơn vị công tác"
              options={[
                { value: '', label: 'Tất cả Đơn vị công tác' },
                ...organizations.filter((o) => o.type !== 'investor').map((o) => ({ value: o.id, label: o.name, sublabel: o.code })),
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
                { value: '', label: 'Tất cả Tình trạng' },
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
        resultCount={personnel.length}
        resultUnit="cá nhân"
      />

      <DataGrid
        columns={columns}
        rows={personnel}
        grid={grid}
        getRowId={(p) => p.id}
        onRowClick={openDetail}
        isLoading={isLoading || isFetching}
        error={error as Error | null}
        onRetry={() => refetch()}
        rowActions={(p) => (
          <Tooltip content="Xem chi tiết cá nhân" placement="left">
            <button
              type="button"
              onClick={() => openDetail(p)}
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
