import { useMemo, useState } from 'react';
import { LayoutGrid, List, Camera, MapPin, Building, ArrowRight, Eye, FileSpreadsheet, Plus, Loader2 } from 'lucide-react';
import { DataGrid, useDataGrid, type GridColumn } from '../components/grid/DataGrid';
import { DateRangeFilter, GridToolbar } from '../components/grid/GridToolbar';
import { StatusBadge, STATUS_LABELS } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Tooltip } from '../components/ui/Tooltip';
import { EntityLink } from '../components/ui/EntityLink';
import { useOrganizations, useProjects, useStaff } from '../hooks/useData';
import { useFilterState } from '../hooks/useFilterState';
import { useEntityPanel } from '../hooks/useEntityPanel';
import { useDeepLinkPanel } from '../hooks/useDeepLinkPanel';
import { useSlidePanel } from '../context/SlidePanelContext';
import { listAllProjects, type ProjectFilters, type ProjectSortKey } from '../data-access/projects';
import { downloadCsv } from '../lib/exportCsv';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import type { Project } from '../types/domain';
import { DossierIntakeForm } from './projects/DossierIntakeForm';

const FILTER_DEFAULTS = { q: '', stage: '', group: '', assignee: '', investor: '', sla: '', from: '', to: '', view: 'table' };

const STAGE_LABEL: Record<Project['stage'], string> = {
  bcnckt: 'BCNCKT',
  gpxd: 'Cấp GPXD',
  nghiem_thu: 'Nghiệm thu',
  hoan_thanh: 'Hoàn thành',
};

export function ProjectsPage() {
  useDeepLinkPanel('project');
  const { open } = useEntityPanel();
  const { openPanel } = useSlidePanel();
  const { filters, setFilter, setFilters, resetFilters, activeCount } = useFilterState('projects', FILTER_DEFAULTS);
  const { data: staff = [] } = useStaff();
  const { data: organizations = [] } = useOrganizations({ type: 'investor' });
  const [isExporting, setIsExporting] = useState(false);

  const columns = useMemo<GridColumn<Project, ProjectSortKey>[]>(
    () => [
      {
        key: 'name',
        header: 'Mã & Tên Dự án',
        width: 400,
        render: (p) => (
          <div className="flex items-center gap-3 py-1 min-w-0">
            {p.coverImage && (
              <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-border bg-slate-950 dark:border-slate-700">
                <img src={p.coverImage} alt="" className="w-full h-full object-cover" loading="lazy" />
                {p.images && p.images.length > 0 && (
                  <span className="absolute bottom-0 right-0 bg-black/75 text-white text-[9px] px-1 rounded-tl font-mono flex items-center gap-0.5">
                    <Camera size={8} />
                    {p.images.length}
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <EntityLink type="project" id={p.id} name={p.name} className="font-bold text-ink line-clamp-1" />
              <div className="flex items-center gap-1.5 mt-0.5 text-3xs font-mono">
                <span className="text-primary-600 dark:text-primary-400 font-bold">{p.code}</span>
                <span className="text-ink-muted">•</span>
                <span className="text-ink-secondary truncate">
                  Nhóm {p.projectGroup} (Cấp {p.buildingGrade}) • {p.field}
                </span>
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'investorName',
        header: 'Chủ đầu tư / Ban QLDA',
        width: 230,
        render: (p) =>
          p.investorId ? (
            <EntityLink type="organization" id={p.investorId} name={p.investorName} className="text-ink-secondary line-clamp-2" />
          ) : (
            <span className="text-ink-secondary line-clamp-2">{p.investorName}</span>
          ),
      },
      {
        key: 'assignee',
        header: 'Chuyên viên thụ lý',
        width: 170,
        render: (p) => <span className="text-ink-secondary truncate block">{p.assignee || '—'}</span>,
      },
      {
        key: 'location',
        header: 'Địa bàn',
        width: 150,
        render: (p) => <span className="text-ink-secondary truncate block">{p.location}</span>,
      },
      {
        key: 'totalInvestment',
        header: 'Tổng mức đầu tư',
        width: 170,
        align: 'right',
        render: (p) => <span className="font-mono font-bold text-ink">{formatCurrency(p.totalInvestment)}</span>,
      },
      {
        key: 'stage',
        header: 'Giai đoạn',
        width: 110,
        align: 'center',
        render: (p) => (
          <span className="px-2 py-0.5 rounded-md bg-subtle border border-border text-2xs font-semibold text-ink-secondary uppercase dark:bg-slate-800 dark:border-slate-700">
            {STAGE_LABEL[p.stage]}
          </span>
        ),
      },
      {
        key: 'submissionDate',
        header: 'Tiếp nhận',
        width: 110,
        align: 'center',
        render: (p) => <span className="font-mono text-2xs">{formatDate(p.submissionDate)}</span>,
      },
      {
        key: 'deadlineDate',
        header: 'Hạn trả KQ',
        width: 110,
        align: 'center',
        render: (p) => <span className="font-mono text-2xs font-semibold">{formatDate(p.deadlineDate)}</span>,
      },
      {
        key: 'slaStatus',
        header: 'Trạng thái SLA',
        width: 150,
        align: 'center',
        render: (p) => <StatusBadge status={p.slaStatus} />,
      },
    ],
    []
  );

  const grid = useDataGrid('projects', columns, { key: 'submissionDate', direction: 'desc' });

  const queryFilters: ProjectFilters = {
    search: filters.q || undefined,
    stage: (filters.stage || undefined) as Project['stage'] | undefined,
    projectGroup: (filters.group || undefined) as Project['projectGroup'] | undefined,
    assigneeStaffId: filters.assignee || undefined,
    investorId: filters.investor || undefined,
    slaStatus: (filters.sla || undefined) as Project['slaStatus'] | undefined,
    submittedFrom: filters.from || undefined,
    submittedTo: filters.to || undefined,
  };

  const { data, isLoading, isFetching, error, refetch } = useProjects({
    ...queryFilters,
    sort: grid.sort ?? undefined,
    pageSize: 500,
  });
  const projects = data?.rows ?? [];

  const openDetail = (p: Project) => open('project', { id: p.id, label: p.name, subtitle: `Mã: ${p.code} • ${p.investorName}` });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows = await listAllProjects(queryFilters);
      downloadCsv(`ho-so-tham-dinh-${new Date().toISOString().slice(0, 10)}`, rows, [
        { header: 'Mã hồ sơ', value: (p) => p.code },
        { header: 'Tên dự án', value: (p) => p.name },
        { header: 'Chủ đầu tư', value: (p) => p.investorName },
        { header: 'Nhóm', value: (p) => p.projectGroup },
        { header: 'Cấp công trình', value: (p) => p.buildingGrade },
        { header: 'Lĩnh vực', value: (p) => p.field },
        { header: 'Địa bàn', value: (p) => p.location },
        { header: 'Tổng mức đầu tư (VNĐ)', value: (p) => p.totalInvestment },
        { header: 'Tiết giảm (VNĐ)', value: (p) => p.estimatedSavings },
        { header: 'Giai đoạn', value: (p) => STATUS_LABELS[p.stage] },
        { header: 'Trạng thái SLA', value: (p) => STATUS_LABELS[p.slaStatus] },
        { header: 'Ngày tiếp nhận', value: (p) => formatDate(p.submissionDate) },
        { header: 'Hạn trả kết quả', value: (p) => formatDate(p.deadlineDate) },
        { header: 'Chuyên viên thụ lý', value: (p) => p.assignee },
      ]);
    } finally {
      setIsExporting(false);
    }
  };

  const openIntake = () =>
    openPanel({
      id: 'dossier-intake',
      title: 'Tiếp nhận hồ sơ thẩm định mới',
      subtitle: 'Nghị định 217/2026/NĐ-CP — Điều 35, 36',
      tabTitle: 'Tiếp nhận mới',
      icon: <Plus size={14} />,
      component: <DossierIntakeForm />,
      storageKey: 'slidepanel-dossier-intake',
    });

  return (
    <div className="space-y-4">
      <GridToolbar
        search={filters.q}
        onSearchChange={(v) => setFilter('q', v)}
        searchPlaceholder="Tìm theo tên dự án, mã hồ sơ, chủ đầu tư, địa bàn... (gõ không dấu, viết tắt)"
        classification={
          <>
            <div className="w-40">
              <SearchableSelect
                value={filters.stage}
                onChange={(v) => setFilter('stage', v)}
                options={[
                  { value: '', label: 'Tất cả Thủ tục' },
                  { value: 'bcnckt', label: 'Thẩm định BCNCKT' },
                  { value: 'gpxd', label: 'Cấp Giấy phép XD' },
                  { value: 'nghiem_thu', label: 'Kiểm tra Nghiệm thu' },
                  { value: 'hoan_thanh', label: 'Hoàn thành' },
                ]}
              />
            </div>
            <div className="w-36">
              <SearchableSelect
                value={filters.group}
                onChange={(v) => setFilter('group', v)}
                options={[
                  { value: '', label: 'Tất cả Nhóm DA' },
                  { value: 'QG', label: 'Quan trọng quốc gia' },
                  { value: 'A', label: 'Dự án Nhóm A' },
                  { value: 'B', label: 'Dự án Nhóm B' },
                  { value: 'C', label: 'Dự án Nhóm C' },
                ]}
              />
            </div>
          </>
        }
        assignee={
          <>
            <div className="w-48">
              <SearchableSelect
                value={filters.assignee}
                onChange={(v) => setFilter('assignee', v)}
                options={[
                  { value: '', label: 'Tất cả Chuyên viên' },
                  ...staff.filter((s) => s.role === 'officer').map((s) => ({ value: s.id, label: s.fullName, sublabel: s.department })),
                ]}
              />
            </div>
            <div className="w-56">
              <SearchableSelect
                value={filters.investor}
                onChange={(v) => setFilter('investor', v)}
                options={[
                  { value: '', label: 'Tất cả Chủ đầu tư' },
                  ...organizations.map((o) => ({ value: o.id, label: o.name, sublabel: o.code })),
                ]}
              />
            </div>
          </>
        }
        status={
          <div className="w-40">
            <SearchableSelect
              value={filters.sla}
              onChange={(v) => setFilter('sla', v)}
              options={[
                { value: '', label: 'Tất cả Trạng thái' },
                { value: 'tiep_nhan', label: 'Mới tiếp nhận' },
                { value: 'dang_tham_dinh', label: 'Đang thẩm định' },
                { value: 'yeu_cau_bo_sung', label: 'Yêu cầu bổ sung' },
                { value: 'da_tham_dinh', label: 'Đã có kết quả' },
                { value: 'qua_han', label: 'Quá hạn SLA' },
              ]}
            />
          </div>
        }
        time={
          <DateRangeFilter
            label="Tiếp nhận:"
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => setFilters({ ...filters, from, to })}
          />
        }
        extra={
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-subtle dark:border-slate-800 dark:bg-slate-800">
            {(['table', 'cards'] as const).map((mode) => (
              <Tooltip key={mode} content={mode === 'table' ? 'Xem dạng bảng' : 'Xem dạng thẻ ảnh phối cảnh'} placement="top">
                <button
                  type="button"
                  onClick={() => setFilter('view', mode)}
                  className={cn(
                    'p-1.5 rounded-md transition-all',
                    filters.view === mode ? 'bg-surface text-ink shadow-xs dark:bg-slate-900' : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {mode === 'table' ? <List size={15} /> : <LayoutGrid size={15} />}
                </button>
              </Tooltip>
            ))}
          </div>
        }
        onReset={() => {
          resetFilters();
          grid.resetLayout();
        }}
        activeFilterCount={activeCount - (filters.view !== 'table' ? 1 : 0)}
        resultCount={data?.total ?? 0}
        resultUnit="hồ sơ"
        actions={
          <>
            <Tooltip content="Xuất toàn bộ kết quả lọc ra file Excel (CSV UTF-8)" placement="top">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-xs font-medium text-ink disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900"
              >
                {isExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="hidden sm:inline">Xuất Excel</span>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={openIntake}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold shadow-sm"
            >
              <Plus size={14} />
              <span>Tiếp nhận Hồ sơ Mới</span>
            </button>
          </>
        }
      />

      {filters.view !== 'cards' ? (
        <DataGrid
          columns={columns}
          rows={projects}
          grid={grid}
          sortMode="server"
          getRowId={(p) => p.id}
          onRowClick={openDetail}
          isLoading={isLoading || isFetching}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="Không có hồ sơ khớp bộ lọc"
          rowActions={(p) => (
            <Tooltip content="Xem chi tiết hồ sơ" placement="left">
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => openDetail(p)}
              className="group relative rounded-2xl border border-border bg-surface overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col cursor-pointer hover:border-primary-400 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
                {p.coverImage && (
                  <img
                    src={p.coverImage}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-3xs font-bold bg-black/60 text-white border border-white/20">
                    Nhóm {p.projectGroup} • Cấp {p.buildingGrade}
                  </span>
                  <StatusBadge status={p.slaStatus} />
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
                  <span className="font-mono text-3xs font-bold px-2 py-0.5 rounded-md bg-primary-600">{p.code}</span>
                  {p.images && p.images.length > 0 && (
                    <span className="flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-md bg-black/60 border border-white/20">
                      <Camera size={11} />
                      {p.images.length} hình ảnh
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-ink group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-snug">
                    {p.name}
                  </h3>
                  <div className="space-y-1.5 text-2xs text-ink-secondary">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Building size={13} className="text-ink-muted shrink-0" />
                      <span className="truncate">{p.investorName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={13} className="text-ink-muted shrink-0" />
                      <span className="truncate">{p.location}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2 dark:border-slate-800">
                  <div>
                    <span className="text-3xs uppercase tracking-wider text-ink-muted block">Tổng mức đầu tư</span>
                    <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(p.totalInvestment)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-600 font-semibold text-2xs group-hover:bg-primary-600 group-hover:text-white transition-all dark:bg-primary-900 dark:text-primary-200">
                    Xem hồ sơ <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
