import type { Dossier, Fact, SourceRef } from '../../../../types/appraisal';
import { DossierGrid } from '../../../../components/appraisal/DossierGrid';
import { Button } from '../../../../components/ui/Button';
import { formatCurrency } from '../../../../lib/utils';
import { matchesSmartSearch } from '../../../../lib/smartSearch';
import { CaseFilterBar, SourceButton, StatusLabel, activeDocumentIds, type CaseFilters } from '../shared';

/** Dữ liệu trích xuất: values read from the latest submission documents, confirmed one by one. */
export function FactsTab({
  d,
  filters,
  onFilters,
  onShowRefs,
  onReview,
}: {
  d: Dossier;
  filters: CaseFilters;
  onFilters: (next: CaseFilters) => void;
  onShowRefs: (refs: SourceRef[]) => void;
  onReview: (fact: Fact) => void;
}) {
  const activeIds = activeDocumentIds(d);
  const rows = d.facts.filter(
    (x) =>
      activeIds.has(x.documentId) &&
      matchesSmartSearch(x.label + ' ' + x.value, filters.search) &&
      (filters.status === 'all' || x.reviewStatus === filters.status),
  );
  return (
    <div className="space-y-4">
      <CaseFilterBar
        filters={filters}
        onChange={onFilters}
        statuses={['pending', 'confirmed', 'rejected']}
        total={rows.length}
        unit="trường dữ liệu"
      />
      <DossierGrid
        storageKey="appraisal-facts"
        rows={rows}
        columns={[
          { label: 'Trường dữ liệu', value: (f) => f.label, width: 210 },
          {
            label: 'Giá trị',
            value: (f) => (f.unit ? Number(f.value) : f.value),
            width: 210,
            render: (f) => (
              <>
                <strong className="font-mono tabular-nums">
                  {f.unit === 'VNĐ' ? formatCurrency(f.value) : f.value + ' ' + f.unit}
                </strong>
                <p className="mt-1 text-ink-muted dark:text-slate-400">Bản gốc: {f.rawValue}</p>
              </>
            ),
          },
          {
            label: 'Nguồn',
            value: (f) => f.locator,
            width: 220,
            render: (f) => (
              <>
                <SourceButton sources={[f]} onOpen={onShowRefs} />
                <p className="mt-2">
                  {d.documents.find((x) => x.id === f.documentId)?.name} · {f.locator}
                </p>
              </>
            ),
          },
          {
            label: 'Xác nhận',
            value: (f) => f.reviewStatus,
            width: 200,
            render: (f) => (
              <div className="space-y-2">
                <StatusLabel value={f.reviewStatus} />
                <p>{f.reviewedBy}</p>
                <Button variant="secondary" size="xs" onClick={() => onReview(f)}>
                  Xem và xác nhận
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
