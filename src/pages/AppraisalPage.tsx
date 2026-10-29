import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Plus, Download, RefreshCw, FlaskConical } from 'lucide-react';
import { appraisalService as api } from '../services/appraisalService';
import type { DossierSummary, Health } from '../types/appraisal';
import { AppraisalWorkspace } from './projects/appraisal/AppraisalWorkspace';
import { DossierGrid } from '../components/appraisal/DossierGrid';
import { ReviewModal } from '../components/appraisal/ReviewModal';
import { EntityLink } from '../components/ui/EntityLink';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DateInput } from '../components/ui/DateInput';
import { useSlidePanel } from '../context/SlidePanelContext';
import { useFilterState } from '../hooks/useFilterState';
import { useAuth } from '../context/AuthContext';
import { listCache } from '../lib/listCache';
import { formatDate, formatDateTime, todayIso } from '../lib/utils';

import type { Project } from '../types/project';
import { projectService } from '../services/projectService';
import { ProjectSelect } from '../components/appraisal/ProjectSelect';
import { PROJECT_PROCEDURES, SUBMISSION_STATUS, type ProjectProcedure } from '../lib/projectProcedures';
import { SubmissionWorkspace } from '../components/appraisal/SubmissionWorkspace';
import { PermitRegister } from '../components/appraisal/PermitRegister';
import { SlaBadge, SLA_FILTER_OPTIONS } from '../components/appraisal/SlaBadge';
import { GridToolbar, GridSearchInput, GridCount } from '../components/ui/grid/GridToolbar';
import { FilterChips, type FilterChip } from '../components/ui/grid/FilterChips';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { PaginationBar } from '../components/ui/PaginationBar';
import { useWorkCounts } from '../hooks/useWorkCounts';

type QuickView = 'all' | 'mine' | 'queue' | 'due_soon' | 'overdue';
const EMPTY_FILTERS = {
  search: '',
  kind: 'all',
  projectId: '',
  status: 'all',
  sla: 'all',
  from: '',
  to: '',
  scope: '',
};
const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'intake', label: 'Tiếp nhận' },
  { value: 'analyzing', label: 'Đang kiểm tra' },
  { value: 'analyzed', label: 'Đã kiểm tra' },
  { value: 'request_supplement', label: 'Yêu cầu bổ sung' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'reviewed', label: 'Đã rà soát nội bộ' },
  { value: 'suspended', label: 'Tạm dừng thẩm định' },
  { value: 'rejected', label: 'Từ chối tiếp nhận' },
  { value: 'stopped', label: 'Dừng xử lý' },
];
const ProjectPanel = lazy(() =>
  import('./projects/ProjectDetailSlidePanel').then((m) => ({ default: m.ProjectDetailSlidePanel })),
);

const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-sm text-ink-secondary dark:text-ink-secondary disabled:opacity-50';
const input =
  'focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
export function AppraisalPage({ procedure = 'bcnckt', project }: { procedure?: ProjectProcedure; project?: Project }) {
  const config = PROJECT_PROCEDURES[procedure];
  const { id } = useParams();
  const { openPanel } = useSlidePanel();
  const [items, setItems] = useState<DossierSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const { session } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useFilterState('submission-sort-' + procedure, { key: 'updatedAt', direction: 'desc' });
  const [view, setView] = useFilterState('submission-view-' + procedure, 'list');
  const register = procedure === 'gpxd' && !project && view === 'register';
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(false);
  const [linking, setLinking] = useState<DossierSummary | null>(null);
  const [linkId, setLinkId] = useState('');
  const [form, setForm] = useState({
    projectId: project?.id || '',
    name: '',
    province: project?.location || 'Điện Biên',
    legalDate: todayIso(),
  });
  const [initial, setInitial] = useState('');
  const [storedFilters, setFilters] = useFilterState(
    'submission-list-' + procedure + '-' + (project?.id || 'all'),
    EMPTY_FILTERS,
  );
  // Older saved filters have no `scope`; fill new keys from the defaults.
  const filters = { ...EMPTY_FILTERS, ...storedFilters };
  const counts = useWorkCounts();
  const quickView: QuickView =
    filters.scope === 'mine' || filters.scope === 'queue'
      ? (filters.scope as QuickView)
      : filters.sla === 'overdue' || filters.sla === 'due_soon'
        ? (filters.sla as QuickView)
        : 'all';
  // Quick views are exclusive: each one replaces the scope and the quick SLA filter of the previous view.
  const setQuickView = (view: QuickView) =>
    setFilters({
      ...filters,
      scope: view === 'mine' || view === 'queue' ? view : '',
      sla: view === 'overdue' || view === 'due_soon' ? view : 'all',
    });
  // Deep links from the deadline bell and dashboard: ?sla=overdue and/or ?scope=mine|queue apply once.
  const location = useLocation();
  useEffect(() => {
    if (project) return;
    const params = new URLSearchParams(location.search);
    const sla = params.get('sla');
    const scope = params.get('scope');
    const validSla = !!sla && SLA_FILTER_OPTIONS.some((o) => o.value === sla);
    const validScope = scope === 'mine' || scope === 'queue';
    if (!validSla && !validScope) return;
    setFilters((current) => ({
      ...current,
      sla: validSla ? (sla as string) : 'all',
      scope: validScope ? (scope as string) : '',
    }));
    setPage(0);
    window.history.replaceState(window.history.state, '', location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  const lastSearch = useRef(filters.search);
  const queryKey = JSON.stringify([
    'submissions',
    session?.user.id || 'demo',
    procedure,
    project?.id || '',
    filters,
    sort,
    page,
  ]);
  const load = async () => {
    const current = ++requestId.current;
    const [h, result] = await Promise.all([
      // Health only decides which actions are available; fetch it once per page visit.
      health ? Promise.resolve(health) : api.health(),
      api.page({
        offset: page * 50,
        limit: 50,
        procedure,
        projectId: project?.id || filters.projectId,
        search: filters.search,
        kind: filters.kind,
        status: filters.status,
        sla: filters.sla,
        dateFrom: filters.from,
        dateTo: filters.to,
        scope: (filters.scope || '') as '' | 'mine' | 'queue',
        sort: sort.key,
        direction: sort.direction,
      }),
    ]);
    listCache.set(queryKey, result);
    if (current === requestId.current) {
      setHealth(h);
      setItems(result.items);
      setTotal(result.total);
      setLoaded(true);
    }
  };
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    // Show the last result for this query at once, then refresh; debounce only while typing a search.
    const cached = listCache.get<{ items: DossierSummary[]; total: number }>(queryKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
    }
    setLoaded(!!cached);
    const typing = lastSearch.current !== filters.search;
    lastSearch.current = filters.search;
    const timer = setTimeout(() => void action(load), typing ? 250 : 0);
    return () => {
      clearTimeout(timer);
      requestId.current++;
    };
  }, [queryKey]);
  useEffect(() => setPage(0), [JSON.stringify(filters), sort.key, sort.direction]);
  useEffect(() => {
    const refresh = () => {
      void load().catch((e) => setError(e.message));
    };
    window.addEventListener('appraisal:changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('appraisal:changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [page, procedure, project?.id, JSON.stringify(filters), sort.key, sort.direction]);
  const open = (d: DossierSummary) =>
    openPanel({
      id: 'dossier-' + d.id,
      title: d.name,
      tabTitle: PROJECT_PROCEDURES[d.procedure || 'bcnckt'].label,
      component:
        (d.procedure || 'bcnckt') === 'bcnckt' ? (
          <AppraisalWorkspace dossierId={d.id} />
        ) : (
          <SubmissionWorkspace dossierId={d.id} />
        ),
      storageKey: 'dossier-panel-width',
    });
  useEffect(() => {
    if (id && !project)
      api
        .get(id)
        .then(open)
        .catch((e) => setError(e.message));
  }, [id, project?.id]);
  const openProject = (p: Project) =>
    openPanel({
      id: 'project-' + p.id,
      title: p.name,
      subtitle: p.code,
      tabTitle: p.code,
      component: (
        <Suspense fallback={<p>Đang tải dự án…</p>}>
          <ProjectPanel key={p.id + procedure} project={p} initialTab={procedure} />
        </Suspense>
      ),
      storageKey: 'slidepanel-project-' + p.id,
    });
  const statusLabel = (v: string) => STATUS_OPTIONS.find((o) => o.value === v)?.label || v;
  const slaLabel = (v: string) => SLA_FILTER_OPTIONS.find((o) => o.value === v)?.label || v;
  const clear = (patch: Partial<typeof EMPTY_FILTERS>) => {
    setPage(0);
    setFilters({ ...filters, ...patch });
  };
  const filterChips: FilterChip[] = [
    filters.search && { id: 'search', label: 'Từ khóa', value: filters.search, onRemove: () => clear({ search: '' }) },
    filters.scope === 'mine' && {
      id: 'scope',
      label: 'Góc nhìn',
      value: 'Của tôi',
      onRemove: () => clear({ scope: '' }),
    },
    filters.scope === 'queue' && {
      id: 'scope',
      label: 'Góc nhìn',
      value: 'Chờ tôi xử lý',
      onRemove: () => clear({ scope: '' }),
    },
    filters.projectId && {
      id: 'project',
      label: 'Dự án',
      value: 'Đã chọn 1 dự án',
      onRemove: () => clear({ projectId: '' }),
    },
    filters.status !== 'all' && {
      id: 'status',
      label: 'Trạng thái',
      value: statusLabel(filters.status),
      onRemove: () => clear({ status: 'all' }),
    },
    filters.sla &&
      filters.sla !== 'all' && {
        id: 'sla',
        label: 'Hạn xử lý',
        value: slaLabel(filters.sla),
        onRemove: () => clear({ sla: 'all' }),
      },
    filters.from && {
      id: 'from',
      label: 'Đánh giá từ',
      value: formatDate(filters.from),
      onRemove: () => clear({ from: '' }),
    },
    filters.to && { id: 'to', label: 'Đánh giá đến', value: formatDate(filters.to), onRemove: () => clear({ to: '' }) },
  ].filter(Boolean) as FilterChip[];
  const startCreate = () => {
    const next = {
      ...form,
      projectId: project?.id || '',
      name: config.label + ' — lần nộp mới',
      province: project?.location || 'Điện Biên',
    };
    setForm(next);
    setInitial(JSON.stringify(next));
    setCreate(true);
  };
  const projectName = (d: DossierSummary) => d.projectName || 'Chưa gắn dự án';
  const rows = items;
  return (
    <div
      className={
        'flex flex-col gap-4 min-w-0 text-ink dark:text-ink ' +
        (project ? 'flex-1 min-h-[420px] py-4' : 'h-full min-h-[520px]')
      }
    >
      {!project && (
        <PageHeader
          title={config.label}
          description="Danh sách các lần nộp hồ sơ, hạn xử lý theo NĐ 217/2026 và NĐ 207/2026."
          actions={
            <>
              {procedure === 'bcnckt' && health?.mode === 'demo' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<FlaskConical size={15} />}
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        const d = await api.sample('initial');
                        await load();
                        open(d);
                      })
                    }
                  >
                    Nạp hồ sơ lần đầu
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        const d = await api.sample('revised');
                        await load();
                        open(d);
                      })
                    }
                  >
                    Nạp hồ sơ đã bổ sung
                  </Button>
                </>
              )}
              {procedure === 'bcnckt' && (
                <IconButton
                  aria-label="Tải bộ đầu vào và đầu ra"
                  tooltip="Tải bộ hồ sơ đầu vào và kết quả đầu ra (.zip)"
                  variant="secondary"
                  icon={<Download size={16} />}
                  disabled={busy || !health}
                  onClick={() => action(() => api.download('/samples.zip', 'bo-ho-so-bcnckt.zip'))}
                />
              )}
              <IconButton
                aria-label="Tải lại danh sách"
                tooltip="Tải lại danh sách"
                variant="secondary"
                icon={<RefreshCw size={16} />}
                disabled={busy}
                onClick={() => action(load)}
              />
              <Button leftIcon={<Plus size={16} />} disabled={busy || !health} onClick={startCreate}>
                Tạo lần nộp hồ sơ
              </Button>
            </>
          }
        />
      )}
      {project && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink dark:text-slate-100">{config.label}</h2>
          <div className="flex gap-2">
            <IconButton
              aria-label="Tải lại danh sách"
              tooltip="Tải lại danh sách"
              variant="secondary"
              icon={<RefreshCw size={16} />}
              disabled={busy}
              onClick={() => action(load)}
            />
            <Button size="sm" leftIcon={<Plus size={15} />} disabled={busy || !health} onClick={startCreate}>
              Tạo lần nộp hồ sơ
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900 p-4 text-sm text-danger-800 dark:text-danger-100"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCw size={14} />}
            disabled={busy}
            onClick={() => action(load)}
          >
            Thử lại
          </Button>
        </div>
      )}
      {!project && (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border dark:border-slate-700">
          {!register ? (
            <Tabs<QuickView>
              ariaLabel="Góc nhìn danh sách"
              className="border-b-0"
              value={quickView}
              onChange={setQuickView}
              items={[
                { id: 'all', label: 'Tất cả' },
                { id: 'mine', label: 'Của tôi' },
                { id: 'queue', label: 'Chờ tôi xử lý' },
                { id: 'due_soon', label: 'Sắp đến hạn', count: counts?.[procedure]?.dueSoon || undefined },
                { id: 'overdue', label: 'Quá hạn', count: counts?.[procedure]?.overdue || undefined },
              ]}
            />
          ) : (
            <span />
          )}
          {procedure === 'gpxd' && (
            <Tabs
              variant="pills"
              size="sm"
              ariaLabel="Chế độ xem"
              className="mb-2"
              value={register ? 'register' : 'list'}
              onChange={(v) => setView(v)}
              items={[
                { id: 'list', label: 'Hồ sơ đề nghị' },
                { id: 'register', label: 'Sổ giấy phép' },
              ]}
            />
          )}
        </div>
      )}
      {register ? (
        <PermitRegister />
      ) : (
        <>
          <GridToolbar
            search={
              <GridSearchInput
                value={filters.search}
                onChange={(search) => setFilters({ ...filters, search })}
                label="Tìm hồ sơ"
                placeholder="Tìm theo tên hồ sơ, tên dự án, mã dự án…"
              />
            }
            people={
              !project && (
                <div className="w-64">
                  <ProjectSelect
                    value={filters.projectId}
                    onChange={(projectId) => {
                      setPage(0);
                      setFilters({ ...filters, projectId });
                    }}
                    allowAll
                  />
                </div>
              )
            }
            status={
              <>
                <div className="w-48">
                  <SearchableSelect
                    value={filters.status}
                    onChange={(status) => setFilters({ ...filters, status })}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div className="w-48">
                  <SearchableSelect
                    value={filters.sla || 'all'}
                    onChange={(sla) => setFilters({ ...filters, sla })}
                    options={SLA_FILTER_OPTIONS}
                  />
                </div>
              </>
            }
            period={
              <>
                <div className="w-40">
                  <DateInput
                    value={filters.from}
                    placeholder="Ngày đánh giá từ"
                    onChange={(from) => setFilters({ ...filters, from })}
                  />
                </div>
                <div className="w-40">
                  <DateInput
                    value={filters.to}
                    placeholder="Ngày đánh giá đến"
                    onChange={(to) => setFilters({ ...filters, to })}
                  />
                </div>
              </>
            }
            onReset={() => {
              setPage(0);
              setFilters(EMPTY_FILTERS);
            }}
            collapsePeriod
            periodActive={(filters.from ? 1 : 0) + (filters.to ? 1 : 0)}
            count={<GridCount total={total} unit="hồ sơ" detail={`trang ${page + 1}`} />}
          />
          <FilterChips
            chips={filterChips}
            onClearAll={() => {
              setPage(0);
              setFilters(EMPTY_FILTERS);
            }}
          />
          <DossierGrid
            fitWidth
            className="flex-1 min-h-56"
            storageKey={'submission-compact-v2-' + procedure + (project ? '-project' : '-all')}
            rows={rows}
            loading={!loaded && !rows.length}
            serverSort={sort}
            onSort={(key, direction) => setSort({ key, direction })}
            columns={[
              {
                label: 'Hồ sơ / tài liệu',
                sortKey: 'name',
                value: (d) => d.name,
                width: 310,
                render: (d) => (
                  <div className="space-y-2 leading-relaxed">
                    <EntityLink
                      type="dossier"
                      id={d.id}
                      name={d.name}
                      className="whitespace-normal break-words overflow-visible"
                      onClick={() => open(d)}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-ink-muted dark:text-ink-muted">
                      <span>{d.documentCount ?? 0} tài liệu</span>
                    </div>
                  </div>
                ),
              },
              ...(!project
                ? [
                    {
                      label: 'Dự án',
                      sortKey: 'projectName',
                      value: projectName,
                      width: 300,
                      render: (d: DossierSummary) => (
                        <div className="space-y-2 leading-relaxed">
                          {d.projectId ? (
                            <EntityLink
                              type="project"
                              id={d.projectId}
                              name={projectName(d)}
                              className="whitespace-normal break-words overflow-visible"
                              onClick={() =>
                                void action(async () => openProject(await projectService.getById(d.projectId!)))
                              }
                            />
                          ) : (
                            <span>{projectName(d)}</span>
                          )}
                          <button
                            className="block text-xs text-primary-700 dark:text-primary-300 hover:text-primary-600 dark:hover:text-primary-200"
                            disabled={busy}
                            onClick={() => {
                              setLinkId(d.projectId || '');
                              setLinking(d);
                            }}
                          >
                            {d.projectId ? 'Đổi dự án' : 'Gắn dự án'}
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
              {
                label: 'Trạng thái / phụ trách',
                sortKey: 'status',
                value: (d) => SUBMISSION_STATUS[d.status] || 'Đang xử lý',
                width: 220,
                render: (d) => (
                  <div className="space-y-2 leading-relaxed">
                    <span className="inline-block rounded-md bg-primary-50 dark:bg-slate-800 px-2 py-1 font-medium text-primary-800 dark:text-primary-300">
                      {SUBMISSION_STATUS[d.status] || 'Đang xử lý'}
                    </span>
                    <p className="text-ink-muted dark:text-slate-400">
                      {d.assignee && d.assignee !== 'Chưa phân công' ? d.assignee : 'Chưa phân công'}
                    </p>
                    <p className="text-2xs text-ink-muted dark:text-slate-400">{d.department}</p>
                  </div>
                ),
              },
              {
                label: 'Hạn xử lý',
                sortKey: 'slaDueDate',
                value: (d) => d.slaDueDate || '',
                width: 190,
                render: (d) => (
                  <div className="space-y-1.5 leading-relaxed">
                    <SlaBadge sla={d.slaState} dueDate={d.slaDueDate} />
                    <p className="text-ink-muted dark:text-ink-muted">
                      {d.slaDueDate ? 'Hạn ' + formatDate(d.slaDueDate) : 'Chưa có hạn'}
                    </p>
                  </div>
                ),
              },
              {
                label: 'Địa điểm công trình',
                sortKey: 'province',
                value: (d) => d.province,
                width: 200,
                hideBelow: 'xl',
                render: (d) => <p className="leading-relaxed">{d.province}</p>,
              },
              {
                label: 'Thời gian',
                sortKey: 'updatedAt',
                value: (d) => d.updatedAt,
                width: 260,
                hideBelow: 'lg',
                render: (d) => (
                  <dl className="space-y-1.5 leading-relaxed">
                    {[
                      ['Tạo lần nộp', d.createdAt ? formatDateTime(d.createdAt) : 'Chưa ghi nhận'],
                      ['Đánh giá', formatDate(d.legalDate)],
                      ['Cập nhật', formatDateTime(d.updatedAt)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-wrap gap-x-2">
                        <dt className="text-ink-muted dark:text-ink-muted">{label}:</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ),
              },
            ]}
          />
          <PaginationBar
            page={page + 1}
            totalPages={Math.max(1, Math.ceil(total / 50))}
            total={total}
            pageSize={50}
            onPageChange={(next) => setPage(next - 1)}
          />
        </>
      )}
      {create && (
        <ReviewModal
          heading={'Tiếp nhận hồ sơ — ' + config.label}
          dirty={JSON.stringify(form) !== initial}
          onClose={() => setCreate(false)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const selected = project || (await projectService.getById(form.projectId));
                if (!selected) throw new Error('Chọn dự án trước khi tạo hồ sơ.');
                const d = await api.create({
                  ...form,
                  procedure,
                  projectId: selected.id,
                  projectName: selected.name,
                  projectCode: selected.code,
                });
                setCreate(false);
                setForm({ ...form, name: '' });
                await load();
                open(d);
              });
            }}
          >
            {!project && (
              <div className="text-sm">
                Dự án
                <ProjectSelect value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} />
              </div>
            )}
            <label className="block text-sm">
              Tên hồ sơ / lần nộp
              <input
                required
                minLength={3}
                maxLength={300}
                className={input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Địa phương công trình
              <input
                required
                className={input}
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              Thời điểm áp dụng quy định
              <DateInput value={form.legalDate} onChange={(legalDate) => setForm({ ...form, legalDate })} />
            </label>
            <p className="text-xs text-ink-muted dark:text-ink-muted">
              Địa phương công trình khác phạm vi phân quyền. Phòng thụ lý được gán theo tài khoản.
            </p>
            {error && (
              <p role="alert" className="text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <button className={button} disabled={busy}>
              Tạo hồ sơ
            </button>
          </form>
        </ReviewModal>
      )}
      {linking && (
        <ReviewModal
          heading="Gắn hồ sơ với dự án"
          dirty={linkId !== (linking.projectId || '')}
          onClose={() => setLinking(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const p = await projectService.getById(linkId);
                if (!p) throw new Error('Chọn dự án để liên kết.');
                await api.mutate(linking.id, '/project', {
                  revision: linking.revision,
                  projectId: p.id,
                  projectName: p.name,
                  projectCode: p.code,
                });
                setLinking(null);
                await load();
              });
            }}
          >
            <ProjectSelect value={linkId} onChange={setLinkId} />
            <p className="text-sm">
              Hồ sơ sẽ xuất hiện trong tab tương ứng của dự án đã chọn. Kết quả kiểm tra cũ cần được rà soát lại sau khi
              đổi dự án.
            </p>
            {error && (
              <p role="alert" className="text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <button className={button} disabled={busy || !linkId}>
              Lưu liên kết
            </button>
          </form>
        </ReviewModal>
      )}
    </div>
  );
}
