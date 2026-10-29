import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Analytics overview of the models in the viewer: scope (model, floor, Uniclass), key figures, information-quality
// findings down to the element, document / acceptance / schedule links, quantities by class, and the project schedule
// and cost figures of phase B5. Ported from cic-hud BimInsightDashboard without IoT, the HUD data standard and
// recharts (plain CSS bars).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Crosshair,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { BimIntelligence } from '../hooks/useBimIntelligence';
import { useBimFieldActual, useEvmPeriods, useScheduleTasks } from '../hooks/useBimPlan';
import { BimVariationService } from '../services/BimVariationService';
import { BimContractService } from '../services/BimContractService';
import {
  QUALITY_FINDINGS,
  budgetTotals,
  changeOrderTotals,
  elementKey,
  fieldActualCounts,
  hasFinding,
  latestEvm,
  scheduleProgress,
  summarizeQuantityRows,
  uniclassSummary,
  type FindingKey,
  type InsightElement,
} from '../lib/bimIntelligence';
import { formatVnd } from '../lib/costing';
import { getIfcLabel } from '../lib/ifcLabels';
import { formatMoneyShort } from '../lib/variationSummary';
import { BimUsageSummary } from './BimUsageSummary';

export interface InsightActions {
  /** Hands a question to the AI assistant; the button is hidden without it. */
  onAsk?: (question: string) => void;
  onSelect?: (rows: InsightElement[]) => void;
  onLocate?: (row: InsightElement) => void;
  onDraft?: (title: string, description: string, row?: InsightElement) => void;
  onColor?: (rows: InsightElement[], title: string) => void;
}

const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const select =
  'mt-1 w-full rounded-xl border border-border bg-white px-2 py-1 text-2xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const PAGE = 20;
const num = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : formatNumber(v, d);
const dateTime = (ms: number) =>
  ms
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(ms),
      )
    : '—';
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const SOURCE_LABEL: Record<string, string> = {
  qto: 'Qto khai báo',
  pset: 'Pset khai báo',
  hinh_hoc: 'Ước tính hình học',
};
const FIELD_STATES: [string, string, string][] = [
  ['da_nghiem_thu', 'Đã nghiệm thu', 'bg-emerald-500 dark:bg-emerald-500'],
  ['da_thi_cong', 'Đã thi công', 'bg-primary-500'],
  ['dang_thi_cong', 'Đang thi công', 'bg-amber-400 dark:bg-amber-400'],
  ['cham', 'Chậm', 'bg-rose-500 dark:bg-rose-500'],
  ['chua_bat_dau', 'Chưa bắt đầu', 'bg-slate-300 dark:bg-slate-600'],
];

/** Horizontal CSS bar: label, track, value. */
export function Bar({
  label,
  value,
  max,
  text,
  tone = 'bg-primary-500',
}: {
  label: string;
  value: number;
  max: number;
  text?: string;
  tone?: string;
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-2xs">
      <span className="w-28 shrink-0 truncate text-txt-secondary dark:text-slate-300" data-tooltip={label}>
        {label}
      </span>
      <span
        className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle dark:bg-slate-700"
        role="img"
        aria-label={`${label}: ${text ?? num(value, 1)}`}
      >
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right tabular-nums text-txt-muted">{text ?? num(value, 1)}</span>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={card}>
      <p className="text-2xs text-txt-muted">{label}</p>
      <p className="my-1 text-xl font-bold text-txt-primary dark:text-white">{value}</p>
      {hint && <p className="break-words text-2xs text-txt-muted">{hint}</p>}
    </div>
  );
}

/** Model / floor / Uniclass filter of the overview and the cost tab. */
export function BimInsightScopeBar({ value: w }: { value: BimIntelligence }) {
  const set = (patch: Partial<BimIntelligence['scope']>) => w.setScope({ ...w.scope, ...patch });
  return (
    <div className={`${card} grid grid-cols-2 gap-2`}>
      <label className="text-2xs font-semibold text-txt-secondary">
        Mô hình
        <BimSelect
          className={select}
          value={w.scope.modelId}
          onChange={(e) => set({ modelId: e.target.value, floorKey: 'all', uniclassPr: 'all', uniclassSs: 'all' })}
        >
          <option value="all">Tất cả ({w.models.length})</option>
          {w.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.file_name}
            </option>
          ))}
        </BimSelect>
      </label>
      <label className="text-2xs font-semibold text-txt-secondary">
        Tầng
        <BimSelect
          className={select}
          value={w.scope.floorKey}
          onChange={(e) => set({ floorKey: e.target.value, uniclassPr: 'all', uniclassSs: 'all' })}
        >
          <option value="all">Tất cả tầng</option>
          {w.floors.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({num(f.count)})
            </option>
          ))}
        </BimSelect>
      </label>
      <label className="text-2xs font-semibold text-txt-secondary">
        Uniclass Pr
        <BimSelect
          className={select}
          value={w.scope.uniclassPr}
          onChange={(e) => set({ uniclassPr: e.target.value })}
          disabled={!w.prOptions.length}
        >
          <option value="all">{w.prOptions.length ? 'Tất cả' : 'Chưa có mã'}</option>
          {w.prOptions.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code}
              {o.name ? ` · ${o.name}` : ''} ({num(o.count)})
            </option>
          ))}
        </BimSelect>
      </label>
      <label className="text-2xs font-semibold text-txt-secondary">
        Uniclass Ss
        <BimSelect
          className={select}
          value={w.scope.uniclassSs}
          onChange={(e) => set({ uniclassSs: e.target.value })}
          disabled={!w.ssOptions.length}
        >
          <option value="all">{w.ssOptions.length ? 'Tất cả' : 'Chưa có mã'}</option>
          {w.ssOptions.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code}
              {o.name ? ` · ${o.name}` : ''} ({num(o.count)})
            </option>
          ))}
        </BimSelect>
      </label>
    </div>
  );
}

/** Project schedule and cost (phase B5): schedule, field progress of the elements in scope, EVM, budget, change orders. */
function ProjectControls({ value: w }: { value: BimIntelligence }) {
  const [today] = useState(todayVn);
  const [showField, setShowField] = useState(false);
  const tasks = useScheduleTasks(w.projectId);
  const periods = useEvmPeriods(w.projectId);
  const orders = useQuery({
    queryKey: ['bim-variations', 'summary', w.projectId],
    queryFn: () => BimVariationService.summary(w.projectId),
    retry: false,
  });
  const budget = useQuery({
    queryKey: ['bim-cost', 'summary', w.projectId],
    queryFn: () => BimContractService.summary(w.projectId),
    retry: false,
  });
  const field = useBimFieldActual(w.projectId, showField);
  const schedule = useMemo(() => scheduleProgress(tasks.data ?? [], today), [tasks.data, today]);
  const evm = useMemo(() => latestEvm(periods.data ?? []), [periods.data]);
  const co = useMemo(() => changeOrderTotals(orders.data ?? []), [orders.data]);
  const money = useMemo(() => (budget.data ? budgetTotals(budget.data) : null), [budget.data]);
  const fieldCounts = useMemo(() => fieldActualCounts(field.data ?? [], w.modelIds), [field.data, w.modelIds]);
  const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

  return (
    <section className={`${card} space-y-3`}>
      <h3 className="font-bold text-txt-primary dark:text-white">Tiến độ và chi phí dự án</h3>
      <div className="space-y-1">
        <p className="text-2xs font-semibold text-txt-secondary">Tiến độ (công việc lá)</p>
        {tasks.error ? (
          <p role="alert" className="text-rose-600">
            Không tải được tiến độ: {err(tasks.error)}
          </p>
        ) : tasks.isPending ? (
          <p className="text-txt-muted">Đang tải tiến độ…</p>
        ) : !schedule.tong ? (
          <p className="text-txt-muted">Dự án chưa có tiến độ. Lập hoặc nhập tiến độ ở tab Kế hoạch.</p>
        ) : (
          <>
            <Bar
              label="Hoàn thành"
              value={schedule.hoan_thanh}
              max={schedule.tong}
              text={`${num(schedule.hoan_thanh)}/${num(schedule.tong)}`}
              tone="bg-emerald-500 dark:bg-emerald-500"
            />
            <Bar
              label="Đang làm"
              value={schedule.dang_lam}
              max={schedule.tong}
              text={num(schedule.dang_lam)}
              tone="bg-amber-400 dark:bg-amber-400"
            />
            <Bar
              label="Chậm kế hoạch"
              value={schedule.cham}
              max={schedule.tong}
              text={num(schedule.cham)}
              tone="bg-rose-500 dark:bg-rose-500"
            />
            <p className="text-2xs text-txt-muted">
              Thực tế bình quân theo tỷ trọng: {num(schedule.thuc_te_phan_tram, 1)}%.
            </p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs font-semibold text-txt-secondary">Tiến độ hiện trường theo cấu kiện</p>
          {!showField && (
            <button type="button" className={btn} onClick={() => setShowField(true)}>
              Tải
            </button>
          )}
        </div>
        {showField &&
          (field.error ? (
            <p role="alert" className="text-rose-600">
              Không tải được: {err(field.error)}
            </p>
          ) : field.isPending ? (
            <p className="flex items-center gap-1 text-txt-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Đang tải…
            </p>
          ) : !fieldCounts.total ? (
            <p className="text-txt-muted">
              Chưa có cấu kiện gắn nghiệm thu hoặc công việc trong các mô hình đang chọn.
            </p>
          ) : (
            FIELD_STATES.map(([key, label, tone]) => (
              <Bar
                key={key}
                label={label}
                value={fieldCounts.counts[key] ?? 0}
                max={fieldCounts.total}
                text={num(fieldCounts.counts[key] ?? 0)}
                tone={tone}
              />
            ))
          ))}
        <p className="text-2xs text-txt-muted">
          Nghiệm thu trước, sau đó % thực tế của công việc gắn với cấu kiện; theo các mô hình đang chọn.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-bg-subtle p-2 dark:bg-slate-900">
          <p className="text-2xs text-txt-muted">EVM kỳ chốt gần nhất</p>
          {periods.error ? (
            <p className="text-rose-600">{err(periods.error)}</p>
          ) : evm ? (
            <>
              <p className="text-sm font-bold text-txt-primary dark:text-white">
                SPI {num(evm.spi, 2)} · CPI {num(evm.cpi, 2)}
              </p>
              <p className="text-2xs text-txt-muted">
                {evm.ngay_chot} · EV {formatMoneyShort(evm.ev)} / BAC {formatMoneyShort(evm.bac)}
              </p>
            </>
          ) : (
            <p className="text-txt-muted">Chưa chốt kỳ EVM.</p>
          )}
        </div>
        <div className="rounded-xl bg-bg-subtle p-2 dark:bg-slate-900">
          <p className="text-2xs text-txt-muted">Lệnh thay đổi</p>
          {orders.error ? (
            <p className="text-rose-600">{err(orders.error)}</p>
          ) : (
            <>
              <p className="text-sm font-bold text-txt-primary dark:text-white">
                {num(co.duyet_so)} duyệt · {num(co.cho_so)} chờ
              </p>
              <p className="text-2xs text-txt-muted">
                Duyệt {formatMoneyShort(co.duyet_gia_tri)} · chờ {formatMoneyShort(co.cho_gia_tri)} · {num(co.hop_dong)}{' '}
                hợp đồng
              </p>
            </>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xs font-semibold text-txt-secondary">Ngân sách và cam kết</p>
        {budget.error ? (
          <p role="alert" className="text-rose-600">
            Không tải được ngân sách: {err(budget.error)}
          </p>
        ) : !money ? (
          <p className="text-txt-muted">Đang tải…</p>
        ) : !money.ngan_sach && !money.cam_ket ? (
          <p className="text-txt-muted">Chưa có ngân sách hoặc hợp đồng.</p>
        ) : (
          <>
            {(() => {
              const max = Math.max(money.ngan_sach, money.cam_ket + money.thay_doi_duyet, 1);
              return (
                <>
                  <Bar
                    label="Ngân sách"
                    value={money.ngan_sach}
                    max={max}
                    text={formatMoneyShort(money.ngan_sach)}
                    tone="bg-slate-400 dark:bg-slate-400"
                  />
                  <Bar
                    label="Cam kết (hợp đồng)"
                    value={money.cam_ket}
                    max={max}
                    text={formatMoneyShort(money.cam_ket)}
                  />
                  <Bar
                    label="Thay đổi đã duyệt"
                    value={money.thay_doi_duyet}
                    max={max}
                    text={formatMoneyShort(money.thay_doi_duyet)}
                    tone="bg-amber-400 dark:bg-amber-400"
                  />
                </>
              );
            })()}
          </>
        )}
      </div>
    </section>
  );
}

export function BimInsightDashboard({
  value: w,
  actions,
  canEdit,
  onExportReport,
  exporting,
}: {
  value: BimIntelligence;
  actions: InsightActions;
  canEdit?: boolean;
  onExportReport?: () => void;
  exporting?: boolean;
}) {
  const [finding, setFinding] = useState<FindingKey>('quantity');
  const [page, setPage] = useState(0);
  const list = useMemo(() => w.rows.filter((row) => hasFinding(row, finding)), [w.rows, finding]);
  const byType = useMemo(
    () => summarizeQuantityRows(w.analysis.quantities, 'loai_cau_kien', 8),
    [w.analysis.quantities],
  );
  const uniclass = useMemo(() => uniclassSummary(w.rows), [w.rows]);
  const maxTypeCount = Math.max(1, ...byType.nhom.map((g) => g.so_luong));
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const modelName = (id: string) => w.models.find((m) => m.id === id)?.file_name ?? id;
  const openIssues = w.issues.filter((i) => i.status !== 'closed' && i.status !== 'resolved').length;
  const pricedRows = w.analysis.cost.rows.filter((r) => r.thanh_tien !== null).length;

  const exportSnapshot = () => {
    const payload = {
      du_an: w.projectId,
      pham_vi: w.scopeLabel,
      nguon: 'IFC và dữ liệu liên kết',
      cap_nhat: dateTime(w.dataAt),
      so_cau_kien: w.analysis.count,
      bi_cat_bot: w.truncated ? { da_tai: w.loaded, tong: w.total } : null,
      uniclass,
      khai_bao_qto: w.analysis.declared,
      van_de: w.analysis.counts,
      khoi_luong: summarizeQuantityRows(w.analysis.quantities, 'loai_cau_kien', 1000),
      chi_phi: {
        tong_vnd: w.analysis.cost.total,
        mo_hinh: w.selectedModels.map((m) => m.file_name),
        nhom_chua_tinh: w.analysis.cost.missing,
      },
      cau_kien: list.map((r) => ({
        model_id: r.model_id,
        global_id: r.global_id,
        express_id: r.express_id,
        ten: r.ten_cau_kien,
        loai: r.loai_cau_kien,
        tang: r.phan_doan_tang,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Phan_tich_BIM_${w.projectId.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-3 text-xs text-txt-primary dark:text-slate-200">
      <section className={card}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">
              BIM · Dữ liệu · Kiểm soát dự án
            </p>
            <h2 className="mt-1 text-base font-bold">Phân tích công trình</h2>
            <p className="mt-0.5 text-txt-muted">Từ chỉ số tới cấu kiện và hành động xử lý.</p>
          </div>
          <BarChart3 className="text-primary-600" size={24} aria-hidden />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.onAsk && (
            <button
              type="button"
              className={btn}
              disabled={!w.ready}
              onClick={() =>
                actions.onAsk?.(
                  'Tóm tắt các vấn đề cần ưu tiên trong phạm vi đang chọn, dẫn nguồn và gợi ý bước xử lý.',
                )
              }
            >
              <Sparkles size={13} aria-hidden /> Phân tích với AI
            </button>
          )}
          <button type="button" className={btn} onClick={() => void w.refresh()}>
            <RefreshCw size={13} aria-hidden /> Làm mới
          </button>
          <button type="button" className={btn} disabled={!w.ready} onClick={exportSnapshot}>
            <Download size={13} aria-hidden /> Xuất kết quả
          </button>
          {onExportReport && (
            <button type="button" className={btn} disabled={!w.ready || exporting} onClick={onExportReport}>
              <Download size={13} aria-hidden /> {exporting ? 'Đang xuất Word…' : 'Báo cáo Word'}
            </button>
          )}
        </div>
      </section>

      <BimInsightScopeBar value={w} />

      {!w.models.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
          Mở ít nhất một mô hình đã xử lý xong để phân tích.
        </p>
      ) : w.loading ? (
        <p role="status" className="flex items-center gap-1 text-txt-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Đang tải cấu kiện, khối lượng và đơn giá…
        </p>
      ) : w.error ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
          Không tải đủ nguồn: {w.error.message}. Bấm Làm mới để thử lại; chưa có kết luận phân tích.
        </p>
      ) : (
        <>
          {w.truncated && (
            <p
              role="status"
              className="rounded-lg bg-amber-50 p-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              Mô hình lớn: chỉ đọc {num(w.loaded)}/{num(w.total)} cấu kiện đầu tiên cho danh sách vấn đề và bộ lọc
              tầng/Uniclass.
              {w.scope.floorKey === 'all' && w.scope.uniclassPr === 'all' && w.scope.uniclassSs === 'all'
                ? ' Khối lượng, chi phí và độ phủ liên kết vẫn tính đủ ở máy chủ.'
                : ' Số liệu theo bộ lọc chỉ phản ánh phần đã đọc.'}
            </p>
          )}
          <p className="text-2xs text-txt-muted">
            Nguồn IFC · {w.scopeLabel} · cập nhật {dateTime(w.dataAt)}. Tỷ lệ chất lượng phản ánh dữ liệu khai báo,
            không phải tỷ lệ nghiệm thu.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Kpi
              label="Cấu kiện trong phạm vi"
              value={num(w.analysis.count)}
              hint={`${num(uniclass.co_pr)} có mã Pr · ${num(uniclass.co_ss)} có mã Ss`}
            />
            <Kpi
              label="Có dữ liệu khối lượng"
              value={w.analysis.knownQuantityPercent === null ? '—' : `${num(w.analysis.knownQuantityPercent, 1)}%`}
              hint={`${num(w.analysis.knownQuantity)}/${num(w.analysis.applicableQuantityCount)} đối tượng áp dụng · ${num(w.analysis.declared)} Qto · ${num(w.analysis.notApplicableQuantityCount)} không áp dụng`}
            />
            <Kpi
              label="Giá trị phần đủ dữ liệu"
              value={pricedRows ? formatVnd(w.analysis.cost.total) : 'Chưa đủ dữ liệu'}
              hint={`${w.selectedModels.length} mô hình · ${num(w.analysis.cost.missing)} nhóm chưa tính · kiểm tra trùng giữa bộ môn`}
            />
            <Kpi
              label="Vướng mắc còn mở"
              value={num(openIssues)}
              hint={
                w.scope.floorKey === 'all' && w.scope.uniclassPr === 'all' && w.scope.uniclassSs === 'all'
                  ? 'Theo các mô hình trong phạm vi'
                  : 'Có liên kết cấu kiện trong bộ lọc'
              }
            />
          </div>

          <section className={`${card} space-y-3`}>
            <h3 className="flex items-center gap-2 font-bold">
              <AlertTriangle size={15} className="text-amber-600" aria-hidden /> Dữ liệu cần hoàn thiện
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(QUALITY_FINDINGS) as [FindingKey, string][]).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={finding === key}
                  className={`doc-button justify-between px-2 py-1 text-2xs ${finding === key ? 'doc-primary' : ''}`}
                  onClick={() => {
                    setFinding(key);
                    setPage(0);
                  }}
                >
                  <span>{label}</span> <b>{num(w.analysis.counts[key])}</b>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.onColor && (
                <button
                  type="button"
                  className={btn}
                  disabled={!list.length}
                  onClick={() => actions.onColor?.(list, QUALITY_FINDINGS[finding])}
                >
                  Tô màu {num(list.length)} cấu kiện
                </button>
              )}
              {actions.onSelect && (
                <button type="button" className={btn} disabled={!list.length} onClick={() => actions.onSelect?.(list)}>
                  Chọn trên mô hình
                </button>
              )}
              {actions.onAsk && (
                <button
                  type="button"
                  className={btn}
                  onClick={() =>
                    actions.onAsk?.(
                      `Giải thích nhóm ${QUALITY_FINDINGS[finding]} trong phạm vi hiện tại. Nêu số lượng, nguồn, ví dụ cấu kiện và cách bổ sung.`,
                    )
                  }
                >
                  <Sparkles size={13} aria-hidden /> AI giải thích
                </button>
              )}
            </div>
            {!list.length ? (
              <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={15} aria-hidden /> Không có cấu kiện thuộc nhóm này trong phạm vi.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <BimTable className="w-full text-left text-2xs">
                    <thead className="text-txt-muted">
                      <tr>
                        <th className="p-2">Cấu kiện</th>
                        <th className="p-2">Tầng / nguồn</th>
                        {actions.onLocate && <th className="p-2">Mô hình</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.slice(currentPage * PAGE, currentPage * PAGE + PAGE).map((row) => (
                        <tr key={elementKey(row)} className="border-t border-border dark:border-slate-700">
                          <td className="max-w-60 break-words p-2">
                            <b>{row.ten_cau_kien ?? getIfcLabel(row.loai_cau_kien)}</b>
                            <div className="text-txt-muted">
                              {modelName(row.model_id)} · #{row.express_id}
                            </div>
                          </td>
                          <td className="p-2">
                            {row.phan_doan_tang ?? 'Thiếu tầng'}
                            <div className="text-txt-muted">
                              {SOURCE_LABEL[row.nguon_khoi_luong ?? ''] ?? 'Chưa có nguồn'}
                            </div>
                          </td>
                          {actions.onLocate && (
                            <td className="p-2">
                              <button
                                type="button"
                                className={btn}
                                onClick={() => actions.onLocate?.(row)}
                                aria-label={`Định vị ${row.ten_cau_kien ?? row.express_id}`}
                              >
                                <Crosshair size={13} aria-hidden />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </BimTable>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className={btn}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Trước
                  </button>
                  <span>
                    {currentPage + 1}/{pageCount} · {num(list.length)} cấu kiện
                  </span>
                  <button
                    type="button"
                    className={btn}
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            )}
            {canEdit && actions.onDraft && list.length > 0 && (
              <button
                type="button"
                className={btn}
                onClick={() =>
                  actions.onDraft?.(
                    `Bổ sung ${QUALITY_FINDINGS[finding].toLowerCase()}`,
                    `${w.scopeLabel}\n${list.length} cấu kiện cần rà soát. Nguồn IFC cập nhật ${dateTime(w.dataAt)}.\nCác cấu kiện đầu:\n${list
                      .slice(0, 10)
                      .map(
                        (row) =>
                          `${modelName(row.model_id)} / ${row.global_id} / ${row.ten_cau_kien ?? getIfcLabel(row.loai_cau_kien)}`,
                      )
                      .join('\n')}`,
                    list[0],
                  )
                }
              >
                Lập nháp yêu cầu bổ sung <ArrowUpRight size={13} aria-hidden />
              </button>
            )}
          </section>

          <section className={`${card} space-y-2`}>
            <h3 className="font-bold">Liên kết hồ sơ và công việc</h3>
            {w.linksError ? (
              <p role="alert" className="text-rose-600">
                Chưa tải được nguồn liên kết: {w.linksError.message}
              </p>
            ) : !w.coverage ? (
              <p className="text-txt-muted">Đang tải hồ sơ liên kết…</p>
            ) : (
              <div className="space-y-1">
                <Bar
                  label="Có hồ sơ tài liệu"
                  value={w.coverage.documents}
                  max={w.coverage.scope}
                  text={`${num(w.coverage.documents)}/${num(w.coverage.scope)}`}
                  tone="bg-cyan-600 dark:bg-cyan-600"
                />
                <Bar
                  label="Nghiệm thu đạt"
                  value={w.coverage.accepted}
                  max={w.coverage.scope}
                  text={num(w.coverage.accepted)}
                  tone="bg-emerald-500 dark:bg-emerald-500"
                />
                <Bar
                  label="Gắn công việc"
                  value={w.coverage.tasks}
                  max={w.coverage.scope}
                  text={num(w.coverage.tasks)}
                  tone="bg-violet-500 dark:bg-violet-500"
                />
              </div>
            )}
            <p className="text-2xs text-txt-muted">
              Đếm theo GUID trong phạm vi; trạng thái hồ sơ và công việc không suy từ hình học IFC.
            </p>
          </section>

          {byType.nhom.length > 0 && (
            <section className={`${card} space-y-1`}>
              <h3 className="font-bold">Cơ cấu cấu kiện</h3>
              {byType.nhom.map((g) => (
                <Bar
                  key={g.nhom}
                  label={getIfcLabel(g.nhom)}
                  value={g.so_luong}
                  max={maxTypeCount}
                  text={num(g.so_luong)}
                />
              ))}
              <p className="text-2xs text-txt-muted">
                Thể tích {num(byType.tong.the_tich_m3)} m³ · diện tích {num(byType.tong.dien_tich_m2)} m² ·{' '}
                {byType.so_nhom} loại
                {byType.bi_gioi_han ? ' (hiển thị 8 loại nhiều nhất)' : ''}. {byType.ghi_chu ?? ''}
              </p>
            </section>
          )}
        </>
      )}

      <ProjectControls value={w} />
      <BimUsageSummary projectId={w.projectId} />
    </div>
  );
}
