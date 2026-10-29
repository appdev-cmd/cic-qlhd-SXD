import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Download, Eye, FileText, RefreshCw, RotateCcw } from 'lucide-react';
import { appraisalService as api } from '../../services/appraisalService';
import type { DossierSummary } from '../../types/appraisal';
import { ProjectSelect } from './ProjectSelect';
import { DossierGrid, type GridColumn } from './DossierGrid';
import { SearchableSelect } from '../ui/SearchableSelect';
import { DateInput } from '../ui/DateInput';
import { EntityLink } from '../ui/EntityLink';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { PaginationBar } from '../ui/PaginationBar';
import { GridCount, GridSearchInput, GridToolbar } from '../ui/grid/GridToolbar';
import { FilterChips, type FilterChip } from '../ui/grid/FilterChips';
import { useFilterState } from '../../hooks/useFilterState';
import { formatDate } from '../../lib/utils';
import { PROJECT_PROCEDURES, SUBMISSION_STATUS, type ProjectProcedure } from '../../lib/projectProcedures';
import { ReviewModal } from './ReviewModal';
const PdfPreview = lazy(() => import('./PdfPreview').then((m) => ({ default: m.PdfPreview })));

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { search: '', procedure: 'all', projectId: '', status: 'all', from: '', to: '' };
const PROCEDURE_OPTIONS = [
  { value: 'all', label: 'Tất cả thủ tục' },
  ...Object.entries(PROJECT_PROCEDURES).map(([value, p]) => ({ value, label: p.label })),
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi trạng thái' },
  ...Object.entries(SUBMISSION_STATUS).map(([value, label]) => ({ value, label })),
];
const procedureLabel = (procedure?: string) =>
  (procedure && PROJECT_PROCEDURES[procedure as keyof typeof PROJECT_PROCEDURES]?.label) || '—';

/** Document store: pick a submission (server-paged list) and export its A4 drafts. */
export function DocumentHub() {
  const [stored, setFilters] = useFilterState('documents-filters-v1', EMPTY_FILTERS);
  const filters = { ...EMPTY_FILTERS, ...stored };
  const setFilter = (patch: Partial<typeof EMPTY_FILTERS>) => setFilters({ ...filters, ...patch });
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const [sort, setSort] = useFilterState('documents-sort-v1', { key: 'updatedAt', direction: 'desc' });
  const [items, setItems] = useState<DossierSummary[]>([]);
  const [selected, setSelected] = useState<DossierSummary | null>(null);
  const [projectName, setProjectName] = useState('');
  const [kind, setKind] = useState('internal');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [page, setPage] = useState(0),
    [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const filterKey = JSON.stringify([filters, sort]);
  const lastSearch = useRef(filters.search);
  useEffect(() => setPage(0), [filterKey]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    // Debounce only while typing a search; other filter changes load at once.
    const typing = lastSearch.current !== filters.search;
    lastSearch.current = filters.search;
    const timer = setTimeout(
      () => {
        api
          .page({
            projectId: filters.projectId,
            procedure: filters.procedure as ProjectProcedure | 'all',
            search: filters.search,
            status: filters.status,
            dateFrom: filters.from,
            dateTo: filters.to,
            sort: sort.key,
            direction: sort.direction,
            offset: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          })
          .then((p) => {
            if (active) {
              setItems(p.items);
              setTotal(p.total);
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
  }, [filterKey, page, version]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  // Remember the chosen project's name for its filter chip.
  useEffect(() => {
    if (!filters.projectId) setProjectName('');
    else {
      const match = items.find((r) => r.projectId === filters.projectId);
      if (match?.projectName) setProjectName(match.projectName);
    }
  }, [filters.projectId, items]);
  const panelRef = useRef<HTMLElement>(null);
  const choose = (row: DossierSummary) => {
    setSelected(row);
    setKind('internal');
    // Below 2xl the export panel sits above the table; bring it into view after picking a row.
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const path = (format: string) =>
    `/cases/${selected?.id}/` +
    (kind === 'internal'
      ? `internal-record/${format}`
      : kind.startsWith('procedure-')
        ? `procedure-review/${kind.slice(10)}/${format}`
        : `export/${kind}/${format}`);
  const act = async (format: string, view = false) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      if (view) setPreview(URL.createObjectURL(await api.blob(path(format))));
      else await api.download(path(format), `${kind}.${format}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const kindOptions = [
    { value: 'internal', label: 'Phiếu theo dõi xử lý nội bộ' },
    ...(selected?.procedure === 'bcnckt'
      ? [
          { value: 'report', label: 'Báo cáo hỗ trợ kiểm tra' },
          { value: 'notice', label: 'Dự thảo kết quả thẩm định' },
          { value: 'supplement', label: 'Dự thảo yêu cầu bổ sung' },
          { value: 'suspension', label: 'Dự thảo tạm dừng' },
        ]
      : selected
        ? [
            { value: 'procedure-review', label: 'Phiếu rà soát chuyên môn' },
            {
              value: 'procedure-application',
              label: selected.procedure === 'gpxd' ? 'Đơn đề nghị cấp phép' : 'Báo cáo hoàn thành thi công',
            },
            {
              value: 'procedure-draft',
              label: selected.procedure === 'gpxd' ? 'Khung dự thảo GPXD' : 'Khung thông báo nghiệm thu',
            },
            ...(selected.procedure === 'nghiem_thu'
              ? [{ value: 'procedure-minutes', label: 'Biên bản hiện trường' }]
              : []),
          ]
        : []),
  ];

  const chips: FilterChip[] = [];
  if (filters.search.trim())
    chips.push({ id: 'search', label: 'Từ khóa', value: filters.search, onRemove: () => setFilter({ search: '' }) });
  if (filters.procedure !== 'all')
    chips.push({
      id: 'procedure',
      label: 'Thủ tục',
      value: procedureLabel(filters.procedure),
      onRemove: () => setFilter({ procedure: 'all' }),
    });
  if (filters.projectId)
    chips.push({
      id: 'project',
      label: 'Dự án',
      value: projectName || 'Dự án đã chọn',
      onRemove: () => setFilter({ projectId: '' }),
    });
  if (filters.status !== 'all')
    chips.push({
      id: 'status',
      label: 'Trạng thái',
      value: SUBMISSION_STATUS[filters.status] || filters.status,
      onRemove: () => setFilter({ status: 'all' }),
    });
  if (filters.from)
    chips.push({
      id: 'from',
      label: 'Từ ngày',
      value: formatDate(filters.from),
      onRemove: () => setFilter({ from: '' }),
    });
  if (filters.to)
    chips.push({ id: 'to', label: 'Đến ngày', value: formatDate(filters.to), onRemove: () => setFilter({ to: '' }) });

  const columns: GridColumn<DossierSummary>[] = [
    {
      label: 'Lần nộp hồ sơ',
      sortKey: 'name',
      value: (r) => r.name,
      render: (r) => <EntityLink type="dossier" id={r.id} name={r.name} className="block" />,
      width: 300,
    },
    {
      label: 'Dự án',
      sortKey: 'projectName',
      value: (r) => r.projectName || '',
      render: (r) =>
        r.projectId ? (
          <EntityLink type="project" id={r.projectId} name={r.projectName || r.projectCode || ''} className="block" />
        ) : (
          <span className="block truncate">{r.projectName || '—'}</span>
        ),
      width: 240,
      hideBelow: 'lg',
    },
    {
      label: 'Thủ tục',
      sortKey: 'procedure',
      value: (r) => procedureLabel(r.procedure),
      render: (r) => <span className="block truncate">{procedureLabel(r.procedure)}</span>,
      width: 170,
      hideBelow: 'xl',
    },
    {
      label: 'Trạng thái',
      sortKey: 'status',
      value: (r) => SUBMISSION_STATUS[r.status] || 'Đang xử lý',
      render: (r) => <span className="block truncate">{SUBMISSION_STATUS[r.status] || 'Đang xử lý'}</span>,
      width: 150,
    },
    {
      label: 'Ngày hồ sơ',
      sortKey: 'legalDate',
      value: (r) => r.legalDate || '',
      render: (r) => (r.legalDate ? formatDate(r.legalDate) : '—'),
      width: 120,
      hideBelow: 'lg',
    },
    {
      label: 'Cập nhật',
      sortKey: 'updatedAt',
      value: (r) => r.updatedAt || '',
      render: (r) => (r.updatedAt ? formatDate(r.updatedAt) : '—'),
      width: 120,
      hideBelow: '2xl',
    },
  ];

  const periodActive = (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
  const showEmpty = !loading && !error && items.length === 0;

  return (
    <div className="space-y-4 text-ink dark:text-slate-100">
      <PageHeader
        className="[&>div]:mb-0"
        title="Văn bản & In ấn A4"
        description="Chọn lần nộp hồ sơ để xuất văn bản từ dữ liệu đang lưu. Các bản xuất là dự thảo chưa ký, chưa ban hành."
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={14} />}
            disabled={loading}
            onClick={() => setVersion((n) => n + 1)}
          >
            Tải lại
          </Button>
        }
      />
      <div className="space-y-2">
        <GridToolbar
          search={
            <GridSearchInput
              value={filters.search}
              onChange={(search) => setFilter({ search })}
              label="Tìm lần nộp hồ sơ"
              className="sm:w-[220px]"
              placeholder="Tìm theo tên hồ sơ, tên dự án, mã dự án…"
            />
          }
          classification={
            <div className="w-36">
              <SearchableSelect
                value={filters.procedure}
                onChange={(procedure) => setFilter({ procedure })}
                options={PROCEDURE_OPTIONS}
              />
            </div>
          }
          people={
            <div className="w-36">
              <ProjectSelect
                allowAll
                value={filters.projectId}
                onChange={(id) => setFilter({ projectId: id === 'all' ? '' : id })}
              />
            </div>
          }
          status={
            <div className="w-36">
              <SearchableSelect
                value={filters.status}
                onChange={(status) => setFilter({ status })}
                options={STATUS_OPTIONS}
              />
            </div>
          }
          period={
            <>
              <div className="w-40">
                <DateInput value={filters.from} placeholder="Ngày hồ sơ từ" onChange={(from) => setFilter({ from })} />
              </div>
              <div className="w-40">
                <DateInput value={filters.to} placeholder="Ngày hồ sơ đến" onChange={(to) => setFilter({ to })} />
              </div>
            </>
          }
          collapsePeriod
          periodActive={periodActive}
          onReset={resetFilters}
          count={<GridCount total={total} unit="lần nộp" detail={loading ? 'đang tải' : undefined} />}
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
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
        <section
          ref={panelRef}
          aria-label="Xuất văn bản"
          className="order-first scroll-mt-4 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-4 space-y-3 2xl:order-last 2xl:sticky 2xl:top-4"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-slate-100">
            <FileText size={16} className="text-primary-600 dark:text-primary-400" />
            Xuất văn bản
          </h2>
          {selected ? (
            <div className="flex flex-wrap items-end gap-3 2xl:block 2xl:space-y-3">
              <div className="min-w-0 flex-1 basis-64 text-sm">
                <EntityLink type="dossier" id={selected.id} name={selected.name} className="block font-semibold" />
                {selected.projectName && (
                  <p className="truncate text-xs text-ink-muted dark:text-slate-400">{selected.projectName}</p>
                )}
              </div>
              <label className="block w-72 max-w-full space-y-1 text-sm text-ink-secondary dark:text-slate-300 2xl:w-full">
                <span>Loại văn bản</span>
                <SearchableSelect value={kind} onChange={setKind} options={kindOptions} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Eye size={14} />}
                  disabled={busy}
                  onClick={() => act('pdf', true)}
                >
                  Xem trước A4
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={busy}
                  onClick={() => act('pdf')}
                >
                  Tải PDF
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={busy}
                  onClick={() => act('docx')}
                >
                  Tải DOCX
                </Button>
              </div>
              <p className="w-full text-xs text-ink-muted dark:text-slate-400">
                Khổ A4 · Lề 30/20/22/20 mm · Times New Roman
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted dark:text-slate-400">
              Chọn một lần nộp hồ sơ trong danh sách để xem trước và tải văn bản.
            </p>
          )}
        </section>
        <div className="min-w-0">
          {showEmpty ? (
            <div className="rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
              {chips.length ? (
                <EmptyState
                  variant="search"
                  title="Không có lần nộp hồ sơ khớp bộ lọc"
                  description="Thử bỏ bớt điều kiện lọc hoặc mở rộng khoảng ngày."
                >
                  <Button variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={resetFilters}>
                    Đặt lại bộ lọc
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  variant="folder"
                  title="Chưa có hồ sơ để xuất văn bản"
                  description="Tiếp nhận hồ sơ thẩm định, cấp phép hoặc nghiệm thu trước, sau đó quay lại đây để xuất văn bản A4."
                />
              )}
            </div>
          ) : (
            <DossierGrid
              storageKey="documents-submissions"
              columns={columns}
              rows={items}
              loading={loading && !items.length}
              serverSort={sort}
              onSort={(key, direction) => setSort({ key, direction })}
              onRowClick={choose}
              rowLabel={(r) => 'Chọn ' + r.name}
              showRowNumbers
              rowOffset={page * PAGE_SIZE}
            />
          )}
          <PaginationBar
            page={page + 1}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p - 1)}
            unit="lần nộp"
          />
        </div>
      </div>
      {preview && (
        <ReviewModal heading="Xem trước văn bản A4" onClose={() => setPreview(null)}>
          <Suspense fallback={<p>Đang tải bản xem trước…</p>}>
            <PdfPreview url={preview} />
          </Suspense>
        </ReviewModal>
      )}
    </div>
  );
}
