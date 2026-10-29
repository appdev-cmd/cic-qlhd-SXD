import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// QCVN 04-3:2026/BXD check on the model: facade WWR from geometry -> max SHGC (Table 1); R0, COP, LPD, metering from
// model psets or the project design inputs. Missing data stays "Chưa có dữ liệu", never inferred as passing.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Paintbrush, Ruler, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimColorGroup, BimViewerRef } from '../../viewer/types';
import { useSustainIndex } from '../../hooks/useBimSustain';
import { BimQcvnService } from '../../services/BimQcvnService';
import { BimSunService } from '../../services/BimSunService';
import {
  CHECK_LABELS,
  COLUMN_LABELS,
  QCVN043,
  STATUS_COLOR,
  effectiveInputs,
  envelopeKind,
  facadeOf,
  facadeWwr,
  keyEnergyUser,
  normalAzimuth,
  qcvnChecklist,
  type CheckStatus,
  type Facade,
  type FacadeWwr,
  type QcvnInputs,
} from '../../lib/qcvn043';
import { runEnvelopeWorker } from '../../lib/sun/envelopeWorkerTypes';
import { StatusBadge } from './QcvnStatusBadge';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : formatNumber(Number(v), d);
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const EMPTY: QcvnInputs = {
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
};

export const BimEnvelopePanel: React.FC<{
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  canEdit: boolean;
  onOpenSustain?: () => void;
  className?: string;
}> = ({ projectId, viewerRef, canEdit, onOpenSustain, className = '' }) => {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const index = useSustainIndex(projectId);
  const rec = useQuery({
    queryKey: ['bim-qcvn', projectId],
    queryFn: () => BimQcvnService.get(projectId),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [run, setRun] = useState<{
    facades: FacadeWwr[];
    glazing: Map<Facade, { modelId: string; ids: number[] }[]>;
    points: number;
    seconds: number;
  } | null>(null);
  const [painted, setPainted] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );
  useEffect(
    () => () => {
      if (painted) void viewerRef.current?.colorize(null);
    },
    [painted, viewerRef],
  );

  const energy = useQuery({
    queryKey: ['bim-qcvn-mo-hinh', projectId],
    queryFn: () => BimQcvnService.modelEnergy(projectId),
    retry: false,
  });
  const eff = useMemo(
    () => effectiveInputs(rec.data ?? EMPTY, energy.data?.energy ?? null, index.data?.dien_tich_san ?? null),
    [rec.data, energy.data, index.data],
  );
  const inputs: QcvnInputs = eff.values;
  const facades = run?.facades ?? rec.data?.wwr_theo_huong ?? null;
  const rows = useMemo(
    () =>
      qcvnChecklist(inputs, {
        dien_tich_san: index.data?.dien_tich_san ?? null,
        so_thang_dien: index.data?.so_thang_dien ?? 0,
        facades,
        nguon: eff.nguon,
      }),
    [inputs, index.data, facades, eff.nguon],
  );
  const key = keyEnergyUser(
    index.data?.so_thang_dien && index.data.so_thang_dien >= 12 ? index.data.dien_kwh_12t : null,
  );
  const statusOf = (f: FacadeWwr): CheckStatus =>
    inputs.shgc_kinh == null ? 'chua_co' : inputs.shgc_kinh <= f.shgc_toi_da + 1e-9 ? 'dat' : 'khong_dat';

  const compute = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const started = performance.now();
    try {
      setBusy('Đang đọc hình học…');
      const [loc, obs] = await Promise.all([
        BimSunService.getLocation(projectId).catch(() => null),
        viewer.getSunObstacles({}),
      ]);
      // Phân loại phần hình học của công trình: kính / phần đặc / không thuộc vỏ
      setBusy('Đang phân loại cấu kiện vỏ…');
      const byModel = new Map<string, number[]>();
      obs.meta.forEach((m) => {
        if (!m.context && m.localId >= 0) byModel.set(m.modelId, [...(byModel.get(m.modelId) ?? []), m.localId]);
      });
      const brief = new Map<string, Record<number, { name?: string; category?: string }>>();
      for (const [m, ids] of byModel) brief.set(m, await viewer.getItemsBrief(m, ids));
      const envelope: { part: Float32Array; kind: 'kinh' | 'dac'; modelId: string; localId: number }[] = [];
      obs.parts.forEach((p, i) => {
        const m = obs.meta[i];
        if (m.context || m.localId < 0) return;
        const b = brief.get(m.modelId)?.[m.localId];
        const kind = envelopeKind(b?.category, b?.name);
        if (kind) envelope.push({ part: p, kind, modelId: m.modelId, localId: m.localId });
      });
      if (!envelope.some((e) => e.kind === 'kinh'))
        throw new Error('Mô hình đang hiện không có cấu kiện kính (IfcCurtainWall, IfcWindow, IfcPlate).');
      setBusy('Đang lấy mẫu mặt đứng ngoài…');
      const job = runEnvelopeWorker({
        obstacleParts: obs.parts,
        envelopeParts: envelope.map((e) => e.part),
        step: 2,
        maxPoints: 12_000,
      });
      cancelRef.current = job.cancel;
      const res = await job.result;
      cancelRef.current = null;
      const north = loc?.goc_bac_thuc ?? 0;
      const samples = [];
      const glazingVotes = new Map<string, Map<Facade, number>>();
      for (let p = 0; p < res.count; p++) {
        const e = envelope[res.src[p]];
        const az = normalAzimuth(res.normals[p * 3], res.normals[p * 3 + 2], north);
        samples.push({ azimuth: az, area: res.area[p], kind: e.kind });
        if (e.kind === 'kinh') {
          const k = `${e.modelId}|${e.localId}`;
          const v = glazingVotes.get(k) ?? new Map<Facade, number>();
          const f = facadeOf(az);
          v.set(f, (v.get(f) ?? 0) + res.area[p]);
          glazingVotes.set(k, v);
        }
      }
      const result = facadeWwr(samples);
      // Mỗi cấu kiện kính thuộc mặt đứng chiếm nhiều diện tích nhất
      const glazing = new Map<Facade, { modelId: string; ids: number[] }[]>();
      for (const [k, votes] of glazingVotes) {
        const [modelId, id] = k.split('|');
        const f = [...votes].sort((a, b) => b[1] - a[1])[0][0];
        const list = glazing.get(f) ?? [];
        const g = list.find((x) => x.modelId === modelId) ?? (list.push({ modelId, ids: [] }), list[list.length - 1]);
        g.ids.push(Number(id));
        glazing.set(f, list);
      }
      setRun({ facades: result, glazing, points: res.count, seconds: (performance.now() - started) / 1000 });
      if (canEdit) {
        await BimQcvnService.saveWwr(projectId, result, [...byModel.keys()]);
        void qc.invalidateQueries({ queryKey: ['bim-qcvn', projectId] });
      }
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const paint = async () => {
    const viewer = viewerRef.current;
    if (!viewer || !run) return;
    if (painted) {
      await viewer.colorize(null);
      setPainted(false);
      return;
    }
    const groups: BimColorGroup[] = [];
    for (const f of run.facades)
      for (const g of run.glazing.get(f.mat) ?? [])
        groups.push({ modelId: g.modelId, ids: g.ids, color: STATUS_COLOR[statusOf(f)] });
    await viewer.colorize(groups.length ? groups : null);
    setPainted(groups.length > 0);
  };

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-3 text-xs text-slate-700 dark:text-slate-200 ${className}`}
      aria-label="Rà QCVN 04-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Ruler className="h-4 w-4 text-emerald-600" aria-hidden /> {QCVN043.ten}
        </span>
        {onOpenSustain && (
          <button type="button" className={btn} onClick={onOpenSustain}>
            <ExternalLink className="h-3 w-3" aria-hidden /> Thông số thiết kế
          </button>
        )}
      </div>
      <p className="text-2xs text-slate-500">
        {QCVN043.van_ban}, hiệu lực 01/02/2027, thay QCVN 09:2017/BXD. Rà sơ bộ trên mô hình, không thay hồ sơ thẩm
        định.
      </p>
      {rec.error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {errorText(rec.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {busy ? (
          <>
            <span role="status" className="flex-1 self-center text-2xs text-slate-500">
              {busy}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => {
                cancelRef.current?.();
                setBusy(null);
              }}
            >
              <X className="h-3 w-3" aria-hidden /> Dừng
            </button>
          </>
        ) : (
          <button type="button" className={btn} onClick={() => void compute()}>
            <Ruler className="h-3 w-3" aria-hidden /> {facades ? 'Tính lại WWR từ mô hình' : 'Tính WWR từ mô hình'}
          </button>
        )}
        {run && (
          <button type="button" className={btn} aria-pressed={painted} onClick={() => void paint()}>
            {painted ? (
              <>
                <X className="h-3 w-3" aria-hidden /> Bỏ tô
              </>
            ) : (
              <>
                <Paintbrush className="h-3 w-3" aria-hidden /> Tô kính theo kết quả
              </>
            )}
          </button>
        )}
      </div>

      {facades && (
        <section
          className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"
          aria-label="WWR từng mặt đứng"
        >
          <BimTable className="w-full text-2xs">
            <caption className="mb-1 text-left font-semibold">
              SHGC kính theo WWR từng mặt đứng (mục 2.1.2 b, Bảng 1)
            </caption>
            <thead>
              <tr className="text-left text-2xs text-slate-500">
                <th className="font-normal">Mặt</th>
                <th className="text-right font-normal">m²</th>
                <th className="text-right font-normal">WWR</th>
                <th className="text-right font-normal">SHGC ≤</th>
                <th className="pl-2 font-normal">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {facades.map((f) => (
                <tr key={f.mat} data-tooltip={COLUMN_LABELS[f.cot]}>
                  <td>{f.mat}</td>
                  <td className="text-right tabular-nums">{fmt(f.dien_tich, 0)}</td>
                  <td className="text-right tabular-nums">{fmt(f.wwr, 1)}%</td>
                  <td className="text-right tabular-nums">{fmt(f.shgc_toi_da, 2)}</td>
                  <td className="pl-2">
                    <StatusBadge s={statusOf(f)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </BimTable>
          <p className="mt-1 text-2xs text-slate-500">
            SHGC thiết kế: {inputs.shgc_kinh == null ? 'chưa có' : fmt(inputs.shgc_kinh, 2)}
            {eff.nguon.shgc_kinh === 'mo_hinh'
              ? ` (trung bình theo diện tích ${energy.data?.energy.so_kinh_co_shgc} vách kính, Pset_DoorWindowGlazingType.SolarHeatGainTransmittance trong mô hình)`
              : inputs.nguon
                ? ` (${inputs.nguon})`
                : ''}
            .
            {run
              ? ` ${fmt(run.points, 0)} điểm mẫu, ${fmt(run.seconds)} giây.`
              : rec.data?.wwr_tinh_luc
                ? ` Tính lúc ${formatDateTime(new Date(rec.data.wwr_tinh_luc))}.`
                : ''}{' '}
            WWR tính trên mặt ngoài nhìn được ra trời của tường, vách kính, tấm ốp, cột, mép sàn; chưa tách riêng không
            gian có điều hòa (mục 2.1.1) và chưa áp hệ số che nắng A (Bảng 2, 3).
          </p>
          {painted && (
            <ul className="mt-1 flex gap-3 text-2xs" aria-label="Chú giải tô màu">
              {(['dat', 'khong_dat', 'chua_co'] as const).map((s) => (
                <li key={s} className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-sm" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                  {CHECK_LABELS[s]}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 p-2 dark:border-slate-700" aria-label="Bảng rà QCVN 04-3">
        <p className="mb-1 font-semibold">Các mục khác</p>
        <ul className="space-y-1">
          {rows
            .filter((r) => !r.ma.startsWith('2.1.2b'))
            .map((r) => (
              <li key={r.ma} className="text-2xs">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    {r.noi_dung} <span className="text-slate-400">· {r.dieu}</span>
                  </span>
                  <StatusBadge s={r.trang_thai} />
                </div>
                <div className="text-2xs text-slate-500">
                  Yêu cầu {r.yeu_cau}; thực tế {r.thuc_te}.{r.ghi_chu ? ` ${r.ghi_chu}` : ''}
                </div>
              </li>
            ))}
        </ul>
      </section>

      <section
        className="rounded-xl border border-slate-200 p-2 text-2xs dark:border-slate-700"
        aria-label="Cơ sở sử dụng năng lượng trọng điểm"
      >
        <p className="font-semibold">Năng lượng quy đổi</p>
        {key ? (
          <p>
            {fmt(key.toe, 1)} TOE/năm từ điện 12 tháng.{' '}
            {key.trong_diem
              ? `Từ ${key.nguong} TOE: thuộc diện cơ sở sử dụng năng lượng trọng điểm (kiểm toán năng lượng định kỳ, kế hoạch và báo cáo năm).`
              : `Dưới ${key.nguong} TOE: chưa thuộc diện cơ sở trọng điểm.`}
          </p>
        ) : (
          <p className="text-slate-500">Chưa đủ 12 tháng số đo điện ({index.data?.so_thang_dien ?? 0}/12).</p>
        )}
        <p className="mt-0.5 text-2xs text-slate-500">
          Quy đổi 1 kWh = 0,0001543 TOE (Thông tư 02/2014/TT-BCT); ngưỡng 500 TOE/năm cho tòa nhà (Nghị định
          30/2026/NĐ-CP, Điều 3). Chưa cộng gas, dầu.
        </p>
      </section>
    </div>
  );
};
