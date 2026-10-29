import React from 'react';
import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { Dossier, Finding, SourceRef } from '../../../types/appraisal';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { GridCount, GridSearchInput, GridToolbar } from '../../../components/ui/grid/GridToolbar';
import { cn } from '../../../lib/utils';

/** Vietnamese labels of every status / decision value returned by the appraisal API. */
export const labels: Record<string, string> = {
  missing: 'Chưa nộp',
  submitted: 'Đã nộp',
  verified: 'Đã kiểm tra',
  needs_supplement: 'Cần bổ sung',
  consistent: 'Khớp trong phạm vi kiểm tra',
  inconsistent: 'Cần làm rõ',
  insufficient_evidence: 'Chưa đủ dữ liệu',
  requires_specialist: 'Cần chuyên viên',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  rejected: 'Không sử dụng',
  accept: 'Ghi nhận nhận xét',
  reject: 'Không chấp nhận nhận xét',
  defer: 'Chờ làm rõ',
  running: 'Đang kiểm tra',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  failed: 'Thất bại',
  interrupted: 'Gián đoạn',
};

const tones: Record<string, BadgeVariant> = {
  missing: 'danger',
  submitted: 'info',
  verified: 'success',
  needs_supplement: 'warning',
  consistent: 'success',
  inconsistent: 'danger',
  insufficient_evidence: 'warning',
  requires_specialist: 'info',
  pending: 'warning',
  confirmed: 'success',
  rejected: 'neutral',
  accept: 'success',
  reject: 'neutral',
  defer: 'warning',
};

/** Status / decision chip with the semantic colour of its value. */
export function StatusLabel({ value }: { value: string }) {
  return <Badge variant={tones[value] || 'default'}>{labels[value] || value}</Badge>;
}

export const inputClass =
  'mt-1 w-full rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-900 p-2 text-sm text-ink dark:text-slate-100 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20';

/** Inline alert using the semantic danger / warning tokens. */
export function Notice({
  tone = 'danger',
  children,
  className,
  role,
}: {
  tone?: 'danger' | 'warning';
  children: React.ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  const Icon = tone === 'danger' ? CircleAlert : AlertTriangle;
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'danger'
          ? 'border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900 text-danger-800 dark:text-danger-100'
          : 'border-warning-200 dark:border-warning-800 bg-warning-50 dark:bg-warning-900 text-warning-800 dark:text-warning-100',
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** "n nguồn chứng cứ" link that opens the evidence modal. */
export function SourceButton({ sources, onOpen }: { sources: SourceRef[]; onOpen: (refs: SourceRef[]) => void }) {
  return (
    <Button variant="link" size="sm" onClick={() => onOpen(sources)}>
      {sources.length} nguồn chứng cứ
    </Button>
  );
}

export type CaseFilters = { search: string; category: string; status: string };
export const EMPTY_FILTERS: CaseFilters = { search: '', category: 'all', status: 'all' };

/** Compact toolbar shared by the intake, facts and findings tabs (search → group → status → reset/count). */
export function CaseFilterBar({
  filters,
  onChange,
  categories,
  statuses,
  total,
  unit,
}: {
  filters: CaseFilters;
  onChange: (next: CaseFilters) => void;
  /** Omit to hide the group filter. */
  categories?: string[];
  statuses: string[];
  total: number;
  unit: string;
}) {
  return (
    <GridToolbar
      search={
        <GridSearchInput
          label="Tìm trong hồ sơ"
          placeholder="Tìm nội dung, tài liệu hoặc số liệu…"
          value={filters.search}
          onChange={(search) => onChange({ ...filters, search })}
        />
      }
      classification={
        categories && (
          <div className="w-48">
            <SearchableSelect
              value={filters.category}
              onChange={(category) => onChange({ ...filters, category })}
              options={[{ value: 'all', label: 'Tất cả nhóm' }, ...categories.map((x) => ({ value: x, label: x }))]}
            />
          </div>
        )
      }
      status={
        <div className="w-56">
          <SearchableSelect
            value={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
            options={[
              { value: 'all', label: 'Tất cả trạng thái' },
              ...statuses.map((x) => ({ value: x, label: labels[x] })),
            ]}
          />
        </div>
      }
      onReset={() => onChange(EMPTY_FILTERS)}
      count={<GridCount total={total} unit={unit} />}
    />
  );
}

/** Documents that count for intake checks: the latest submission document per requirement. */
export function activeDocumentIds(d: Dossier) {
  const latest = Object.values(
    Object.fromEntries(d.documents.filter((x) => x.role !== 'reference').map((x) => [x.requirementId, x])),
  );
  return new Set(latest.map((x) => x.id));
}

/** A finding is handled once the officer recorded a decision other than "defer" (same rule as final review). */
export const isHandled = (f: Finding) => !!f.review && f.review.decision !== 'defer';
