import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, RotateCcw } from 'lucide-react';
import { appraisalService as api } from '../../services/appraisalService';
import type { PermitRegisterRow } from '../../types/appraisal';
import { DossierGrid } from './DossierGrid';
import { EntityLink } from '../ui/EntityLink';
import { SearchableSelect } from '../ui/SearchableSelect';
import { DateInput } from '../ui/DateInput';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { GridCount, GridSearchInput, GridToolbar } from '../ui/grid/GridToolbar';
import { FilterChips, type FilterChip } from '../ui/grid/FilterChips';
import { useFilterState } from '../../hooks/useFilterState';
import { formatDate } from '../../lib/utils';
import { matchesSmartSearch } from '../../lib/smartSearch';

const KINDS: Record<string, string> = {
  new: 'Xây dựng mới',
  stage: 'Theo giai đoạn',
  group: 'Theo dự án / nhóm công trình',
  house: 'Nhà ở riêng lẻ',
  repair: 'Sửa chữa, cải tạo',
  relocation: 'Di dời',
  temporary: 'Có thời hạn',
};
const STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi tình trạng' },
  { value: 'public', label: 'Đang công khai' },
  { value: 'valid', label: 'Còn hiệu lực' },
  { value: 'start_overdue', label: 'Quá hạn khởi công' },
  { value: 'revoked', label: 'Đã thu hồi' },
  { value: 'cancelled', label: 'Đã hủy' },
];
const EMPTY_FILTERS = { search: '', kind: 'all', investor: 'all', status: 'all', from: '', to: '' };
const tone: Record<PermitRegisterRow['status'], string> = {
  valid: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200',
  start_overdue: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
  revoked: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
  returned: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  cancelled: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
};
/** Single-line cell; AutoTableTooltip shows the full text when it is cut off. */
const clip = (text: string) => <span className="block truncate">{text}</span>;

/** Sổ giấy phép xây dựng đã cấp; công khai tối thiểu 12 tháng kể từ ngày cấp/gia hạn (Điều 66 NĐ 217/2026). */
export function PermitRegister() {
  const [rows, setRows] = useState<PermitRegisterRow[] | null>(null);
  const [error, setError] = useState('');
  const [stored, setFilters] = useFilterState('permit-register', EMPTY_FILTERS);
  const filters = { ...EMPTY_FILTERS, ...stored };
  const setFilter = (patch: Partial<typeof EMPTY_FILTERS>) => setFilters({ ...filters, ...patch });
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  useEffect(() => {
    let live = true;
    api
      .permits()
      .then((r) => live && setRows(r.items))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  // The register endpoint returns the whole (department-scoped) register; filtering stays client-side.
  const visible = useMemo(
    () =>
      (rows || []).filter(
        (r) =>
          (filters.kind === 'all' || r.kind === filters.kind) &&
          (filters.investor === 'all' || r.investor === filters.investor) &&
          (filters.status === 'all' || (filters.status === 'public' ? r.public : r.status === filters.status)) &&
          (!filters.from || (r.issueDate || '') >= filters.from) &&
          (!filters.to || (r.issueDate || '').slice(0, 10) <= filters.to) &&
          matchesSmartSearch(
            [r.number, r.projectName, r.projectCode, r.investor, r.location].filter(Boolean).join(' '),
            filters.search,
          ),
      ),
    [rows, JSON.stringify(filters)],
  );
  const investors = useMemo(
    () => [...new Set((rows || []).map((r) => r.investor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
  );

  const chips: FilterChip[] = [];
  if (filters.search.trim())
    chips.push({ id: 'search', label: 'Từ khóa', value: filters.search, onRemove: () => setFilter({ search: '' }) });
  if (filters.kind !== 'all')
    chips.push({
      id: 'kind',
      label: 'Loại giấy phép',
      value: KINDS[filters.kind] || filters.kind,
      onRemove: () => setFilter({ kind: 'all' }),
    });
  if (filters.investor !== 'all')
    chips.push({
      id: 'investor',
      label: 'Chủ đầu tư',
      value: filters.investor,
      onRemove: () => setFilter({ investor: 'all' }),
    });
  if (filters.status !== 'all')
    chips.push({
      id: 'status',
      label: 'Tình trạng',
      value: STATUS_OPTIONS.find((o) => o.value === filters.status)?.label || filters.status,
      onRemove: () => setFilter({ status: 'all' }),
    });
  if (filters.from)
    chips.push({
      id: 'from',
      label: 'Cấp từ',
      value: formatDate(filters.from),
      onRemove: () => setFilter({ from: '' }),
    });
  if (filters.to)
    chips.push({ id: 'to', label: 'Cấp đến', value: formatDate(filters.to), onRemove: () => setFilter({ to: '' }) });
  const periodActive = (filters.from ? 1 : 0) + (filters.to ? 1 : 0);

  return (
    <section aria-labelledby="permit-register-heading" className="space-y-3 text-ink dark:text-slate-100">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-primary-50 dark:bg-primary-900 p-2 text-primary-600 dark:text-primary-300">
          <BookOpenCheck size={18} />
        </div>
        <div className="min-w-0">
          <h2 id="permit-register-heading" className="text-base font-bold text-ink dark:text-slate-100">
            Sổ giấy phép xây dựng
          </h2>
          <p className="text-sm text-ink-secondary dark:text-slate-400">
            Giấy phép đã cấp, kèm điều chỉnh, gia hạn (tối đa 02 lần, mỗi lần 12 tháng), thu hồi, hủy. Nội dung giấy
            phép được công khai trên trang thông tin điện tử tối thiểu 12 tháng kể từ ngày cấp hoặc gia hạn (khoản 1
            Điều 66 NĐ 217/2026).
          </p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <div className="space-y-2">
        <GridToolbar
          search={
            <GridSearchInput
              value={filters.search}
              onChange={(search) => setFilter({ search })}
              className="sm:w-[220px]"
              placeholder="Tìm theo số giấy phép, dự án, chủ đầu tư..."
            />
          }
          classification={
            <div className="w-40">
              <SearchableSelect
                value={filters.kind}
                onChange={(kind) => setFilter({ kind })}
                options={[
                  { value: 'all', label: 'Mọi loại giấy phép' },
                  ...Object.entries(KINDS).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
          }
          people={
            <div className="w-36">
              <SearchableSelect
                value={filters.investor}
                onChange={(investor) => setFilter({ investor })}
                options={[
                  { value: 'all', label: 'Mọi chủ đầu tư' },
                  ...investors.map((value) => ({ value, label: value })),
                ]}
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
                <DateInput value={filters.from} placeholder="Ngày cấp từ" onChange={(from) => setFilter({ from })} />
              </div>
              <div className="w-40">
                <DateInput value={filters.to} placeholder="Ngày cấp đến" onChange={(to) => setFilter({ to })} />
              </div>
            </>
          }
          collapsePeriod
          periodActive={periodActive}
          onReset={resetFilters}
          count={
            <GridCount
              total={visible.length}
              unit="giấy phép"
              detail={rows === null ? 'đang tải' : visible.length !== rows.length ? 'trên ' + rows.length : undefined}
            />
          }
        />
        <FilterChips chips={chips} onClearAll={resetFilters} />
      </div>
      {rows !== null && visible.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
          {chips.length ? (
            <EmptyState
              variant="search"
              title="Không có giấy phép khớp bộ lọc"
              description="Thử bỏ bớt điều kiện lọc hoặc tìm theo số giấy phép, tên công trình."
            >
              <Button variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={resetFilters}>
                Đặt lại bộ lọc
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              variant="folder"
              title="Chưa có giấy phép đã cấp"
              description="Giấy phép xuất hiện trong sổ sau khi hồ sơ đề nghị cấp GPXD được phê duyệt và ban hành."
            />
          )}
        </div>
      ) : (
        <DossierGrid
          storageKey="permit-register"
          loading={rows === null}
          rows={visible.map((r) => ({ ...r, id: r.number }))}
          columns={[
            {
              label: 'Số giấy phép',
              value: (r) => r.number,
              render: (r) => <EntityLink type="dossier" id={r.caseId} name={r.number} />,
              width: 130,
            },
            {
              label: 'Công trình',
              value: (r) => r.projectName || '',
              render: (r) =>
                r.projectId ? (
                  <EntityLink
                    type="project"
                    id={r.projectId}
                    name={r.projectName || r.projectCode || ''}
                    className="block"
                  />
                ) : (
                  clip(r.projectName || '—')
                ),
              width: 230,
            },
            {
              label: 'Loại (mẫu)',
              value: (r) => (KINDS[r.kind] || r.kind) + ' — Mẫu ' + r.form,
              render: (r) => clip((KINDS[r.kind] || r.kind) + ' — Mẫu ' + r.form),
              width: 190,
              hideBelow: '2xl',
            },
            { label: 'Chủ đầu tư', value: (r) => r.investor, render: (r) => clip(r.investor), width: 190 },
            {
              label: 'Địa điểm',
              value: (r) => r.location,
              render: (r) => clip(r.location),
              width: 200,
              hideBelow: '2xl',
            },
            { label: 'Ngày cấp', value: (r) => r.issueDate, render: (r) => formatDate(r.issueDate), width: 110 },
            {
              label: 'Hạn khởi công',
              value: (r) => r.startDeadline,
              render: (r) => formatDate(r.startDeadline),
              width: 120,
              hideBelow: '2xl',
            },
            {
              label: 'Gia hạn',
              value: (r) => r.extensions,
              render: (r) => `${r.extensions}/2`,
              width: 90,
              hideBelow: '2xl',
            },
            {
              label: 'Điều chỉnh / cấp lại',
              value: (r) => r.history.filter((h) => h.kind !== 'extension').length,
              render: (r) =>
                r.history
                  .filter((h) => h.kind !== 'extension')
                  .map((h) => (h.kind === 'amendment' ? 'Điều chỉnh ' : 'Cấp lại ') + formatDate(h.issueDate))
                  .join('; ') || '—',
              width: 200,
              hideBelow: 'xl',
            },
            {
              label: 'Tình trạng',
              value: (r) => r.statusLabel,
              render: (r) => (
                <span className={'whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ' + tone[r.status]}>
                  {r.statusLabel}
                </span>
              ),
              width: 170,
            },
            {
              label: 'Công khai đến',
              value: (r) => r.publicUntil,
              render: (r) => (r.public ? formatDate(r.publicUntil) : 'Hết thời gian công khai'),
              width: 140,
              hideBelow: '2xl',
            },
          ]}
        />
      )}
    </section>
  );
}
