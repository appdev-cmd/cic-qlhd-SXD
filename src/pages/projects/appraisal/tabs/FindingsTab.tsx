import { Check, ExternalLink, PencilLine, SkipForward, Sparkles } from 'lucide-react';
import type { AppraisalRun, Dossier, Finding, SourceRef } from '../../../../types/appraisal';
import { Button } from '../../../../components/ui/Button';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ProgressBar } from '../../../../components/ui/ProgressBar';
import { formatDateTime } from '../../../../lib/utils';
import { matchesSmartSearch } from '../../../../lib/smartSearch';
import { CaseFilterBar, Notice, SourceButton, StatusLabel, isHandled, type CaseFilters } from '../shared';

/** Finding review decisions accepted by PATCH /findings/{id} (schemas.Review). */
export type FindingDecision = 'accept' | 'reject' | 'defer';

/** Nội dung thẩm định: AI notes and rule-based findings presented as proposals to accept, annotate or skip. */
export function FindingsTab({
  d,
  run,
  busy,
  starting,
  filters,
  onFilters,
  onShowRefs,
  onReview,
}: {
  d: Dossier;
  run: AppraisalRun | undefined;
  busy: boolean;
  starting: boolean;
  filters: CaseFilters;
  onFilters: (next: CaseFilters) => void;
  onShowRefs: (refs: SourceRef[]) => void;
  onReview: (finding: Finding, decision: FindingDecision, note?: string) => void;
}) {
  if (!run)
    return (
      <EmptyState
        variant="search"
        title={starting || d.job?.status === 'running' ? 'Đang kiểm tra hồ sơ' : 'Chưa có kết quả kiểm tra'}
        description={
          starting || d.job?.status === 'running'
            ? 'Đang kiểm tra. Kết quả sẽ xuất hiện tại đây khi hoàn tất.'
            : 'Chạy kiểm tra để xem nhận xét có dẫn chứng.'
        }
      />
    );

  const rows = run.findings.filter(
    (x) =>
      matchesSmartSearch(x.title + ' ' + x.explanation, filters.search) &&
      (filters.category === 'all' || x.category === filters.category) &&
      (filters.status === 'all' || x.result === filters.status),
  );
  const handled = run.findings.filter(isHandled).length;
  const total = run.findings.length;
  const locked = busy || !!d.readOnly || run.stale;

  return (
    <div className="space-y-5">
      {d.job?.status === 'running' && (
        <Notice tone="warning">
          Đang chạy lượt mới. Nội dung dưới đây thuộc lượt trước lúc {formatDateTime(run.createdAt)}.
        </Notice>
      )}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Sparkles size={16} className="text-primary-600 dark:text-primary-300" aria-hidden="true" />
          Đề xuất từ AI ({run.aiNotes.length})
        </h3>
        <p className="text-sm text-ink-secondary dark:text-slate-300">{run.aiStatus}</p>
        {run.aiNotes.map((n, i) => (
          <article
            key={i}
            className="rounded-2xl border border-primary-200 dark:border-slate-700 bg-surface dark:bg-slate-800 p-4 shadow-card"
          >
            <p className="mb-2 text-xs text-primary-700 dark:text-primary-300">
              Đề xuất {i + 1} · Chờ chuyên viên xác minh
            </p>
            <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">{n.text}</p>
            <SourceButton
              sources={n.sources.map((s) => ({
                documentId: s.documentId,
                segmentId: s.id,
                locator: s.locator,
                quote: s.text,
              }))}
              onOpen={onShowRefs}
            />
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-semibold">Đối chiếu theo quy tắc ({total})</h3>
          <div className="w-full max-w-xs space-y-1">
            <p className="text-right text-xs font-semibold text-ink-secondary dark:text-slate-300">
              Đã xử lý {handled}/{total} đề xuất
            </p>
            <ProgressBar value={total ? (handled / total) * 100 : 0} size="sm" />
          </div>
        </div>
        <CaseFilterBar
          filters={filters}
          onChange={onFilters}
          categories={[...new Set(run.findings.map((x) => x.category))]}
          statuses={['consistent', 'inconsistent', 'insufficient_evidence', 'requires_specialist']}
          total={rows.length}
          unit="đề xuất"
        />
        {!rows.length ? (
          <EmptyState variant="search" title="Không có đề xuất phù hợp bộ lọc" className="py-10" />
        ) : (
          <div className="space-y-3">
            {rows.map((f) => (
              <FindingCard key={f.id} finding={f} locked={locked} onShowRefs={onShowRefs} onReview={onReview} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FindingCard({
  finding: f,
  locked,
  onShowRefs,
  onReview,
}: {
  finding: Finding;
  locked: boolean;
  onShowRefs: (refs: SourceRef[]) => void;
  onReview: (finding: Finding, decision: FindingDecision, note?: string) => void;
}) {
  const decision = f.review?.decision as FindingDecision | undefined;
  return (
    <article
      aria-label={f.title}
      className={
        'space-y-3 rounded-2xl border bg-surface dark:bg-slate-800 p-4 shadow-card ' +
        (isHandled(f) ? 'border-border dark:border-slate-700' : 'border-primary-200 dark:border-primary-800')
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold leading-snug">{f.title}</h4>
          <p className="mt-0.5 text-xs text-ink-muted dark:text-slate-400">{f.category}</p>
        </div>
        <StatusLabel value={f.result} />
      </header>
      <p className="text-sm leading-relaxed">{f.explanation}</p>
      {f.calculation && (
        <p className="rounded-lg bg-subtle dark:bg-slate-900 p-2 font-mono text-xs tabular-nums">{f.calculation}</p>
      )}
      {!!f.missingEvidence.length && (
        <ul className="space-y-1 text-sm">
          {f.missingEvidence.map((x) => (
            <li key={x}>Cần: {x}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {f.sources.length ? (
          <SourceButton sources={f.sources} onOpen={onShowRefs} />
        ) : (
          <span className="text-ink-muted dark:text-slate-400">Chưa có bằng chứng đầy đủ.</span>
        )}
        {f.legalRefs.map((x) => (
          <a
            key={x.url}
            href={x.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary-700 dark:text-primary-400 hover:underline"
          >
            {x.label}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border dark:border-slate-700 pt-3">
        <div className="min-w-0 flex-1 text-xs text-ink-secondary dark:text-slate-300">
          {f.review ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusLabel value={f.review.decision} />
              <span>{f.review.note}</span>
              <span className="text-ink-muted dark:text-slate-400">· {f.review.actor}</span>
            </div>
          ) : (
            <span className="text-ink-muted dark:text-slate-400">Chưa có đánh giá của chuyên viên</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={decision === 'accept' ? 'success' : 'secondary'}
            size="xs"
            leftIcon={<Check size={12} />}
            disabled={locked}
            onClick={() => onReview(f, 'accept')}
          >
            Chấp nhận
          </Button>
          <Button
            variant="secondary"
            size="xs"
            leftIcon={<PencilLine size={12} />}
            disabled={locked}
            onClick={() => onReview(f, decision || 'defer', f.review?.note)}
          >
            Sửa / ghi chú
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<SkipForward size={12} />}
            disabled={locked}
            onClick={() => onReview(f, 'reject')}
          >
            Bỏ qua
          </Button>
        </div>
      </footer>
    </article>
  );
}
