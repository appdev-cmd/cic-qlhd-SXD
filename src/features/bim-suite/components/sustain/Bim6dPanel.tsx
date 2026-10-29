import { formatNumber, formatDateTime } from '@/lib/utils';
// Project 6D panel in the viewer: element carbon, operational energy, carbon colouring of the model.
import React, { useMemo, useState } from 'react';
import { useBimAccess } from '@/features/bim-suite/adapters/context';
import { Calculator, ExternalLink, Leaf, Paintbrush, X } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { SmartSetColoring } from '../BimSmartSetsPanel';
import { useCarbonRows, useFactors, useMeters, useRefreshSustain, useSustainIndex } from '../../hooks/useBimSustain';
import { BimSustainService, type Meter } from '../../services/BimSustainService';
import { CARBON_MISSING, CARBON_RAMP, CARBON_STATUS_LABELS, carbonBreaks, carbonClass } from '../../lib/sustainability';
import { getIfcLabel } from '../../lib/ifcLabels';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : formatNumber(Number(v), d);
const btn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';

export const Bim6dPanel: React.FC<{
  projectId: string;
  models: BimModel[];
  canEdit: boolean;
  selectedGuid?: string | null;
  selectedModelId?: string | null;
  onColorize: (coloring: SmartSetColoring | null) => void;
  /** Opens the project's sustainability workspace tab (factors, targets, LCA) */
  onOpenSustain?: () => void;
  className?: string;
}> = ({ projectId, models, canEdit, selectedGuid, selectedModelId, onColorize, onOpenSustain, className = '' }) => {
  const { organizationId } = useBimAccess();
  const { addToast } = useToast();
  const refresh = useRefreshSustain();
  const index = useSustainIndex(projectId);
  const carbon = useCarbonRows(projectId);
  const factors = useFactors(projectId, organizationId);
  const meters = useMeters(projectId);
  const [busy, setBusy] = useState(false);
  const [colored, setColored] = useState(false);
  const modelIds = useMemo(() => new Set(models.map((m) => m.id)), [models]);
  const rows = useMemo(() => (carbon.data ?? []).filter((r) => modelIds.has(r.model_id)), [carbon.data, modelIds]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.trang_thai === 'da_tinh');
    const sumBy = (key: (r: (typeof rows)[number]) => string) => {
      const m = new Map<string, number>();
      for (const r of done) m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.kgco2e ?? 0));
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    const status = new Map<string, number>();
    for (const r of rows) status.set(r.trang_thai, (status.get(r.trang_thai) ?? 0) + 1);
    return {
      total: done.reduce((s, r) => s + Number(r.kgco2e ?? 0), 0),
      byMaterial: sumBy((r) => r.ma_vat_lieu ?? '—'),
      byFloor: sumBy((r) => r.phan_doan_tang || 'Chưa gán tầng').slice(0, 10),
      status: [...status],
      computedAt: rows[0]?.tinh_luc ?? null,
    };
  }, [rows]);

  const compute = async () => {
    setBusy(true);
    try {
      const r = await BimSustainService.compute(
        projectId,
        models.map((m) => m.id),
      );
      refresh();
      addToast({
        type: 'success',
        message: `Đã tính ${formatNumber(r.so_cau_kien, 2)} cấu kiện: ${fmt(Number(r.tong_kgco2e) / 1000, 2)} tấn CO₂e.`,
      });
    } catch (e) {
      addToast({ type: 'error', title: 'Không tính được carbon', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const paint = () => {
    if (colored) {
      onColorize(null);
      setColored(false);
      return;
    }
    const values = rows.filter((r) => r.trang_thai === 'da_tinh').map((r) => Number(r.kgco2e));
    const breaks = carbonBreaks(values);
    const groups = new Map<string, { modelId: string; color: string; ids: number[] }>();
    const counts = new Array(CARBON_RAMP.length + 1).fill(0);
    for (const r of rows) {
      if (r.trang_thai === 'khong_ap_dung') continue;
      const cls = r.trang_thai === 'da_tinh' && Number(r.kgco2e) > 0 ? carbonClass(Number(r.kgco2e), breaks) : -1;
      const color = cls < 0 ? CARBON_MISSING : CARBON_RAMP[Math.min(cls, CARBON_RAMP.length - 1)];
      counts[cls < 0 ? CARBON_RAMP.length : cls]++;
      const key = `${r.model_id}|${color}`;
      if (!groups.has(key)) groups.set(key, { modelId: r.model_id, color, ids: [] });
      groups.get(key)!.ids.push(r.express_id);
    }
    const edges = [0, ...breaks];
    onColorize({
      title: 'Carbon ngầm theo cấu kiện (kgCO₂e)',
      groups: [...groups.values()],
      legend: [
        ...CARBON_RAMP.map((color, i) => ({
          color,
          label: i < breaks.length ? `${fmt(edges[i], 0)}–${fmt(breaks[i], 0)}` : `> ${fmt(edges[i], 0)}`,
          count: counts[i],
        })).filter((l) => l.count > 0),
        { color: CARBON_MISSING, label: 'Chưa tính được', count: counts[CARBON_RAMP.length] },
      ],
    });
    setColored(true);
  };

  const selected = selectedGuid
    ? rows.find((r) => r.global_id === selectedGuid && (!selectedModelId || r.model_id === selectedModelId))
    : undefined;
  const factor = selected?.he_so_id ? factors.data?.find((f) => f.id === selected.he_so_id) : undefined;
  // One value per month, invoice before manual entry (same as bim_6d_chi_so)
  const meterRows = meters.data;
  const electricity = useMemo(() => {
    const rank = { hoa_don: 1, nhap_tay: 2 } as const;
    const best = new Map<string, Meter>();
    for (const m of meterRows ?? []) {
      if (m.loai !== 'dien') continue;
      const cur = best.get(m.ky);
      if (!cur || rank[m.nguon] < rank[cur.nguon]) best.set(m.ky, m);
    }
    return [...best.values()].sort((a, b) => a.ky.localeCompare(b.ky)).slice(-12);
  }, [meterRows]);
  const maxKwh = Math.max(1, ...electricity.map((m) => Number(m.gia_tri)));
  const loadError = index.error ?? carbon.error;

  const ix = index.data;

  return (
    <div className={`flex flex-col gap-3 overflow-y-auto p-3 text-xs ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <Leaf className="h-4 w-4 text-emerald-600" aria-hidden /> Bền vững 6D
        </span>
        {onOpenSustain && (
          <button type="button" className={btn} onClick={onOpenSustain}>
            <ExternalLink className="h-3 w-3" aria-hidden /> Hệ số, mục tiêu, LCA
          </button>
        )}
      </div>
      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {errorText(loadError)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Carbon ngầm', ix?.carbon_ngam_kg != null ? `${fmt(ix.carbon_ngam_kg / 1000, 2)} tCO₂e` : 'Chưa tính'],
          [
            'Trên m² sàn',
            ix?.carbon_ngam_m2 != null
              ? `${fmt(ix.carbon_ngam_m2)} kgCO₂e/m²`
              : ix?.dien_tich_san
                ? '—'
                : 'Chưa có diện tích sàn',
          ],
          ['EUI', ix?.eui != null ? `${fmt(ix.eui)} kWh/m²/năm` : `${ix?.so_thang_dien ?? 0}/12 tháng số đo`],
          [
            'Carbon vận hành',
            ix?.carbon_van_hanh_kg_nam != null
              ? `${fmt(ix.carbon_van_hanh_kg_nam / 1000, 2)} tCO₂e/năm`
              : 'Chưa đủ dữ liệu',
          ],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            <p className="text-2xs text-slate-500 dark:text-slate-400">{k}</p>
            <p className="font-mono text-sm font-bold text-slate-800 dark:text-white">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {canEdit && (
          <button type="button" className={btn} disabled={busy || !models.length} onClick={() => void compute()}>
            <Calculator className="h-3 w-3" aria-hidden />{' '}
            {busy ? 'Đang tính…' : rows.length ? 'Tính lại carbon' : 'Tính carbon'}
          </button>
        )}
        <button type="button" className={btn} disabled={!rows.length} onClick={paint} aria-pressed={colored}>
          {colored ? (
            <>
              <X className="h-3 w-3" aria-hidden /> Bỏ tô màu
            </>
          ) : (
            <>
              <Paintbrush className="h-3 w-3" aria-hidden /> Tô màu theo carbon
            </>
          )}
        </button>
      </div>
      {stats.computedAt && (
        <p className="text-2xs text-slate-500">
          Tính lúc {formatDateTime(new Date(stats.computedAt))} · {models.length} mô hình
        </p>
      )}

      {selectedGuid && (
        <section
          className="rounded-xl border border-emerald-200 p-2 dark:border-emerald-800"
          aria-label="Carbon của cấu kiện đang chọn"
        >
          <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Cấu kiện đang chọn</p>
          {!selected ? (
            <p className="text-slate-500">Chưa có kết quả tính cho cấu kiện này.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-2xs">
              <dt className="text-slate-500">Trạng thái</dt>
              <dd>{CARBON_STATUS_LABELS[selected.trang_thai]}</dd>
              <dt className="text-slate-500">Vật liệu</dt>
              <dd>
                {selected.vat_lieu || '—'} → <span className="font-mono">{selected.ma_vat_lieu ?? '—'}</span>
              </dd>
              <dt className="text-slate-500">Khối lượng</dt>
              <dd className="font-mono">
                {fmt(selected.khoi_luong, 3)} {selected.dai_luong ?? ''}
              </dd>
              <dt className="text-slate-500">Hệ số</dt>
              <dd className="font-mono">
                {fmt(selected.he_so, 4)} {factor ? `kgCO₂e/${factor.don_vi}` : ''}
              </dd>
              <dt className="text-slate-500">Carbon</dt>
              <dd className="font-mono font-bold">{fmt(selected.kgco2e, 2)} kgCO₂e</dd>
              {factor && (
                <>
                  <dt className="text-slate-500">Nguồn hệ số</dt>
                  <dd>
                    {factor.nguon} · phiên bản {factor.phien_ban}
                    {factor.organization_id ? ' · thư viện đơn vị' : ''}
                  </dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <>
          <section>
            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Theo mã vật liệu</p>
            <ul className="space-y-0.5">
              {stats.byMaterial.map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="w-28 truncate font-mono text-2xs">{k}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-700">
                    <span
                      className="block h-1.5 rounded-full bg-[#2a78d6]"
                      style={{ width: `${stats.total ? (v / stats.total) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-24 text-right font-mono text-2xs tabular-nums">{fmt(v / 1000, 2)} t</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Theo tầng (10 tầng nhiều nhất)</p>
            <ul className="space-y-0.5">
              {stats.byFloor.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="truncate">{k}</span>
                  <span className="font-mono tabular-nums">{fmt(v / 1000, 2)} t</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Tình trạng tính</p>
            <ul className="space-y-0.5">
              {stats.status.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{CARBON_STATUS_LABELS[k] ?? k}</span>
                  <span className="font-mono">{formatNumber(n, 2)}</span>
                </li>
              ))}
            </ul>
            {stats.status.some(([k]) => k === 'thieu_anh_xa' || k === 'thieu_he_so') && (
              <p className="mt-1 text-2xs text-amber-800 dark:text-amber-200">
                Cấu kiện thiếu ánh xạ hoặc hệ số không được tính là 0. Bổ sung ở tab Bền vững của dự án. Vật liệu chưa
                ánh xạ:{' '}
                {[
                  ...new Set(
                    rows
                      .filter((r) => r.trang_thai === 'thieu_anh_xa')
                      .map((r) => r.vat_lieu || `(trống, ${getIfcLabel(r.loai_cau_kien ?? '')})`),
                  ),
                ]
                  .slice(0, 6)
                  .join('; ')}
              </p>
            )}
          </section>
        </>
      )}

      <section>
        <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Điện tiêu thụ 12 tháng gần nhất</p>
        {electricity.length === 0 ? (
          <p className="text-slate-500">Chưa có số đo điện.</p>
        ) : (
          <div className="flex h-20 items-end gap-0.5" role="img" aria-label="Điện tiêu thụ theo tháng">
            {electricity.map((m) => (
              <div
                key={m.id}
                className="flex h-full flex-1 flex-col justify-end"
                data-tooltip={`${m.ky.slice(0, 7)}: ${fmt(m.gia_tri, 0)} kWh (${m.nguon})`}
              >
                <div
                  className="rounded-t-[3px] bg-[#2a78d6]"
                  style={{ height: `${(Number(m.gia_tri) / maxKwh) * 100}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
