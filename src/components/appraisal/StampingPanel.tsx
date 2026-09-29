import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, MinusCircle, Plus, Stamp, Trash2 } from 'lucide-react';
import { appraisalService as api } from '../../services/appraisalService';
import type { Dossier, StampDrawing, StampingView } from '../../types/appraisal';
import { DossierGrid } from './DossierGrid';
import { ReviewModal } from './ReviewModal';
import { DateInput } from '../ui/DateInput';
import { NumberInput } from '../ui/NumberInput';
import { Tooltip } from '../ui/Tooltip';
import { formatDate, formatDateTime } from '../../lib/utils';

const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle disabled:opacity-50';
const primary =
  button +
  ' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white !border-primary-500 dark:!border-primary-500 hover:!bg-primary-600 dark:hover:!bg-primary-600';
const input =
  'focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
type Action = StampingView['actions'][number]['id'];
interface Form {
  date: string;
  reference: string;
  noticeReference: string;
  note: string;
  drawings: StampDrawing[];
}
const today = () => new Date().toISOString().slice(0, 10);
const archiveIcon = {
  done: <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />,
  missing: <Circle size={15} className="text-amber-600 dark:text-amber-400" />,
  optional: <MinusCircle size={15} className="text-slate-400 dark:text-slate-500" />,
};

/** Đóng dấu hồ sơ thiết kế, trả kết quả và lưu trữ sau thẩm định (khoản 8, 9 Điều 36 NĐ 217/2026). */
export function StampingPanel({ dossier, onChange }: { dossier: Dossier; onChange: (d: Dossier) => void }) {
  const [view, setView] = useState<StampingView | null>(null);
  const [modal, setModal] = useState<{ id: Action; label: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .stamping(dossier.id)
      .then((next) => live && setView(next))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [dossier.id, dossier.revision]);
  function open(action: { id: Action; label: string }) {
    const designs = dossier.documents.filter((d) => d.requirementId === 'KT04' && d.role !== 'reference');
    const next: Form = {
      date: today(),
      reference: '',
      noticeReference: view?.noticeReference || '',
      note: '',
      drawings:
        action.id === 'stamp'
          ? view?.drawings.length
            ? view.drawings
            : designs.map((d) => ({ code: '', name: d.name.replace(/\.[^.]+$/, ''), sheets: 1 }))
          : [],
    };
    setForm(next);
    setInitial(JSON.stringify(next));
    setModal(action);
    setError('');
  }
  async function submit() {
    if (!modal || !form) return;
    setBusy(true);
    setError('');
    try {
      onChange(await api.mutate(dossier.id, '/stamping', { revision: dossier.revision, action: modal.id, ...form }));
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!view) return error ? <p role="alert">{error}</p> : <p className="text-sm">Đang tải…</p>;
  const setDrawing = (i: number, patch: Partial<StampDrawing>) =>
    form && setForm({ ...form, drawings: form.drawings.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  return (
    <section className="space-y-4 text-ink dark:text-ink">
      <div className="rounded-xl border border-primary-200 dark:border-slate-700 bg-primary-50 dark:bg-slate-800 p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Stamp size={16} /> {view.label}
        </h3>
        {view.basis && <p className="text-xs text-ink-muted dark:text-ink-muted">Căn cứ: {view.basis}</p>}
        {view.status === 'not_started' && (
          <p className="text-sm">
            Bước này mở sau khi hồ sơ hoàn tất rà soát với kết luận trên phiếu thẩm định. Đủ điều kiện: đóng dấu 01 bộ
            bản vẽ. Chỉ đủ điều kiện sau khi hoàn thiện: chờ đề nghị đóng dấu kèm hồ sơ đã chỉnh sửa. Chưa đủ điều kiện:
            trả hồ sơ không đóng dấu.
          </p>
        )}
        {view.stampedAt && (
          <p className="text-sm">
            Đóng dấu ngày {formatDate(view.stampedAt)} ({view.stampedBy}) theo thông báo {view.noticeReference}.
            {view.pdfDueDate && !view.pdfReceivedAt && (
              <> Hạn nộp bản chụp PDF: {formatDate(view.pdfDueDate)} (05 ngày làm việc, điểm b khoản 9 Điều 36).</>
            )}
            {view.pdfReceivedAt && <> Đã nhận bản chụp PDF ngày {formatDate(view.pdfReceivedAt)}.</>}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {view.actions.map((a) => (
            <button
              key={a.id}
              className={a.id === 'refuse' ? button : primary}
              disabled={busy || !!dossier.readOnly}
              onClick={() => open(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {view.drawings.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Bản vẽ đã đóng dấu (Mẫu số 14)</h4>
          <DossierGrid
            storageKey="stamped-drawings"
            rows={view.drawings.map((d, i) => ({ ...d, id: String(i) }))}
            columns={[
              { label: 'STT', value: (r) => Number(r.id) + 1, width: 70 },
              { label: 'Ký hiệu', value: (r) => r.code, width: 140 },
              { label: 'Tên bản vẽ', value: (r) => r.name, width: 360 },
              { label: 'Số tờ', value: (r) => r.sheets, width: 90 },
            ]}
          />
        </div>
      )}
      <div className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 space-y-2">
        <h4 className="font-semibold text-sm">Hồ sơ lưu trữ tại cơ quan thẩm định (điểm a khoản 9 Điều 36)</h4>
        <ul className="space-y-1 text-sm">
          {view.archive.map((item) => (
            <li key={item.name} className="flex items-center gap-2">
              <Tooltip
                content={{ done: 'Đã có', missing: 'Còn thiếu', optional: 'Nếu có' }[item.state]}
                placement="top"
              >
                <span className="inline-flex">{archiveIcon[item.state]}</span>
              </Tooltip>
              {item.name}
            </li>
          ))}
        </ul>
      </div>
      {view.history.length > 0 && (
        <DossierGrid
          storageKey="stamping-history"
          rows={view.history.map((h, i) => ({ ...h, id: String(i) }))}
          columns={[
            { label: 'Ngày', value: (r) => r.date, render: (r) => formatDate(r.date), width: 110 },
            { label: 'Bước', value: (r) => r.label, width: 280 },
            { label: 'Văn bản', value: (r) => r.reference, width: 180 },
            { label: 'Nội dung', value: (r) => r.note, width: 300 },
            { label: 'Người ghi nhận', value: (r) => r.actor },
            { label: 'Thời điểm', value: (r) => r.at, render: (r) => formatDateTime(r.at) },
          ]}
        />
      )}
      {modal && form && (
        <ReviewModal
          heading={modal.label}
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
              {modal.id === 'request'
                ? 'Ngày tiếp nhận đề nghị'
                : modal.id === 'pdf_received'
                  ? 'Ngày nhận bản chụp PDF'
                  : modal.id === 'stamp'
                    ? 'Ngày đóng dấu'
                    : 'Ngày thông báo'}
              <DateInput value={form.date} onChange={(date) => setForm({ ...form, date })} className="mt-1" />
            </label>
            {modal.id === 'request' && (
              <label className="block text-sm">
                Số, ngày văn bản đề nghị đóng dấu
                <input
                  className={input + ' mt-1'}
                  maxLength={200}
                  required
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </label>
            )}
            {modal.id === 'stamp' && (
              <>
                <label className="block text-sm">
                  Số, ngày thông báo kết quả thẩm định (ghi trên dấu)
                  <input
                    className={input + ' mt-1'}
                    maxLength={200}
                    required
                    value={form.noticeReference}
                    onChange={(e) => setForm({ ...form, noticeReference: e.target.value })}
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Bản vẽ được đóng dấu (01 bộ)</p>
                  {form.drawings.map((d, i) => (
                    <div key={i} className="grid grid-cols-[7rem_1fr_7rem_auto] gap-2 items-center">
                      <input
                        aria-label="Ký hiệu bản vẽ"
                        className={input}
                        placeholder="Ký hiệu"
                        value={d.code}
                        onChange={(e) => setDrawing(i, { code: e.target.value })}
                      />
                      <input
                        aria-label="Tên bản vẽ"
                        className={input}
                        required
                        minLength={2}
                        value={d.name}
                        onChange={(e) => setDrawing(i, { name: e.target.value })}
                      />
                      <NumberInput
                        value={d.sheets}
                        suffix="tờ"
                        onChange={(sheets) => setDrawing(i, { sheets: Math.max(1, sheets) })}
                      />
                      <Tooltip content="Bỏ bản vẽ" placement="top">
                        <button
                          type="button"
                          aria-label="Bỏ bản vẽ"
                          className={button}
                          onClick={() => setForm({ ...form, drawings: form.drawings.filter((_, j) => j !== i) })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      setForm({ ...form, drawings: [...form.drawings, { code: '', name: '', sheets: 1 }] })
                    }
                  >
                    <Plus size={14} /> Thêm bản vẽ
                  </button>
                </div>
              </>
            )}
            <label className="block text-sm">
              {modal.id === 'refuse' ? 'Nội dung chưa đáp ứng yêu cầu tại thông báo kết quả' : 'Ghi chú'}
              <textarea
                className={input + ' mt-1'}
                rows={3}
                maxLength={2000}
                required={modal.id === 'refuse'}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
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
