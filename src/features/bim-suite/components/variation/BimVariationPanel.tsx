import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Change orders of the project contracts linked to elements: colour elements per change order, attach the selection,
// propose a change order, approve or reject (project managers, not the proposer).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Eye, EyeOff, FilePlus2, Link2, MousePointerClick, Trash2 } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimColorGroup, BimViewerRef } from '../../viewer/types';
import {
  BimVariationService,
  CHANGE_ORDER_STATUS,
  type VariationItem,
  type VariationLink,
} from '../../services/BimVariationService';
import {
  contractTotals,
  defaultContract,
  formatMoneyShort,
  formatPercent,
  variationColor,
} from '../../lib/variationSummary';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-2xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const NO_ITEMS: VariationItem[] = [];
const NEW_VO = { noi_dung: '', gia_tri: '', ngay: '' };

export const BimVariationPanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  canEdit: boolean;
  canManage?: boolean;
  className?: string;
}> = ({ projectId, viewerRef, canEdit, canManage = false, className = '' }) => {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ['bim-phat-sinh', projectId],
    queryFn: () => BimVariationService.summary(projectId),
    retry: false,
  });
  const links = useQuery({
    queryKey: ['bim-phat-sinh-lien-ket', projectId],
    queryFn: () => BimVariationService.links(projectId),
    retry: false,
  });
  const [contractId, setContractId] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof NEW_VO | null>(null);
  const [busy, setBusy] = useState(false);
  const colored = useRef(false); // chỉ xóa màu do panel này tô, không đụng chế độ màu khác của trình xem

  const contracts = summary.data ?? [];
  const contract = contracts.find((c) => c.ma_hop_dong === contractId) ?? defaultContract(contracts);
  const totals = contract ? contractTotals(contract) : null;
  const items = contract?.phu_luc ?? NO_ITEMS;
  const linksOf = useMemo(() => {
    const m = new Map<string, VariationLink[]>();
    for (const l of links.data ?? []) m.set(l.ma_vo, [...(m.get(l.ma_vo) ?? []), l]);
    return m;
  }, [links.data]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bim-phat-sinh', projectId] });
    void qc.invalidateQueries({ queryKey: ['bim-phat-sinh-lien-ket', projectId] });
  };

  // Tô màu các phụ lục đang bật; mỗi phụ lục giữ màu theo vị trí của nó trong hợp đồng
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || (!shown.size && !colored.current)) return;
    let cancelled = false;
    void (async () => {
      const groups: BimColorGroup[] = [];
      for (const [i, vo] of items.entries()) {
        if (!shown.has(vo.ma_vo)) continue;
        const color = variationColor(i) ?? '#64748b';
        for (const l of linksOf.get(vo.ma_vo) ?? []) {
          const guids = l.global_ids.length
            ? l.global_ids
            : l.tang
              ? await BimVariationService.storeyGuids(l.model_id, l.tang)
              : [];
          const ids = (await viewer.mapGuidsToIds(l.model_id, guids)).filter((x): x is number => x !== null);
          if (ids.length) groups.push({ modelId: l.model_id, color, ids });
        }
      }
      if (cancelled) return;
      colored.current = groups.length > 0;
      await viewer.colorize(groups.length ? groups : null);
    })().catch((e) => addToast({ type: 'error', message: errorText(e) }));
    return () => {
      cancelled = true;
    };
  }, [shown, items, linksOf, viewerRef, addToast]);
  useEffect(
    () => () => {
      if (colored.current) void viewerRef.current?.colorize(null);
    },
    [viewerRef],
  );

  const toggle = (ma: string) =>
    setShown((s) => {
      const n = new Set(s);
      if (n.has(ma)) n.delete(ma);
      else n.add(ma);
      return n;
    });
  const attachSelection = async (vo: VariationItem) => {
    const viewer = viewerRef.current;
    const sel = viewer?.getSelection() ?? [];
    if (!viewer || !sel.length)
      return addToast({ type: 'info', message: 'Chọn một hoặc nhiều cấu kiện trên mô hình trước.' });
    setBusy(true);
    try {
      const byModel = new Map<string, number[]>();
      for (const s of sel) byModel.set(s.modelId, [...(byModel.get(s.modelId) ?? []), s.expressId]);
      let n = 0;
      for (const [modelId, ids] of byModel) {
        const brief = await viewer.getItemsBrief(modelId, ids);
        const guids = ids.map((id) => brief[id]?.guid).filter((g): g is string => !!g);
        if (!guids.length) continue;
        await BimVariationService.attach(vo.ma_vo, modelId, guids, null, null);
        n += guids.length;
      }
      refresh();
      setShown((s) => new Set(s).add(vo.ma_vo));
      addToast({ type: 'success', message: `Đã gắn ${n} cấu kiện vào ${vo.so}.` });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const createVo = async () => {
    if (!contract || !draft) return;
    const value = Number(draft.gia_tri.replace(/[.\s]/g, '').replace(',', '.'));
    if (!draft.noi_dung.trim() || !Number.isFinite(value))
      return addToast({ type: 'info', message: 'Nhập nội dung và giá trị điều chỉnh (đồng, có thể âm).' });
    setBusy(true);
    try {
      await BimVariationService.create(projectId, contract.ma_hop_dong, {
        tieu_de: draft.noi_dung.trim(),
        gia_tri: value,
        ngay: Number(draft.ngay) || 0,
      });
      setDraft(null);
      refresh();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (vo: VariationItem, approve: boolean) => {
    const reason = approve ? null : window.prompt(`Lý do từ chối ${vo.so}`)?.trim();
    if (!approve && !reason) return;
    setBusy(true);
    try {
      await BimVariationService.decide(vo.ma_vo, approve, reason ?? null);
      refresh();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const error = summary.error ?? links.error;
  const maxBar = totals ? Math.max(totals.duKien, totals.goc, 1) : 1;
  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-slate-700 dark:text-slate-200 ${className}`}
      aria-label="Phát sinh gắn cấu kiện"
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
        <FilePlus2 className="h-4 w-4 text-primary-600" aria-hidden /> Lệnh thay đổi theo hợp đồng
      </div>
      {error && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {errorText(error)}
        </p>
      )}
      {summary.isSuccess && !contracts.length && (
        <p className="text-2xs text-slate-500">Dự án chưa có hợp đồng. Lập hợp đồng và BOQ ở tab Chi phí.</p>
      )}

      {contract && totals && (
        <section
          className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
          aria-label="Tổng hợp hợp đồng"
        >
          {contracts.length > 1 && (
            <BimSelect
              className={field}
              value={contract.ma_hop_dong}
              onChange={(e) => setContractId(e.target.value)}
              aria-label="Hợp đồng"
            >
              {contracts.map((c) => (
                <option key={c.ma_hop_dong} value={c.ma_hop_dong}>
                  {c.ten_hop_dong}
                </option>
              ))}
            </BimSelect>
          )}
          {contracts.length === 1 && <p className="truncate font-medium">{contract.ten_hop_dong}</p>}
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <div>
              <dt className="text-2xs text-slate-500">Giá trị gốc</dt>
              <dd className="font-semibold tabular-nums">{formatMoneyShort(totals.goc)}</dd>
            </div>
            <div>
              <dt className="text-2xs text-slate-500">Sau điều chỉnh (đã duyệt)</dt>
              <dd className="font-semibold tabular-nums">{formatMoneyShort(totals.sauDieuChinh)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-2xs text-slate-500">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden /> Thay đổi đã duyệt
              </dt>
              <dd className="tabular-nums">
                {formatMoneyShort(totals.daKy)} · {formatPercent(totals.tyLeDaKy)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-2xs text-slate-500">
                <Clock3 className="h-3 w-3 text-amber-600" aria-hidden /> Chờ duyệt
              </dt>
              <dd className="tabular-nums">{formatMoneyShort(totals.chuaKy)}</dd>
            </div>
          </dl>
          {/* Thanh: gốc | đã ký | chưa ký (vân chéo) — so với giá trị dự kiến nếu ký hết */}
          <div
            className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded"
            role="img"
            aria-label={`Gốc ${formatMoneyShort(totals.goc)}, đã duyệt ${formatMoneyShort(totals.daKy)}, chờ duyệt ${formatMoneyShort(totals.chuaKy)}`}
          >
            <span
              className="h-full bg-slate-300 dark:bg-slate-600"
              style={{ width: `${(totals.goc / maxBar) * 100}%` }}
            />
            {totals.daKy > 0 && (
              <span className="h-full min-w-[3px] bg-[#2a78d6]" style={{ width: `${(totals.daKy / maxBar) * 100}%` }} />
            )}
            {totals.chuaKy > 0 && (
              <span
                className="h-full min-w-[3px] bg-[repeating-linear-gradient(45deg,#2a78d6_0_2px,transparent_2px_5px)] opacity-70"
                style={{ width: `${(totals.chuaKy / maxBar) * 100}%` }}
              />
            )}
          </div>
          <p className="text-2xs text-slate-500">
            Dự kiến nếu duyệt hết: {formatMoneyShort(totals.duKien)} ({formatPercent(totals.tyLeDuKien)} so với gốc).
            Giá trị gốc là tổng BOQ của hợp đồng; tham khảo cạnh dự toán 5D, không thay thế quyết toán.
          </p>
        </section>
      )}

      {contract && (
        <section
          className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"
          aria-label="Danh sách lệnh thay đổi"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold">Lệnh thay đổi ({items.length})</span>
            <span className="flex gap-1">
              {items.length > 0 && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => setShown(shown.size ? new Set() : new Set(items.map((v) => v.ma_vo)))}
                >
                  {shown.size ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}{' '}
                  {shown.size ? 'Bỏ tô' : 'Tô tất cả'}
                </button>
              )}
              {canEdit && !draft && contract.trang_thai === 'da_ky' && (
                <button type="button" className={btn} onClick={() => setDraft({ ...NEW_VO })}>
                  <FilePlus2 className="h-3 w-3" aria-hidden /> Đề xuất thay đổi
                </button>
              )}
            </span>
          </div>
          {draft && (
            <div
              className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-1.5 dark:bg-slate-900"
              aria-label="Lệnh thay đổi mới"
            >
              <label className="text-2xs">
                Kéo dài (ngày)
                <BimInput
                  className={field}
                  inputMode="numeric"
                  value={draft.ngay}
                  onChange={(e) => setDraft({ ...draft, ngay: e.target.value })}
                />
              </label>
              <label className="text-2xs">
                Giá trị điều chỉnh (đồng)
                <BimInput
                  className={field}
                  inputMode="numeric"
                  value={draft.gia_tri}
                  onChange={(e) => setDraft({ ...draft, gia_tri: e.target.value })}
                />
              </label>
              <label className="col-span-2 text-2xs">
                Nội dung
                <BimInput
                  className={field}
                  value={draft.noi_dung}
                  onChange={(e) => setDraft({ ...draft, noi_dung: e.target.value })}
                />
              </label>
              <span className="col-span-2 flex items-end gap-1">
                <button type="button" className={btn} onClick={() => setDraft(null)}>
                  Hủy
                </button>
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary-600 px-2 py-1 text-2xs font-bold text-white disabled:opacity-40"
                  disabled={busy}
                  onClick={() => void createVo()}
                >
                  Gửi đề xuất
                </button>
              </span>
            </div>
          )}
          <ul className="space-y-1">
            {items.map((vo, i) => {
              const color = variationColor(i);
              const on = shown.has(vo.ma_vo);
              const ls = linksOf.get(vo.ma_vo) ?? [];
              return (
                <li key={vo.ma_vo} className="rounded-lg border border-slate-100 p-1.5 dark:border-slate-800">
                  <div className="flex items-start gap-1.5">
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? 'Bỏ tô' : 'Tô'} ${vo.so} trên mô hình`}
                      onClick={() => toggle(vo.ma_vo)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[4px] border-2"
                      style={{ borderColor: color ?? '#64748b', background: on ? (color ?? '#64748b') : 'transparent' }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setOpen(open === vo.ma_vo ? null : vo.ma_vo)}
                    >
                      <span className="block font-medium">
                        {vo.so} · <span className="tabular-nums">{formatMoneyShort(vo.gia_tri)}</span>
                      </span>
                      <span className="block truncate text-2xs text-slate-500">{vo.noi_dung}</span>
                      <span className="flex flex-wrap items-center gap-1 text-2xs text-slate-500">
                        {vo.trang_thai === 'da_duyet' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden />
                        ) : (
                          <Clock3 className="h-3 w-3 text-amber-600" aria-hidden />
                        )}{' '}
                        {CHANGE_ORDER_STATUS[vo.trang_thai]}
                        <span>
                          · <Link2 className="inline h-3 w-3" aria-hidden />{' '}
                          {vo.so_lien_ket ? `${vo.so_lien_ket} liên kết` : 'chưa gắn'}
                        </span>
                        {vo.thoi_gian ? <span>· +{vo.thoi_gian} ngày</span> : null}
                      </span>
                    </button>
                  </div>
                  {open === vo.ma_vo && (
                    <div className="mt-1 space-y-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                      {ls.map((l) => (
                        <div key={l.id} className="flex items-center gap-1 text-2xs">
                          <span className="min-w-0 flex-1 truncate">
                            {l.model_id} · {l.global_ids.length ? `${l.global_ids.length} cấu kiện` : `tầng ${l.tang}`}
                            {l.ghi_chu ? ` · ${l.ghi_chu}` : ''}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              aria-label="Gỡ liên kết"
                              className="text-slate-400 hover:text-rose-600"
                              onClick={() =>
                                void BimVariationService.detach(l.id).then(refresh, (e) =>
                                  addToast({ type: 'error', message: errorText(e) }),
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {!ls.length && <p className="text-2xs text-slate-500">Chưa gắn cấu kiện nào.</p>}
                      {canManage && vo.trang_thai === 'de_xuat' && (
                        <span className="flex gap-1">
                          <button type="button" className={btn} disabled={busy} onClick={() => void decide(vo, true)}>
                            Duyệt
                          </button>
                          <button type="button" className={btn} disabled={busy} onClick={() => void decide(vo, false)}>
                            Từ chối
                          </button>
                        </span>
                      )}
                      {canEdit && (
                        <button type="button" className={btn} disabled={busy} onClick={() => void attachSelection(vo)}>
                          <MousePointerClick className="h-3 w-3" aria-hidden /> Gắn vùng chọn vào {vo.so}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {!items.length && <li className="text-2xs text-slate-500">Hợp đồng chưa có lệnh thay đổi.</li>}
          </ul>
        </section>
      )}
    </div>
  );
};
