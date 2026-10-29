import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// G4: checklist hiện trường gắn cấu kiện. Ký phiếu → sổ xác minh LOD 500 (nguồn checklist). Dùng được trên điện thoại.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FilePen,
  MousePointerClick,
  PenLine,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimSelectedElement, BimViewerRef } from '../../viewer/types';
import {
  BimChecklistService,
  type ChecklistSheet,
  type ChecklistTemplate,
  type FieldMethod,
  type SheetDraft,
} from '../../services/BimChecklistService';
import { summarizeChecklist, templatesFor, type ChecklistAnswer } from '../../lib/checklistForm';
import { METHOD_LABELS } from '../../lib/lod500';
import { getIfcLabel } from '../../lib/ifcLabels';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-2xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
interface Target {
  guid: string;
  name?: string;
  category?: string;
}
type Form = SheetDraft & { id: string | null };

export const BimFieldPanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  canEdit: boolean;
  selection: BimSelectedElement | null;
  className?: string;
}> = ({ projectId, viewerRef, canEdit, selection, className = '' }) => {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: ['bim-checklist-mau', projectId],
    queryFn: () => BimChecklistService.templates(projectId),
    retry: false,
  });
  const sheets = useQuery({
    queryKey: ['bim-checklist-phieu', projectId],
    queryFn: () => BimChecklistService.sheets(projectId),
    retry: false,
  });
  const [targets, setTargets] = useState<{ modelId: string; items: Target[] } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const current =
    targets ??
    (selection?.guid
      ? {
          modelId: selection.modelId,
          items: [{ guid: selection.guid, name: selection.name, category: selection.category }],
        }
      : null);
  const mauId = form?.mau_id;
  const tpl = useMemo(() => (mauId ? templates.data?.find((t) => t.id === mauId) : undefined), [mauId, templates.data]);
  const summary = useMemo(() => (tpl && form ? summarizeChecklist(tpl.muc, form.ket_qua_muc) : null), [tpl, form]);
  const shownSheets = useMemo(() => {
    const g = new Set(current?.items.map((t) => t.guid) ?? []);
    const list = sheets.data ?? [];
    return (g.size ? list.filter((s) => s.global_ids.some((x) => g.has(x))) : list).slice(0, 30);
  }, [sheets.data, current]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bim-checklist-phieu', projectId] });
    void qc.invalidateQueries({ queryKey: ['bim-lod'] });
  };

  const pickSelection = async () => {
    const viewer = viewerRef.current;
    const sel = viewer?.getSelection() ?? [];
    if (!viewer || !sel.length)
      return addToast({ type: 'info', message: 'Chọn một hoặc nhiều cấu kiện trên mô hình trước.' });
    const modelId = sel[0].modelId;
    const ids = sel.filter((s) => s.modelId === modelId).map((s) => s.expressId);
    const brief = await viewer.getItemsBrief(modelId, ids);
    const items = ids
      .map((id) => brief[id])
      .filter((b): b is NonNullable<typeof b> => !!b?.guid)
      .map((b) => ({ guid: b.guid!, name: b.name, category: b.category }));
    if (sel.some((s) => s.modelId !== modelId))
      addToast({
        type: 'info',
        message: 'Phiếu chỉ gắn cấu kiện của một mô hình: đã lấy cấu kiện của mô hình đầu tiên.',
      });
    setTargets({ modelId, items });
  };
  const startNew = (t?: ChecklistTemplate) => {
    if (!current?.items.length) return addToast({ type: 'info', message: 'Chọn cấu kiện để lập phiếu.' });
    setPhotos([]);
    setForm({
      id: null,
      model_id: current.modelId,
      global_ids: current.items.map((i) => i.guid),
      mau_id: t?.id ?? null,
      tieu_de: `${t?.ten ?? 'Kiểm tra hiện trường'} · ${current.items.length === 1 ? (current.items[0].name ?? current.items[0].guid) : `${current.items.length} cấu kiện`}`,
      ket_qua_muc: [],
      ket_luan: null,
      sai_so_mm: null,
      dung_sai_mm: t?.dung_sai_mm ?? null,
      ngay: today(),
      don_vi: null,
      phuong_phap: t?.phuong_phap ?? 'do_thu_cong',
      bien_ban: null,
      anh: [],
      ghi_chu: null,
    });
  };
  const answer = (ma: string, patch: Partial<ChecklistAnswer>) =>
    form &&
    setForm({
      ...form,
      ket_qua_muc: [
        ...form.ket_qua_muc.filter((a) => a.ma !== ma),
        { ...(form.ket_qua_muc.find((a) => a.ma === ma) ?? { ma }), ...patch },
      ],
    });
  const persist = async (): Promise<ChecklistSheet | null> => {
    if (!form) return null;
    setBusy(true);
    try {
      const anh = [...form.anh];
      for (const p of photos) anh.push(await BimChecklistService.uploadPhoto(projectId, p));
      const draft: SheetDraft = {
        ...form,
        anh,
        ket_luan: form.ket_luan ?? summary?.suggestion ?? null,
        sai_so_mm: form.sai_so_mm ?? summary?.maxDeviationMm ?? null,
      };
      const { id, ...rest } = { ...draft, id: form.id };
      const saved = await BimChecklistService.save(id, rest);
      setPhotos([]);
      setForm({ ...rest, id: saved.id });
      refresh();
      return saved;
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const sign = async () => {
    if (!window.confirm('Ký phiếu? Phiếu đã ký không sửa được và sẽ ghi vào sổ xác minh LOD 500.')) return;
    const saved = await persist();
    if (!saved) return;
    try {
      await BimChecklistService.sign(saved.id);
      setForm(null);
      refresh();
      addToast({ type: 'success', message: `Đã ký phiếu, ghi xác minh cho ${saved.global_ids.length} cấu kiện.` });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const focus = async (s: ChecklistSheet) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const ids = (await viewer.mapGuidsToIds(s.model_id, s.global_ids)).filter((x): x is number => x !== null);
    if (ids.length) await viewer.selectMany(ids.map((expressId) => ({ modelId: s.model_id, expressId })));
  };

  const error = templates.error ?? sheets.error;
  const available = templatesFor(templates.data ?? [], current?.items[0]?.category);
  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-slate-700 dark:text-slate-200 ${className}`}
      aria-label="Checklist hiện trường"
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
        <ClipboardCheck className="h-4 w-4 text-primary-600" aria-hidden /> Kiểm tra hiện trường
      </div>
      {error && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {errorText(error)}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">
            {current?.items.length ? `${current.items.length} cấu kiện` : 'Chưa chọn cấu kiện'}
          </span>
          <button type="button" className={btn} onClick={() => void pickSelection()}>
            <MousePointerClick className="h-3 w-3" aria-hidden /> Dùng vùng chọn
          </button>
        </div>
        {current?.items.slice(0, 4).map((t) => (
          <p key={t.guid} className="truncate text-2xs text-slate-500">
            {t.name ?? t.guid} · {getIfcLabel(t.category ?? '')}
          </p>
        ))}
        {(current?.items.length ?? 0) > 4 && (
          <p className="text-2xs text-slate-500">… và {current!.items.length - 4} cấu kiện khác</p>
        )}
        {canEdit && current?.items.length && !form ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {available.map((t) => (
              <button key={t.id} type="button" className={btn} onClick={() => startNew(t)}>
                <FilePen className="h-3 w-3" aria-hidden /> {t.ten}
              </button>
            ))}
            <button type="button" className={btn} onClick={() => startNew()}>
              Phiếu không theo mẫu
            </button>
          </div>
        ) : null}
      </section>

      {form && (
        <section
          className="space-y-2 rounded-xl border border-primary-200 p-2 dark:border-primary-800"
          aria-label="Phiếu kiểm tra"
        >
          <BimInput
            className={`${field} font-semibold`}
            value={form.tieu_de}
            onChange={(e) => setForm({ ...form, tieu_de: e.target.value })}
            aria-label="Tiêu đề phiếu"
          />
          {tpl?.can_cu && <p className="text-2xs text-slate-500">{tpl.can_cu}</p>}
          {tpl?.muc.map((m, k) => {
            const a = form.ket_qua_muc.find((x) => x.ma === m.ma);
            const v = summary?.verdicts[k];
            return (
              <div key={m.ma} className="rounded-lg bg-slate-50 p-1.5 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-2xs font-medium">
                    {m.noi_dung}
                    {m.kieu === 'so' && m.gia_tri_thiet_ke != null && (
                      <span className="text-slate-500">
                        {' '}
                        · TK {m.gia_tri_thiet_ke}
                        {m.dung_sai != null ? ` ± ${m.dung_sai}` : ''} {m.don_vi}
                      </span>
                    )}
                  </span>
                  {v?.ok === true && m.kieu !== 'chu' && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Đạt" />
                  )}
                  {v?.ok === false && <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-label="Không đạt" />}
                </div>
                {m.kieu === 'dat_khong' && (
                  <div className="mt-1 flex gap-1">
                    {[true, false].map((d) => (
                      <button
                        key={String(d)}
                        type="button"
                        aria-pressed={a?.dat === d}
                        onClick={() => answer(m.ma, { dat: d })}
                        className={`${btn} flex-1 ${a?.dat === d ? (d ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200') : ''}`}
                      >
                        {d ? 'Đạt' : 'Không đạt'}
                      </button>
                    ))}
                  </div>
                )}
                {m.kieu === 'so' && (
                  <BimInput
                    className={`${field} mt-1`}
                    inputMode="decimal"
                    placeholder={`Giá trị đo (${m.don_vi ?? ''})`}
                    value={a?.gia_tri ?? ''}
                    onChange={(e) =>
                      answer(m.ma, { gia_tri: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })
                    }
                    aria-label={m.noi_dung}
                  />
                )}
                {m.kieu === 'chu' && (
                  <BimInput
                    className={`${field} mt-1`}
                    value={a?.ghi_chu ?? ''}
                    onChange={(e) => answer(m.ma, { ghi_chu: e.target.value })}
                    aria-label={m.noi_dung}
                  />
                )}
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-1">
            <label className="text-2xs">
              Ngày
              <BimInput
                type="date"
                className={field}
                value={form.ngay ?? ''}
                onChange={(e) => setForm({ ...form, ngay: e.target.value || null })}
              />
            </label>
            <label className="text-2xs">
              Phương pháp
              <BimSelect
                className={field}
                value={form.phuong_phap ?? ''}
                onChange={(e) => setForm({ ...form, phuong_phap: (e.target.value || null) as FieldMethod | null })}
              >
                {(Object.keys(METHOD_LABELS) as FieldMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {METHOD_LABELS[k]}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="text-2xs">
              Đơn vị kiểm tra
              <BimInput
                className={field}
                value={form.don_vi ?? ''}
                onChange={(e) => setForm({ ...form, don_vi: e.target.value || null })}
                placeholder="TVGS, nhà thầu…"
              />
            </label>
            <label className="text-2xs">
              Số biên bản
              <BimInput
                className={field}
                value={form.bien_ban ?? ''}
                onChange={(e) => setForm({ ...form, bien_ban: e.target.value || null })}
              />
            </label>
            <label className="text-2xs">
              Sai số (mm)
              <BimInput
                className={field}
                inputMode="decimal"
                value={form.sai_so_mm ?? summary?.maxDeviationMm ?? ''}
                onChange={(e) => setForm({ ...form, sai_so_mm: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label className="text-2xs">
              Dung sai (mm)
              <BimInput
                className={field}
                inputMode="decimal"
                value={form.dung_sai_mm ?? ''}
                onChange={(e) =>
                  setForm({ ...form, dung_sai_mm: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold">Kết luận</span>
            {(['dat', 'sai_lech'] as const).map((k) => {
              const on = (form.ket_luan ?? summary?.suggestion) === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, ket_luan: k })}
                  className={`${btn} ${on ? (k === 'dat' ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200') : ''}`}
                >
                  {k === 'dat' ? 'Đạt' : 'Sai lệch'}
                </button>
              );
            })}
            {summary?.suggestion && !form.ket_luan && (
              <span className="text-2xs text-slate-500">(gợi ý theo các mục)</span>
            )}
          </div>
          <label className="block text-2xs">
            Ghi chú
            <textarea
              className={field}
              rows={2}
              value={form.ghi_chu ?? ''}
              onChange={(e) => setForm({ ...form, ghi_chu: e.target.value || null })}
            />
          </label>
          <label className={`${btn} cursor-pointer`}>
            <Camera className="h-3 w-3" aria-hidden /> Ảnh hiện trường ({form.anh.length + photos.length})
            <BimInput
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              className={btn}
              onClick={() => {
                setForm(null);
                setPhotos([]);
              }}
            >
              Đóng
            </button>
            <button type="button" className={`${btn} flex-1`} disabled={busy} onClick={() => void persist()}>
              <PenLine className="h-3 w-3" aria-hidden /> Lưu nháp
            </button>
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary-600 px-2 py-1 text-2xs font-bold text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => void sign()}
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Ký phiếu
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 p-2 dark:border-slate-700" aria-label="Phiếu đã lập">
        <div className="mb-1 font-semibold">
          {current?.items.length ? 'Phiếu của cấu kiện đang chọn' : 'Phiếu gần đây'} ({shownSheets.length})
        </div>
        <ul className="space-y-1">
          {shownSheets.map((s) => (
            <li key={s.id} className="flex items-start gap-1.5">
              <button
                type="button"
                className="min-w-0 flex-1 rounded px-1 py-0.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => void focus(s)}
                data-tooltip="Chọn các cấu kiện của phiếu trên mô hình"
              >
                <span className="block truncate font-medium">{s.tieu_de}</span>
                <span className="flex flex-wrap items-center gap-1 text-2xs text-slate-500">
                  {s.trang_thai === 'da_ky' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden /> Đã ký
                    </>
                  ) : (
                    <>
                      <PenLine className="h-3 w-3" aria-hidden /> Nháp
                    </>
                  )}
                  {s.ket_luan && (
                    <span
                      className={
                        s.ket_luan === 'dat'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }
                    >
                      · {s.ket_luan === 'dat' ? 'Đạt' : 'Sai lệch'}
                    </span>
                  )}
                  <span>
                    · {s.global_ids.length} cấu kiện · {s.ngay ? s.ngay.split('-').reverse().join('/') : '—'}
                  </span>
                  {s.anh.length > 0 && <span>· {s.anh.length} ảnh</span>}
                  {s.la_demo && <span className="rounded bg-slate-100 px-1 dark:bg-slate-700">Mẫu</span>}
                </span>
              </button>
              {canEdit && s.trang_thai === 'nhap' && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Mở phiếu nháp"
                    className="text-slate-400 hover:text-primary-600"
                    onClick={() => {
                      setPhotos([]);
                      setForm({ ...s });
                    }}
                  >
                    <FilePen className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Xóa phiếu nháp"
                    className="text-slate-400 hover:text-rose-600"
                    onClick={() =>
                      void BimChecklistService.remove(s.id).then(refresh, (e) =>
                        addToast({ type: 'error', message: errorText(e) }),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
          {!shownSheets.length && <li className="text-2xs text-slate-500">Chưa có phiếu.</li>}
        </ul>
      </section>
    </div>
  );
};
