import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Periodic report (month / quarter / year) of one project from bim_bao_cao_ky: on screen, print window (In / PDF) and
// Word. Replaces cic-hud's cross-project corporate report.
import React, { useState } from 'react';
import { FileDown, FileText, Printer } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { BimFieldService } from '../../services/BimFieldService';
import {
  buildPeriodicReport,
  exportReportDocx,
  periodBounds,
  periodicReportFileName,
  reportHtml,
  type PeriodicReport,
  type ReportPeriod,
} from '../../lib/bimPeriodicReport';

const field =
  'rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const currentVn = () => {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    .format(new Date())
    .split('-')
    .map(Number);
  return { year: y, month: m };
};

export const BimPeriodicReport: React.FC<{ projectId: string; projectName?: string; className?: string }> = ({
  projectId,
  projectName,
  className = '',
}) => {
  const { addToast } = useToast();
  const [now] = useState(currentVn);
  const [period, setPeriod] = useState<ReportPeriod>({ kind: 'thang', year: now.year, index: now.month });
  const [report, setReport] = useState<PeriodicReport | null>(null);
  const [busy, setBusy] = useState(false);
  const years = Array.from({ length: 5 }, (_, i) => now.year - i);

  const build = async () => {
    setBusy(true);
    try {
      const { tu, den } = periodBounds(period);
      let data = null;
      let error: string | null = null;
      try {
        data = await BimFieldService.periodic(projectId, tu, den);
      } catch (e) {
        error = errorText(e);
      }
      setReport(buildPeriodicReport({ period, projectName: projectName || projectId, data, error }));
    } finally {
      setBusy(false);
    }
  };
  const print = () => {
    if (!report) return;
    const w = window.open('', '_blank');
    if (!w) return addToast({ type: 'error', message: 'Trình duyệt chặn cửa sổ in.' });
    w.document.write(reportHtml(report));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const word = async () => {
    if (!report) return;
    try {
      await exportReportDocx(report, periodicReportFileName(period));
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <label className="block text-xs font-semibold">
          Kỳ báo cáo
          <BimSelect
            value={period.kind}
            onChange={(e) => {
              setPeriod({ ...period, kind: e.target.value as ReportPeriod['kind'], index: 1 });
              setReport(null);
            }}
            className={`${field} mt-1 block`}
          >
            <option value="thang">Tháng</option>
            <option value="quy">Quý</option>
            <option value="nam">Năm</option>
          </BimSelect>
        </label>
        {period.kind !== 'nam' && (
          <label className="block text-xs font-semibold">
            {period.kind === 'thang' ? 'Tháng' : 'Quý'}
            <BimSelect
              value={period.index}
              onChange={(e) => {
                setPeriod({ ...period, index: Number(e.target.value) });
                setReport(null);
              }}
              className={`${field} mt-1 block`}
            >
              {Array.from({ length: period.kind === 'thang' ? 12 : 4 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {period.kind === 'thang' ? `Tháng ${i + 1}` : `Quý ${['I', 'II', 'III', 'IV'][i]}`}
                </option>
              ))}
            </BimSelect>
          </label>
        )}
        <label className="block text-xs font-semibold">
          Năm
          <BimSelect
            value={period.year}
            onChange={(e) => {
              setPeriod({ ...period, year: Number(e.target.value) });
              setReport(null);
            }}
            className={`${field} mt-1 block`}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </BimSelect>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void build()}
          className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden /> {busy ? 'Đang tổng hợp…' : 'Lập báo cáo'}
        </button>
        {report && (
          <>
            <button type="button" className={btn} onClick={print}>
              <Printer className="h-3 w-3" aria-hidden /> In / PDF
            </button>
            <button type="button" className={btn} onClick={() => void word()}>
              <FileDown className="h-3 w-3" aria-hidden /> Word
            </button>
          </>
        )}
      </div>
      {report && (
        <article
          className="space-y-3 rounded-2xl border border-border bg-bg-surface p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          aria-label={report.title}
        >
          <header className="text-center">
            <h2 className="text-sm font-black text-txt-primary dark:text-white">{report.title}</h2>
            <p className="text-2xs text-txt-muted">{report.subtitle}</p>
          </header>
          {report.tables.map((t) => (
            <section key={t.title} className="overflow-x-auto">
              <h3 className="mb-1 text-xs font-bold text-txt-primary dark:text-white">{t.title}</h3>
              <BimTable className="w-full text-xs">
                <thead className="text-left text-txt-secondary dark:text-slate-300">
                  <tr>
                    {t.headers.map((h) => (
                      <th key={h} className="px-2 py-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.length ? (
                    t.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60 dark:border-slate-700">
                        {r.map((c, j) => (
                          <td key={j} className="px-2 py-1">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={t.headers.length} className="px-2 py-1 text-txt-muted">
                        Không có dòng nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </BimTable>
              {t.note && <p className="mt-0.5 text-2xs italic text-txt-muted">{t.note}</p>}
            </section>
          ))}
        </article>
      )}
    </div>
  );
};
