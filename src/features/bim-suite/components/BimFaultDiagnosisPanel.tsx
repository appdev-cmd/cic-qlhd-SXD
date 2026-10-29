import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Fault diagnoses: what failed, why, how and where to repair. One asset (asset record tab) or the whole project
// (workspace section). Project writers record a diagnosis and move its status; detailed evidence/steps come from the
// database (facility_fault_diagnoses) when filled by integrations.
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MapPin, Plus, ShieldAlert, Stethoscope, Wrench } from 'lucide-react';
import { useFaultDiagnoses } from '../hooks/useFacilityOps';
import {
  FacilityOpsService,
  type FaultDiagnosis,
  type FaultDiagnosisDraft,
  type OrderPriority,
} from '../services/FacilityOpsService';
import type { FacilityAsset } from '../services/facilityAssetService';
import { formatVnd } from '../lib/costing';
import { FAILURE_CODES, PRIORITY_LABELS } from '../lib/workOrderFilters';

const SEVERITY: Record<FaultDiagnosis['muc_do'], { label: string; cls: string }> = {
  thap: { label: 'Thấp', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  trung_binh: { label: 'Trung bình', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  cao: { label: 'Cao', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  nghiem_trong: { label: 'Nghiêm trọng', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
};
const STATUS: Record<FaultDiagnosis['trang_thai'], string> = {
  cho_xu_ly: 'Chờ xử lý',
  dang_xu_ly: 'Đang xử lý',
  da_xu_ly: 'Đã xử lý',
  huy: 'Đã hủy',
};
const NEXT_STATUS: Partial<Record<FaultDiagnosis['trang_thai'], FaultDiagnosis['trang_thai']>> = {
  cho_xu_ly: 'dang_xu_ly',
  dang_xu_ly: 'da_xu_ly',
};
const LOCATION_FIELDS: [string, string][] = [
  ['thap', 'Khối/tháp'],
  ['tang', 'Tầng'],
  ['ten_phong', 'Phòng'],
  ['ma_phong', 'Mã phòng'],
  ['truc_luoi', 'Trục lưới'],
  ['cao_do_san_m', 'Cao độ sàn (m)'],
];
const num = (v: number | string) => (typeof v === 'number' ? formatNumber(v, 2) : v);
const field =
  'mt-1 w-full min-w-0 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <section className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700">
    <h4 className="flex items-center gap-1.5 font-semibold text-txt-primary dark:text-white">
      {icon}
      {title}
    </h4>
    {children}
  </section>
);

const emptyDraft = (assetId: string): FaultDiagnosisDraft => ({
  asset_id: assetId,
  failure_code: 'KHAC',
  ten_su_co: '',
  muc_do: 'trung_binh',
  trieu_chung: '',
  nguyen_nhan_chinh: '',
  phuong_an: '',
  uu_tien: 'normal',
});

export const BimFaultDiagnosisPanel: React.FC<{
  projectId: string;
  /** One asset; omitted = every diagnosis of the project. */
  assetId?: string;
  assets?: FacilityAsset[];
  canWrite?: boolean;
  guid?: string | null;
  onLocateGuid?: (guid: string) => void;
  onOpenOrders?: () => void;
  onOpenAsset?: (assetId: string) => void;
}> = ({ projectId, assetId, assets = [], canWrite, guid, onLocateGuid, onOpenOrders, onOpenAsset }) => {
  const query = useFaultDiagnoses(projectId, assetId);
  const cache = useQueryClient();
  const [draft, setDraft] = useState<FaultDiagnosisDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.asset_id, a])), [assets]);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await cache.invalidateQueries({ queryKey: ['facility-fault-diagnoses', projectId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được chẩn đoán');
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!draft) return;
      if (!draft.asset_id) throw new Error('Chọn thiết bị.');
      if (!draft.ten_su_co.trim() || !draft.trieu_chung.trim()) throw new Error('Cần tên sự cố và triệu chứng.');
      if (!draft.nguyen_nhan_chinh.trim() || !draft.phuong_an.trim())
        throw new Error('Cần nguyên nhân chính và phương án sửa.');
      await FacilityOpsService.createDiagnosis(projectId, {
        ...draft,
        ten_su_co: draft.ten_su_co.trim(),
        trieu_chung: draft.trieu_chung.trim(),
        nguyen_nhan_chinh: draft.nguyen_nhan_chinh.trim(),
        phuong_an: draft.phuong_an.trim(),
      });
      setDraft(null);
    });
  const rows = query.data ?? [];
  const firstAsset = assetId || assets.find((a) => a.status !== 'Retired')?.asset_id || '';

  return (
    <div className="space-y-4 text-xs">
      <header className="flex flex-wrap items-center gap-2">
        <Stethoscope className="h-4 w-4 text-rose-600" aria-hidden />
        <h3 className="font-semibold text-txt-primary dark:text-white">Chẩn đoán hỏng hóc</h3>
        <span className="flex-1" />
        {canWrite && !draft && (
          <button type="button" className={btn} disabled={!firstAsset} onClick={() => setDraft(emptyDraft(firstAsset))}>
            <Plus className="h-3 w-3" /> Ghi chẩn đoán
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
      {draft && canWrite && (
        <form
          aria-label="Chẩn đoán mới"
          className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {!assetId && (
            <label className="block sm:col-span-2">
              Thiết bị
              <BimSelect
                aria-label="Thiết bị bị hỏng"
                value={draft.asset_id}
                onChange={(e) => setDraft({ ...draft, asset_id: e.target.value })}
                className={field}
              >
                {assets.map((a) => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.asset_name}
                    {a.asset_code ? ` · ${a.asset_code}` : ''}
                  </option>
                ))}
              </BimSelect>
            </label>
          )}
          <label className="block">
            Tên sự cố
            <BimInput
              aria-label="Tên sự cố"
              value={draft.ten_su_co}
              onChange={(e) => setDraft({ ...draft, ten_su_co: e.target.value })}
              className={field}
            />
          </label>
          <label className="block">
            Mã hỏng
            <BimSelect
              aria-label="Mã hỏng chẩn đoán"
              value={draft.failure_code}
              onChange={(e) => setDraft({ ...draft, failure_code: e.target.value })}
              className={field}
            >
              {FAILURE_CODES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="block">
            Mức độ
            <BimSelect
              aria-label="Mức độ sự cố"
              value={draft.muc_do}
              onChange={(e) => setDraft({ ...draft, muc_do: e.target.value as FaultDiagnosis['muc_do'] })}
              className={field}
            >
              {(Object.keys(SEVERITY) as FaultDiagnosis['muc_do'][]).map((key) => (
                <option key={key} value={key}>
                  {SEVERITY[key].label}
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="block">
            Ưu tiên
            <BimSelect
              aria-label="Ưu tiên xử lý"
              value={draft.uu_tien}
              onChange={(e) => setDraft({ ...draft, uu_tien: e.target.value as OrderPriority })}
              className={field}
            >
              {(Object.keys(PRIORITY_LABELS) as OrderPriority[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITY_LABELS[key]}
                </option>
              ))}
            </BimSelect>
          </label>
          <label className="block sm:col-span-2">
            Triệu chứng
            <textarea
              aria-label="Triệu chứng"
              rows={2}
              value={draft.trieu_chung}
              onChange={(e) => setDraft({ ...draft, trieu_chung: e.target.value })}
              className={field}
            />
          </label>
          <label className="block sm:col-span-2">
            Nguyên nhân chính
            <textarea
              aria-label="Nguyên nhân chính"
              rows={2}
              value={draft.nguyen_nhan_chinh}
              onChange={(e) => setDraft({ ...draft, nguyen_nhan_chinh: e.target.value })}
              className={field}
            />
          </label>
          <label className="block sm:col-span-2">
            Phương án sửa
            <textarea
              aria-label="Phương án sửa"
              rows={2}
              value={draft.phuong_an}
              onChange={(e) => setDraft({ ...draft, phuong_an: e.target.value })}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <BimInput
              type="checkbox"
              checked={!!draft.can_ngung_he_thong}
              onChange={(e) => setDraft({ ...draft, can_ngung_he_thong: e.target.checked })}
            />
            Cần ngừng thiết bị/hệ thống khi sửa
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className={primary}>
              Lưu chẩn đoán
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => setDraft(null)}>
              Hủy
            </button>
          </div>
        </form>
      )}
      {query.isLoading ? (
        <p className="text-txt-muted">Đang tải chẩn đoán…</p>
      ) : query.error ? (
        <p role="alert" className="text-rose-600">
          Không tải được chẩn đoán: {query.error.message}
        </p>
      ) : !rows.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
          {assetId ? 'Thiết bị chưa có chẩn đoán hỏng hóc.' : 'Dự án chưa có chẩn đoán hỏng hóc.'}
        </p>
      ) : (
        rows.map((d) => {
          const partsTotal = d.vat_tu.reduce((s, p) => s + p.so_luong * p.don_gia, 0);
          const asset = assetById.get(d.asset_id);
          const next = NEXT_STATUS[d.trang_thai];
          const location = LOCATION_FIELDS.filter(([k]) => d.vi_tri?.[k] != null);
          const targetGuid = guid ?? asset?.bim_element_id ?? null;
          return (
            <article key={d.id} className="space-y-3 border-b border-border pb-4 last:border-0 dark:border-slate-700">
              <header className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-txt-primary dark:text-white">{d.ten_su_co}</h3>
                <span className={`rounded-md px-2 py-0.5 font-semibold ${SEVERITY[d.muc_do].cls}`}>
                  Mức độ: {SEVERITY[d.muc_do].label}
                </span>
                <span className="rounded-md border border-border px-2 py-0.5">
                  Ưu tiên: {PRIORITY_LABELS[d.uu_tien] ?? d.uu_tien}
                </span>
                <span className="rounded-md border border-border px-2 py-0.5">{STATUS[d.trang_thai]}</span>
                <span className="text-txt-muted">
                  Mã lỗi {d.failure_code} · phát hiện {formatDateTime(new Date(d.phat_hien_luc))}
                </span>
                {!assetId && asset && (
                  <button
                    type="button"
                    className="text-primary-700 underline"
                    onClick={() => onOpenAsset?.(asset.asset_id)}
                  >
                    {asset.asset_name}
                  </button>
                )}
                <span className="flex-1" />
                {canWrite && next && (
                  <button
                    type="button"
                    disabled={busy}
                    className={btn}
                    onClick={() => void run(() => FacilityOpsService.setDiagnosisStatus(d.id, next))}
                  >
                    {next === 'dang_xu_ly' ? 'Bắt đầu xử lý' : 'Đã xử lý xong'}
                  </button>
                )}
                {canWrite && d.trang_thai === 'cho_xu_ly' && (
                  <button
                    type="button"
                    disabled={busy}
                    className={btn}
                    onClick={() => void run(() => FacilityOpsService.setDiagnosisStatus(d.id, 'huy'))}
                  >
                    Hủy
                  </button>
                )}
              </header>
              <div className="grid gap-3 lg:grid-cols-2">
                <Section
                  title="Triệu chứng & bằng chứng"
                  icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />}
                >
                  <p>{d.trieu_chung}</p>
                  {d.nguon_phat_hien && <p className="text-txt-muted">Nguồn phát hiện: {d.nguon_phat_hien}</p>}
                  {d.bang_chung.length > 0 && (
                    <BimTable className="w-full text-left">
                      <thead className="text-txt-muted">
                        <tr>
                          <th className="py-1 pr-2">Chỉ số</th>
                          <th className="pr-2">Giá trị</th>
                          <th className="pr-2">Ngưỡng</th>
                          <th>Đánh giá</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.bang_chung.map((r) => (
                          <tr key={r.chi_so} className="border-t border-border dark:border-slate-700">
                            <td className="py-1 pr-2">{r.chi_so}</td>
                            <td className="whitespace-nowrap pr-2 font-semibold text-rose-700 dark:text-rose-300">
                              {num(r.gia_tri)} {r.don_vi}
                            </td>
                            <td className="whitespace-nowrap pr-2">
                              {r.nguong} {r.nguong !== '—' ? r.don_vi : ''}
                            </td>
                            <td>{r.danh_gia}</td>
                          </tr>
                        ))}
                      </tbody>
                    </BimTable>
                  )}
                </Section>
                <Section title="Nguyên nhân">
                  <p>
                    <b>Chính:</b> {d.nguyen_nhan_chinh}
                  </p>
                  {d.do_tin_cay != null && (
                    <div
                      className="flex items-center gap-2"
                      aria-label={`Độ tin cậy ${Math.round(Number(d.do_tin_cay) * 100)}%`}
                    >
                      <span className="text-txt-muted">Độ tin cậy</span>
                      <span className="h-1.5 w-32 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                        <span
                          className="block h-full bg-primary-600"
                          style={{ width: `${Math.round(Number(d.do_tin_cay) * 100)}%` }}
                        />
                      </span>
                      <b>{Math.round(Number(d.do_tin_cay) * 100)}%</b>
                    </div>
                  )}
                  {d.nguyen_nhan_phu.length > 0 && (
                    <>
                      <p className="font-semibold">Yếu tố góp phần</p>
                      <ul className="list-disc pl-4">
                        {d.nguyen_nhan_phu.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {d.cach_kiem_tra.length > 0 && (
                    <>
                      <p className="font-semibold">Kiểm tra xác nhận</p>
                      <ul className="list-disc pl-4">
                        {d.cach_kiem_tra.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Section>
                <Section title="Phương án sửa" icon={<Wrench className="h-3.5 w-3.5 text-primary-600" aria-hidden />}>
                  <p>{d.phuong_an}</p>
                  {d.cac_buoc.length > 0 && (
                    <ol className="list-decimal space-y-0.5 pl-4">
                      {d.cac_buoc.map((b) => (
                        <li key={b.thu_tu}>{b.buoc}</li>
                      ))}
                    </ol>
                  )}
                  <p className="text-txt-secondary dark:text-slate-300">
                    Đội xử lý: <b>{d.doi_xu_ly ?? '—'}</b> · {d.uoc_tinh_gio ?? '—'} giờ công · chi phí ước tính{' '}
                    <b>{d.uoc_tinh_chi_phi != null ? formatVnd(Number(d.uoc_tinh_chi_phi)) : '—'}</b>
                  </p>
                  {d.work_order_id && onOpenOrders && (
                    <button type="button" onClick={onOpenOrders} className="text-primary-700 underline">
                      Mở phiếu sửa liên kết
                    </button>
                  )}
                </Section>
                <Section title="Sửa ở đâu" icon={<MapPin className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}>
                  {location.length > 0 && (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
                      {location.map(([k, label]) => (
                        <div key={k}>
                          <dt className="text-txt-muted">{label}</dt>
                          <dd className="font-semibold">{String(d.vi_tri[k])}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {d.duong_tiep_can && (
                    <p>
                      <b>Đường tiếp cận:</b> {d.duong_tiep_can}
                    </p>
                  )}
                  {!location.length && !d.duong_tiep_can && (
                    <p className="text-txt-muted">{asset?.location || 'Theo vị trí thiết bị trong sổ tài sản.'}</p>
                  )}
                  {targetGuid && onLocateGuid && (
                    <button type="button" onClick={() => onLocateGuid(targetGuid)} className={primary}>
                      Phóng tới thiết bị trên BIM
                    </button>
                  )}
                </Section>
              </div>
              {d.vat_tu.length > 0 && (
                <Section title="Vật tư dự kiến">
                  <BimTable className="w-full text-left">
                    <thead className="text-txt-muted">
                      <tr>
                        <th className="py-1">Vật tư</th>
                        <th className="text-right">SL</th>
                        <th className="pl-2">ĐVT</th>
                        <th className="text-right">Đơn giá</th>
                        <th className="text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.vat_tu.map((p) => (
                        <tr key={p.ten} className="border-t border-border dark:border-slate-700">
                          <td className="py-1">{p.ten}</td>
                          <td className="text-right">{formatNumber(p.so_luong, 2)}</td>
                          <td className="pl-2">{p.don_vi}</td>
                          <td className="text-right">{formatVnd(p.don_gia)}</td>
                          <td className="text-right">{formatVnd(p.so_luong * p.don_gia)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border font-semibold dark:border-slate-700">
                        <td className="py-1" colSpan={4}>
                          Cộng vật tư
                        </td>
                        <td className="text-right">{formatVnd(partsTotal)}</td>
                      </tr>
                    </tbody>
                  </BimTable>
                </Section>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                {d.an_toan.length > 0 && (
                  <Section title="An toàn" icon={<ShieldAlert className="h-3.5 w-3.5 text-rose-600" aria-hidden />}>
                    <ul className="list-disc pl-4">
                      {d.an_toan.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </Section>
                )}
                {(d.anh_huong || d.can_ngung_he_thong) && (
                  <Section title="Ảnh hưởng vận hành">
                    {d.anh_huong && <p>{d.anh_huong}</p>}
                    <p className="text-txt-muted">
                      {d.can_ngung_he_thong ? 'Cần ngừng thiết bị/hệ thống khi sửa.' : 'Không cần ngừng hệ thống.'}
                    </p>
                  </Section>
                )}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
};
