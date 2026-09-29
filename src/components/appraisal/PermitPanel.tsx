import { useEffect, useState } from 'react';
import { FileBadge, Send } from 'lucide-react';
import { appraisalService as api } from '../../services/appraisalService';
import type { Dossier, PermitConsultation, PermitView } from '../../types/appraisal';
import { DossierGrid } from './DossierGrid';
import { ReviewModal } from './ReviewModal';
import { DateInput } from '../ui/DateInput';
import { SearchableSelect } from '../ui/SearchableSelect';
import { formatDate } from '../../lib/utils';

const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle disabled:opacity-50';
const primary =
  button +
  ' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white !border-primary-500 dark:!border-primary-500 hover:!bg-primary-600 dark:hover:!bg-primary-600';
const input =
  'focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
const today = () => new Date().toISOString().slice(0, 10);
const consultStatus: Record<PermitConsultation['status'], string> = {
  waiting: 'Đang chờ trả lời',
  responded: 'Đã trả lời',
  silent_consent: 'Quá 02 ngày làm việc — coi như đồng ý',
};
const actionLabels = {
  issue: 'Cấp giấy phép',
  revoke: 'Thu hồi giấy phép',
  return: 'Nhận lại bản gốc',
  cancel: 'Hủy giấy phép',
};
type Modal =
  | { kind: 'send' }
  | { kind: 'respond'; item: PermitConsultation }
  | { kind: 'permit'; action: keyof typeof actionLabels };
interface Form {
  date: string;
  agency: string;
  subject: string;
  response: string;
  number: string;
  basePermit: string;
  reference: string;
  reason: string;
  note: string;
}
const empty: Form = {
  date: today(),
  agency: '',
  subject: '',
  response: '',
  number: '',
  basePermit: '',
  reference: '',
  reason: '',
  note: '',
};

/** Lấy ý kiến cơ quan liên quan, cấp số và quản lý hiệu lực giấy phép xây dựng (NĐ 217/2026). */
export function PermitPanel({ dossier, onChange }: { dossier: Dossier; onChange: (d: Dossier) => void }) {
  const [view, setView] = useState<PermitView | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .permit(dossier.id)
      .then((next) => live && setView(next))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [dossier.id, dossier.revision]);
  function open(next: Modal) {
    const f = { ...empty, date: today() };
    setForm(f);
    setInitial(JSON.stringify(f));
    setModal(next);
    setError('');
  }
  async function submit() {
    if (!modal) return;
    setBusy(true);
    setError('');
    try {
      const base = { revision: dossier.revision, date: form.date };
      const result =
        modal.kind === 'permit'
          ? await api.mutate(dossier.id, '/permit', {
              ...base,
              action: modal.action,
              number: form.number,
              basePermit: form.basePermit,
              reference: form.reference,
              reason: form.reason,
              note: form.note,
            })
          : await api.mutate(dossier.id, '/consultations/permit', {
              ...base,
              action: modal.kind,
              id: modal.kind === 'respond' ? modal.item.id : '',
              agency: form.agency,
              subject: form.subject,
              response: form.response,
            });
      onChange(result);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!view) return error ? <p role="alert">{error}</p> : null;
  const permit = view.permit;
  const renewal = ['amendment', 'extension', 'reissue'].includes(view.subtype || '');
  return (
    <section className="space-y-4 rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 text-ink dark:text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold flex items-center gap-2">
          <FileBadge size={16} /> Lấy ý kiến và giấy phép
        </h3>
        <div className="flex flex-wrap gap-2">
          {!view.reviewed && (
            <button className={button} disabled={busy || !!dossier.readOnly} onClick={() => open({ kind: 'send' })}>
              <Send size={14} /> Gửi lấy ý kiến
            </button>
          )}
          {view.actions.map((a) => (
            <button
              key={a}
              className={a === 'issue' ? primary : button}
              disabled={busy || !!dossier.readOnly}
              onClick={() => open({ kind: 'permit', action: a })}
            >
              {actionLabels[a]}
            </button>
          ))}
        </div>
      </header>
      <p className="text-xs text-ink-muted dark:text-ink-muted">
        Cơ quan được hỏi ý kiến trả lời trong {view.consultDays} ngày làm việc; quá hạn không trả lời được coi là đồng ý
        (điểm c khoản 2 Điều 54 NĐ 217/2026).
      </p>
      {view.consultations.length > 0 && (
        <DossierGrid
          storageKey="permit-consultations"
          rows={view.consultations}
          columns={[
            { label: 'Cơ quan', value: (r) => r.agency, width: 220 },
            { label: 'Nội dung', value: (r) => r.subject, width: 280 },
            { label: 'Ngày gửi', value: (r) => r.sentDate, render: (r) => formatDate(r.sentDate), width: 110 },
            { label: 'Hạn trả lời', value: (r) => r.dueDate, render: (r) => formatDate(r.dueDate), width: 110 },
            {
              label: 'Tình trạng',
              value: (r) => consultStatus[r.status],
              render: (r) =>
                r.status === 'waiting' && !view.reviewed ? (
                  <button className={button} onClick={() => open({ kind: 'respond', item: r })}>
                    Ghi nhận trả lời
                  </button>
                ) : (
                  consultStatus[r.status]
                ),
              width: 220,
            },
            { label: 'Ý kiến', value: (r) => r.response, width: 260 },
          ]}
        />
      )}
      {permit ? (
        <div className="rounded-lg bg-subtle dark:bg-slate-800 p-3 text-sm space-y-1">
          <p className="font-semibold">
            Giấy phép số {permit.number} — {view.statusLabel}
          </p>
          <p>
            Ngày cấp {formatDate(permit.issueDate)} (Mẫu {permit.form} Phụ lục II) · Hạn khởi công đến{' '}
            {formatDate(permit.startDeadline)} · Công khai trên trang thông tin điện tử đến{' '}
            {formatDate(permit.publicUntil)} (Điều 66)
          </p>
          {view.returnDueDate && view.status === 'revoked' && (
            <p className="text-amber-800 dark:text-amber-200">
              Chủ đầu tư nộp lại bản gốc trước {formatDate(view.returnDueDate)}; quá 10 ngày làm việc (từ{' '}
              {view.cancelFromDate ? formatDate(view.cancelFromDate) : ''}) thì ban hành quyết định hủy (khoản 2 Điều
              65).
            </p>
          )}
          {permit.events.map((e) => (
            <p key={e.at} className="text-ink-secondary dark:text-ink-secondary">
              {formatDate(e.date)} · {actionLabels[e.type]} {e.reference} {e.note}
            </p>
          ))}
        </div>
      ) : (
        view.reviewed &&
        !view.eligible && (
          <p className="text-sm text-ink-secondary dark:text-ink-secondary">
            Hồ sơ không đủ điều kiện cấp phép; không phát sinh giấy phép.
          </p>
        )
      )}
      {modal && (
        <ReviewModal
          heading={
            modal.kind === 'send'
              ? 'Gửi văn bản lấy ý kiến'
              : modal.kind === 'respond'
                ? 'Ghi nhận ý kiến trả lời — ' + modal.item.agency
                : actionLabels[modal.action]
          }
          dirty={busy || JSON.stringify(form) !== initial}
          onClose={() => !busy && setModal(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="block text-sm">
              {modal.kind === 'send'
                ? 'Ngày gửi'
                : modal.kind === 'respond'
                  ? 'Ngày nhận trả lời'
                  : modal.action === 'issue'
                    ? 'Ngày cấp'
                    : modal.action === 'return'
                      ? 'Ngày nhận lại bản gốc'
                      : 'Ngày quyết định'}
              <DateInput value={form.date} onChange={(date) => setForm({ ...form, date })} className="mt-1" />
            </label>
            {modal.kind === 'send' && (
              <>
                <label className="block text-sm">
                  Cơ quan được hỏi ý kiến
                  <input
                    className={input + ' mt-1'}
                    required
                    minLength={3}
                    value={form.agency}
                    onChange={(e) => setForm({ ...form, agency: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Nội dung cần ý kiến (thông tin chưa đầy đủ hoặc chưa thống nhất)
                  <textarea
                    className={input + ' mt-1'}
                    rows={3}
                    required
                    minLength={5}
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                </label>
              </>
            )}
            {modal.kind === 'respond' && (
              <label className="block text-sm">
                Nội dung trả lời
                <textarea
                  className={input + ' mt-1'}
                  rows={3}
                  required
                  minLength={3}
                  value={form.response}
                  onChange={(e) => setForm({ ...form, response: e.target.value })}
                />
              </label>
            )}
            {modal.kind === 'permit' && modal.action === 'issue' && renewal && (
              <div>
                <label className="text-sm">Giấy phép gốc (ghi điều chỉnh, gia hạn, cấp lại)</label>
                <SearchableSelect
                  value={form.basePermit}
                  onChange={(basePermit) => setForm({ ...form, basePermit })}
                  placeholder="Chọn giấy phép trong sổ…"
                  options={(view.basePermits || []).map((p) => ({
                    value: p.number,
                    label: `${p.number} — ${p.projectName} (${p.status})`,
                  }))}
                />
              </div>
            )}
            {modal.kind === 'permit' && modal.action === 'issue' && !renewal && (
              <label className="block text-sm">
                Số giấy phép (để trống: hệ thống cấp số tiếp theo trong năm)
                <input
                  className={input + ' mt-1'}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </label>
            )}
            {modal.kind === 'permit' && modal.action === 'revoke' && (
              <div>
                <label className="text-sm">Căn cứ thu hồi (khoản 1 Điều 65)</label>
                <SearchableSelect
                  value={form.reason}
                  onChange={(reason) => setForm({ ...form, reason })}
                  options={Object.entries(view.revokeReasons).map(([value, label]) => ({ value, label }))}
                />
              </div>
            )}
            {modal.kind === 'permit' && modal.action !== 'issue' && (
              <label className="block text-sm">
                {modal.action === 'return' ? 'Số biên bản nhận lại (nếu có)' : 'Số, ngày quyết định'}
                <input
                  className={input + ' mt-1'}
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </label>
            )}
            {modal.kind === 'permit' && (
              <label className="block text-sm">
                Ghi chú
                <textarea
                  className={input + ' mt-1'}
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <button className={primary} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Xác nhận'}
            </button>
          </form>
        </ReviewModal>
      )}
    </section>
  );
}
