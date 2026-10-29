import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, List, Camera, MapPin, Building, ArrowRight, Plus, RotateCcw } from 'lucide-react';
import { MasterTable, type Column } from '../components/MasterTable';
import { GridToolbar, GridSearchInput, GridCount } from '../components/ui/grid/GridToolbar';
import { FilterChips, type FilterChip } from '../components/ui/grid/FilterChips';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PaginationBar } from '../components/ui/PaginationBar';
import type { Project } from '../types/project';
import { projectService } from '../services/projectService';
import { useFilterState } from '../hooks/useFilterState';
import { formatCurrency } from '../lib/utils';
import { useSlidePanel } from '../context/SlidePanelContext';
import { ProjectDetailSlidePanel } from './projects/ProjectDetailSlidePanel';
import { useAuth } from '../context/AuthContext';
import { listCache } from '../lib/listCache';
import { CreateProjectModal } from '../components/appraisal/CreateProjectModal';
import { EntityLink } from '../components/ui/EntityLink';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { search: '', group: 'all', status: 'all', stage: 'all' };

const STAGE_OPTIONS = [
  { value: 'all', label: 'Tất cả giai đoạn' },
  { value: 'bcnckt', label: 'Thẩm định BCNCKT' },
  { value: 'gpxd', label: 'Cấp giấy phép XD' },
  { value: 'nghiem_thu', label: 'Kiểm tra nghiệm thu' },
  { value: 'hoan_thanh', label: 'Hoàn thành' },
];
const GROUP_OPTIONS = [
  { value: 'all', label: 'Tất cả nhóm DA' },
  { value: 'QG', label: 'Quan trọng quốc gia' },
  { value: 'A', label: 'Dự án nhóm A' },
  { value: 'B', label: 'Dự án nhóm B' },
  { value: 'C', label: 'Dự án nhóm C' },
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'tiep_nhan', label: 'Mới tiếp nhận' },
  { value: 'dang_tham_dinh', label: 'Đang thẩm định' },
  { value: 'yeu_cau_bo_sung', label: 'Yêu cầu bổ sung' },
  { value: 'da_tham_dinh', label: 'Đã có kết quả' },
  { value: 'qua_han', label: 'Quá hạn SLA' },
];
const STAGE_SHORT: Record<Project['stage'], string> = {
  bcnckt: 'BCNCKT',
  gpxd: 'Cấp GPXD',
  nghiem_thu: 'Nghiệm thu',
  hoan_thanh: 'Hoàn thành',
};
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label || value;
const groupLabel = (group: Project['projectGroup'] | null) =>
  !group ? 'Chưa phân nhóm' : group === 'QG' ? 'Quan trọng QG' : 'Nhóm ' + group;

export function ProjectsPage() {
  const { mode, profile, session } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const { openPanel } = useSlidePanel();
  const [storedFilters, setFilters] = useFilterState('projects-filters-v2', EMPTY_FILTERS);
  const filters = { ...EMPTY_FILTERS, ...storedFilters };
  const [sorting, setSorting] = useFilterState('projects-sort-v1', { key: 'submissionDate', direction: 'desc' });
  const setFilter = (patch: Partial<typeof EMPTY_FILTERS>) => setFilters({ ...filters, ...patch });
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const lastSearch = useRef(filters.search);
  const canCreate = mode === 'cloud' && ['admin', 'officer', 'head_of_department'].includes(profile?.role || '');
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener('appraisal:changed', refresh);
    return () => window.removeEventListener('appraisal:changed', refresh);
  }, []);
  useEffect(() => setPage(0), [JSON.stringify(filters), JSON.stringify(sorting)]);
  const queryKey = JSON.stringify(['projects', session?.user.id || 'demo', filters, sorting, page]);
  useEffect(() => {
    let active = true;
    // Show the last result for this query at once, then refresh in the background.
    const cached = listCache.get<{ items: Project[]; total: number }>(queryKey);
    if (cached) {
      setProjects(cached.items);
      setTotal(cached.total);
    }
    setLoading(!cached);
    // Debounce only while the user is typing a search; other changes load immediately.
    const typing = lastSearch.current !== filters.search;
    lastSearch.current = filters.search;
    const timer = setTimeout(
      () => {
        projectService
          .list({
            ...filters,
            sort: sorting.key,
            direction: sorting.direction,
            offset: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          })
          .then((result) => {
            listCache.set(queryKey, result);
            if (active) {
              setProjects(result.items);
              setTotal(result.total);
              setError('');
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      typing ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [queryKey, version]);

  const handleOpenDetail = (project: Project) => {
    openPanel({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `Mã: ${project.code} • ${project.investorName}`,
      tabTitle: project.code,
      icon: <Building size={14} />,
      component: <ProjectDetailSlidePanel project={project} />,
      storageKey: `slidepanel-project-${project.id}`,
    });
  };

  const chips: FilterChip[] = [];
  if (filters.search.trim())
    chips.push({ id: 'search', label: 'Từ khóa', value: filters.search, onRemove: () => setFilter({ search: '' }) });
  if (filters.stage !== 'all')
    chips.push({
      id: 'stage',
      label: 'Giai đoạn',
      value: labelOf(STAGE_OPTIONS, filters.stage),
      onRemove: () => setFilter({ stage: 'all' }),
    });
  if (filters.group !== 'all')
    chips.push({
      id: 'group',
      label: 'Nhóm dự án',
      value: labelOf(GROUP_OPTIONS, filters.group),
      onRemove: () => setFilter({ group: 'all' }),
    });
  if (filters.status !== 'all')
    chips.push({
      id: 'status',
      label: 'Trạng thái',
      value: labelOf(STATUS_OPTIONS, filters.status),
      onRemove: () => setFilter({ status: 'all' }),
    });

  const emptyState = chips.length ? (
    <EmptyState
      variant="search"
      title="Không có dự án khớp bộ lọc"
      description="Thử bỏ bớt điều kiện lọc hoặc tìm theo mã dự án, tên chủ đầu tư."
    >
      <Button variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={resetFilters}>
        Đặt lại bộ lọc
      </Button>
    </EmptyState>
  ) : (
    <EmptyState
      variant="folder"
      title="Chưa có dự án trong phạm vi quản lý"
      description="Dự án được tạo khi tiếp nhận hồ sơ thẩm định, cấp phép hoặc nghiệm thu."
      actionLabel={canCreate ? 'Tiếp nhận dự án' : undefined}
      onAction={canCreate ? () => setCreateOpen(true) : undefined}
    />
  );

  const columns: Column<Project>[] = [
    {
      header: 'Mã & Tên Dự án',
      sortValue: (p) => p.name,
      sortKey: 'name',
      accessor: (p) => (
        <div className="flex items-center gap-3 py-1">
          {p.coverImage && (
            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border dark:border-slate-700 bg-slate-950 dark:bg-slate-950 group/img shadow-xs">
              <img
                src={p.coverImage}
                alt={p.name}
                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300"
                loading="lazy"
              />
              {p.images && p.images.length > 0 && (
                <span className="absolute bottom-0 right-0 bg-black/75 backdrop-blur-xs text-white dark:text-white text-2xs px-1 py-0.2 rounded-tl font-mono flex items-center gap-0.5">
                  <Camera size={8} />
                  {p.images.length}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="block truncate font-bold text-ink dark:text-slate-100">
              <EntityLink type="project" id={p.id} name={p.name} onClick={() => handleOpenDetail(p)} />
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 text-3xs font-mono min-w-0">
              <span className="text-primary-600 dark:text-primary-400 font-bold shrink-0">{p.code}</span>
              <span className="text-ink-muted dark:text-slate-500">•</span>
              <span className="truncate text-ink-secondary dark:text-slate-300">
                {groupLabel(p.projectGroup)}
                {p.buildingGrade ? ` (Cấp ${p.buildingGrade})` : ''}
              </span>
            </div>
          </div>
        </div>
      ),
      width: '26%',
    },
    {
      header: 'Chủ đầu tư / Ban QLDA',
      sortValue: (p) => p.investorName,
      sortKey: 'investorName',
      accessor: (p) => (
        <span className="block truncate text-ink-secondary dark:text-slate-300">
          {p.investorId ? <EntityLink type="organization" id={p.investorId} name={p.investorName} /> : p.investorName}
        </span>
      ),
      width: '18%',
      hideBelow: 'xl',
    },
    {
      header: 'Địa bàn (Huyện/Thị)',
      sortValue: (p) => p.location,
      sortKey: 'location',
      accessor: (p) => <span className="block truncate text-ink-secondary dark:text-slate-300">{p.location}</span>,
      width: '12%',
      hideBelow: 'xl',
    },
    {
      header: 'Tổng mức đầu tư',
      sortValue: (p) => p.totalInvestment ?? 0,
      sortKey: 'totalInvestment',
      accessor: (p) => (
        <span className="font-mono tabular-nums font-bold text-ink dark:text-slate-100 text-right block whitespace-nowrap">
          {formatCurrency(p.totalInvestment)}
        </span>
      ),
      className: 'text-right',
      width: '15%',
    },
    {
      header: 'Giai đoạn',
      sortValue: (p) => p.stage,
      sortKey: 'stage',
      accessor: (p) => (
        <div className="text-center">
          <span className="whitespace-nowrap px-2 py-0.5 rounded-md bg-subtle dark:bg-slate-800 border border-border dark:border-slate-700 text-2xs font-semibold text-ink-secondary dark:text-slate-300 uppercase">
            {STAGE_SHORT[p.stage] || p.stage}
          </span>
        </div>
      ),
      className: 'text-center',
      width: '8%',
      hideBelow: '2xl',
    },
    {
      header: 'Trạng thái SLA',
      sortValue: (p) => p.slaStatus,
      sortKey: 'slaStatus',
      accessor: (p) => (
        <div className="text-center">
          <StatusBadge status={p.slaStatus} />
        </div>
      ),
      className: 'text-center',
      width: '12%',
    },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {createOpen && (
        <CreateProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={(p) => {
            setCreateOpen(false);
            setVersion((v) => v + 1);
            handleOpenDetail(p);
          }}
        />
      )}
      <PageHeader
        className="[&>div]:mb-0"
        title="Danh mục dự án"
        description="Dự án đầu tư xây dựng trên địa bàn tỉnh Điện Biên trong phạm vi quản lý: thẩm định BCNCKT, cấp GPXD, kiểm tra nghiệm thu."
        actions={
          canCreate && (
            <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              Tiếp nhận dự án
            </Button>
          )
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
        >
          {error}
        </p>
      )}
      {/* ─── THANH CÔNG CỤ LỌC CHUẨN 5 VỊ TRÍ + CHẾ ĐỘ XEM ─── */}
      <div className="space-y-2">
        <GridToolbar
          search={
            <GridSearchInput
              value={filters.search}
              onChange={(search) => setFilter({ search })}
              label="Tìm dự án"
              className="sm:w-60"
              placeholder="Tìm theo tên dự án, mã hồ sơ, chủ đầu tư, địa bàn..."
            />
          }
          classification={
            <>
              <div className="w-40">
                <SearchableSelect
                  value={filters.stage}
                  onChange={(stage) => setFilter({ stage })}
                  options={STAGE_OPTIONS}
                />
              </div>
              <div className="w-40">
                <SearchableSelect
                  value={filters.group}
                  onChange={(group) => setFilter({ group })}
                  options={GROUP_OPTIONS}
                />
              </div>
            </>
          }
          status={
            <div className="w-40">
              <SearchableSelect
                value={filters.status}
                onChange={(status) => setFilter({ status })}
                options={STATUS_OPTIONS}
              />
            </div>
          }
          onReset={resetFilters}
          count={
            loading && !total ? (
              <GridCount total={0} unit="dự án" detail="đang tải" />
            ) : (
              <GridCount total={total} unit="dự án" />
            )
          }
          actions={
            <div
              role="group"
              aria-label="Chế độ xem"
              className="flex items-center gap-0.5 rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 p-0.5"
            >
              {(
                [
                  ['table', 'Chế độ xem bảng chi tiết', List],
                  ['cards', 'Chế độ xem lưới thẻ phối cảnh & hình ảnh', LayoutGrid],
                ] as const
              ).map(([view, label, Icon]) => (
                <IconButton
                  key={view}
                  size="sm"
                  variant={viewMode === view ? 'secondary' : 'ghost'}
                  icon={<Icon size={15} />}
                  aria-label={label}
                  aria-pressed={viewMode === view}
                  tooltip={label}
                  tooltipPlacement="bottom"
                  onClick={() => setViewMode(view)}
                  className="shadow-none"
                />
              ))}
            </div>
          }
        />
        <FilterChips chips={chips} onClearAll={resetFilters} />
      </div>

      {/* ─── NỘI DUNG THEO CHẾ ĐỘ XEM ─── */}
      {viewMode === 'table' ? (
        <MasterTable
          storageKey="projects-grid"
          serverSort={sorting}
          onSort={(key, direction) => setSorting({ key, direction })}
          columns={columns}
          data={projects}
          rowOffset={page * PAGE_SIZE}
          rowLabel={(p) => p.name}
          loading={loading && !projects.length}
          onRowClick={handleOpenDetail}
          onView={handleOpenDetail}
          empty={emptyState}
          maxHeight="calc(100vh - 290px)"
        />
      ) : !projects.length ? (
        loading ? (
          <p role="status" className="py-10 text-center text-sm text-ink-muted dark:text-slate-400">
            Đang tải dự án…
          </p>
        ) : (
          <div className="rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
            {emptyState}
          </div>
        )
      ) : (
        /* CHẾ ĐỘ XEM LƯỚI THẺ ẢNH PHỐI CẢNH (CARDS VIEW) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => {
            return (
              <div
                key={p.id}
                onClick={() => handleOpenDetail(p)}
                className="group relative rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col cursor-pointer hover:border-primary-500/40 dark:hover:border-primary-700"
              >
                {/* Ảnh bìa phối cảnh nổi bật */}
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-950 dark:bg-slate-950">
                  <img
                    src={
                      p.coverImage ||
                      'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80'
                    }
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 group-hover:opacity-75 transition-opacity" />

                  {/* Header badges trên ảnh */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-3xs font-bold bg-black/60 text-white dark:text-white backdrop-blur-md border border-white/20 shadow-xs">
                      {groupLabel(p.projectGroup)}
                      {p.buildingGrade ? ` • Cấp ${p.buildingGrade}` : ''}
                    </span>
                    <StatusBadge status={p.slaStatus} />
                  </div>

                  {/* Badge số lượng ảnh & Giai đoạn ở chân ảnh */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white dark:text-white text-2xs">
                    <span className="font-mono text-3xs font-bold px-2 py-0.5 rounded-md bg-primary-600/90 backdrop-blur-xs">
                      {p.code}
                    </span>
                    {p.images && p.images.length > 0 && (
                      <span className="flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs border border-white/20">
                        <Camera size={11} />
                        <span>{p.images.length} hình ảnh</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Thông tin chi tiết dự án */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-ink dark:text-slate-100 line-clamp-2 leading-snug">
                      <EntityLink
                        type="project"
                        id={p.id}
                        name={p.name}
                        onClick={() => handleOpenDetail(p)}
                        className="whitespace-normal"
                      />
                    </h3>

                    <div className="space-y-1.5 text-2xs text-ink-secondary dark:text-slate-300">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building size={13} className="text-ink-muted dark:text-slate-500 shrink-0" />
                        <span className="truncate min-w-0">
                          {p.investorId ? (
                            <EntityLink type="organization" id={p.investorId} name={p.investorName} />
                          ) : (
                            p.investorName
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin size={13} className="text-ink-muted dark:text-slate-500 shrink-0" />
                        <span className="truncate">{p.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Thư viện ảnh nhỏ xem nhanh (Mini Gallery Preview) */}
                  {p.images && p.images.length > 1 && (
                    <div className="pt-2 border-t border-border dark:border-slate-800">
                      <p className="text-3xs text-ink-muted dark:text-slate-400 uppercase font-semibold tracking-wider mb-1.5">
                        Hình ảnh tư liệu khảo sát & phối cảnh:
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {p.images.slice(0, 4).map((subImg, sIdx) => (
                          <div
                            key={subImg.id || sIdx}
                            className="aspect-video rounded-md overflow-hidden border border-border dark:border-slate-700 bg-slate-900 dark:bg-slate-900 relative group/sub"
                          >
                            <img
                              src={subImg.thumbnailUrl || subImg.url}
                              alt={subImg.title}
                              className="w-full h-full object-cover group-hover/sub:scale-110 transition-transform duration-200"
                              loading="lazy"
                            />
                            {sIdx === 3 && p.images && p.images.length > 4 && (
                              <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-white dark:text-white text-2xs font-bold">
                                +{p.images.length - 4}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chỉ số tài chính & Nút hành động */}
                  <div className="pt-3 border-t border-border dark:border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-3xs uppercase tracking-wider text-ink-muted dark:text-slate-400 block">
                        Tổng mức đầu tư
                      </span>
                      <span className="font-mono tabular-nums font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.totalInvestment)}
                      </span>
                    </div>

                    <Button
                      size="xs"
                      variant="secondary"
                      rightIcon={<ArrowRight size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(p);
                      }}
                    >
                      Xem hồ sơ
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PaginationBar
        page={page + 1}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => setPage(p - 1)}
        unit="dự án"
      />
    </div>
  );
}
