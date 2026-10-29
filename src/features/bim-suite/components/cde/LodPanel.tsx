import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// LOD 500 trong "Kiểm tra mô hình": ô kết quả, nút đánh giá / nhập sổ xác minh (Excel .xlsx hoặc CSV), chi tiết 4 tiêu chí.
// Tiêu chí hồ sơ tài sản thiết bị của cic-hud có lại cùng mô-đun Tài sản (B7).
import React, { useRef } from 'react';
import { CheckCircle2, Download, Upload, XCircle } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useLodActions } from '../../hooks/useBimLod';
import type { LodResult } from '../../services/BimLodService';
import { LOD_TEMPLATE_HEADERS, parseVerificationSheet } from '../../lib/lod500';
import { downloadTemplate, readFirstSheet } from '../../lib/planImport';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number) => formatNumber(Number(v), 1);
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

/** Nhãn kết quả LOD 500: biểu tượng + chữ, không dựa riêng vào màu. */
export const LodBadge: React.FC<{ result?: LodResult; error?: unknown }> = ({ result, error }) => {
  if (error)
    return (
      <span className="text-2xs text-txt-muted" data-tooltip={errorText(error)}>
        Chưa cài
      </span>
    );
  if (!result) return <span className="text-2xs text-txt-muted">Chưa đánh giá</span>;
  const Icon = result.dat ? CheckCircle2 : XCircle;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-2xs font-semibold ${result.dat ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}
      >
        <Icon className="h-3 w-3" aria-hidden /> {result.dat ? 'Đạt LOD 500' : 'Chưa đạt'}
      </span>
    </span>
  );
};

/** Nút đánh giá và nhập sổ xác minh hiện trường cho một mô hình. */
export const LodActions: React.FC<{ modelId: string; label: string; canWrite: boolean; evaluated: boolean }> = ({
  modelId,
  label,
  canWrite,
  evaluated,
}) => {
  const { addToast } = useToast();
  const { evaluate, importRows } = useLodActions();
  const input = useRef<HTMLInputElement>(null);
  const run = () =>
    void evaluate.mutateAsync(modelId).then(
      (r) =>
        addToast({ type: r.dat ? 'success' : 'info', message: `${label}: ${r.dat ? 'đạt' : 'chưa đạt'} LOD 500.` }),
      (e) => addToast({ type: 'error', message: errorText(e) }),
    );
  const onFile = async (file: File) => {
    try {
      const parsed = parseVerificationSheet(await readFirstSheet(file));
      if (!parsed.rows.length)
        return addToast({ type: 'error', message: parsed.warnings[0] ?? 'Tệp không có phiếu hợp lệ.' });
      const n = await importRows.mutateAsync({ modelId, rows: parsed.rows });
      const skipped = parsed.warnings.length
        ? ` ${parsed.warnings.length} cảnh báo: ${parsed.warnings.slice(0, 2).join(' ')}`
        : '';
      addToast({
        type: parsed.warnings.length ? 'info' : 'success',
        message: `Đã nhập ${fmt(n)} phiếu xác minh.${skipped}`,
      });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  return (
    <>
      <button
        type="button"
        className={btn}
        disabled={evaluate.isPending}
        onClick={run}
        data-tooltip="Đánh giá LOD 500 theo sổ xác minh hiện trường"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden /> {evaluated ? 'LOD 500 lại' : 'LOD 500'}
      </button>
      {canWrite && (
        <>
          <BimInput
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label={`Tệp sổ xác minh ${label}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onFile(f);
            }}
          />
          <button
            type="button"
            className={btn}
            disabled={importRows.isPending}
            onClick={() => input.current?.click()}
            data-tooltip="Nhập sổ xác minh hiện trường (Excel .xlsx hoặc CSV)"
          >
            <Upload className="h-3 w-3" aria-hidden /> Xác minh
          </button>
        </>
      )}
    </>
  );
};

export const LodTemplateButton: React.FC = () => (
  <button
    type="button"
    className={btn}
    onClick={() =>
      void downloadTemplate('mau-so-xac-minh-hien-truong.xlsx', LOD_TEMPLATE_HEADERS, [
        ['2O2Fr$t4X7Zf8NOew3FLOH', 'Đạt', '20/10/2026', 'TVGS', 'Quét laser', 8, 20, 'BB-NT-012', ''],
        ['3cUkl32yn9qRSPvBJVyWYp', 'Ngoài phạm vi', '', '', '', '', '', '', 'Khối bối cảnh, không thuộc công trình'],
      ])
    }
  >
    <Download className="h-3 w-3" aria-hidden /> Mẫu sổ xác minh
  </button>
);

/** Chi tiết 4 tiêu chí LOD 500 của lần đánh giá mới nhất. */
export const LodDetail: React.FC<{ result: LodResult }> = ({ result }) => (
  <section
    className="rounded-xl border border-border bg-bg-surface p-2 dark:border-slate-600 dark:bg-slate-800"
    aria-label="Đánh giá LOD 500"
  >
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-txt-primary dark:text-white">
        LOD 500 · mô hình hoàn công đã xác minh hiện trường
      </span>
      <span className="text-2xs text-txt-muted">
        {fmt(result.so_trong_pham_vi)} cấu kiện trong phạm vi · {fmt(result.so_ngoai_pham_vi)} ngoài phạm vi có lý do ·{' '}
        {formatDateTime(new Date(result.created_at))}
      </span>
    </div>
    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
      {result.tieu_chi.map((t) => {
        const pass = t.ty_le !== null && t.ty_le >= t.nguong;
        return (
          <li
            key={t.ma}
            className="rounded-lg border border-border/70 p-1.5 text-2xs dark:border-slate-700"
            data-tooltip={t.mo_ta}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-txt-secondary dark:text-slate-300">{t.ten}</span>
              {pass ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Đạt" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-rose-600" aria-label="Chưa đạt" />
              )}
            </div>
            <div className="font-mono tabular-nums text-txt-primary dark:text-white">
              {t.ty_le === null ? (
                <span className="font-sans text-txt-muted">Chưa có dữ liệu</span>
              ) : (
                `${fmt(t.ty_le)}%`
              )}
              <span className="text-txt-muted"> / ≥{t.nguong}%</span>
            </div>
            {t.ma === 'dung_sai' && !!t.so_sai_lech && (
              <div className="text-rose-700 dark:text-rose-300">{fmt(t.so_sai_lech)} phiếu sai lệch</div>
            )}
            {t.ma === 'xac_minh' && !!t.guid_chua_xac_minh?.length && !pass && (
              <div className="truncate text-txt-muted" data-tooltip={t.guid_chua_xac_minh.join(', ')}>
                Chưa xác minh, ví dụ: {t.guid_chua_xac_minh.slice(0, 2).join(', ')}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  </section>
);
