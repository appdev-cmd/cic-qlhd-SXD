import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { Plus } from 'lucide-react';
import type { SourceRef } from '../../../types/appraisal';
import type { Project } from '../../../types/project';
import { appraisalService as api } from '../../../services/appraisalService';
import { useAppraisalCase } from '../../../hooks/useAppraisalCase';
import { useFilterState } from '../../../hooks/useFilterState';
import { CaseHeader } from '../../../components/appraisal/CaseHeader';
import { SubmissionHistory } from '../../../components/appraisal/SubmissionHistory';
import { WorkflowPanel } from '../../../components/appraisal/WorkflowPanel';
import { OcrPanel } from '../../../components/appraisal/OcrPanel';
import { ReviewModal } from '../../../components/appraisal/ReviewModal';
import { LegalReview } from '../../../components/appraisal/LegalReview';
import { AppraisalSheet } from '../../../components/appraisal/AppraisalSheet';
import { StampingPanel } from '../../../components/appraisal/StampingPanel';
import { Button } from '../../../components/ui/Button';
import { Tabs } from '../../../components/ui/Tabs';
import { Skeleton, SkeletonStatCard, TableSkeleton } from '../../../components/ui/Skeleton';
import { AnalysisBar } from './AnalysisBar';
import { CaseKpis } from './CaseKpis';
import { EMPTY_FILTERS, Notice, activeDocumentIds, isHandled, type CaseFilters } from './shared';
import { IntakeTab } from './tabs/IntakeTab';
import { FactsTab } from './tabs/FactsTab';
import { FindingsTab } from './tabs/FindingsTab';
import { CostTab } from './tabs/CostTab';
import { ResponsesTab } from './tabs/ResponsesTab';
import { DraftsTab } from './tabs/DraftsTab';
import { AuditTab } from './tabs/AuditTab';
import { CaseModals, type CaseModal } from './modals/CaseModals';
import { EvidenceModal } from './modals/EvidenceModal';
const PdfPreview = lazy(() =>
  import('../../../components/appraisal/PdfPreview').then((module) => ({ default: module.PdfPreview })),
);

type TabId =
  | 'intake'
  | 'legal'
  | 'facts'
  | 'findings'
  | 'sheet'
  | 'cost'
  | 'responses'
  | 'drafts'
  | 'stamping'
  | 'audit';

/** BCNCKT appraisal workspace: case header, analysis run, and the review tabs of one submission. */
export function AppraisalWorkspace({ dossierId, project }: { dossierId?: string; project?: Project }) {
  const [tab, setTab] = useState<TabId>('intake');
  const [filters, setFilters] = useFilterState<CaseFilters>(
    'appraisal-filters-' + (dossierId || project?.id || 'new'),
    EMPTY_FILTERS,
  );
  const [modal, setModal] = useState<CaseModal | null>(null);
  const [refs, setRefs] = useState<SourceRef[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const resultsAnchor = useRef<HTMLDivElement>(null);
  const openTab = (next: TabId) => {
    setTab(next);
    setFilters(EMPTY_FILTERS);
  };
  const showResults = () => {
    openTab('findings');
    requestAnimationFrame(() => resultsAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const c = useAppraisalCase({ dossierId, project, onAnalysisCompleted: showResults });
  const { d } = c;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const openModal = (next: CaseModal) => {
    if (d?.readOnly) return c.setError('Mở lần nộp mới nhất để xử lý hồ sơ.');
    setModal(next);
  };
  const showDoc = async (id: string) => {
    const doc = d?.documents.find((x) => x.id === id);
    if (!d || !doc) return;
    if (doc.name.toLowerCase().endsWith('.pdf'))
      setPreview(URL.createObjectURL(await api.blob(`/cases/${d.id}/documents/${id}`)));
    else await api.download(`/cases/${d.id}/documents/${id}`, doc.name);
  };

  if (!d)
    return c.loading ? (
      <div className="space-y-5" aria-busy="true" aria-label="Đang tải hồ sơ">
        <Skeleton variant="rounded" height={160} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonStatCard key={i} compact />
          ))}
        </div>
        <TableSkeleton columns={4} rows={5} />
      </div>
    ) : (
      <div className="space-y-4 p-6 text-ink dark:text-slate-100">
        <h3 className="text-lg font-semibold">Hồ sơ thẩm định BCNCKT</h3>
        <p className="text-sm text-ink-secondary dark:text-slate-300">
          Tạo lần trình để tiếp nhận tài liệu, đối chiếu và lưu đánh giá của chuyên viên.
        </p>
        {c.error && <Notice role="alert">{c.error}</Notice>}
        {project && (
          <Button
            leftIcon={<Plus size={15} />}
            disabled={c.busy || !c.health}
            onClick={() => c.createFromProject(project)}
          >
            Tạo hồ sơ từ dự án
          </Button>
        )}
      </div>
    );

  const run = d.runs.slice(-1)[0];
  const activeIds = activeDocumentIds(d);
  const filterProps = { filters, onFilters: setFilters, onShowRefs: setRefs };
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'intake', label: 'Hồ sơ đầu vào' },
    { id: 'legal', label: 'Căn cứ pháp lý' },
    {
      id: 'facts',
      label: 'Dữ liệu trích xuất',
      count: d.facts.filter((f) => activeIds.has(f.documentId) && f.reviewStatus === 'pending').length,
    },
    { id: 'findings', label: 'Nội dung thẩm định', count: run?.findings.filter((f) => !isHandled(f)).length },
    // No counts on these two: e2e specs select them by exact accessible name.
    { id: 'sheet', label: 'Phiếu thẩm định' },
    { id: 'cost', label: 'Tổng mức đầu tư' },
    { id: 'responses', label: 'Ý kiến và giải trình', count: d.consultations.length },
    { id: 'drafts', label: 'Dự thảo kết quả' },
    { id: 'stamping', label: 'Đóng dấu & lưu trữ' },
    { id: 'audit', label: 'Lịch sử' },
  ];

  return (
    <div className="space-y-5 text-ink dark:text-slate-100 select-text">
      <CaseHeader dossier={d} onTitleClick={() => setTab('intake')} />
      <SubmissionHistory dossier={d} />
      <WorkflowPanel dossier={d} onChange={c.setD} />
      <OcrPanel dossier={d} onChange={c.setD} poll={false} />
      <CaseKpis d={d} onOpenTab={openTab} />
      {c.error && <Notice role="alert">{c.error}</Notice>}
      <AnalysisBar c={c} d={d} anchorRef={resultsAnchor} onResults={showResults} />
      <Tabs ariaLabel="Nội dung thẩm định hồ sơ" size="sm" value={tab} onChange={openTab} items={tabs} />
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === 'intake' && (
          <IntakeTab
            c={c}
            d={d}
            {...filterProps}
            onAddRequirement={() => openModal({ type: 'add' })}
            onReviewRequirement={(requirement) => openModal({ type: 'requirement', requirement })}
          />
        )}
        {tab === 'legal' && (
          <fieldset disabled={!!d.readOnly}>
            <LegalReview dossier={d} onChange={c.setD} />
          </fieldset>
        )}
        {tab === 'facts' && <FactsTab d={d} {...filterProps} onReview={(fact) => openModal({ type: 'fact', fact })} />}
        {tab === 'findings' && (
          <FindingsTab
            d={d}
            run={run}
            busy={c.busy}
            starting={c.starting}
            {...filterProps}
            onReview={(finding, decision, note) => openModal({ type: 'finding', finding, decision, note })}
          />
        )}
        {tab === 'sheet' && <AppraisalSheet dossier={d} onChange={c.setD} />}
        {tab === 'cost' && <CostTab run={run} />}
        {tab === 'responses' && <ResponsesTab d={d} onAdd={() => openModal({ type: 'consultation' })} />}
        {tab === 'drafts' && (
          <DraftsTab
            c={c}
            d={d}
            run={run}
            onPreview={setPreview}
            onFinalReview={() => openModal({ type: 'final' })}
            onReopen={() => openModal({ type: 'reopen' })}
          />
        )}
        {tab === 'stamping' && <StampingPanel dossier={d} onChange={c.setD} />}
        {tab === 'audit' && <AuditTab d={d} />}
      </div>
      {modal && <CaseModals c={c} modal={modal} onClose={() => setModal(null)} />}
      {refs && (
        <EvidenceModal
          refs={refs}
          documents={d.documents}
          onOpenOriginal={(id) => c.action(() => showDoc(id))}
          onClose={() => setRefs(null)}
        />
      )}
      {preview && (
        <ReviewModal heading="Xem tài liệu A4" onClose={() => setPreview(null)}>
          <Suspense fallback={<Skeleton variant="rounded" height={480} />}>
            <PdfPreview url={preview} />
          </Suspense>
        </ReviewModal>
      )}
    </div>
  );
}
