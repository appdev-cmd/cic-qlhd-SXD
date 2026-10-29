import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Budget, contracts with their BOQ and change orders of a project (ACC Cost: Budget, Contracts, Change Orders).
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Download, FilePlus2, FileUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/features/bim-suite/adapters/ui';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { BimContractService, CONTRACT_STATUS, type BudgetLine, type Contract } from '../../services/BimContractService';
import { BimVariationService, CHANGE_ORDER_STATUS } from '../../services/BimVariationService';
import { downloadTemplate, parseBidSheet, readFirstSheet, type BidImportRow } from '../../lib/planImport';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : formatNumber(Math.round(Number(v)), 2);
const qty = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatNumber(Number(v), 3));
const field =
  'mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const label = 'block text-xs font-semibold text-txt-secondary dark:text-slate-300';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50';
const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const KEY = 'bim-cost';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of [KEY, 'bim-boq', 'bim-variations']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

function Footer({
  onClose,
  onSubmit,
  disabled,
  busy,
  text,
}: {
  onClose: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  text: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-txt-secondary dark:border-slate-600 dark:text-slate-200"
      >
        Hủy
      </button>
      <button type="button" onClick={onSubmit} disabled={disabled || busy} className={primary}>
        {busy ? 'Đang xử lý…' : text}
      </button>
    </div>
  );
}

function BudgetEditor({
  projectId,
  line,
  onClose,
}: {
  projectId: string;
  line: Partial<BudgetLine>;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefresh();
  const [l, setL] = useState(line);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await BimContractService.saveBudgetLine(projectId, l);
      refresh();
      onClose();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={l.id ? `Sửa ngân sách ${line.ma}` : 'Thêm dòng ngân sách'}
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void save()}
          disabled={!l.ma?.trim() || !l.ten?.trim() || (l.ngan_sach ?? 0) < 0}
          busy={busy}
          text="Lưu"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Mã
          <BimInput
            value={l.ma ?? ''}
            maxLength={40}
            onChange={(e) => setL({ ...l, ma: e.target.value })}
            className={field}
          />
        </label>
        <label className={label}>
          Ngân sách (đồng)
          <BimInput
            inputMode="numeric"
            value={l.ngan_sach ?? ''}
            onChange={(e) => setL({ ...l, ngan_sach: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            className={field}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Tên khoản mục
          <BimInput
            value={l.ten ?? ''}
            maxLength={300}
            onChange={(e) => setL({ ...l, ten: e.target.value })}
            className={field}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Ghi chú
          <BimInput
            value={l.ghi_chu ?? ''}
            onChange={(e) => setL({ ...l, ghi_chu: e.target.value })}
            className={field}
          />
        </label>
      </div>
    </Modal>
  );
}

function ContractEditor({
  projectId,
  contract,
  lines,
  onClose,
  onSaved,
}: {
  projectId: string;
  contract: Partial<Contract>;
  lines: BudgetLine[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefresh();
  const [c, setC] = useState(contract);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const id = await BimContractService.saveContract(projectId, c);
      refresh();
      onSaved(id);
      onClose();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={c.id ? `Sửa hợp đồng ${contract.so_hop_dong}` : 'Lập hợp đồng'}
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void save()}
          disabled={!c.so_hop_dong?.trim() || !c.ten?.trim()}
          busy={busy}
          text="Lưu hợp đồng"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Số hợp đồng
          <BimInput
            value={c.so_hop_dong ?? ''}
            maxLength={100}
            onChange={(e) => setC({ ...c, so_hop_dong: e.target.value })}
            className={field}
          />
        </label>
        <label className={label}>
          Nhà thầu
          <BimInput
            value={c.nha_thau ?? ''}
            onChange={(e) => setC({ ...c, nha_thau: e.target.value })}
            className={field}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Tên hợp đồng / gói thầu
          <BimInput
            value={c.ten ?? ''}
            maxLength={300}
            onChange={(e) => setC({ ...c, ten: e.target.value })}
            className={field}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Khoản mục ngân sách
          <BimSelect
            value={c.budget_line_id ?? ''}
            onChange={(e) => setC({ ...c, budget_line_id: e.target.value || null })}
            className={field}
          >
            <option value="">Chưa gắn ngân sách</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.ma} · {l.ten}
              </option>
            ))}
          </BimSelect>
        </label>
      </div>
    </Modal>
  );
}

function BoqImport({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { addToast } = useToast();
  const refresh = useRefresh();
  const [rows, setRows] = useState<BidImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const n = await BimContractService.importItems(contract.id, rows, replace);
      refresh();
      addToast({ type: 'success', message: `Đã nhập ${n} dòng BOQ cho ${contract.so_hop_dong}.` });
      onClose();
    } catch (e) {
      addToast({ type: 'error', title: 'Không nhập được BOQ', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Nhập BOQ · ${contract.so_hop_dong}`}
      description="Excel hoặc CSV có cột Mã hiệu, Tên công việc, Đơn vị, Khối lượng, Đơn giá. Chỉ nhập được khi hợp đồng còn là bản nháp."
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void run()}
          disabled={!rows.length}
          busy={busy}
          text={`Nhập ${rows.length} dòng`}
        />
      }
    >
      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <BimInput
            type="file"
            accept=".xlsx,.csv"
            aria-label="Tệp BOQ"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const r = parseBidSheet(await readFirstSheet(f));
                setRows(r.rows);
                setWarnings(r.warnings);
              } catch (err) {
                setRows([]);
                setWarnings([errorText(err)]);
              }
            }}
          />
          <button
            type="button"
            className={btn}
            onClick={() =>
              void downloadTemplate(
                'mau-boq-hop-dong.csv',
                ['STT', 'Mã hiệu', 'Tên công việc', 'Đơn vị', 'Khối lượng', 'Đơn giá'],
                [[1, 'AF.11213', 'Bê tông móng đá 1x2 mác 250', 'm3', 120, 1250000]],
              )
            }
          >
            <Download className="h-3 w-3" aria-hidden /> Tệp mẫu
          </button>
          <label className="flex items-center gap-1">
            <BimInput
              type="checkbox"
              className="accent-primary-600"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />{' '}
            Thay toàn bộ BOQ hiện có
          </label>
        </div>
        {warnings.length > 0 && (
          <ul className="max-h-24 list-disc overflow-auto rounded-xl bg-amber-50 py-1.5 pl-6 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <p>
            {rows.length} dòng · tổng {money(rows.reduce((s, r) => s + (r.khoi_luong ?? 0) * (r.don_gia ?? 0), 0))}{' '}
            đồng.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ContractDetail({
  projectId,
  contract,
  canWrite,
  canManage,
}: {
  projectId: string;
  contract: Contract;
  canWrite: boolean;
  canManage: boolean;
}) {
  const { addToast } = useToast();
  const refresh = useRefresh();
  const items = useQuery({
    queryKey: [KEY, 'items', contract.id],
    queryFn: () => BimContractService.items(contract.id),
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['bim-variations', 'summary', projectId],
    queryFn: () => BimVariationService.summary(projectId),
    retry: false,
  });
  const mine = orders.data?.find((c) => c.ma_hop_dong === contract.id);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<{ tieu_de: string; ly_do: string; gia_tri: string; ngay: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const total = useMemo(() => (items.data ?? []).reduce((s, i) => s + (i.thanh_tien ?? 0), 0), [items.data]);
  const accepted = useMemo(
    () => (items.data ?? []).reduce((s, i) => s + (i.khoi_luong_nghiem_thu ?? 0) * (i.don_gia ?? 0), 0),
    [items.data],
  );
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      refresh();
      if (ok) addToast({ type: 'success', message: ok });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const sign = () => {
    const d = window.prompt('Ngày ký (yyyy-mm-dd)', today())?.trim();
    if (d) void act(() => BimContractService.setStatus(contract.id, 'da_ky', d), `Đã ký ${contract.so_hop_dong}.`);
  };
  const saveAccepted = (id: string, current: number | null) => {
    const raw = edits[id];
    if (raw === undefined) return;
    setEdits((e) => {
      const n = { ...e };
      delete n[id];
      return n;
    });
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0))
      return addToast({ type: 'error', message: 'Khối lượng nghiệm thu không hợp lệ.' });
    if (v !== current) void act(() => BimContractService.setAccepted(id, v));
  };
  const propose = async () => {
    if (!draft) return;
    const v = Number(draft.gia_tri.replace(/\./g, '').replace(',', '.'));
    if (!draft.tieu_de.trim() || !Number.isFinite(v))
      return addToast({ type: 'info', message: 'Nhập nội dung và giá trị điều chỉnh (đồng, có thể âm).' });
    await act(
      () =>
        BimVariationService.create(projectId, contract.id, {
          tieu_de: draft.tieu_de.trim(),
          ly_do: draft.ly_do.trim() || null,
          gia_tri: v,
          ngay: Number(draft.ngay) || 0,
        }),
      'Đã gửi đề xuất thay đổi.',
    );
    setDraft(null);
  };
  const decide = (id: string, so: string, approve: boolean) => {
    const reason = approve ? null : window.prompt(`Lý do từ chối ${so}`)?.trim();
    if (!approve && !reason) return;
    void act(
      () => BimVariationService.decide(id, approve, reason ?? null),
      approve ? `Đã duyệt ${so}.` : `Đã từ chối ${so}.`,
    );
  };
  const draftContract = contract.trang_thai === 'nhap';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-txt-primary dark:text-white">
          {contract.so_hop_dong} · {contract.ten}
        </span>
        <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-2xs font-semibold dark:bg-slate-700">
          {CONTRACT_STATUS[contract.trang_thai]}
          {contract.ngay_ky ? ` ${contract.ngay_ky.split('-').reverse().join('/')}` : ''}
        </span>
        <span className="text-txt-muted">
          Giá trị BOQ {money(total)} đ · nghiệm thu {money(accepted)} đ
        </span>
        <span className="flex-1" />
        {canWrite && draftContract && (
          <button type="button" className={btn} onClick={() => setImporting(true)}>
            <FileUp className="h-3 w-3" aria-hidden /> Nhập BOQ
          </button>
        )}
        {canManage && draftContract && (
          <button type="button" className={btn} disabled={!items.data?.length} onClick={sign}>
            <Lock className="h-3 w-3" aria-hidden /> Ký hợp đồng
          </button>
        )}
        {canManage && contract.trang_thai === 'da_ky' && (
          <button
            type="button"
            className={btn}
            onClick={() =>
              window.confirm(`Thanh lý ${contract.so_hop_dong}?`) &&
              void act(() => BimContractService.setStatus(contract.id, 'thanh_ly'), 'Đã thanh lý hợp đồng.')
            }
          >
            Thanh lý
          </button>
        )}
      </div>
      {!draftContract && (
        <p className="text-2xs text-txt-muted">
          Hợp đồng đã ký: khối lượng và đơn giá BOQ bị khóa; chỉ ghi khối lượng nghiệm thu. Thay đổi phạm vi hoặc giá
          qua lệnh thay đổi bên dưới.
        </p>
      )}

      <div className="max-h-80 overflow-auto rounded-xl border border-border dark:border-slate-600">
        <BimTable className="w-full min-w-[760px] text-xs" aria-label={`BOQ ${contract.so_hop_dong}`}>
          <thead className="sticky top-0 bg-bg-subtle text-left text-txt-secondary dark:bg-slate-900 dark:text-slate-300">
            <tr>
              <th className="px-2 py-1.5">Mã hiệu</th>
              <th className="px-2 py-1.5">Công việc</th>
              <th className="px-2 py-1.5">ĐV</th>
              <th className="px-2 py-1.5 text-right">KL HĐ</th>
              <th className="px-2 py-1.5 text-right">Đơn giá</th>
              <th className="px-2 py-1.5 text-right">Thành tiền</th>
              <th className="px-2 py-1.5 text-right">KL nghiệm thu</th>
            </tr>
          </thead>
          <tbody>
            {(items.data ?? []).slice(0, 1000).map((i) => (
              <tr key={i.id} className="border-t border-border/60 dark:border-slate-700">
                <td className="px-2 py-1 font-mono">{i.ma_hieu ?? ''}</td>
                <td className="px-2 py-1">{i.ten_cong_viec}</td>
                <td className="px-2 py-1">{i.don_vi ?? ''}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{qty(i.khoi_luong)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{money(i.don_gia)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{money(i.thanh_tien)}</td>
                <td className="px-2 py-1 text-right">
                  {canWrite && contract.trang_thai !== 'thanh_ly' ? (
                    <BimInput
                      aria-label={`KL nghiệm thu ${i.ma_hieu ?? i.ten_cong_viec}`}
                      inputMode="decimal"
                      className="w-24 rounded border border-border bg-white px-1 py-0.5 text-right font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                      value={edits[i.id] ?? i.khoi_luong_nghiem_thu ?? ''}
                      onChange={(e) => setEdits({ ...edits, [i.id]: e.target.value })}
                      onBlur={() => saveAccepted(i.id, i.khoi_luong_nghiem_thu)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  ) : (
                    <span className="font-mono tabular-nums">{qty(i.khoi_luong_nghiem_thu)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </BimTable>
        {items.isSuccess && !items.data.length && (
          <p className="p-3 text-xs text-txt-muted">Hợp đồng chưa có BOQ. Nhập từ Excel/CSV trước khi ký.</p>
        )}
        {items.error && (
          <p role="alert" className="p-3 text-xs text-rose-600">
            {errorText(items.error)}
          </p>
        )}
      </div>

      <section aria-label="Lệnh thay đổi" className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-bold text-txt-primary dark:text-white">
            Lệnh thay đổi ({mine?.phu_luc.length ?? 0})
          </h4>
          {mine && (
            <span className="text-2xs text-txt-muted">
              Đã duyệt {money(mine.phat_sinh_da_ky)} đ · chờ duyệt {money(mine.phat_sinh_chua_ky)} đ
            </span>
          )}
          <span className="flex-1" />
          {canWrite && contract.trang_thai === 'da_ky' && !draft && (
            <button
              type="button"
              className={btn}
              onClick={() => setDraft({ tieu_de: '', ly_do: '', gia_tri: '', ngay: '' })}
            >
              <FilePlus2 className="h-3 w-3" aria-hidden /> Đề xuất thay đổi
            </button>
          )}
        </div>
        {draft && (
          <div className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-4 dark:border-slate-600">
            <label className={`${label} sm:col-span-2`}>
              Nội dung
              <BimInput
                value={draft.tieu_de}
                onChange={(e) => setDraft({ ...draft, tieu_de: e.target.value })}
                className={field}
              />
            </label>
            <label className={label}>
              Giá trị điều chỉnh (đồng)
              <BimInput
                inputMode="numeric"
                value={draft.gia_tri}
                onChange={(e) => setDraft({ ...draft, gia_tri: e.target.value })}
                className={field}
              />
            </label>
            <label className={label}>
              Kéo dài (ngày)
              <BimInput
                inputMode="numeric"
                value={draft.ngay}
                onChange={(e) => setDraft({ ...draft, ngay: e.target.value })}
                className={field}
              />
            </label>
            <label className={`${label} sm:col-span-3`}>
              Lý do
              <BimInput
                value={draft.ly_do}
                onChange={(e) => setDraft({ ...draft, ly_do: e.target.value })}
                className={field}
              />
            </label>
            <span className="flex items-end gap-1">
              <button type="button" className={btn} onClick={() => setDraft(null)}>
                Hủy
              </button>
              <button type="button" className={btn} onClick={() => void propose()}>
                Gửi đề xuất
              </button>
            </span>
          </div>
        )}
        <ul className="space-y-1 text-xs">
          {(mine?.phu_luc ?? []).map((o) => (
            <li
              key={o.ma_vo}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1 dark:border-slate-700"
            >
              <span className="font-mono font-semibold">{o.so}</span>
              <span className="min-w-0 flex-1">{o.noi_dung}</span>
              <span className="font-mono tabular-nums">
                {money(o.gia_tri)} đ{o.thoi_gian ? ` · ${o.thoi_gian} ngày` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                {o.trang_thai === 'da_duyet' ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden />
                ) : (
                  <Clock3 className="h-3 w-3 text-amber-600" aria-hidden />
                )}
                {CHANGE_ORDER_STATUS[o.trang_thai]}
              </span>
              <span className="text-2xs text-txt-muted">
                {o.so_lien_ket ? `${o.so_lien_ket} liên kết mô hình` : 'chưa gắn mô hình'}
              </span>
              {canManage && o.trang_thai === 'de_xuat' && (
                <span className="flex gap-1">
                  <button type="button" className={btn} onClick={() => decide(o.ma_vo, o.so, true)}>
                    Duyệt
                  </button>
                  <button type="button" className={btn} onClick={() => decide(o.ma_vo, o.so, false)}>
                    Từ chối
                  </button>
                </span>
              )}
            </li>
          ))}
          {mine && !mine.phu_luc.length && (
            <li className="text-2xs text-txt-muted">
              Chưa có lệnh thay đổi. Người đề xuất không tự duyệt được; gắn lệnh với cấu kiện ở bảng Lệnh thay đổi trong
              trình xem.
            </li>
          )}
        </ul>
      </section>
      {importing && <BoqImport contract={contract} onClose={() => setImporting(false)} />}
    </div>
  );
}

export const BimContractsPanel: React.FC<{ projectId: string; canWrite: boolean; canManage: boolean }> = ({
  projectId,
  canWrite,
  canManage,
}) => {
  const { addToast } = useToast();
  const refresh = useRefresh();
  const lines = useQuery({
    queryKey: [KEY, 'budget', projectId],
    queryFn: () => BimContractService.budgetLines(projectId),
    retry: false,
  });
  const summary = useQuery({
    queryKey: [KEY, 'summary', projectId],
    queryFn: () => BimContractService.summary(projectId),
    retry: false,
  });
  const contracts = useQuery({
    queryKey: [KEY, 'contracts', projectId],
    queryFn: () => BimContractService.contracts(projectId),
    retry: false,
  });
  const [budget, setBudget] = useState<Partial<BudgetLine> | null>(null);
  const [editing, setEditing] = useState<Partial<Contract> | null>(null);
  const [selected, setSelected] = useState('');
  const list = contracts.data ?? [];
  const active = list.find((c) => c.id === selected) ?? list[0];
  const lineName = new Map((lines.data ?? []).map((l) => [l.id, `${l.ma} · ${l.ten}`]));
  const s = summary.data;
  const error = lines.error ?? summary.error ?? contracts.error;

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {errorText(error)}
        </p>
      )}
      <section className={`${card} overflow-x-auto`} aria-labelledby="bim-budget">
        <div className="mb-2 flex items-center gap-2">
          <h3 id="bim-budget" className="text-sm font-bold text-txt-primary dark:text-white">
            Ngân sách
          </h3>
          <span className="text-2xs text-txt-muted">Tổng {money(s?.tong_ngan_sach)} đ</span>
          <span className="flex-1" />
          {canManage && (
            <button type="button" className={btn} onClick={() => setBudget({ ma: '', ten: '', ngan_sach: 0 })}>
              <Plus className="h-3 w-3" aria-hidden /> Thêm khoản mục
            </button>
          )}
        </div>
        <BimTable className="w-full min-w-[760px] text-xs">
          <thead className="text-left text-txt-secondary dark:text-slate-300">
            <tr>
              <th className="py-1.5 pr-2">Khoản mục</th>
              <th className="pr-2 text-right">Ngân sách</th>
              <th className="pr-2 text-right">Cam kết (HĐ đã ký)</th>
              <th className="pr-2 text-right">HĐ nháp</th>
              <th className="pr-2 text-right">Thay đổi đã duyệt</th>
              <th className="pr-2 text-right">Chờ duyệt</th>
              <th className="pr-2 text-right">Còn lại</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(s?.lines ?? []).map((l) => (
              <tr key={l.id} className="border-t border-border/60 dark:border-slate-700">
                <td className="py-1 pr-2">
                  <span className="font-mono">{l.ma}</span> · {l.ten}
                </td>
                <td className="pr-2 text-right font-mono tabular-nums">{money(l.ngan_sach)}</td>
                <td className="pr-2 text-right font-mono tabular-nums">{money(l.cam_ket)}</td>
                <td className="pr-2 text-right font-mono tabular-nums text-txt-muted">{money(l.du_kien)}</td>
                <td className="pr-2 text-right font-mono tabular-nums">{money(l.thay_doi_duyet)}</td>
                <td className="pr-2 text-right font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {money(l.thay_doi_cho)}
                </td>
                <td
                  className={`pr-2 text-right font-mono font-bold tabular-nums ${l.con_lai < 0 ? 'text-rose-600 dark:text-rose-300' : ''}`}
                >
                  {money(l.con_lai)}
                </td>
                <td className="whitespace-nowrap">
                  {canManage && (
                    <span className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Sửa ${l.ma}`}
                        onClick={() => setBudget(lines.data?.find((x) => x.id === l.id) ?? null)}
                        className="text-txt-muted hover:text-primary-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa ${l.ma}`}
                        onClick={() =>
                          window.confirm(`Xóa khoản mục ${l.ma}? Hợp đồng gắn khoản mục này chuyển về chưa gắn.`) &&
                          void BimContractService.deleteBudgetLine(l.id).then(refresh, (e) =>
                            addToast({ type: 'error', message: errorText(e) }),
                          )
                        }
                        className="text-txt-muted hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {s && (s.chua_gan_ngan_sach.cam_ket > 0 || s.chua_gan_ngan_sach.thay_doi_duyet > 0) && (
              <tr className="border-t border-border/60 text-txt-muted dark:border-slate-700">
                <td className="py-1 pr-2 italic">Hợp đồng chưa gắn ngân sách</td>
                <td />
                <td className="pr-2 text-right font-mono tabular-nums">{money(s.chua_gan_ngan_sach.cam_ket)}</td>
                <td />
                <td className="pr-2 text-right font-mono tabular-nums">{money(s.chua_gan_ngan_sach.thay_doi_duyet)}</td>
                <td colSpan={3} />
              </tr>
            )}
          </tbody>
        </BimTable>
        {summary.isSuccess && !s?.lines.length && (
          <p className="mt-1 text-xs text-txt-muted">
            Chưa có khoản mục ngân sách. Quản lý dự án lập ngân sách theo khoản mục để theo dõi cam kết và phần còn lại.
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="bim-contracts">
        <div className="mb-2 flex items-center gap-2">
          <h3 id="bim-contracts" className="text-sm font-bold text-txt-primary dark:text-white">
            Hợp đồng
          </h3>
          <span className="flex-1" />
          {canWrite && (
            <button type="button" className={btn} onClick={() => setEditing({ so_hop_dong: '', ten: '' })}>
              <Plus className="h-3 w-3" aria-hidden /> Lập hợp đồng
            </button>
          )}
        </div>
        {!list.length ? (
          <p className="text-xs text-txt-muted">{contracts.isPending ? 'Đang tải…' : 'Dự án chưa có hợp đồng.'}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <ul className="space-y-1 text-xs" aria-label="Danh sách hợp đồng">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={active?.id === c.id}
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-xl border px-2 py-1.5 text-left ${active?.id === c.id ? 'border-primary-400 bg-primary-50/40 dark:border-primary-600' : 'border-border dark:border-slate-700'}`}
                  >
                    <span className="block font-semibold">
                      {c.so_hop_dong} · {c.ten}
                    </span>
                    <span className="block text-2xs text-txt-muted">
                      {CONTRACT_STATUS[c.trang_thai]}
                      {c.nha_thau ? ` · ${c.nha_thau}` : ''}
                      {c.budget_line_id ? ` · ${lineName.get(c.budget_line_id) ?? ''}` : ''}
                    </span>
                  </button>
                  {canWrite && active?.id === c.id && (
                    <span className="mt-1 flex gap-1">
                      <button type="button" className={btn} onClick={() => setEditing(c)}>
                        <Pencil className="h-3 w-3" aria-hidden /> Sửa
                      </button>
                      {c.trang_thai === 'nhap' && (
                        <button
                          type="button"
                          className={btn}
                          onClick={() =>
                            window.confirm(`Xóa hợp đồng nháp ${c.so_hop_dong} và BOQ của nó?`) &&
                            void BimContractService.deleteContract(c.id).then(refresh, (e) =>
                              addToast({ type: 'error', message: errorText(e) }),
                            )
                          }
                        >
                          <Trash2 className="h-3 w-3" aria-hidden /> Xóa
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {active && (
              <ContractDetail
                key={active.id}
                projectId={projectId}
                contract={active}
                canWrite={canWrite}
                canManage={canManage}
              />
            )}
          </div>
        )}
      </section>
      {budget && <BudgetEditor projectId={projectId} line={budget} onClose={() => setBudget(null)} />}
      {editing && (
        <ContractEditor
          projectId={projectId}
          contract={editing}
          lines={lines.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={setSelected}
        />
      )}
    </div>
  );
};
