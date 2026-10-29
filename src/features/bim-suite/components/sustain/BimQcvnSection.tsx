import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Sustainability workspace section: QCVN 04-3:2026 design inputs and checklist, EDGE baseline, designated energy user,
// energy audit / GHG inventory log.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useConfirm } from '@/features/bim-suite/adapters/ui';
import { BimQcvnService, type AuditRecord } from '../../services/BimQcvnService';
import type { SustainIndex } from '../../services/BimSustainService';
import {
  AUDIT_TYPES,
  CHILLER_TYPES,
  EDGE_MIN_SAVING,
  LPD_LIMITS,
  auditDue,
  edgeSavings,
  effectiveInputs,
  keyEnergyUser,
  qcvnChecklist,
  type AuditType,
  type QcvnInputs,
} from '../../lib/qcvn043';
import { StatusBadge } from './QcvnStatusBadge';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : formatNumber(Number(v), d));
const dmy = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const field =
  'rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const toText = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const toNum = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(/\./g, '').replace(',', '.')));

const NUM_FIELDS: [keyof Form, string][] = [
  ['shgc_kinh', 'SHGC kính'],
  ['u_tuong', 'U tường (W/m²·K)'],
  ['r0_tuong', 'hoặc R0 tường (m²·K/W)'],
  ['u_mai', 'U mái (W/m²·K)'],
  ['r0_mai', 'hoặc R0 mái (m²·K/W)'],
  ['chiller_cong_suat_kw', 'Năng suất lạnh chiller (kW)'],
  ['chiller_cop', 'COP chiller (kW/kW)'],
  ['lpd_thiet_ke', 'LPD thiết kế (W/m²)'],
  ['edge_eui_co_so', 'EDGE: EUI cơ sở (kWh/m²·năm)'],
  ['edge_wui_co_so', 'EDGE: nước cơ sở (m³/m²·năm)'],
  ['edge_vat_lieu_co_so', 'EDGE: vật liệu cơ sở (kgCO₂e/m²)'],
];
type Form = Record<
  | 'loai_cong_trinh'
  | 'chiller_loai'
  | 'nguon'
  | 'shgc_kinh'
  | 'u_tuong'
  | 'r0_tuong'
  | 'u_mai'
  | 'r0_mai'
  | 'chiller_cong_suat_kw'
  | 'chiller_cop'
  | 'lpd_thiet_ke'
  | 'edge_eui_co_so'
  | 'edge_wui_co_so'
  | 'edge_vat_lieu_co_so',
  string
>;
const AUDIT_STATUS = {
  qua_han: { label: 'Quá hạn', icon: AlertTriangle, cls: 'text-rose-700 dark:text-rose-300' },
  sap_den: { label: 'Sắp đến hạn', icon: Clock3, cls: 'text-amber-700 dark:text-amber-300' },
  con_han: { label: 'Còn hạn', icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-300' },
} as const;
const CONCLUSION = { dat: 'Đạt', can_khac_phuc: 'Cần khắc phục', dang_thuc_hien: 'Đang thực hiện' } as const;

export const BimQcvnSection: React.FC<{ projectId: string; index: SustainIndex | undefined; canWrite: boolean }> = ({
  projectId,
  index,
  canWrite,
}) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const rec = useQuery({
    queryKey: ['bim-qcvn', projectId],
    queryFn: () => BimQcvnService.get(projectId),
    retry: false,
  });
  const audits = useQuery({
    queryKey: ['bim-kiem-toan', projectId],
    queryFn: () => BimQcvnService.audits(projectId),
    retry: false,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [audit, setAudit] = useState<{
    id: string | null;
    loai: AuditType;
    ky_bao_cao: string;
    ngay_thuc_hien: string;
    chu_ky_nam: string;
    don_vi_thuc_hien: string;
    toe: string;
    eui: string;
    tco2e: string;
    ket_luan: AuditRecord['ket_luan'];
    ghi_chu: string;
  } | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bim-qcvn', projectId] });
    void qc.invalidateQueries({ queryKey: ['bim-kiem-toan', projectId] });
  };
  const run = async (label: string, task: () => Promise<unknown>) => {
    try {
      await task();
      refresh();
      addToast({ type: 'success', message: label });
      return true;
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
      return false;
    }
  };

  const r = rec.data;
  const inputs: QcvnInputs = useMemo(
    () =>
      r ?? {
        loai_cong_trinh: null,
        shgc_kinh: null,
        u_tuong: null,
        r0_tuong: null,
        u_mai: null,
        r0_mai: null,
        chiller_loai: null,
        chiller_cong_suat_kw: null,
        chiller_cop: null,
        lpd_thiet_ke: null,
        nguon: null,
      },
    [r],
  );
  const energy = useQuery({
    queryKey: ['bim-qcvn-mo-hinh', projectId],
    queryFn: () => BimQcvnService.modelEnergy(projectId),
    retry: false,
  });
  const eff = useMemo(
    () => effectiveInputs(inputs, energy.data?.energy ?? null, index?.dien_tich_san ?? null),
    [inputs, energy.data, index],
  );
  const rows = useMemo(
    () =>
      qcvnChecklist(eff.values, {
        dien_tich_san: index?.dien_tich_san ?? null,
        so_thang_dien: index?.so_thang_dien ?? 0,
        facades: r?.wwr_theo_huong ?? null,
        nguon: eff.nguon,
      }),
    [eff, index, r],
  );
  const edge = edgeSavings(
    {
      eui: r?.edge_eui_co_so ?? null,
      wui: r?.edge_wui_co_so ?? null,
      vat_lieu_m2: r?.edge_vat_lieu_co_so ?? null,
      nguon: r?.nguon ?? null,
    },
    { eui: index?.eui ?? null, wui: index?.wui ?? null, carbon_ngam_m2: index?.carbon_ngam_m2 ?? null },
  );
  const key = keyEnergyUser((index?.so_thang_dien ?? 0) >= 12 ? (index?.dien_kwh_12t ?? null) : null);

  const openForm = () =>
    setForm(
      Object.fromEntries(
        (['loai_cong_trinh', 'chiller_loai', 'nguon', ...NUM_FIELDS.map(([k]) => k)] as (keyof Form)[]).map((k) => [
          k,
          toText(r?.[k as keyof typeof r]),
        ]),
      ) as Form,
    );
  const saveForm = async () => {
    if (!form) return;
    const row: Record<string, string | number | null> = {
      loai_cong_trinh: form.loai_cong_trinh || null,
      chiller_loai: form.chiller_loai || null,
      nguon: form.nguon.trim() || null,
    };
    for (const [k] of NUM_FIELDS) {
      const v = toNum(form[k]);
      if (v !== null && !Number.isFinite(v)) return addToast({ type: 'error', message: `Giá trị không hợp lệ: ${k}` });
      row[k] = v;
    }
    if (await run('Đã lưu thông số thiết kế.', () => BimQcvnService.save(projectId, row))) setForm(null);
  };
  const saveAudit = async () => {
    if (!audit) return;
    const row = {
      loai: audit.loai,
      ky_bao_cao: audit.ky_bao_cao,
      ngay_thuc_hien: audit.ngay_thuc_hien,
      chu_ky_nam: Number(audit.chu_ky_nam),
      don_vi_thuc_hien: audit.don_vi_thuc_hien,
      toe: toNum(audit.toe),
      eui: toNum(audit.eui),
      tco2e: toNum(audit.tco2e),
      ket_luan: audit.ket_luan,
      ghi_chu: audit.ghi_chu,
    };
    if (await run('Đã lưu sổ kiểm toán.', () => BimQcvnService.saveAudit(projectId, audit.id, row))) setAudit(null);
  };
  // Bản ghi mới nhất theo từng loại quyết định hạn kế tiếp
  const latest = useMemo(() => {
    const m = new Map<AuditType, AuditRecord>();
    for (const a of audits.data ?? []) if (!m.has(a.loai)) m.set(a.loai, a);
    return m;
  }, [audits.data]);

  if (rec.error)
    return (
      <p role="alert" className={`${card} text-xs text-amber-800 dark:text-amber-200`}>
        {errorText(rec.error)}
      </p>
    );
  return (
    <>
      <section className={card} aria-labelledby="bim-6d-qcvn">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-6d-qcvn" className="text-sm font-bold text-txt-primary dark:text-white">
            QCVN 04-3:2026/BXD và so với đường cơ sở EDGE
          </h3>
          {canWrite && !form && (
            <button type="button" className={btn} onClick={openForm}>
              <Pencil className="h-3 w-3" aria-hidden /> Sửa thông số thiết kế
            </button>
          )}
        </div>
        <p className="mb-2 text-2xs text-txt-muted">
          Thông tư 61/2026/TT-BXD, hiệu lực 01/02/2027, thay QCVN 09:2017/BXD; dự án đã duyệt hoặc đã trình thẩm định
          trước ngày hiệu lực tiếp tục theo QCVN 09:2017. WWR từng mặt đứng tính ở trình xem, bảng Bền vững › QCVN
          04-3:2026.
        </p>
        {form && (
          <div
            className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-bg-subtle p-2 text-xs md:grid-cols-4 dark:bg-slate-900"
            aria-label="Thông số thiết kế"
          >
            <label className="block">
              Loại công trình
              <BimSelect
                value={form.loai_cong_trinh}
                onChange={(e) => setForm({ ...form, loai_cong_trinh: e.target.value })}
                className={`${field} mt-1 block w-full`}
              >
                <option value="">Chưa chọn</option>
                {Object.entries(LPD_LIMITS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="block">
              Loại chiller
              <BimSelect
                value={form.chiller_loai}
                onChange={(e) => setForm({ ...form, chiller_loai: e.target.value })}
                className={`${field} mt-1 block w-full`}
              >
                <option value="">Chưa có</option>
                {Object.entries(CHILLER_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </BimSelect>
            </label>
            {NUM_FIELDS.map(([k, label]) => (
              <label key={k} className="block">
                {label}
                <BimInput
                  inputMode="decimal"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className={`${field} mt-1 block w-full`}
                />
              </label>
            ))}
            <label className="col-span-2 block md:col-span-4">
              Nguồn (bắt buộc khi có số liệu)
              <BimInput
                value={form.nguon}
                onChange={(e) => setForm({ ...form, nguon: e.target.value })}
                placeholder="Hồ sơ thiết kế, catalogue, chứng nhận SHGC theo NFRC 200…"
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <div className="col-span-2 flex justify-end gap-1 md:col-span-4">
              <button type="button" className={btn} onClick={() => setForm(null)}>
                Hủy
              </button>
              <button type="button" className={btn} onClick={() => void saveForm()}>
                <Save className="h-3 w-3" aria-hidden /> Lưu
              </button>
            </div>
          </div>
        )}
        <BimTable className="w-full text-xs">
          <thead className="text-left text-txt-secondary dark:text-slate-300">
            <tr>
              <th className="py-1">Mục</th>
              <th>Yêu cầu</th>
              <th>Thực tế</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.ma} className="border-t border-border/60 align-top dark:border-slate-700">
                <td className="py-1 pr-2">
                  {x.noi_dung} <span className="text-txt-muted">· {x.dieu}</span>
                  {x.ghi_chu && <span className="block text-2xs text-txt-muted">{x.ghi_chu}</span>}
                </td>
                <td className="pr-2">{x.yeu_cau}</td>
                <td className="pr-2">{x.thuc_te}</td>
                <td>
                  <StatusBadge s={x.trang_thai} />
                </td>
              </tr>
            ))}
          </tbody>
        </BimTable>
        <p className="mt-1 text-2xs text-txt-muted">
          {energy.data?.model_ids.length
            ? `Mô hình hiện hành (Pset chuẩn IFC): ${energy.data.energy.so_kinh_co_shgc}/${energy.data.energy.so_kinh} vách kính có SHGC, ${energy.data.energy.tuong.so_co_u}/${energy.data.energy.tuong.so} tường ngoài và ${energy.data.energy.mai.so_co_u}/${energy.data.energy.mai.so} mái có U, ${energy.data.energy.chiller.so_co_cop}/${energy.data.energy.chiller.so} chiller có COP, ${energy.data.energy.den.so_co_cong_suat}/${energy.data.energy.den.so} đèn có công suất; thông số đủ cho mọi cấu kiện được dùng trước (tường, mái lấy U bất lợi nhất). `
            : ''}
          {energy.error ? `${errorText(energy.error)}. ` : ''}Thông số dự án: {r?.nguon ?? 'chưa có'}.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div
            className="rounded-xl border border-border p-2 text-xs dark:border-slate-600"
            aria-label="So với đường cơ sở EDGE"
          >
            <p className="mb-1 font-semibold">So với đường cơ sở EDGE (giảm ≥ {EDGE_MIN_SAVING}% mỗi trụ cột)</p>
            <ul className="space-y-0.5">
              {edge.map((p) => (
                <li key={p.tru_cot} className="flex items-center justify-between gap-2">
                  <span>
                    {p.nhan}: {fmt(p.thuc_te, 2)} / {fmt(p.co_so, 2)} {p.don_vi}
                  </span>
                  <span className="tabular-nums">
                    {p.giam_pct == null ? 'chưa có cơ sở' : `giảm ${fmt(p.giam_pct, 1)}%`}{' '}
                    {p.dat != null && <StatusBadge s={p.dat ? 'dat' : 'khong_dat'} />}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-2xs text-txt-muted">
              Đường cơ sở lấy từ báo cáo phần mềm EDGE của dự án và nhập kèm nguồn. EDGE đánh giá vật liệu theo năng
              lượng hàm chứa (MJ); ở đây tạm so carbon hàm chứa, chỉ để tham khảo, không thay chứng nhận.
            </p>
          </div>
          <div
            className="rounded-xl border border-border p-2 text-xs dark:border-slate-600"
            aria-label="Cơ sở sử dụng năng lượng trọng điểm"
          >
            <p className="mb-1 font-semibold">Cơ sở sử dụng năng lượng trọng điểm</p>
            {key ? (
              <p>
                {fmt(key.toe, 1)} TOE/năm (điện 12 tháng {fmt(index?.dien_kwh_12t, 0)} kWh).{' '}
                {key.trong_diem ? (
                  <b>Từ {key.nguong} TOE: thuộc diện trọng điểm.</b>
                ) : (
                  `Dưới ${key.nguong} TOE: chưa thuộc diện.`
                )}
              </p>
            ) : (
              <p className="text-txt-muted">Chưa đủ 12 tháng số đo điện ({index?.so_thang_dien ?? 0}/12).</p>
            )}
            <p className="mt-1 text-2xs text-txt-muted">
              1 kWh = 0,0001543 TOE (Thông tư 02/2014/TT-BCT); ngưỡng tòa nhà 500 TOE/năm (Nghị định 30/2026/NĐ-CP, Điều
              3). Chưa cộng gas, dầu. Danh sách chính thức do UBND tỉnh ban hành hằng năm.
            </p>
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="bim-6d-audit">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-6d-audit" className="text-sm font-bold text-txt-primary dark:text-white">
            Sổ kiểm toán năng lượng, kiểm kê khí nhà kính
          </h3>
          {canWrite && !audit && (
            <button
              type="button"
              className={btn}
              onClick={() =>
                setAudit({
                  id: null,
                  loai: 'kiem_toan_nang_luong',
                  ky_bao_cao: '',
                  ngay_thuc_hien: today(),
                  chu_ky_nam: '3',
                  don_vi_thuc_hien: '',
                  toe: '',
                  eui: '',
                  tco2e: '',
                  ket_luan: 'dang_thuc_hien',
                  ghi_chu: '',
                })
              }
            >
              <Plus className="h-3 w-3" aria-hidden /> Thêm
            </button>
          )}
        </div>
        <div className="mb-2 grid gap-2 md:grid-cols-3">
          {(Object.keys(AUDIT_TYPES) as AuditType[]).map((t) => {
            const a = latest.get(t);
            const due = a ? auditDue(a.ngay_thuc_hien, a.chu_ky_nam, today()) : null;
            const S = due ? AUDIT_STATUS[due.trang_thai] : null;
            return (
              <div key={t} className="rounded-xl border border-border p-2 text-xs dark:border-slate-600">
                <p className="font-semibold">{AUDIT_TYPES[t].label}</p>
                {due && S ? (
                  <p className={`flex items-center gap-1 ${S.cls}`}>
                    <S.icon className="h-3.5 w-3.5" aria-hidden /> {S.label}: hạn {dmy(due.han)}
                    {due.trang_thai !== 'qua_han' ? ` (còn ${fmt(due.con_ngay, 0)} ngày)` : ''}
                  </p>
                ) : (
                  <p className="text-txt-muted">Chưa có bản ghi</p>
                )}
                <p className="mt-0.5 text-2xs text-txt-muted">
                  {AUDIT_TYPES[t].can_cu}; chu kỳ mặc định {AUDIT_TYPES[t].chu_ky} năm, chỉnh theo văn bản hiện hành.
                </p>
              </div>
            );
          })}
        </div>
        {audit && (
          <div
            className="mb-2 grid grid-cols-2 gap-2 rounded-xl bg-bg-subtle p-2 text-xs md:grid-cols-5 dark:bg-slate-900"
            aria-label="Bản ghi kiểm toán"
          >
            <label className="block">
              Loại
              <BimSelect
                value={audit.loai}
                onChange={(e) => {
                  const loai = e.target.value as AuditType;
                  setAudit({ ...audit, loai, chu_ky_nam: String(AUDIT_TYPES[loai].chu_ky) });
                }}
                className={`${field} mt-1 block w-full`}
              >
                {(Object.keys(AUDIT_TYPES) as AuditType[]).map((k) => (
                  <option key={k} value={k}>
                    {AUDIT_TYPES[k].label}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="block">
              Kỳ báo cáo
              <BimInput
                value={audit.ky_bao_cao}
                onChange={(e) => setAudit({ ...audit, ky_bao_cao: e.target.value })}
                placeholder="2023–2025"
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              Ngày thực hiện
              <BimInput
                type="date"
                value={audit.ngay_thuc_hien}
                onChange={(e) => setAudit({ ...audit, ngay_thuc_hien: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              Chu kỳ (năm)
              <BimInput
                inputMode="numeric"
                value={audit.chu_ky_nam}
                onChange={(e) => setAudit({ ...audit, chu_ky_nam: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              Kết luận
              <BimSelect
                value={audit.ket_luan}
                onChange={(e) => setAudit({ ...audit, ket_luan: e.target.value as AuditRecord['ket_luan'] })}
                className={`${field} mt-1 block w-full`}
              >
                {Object.entries(CONCLUSION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="block">
              Đơn vị thực hiện
              <BimInput
                value={audit.don_vi_thuc_hien}
                onChange={(e) => setAudit({ ...audit, don_vi_thuc_hien: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              TOE/năm
              <BimInput
                inputMode="decimal"
                value={audit.toe}
                onChange={(e) => setAudit({ ...audit, toe: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              EUI (kWh/m²·năm)
              <BimInput
                inputMode="decimal"
                value={audit.eui}
                onChange={(e) => setAudit({ ...audit, eui: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              Phát thải (tCO₂e)
              <BimInput
                inputMode="decimal"
                value={audit.tco2e}
                onChange={(e) => setAudit({ ...audit, tco2e: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <label className="block">
              Ghi chú
              <BimInput
                value={audit.ghi_chu}
                onChange={(e) => setAudit({ ...audit, ghi_chu: e.target.value })}
                className={`${field} mt-1 block w-full`}
              />
            </label>
            <div className="col-span-2 flex justify-end gap-1 md:col-span-5">
              <button type="button" className={btn} onClick={() => setAudit(null)}>
                Hủy
              </button>
              <button type="button" className={btn} onClick={() => void saveAudit()}>
                <Save className="h-3 w-3" aria-hidden /> Lưu
              </button>
            </div>
          </div>
        )}
        {audits.error ? (
          <p className="text-xs text-amber-800">{errorText(audits.error)}</p>
        ) : (
          <BimTable className="w-full text-xs">
            <thead className="text-left text-txt-secondary dark:text-slate-300">
              <tr>
                <th className="py-1">Loại</th>
                <th>Kỳ</th>
                <th>Ngày</th>
                <th>Hạn kế tiếp</th>
                <th className="text-right">TOE</th>
                <th className="text-right">EUI</th>
                <th className="text-right">tCO₂e</th>
                <th className="pl-2">Kết luận</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(audits.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border/60 dark:border-slate-700">
                  <td className="py-1">
                    {AUDIT_TYPES[a.loai].label}
                    {a.don_vi_thuc_hien && <span className="block text-2xs text-txt-muted">{a.don_vi_thuc_hien}</span>}
                  </td>
                  <td>{a.ky_bao_cao ?? '—'}</td>
                  <td>{dmy(a.ngay_thuc_hien)}</td>
                  <td>{dmy(auditDue(a.ngay_thuc_hien, a.chu_ky_nam, today()).han)}</td>
                  <td className="text-right font-mono">{fmt(a.toe, 0)}</td>
                  <td className="text-right font-mono">{fmt(a.eui, 1)}</td>
                  <td className="text-right font-mono">{fmt(a.tco2e, 0)}</td>
                  <td className="pl-2">{CONCLUSION[a.ket_luan]}</td>
                  <td className="whitespace-nowrap text-right">
                    {canWrite && (
                      <>
                        <button
                          type="button"
                          aria-label="Sửa bản ghi"
                          onClick={() =>
                            setAudit({
                              id: a.id,
                              loai: a.loai,
                              ky_bao_cao: a.ky_bao_cao ?? '',
                              ngay_thuc_hien: a.ngay_thuc_hien,
                              chu_ky_nam: String(a.chu_ky_nam),
                              don_vi_thuc_hien: a.don_vi_thuc_hien ?? '',
                              toe: toText(a.toe),
                              eui: toText(a.eui),
                              tco2e: toText(a.tco2e),
                              ket_luan: a.ket_luan,
                              ghi_chu: a.ghi_chu ?? '',
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 text-txt-secondary" />
                        </button>
                        <button
                          type="button"
                          aria-label="Xóa bản ghi"
                          className="ml-1"
                          onClick={() =>
                            void (async () => {
                              if (
                                await confirm({
                                  message: 'Xóa bản ghi kiểm toán?',
                                  confirmText: 'Xóa',
                                  variant: 'danger',
                                })
                              )
                                await run('Đã xóa.', () => BimQcvnService.deleteAudit(a.id));
                            })()
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!(audits.data ?? []).length && (
                <tr>
                  <td colSpan={9} className="py-1 text-txt-muted">
                    Chưa có bản ghi.
                  </td>
                </tr>
              )}
            </tbody>
          </BimTable>
        )}
      </section>
    </>
  );
};
