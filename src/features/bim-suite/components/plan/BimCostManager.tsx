import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Project cost (ACC Cost): budget and contracts with BOQ and change orders, norms from the BuildSIA library mapped to
// unit prices, bid comparison, cash flow and EVM on the BIM schedule.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileUp, Lock, Printer, Search, Trash2 } from 'lucide-react';
import { Modal } from '@/features/bim-suite/adapters/ui';
import { useToast } from '@/features/bim-suite/adapters/toast';
import {
  useBids,
  useCashFlow,
  useEstimates,
  useEvmPeriods,
  useNorms,
  usePriceRows,
  useRefreshPlan,
} from '../../hooks/useBimPlan';
import { BimPlanService, type EvmResult } from '../../services/BimPlanService';
import { BimContractService } from '../../services/BimContractService';
import { downloadTemplate, parseBidSheet, readFirstSheet, type BidImportRow } from '../../lib/planImport';
import { compareBids } from '../../lib/bidCompare';
import { getIfcLabel } from '../../lib/ifcLabels';
import { BimContractsPanel } from '../cost/BimContractsPanel';

const NotInstalledNotice = ({ error }: { error: unknown }) => (
  <p
    role="alert"
    className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
  >
    {errorText(error)}
  </p>
);

type View = 'hop-dong' | 'dinh-muc' | 'du-thau' | 'dong-tien';
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : formatNumber(Math.round(Number(v)), 2);
const qty = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : formatNumber(Number(v), d));
const field =
  'rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function printTable(title: string, headers: string[], body: (string | number)[][], note?: string) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Inter,Arial,sans-serif;font-size:12px;margin:24px;color:#1d1c1c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f3f0e8}td.n{text-align:right;font-family:'JetBrains Mono',monospace}p{color:#555}</style></head><body><h1 style="font-size:16px">${esc(title)}</h1><p>Lập lúc ${esc(formatDateTime(new Date()))}</p><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td class="${typeof c === 'number' ? 'n' : ''}">${esc(typeof c === 'number' ? formatNumber(c, 2) : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${note ? `<p>${esc(note)}</p>` : ''}</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

function Norms({ project, canWrite }: { project: string; canWrite: boolean }) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const [search, setSearch] = useState('');
  const [book, setBook] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const norms = useNorms(search, book || undefined);
  const books = norms.data?.books ?? [];
  const prices = usePriceRows(project);
  const targetRow = prices.data?.find((p) => p.id === target) ?? null;
  const pick = (id: string, loai: string, vatLieu: string | null) => {
    setTarget(id);
    // The library search needs every word to match: the element name and the main material only.
    const material = vatLieu?.match(/bê tông|cốt thép|thép|gạch|ván khuôn|gỗ|kính|nhôm/i)?.[0] ?? '';
    setSearch(`${getIfcLabel(loai).split('/')[0].trim()} ${material}`.trim().toLocaleLowerCase('vi'));
  };
  const assign = (id: string, code: string | null) =>
    void BimPlanService.setPriceNorm(id, code).then(
      () => {
        refresh();
        setTarget(null);
        addToast({ type: 'success', message: code ? `Đã gắn mã ${code}.` : 'Đã bỏ mã định mức.' });
      },
      (e) => addToast({ type: 'error', message: errorText(e) }),
    );
  const items = norms.data?.items ?? [];

  return (
    <div className="space-y-3">
      <section className={card}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-txt-muted" aria-hidden />
            <BimInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã hoặc tên công tác"
              className={`${field} w-64 pl-7`}
              aria-label="Tìm định mức"
            />
          </label>
          <BimSelect
            aria-label="Bộ định mức"
            value={book || books[0]?.id || ''}
            onChange={(e) => setBook(e.target.value)}
            className={field}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </BimSelect>
          {targetRow && (
            <span className="rounded-lg bg-primary-50 px-2 py-1 text-2xs text-primary-800 dark:bg-primary-950 dark:text-primary-200">
              Đang chọn mã cho: {getIfcLabel(targetRow.loai_cau_kien)}
              {targetRow.vat_lieu ? ` · ${targetRow.vat_lieu}` : ''} ({targetRow.don_vi})
              <button type="button" className="ml-1 underline" onClick={() => setTarget(null)}>
                Bỏ
              </button>
            </span>
          )}
        </div>
        {norms.error ? (
          <NotInstalledNotice error={norms.error} />
        ) : !norms.isPending && !items.length ? (
          <p className="text-xs text-txt-secondary dark:text-slate-300">
            {search
              ? 'Không có định mức khớp trong bộ đang chọn.'
              : 'Nhập từ khóa để tra thư viện định mức của BuildSIA.'}
          </p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <BimTable className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-surface text-left text-txt-secondary dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="py-1.5 pr-2">Mã hiệu</th>
                  <th className="pr-2">Tên công tác</th>
                  <th className="pr-2">Đơn vị</th>
                  <th className="pr-2">Bộ</th>
                  <th className="pr-2 text-right">Hao phí</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id} className="border-t border-border/60 dark:border-slate-700">
                    <td className="py-1 pr-2 font-mono">{n.code}</td>
                    <td className="pr-2">{n.title}</td>
                    <td className="pr-2">{n.unit}</td>
                    <td className="pr-2">{n.book}</td>
                    <td className="pr-2 text-right font-mono">{n.resourceCount}</td>
                    <td className="whitespace-nowrap text-right">
                      {targetRow && canWrite && (
                        <button type="button" className={btn} onClick={() => assign(targetRow.id, n.id)}>
                          Gắn mã
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </BimTable>
          </div>
        )}
        <p className="mt-1 text-2xs text-txt-muted">
          Thư viện định mức dùng chung của BuildSIA (TT 38/2026, TT 12/2021). Mã gắn kèm bộ định mức, ví dụ
          tt38-xd:AF.22212.
        </p>
      </section>
      <section className={card}>
        <h3 className="mb-2 text-sm font-bold text-txt-primary dark:text-white">Gắn mã định mức cho đơn giá dự án</h3>
        {prices.error ? (
          <NotInstalledNotice error={prices.error} />
        ) : !(prices.data ?? []).length ? (
          <p className="text-xs text-txt-secondary dark:text-slate-300">
            Dự án chưa có đơn giá. Nhập đơn giá ở trình xem → Khối lượng → Đơn giá.
          </p>
        ) : (
          <BimTable className="w-full text-xs">
            <thead className="text-left text-txt-secondary dark:text-slate-300">
              <tr>
                <th className="py-1.5 pr-2">Loại cấu kiện</th>
                <th className="pr-2">Vật liệu</th>
                <th className="pr-2">Đơn vị</th>
                <th className="pr-2 text-right">Đơn giá</th>
                <th className="pr-2">Mã định mức</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(prices.data ?? []).map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-border/60 align-top dark:border-slate-700 ${target === p.id ? 'bg-primary-50/40 dark:bg-primary-950' : ''}`}
                >
                  <td className="py-1 pr-2">
                    {getIfcLabel(p.loai_cau_kien)}{' '}
                    <span className="font-mono text-2xs text-txt-muted">{p.loai_cau_kien}</span>
                  </td>
                  <td className="pr-2">{p.vat_lieu || '—'}</td>
                  <td className="pr-2">{p.don_vi}</td>
                  <td className="pr-2 text-right font-mono">{money(p.don_gia)}</td>
                  <td className="pr-2 font-mono">
                    {p.ma_dinh_muc || <span className="font-sans text-txt-muted">Chưa gắn</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {canWrite && (
                      <button type="button" className={btn} onClick={() => pick(p.id, p.loai_cau_kien, p.vat_lieu)}>
                        <Search className="h-3 w-3" aria-hidden /> Chọn mã
                      </button>
                    )}
                    {canWrite && p.ma_dinh_muc && (
                      <button type="button" className={`${btn} ml-1`} onClick={() => assign(p.id, null)}>
                        Bỏ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </BimTable>
        )}
      </section>
    </div>
  );
}

function Bids({ project, canWrite }: { project: string; canWrite: boolean }) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const [pack, setPack] = useState('');
  const [newPack, setNewPack] = useState('');
  const [bidder, setBidder] = useState('');
  const [pending, setPending] = useState<{ rows: BidImportRow[]; warnings: string[] } | null>(null);
  const bids = useBids(project || undefined);
  const packs = useMemo(() => [...new Set((bids.data ?? []).map((b) => b.goi_thau))], [bids.data]);
  const activePack = pack || packs[0] || '';
  const cmp = useMemo(
    () => compareBids((bids.data ?? []).filter((b) => b.goi_thau === activePack)),
    [bids.data, activePack],
  );
  const save = async () => {
    const target = (newPack || activePack).trim();
    if (!pending || !target || !bidder.trim()) return;
    try {
      const n = await BimPlanService.importBids(project, target, bidder, pending.rows);
      refresh();
      setPending(null);
      setBidder('');
      setNewPack('');
      setPack(target);
      addToast({ type: 'success', message: `Đã nhập ${n} dòng giá của ${bidder}.` });
    } catch (e) {
      addToast({ type: 'error', title: 'Không nhập được', message: errorText(e) });
    }
  };
  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {packs.length > 0 && (
          <BimSelect
            aria-label="Gói thầu"
            value={activePack}
            onChange={(e) => setPack(e.target.value)}
            className={field}
          >
            {packs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </BimSelect>
        )}
        {canWrite && project && (
          <>
            <BimInput
              value={newPack}
              onChange={(e) => setNewPack(e.target.value)}
              placeholder={packs.length ? 'hoặc gói thầu mới' : 'Tên gói thầu'}
              className={field}
              aria-label="Gói thầu mới"
            />
            <BimInput
              value={bidder}
              onChange={(e) => setBidder(e.target.value)}
              placeholder="Tên nhà thầu"
              className={field}
              aria-label="Nhà thầu"
            />
            <label className={`${btn} cursor-pointer`}>
              <FileUp className="h-3 w-3" aria-hidden /> Chọn tệp giá
              <BimInput
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setPending(parseBidSheet(await readFirstSheet(f)));
                  } catch (err) {
                    addToast({ type: 'error', message: errorText(err) });
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={btn}
              onClick={() =>
                void downloadTemplate('mau-gia-du-thau.csv', [
                  'STT',
                  'Mã hiệu',
                  'Tên công việc',
                  'Đơn vị',
                  'Khối lượng',
                  'Đơn giá',
                ])
              }
            >
              <Download className="h-3 w-3" aria-hidden /> Tệp mẫu
            </button>
          </>
        )}
      </div>
      {pending && (
        <div className={`${card} text-xs`}>
          <p>
            Tệp có {pending.rows.length} dòng.{' '}
            {pending.warnings.length
              ? `${pending.warnings.length} cảnh báo: ${pending.warnings.slice(0, 3).join(' ')}`
              : ''}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!bidder.trim() || !(newPack || activePack).trim() || !pending.rows.length}
              onClick={() => void save()}
              className="rounded-xl bg-primary-600 px-3 py-1.5 font-bold text-white disabled:opacity-50"
            >
              Nhập cho {bidder || '…'} · {newPack || activePack || '…'}
            </button>
            <button type="button" className={btn} onClick={() => setPending(null)}>
              Bỏ
            </button>
          </div>
        </div>
      )}
      {bids.error ? (
        <NotInstalledNotice error={bids.error} />
      ) : !cmp.rows.length ? (
        <p className="text-xs text-txt-secondary dark:text-slate-300">
          Chưa có giá dự thầu. Nhập bảng giá của từng nhà thầu (Excel) để so sánh theo dòng.
        </p>
      ) : (
        <div className={`${card} overflow-x-auto p-0`}>
          <BimTable className="w-full min-w-[760px] text-xs">
            <thead className="text-left text-txt-secondary dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">Công việc</th>
                <th className="px-2 py-2">Đơn vị</th>
                {cmp.bidders.map((b) => (
                  <th key={b} className="px-2 py-2 text-right">
                    {b}
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Xóa giá của ${b}`}
                        className="ml-1 align-middle"
                        onClick={() =>
                          void BimPlanService.deleteBidder(project, activePack, b).then(refresh, (e) =>
                            addToast({ type: 'error', message: errorText(e) }),
                          )
                        }
                      >
                        <Trash2 className="inline h-3 w-3 text-rose-600" />
                      </button>
                    )}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Trung vị</th>
                <th className="px-3 py-2">Ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {cmp.rows.map((r) => (
                <tr key={r.key} className="border-t border-border/70 dark:border-slate-700">
                  <td className="px-3 py-1.5">
                    {r.ma_hieu && <span className="mr-1 font-mono text-2xs text-txt-muted">{r.ma_hieu}</span>}
                    {r.ten_cong_viec}
                  </td>
                  <td className="px-2 py-1.5">{r.don_vi ?? '—'}</td>
                  {cmp.bidders.map((b) => {
                    const off = r.lech.find((l) => l.nha_thau === b);
                    return (
                      <td
                        key={b}
                        className={`px-2 py-1.5 text-right font-mono tabular-nums ${off ? 'font-bold text-rose-700 dark:text-rose-300' : r.gia[b] === r.thap_nhat && r.gia[b] !== null ? 'text-emerald-700 dark:text-emerald-300' : ''}`}
                        data-tooltip={off ? `Lệch ${(off.ty_le * 100).toFixed(1)}% so với trung vị` : undefined}
                      >
                        {r.gia[b] === null ? '—' : money(r.gia[b])}
                        {off ? ` (${off.ty_le > 0 ? '+' : ''}${(off.ty_le * 100).toFixed(0)}%)` : ''}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{money(r.trung_vi)}</td>
                  <td className="px-3 py-1.5 text-2xs text-amber-800 dark:text-amber-200">
                    {[
                      r.khac_khoi_luong ? 'Khối lượng khác nhau' : '',
                      r.thieu.length ? `Thiếu: ${r.thieu.join(', ')}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold dark:border-slate-600">
                <td className="px-3 py-2" colSpan={2}>
                  Tổng (khối lượng × đơn giá)
                </td>
                {cmp.bidders.map((b) => (
                  <td key={b} className="px-2 py-2 text-right font-mono tabular-nums">
                    {money(cmp.tong[b])}
                    {cmp.dong_thieu[b] ? (
                      <span className="block text-2xs font-normal text-amber-700">
                        {cmp.dong_thieu[b]} dòng thiếu số
                      </span>
                    ) : null}
                  </td>
                ))}
                <td colSpan={2} />
              </tr>
            </tbody>
          </BimTable>
          <p className="border-t border-border px-3 py-1.5 text-2xs text-txt-muted dark:border-slate-700">
            Ghép dòng theo mã hiệu, thiếu mã thì theo tên công việc. Tô đỏ: đơn giá lệch quá 15% so với trung vị các nhà
            thầu; xanh: thấp nhất.
          </p>
        </div>
      )}
    </div>
  );
}

function MonthlyBars({ months }: { months: { thang: string; ke_hoach: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.ke_hoach));
  return (
    <div className="flex h-36 items-end gap-1 overflow-x-auto pb-5" role="img" aria-label="Giá trị kế hoạch theo tháng">
      {months.map((m) => (
        <div key={m.thang} className="group relative flex h-full min-w-[22px] flex-1 flex-col justify-end">
          <div
            className="rounded-t-[4px] bg-primary-600 dark:bg-primary-400"
            style={{ height: `${(m.ke_hoach / max) * 100}%` }}
            data-tooltip={`${m.thang}: ${money(m.ke_hoach)} đồng`}
          />
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-3xs text-txt-muted">
            {m.thang.slice(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CashAndEvm({ project, canWrite }: { project: string; canWrite: boolean }) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const [estimate, setEstimate] = useState('');
  const [date, setDate] = useState(today());
  const [ac, setAc] = useState('');
  const [acSource, setAcSource] = useState<'nhap_tay' | 'hop_dong'>('nhap_tay');
  const [result, setResult] = useState<EvmResult | null>(null);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const estimates = useEstimates(project || undefined);
  const cash = useCashFlow(estimate || undefined);
  const periods = useEvmPeriods(project || undefined);
  const acValue = ac.trim() === '' ? null : Number(ac.replace(/\./g, '').replace(',', '.'));
  const calc = async () => {
    try {
      setResult(await BimPlanService.evm(estimate, date, acValue));
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const fromContracts = async () => {
    try {
      const r = await BimContractService.acceptedValue(project);
      if (!r.contracts)
        return addToast({ type: 'info', message: 'Chưa có khối lượng nghiệm thu trên hợp đồng đã ký.' });
      setAc(String(Math.round(r.value)));
      setAcSource('hop_dong');
      addToast({
        type: 'info',
        message: `Giá trị nghiệm thu của ${r.contracts} hợp đồng đã ký (khối lượng nghiệm thu × đơn giá). Phạm vi hợp đồng có thể khác dự toán mô hình: kiểm tra trước khi chốt.`,
      });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const close = async () => {
    try {
      await BimPlanService.closePeriod(estimate, date, acValue, acSource, note);
      refresh();
      setClosing(false);
      setNote('');
      addToast({ type: 'success', message: `Đã chốt kỳ EVM ngày ${date}.` });
    } catch (e) {
      addToast({ type: 'error', title: 'Không chốt được kỳ', message: errorText(e) });
    }
  };
  const est = estimates.data?.find((e) => e.id === estimate);
  const metric = (labelText: string, value: React.ReactNode, warn?: boolean) => (
    <div className="rounded-xl border border-border p-2 dark:border-slate-600">
      <p className="text-2xs text-txt-secondary dark:text-slate-300">{labelText}</p>
      <p
        className={`font-mono text-sm font-bold tabular-nums ${warn ? 'text-rose-700 dark:text-rose-300' : 'text-txt-primary dark:text-white'}`}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {project && (
          <BimSelect
            aria-label="Dự toán"
            value={estimate}
            onChange={(e) => {
              setEstimate(e.target.value);
              setResult(null);
            }}
            className={field}
          >
            <option value="">
              {estimates.data?.length ? 'Chọn dự toán…' : 'Dự án chưa có dự toán BIM (lập ở trình xem → Khối lượng)'}
            </option>
            {estimates.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.status === 'approved' ? 'đã duyệt' : 'nháp'}
              </option>
            ))}
          </BimSelect>
        )}
      </div>
      {estimate &&
        (cash.error ? (
          <NotInstalledNotice error={cash.error} />
        ) : (
          cash.data && (
            <section className={card} aria-labelledby="bim-cash">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 id="bim-cash" className="text-sm font-bold text-txt-primary dark:text-white">
                  Dòng tiền kế hoạch · {est?.name}
                </h3>
                <button
                  type="button"
                  className={btn}
                  onClick={() =>
                    printTable(
                      `Dòng tiền kế hoạch · ${est?.name ?? ''}`,
                      ['Tháng', 'Kế hoạch (đồng)', 'Lũy kế (đồng)'],
                      cash.data!.thang.map((m) => [m.thang, Math.round(m.ke_hoach), Math.round(m.luy_ke_ke_hoach)]),
                      `Tổng dự toán ${money(cash.data!.bac)} đồng; chưa gắn công việc 4D ${money(cash.data!.chua_phan_bo)} đồng.`,
                    )
                  }
                >
                  <Printer className="h-3 w-3" aria-hidden /> PDF
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {metric('Tổng dự toán (BAC)', money(cash.data.bac))}
                {metric('Đã gắn công việc 4D', money(cash.data.phan_bo))}
                {metric(
                  'Chưa gắn công việc',
                  money(cash.data.chua_phan_bo),
                  cash.data.chua_phan_bo > cash.data.bac * 0.5,
                )}
                {metric(`PV đến ${cash.data.ngay}`, money(cash.data.pv_hom_nay))}
                {metric('EV hiện tại', money(cash.data.ev_hien_tai))}
              </div>
              {cash.data.thang.length ? (
                <div className="mt-3">
                  <MonthlyBars months={cash.data.thang} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-txt-muted">
                  Chưa có công việc 4D có ngày kế hoạch gắn với cấu kiện của dự toán.
                </p>
              )}
            </section>
          )
        ))}
      {estimate && (
        <section className={card} aria-labelledby="bim-evm">
          <h3 id="bim-evm" className="mb-2 text-sm font-bold text-txt-primary dark:text-white">
            Phân tích giá trị thu được (EVM)
          </h3>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="block">
              Ngày
              <BimInput
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className={`${field} mt-1 block`}
              />
            </label>
            <label className="block">
              Chi phí thực tế AC (đồng)
              <BimInput
                inputMode="numeric"
                value={ac}
                onChange={(e) => {
                  setAc(e.target.value);
                  setAcSource('nhap_tay');
                }}
                placeholder="Để trống nếu chưa có"
                className={`${field} mt-1 block w-44`}
              />
            </label>
            <button type="button" className={btn} onClick={() => void fromContracts()}>
              Gợi ý từ nghiệm thu hợp đồng
            </button>
            <button
              type="button"
              className="rounded-xl bg-primary-600 px-3 py-1.5 font-bold text-white"
              onClick={() => void calc()}
            >
              Tính
            </button>
            {canWrite && result && (
              <button type="button" className={btn} onClick={() => setClosing(true)}>
                <Lock className="h-3 w-3" aria-hidden /> Chốt kỳ
              </button>
            )}
          </div>
          {acSource === 'hop_dong' && ac && (
            <p className="mt-1 text-2xs text-amber-800 dark:text-amber-200">
              AC lấy từ giá trị nghiệm thu hợp đồng, có thể gồm chi phí ngoài phạm vi dự toán mô hình.
            </p>
          )}
          {result && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
                {metric('BAC', money(result.bac))}
                {metric('PV', money(result.pv))}
                {metric('EV', money(result.ev))}
                {metric('AC', money(result.ac))}
                {metric('SPI', result.spi ?? '—', (result.spi ?? 1) < 0.9)}
                {metric('CPI', result.cpi ?? '—', (result.cpi ?? 1) < 0.9)}
                {metric('EAC', money(result.eac))}
                {metric('VAC', money(result.vac), (result.vac ?? 0) < 0)}
              </div>
              {result.canh_bao.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-rose-700 dark:text-rose-300">
                  {result.canh_bao.map((w) => (
                    <li key={w} className="flex items-start gap-1">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      {project && (
        <section className={`${card} overflow-x-auto`} aria-labelledby="bim-evm-periods">
          <h3 id="bim-evm-periods" className="mb-2 text-sm font-bold text-txt-primary dark:text-white">
            Các kỳ EVM đã chốt
          </h3>
          {periods.error ? (
            <NotInstalledNotice error={periods.error} />
          ) : !(periods.data ?? []).length ? (
            <p className="text-xs text-txt-muted">Chưa chốt kỳ nào.</p>
          ) : (
            <BimTable className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-txt-secondary dark:text-slate-300">
                <tr>
                  <th className="py-1.5">Ngày</th>
                  <th className="text-right">PV</th>
                  <th className="text-right">EV</th>
                  <th className="text-right">AC</th>
                  <th className="text-right">SPI</th>
                  <th className="text-right">CPI</th>
                  <th className="text-right">EAC</th>
                  <th className="pl-2">Nguồn AC</th>
                  <th className="pl-2">Cảnh báo</th>
                </tr>
              </thead>
              <tbody>
                {(periods.data ?? []).map((k) => (
                  <tr key={k.id} className="border-t border-border/60 dark:border-slate-700">
                    <td className="py-1 font-mono">{k.ngay_chot}</td>
                    <td className="text-right font-mono">{money(k.pv)}</td>
                    <td className="text-right font-mono">{money(k.ev)}</td>
                    <td className="text-right font-mono">{money(k.ac)}</td>
                    <td
                      className={`text-right font-mono ${(k.spi ?? 1) < 0.9 ? 'text-rose-700 dark:text-rose-300' : ''}`}
                    >
                      {k.spi ?? '—'}
                    </td>
                    <td
                      className={`text-right font-mono ${(k.cpi ?? 1) < 0.9 ? 'text-rose-700 dark:text-rose-300' : ''}`}
                    >
                      {k.cpi ?? '—'}
                    </td>
                    <td className="text-right font-mono">{money(k.eac)}</td>
                    <td className="pl-2">
                      {k.nguon_ac === 'hop_dong' ? 'Nghiệm thu hợp đồng' : k.nguon_ac === 'nhap_tay' ? 'Nhập tay' : '—'}
                    </td>
                    <td className="pl-2 text-2xs">{k.canh_bao.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </BimTable>
          )}
        </section>
      )}
      {closing && (
        <Modal
          isOpen
          onClose={() => setClosing(false)}
          size="md"
          title={`Chốt kỳ EVM ngày ${date}`}
          description="Kỳ đã chốt không sửa, không xóa được."
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setClosing(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-bold text-white"
                onClick={() => void close()}
              >
                Chốt kỳ
              </button>
            </div>
          }
        >
          <label className="block text-xs font-semibold">
            Ghi chú
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className={`${field} mt-1 w-full`}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}

export const BimCostManager: React.FC<{ projectId: string; canWrite: boolean; canManage: boolean }> = ({
  projectId,
  canWrite,
  canManage,
}) => {
  const [view, setView] = useState<View>('hop-dong');
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Chi phí" className="flex flex-wrap gap-1">
        {(
          [
            ['hop-dong', 'Ngân sách và hợp đồng'],
            ['dinh-muc', 'Định mức và đơn giá'],
            ['du-thau', 'So sánh giá dự thầu'],
            ['dong-tien', 'Dòng tiền và EVM'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${view === id ? 'bg-primary-600 text-white' : 'text-txt-secondary hover:bg-bg-subtle dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {view === 'hop-dong' && <BimContractsPanel projectId={projectId} canWrite={canWrite} canManage={canManage} />}
      {view === 'dinh-muc' && <Norms project={projectId} canWrite={canWrite} />}
      {view === 'du-thau' && <Bids project={projectId} canWrite={canWrite} />}
      {view === 'dong-tien' && <CashAndEvm project={projectId} canWrite={canWrite} />}
    </div>
  );
};
