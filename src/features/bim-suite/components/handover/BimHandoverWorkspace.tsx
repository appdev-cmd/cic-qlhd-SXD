import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Closeout workspace of one project (tab "Bàn giao"): checks Phụ lục VII NĐ 207/2026, builds the ZIP (Excel index +
// Word report), stores it in bim-models ban-giao/{project}/ and records its SHA-256 in the package log.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, CircleDashed, Download, FileWarning, PackageCheck } from 'lucide-react';
import { useBimAccess } from '@/features/bim-suite/adapters/context';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useConfirm } from '@/features/bim-suite/adapters/ui';
import { BimHandoverPackageService, HandoverNotInstalledError } from '../../services/BimHandoverPackageService';
import {
  ASSET_FIELDS,
  HANDOVER_BASIS,
  PHAN_LABELS,
  STATUS_LABELS,
  assetCompleteness,
  checklistTotals,
  evaluateHandover,
  itemQualifier,
  type HandoverData,
  type ItemStatus,
} from '../../lib/handoverChecklist';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const card = 'rounded-2xl border border-border bg-bg-surface dark:border-slate-700 dark:bg-slate-800';
const STATUS_STYLE: Record<ItemStatus, { icon: React.ElementType; cls: string }> = {
  du: { icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-300' },
  chua_du: { icon: FileWarning, cls: 'text-amber-700 dark:text-amber-300' },
  chua_co: { icon: CircleDashed, cls: 'text-slate-500 dark:text-slate-400' },
};
const size = (b: number) => (b > 1e6 ? `${formatNumber(b / 1e6, 1)} MB` : `${formatNumber(Math.round(b / 1e3), 2)} kB`);
const dataKey = (p: string) => ['bim-ban-giao-du-lieu', p] as const;
const logKey = (p: string) => ['bim-ban-giao-so', p] as const;

export interface BimHandoverWorkspaceProps {
  projectId: string;
  /** Fallback name when the gathered data has none. */
  projectName?: string;
}

export function BimHandoverWorkspace({ projectId, projectName }: BimHandoverWorkspaceProps) {
  const { canWrite } = useBimAccess();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: dataKey(projectId),
    queryFn: () => BimHandoverPackageService.data(projectId),
    enabled: !!projectId,
    retry: false,
  });
  const history = useQuery({
    queryKey: logKey(projectId),
    queryFn: () => BimHandoverPackageService.list(projectId),
    enabled: !!projectId,
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const source = useMemo<HandoverData | null>(
    () =>
      data.data ? { ...data.data, du_an: { id: projectId, ten: data.data.du_an?.ten ?? projectName ?? null } } : null,
    [data.data, projectId, projectName],
  );
  const checklist = useMemo(() => (source ? evaluateHandover(source) : []), [source]);
  const totals = checklistTotals(checklist);
  const assets = useMemo(() => source?.tai_san ?? [], [source]);
  const comp = useMemo(() => assetCompleteness(assets), [assets]);

  const build = async (publish: boolean) => {
    if (!source) return;
    if (
      publish &&
      !(await confirm({
        title: 'Lập và lưu gói bàn giao',
        message: `Gói được lưu vào kho mô hình của dự án và ghi vào sổ gói bàn giao kèm mã SHA-256; sổ không sửa, không xóa được. Hiện có ${totals.du}/${checklist.length} thành phần đủ.`,
        confirmText: 'Lập và lưu',
        variant: 'info',
      }))
    )
      return;
    setBusy(publish ? 'Đang lập và lưu gói…' : 'Đang lập gói…');
    try {
      const { buildHandoverPackage, downloadHandoverPackage } = await import('../../lib/handoverPackage');
      const pkg = await buildHandoverPackage(source);
      if (publish) {
        await BimHandoverPackageService.publish(projectId, pkg);
        void qc.invalidateQueries({ queryKey: logKey(projectId) });
        addToast({ type: 'success', message: `Đã lưu gói bàn giao. SHA-256 ${pkg.sha256.slice(0, 16)}…` });
      } else {
        downloadHandoverPackage(pkg);
      }
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const download = async (path: string | null | undefined) => {
    if (!path) return addToast({ type: 'info', message: 'Tệp của gói không còn trong kho.' });
    try {
      window.open(await BimHandoverPackageService.downloadUrl(path), '_blank', 'noopener');
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };

  return (
    <div className="space-y-3" aria-label="Gói bàn giao">
      <div className={`${card} flex flex-wrap items-center gap-2 p-3`}>
        <PackageCheck className="h-5 w-5 text-primary-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt-primary dark:text-white">Gói hồ sơ bàn giao</div>
          <div className="text-2xs text-txt-muted">{HANDOVER_BASIS}</div>
        </div>
        <button type="button" className={btn} disabled={!source || !!busy} onClick={() => void build(false)}>
          <Download className="h-3 w-3" aria-hidden /> Tải ZIP về máy
        </button>
        {canWrite && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1 text-2xs font-bold text-white disabled:opacity-40"
            disabled={!source || !!busy}
            onClick={() => void build(true)}
          >
            <Archive className="h-3 w-3" aria-hidden /> Lập gói, lưu vào sổ
          </button>
        )}
      </div>
      {busy && (
        <p role="status" className="text-xs text-txt-secondary">
          {busy}
        </p>
      )}
      {data.isLoading && (
        <p role="status" className="text-xs text-txt-muted">
          Đang gom dữ liệu bàn giao…
        </p>
      )}
      {data.error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {errorText(data.error)}
          {data.error instanceof HandoverNotInstalledError ? '' : ' Thử tải lại trang.'}
        </p>
      )}

      {source && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {(['du', 'chua_du', 'chua_co'] as const).map((k) => {
              const S = STATUS_STYLE[k];
              return (
                <div key={k} className={`${card} p-2`}>
                  <div className={`flex items-center gap-1 text-2xs font-semibold ${S.cls}`}>
                    <S.icon className="h-3.5 w-3.5" aria-hidden /> {STATUS_LABELS[k]}
                  </div>
                  <div className="text-xl font-bold tabular-nums text-txt-primary dark:text-white">
                    {totals[k]}
                    <span className="text-xs font-normal text-txt-muted"> / {checklist.length}</span>
                  </div>
                </div>
              );
            })}
            <div className={`${card} p-2`}>
              <div className="text-2xs font-semibold text-txt-secondary">Bắt buộc còn thiếu</div>
              <div className="text-xl font-bold tabular-nums text-txt-primary dark:text-white">
                {totals.bat_buoc_thieu}
              </div>
            </div>
          </div>
          <p className="text-2xs text-txt-muted">
            &quot;Đủ&quot; khi có tài liệu gắn mục Phụ lục VII trong CDE đã phát hành (mã A1–A5 hoặc CR), hoặc mọi biên
            bản nghiệm thu của mục đã kết luận đạt. Gắn mục cho tài liệu ở Hồ sơ tài liệu › Trạng thái CDE. Mục
            &quot;nếu có&quot; hoặc có điều kiện mà không áp dụng thì chủ đầu tư ghi lý do.
          </p>

          <div className={`${card} overflow-x-auto`}>
            <BimTable className="w-full min-w-[720px] text-xs">
              <caption className="sr-only">Đối chiếu Phụ lục VII</caption>
              <thead>
                <tr className="border-b border-border text-left text-2xs text-txt-muted dark:border-slate-700">
                  <th className="p-2 font-medium">Mục</th>
                  <th className="p-2 font-medium">Thành phần hồ sơ</th>
                  <th className="p-2 font-medium">Trạng thái</th>
                  <th className="p-2 font-medium">Căn cứ trong hệ thống</th>
                </tr>
              </thead>
              <tbody>
                {(['I', 'II', 'III'] as const).map((ph) => (
                  <React.Fragment key={ph}>
                    <tr>
                      <td colSpan={4} className="bg-bg-subtle px-2 py-1 text-2xs font-semibold dark:bg-slate-900">
                        {PHAN_LABELS[ph]}
                      </td>
                    </tr>
                    {checklist
                      .filter((r) => r.phan === ph)
                      .map((r) => {
                        const S = STATUS_STYLE[r.trang_thai];
                        const q = itemQualifier(r);
                        return (
                          <tr
                            key={r.ma}
                            className="border-b border-border align-top last:border-0 dark:border-slate-700"
                          >
                            <td className="p-2 font-mono tabular-nums">{r.ma}</td>
                            <td className="p-2">
                              {r.noi_dung}
                              {q && <span className="text-txt-muted"> {q}</span>}
                            </td>
                            <td className={`whitespace-nowrap p-2 font-semibold ${S.cls}`}>
                              <span className="inline-flex items-center gap-1">
                                <S.icon className="h-3.5 w-3.5" aria-hidden /> {STATUS_LABELS[r.trang_thai]}
                              </span>
                            </td>
                            <td className="p-2 text-txt-secondary">
                              {r.can_cu.length ? r.can_cu.map((c) => <div key={c}>{c}</div>) : 'chưa có'}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                ))}
              </tbody>
            </BimTable>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className={`${card} p-3 text-xs`} aria-label="Độ đầy đủ dữ liệu tài sản">
              <div className="mb-1 font-semibold">
                Dữ liệu tài sản: {assets.length} tài sản, đầy đủ trung bình {Math.round(comp.mean * 100)}%
              </div>
              <ul className="space-y-0.5">
                {comp.byField.map((f) => (
                  <li key={String(f.key)} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-txt-secondary">{f.label}</span>
                    <span
                      className="h-2 rounded-r bg-primary-600"
                      style={{ width: `${assets.length ? Math.max(2, (f.filled / assets.length) * 160) : 2}px` }}
                      aria-hidden
                    />
                    <span className="tabular-nums">
                      {f.filled}/{assets.length}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-2xs text-txt-muted">
                {ASSET_FIELDS.length} trường thông tin bàn giao vận hành (rút gọn theo kiểu COBie).
              </p>
            </section>
            <section className={`${card} p-3 text-xs`} aria-label="Sổ gói bàn giao">
              <div className="mb-1 font-semibold">Sổ gói đã lập ({history.data?.length ?? 0})</div>
              {history.error && (
                <p role="alert" className="text-rose-600">
                  {errorText(history.error)}
                </p>
              )}
              <ul className="space-y-1.5">
                {(history.data ?? []).map((g) => (
                  <li key={g.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.ten}</div>
                      <div className="text-2xs text-txt-muted">
                        {formatDateTime(new Date(g.created_at))} · {size(g.kich_thuoc)} · {g.so_du}/{g.so_muc} mục đủ ·{' '}
                        {g.so_thieu} mục chưa có
                      </div>
                      <div
                        className="break-all font-mono text-2xs text-txt-secondary"
                        data-tooltip="SHA-256 của tệp ZIP"
                      >
                        {g.sha256}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => void download(g.duong_dan)}
                      aria-label={`Tải ${g.ten}`}
                    >
                      <Download className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
                {!history.data?.length && !history.error && <li className="text-txt-muted">Chưa lập gói nào.</li>}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
