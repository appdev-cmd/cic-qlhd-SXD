import { formatDate as sxdFormatDate } from '@/lib/utils';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Project sustainability workspace (tab "Bền vững"): indicators and targets, emission factors and material mapping
// (organization library for org admins), monthly meters, LCA/LCC versions, QCVN 04-3:2026 and the energy audit log.
import React, { useMemo, useState } from 'react';
import { Check, Download, FileUp, Minus, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useAuth } from '@/features/bim-suite/adapters/context';
import {
  useAssessments,
  useCarbonRows,
  useFactors,
  useMaterialMaps,
  useMeters,
  useOrgFactors,
  useRefreshSustain,
  useSustainIndex,
  useTargets,
} from '../../hooks/useBimSustain';
import {
  BimSustainService,
  type AssessmentResult,
  type Factor,
  type MaterialMap,
  type SustainIndex,
} from '../../services/BimSustainService';
import { downloadTemplate, readFirstSheet } from '../../lib/planImport';
import {
  FRAMEWORK_LABELS,
  METER_LABELS,
  RELIABILITY_LABELS,
  STAGE_LABELS,
  TARGET_LABELS,
  parseFactorSheet,
  parseMeterSheet,
  type FactorImportRow,
} from '../../lib/sustainability';
import { BimQcvnSection } from './BimQcvnSection';

export interface BimSustainWorkspaceProps {
  projectId: string;
  canWrite: boolean;
  canManage: boolean;
  organizationId: string | null;
  isOrgAdmin: boolean;
}

type View = 'chi-so' | 'he-so' | 'van-hanh' | 'lca' | 'qcvn';
const VIEWS: [View, string][] = [
  ['chi-so', 'Chỉ số và mục tiêu'],
  ['he-so', 'Hệ số và ánh xạ vật liệu'],
  ['van-hanh', 'Sổ đo vận hành'],
  ['lca', 'LCA / LCC'],
  ['qcvn', 'QCVN 04-3 và kiểm toán'],
];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : formatNumber(Number(v), d);
const toNum = (v: string) => Number(v.trim().replace(/\./g, '').replace(',', '.'));
const field =
  'rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';
const title = 'text-sm font-bold text-txt-primary dark:text-white';
const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

function printHtml(heading: string, body: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(heading)}</title><style>body{font-family:Inter,Arial,sans-serif;font-size:12px;margin:24px;color:#1d1c1c}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f3f0e8}td.n{text-align:right}p{color:#555}</style></head><body><h1 style="font-size:16px">${esc(heading)}</h1><p>Lập lúc ${esc(formatDateTime(new Date()))}</p>${body}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

function targetValue(ix: SustainIndex | undefined, key: string): number | null {
  const v = ix ? (ix as unknown as Record<string, number | null>)[key] : null;
  return v === undefined ? null : v;
}

function ErrorNote({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      {errorText(error)}
    </p>
  );
}

function useRun() {
  const { addToast } = useToast();
  const refresh = useRefreshSustain();
  return async (label: string, task: () => Promise<unknown>) => {
    try {
      await task();
      refresh();
      addToast({ type: 'success', message: label });
      return true;
    } catch (e) {
      addToast({ type: 'error', title: 'Không thực hiện được', message: errorText(e) });
      return false;
    }
  };
}

// ── Indicators (bim_6d_chi_so), floor area and targets ──
function Indicators({
  projectId,
  canWrite,
  ix,
  ixError,
}: {
  projectId: string;
  canWrite: boolean;
  ix: SustainIndex | undefined;
  ixError: unknown;
}) {
  const { addToast } = useToast();
  const run = useRun();
  const targets = useTargets(projectId);
  const [area, setArea] = useState('');
  const [target, setTarget] = useState({ chi_so: 'carbon_ngam_m2', gia_tri: '', khung: 'QCVN09:2017' });
  const cards: [string, string, string?][] = [
    ['Diện tích sàn', ix?.dien_tich_san ? `${fmt(ix.dien_tich_san, 0)} m²` : 'Chưa khai báo'],
    [
      'Carbon ngầm (A1–A3)',
      ix?.carbon_ngam_kg != null ? `${fmt(ix.carbon_ngam_kg / 1000, 2)} tCO₂e` : 'Chưa tính',
      ix
        ? `${formatNumber(ix.so_ck_da_tinh, 2)} cấu kiện đã tính, ${formatNumber(ix.so_ck_thieu, 2)} thiếu`
        : undefined,
    ],
    ['Carbon ngầm / m² sàn', ix?.carbon_ngam_m2 != null ? `${fmt(ix.carbon_ngam_m2)} kgCO₂e/m²` : '—'],
    ['EUI', ix?.eui != null ? `${fmt(ix.eui)} kWh/m²/năm` : `${ix?.so_thang_dien ?? 0}/12 tháng số đo điện`],
    ['WUI', ix?.wui != null ? `${fmt(ix.wui, 2)} m³/m²/năm` : '—'],
    ['Điện tái tạo', ix?.ty_le_tai_tao != null ? `${fmt(ix.ty_le_tai_tao)}%` : '—'],
    [
      'Carbon vận hành',
      ix?.carbon_van_hanh_kg_nam != null ? `${fmt(ix.carbon_van_hanh_kg_nam / 1000, 2)} tCO₂e/năm` : 'Chưa đủ dữ liệu',
      ix?.he_so_luoi_dien
        ? `Lưới điện ${fmt(ix.he_so_luoi_dien.he_so, 4)} kgCO₂e/kWh · ${ix.he_so_luoi_dien.nguon}`
        : 'Chưa có hệ số LUOI_DIEN_VN (B6)',
    ],
  ];
  const print = () => {
    const rows = cards
      .map(
        ([k, v, note]) =>
          `<tr><th>${esc(k)}</th><td>${esc(v)}${note ? `<br><small>${esc(note)}</small>` : ''}</td></tr>`,
      )
      .join('');
    const tg = (targets.data ?? [])
      .map((t) => {
        const meta = TARGET_LABELS[t.chi_so];
        const cur = targetValue(ix, t.chi_so);
        const ok =
          cur === null
            ? 'Chưa đo được'
            : (t.chieu === 'toi_da' ? cur <= t.gia_tri : cur >= t.gia_tri)
              ? 'Đạt'
              : 'Chưa đạt';
        return `<tr><td>${esc(meta?.label ?? t.chi_so)}</td><td>${esc(FRAMEWORK_LABELS[t.khung] ?? t.khung)}</td><td class="n">${t.chieu === 'toi_da' ? '≤' : '≥'} ${fmt(t.gia_tri, 2)} ${esc(meta?.unit)}</td><td class="n">${fmt(cur, 2)}</td><td>${ok}</td></tr>`;
      })
      .join('');
    const body = `<table><tbody>${rows}</tbody></table>${tg ? `<h2 style="font-size:14px">Mục tiêu</h2><table><thead><tr><th>Chỉ số</th><th>Khung</th><th>Mục tiêu</th><th>Hiện tại</th><th>Kết quả</th></tr></thead><tbody>${tg}</tbody></table>` : ''}<p>Carbon ngầm giai đoạn A1–A3 tính theo cấu kiện với hệ số có nguồn; cấu kiện thiếu hệ số không tính là 0. EUI, WUI cần đủ 12 tháng số đo.</p>`;
    if (!printHtml('Báo cáo chỉ số bền vững của dự án', body))
      addToast({ type: 'error', message: 'Trình duyệt chặn cửa sổ in.' });
  };
  return (
    <div className="space-y-3">
      {ixError ? <ErrorNote error={ixError} /> : null}
      <section className={card} aria-labelledby="bim-6d-index">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-6d-index" className={title}>
            Chỉ số bền vững
          </h3>
          <button type="button" className={btn} onClick={print}>
            <Printer className="h-3 w-3" aria-hidden /> Báo cáo PDF
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {cards.map(([k, v, note]) => (
            <div key={k} className="rounded-xl border border-border p-2 dark:border-slate-600">
              <p className="text-2xs text-txt-secondary dark:text-slate-300">{k}</p>
              <p className="font-mono text-sm font-bold text-txt-primary dark:text-white">{v}</p>
              {note && <p className="mt-0.5 text-2xs text-txt-muted">{note}</p>}
            </div>
          ))}
        </div>
        {canWrite && (
          <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
            <label className="block font-semibold">
              Diện tích sàn (m²)
              <BimInput
                inputMode="decimal"
                value={area}
                placeholder={ix?.dien_tich_san ? fmt(ix.dien_tich_san, 0) : 'Chưa khai báo'}
                onChange={(e) => setArea(e.target.value)}
                className={`${field} mt-1 block w-36`}
              />
            </label>
            <button
              type="button"
              className={btn}
              disabled={!area.trim() || !(toNum(area) > 0)}
              onClick={() =>
                void run('Đã lưu diện tích sàn.', () => BimSustainService.setFloorArea(projectId, toNum(area))).then(
                  (ok) => ok && setArea(''),
                )
              }
            >
              <Save className="h-3 w-3" aria-hidden /> Lưu
            </button>
            <span className="text-2xs text-txt-muted">
              Mẫu số của EUI, WUI, carbon/m²; dùng chung với hồ sơ khu đất (Phân tích khu đất).
            </span>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="bim-6d-targets">
        <h3 id="bim-6d-targets" className={`mb-2 ${title}`}>
          Mục tiêu và chứng nhận
        </h3>
        {targets.error ? (
          <ErrorNote error={targets.error} />
        ) : (
          <BimTable className="w-full text-xs">
            <thead className="text-left text-txt-secondary dark:text-slate-300">
              <tr>
                <th className="py-1">Chỉ số</th>
                <th>Khung</th>
                <th className="text-right">Mục tiêu</th>
                <th className="text-right">Hiện tại</th>
                <th className="pl-2">Kết quả</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(targets.data ?? []).map((t) => {
                const meta = TARGET_LABELS[t.chi_so];
                const cur = targetValue(ix, t.chi_so);
                const ok = cur === null ? null : t.chieu === 'toi_da' ? cur <= t.gia_tri : cur >= t.gia_tri;
                return (
                  <tr key={t.id} className="border-t border-border/60 dark:border-slate-700">
                    <td className="py-1">{meta?.label ?? t.chi_so}</td>
                    <td>{FRAMEWORK_LABELS[t.khung] ?? t.khung}</td>
                    <td className="text-right font-mono">
                      {t.chieu === 'toi_da' ? '≤' : '≥'} {fmt(t.gia_tri, 2)} {meta?.unit}
                    </td>
                    <td className="text-right font-mono">{fmt(cur, 2)}</td>
                    <td className="pl-2">
                      {ok === null ? (
                        <span className="inline-flex items-center gap-1 text-txt-muted">
                          <Minus className="h-3 w-3" aria-hidden />
                          Chưa đo được
                        </span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3 w-3" aria-hidden />
                          Đạt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                          <X className="h-3 w-3" aria-hidden />
                          Chưa đạt
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {canWrite && (
                        <button
                          type="button"
                          aria-label="Xóa mục tiêu"
                          onClick={() => void run('Đã xóa mục tiêu.', () => BimSustainService.deleteTarget(t.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!(targets.data ?? []).length && (
                <tr>
                  <td colSpan={6} className="py-1 text-txt-muted">
                    Chưa đặt mục tiêu.
                  </td>
                </tr>
              )}
            </tbody>
          </BimTable>
        )}
        {canWrite && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <BimSelect
              aria-label="Chỉ số"
              value={target.chi_so}
              onChange={(e) => setTarget({ ...target, chi_so: e.target.value })}
              className={field}
            >
              {Object.entries(TARGET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.unit})
                </option>
              ))}
            </BimSelect>
            <BimSelect
              aria-label="Khung"
              value={target.khung}
              onChange={(e) => setTarget({ ...target, khung: e.target.value })}
              className={field}
            >
              {Object.entries(FRAMEWORK_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </BimSelect>
            <BimInput
              aria-label="Giá trị mục tiêu"
              inputMode="decimal"
              value={target.gia_tri}
              onChange={(e) => setTarget({ ...target, gia_tri: e.target.value })}
              placeholder="Giá trị"
              className={`${field} w-24`}
            />
            <button
              type="button"
              className={btn}
              disabled={!target.gia_tri.trim() || !Number.isFinite(Number(target.gia_tri.replace(',', '.')))}
              onClick={() =>
                void run('Đã lưu mục tiêu.', () =>
                  BimSustainService.saveTarget({
                    project_id: projectId,
                    chi_so: target.chi_so,
                    gia_tri: Number(target.gia_tri.replace(',', '.')),
                    khung: target.khung,
                    chieu: TARGET_LABELS[target.chi_so].chieu,
                    han: null,
                    ghi_chu: null,
                  }),
                ).then((ok) => ok && setTarget({ ...target, gia_tri: '' }))
              }
            >
              <Plus className="h-3 w-3" aria-hidden /> Lưu mục tiêu
            </button>
          </div>
        )}
        <p className="mt-1 text-2xs text-txt-muted">Hệ thống theo dõi chỉ số so với mục tiêu, không cấp chứng nhận.</p>
      </section>
    </div>
  );
}

// ── Emission factors ──
const FACTOR_TEMPLATE_HEADERS = [
  'Mã vật liệu',
  'Tên',
  'Đơn vị',
  'Giai đoạn',
  'Hệ số (kgCO2e/đơn vị)',
  'Nguồn',
  'Phiên bản',
  'Độ tin cậy',
  'Hiệu lực từ',
  'Hiệu lực đến',
];
const FACTOR_TEMPLATE_ROWS = [
  [
    'BETONG_B30',
    '(tên vật liệu)',
    'm3',
    'A1-A3',
    '(số theo nguồn)',
    '(EPD / cơ sở dữ liệu / văn bản)',
    '1',
    'EPD VN',
    '',
    '',
  ],
  [
    'LUOI_DIEN_VN',
    'Điện lưới quốc gia',
    'kWh',
    'B6',
    '(số công bố)',
    '(văn bản công bố)',
    '',
    'Công bố nhà nước',
    '',
    '',
  ],
];

function FactorImport({ label, onImport }: { label: string; onImport: (rows: FactorImportRow[]) => Promise<boolean> }) {
  const { addToast } = useToast();
  const [pending, setPending] = useState<ReturnType<typeof parseFactorSheet> | null>(null);
  return (
    <>
      <label className={`${btn} cursor-pointer`}>
        <FileUp className="h-3 w-3" aria-hidden /> {label}
        <BimInput
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setPending(parseFactorSheet(await readFirstSheet(f)));
            } catch (err) {
              addToast({ type: 'error', message: errorText(err) });
            }
          }}
        />
      </label>
      {pending && (
        <div className="basis-full rounded-xl bg-bg-subtle p-2 text-xs dark:bg-slate-900">
          <p>
            {pending.rows.length} hệ số hợp lệ
            {pending.warnings.length
              ? `, ${pending.warnings.length} dòng bị bỏ: ${pending.warnings.slice(0, 3).join(' ')}`
              : ''}
            .
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={primary}
              disabled={!pending.rows.length}
              onClick={() => void onImport(pending.rows).then((ok) => ok && setPending(null))}
            >
              Nạp {pending.rows.length} hệ số
            </button>
            <button type="button" className={btn} onClick={() => setPending(null)}>
              Bỏ
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FactorTable({ rows }: { rows: Factor[] }) {
  return (
    <BimTable className="w-full min-w-[820px] text-xs">
      <thead className="text-left text-txt-secondary dark:text-slate-300">
        <tr>
          <th className="py-1.5 pr-2">Mã</th>
          <th className="pr-2">Tên</th>
          <th className="pr-2">Giai đoạn</th>
          <th className="pr-2 text-right">kgCO₂e / đơn vị</th>
          <th className="pr-2">Nguồn</th>
          <th className="pr-2">Độ tin cậy</th>
          <th>Hiệu lực</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.id} className="border-t border-border/60 dark:border-slate-700">
            <td className="py-1 pr-2 font-mono">
              {f.ma_vat_lieu}
              {f.project_id ? (
                <span className="ml-1 rounded bg-primary-50 px-1 text-2xs text-primary-800 dark:bg-primary-950 dark:text-primary-200">
                  dự án
                </span>
              ) : (
                <span className="ml-1 rounded bg-bg-subtle px-1 text-2xs text-txt-secondary dark:bg-slate-700 dark:text-slate-200">
                  đơn vị
                </span>
              )}
            </td>
            <td className="pr-2">{f.ten}</td>
            <td className="pr-2">{STAGE_LABELS[f.giai_doan] ?? f.giai_doan}</td>
            <td className="pr-2 text-right font-mono">
              {fmt(f.he_so, 4)} / {f.don_vi}
            </td>
            <td className="pr-2">
              {f.nguon} · v{f.phien_ban}
            </td>
            <td className="pr-2">{RELIABILITY_LABELS[f.do_tin_cay] ?? f.do_tin_cay}</td>
            <td className="font-mono text-2xs">
              {f.hieu_luc_tu ?? '…'} → {f.hieu_luc_den ?? '…'}
            </td>
          </tr>
        ))}
      </tbody>
    </BimTable>
  );
}

function OrgLibrary({ organizationId }: { organizationId: string }) {
  const run = useRun();
  const lib = useOrgFactors(organizationId);
  return (
    <section className={`${card} overflow-x-auto`} aria-labelledby="bim-6d-org-factors">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="bim-6d-org-factors" className={title}>
          Thư viện hệ số của đơn vị (dùng cho mọi dự án)
        </h3>
        <div className="flex flex-wrap gap-1">
          <FactorImport
            label="Nạp vào thư viện đơn vị"
            onImport={(rows) =>
              run(`Đã nạp ${rows.length} hệ số vào thư viện đơn vị.`, () =>
                BimSustainService.importFactors({ organizationId }, rows),
              )
            }
          />
        </div>
      </div>
      {lib.error ? (
        <ErrorNote error={lib.error} />
      ) : !(lib.data ?? []).length ? (
        <p className="text-xs text-txt-muted">Thư viện đơn vị chưa có hệ số.</p>
      ) : (
        <FactorTable rows={lib.data ?? []} />
      )}
      <p className="mt-1 text-2xs text-txt-muted">
        Chỉ quản trị đơn vị nạp được. Dự án dùng hệ số riêng của dự án trước, thiếu thì lấy thư viện đơn vị, bản hiệu
        lực mới nhất. Hệ số không sửa tại chỗ: nạp phiên bản mới để kết quả cũ vẫn truy ngược được.
      </p>
    </section>
  );
}

function FactorsAndMaps({
  projectId,
  canWrite,
  organizationId,
  isOrgAdmin,
}: {
  projectId: string;
  canWrite: boolean;
  organizationId: string | null;
  isOrgAdmin: boolean;
}) {
  const { addToast } = useToast();
  const run = useRun();
  const factors = useFactors(projectId, organizationId);
  const maps = useMaterialMaps(projectId);
  const carbon = useCarbonRows(projectId);
  const [draft, setDraft] = useState<Omit<MaterialMap, 'id' | 'project_id'>[] | null>(null);
  const editing =
    draft ??
    (maps.data ?? []).map(({ mau_vat_lieu, loai_cau_kien, ma_vat_lieu, dai_luong, uu_tien }) => ({
      mau_vat_lieu,
      loai_cau_kien,
      ma_vat_lieu,
      dai_luong,
      uu_tien,
    }));
  const codes = useMemo(
    () => [...new Set((factors.data ?? []).filter((f) => f.giai_doan === 'A1-A3').map((f) => f.ma_vat_lieu))].sort(),
    [factors.data],
  );
  const unmapped = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of carbon.data ?? [])
      if (r.trang_thai === 'thieu_anh_xa' && r.vat_lieu) m.set(r.vat_lieu, (m.get(r.vat_lieu) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [carbon.data]);
  const set = (i: number, patch: Partial<(typeof editing)[number]>) =>
    setDraft(editing.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () =>
    void run('Đã lưu ánh xạ vật liệu. Tính lại carbon trong trình xem để áp dụng.', () =>
      BimSustainService.saveMaps(
        projectId,
        editing.filter((r) => r.mau_vat_lieu.trim() && r.ma_vat_lieu),
      ),
    ).then((ok) => ok && setDraft(null));
  const cell =
    'w-full rounded border border-border bg-white px-1 py-0.5 text-2xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

  return (
    <div className="space-y-3">
      <section className={`${card} overflow-x-auto`} aria-labelledby="bim-6d-factors">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-6d-factors" className={title}>
            Hệ số phát thải dùng cho dự án
          </h3>
          <div className="flex flex-wrap gap-1">
            {canWrite && (
              <FactorImport
                label="Nạp hệ số riêng dự án"
                onImport={(rows) =>
                  run(`Đã nạp ${rows.length} hệ số.`, () => BimSustainService.importFactors({ projectId }, rows))
                }
              />
            )}
            <button
              type="button"
              className={btn}
              onClick={() =>
                void downloadTemplate('mau-he-so-phat-thai.xlsx', FACTOR_TEMPLATE_HEADERS, FACTOR_TEMPLATE_ROWS).catch(
                  (e) => addToast({ type: 'error', message: errorText(e) }),
                )
              }
            >
              <Download className="h-3 w-3" aria-hidden /> Tệp mẫu
            </button>
          </div>
        </div>
        {factors.error ? (
          <ErrorNote error={factors.error} />
        ) : !(factors.data ?? []).length ? (
          <p className="text-xs text-txt-secondary dark:text-slate-300">
            Chưa có hệ số. Hệ thống không tự điền hệ số: nạp từ EPD, cơ sở dữ liệu hoặc văn bản công bố, mỗi dòng ghi rõ
            nguồn. Hệ số lưới điện dùng mã LUOI_DIEN_VN, giai đoạn B6; nước cấp dùng NUOC_CAP, B7.
          </p>
        ) : (
          <FactorTable rows={factors.data ?? []} />
        )}
      </section>

      {isOrgAdmin && organizationId && <OrgLibrary organizationId={organizationId} />}

      <section className={card} aria-labelledby="bim-6d-maps">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-6d-maps" className={title}>
            Ánh xạ vật liệu mô hình → mã vật liệu
          </h3>
          {canWrite && (
            <div className="flex gap-1">
              <button
                type="button"
                className={btn}
                onClick={() =>
                  setDraft([
                    ...editing,
                    {
                      mau_vat_lieu: '',
                      loai_cau_kien: null,
                      ma_vat_lieu: codes[0] ?? '',
                      dai_luong: 'm3',
                      uu_tien: 100,
                    },
                  ])
                }
              >
                <Plus className="h-3 w-3" aria-hidden /> Thêm dòng
              </button>
              <button type="button" className={btn} disabled={!draft} onClick={save}>
                <Save className="h-3 w-3" aria-hidden /> Lưu ánh xạ
              </button>
            </div>
          )}
        </div>
        {maps.error ? (
          <ErrorNote error={maps.error} />
        ) : (
          <BimTable className="w-full text-xs">
            <thead className="text-left text-txt-secondary dark:text-slate-300">
              <tr>
                <th className="py-1">Mẫu tên vật liệu (% là ký tự bất kỳ)</th>
                <th>Chỉ áp cho loại IFC</th>
                <th>Mã vật liệu</th>
                <th>Đại lượng</th>
                <th className="w-16">Ưu tiên</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {editing.map((r, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-1">
                    <BimInput
                      aria-label="Mẫu tên vật liệu"
                      disabled={!canWrite}
                      value={r.mau_vat_lieu}
                      onChange={(e) => set(i, { mau_vat_lieu: e.target.value })}
                      className={cell}
                      placeholder="%bê tông%"
                    />
                  </td>
                  <td className="pr-1">
                    <BimInput
                      aria-label="Loại IFC"
                      disabled={!canWrite}
                      value={r.loai_cau_kien ?? ''}
                      onChange={(e) => set(i, { loai_cau_kien: e.target.value.toUpperCase() || null })}
                      className={`${cell} font-mono`}
                      placeholder="(mọi loại)"
                    />
                  </td>
                  <td className="pr-1">
                    <BimSelect
                      aria-label="Mã vật liệu"
                      disabled={!canWrite}
                      value={r.ma_vat_lieu}
                      onChange={(e) => set(i, { ma_vat_lieu: e.target.value })}
                      className={cell}
                    >
                      {[...new Set([r.ma_vat_lieu, ...codes])].filter(Boolean).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </BimSelect>
                  </td>
                  <td className="pr-1">
                    <BimSelect
                      aria-label="Đại lượng"
                      disabled={!canWrite}
                      value={r.dai_luong}
                      onChange={(e) => set(i, { dai_luong: e.target.value as MaterialMap['dai_luong'] })}
                      className={cell}
                    >
                      {(['m3', 'm2', 'm', 'kg', 'cai'] as const).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </BimSelect>
                  </td>
                  <td className="pr-1">
                    <BimInput
                      aria-label="Ưu tiên"
                      disabled={!canWrite}
                      type="number"
                      value={r.uu_tien}
                      onChange={(e) => set(i, { uu_tien: Number(e.target.value) || 100 })}
                      className={cell}
                    />
                  </td>
                  <td>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label="Xóa dòng ánh xạ"
                        onClick={() => setDraft(editing.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!editing.length && (
                <tr>
                  <td colSpan={6} className="py-2 text-txt-muted">
                    Chưa có ánh xạ riêng dự án.
                  </td>
                </tr>
              )}
            </tbody>
          </BimTable>
        )}
        {unmapped.length > 0 && (
          <div className="mt-2 text-2xs text-txt-secondary dark:text-slate-300">
            Vật liệu trong mô hình chưa ánh xạ (lần tính gần nhất):{' '}
            {unmapped.map(([v, n]) => (
              <button
                key={v}
                type="button"
                disabled={!canWrite}
                className="mr-1 mt-1 rounded border border-border px-1 hover:bg-bg-subtle disabled:opacity-60 dark:border-slate-600"
                onClick={() =>
                  setDraft([
                    ...editing,
                    { mau_vat_lieu: v, loai_cau_kien: null, ma_vat_lieu: codes[0] ?? '', dai_luong: 'm3', uu_tien: 50 },
                  ])
                }
              >
                {v} ({n})
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Monthly meters ──
function Meters({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const { addToast } = useToast();
  const run = useRun();
  const meters = useMeters(projectId);
  const [pending, setPending] = useState<ReturnType<typeof parseMeterSheet> | null>(null);
  const [manual, setManual] = useState({ ky: today().slice(0, 7), loai: 'dien', gia_tri: '' });
  const monthly = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const r of meters.data ?? []) {
      const row = m.get(r.ky) ?? {};
      // Invoice wins over manual entry for the same month
      if (!row[r.loai] || r.nguon === 'hoa_don')
        row[r.loai] = `${fmt(r.gia_tri, 0)}${r.nguon === 'hoa_don' ? ' (HĐ)' : ''}`;
      m.set(r.ky, row);
    }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 24);
  }, [meters.data]);
  return (
    <section className={card} aria-labelledby="bim-6d-meters">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="bim-6d-meters" className={title}>
          Sổ đo vận hành theo tháng
        </h3>
        {canWrite && (
          <div className="flex flex-wrap gap-1">
            <label className={`${btn} cursor-pointer`}>
              <FileUp className="h-3 w-3" aria-hidden /> Nhập Excel
              <BimInput
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setPending(parseMeterSheet(await readFirstSheet(f)));
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
                void downloadTemplate(
                  'mau-so-do.xlsx',
                  ['Tháng', 'Loại', 'Giá trị', 'Nguồn', 'Ghi chú'],
                  [
                    ['01/2026', 'Điện', '', 'Hóa đơn', ''],
                    ['01/2026', 'Nước', '', 'Hóa đơn', ''],
                  ],
                ).catch((e) => addToast({ type: 'error', message: errorText(e) }))
              }
            >
              <Download className="h-3 w-3" aria-hidden /> Tệp mẫu
            </button>
          </div>
        )}
      </div>
      {pending && (
        <div className="mb-2 rounded-xl bg-bg-subtle p-2 text-xs dark:bg-slate-900">
          {pending.rows.length} số đo hợp lệ
          {pending.warnings.length
            ? `; ${pending.warnings.length} dòng bỏ qua: ${pending.warnings.slice(0, 3).join(' ')}`
            : ''}
          .
          <button
            type="button"
            className={`${primary} ml-2`}
            disabled={!pending.rows.length}
            onClick={() =>
              void run(`Đã nhập ${pending.rows.length} số đo.`, () =>
                BimSustainService.importMeters(projectId, pending.rows),
              ).then((ok) => ok && setPending(null))
            }
          >
            Nhập
          </button>
          <button type="button" className={`${btn} ml-1`} onClick={() => setPending(null)}>
            Bỏ
          </button>
        </div>
      )}
      {canWrite && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <BimInput
            aria-label="Tháng"
            type="month"
            value={manual.ky}
            onChange={(e) => setManual({ ...manual, ky: e.target.value })}
            className={field}
          />
          <BimSelect
            aria-label="Loại"
            value={manual.loai}
            onChange={(e) => setManual({ ...manual, loai: e.target.value })}
            className={field}
          >
            {Object.entries(METER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} ({v.unit})
              </option>
            ))}
          </BimSelect>
          <BimInput
            aria-label="Giá trị"
            inputMode="decimal"
            value={manual.gia_tri}
            onChange={(e) => setManual({ ...manual, gia_tri: e.target.value })}
            placeholder="Giá trị"
            className={`${field} w-28`}
          />
          <button
            type="button"
            className={btn}
            disabled={!manual.gia_tri.trim() || !manual.ky || !(toNum(manual.gia_tri) >= 0)}
            onClick={() =>
              void run('Đã ghi số đo.', () =>
                BimSustainService.importMeters(projectId, [
                  {
                    loai: manual.loai as 'dien',
                    ky: `${manual.ky}-01`,
                    gia_tri: toNum(manual.gia_tri),
                    nguon: 'nhap_tay',
                  },
                ]),
              ).then((ok) => ok && setManual({ ...manual, gia_tri: '' }))
            }
          >
            <Plus className="h-3 w-3" aria-hidden /> Ghi
          </button>
        </div>
      )}
      {meters.error ? (
        <ErrorNote error={meters.error} />
      ) : !monthly.length ? (
        <p className="text-xs text-txt-muted">Chưa có số đo.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <BimTable className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-surface text-left text-txt-secondary dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="py-1">Tháng</th>
                {Object.entries(METER_LABELS).map(([k, v]) => (
                  <th key={k} className="text-right">
                    {v.label} ({v.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.map(([ky, row]) => (
                <tr key={ky} className="border-t border-border/60 dark:border-slate-700">
                  <td className="py-0.5 font-mono">{ky.slice(0, 7)}</td>
                  {Object.keys(METER_LABELS).map((k) => (
                    <td key={k} className="text-right font-mono">
                      {row[k] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </BimTable>
        </div>
      )}
      <p className="mt-1 text-2xs text-txt-muted">
        Một tháng có nhiều nguồn: ưu tiên hóa đơn (HĐ), rồi nhập tay. EUI và WUI cần đủ 12 tháng.
      </p>
    </section>
  );
}

// ── LCA / LCC versions ──
const PARAMS = [
  ['tuoi_tho_nam', 'Tuổi thọ (năm)'],
  ['ty_le_chiet_khau', 'Chiết khấu (%/năm)'],
  ['chi_phi_dau_tu', 'Chi phí đầu tư (đồng)'],
  ['don_gia_dien', 'Đơn giá điện (đ/kWh)'],
  ['don_gia_nuoc', 'Đơn giá nước (đ/m³)'],
  ['chi_phi_bao_tri_nam', 'Bảo trì năm (đồng)'],
] as const;

function Lifecycle({ projectId, canWrite, canManage }: { projectId: string; canWrite: boolean; canManage: boolean }) {
  const { supabaseUser } = useAuth();
  const { addToast } = useToast();
  const run = useRun();
  const assessments = useAssessments(projectId);
  const [params, setParams] = useState<Record<string, string>>({
    tuoi_tho_nam: '50',
    ty_le_chiet_khau: '8',
    chi_phi_dau_tu: '',
    don_gia_dien: '',
    don_gia_nuoc: '',
    chi_phi_bao_tri_nam: '',
  });
  const [preview, setPreview] = useState<AssessmentResult | null>(null);
  const [name, setName] = useState('');
  const numParams = () =>
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.trim() === '' ? null : toNum(v)]));
  const printAssessment = (a: NonNullable<typeof assessments.data>[number]) => {
    const k = a.ket_qua;
    const rows: [string, string][] = [
      ['Tuổi thọ', `${k.tuoi_tho_nam} năm`],
      ['Chiết khấu', `${k.ty_le_chiet_khau}%/năm`],
      ['Carbon ngầm', `${fmt(k.carbon_ngam_kg, 0)} kgCO₂e`],
      ['Carbon vận hành', `${fmt(k.carbon_van_hanh_kg_nam, 0)} kgCO₂e/năm`],
      ['LCA', `${fmt(k.lca_kg, 0)} kgCO₂e (${fmt(k.lca_kg_m2)} kg/m²)`],
      ['Chi phí đầu tư', `${fmt(k.chi_phi_dau_tu, 0)} đồng`],
      ['Chi phí vận hành năm', `${fmt(k.chi_phi_van_hanh_nam, 0)} đồng`],
      ['LCC', `${fmt(k.lcc, 0)} đồng`],
    ];
    const body = `<p>${a.trang_thai === 'da_duyet' ? 'Đã duyệt' : 'Chờ duyệt'}</p><table><tbody>${rows.map(([x, v]) => `<tr><th>${esc(x)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>${k.ghi_chu.length ? `<p>${k.ghi_chu.map(esc).join('<br>')}</p>` : ''}`;
    if (!printHtml(`Đánh giá vòng đời · ${a.ten}`, body))
      addToast({ type: 'error', message: 'Trình duyệt chặn cửa sổ in.' });
  };
  return (
    <section className={card} aria-labelledby="bim-6d-lca">
      <h3 id="bim-6d-lca" className={`mb-2 ${title}`}>
        Đánh giá vòng đời (LCA) và chi phí vòng đời (LCC)
      </h3>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
        {PARAMS.map(([k, l]) => (
          <label key={k} className="block">
            {l}
            <BimInput
              inputMode="decimal"
              value={params[k]}
              onChange={(e) => setParams({ ...params, [k]: e.target.value })}
              placeholder={k === 'chi_phi_dau_tu' ? 'Trống: theo dự toán đã duyệt' : ''}
              className={`${field} mt-1 block w-full`}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primary}
          onClick={() =>
            void BimSustainService.evaluate(projectId, numParams()).then(setPreview, (e) =>
              addToast({ type: 'error', message: errorText(e) }),
            )
          }
        >
          Tính
        </button>
        {canWrite && preview && (
          <>
            <BimInput
              aria-label="Tên phiên bản đánh giá"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên phiên bản"
              className={field}
            />
            <button
              type="button"
              className={btn}
              disabled={!name.trim()}
              onClick={() =>
                void run('Đã lưu phiên bản đánh giá, chờ người khác duyệt.', () =>
                  BimSustainService.saveAssessment(projectId, name.trim(), numParams()),
                ).then((ok) => ok && setName(''))
              }
            >
              <Save className="h-3 w-3" aria-hidden /> Lưu phiên bản
            </button>
          </>
        )}
      </div>
      {preview && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
          {[
            ['Carbon ngầm', `${fmt(preview.carbon_ngam_kg != null ? preview.carbon_ngam_kg / 1000 : null, 2)} tCO₂e`],
            [
              'Vận hành',
              `${fmt(preview.carbon_van_hanh_kg_nam != null ? preview.carbon_van_hanh_kg_nam / 1000 : null, 2)} tCO₂e/năm`,
            ],
            [
              'LCA',
              `${fmt(preview.lca_kg != null ? preview.lca_kg / 1000 : null, 1)} tCO₂e (${fmt(preview.lca_kg_m2)} kg/m²)`,
            ],
            ['Vận hành năm', `${fmt(preview.chi_phi_van_hanh_nam, 0)} đ`],
            ['LCC', `${fmt(preview.lcc, 0)} đ`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-2 dark:border-slate-600">
              <p className="text-2xs text-txt-secondary dark:text-slate-300">{k}</p>
              <p className="font-mono text-sm font-bold text-txt-primary dark:text-white">{v}</p>
            </div>
          ))}
          {preview.ghi_chu.length > 0 && (
            <ul className="col-span-full list-disc pl-5 text-2xs text-amber-800 dark:text-amber-200">
              {preview.ghi_chu.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {assessments.error ? (
        <ErrorNote error={assessments.error} />
      ) : (
        (assessments.data ?? []).length > 0 && (
          <BimTable className="mt-3 w-full text-xs">
            <thead className="text-left text-txt-secondary dark:text-slate-300">
              <tr>
                <th className="py-1">Phiên bản</th>
                <th className="text-right">LCA kgCO₂e/m²</th>
                <th className="text-right">LCC (đồng)</th>
                <th className="pl-2">Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(assessments.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border/60 dark:border-slate-700">
                  <td className="py-1">
                    {a.ten} <span className="text-txt-muted">· {sxdFormatDate(new Date(a.created_at))}</span>
                  </td>
                  <td className="text-right font-mono">{fmt(a.ket_qua.lca_kg_m2)}</td>
                  <td className="text-right font-mono">{fmt(a.ket_qua.lcc, 0)}</td>
                  <td className="pl-2">
                    {a.trang_thai === 'da_duyet' ? (
                      <span className="text-emerald-700 dark:text-emerald-300">
                        Đã duyệt {a.duyet_luc ? sxdFormatDate(new Date(a.duyet_luc)) : ''}
                      </span>
                    ) : (
                      'Chờ duyệt'
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {canManage && a.trang_thai === 'nhap' && a.nguoi_lap_uid !== supabaseUser?.id && (
                      <button
                        type="button"
                        className={btn}
                        onClick={() => void run('Đã duyệt đánh giá.', () => BimSustainService.approveAssessment(a.id))}
                      >
                        <Check className="h-3 w-3" aria-hidden /> Duyệt
                      </button>
                    )}
                    <button type="button" className={`${btn} ml-1`} onClick={() => printAssessment(a)}>
                      <Printer className="h-3 w-3" aria-hidden /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </BimTable>
        )
      )}
      <p className="mt-1 text-2xs text-txt-muted">
        LCA = carbon ngầm A1–A3 + carbon vận hành năm × tuổi thọ (chưa gồm A4–A5, C1–C4 khi chưa có hệ số). LCC = đầu tư
        + chi phí vận hành năm × hệ số hiện giá. Quản lý dự án duyệt, người lập không tự duyệt; đã duyệt thì không sửa.
      </p>
    </section>
  );
}

export const BimSustainWorkspace: React.FC<BimSustainWorkspaceProps> = ({
  projectId,
  canWrite,
  canManage,
  organizationId,
  isOrgAdmin,
}) => {
  const [view, setView] = useState<View>('chi-so');
  const index = useSustainIndex(projectId);
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Bền vững" className="flex flex-wrap gap-1">
        {VIEWS.map(([id, text]) => (
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
      {view === 'chi-so' && (
        <Indicators projectId={projectId} canWrite={canWrite} ix={index.data} ixError={index.error} />
      )}
      {view === 'he-so' && (
        <FactorsAndMaps
          projectId={projectId}
          canWrite={canWrite}
          organizationId={organizationId}
          isOrgAdmin={isOrgAdmin}
        />
      )}
      {view === 'van-hanh' && <Meters projectId={projectId} canWrite={canWrite} />}
      {view === 'lca' && <Lifecycle projectId={projectId} canWrite={canWrite} canManage={canManage} />}
      {view === 'qcvn' && (
        <BimQcvnSection key={projectId} projectId={projectId} index={index.data} canWrite={canWrite} />
      )}
    </div>
  );
};
