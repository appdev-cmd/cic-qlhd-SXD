import { useState } from 'react';
import { CheckCircle2, Plus, Upload } from 'lucide-react';
import type { Dossier, SourceRef } from '../../../../types/appraisal';
import { appraisalService as api } from '../../../../services/appraisalService';
import { DossierGrid } from '../../../../components/appraisal/DossierGrid';
import { Button } from '../../../../components/ui/Button';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { matchesSmartSearch } from '../../../../lib/smartSearch';
import type { AppraisalCase } from '../../../../hooks/useAppraisalCase';
import { CaseFilterBar, SourceButton, StatusLabel, labels, type CaseFilters } from '../shared';

type Requirement = Dossier['requirements'][number];

/** Hồ sơ đầu vào: checklist candidates, upload, requirement grid with document versions. */
export function IntakeTab({
  c,
  d,
  filters,
  onFilters,
  onShowRefs,
  onAddRequirement,
  onReviewRequirement,
}: {
  c: AppraisalCase;
  d: Dossier;
  filters: CaseFilters;
  onFilters: (next: CaseFilters) => void;
  onShowRefs: (refs: SourceRef[]) => void;
  onAddRequirement: () => void;
  onReviewRequirement: (r: Requirement) => void;
}) {
  const [uploadReq, setUploadReq] = useState('TTR');
  const [role, setRole] = useState('submission');
  const rows = d.requirements.filter(
    (x) =>
      matchesSmartSearch(x.name, filters.search) &&
      (filters.category === 'all' || x.category === filters.category) &&
      (filters.status === 'all' || x.status === filters.status),
  );
  const locked = c.busy || !!d.readOnly;

  return (
    <div className="space-y-4">
      <CaseFilterBar
        filters={filters}
        onChange={onFilters}
        categories={[...new Set(d.requirements.map((x) => x.category))]}
        statuses={['missing', 'submitted', 'verified', 'needs_supplement']}
        total={rows.length}
        unit="thành phần"
      />
      {!!d.checklistCandidates?.length && (
        <section className="space-y-3 rounded-2xl border border-primary-200 dark:border-slate-700 bg-surface dark:bg-slate-800 p-4">
          <h3 className="font-semibold">Danh mục nhận diện từ tờ trình</h3>
          <p className="text-xs text-ink-muted dark:text-slate-400">
            Đọc trích dẫn trước khi đưa vào checklist. Dẫn tên văn bản không chứng minh đã nộp bản gốc.
          </p>
          {d.checklistCandidates.map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex-1">{candidate.name}</span>
              <SourceButton sources={[candidate]} onOpen={onShowRefs} />
              <Button
                variant="secondary"
                size="xs"
                leftIcon={candidate.accepted ? <CheckCircle2 size={12} /> : undefined}
                disabled={locked || candidate.accepted}
                onClick={() => c.action(() => c.mutate('/checklist/accept', { candidateId: candidate.id }))}
              >
                {candidate.accepted ? 'Đã xác nhận' : 'Xác nhận thành phần'}
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-subtle dark:bg-slate-800 p-4">
        <div className="min-w-64 flex-1">
          <SearchableSelect
            value={uploadReq}
            onChange={setUploadReq}
            options={d.requirements.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>
        <div className="w-56">
          <SearchableSelect
            value={role}
            onChange={setRole}
            options={[
              { value: 'submission', label: 'Tài liệu đầu vào' },
              { value: 'reference', label: 'Kết quả cũ / tham khảo' },
            ]}
          />
        </div>
        <label
          className={
            'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary-500 dark:bg-primary-600 px-4 py-2 text-sm font-bold text-white dark:text-white shadow-card hover:bg-primary-600 dark:hover:bg-primary-500 focus-within:ring-2 focus-within:ring-focus' +
            (locked ? ' cursor-not-allowed opacity-50' : '')
          }
        >
          <Upload size={15} />
          Nộp tài liệu
          <input
            type="file"
            className="sr-only"
            disabled={locked}
            accept=".pdf,.docx,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) c.action(async () => c.setD(await api.upload(d, uploadReq, file, role)));
              e.target.value = '';
            }}
          />
        </label>
        <Button variant="secondary" leftIcon={<Plus size={14} />} disabled={locked} onClick={onAddRequirement}>
          Thêm thành phần
        </Button>
      </div>
      <p className="text-xs text-ink-muted dark:text-slate-400">
        PDF có lớp chữ, DOCX hoặc TXT · tối đa 18 MB/tệp ·{' '}
        {c.health?.ocrAvailable
          ? 'OCR cục bộ tối đa 2 trang scan/tệp; cần xác nhận số liệu.'
          : 'Tệp scan chưa đọc được cần bản có lớp chữ hoặc cấu hình OCR.'}{' '}
        Kết quả cũ được tách khỏi chế độ kiểm tra đầu vào.
      </p>
      <DossierGrid
        storageKey="appraisal-intake"
        rows={rows}
        columns={[
          { label: 'Thành phần hồ sơ', value: (r) => r.name, width: 280 },
          { label: 'Nhóm', value: (r) => r.category, width: 120 },
          {
            label: 'Trạng thái',
            value: (r) => labels[r.status],
            render: (r) => <StatusLabel value={r.status} />,
            width: 150,
          },
          {
            label: 'Tài liệu và phiên bản',
            value: (r) => d.documents.filter((x) => x.requirementId === r.id).length,
            width: 300,
            render: (r) => (
              <div className="space-y-2">
                {d.documents
                  .filter((x) => x.requirementId === r.id)
                  .map((doc) => (
                    <div key={doc.id}>
                      <button
                        type="button"
                        className="text-left text-primary-700 dark:text-primary-400 hover:underline"
                        onClick={() =>
                          onShowRefs(
                            doc.segments.map((s) => ({
                              documentId: doc.id,
                              segmentId: s.id,
                              locator: s.locator,
                              quote: s.text,
                            })),
                          )
                        }
                      >
                        {doc.name} · v{doc.version}
                      </button>
                      <p className="text-ink-muted dark:text-slate-400">
                        {doc.role === 'reference' ? 'Tham khảo · ' : ''}
                        {doc.signature === 'present_unverified' ? 'Có chữ ký, chưa xác thực' : 'Chưa xác thực chữ ký'}
                      </p>
                      {doc.warnings.map((w) => (
                        <p key={w} className="text-warning-700 dark:text-warning-300">
                          {w}
                        </p>
                      ))}
                    </div>
                  ))}
              </div>
            ),
          },
          {
            label: 'Chuyên viên',
            value: (r) => r.verifiedBy || '',
            width: 170,
            render: (r) => (
              <div className="space-y-2">
                <p>{r.note}</p>
                <Button variant="secondary" size="xs" disabled={locked} onClick={() => onReviewRequirement(r)}>
                  Kiểm tra thành phần
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
