import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Save } from 'lucide-react';
import { appraisalService as api } from '../../services/appraisalService';
import type { AppraisalSheetView, Dossier, SheetConclusion, SheetStatus } from '../../types/appraisal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { formatDateTime } from '../../lib/utils';

const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle disabled:opacity-50';
const primary =
  button +
  ' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white !border-primary-500 dark:!border-primary-500 hover:!bg-primary-600 dark:hover:!bg-primary-600';
const input =
  'focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
const tone: Record<SheetStatus, string> = {
  pending: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  meets: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200',
  revise: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
  fails: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
  not_applicable: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
};

interface Row {
  id: string;
  status: SheetStatus;
  assessment: string;
  requirements: string;
}
interface Form {
  planningBasis: string;
  conclusion: SheetConclusion;
  recommendations: string;
  sections: Row[];
}

function toForm(view: AppraisalSheetView): Form {
  return {
    planningBasis: view.planningBasis,
    conclusion: view.conclusion,
    recommendations: view.recommendations,
    sections: view.sections.map((s) => ({
      id: s.id,
      status: s.status,
      assessment: s.assessment,
      requirements: s.requirements.join('\n'),
    })),
  };
}

/** Phiếu thẩm định theo Điều 38 NĐ 217/2026: mức đáp ứng từng nội dung và kết luận 3 mức của Mẫu số 03. */
export function AppraisalSheet({ dossier, onChange }: { dossier: Dossier; onChange: (d: Dossier) => void }) {
  const [view, setView] = useState<AppraisalSheetView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .sheet(dossier.id)
      .then((next) => {
        if (!live) return;
        const f = toForm(next);
        setView(next);
        setForm(f);
        setInitial(JSON.stringify(f));
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [dossier.id, dossier.revision]);
  const dirty = !!form && JSON.stringify(form) !== initial;
  useUnsavedChangesGuard(dirty);
  if (!view || !form) return error ? <p role="alert">{error}</p> : <p className="text-sm">Đang tải phiếu thẩm định…</p>;
  const locked = view.locked || !!dossier.readOnly;
  const update = (id: string, patch: Partial<Row>) =>
    setForm({ ...form, sections: form.sections.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const statusOptions = Object.entries(view.statuses).map(([value, label]) => ({ value, label }));
  async function save() {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      onChange(
        await api.mutate(dossier.id, '/appraisal-sheet', {
          revision: dossier.revision,
          planningBasis: form.planningBasis,
          conclusion: form.conclusion,
          recommendations: form.recommendations,
          sections: form.sections.map((r) => ({
            id: r.id,
            status: r.status,
            assessment: r.assessment,
            requirements: r.requirements
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
            findingIds: view?.sections.find((s) => s.id === r.id)?.suggestion.findings.map((f) => f.id) || [],
          })),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 text-ink dark:text-ink">
      <div className="rounded-xl border border-primary-200 dark:border-slate-700 bg-primary-50 dark:bg-slate-800 p-4 space-y-2">
        <h3 className="font-semibold">Phiếu thẩm định Báo cáo nghiên cứu khả thi</h3>
        <p className="text-sm">
          Đánh giá mức độ đáp ứng từng nội dung theo Điều 38 NĐ 217/2026 và kết luận chung (mục V–VI Mẫu số 03). Gợi ý
          chỉ lấy từ kết quả kiểm tra đã được chuyên viên đánh giá; chuyên viên quyết định mọi mức đáp ứng.
        </p>
        <p className="text-sm flex items-center gap-2">
          {view.complete ? (
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
          )}
          {view.complete ? 'Phiếu đã đủ điều kiện để hoàn tất rà soát.' : 'Phiếu chưa hoàn chỉnh.'}
          {view.updatedBy && (
            <span className="text-ink-muted dark:text-ink-muted">
              · Cập nhật: {view.updatedBy}, {view.updatedAt ? formatDateTime(view.updatedAt) : ''}
            </span>
          )}
        </p>
        {!view.complete && (
          <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-200">
            {view.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {!view.hasRun && (
          <p className="text-sm text-ink-muted dark:text-ink-muted">
            Chưa có kết quả kiểm tra còn hiệu lực nên chưa có gợi ý. Vẫn có thể đánh giá trực tiếp.
          </p>
        )}
        {locked && (
          <p className="text-sm font-medium">Hồ sơ đã hoàn tất rà soát hoặc chỉ được xem. Mở lại hồ sơ để sửa phiếu.</p>
        )}
      </div>
      <fieldset disabled={locked || busy} className="space-y-4">
        <div className="max-w-xl">
          <label className="text-sm font-medium">Quy hoạch làm căn cứ lập dự án (khoản 1 Điều 38)</label>
          <SearchableSelect
            value={form.planningBasis}
            onChange={(planningBasis) => setForm({ ...form, planningBasis })}
            placeholder="Chọn loại quy hoạch…"
            options={Object.entries(view.planningBases).map(([value, label]) => ({ value, label }))}
          />
        </div>
        {view.sections.map((section, index) => {
          const row = form.sections.find((r) => r.id === section.id)!;
          const suggestion = section.suggestion;
          return (
            <article
              key={section.id}
              className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 space-y-3"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">
                    {index + 1}. {section.title}
                  </h4>
                  <p className="text-xs text-ink-muted dark:text-ink-muted">
                    {section.form} · {section.basis}
                  </p>
                </div>
                <span className={'rounded-md px-2 py-1 text-xs font-medium ' + tone[row.status]}>
                  {view.statuses[row.status]}
                </span>
              </header>
              {section.criteria.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-ink-secondary dark:text-ink-secondary">
                  {section.criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              {section.id === 'planning' && !form.planningBasis && (
                <p className="text-xs text-ink-muted dark:text-ink-muted">
                  Chọn loại quy hoạch để hiện tiêu chí đánh giá tương ứng.
                </p>
              )}
              {!section.applicable ? (
                <p className="text-sm text-ink-muted dark:text-ink-muted">
                  Không áp dụng: dự án không sử dụng vốn đầu tư công hoặc theo phương thức PPP.
                </p>
              ) : (
                <>
                  <div className="rounded-lg bg-subtle dark:bg-slate-800 p-3 text-sm space-y-2">
                    <p className="flex items-start gap-2">
                      <Lightbulb size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" />
                      <span>
                        Gợi ý từ kết quả kiểm tra:{' '}
                        <b>{suggestion.status ? view.statuses[suggestion.status] : 'chưa đủ căn cứ'}</b> —{' '}
                        {suggestion.reason}
                      </span>
                    </p>
                    {suggestion.findings.length > 0 && (
                      <ul className="list-disc pl-6 text-xs text-ink-secondary dark:text-ink-secondary">
                        {suggestion.findings.map((f) => (
                          <li key={f.id}>
                            {f.title}
                            {f.decision ? '' : ' (chưa đánh giá)'}
                          </li>
                        ))}
                      </ul>
                    )}
                    {suggestion.status && (
                      <button
                        type="button"
                        className={button}
                        onClick={() =>
                          update(section.id, {
                            status: suggestion.status!,
                            requirements: [row.requirements, ...suggestion.requirements]
                              .filter((x) => x.trim())
                              .join('\n'),
                          })
                        }
                      >
                        Áp dụng gợi ý
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div>
                      <label className="text-sm">Mức độ đáp ứng</label>
                      <SearchableSelect
                        value={row.status}
                        onChange={(status) => update(section.id, { status: status as SheetStatus })}
                        options={statusOptions}
                      />
                    </div>
                    <label className="text-sm lg:col-span-2">
                      Nhận xét, đánh giá
                      <textarea
                        className={input + ' mt-1'}
                        rows={3}
                        maxLength={4000}
                        value={row.assessment}
                        onChange={(e) => update(section.id, { assessment: e.target.value })}
                      />
                    </label>
                  </div>
                  {(row.status === 'revise' || row.status === 'fails' || row.requirements) && (
                    <label className="block text-sm">
                      Yêu cầu sửa đổi, bổ sung, hoàn thiện (mỗi dòng một yêu cầu)
                      <textarea
                        className={input + ' mt-1'}
                        rows={3}
                        value={row.requirements}
                        onChange={(e) => update(section.id, { requirements: e.target.value })}
                      />
                    </label>
                  )}
                </>
              )}
            </article>
          );
        })}
        <div className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 space-y-3">
          <h4 className="font-semibold">VI. Kết luận và kiến nghị</h4>
          <div className="max-w-xl">
            <label className="text-sm">Kết luận</label>
            <SearchableSelect
              value={form.conclusion}
              onChange={(conclusion) => setForm({ ...form, conclusion: conclusion as SheetConclusion })}
              options={[
                { value: 'pending', label: 'Chưa kết luận' },
                ...Object.entries(view.conclusions).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          {view.suggestedConclusion && (
            <p className="text-sm text-ink-secondary dark:text-ink-secondary">
              Theo mức đáp ứng đã lưu: {view.conclusions[view.suggestedConclusion].toLowerCase()}.
            </p>
          )}
          <label className="block text-sm">
            Kiến nghị
            <textarea
              className={input + ' mt-1'}
              rows={3}
              maxLength={4000}
              value={form.recommendations}
              onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <button type="button" className={primary} disabled={!dirty} onClick={save}>
          <Save size={14} />
          {busy ? 'Đang lưu…' : 'Lưu phiếu thẩm định'}
        </button>
      </fieldset>
    </section>
  );
}
