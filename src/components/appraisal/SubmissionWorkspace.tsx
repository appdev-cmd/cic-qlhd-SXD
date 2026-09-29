import { WorkflowPanel } from './WorkflowPanel';
import { ProcedureReview } from './ProcedureReview';
import { PermitPanel } from './PermitPanel';
import { OcrPanel } from './OcrPanel';
import { SubmissionHistory } from './SubmissionHistory';
import React, { useEffect, useState } from 'react';
import { appraisalService as api } from '../../services/appraisalService';
import type { Dossier, DossierDocument } from '../../types/appraisal';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import { SearchableSelect } from '../ui/SearchableSelect';
import { DossierGrid } from './DossierGrid';
import { ReviewModal } from './ReviewModal';
import { formatDateTime } from '../../lib/utils';

const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-sm text-ink dark:text-ink disabled:opacity-50';

export function SubmissionWorkspace({ dossierId }: { dossierId: string }) {
  const [d, setD] = useState<Dossier | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('APPLICATION');
  const [tab, setTab] = useState('documents');
  const [preview, setPreview] = useState<DossierDocument | null>(null);
  const [consultationOpen, setConsultationOpen] = useState(false);
  const [consultation, setConsultation] = useState({ text: '', response: '' });
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
    let live = true;
    api
      .get(dossierId)
      .then((item) => {
        if (live) setD(item);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [dossierId]);
  return (
    <div className="p-6 space-y-5 text-ink dark:text-ink">
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {d ? (
        <>
          <header>
            <h2 className="text-xl font-semibold">{PROJECT_PROCEDURES[d.procedure || 'bcnckt'].label}</h2>
            <p className="mt-2 text-sm text-ink-secondary dark:text-ink-secondary">
              Tiếp nhận tài liệu của lần nộp này. Các nhóm dưới đây dùng để lưu trữ; chuyên viên xác định thành phần áp
              dụng theo thủ tục cụ thể.
            </p>
          </header>
          <SubmissionHistory dossier={d} />
          <WorkflowPanel dossier={d} onChange={setD} />
          <ProcedureReview dossier={d} onChange={setD} />
          {d.procedure === 'gpxd' && <PermitPanel dossier={d} onChange={setD} />}
          <OcrPanel dossier={d} onChange={setD} />
          <div className="flex gap-3">
            {['pdf', 'docx'].map((format) => (
              <button
                key={format}
                className={button}
                disabled={busy}
                onClick={() =>
                  action(() => api.download(`/cases/${d.id}/internal-record/${format}`, `phieu-xu-ly.${format}`))
                }
              >
                Phiếu xử lý {format.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button className={button} aria-pressed={tab === 'documents'} onClick={() => setTab('documents')}>
              Tài liệu đã nộp ({d.documents.length})
            </button>
            <button className={button} aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>
              Lịch sử xử lý
            </button>
            <button className={button} disabled={busy} onClick={() => action(async () => setD(await api.get(d.id)))}>
              Tải lại
            </button>
          </div>
          {tab === 'documents' ? (
            <>
              <button
                className={button}
                disabled={busy || d.readOnly || !!d.finalReview}
                onClick={() => {
                  setConsultation({ text: '', response: '' });
                  setConsultationOpen(true);
                }}
              >
                Ghi ý kiến / giải trình
              </button>
              {d.consultations.length > 0 && (
                <section className="space-y-3 rounded-lg border border-border dark:border-border p-4">
                  <h3 className="font-semibold">Nội dung xử lý và giải trình</h3>
                  {d.consultations.map((item) => (
                    <div key={item.id} className="text-sm space-y-1">
                      <p>{item.text}</p>
                      <p className="text-ink-secondary dark:text-ink-secondary">
                        {item.response ? 'Giải trình: ' + item.response : 'Đang chờ tài liệu bổ sung.'}
                      </p>
                    </div>
                  ))}
                </section>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-72">
                  <label className="text-sm">Nhóm tài liệu</label>
                  <SearchableSelect
                    value={group}
                    onChange={setGroup}
                    options={d.requirements.map((r) => ({ value: r.id, label: r.name }))}
                  />
                </div>
                <label className="text-sm">
                  Nộp tài liệu (PDF, DOCX, TXT; tối đa 18 MB)
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    disabled={busy || d.readOnly || !!d.finalReview}
                    className="block mt-2 max-w-full"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) action(async () => setD(await api.upload(d, group, file, 'submission')));
                    }}
                  />
                </label>
              </div>
              <DossierGrid
                storageKey={'submission-files-' + d.procedure}
                rows={d.documents}
                columns={[
                  {
                    label: 'Tài liệu',
                    value: (r) => r.name,
                    width: 320,
                    render: (r) => (
                      <button
                        className="text-primary-700 dark:text-primary-400 text-left"
                        disabled={busy}
                        onClick={() => setPreview(r)}
                      >
                        {r.name}
                      </button>
                    ),
                  },
                  {
                    label: 'Nhóm',
                    value: (r) => d.requirements.find((x) => x.id === r.requirementId)?.name || 'Tài liệu',
                  },
                  { label: 'Phiên bản', value: (r) => r.version, width: 100 },
                  { label: 'Ngày nộp', value: (r) => r.uploadedAt, render: (r) => formatDateTime(r.uploadedAt) },
                  { label: 'Ghi chú đọc tệp', value: (r) => r.warnings.join(' · ') || 'Đã lưu bản gốc', width: 280 },
                ]}
              />
            </>
          ) : (
            <DossierGrid
              storageKey="submission-audit"
              rows={d.audit}
              columns={[
                { label: 'Thời điểm', value: (r) => r.at, render: (r) => formatDateTime(r.at) },
                { label: 'Người thực hiện', value: (r) => r.actor },
                { label: 'Thao tác', value: (r) => r.action },
                { label: 'Nội dung', value: (r) => r.detail, width: 420 },
              ]}
            />
          )}
          {preview && (
            <ReviewModal heading="Nội dung tài liệu" onClose={() => setPreview(null)}>
              <div className="space-y-4">
                <p className="font-medium break-words">{preview.name}</p>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => action(() => api.download(`/cases/${d.id}/documents/${preview.id}`, preview.name))}
                >
                  Tải bản gốc
                </button>
                <p className="text-xs text-ink-muted dark:text-ink-muted">
                  Nội dung đọc từ tệp; xem bản gốc để đối chiếu thể thức và bản vẽ.
                </p>
                <div className="max-h-[55vh] overflow-auto space-y-2 text-sm select-text">
                  {preview.segments.length ? (
                    preview.segments.map((segment) => (
                      <p key={segment.id} className="whitespace-pre-wrap break-words">
                        {segment.text}
                      </p>
                    ))
                  ) : (
                    <p>Chưa đọc được nội dung. Tải bản gốc để xem.</p>
                  )}
                </div>
              </div>
            </ReviewModal>
          )}
          {consultationOpen && (
            <ReviewModal
              heading="Ghi ý kiến và giải trình"
              dirty={busy || JSON.stringify(consultation) !== JSON.stringify({ text: '', response: '' })}
              onClose={() => {
                if (!busy) setConsultationOpen(false);
              }}
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  action(async () => {
                    setD(await api.mutate(d.id, '/consultations', { revision: d.revision, ...consultation }));
                    setConsultationOpen(false);
                  });
                }}
              >
                <label className="block text-sm">
                  Nội dung cần xử lý
                  <textarea
                    className={button + ' block mt-2 w-full'}
                    rows={4}
                    required
                    minLength={3}
                    maxLength={4000}
                    disabled={busy}
                    value={consultation.text}
                    onChange={(e) => setConsultation({ ...consultation, text: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Giải trình đã tiếp nhận (nếu có)
                  <textarea
                    className={button + ' block mt-2 w-full'}
                    rows={4}
                    maxLength={4000}
                    disabled={busy}
                    value={consultation.response}
                    onChange={(e) => setConsultation({ ...consultation, response: e.target.value })}
                  />
                </label>
                {error && (
                  <p role="alert" className="text-red-700 dark:text-red-300">
                    {error}
                  </p>
                )}
                <button
                  className={button + ' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'}
                  disabled={busy || consultation.text.trim().length < 3}
                >
                  {busy ? 'Đang lưu…' : 'Lưu ý kiến'}
                </button>
              </form>
            </ReviewModal>
          )}
        </>
      ) : (
        <p>Đang tải hồ sơ…</p>
      )}
    </div>
  );
}
