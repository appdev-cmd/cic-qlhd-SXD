import type { AppraisalRun } from '../../../../types/appraisal';
import { DossierGrid } from '../../../../components/appraisal/DossierGrid';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { formatCurrency } from '../../../../lib/utils';

/** Tổng mức đầu tư: declared cost items and the change between the first and the latest submission. */
export function CostTab({ run }: { run: AppraisalRun | undefined }) {
  if (!run?.costVersions.length)
    return (
      <EmptyState title="Chưa có số liệu tổng mức đầu tư" description="Chưa đủ 7 khoản mục chi phí để đối chiếu." />
    );
  const latest = run.costVersions.slice(-1)[0]!;
  const rows = (
    run.costComparison?.items ||
    latest.items.map((x) => ({ name: x.name, before: x.value, after: x.value, difference: '0' }))
  ).map((x, i) => ({ ...x, id: String(i) }));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary-200 dark:border-slate-700 bg-primary-50 dark:bg-slate-800 p-5">
        <p className="text-sm">
          {run.costComparison ? 'Thay đổi ròng giữa lần đầu và lần mới' : 'Tổng mức đầu tư được kê'}
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
          {formatCurrency(run.costComparison?.netSavings ?? latest.total)}
        </p>
        <p className="mt-2 text-xs text-ink-secondary dark:text-slate-300">
          Không mặc định coi giảm từng khoản mục là tiết kiệm ròng. Chưa xác nhận khối lượng, đơn giá hoặc lý do điều
          chỉnh.
        </p>
      </div>
      <DossierGrid
        storageKey="appraisal-cost"
        rows={rows}
        columns={[
          { label: 'Khoản mục', value: (r) => r.name, width: 250 },
          { label: 'Lần đầu', value: (r) => Number(r.before), render: (r) => formatCurrency(r.before), width: 200 },
          { label: 'Lần hiện tại', value: (r) => Number(r.after), render: (r) => formatCurrency(r.after), width: 200 },
          {
            label: 'Chênh lệch',
            value: (r) => Number(r.difference),
            render: (r) => formatCurrency(r.difference),
            width: 180,
          },
        ]}
      />
      {run.costVersions.map((v) => (
        <p key={v.documentId} className="text-xs text-ink-secondary dark:text-slate-300">
          {v.name}: tổng kê {formatCurrency(v.total)} · cộng lại {formatCurrency(v.sum)}
        </p>
      ))}
    </div>
  );
}
