import { useEffect, useMemo, useState } from 'react';
import { appraisalService as api } from '../../services/appraisalService';
import type { PermitRegisterRow } from '../../types/appraisal';
import { DossierGrid } from './DossierGrid';
import { EntityLink } from '../ui/EntityLink';
import { SearchableSelect } from '../ui/SearchableSelect';
import { GridCount, GridSearchInput, GridToolbar } from '../ui/grid/GridToolbar';
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
const tone: Record<PermitRegisterRow['status'], string> = {
  valid: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200',
  start_overdue: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
  revoked: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
  returned: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  cancelled: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
};

/** Sổ giấy phép xây dựng đã cấp; công khai tối thiểu 12 tháng kể từ ngày cấp/gia hạn (Điều 66 NĐ 217/2026). */
export function PermitRegister() {
  const [rows, setRows] = useState<PermitRegisterRow[] | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useFilterState('permit-register', { search: '', kind: 'all', status: 'all' });
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
  const visible = useMemo(
    () =>
      (rows || []).filter(
        (r) =>
          (filters.kind === 'all' || r.kind === filters.kind) &&
          (filters.status === 'all' || (filters.status === 'public' ? r.public : r.status === filters.status)) &&
          matchesSmartSearch(
            [r.number, r.projectName, r.projectCode, r.investor, r.location].filter(Boolean).join(' '),
            filters.search,
          ),
      ),
    [rows, filters],
  );
  return (
    <section className="space-y-3 text-ink dark:text-ink">
      <p className="text-sm text-ink-secondary dark:text-ink-secondary">
        Giấy phép đã cấp, kèm điều chỉnh, gia hạn (tối đa 02 lần, mỗi lần 12 tháng), thu hồi, hủy. Nội dung giấy phép
        được công khai trên trang thông tin điện tử tối thiểu 12 tháng kể từ ngày cấp hoặc gia hạn (khoản 1 Điều 66 NĐ
        217/2026).
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <GridToolbar
        search={
          <GridSearchInput
            value={filters.search}
            onChange={(search) => setFilters({ ...filters, search })}
            placeholder="Tìm theo số giấy phép, dự án, chủ đầu tư..."
          />
        }
        classification={
          <div className="w-52">
            <SearchableSelect
              value={filters.kind}
              onChange={(kind) => setFilters({ ...filters, kind })}
              options={[
                { value: 'all', label: 'Tất cả loại giấy phép' },
                ...Object.entries(KINDS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        }
        status={
          <div className="w-56">
            <SearchableSelect
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status })}
              options={[
                { value: 'all', label: 'Tất cả tình trạng' },
                { value: 'public', label: 'Đang công khai' },
                { value: 'valid', label: 'Còn hiệu lực' },
                { value: 'start_overdue', label: 'Quá hạn khởi công' },
                { value: 'revoked', label: 'Đã thu hồi' },
                { value: 'cancelled', label: 'Đã hủy' },
              ]}
            />
          </div>
        }
        onReset={() => setFilters({ search: '', kind: 'all', status: 'all' })}
        count={<GridCount total={visible.length} unit="giấy phép" />}
      />
      <DossierGrid
        storageKey="permit-register"
        loading={rows === null}
        rows={visible.map((r) => ({ ...r, id: r.number }))}
        columns={[
          {
            label: 'Số giấy phép',
            value: (r) => r.number,
            render: (r) => <EntityLink type="dossier" id={r.caseId} name={r.number} />,
            width: 150,
          },
          {
            label: 'Công trình',
            value: (r) => r.projectName || '',
            render: (r) =>
              r.projectId ? (
                <EntityLink type="project" id={r.projectId} name={r.projectName || r.projectCode || ''} />
              ) : (
                r.projectName
              ),
            width: 300,
          },
          { label: 'Loại (mẫu)', value: (r) => (KINDS[r.kind] || r.kind) + ' — Mẫu ' + r.form, width: 190 },
          { label: 'Chủ đầu tư', value: (r) => r.investor, width: 220 },
          { label: 'Địa điểm', value: (r) => r.location, width: 200 },
          { label: 'Ngày cấp', value: (r) => r.issueDate, render: (r) => formatDate(r.issueDate), width: 110 },
          {
            label: 'Hạn khởi công',
            value: (r) => r.startDeadline,
            render: (r) => formatDate(r.startDeadline),
            width: 120,
          },
          { label: 'Gia hạn', value: (r) => r.extensions, render: (r) => `${r.extensions}/2`, width: 90 },
          {
            label: 'Điều chỉnh / cấp lại',
            value: (r) => r.history.filter((h) => h.kind !== 'extension').length,
            render: (r) =>
              r.history
                .filter((h) => h.kind !== 'extension')
                .map((h) => (h.kind === 'amendment' ? 'Điều chỉnh ' : 'Cấp lại ') + formatDate(h.issueDate))
                .join('; ') || '—',
            width: 200,
          },
          {
            label: 'Tình trạng',
            value: (r) => r.statusLabel,
            render: (r) => (
              <span className={'rounded-md px-2 py-1 text-xs font-medium ' + tone[r.status]}>{r.statusLabel}</span>
            ),
            width: 200,
          },
          {
            label: 'Công khai đến',
            value: (r) => r.publicUntil,
            render: (r) => (r.public ? formatDate(r.publicUntil) : 'Hết thời gian công khai'),
            width: 140,
          },
        ]}
      />
    </section>
  );
}
