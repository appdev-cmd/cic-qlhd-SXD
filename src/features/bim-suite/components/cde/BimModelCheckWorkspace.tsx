import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// "Kiểm tra mô hình" of one project: IFC verification (7 groups, 14 criteria), LOD 500, printable report and the
// project's unresolved clashes as BCF. Adapted from cic-hud cde/BimModelCheckWorkspace (project portfolio removed; the
// weights per stage are fixed defaults and the stage is set in the project CDE settings of the document library).
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileDown, Gauge, Printer } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useAuth, useBimAccess } from '@/features/bim-suite/adapters/context';
import { useBimModels } from '../../hooks/useBim';
import { BimCheckService, BIM_STAGE_LABELS, type IfcResult } from '../../services/BimCheckService';
import { clashesToBcfItems, ifcReportHtml, printIfcReport } from '../../lib/ifcReport';
import { disciplineLabels } from '../../lib/ifcLabels';
import { useLodResults } from '../../hooks/useBimLod';
import { LodActions, LodBadge, LodDetail, LodTemplateButton } from './LodPanel';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number) => formatNumber(Number(v), 1);
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40';
const GROUP_LABELS: Record<string, string> = {
  dinh_danh: 'Định danh',
  phan_loai: 'Phân loại IFC',
  khong_gian: 'Vị trí không gian',
  vat_lieu: 'Vật liệu',
  khoi_luong: 'Khối lượng',
  thuoc_tinh: 'Thuộc tính',
  tep: 'Tệp và nguồn gốc',
};

function ScoreBar({ value, threshold }: { value: number; threshold?: number | null }) {
  return (
    <div
      className="relative h-2 w-28 rounded-full bg-bg-subtle dark:bg-slate-700"
      role="img"
      aria-label={`${fmt(value)} điểm${threshold != null ? `, ngưỡng ${fmt(threshold)}` : ''}`}
    >
      <div
        className="h-2 rounded-full bg-primary-600 dark:bg-primary-400"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
      {threshold != null && (
        <div
          className="absolute -top-0.5 h-3 w-0.5 bg-txt-primary dark:bg-white"
          style={{ left: `${Math.min(100, threshold)}%` }}
        />
      )}
    </div>
  );
}

function Detail({ result }: { result: IfcResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<
    { express_id: number; global_id: string; ten_cau_kien: string | null; loai_cau_kien: string }[] | null
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async (criterion: string) => {
    if (open === criterion) return setOpen(null);
    setOpen(criterion);
    setRows(null);
    setErr(null);
    try {
      setRows(await BimCheckService.sampleErrors(result.model_id, criterion));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <div className="space-y-2 bg-bg-subtle/60 p-3 dark:bg-slate-900">
      {result.ly_do_khong_dat.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-rose-700 dark:text-rose-300">
          {result.ly_do_khong_dat.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 lg:grid-cols-2">
        {result.nhom.map((g) => (
          <div
            key={g.ma}
            className="rounded-xl border border-border bg-bg-surface p-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-txt-primary dark:text-white">
                {g.ten} <span className="font-normal text-txt-muted">· trọng số {g.trong_so}</span>
              </span>
              <span className="flex items-center gap-2 font-mono tabular-nums">
                {fmt(g.diem)} <ScoreBar value={g.diem} threshold={g.toi_thieu} />
              </span>
            </div>
            <ul className="mt-1 space-y-1">
              {g.tieu_chi.map((c) => (
                <li key={c.ma} className="text-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-txt-secondary dark:text-slate-300">{c.ten}</span>
                    <span className="font-mono tabular-nums text-txt-primary dark:text-white">
                      {fmt(c.ty_le * 100)}%
                    </span>
                  </div>
                  {c.khuyen_nghi && (
                    <div className="flex flex-wrap items-center gap-1.5 text-amber-800 dark:text-amber-200">
                      <span>{c.khuyen_nghi}</span>
                      {g.ma !== 'tep' && (
                        <button type="button" className="font-semibold underline" onClick={() => void load(c.ma)}>
                          {open === c.ma ? 'Ẩn cấu kiện' : 'Xem cấu kiện chưa đạt'}
                        </button>
                      )}
                    </div>
                  )}
                  {open === c.ma && (
                    <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-border p-1 font-mono text-2xs dark:border-slate-600">
                      {err ? (
                        <span className="text-rose-600">{err}</span>
                      ) : !rows ? (
                        'Đang tải…'
                      ) : rows.length === 0 ? (
                        'Không có cấu kiện chưa đạt.'
                      ) : (
                        rows.map((r) => (
                          <div key={r.express_id}>
                            #{r.express_id} {r.global_id} · {r.loai_cau_kien} · {r.ten_cau_kien || '(không tên)'}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export const BimModelCheckWorkspace: React.FC<{ projectId: string; projectName: string }> = ({
  projectId,
  projectName,
}) => {
  const { addToast } = useToast();
  const { currentUser } = useAuth();
  const access = useBimAccess();
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const modelsQuery = useBimModels(projectId);
  const scores = useQuery({
    queryKey: ['bim-ifc-scores', projectId],
    queryFn: () => BimCheckService.latestScores(projectId),
  });
  const config = useQuery({
    queryKey: ['bim-ifc-config'],
    queryFn: () => BimCheckService.getConfig(),
    staleTime: 3600_000,
  });
  const stage = useQuery({
    queryKey: ['bim-project-stage', projectId],
    queryFn: () => BimCheckService.projectStage(projectId),
  });
  const names = useQuery({
    queryKey: ['bim-cde-models', projectId],
    queryFn: () => BimCheckService.modelContainers(projectId),
  });
  const clashes = useQuery({
    queryKey: ['bim-open-clashes', projectId],
    queryFn: () => BimCheckService.openClashes(projectId),
  });
  const lod = useLodResults(projectId);
  const score = useMutation({
    mutationFn: (modelId: string) => BimCheckService.runScore(modelId),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['bim-ifc-scores', projectId] });
      void cache.invalidateQueries({ queryKey: ['bim-cde-models', projectId] });
    },
  });
  const lodByModel = useMemo(() => new Map((lod.data ?? []).map((r) => [r.model_id, r])), [lod.data]);
  const nameByModel = useMemo(() => new Map((names.data ?? []).map((n) => [n.model_id, n])), [names.data]);
  // Latest ready version of every model chain.
  const models = useMemo(() => {
    const all = modelsQuery.data ?? [];
    const superseded = new Set(all.map((m) => m.model_goc_id).filter(Boolean));
    const byModel = new Map((scores.data ?? []).map((s) => [s.model_id, s]));
    return all
      .filter((m) => m.status === 'ready' && !superseded.has(m.id))
      .map((model) => ({ model, result: byModel.get(model.id), cde: nameByModel.get(model.id) }));
  }, [modelsQuery.data, scores.data, nameByModel]);
  const passed = models.filter((m) => m.result?.dat).length;
  const unscored = models.filter((m) => !m.result).length;
  const stageConfig = config.data?.find((c) => c.giai_doan === (stage.data ?? 'thiet_ke'));

  const report = (list: typeof models) => {
    const items = list
      .filter((m) => m.result)
      .map((m) => ({
        result: m.result as IfcResult,
        fileName: m.model.file_name,
        projectName,
        cdeName: m.cde?.ma_tep,
      }));
    if (!items.length) return addToast({ type: 'info', message: 'Chưa có mô hình nào được chấm điểm.' });
    if (!printIfcReport(ifcReportHtml(items, currentUser?.name)))
      addToast({ type: 'error', message: 'Trình duyệt chặn cửa sổ báo cáo. Cho phép cửa sổ bật lên rồi thử lại.' });
  };
  const exportBcf = async () => {
    try {
      const { exportIssuesToBcf } = await import('../../lib/bcf');
      const blob = await exportIssuesToBcf(clashesToBcfItems(clashes.data ?? []), projectName);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'va-cham-' + projectName.replace(/[^\p{L}\p{N}]+/gu, '-') + '.bcfzip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const error = modelsQuery.error ?? scores.error;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-txt-secondary">
          {models.length} mô hình · {passed} đạt · {unscored} chưa chấm · Giai đoạn{' '}
          <strong>{BIM_STAGE_LABELS[stage.data ?? 'thiet_ke']}</strong>
          {stageConfig ? ` (điểm đạt ≥ ${stageConfig.diem_toi_thieu})` : ''}. Mô hình chỉ chuyển sang vùng Chia sẻ của
          CDE khi lần chấm gần nhất đạt.
        </p>
        <div className="flex flex-wrap gap-2">
          <LodTemplateButton />
          <button type="button" className={btn} onClick={() => report(models)} disabled={!models.length}>
            <Printer className="h-3.5 w-3.5" aria-hidden /> Báo cáo PDF
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {errorText(error)}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-bg-surface shadow-sm">
          <BimTable className="w-full min-w-[960px] text-xs">
            <thead className="text-left text-txt-secondary">
              <tr>
                <th className="w-6" />
                <th className="px-2 py-2">Mô hình</th>
                <th className="px-2 py-2">Bộ môn</th>
                <th className="px-2 py-2">CDE</th>
                <th className="px-2 py-2">Điểm / ngưỡng</th>
                <th className="px-2 py-2">Kết quả</th>
                <th className="px-2 py-2">LOD 500</th>
                <th className="px-2 py-2">Lần chấm</th>
                <th className="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {modelsQuery.isPending && (
                <tr>
                  <td colSpan={9} className="p-3">
                    <div className="h-16 animate-pulse rounded-xl bg-bg-subtle" />
                  </td>
                </tr>
              )}
              {!modelsQuery.isPending && !models.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-txt-muted">
                    Dự án chưa có mô hình chuyển đổi xong.
                  </td>
                </tr>
              )}
              {models.map(({ model, result, cde }) => {
                const lodResult = lodByModel.get(model.id);
                const label = cde?.ma_tep ?? model.file_name;
                return (
                  <React.Fragment key={model.id}>
                    <tr className="border-t border-border align-middle">
                      <td className="pl-2">
                        {(result || lodResult) && (
                          <button
                            type="button"
                            aria-label={expanded === model.id ? 'Thu gọn' : 'Xem chi tiết'}
                            aria-expanded={expanded === model.id}
                            onClick={() => setExpanded((x) => (x === model.id ? null : model.id))}
                          >
                            {expanded === model.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className="block break-all font-mono text-2xs font-semibold text-txt-primary">
                          {label}
                        </span>
                        <span className="text-2xs text-txt-muted">
                          {model.file_name} · phiên bản {model.phien_ban ?? 1}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-txt-secondary">
                        {disciplineLabels[model.discipline] ?? model.discipline}
                      </td>
                      <td className="px-2 py-2 text-txt-secondary">
                        {cde ? `${cde.vung.toUpperCase()} · ${cde.ma_phu_hop} · ${cde.ma_sua_doi}` : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {result ? (
                          <span className="flex items-center gap-2 font-mono tabular-nums">
                            {fmt(result.diem_tong)}/{fmt(result.diem_toi_thieu)}{' '}
                            <ScoreBar value={result.diem_tong} threshold={result.diem_toi_thieu} />
                          </span>
                        ) : (
                          <span className="text-txt-muted">Chưa chấm</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {result ? (
                          <span
                            className={
                              'rounded-lg px-1.5 py-0.5 text-2xs font-semibold ' +
                              (result.dat ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-50' : 'bg-rose-50 text-rose-700 dark:bg-rose-50')
                            }
                          >
                            {result.dat ? 'Đạt' : 'Chưa đạt'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <LodBadge result={lodResult} error={lod.error} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-txt-muted">
                        {result ? formatDateTime(new Date(result.created_at)) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {access.canWrite && (
                            <button
                              type="button"
                              className={btn}
                              disabled={score.isPending && score.variables === model.id}
                              onClick={() =>
                                void score.mutateAsync(model.id).then(
                                  (r) =>
                                    addToast({
                                      type: r.dat ? 'success' : 'info',
                                      message: `${label}: ${fmt(r.diem_tong)} điểm, ${r.dat ? 'đạt' : 'chưa đạt'}.`,
                                    }),
                                  (e) => addToast({ type: 'error', message: errorText(e) }),
                                )
                              }
                            >
                              <Gauge className="h-3 w-3" aria-hidden /> {result ? 'Chấm lại' : 'Chấm điểm'}
                            </button>
                          )}
                          {result && (
                            <button type="button" className={btn} onClick={() => report([{ model, result, cde }])}>
                              <Printer className="h-3 w-3" aria-hidden /> PDF
                            </button>
                          )}
                          {!lod.error && (
                            <LodActions
                              modelId={model.id}
                              label={label}
                              canWrite={access.canWrite}
                              evaluated={!!lodResult}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === model.id && (result || lodResult) && (
                      <tr>
                        <td colSpan={9}>
                          {result && <Detail result={result} />}
                          {lodResult && (
                            <div className="bg-bg-subtle/60 px-3 pb-3">
                              <LodDetail result={lodResult} />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </BimTable>
        </div>
      )}

      {stageConfig ? (
        <details className="rounded-2xl border border-border bg-bg-surface p-3 text-xs shadow-sm">
          <summary className="cursor-pointer font-semibold">
            Trọng số và ngưỡng của giai đoạn {BIM_STAGE_LABELS[stageConfig.giai_doan]}
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(GROUP_LABELS).map(([code, label]) => (
              <li key={code} className="rounded-lg border border-border px-2 py-1">
                {label}: trọng số {stageConfig.trong_so[code] ?? 0}
                {stageConfig.nhom_bat_buoc[code] != null ? ` · tối thiểu ${stageConfig.nhom_bat_buoc[code]}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-txt-muted">
            Đổi giai đoạn của dự án trong Hồ sơ tài liệu › Trạng thái CDE › Cấu hình.
          </p>
        </details>
      ) : null}

      <section
        className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm"
        aria-labelledby="bim-open-clashes"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="bim-open-clashes" className="text-sm font-bold text-txt-primary">
            Va chạm chưa xử lý: {clashes.data?.length ?? '…'}
          </h3>
          <button type="button" className={btn} disabled={!clashes.data?.length} onClick={() => void exportBcf()}>
            <FileDown className="h-3 w-3" aria-hidden /> Xuất BCF
          </button>
        </div>
        {clashes.error ? <p className="mt-1 text-xs text-rose-700">{errorText(clashes.error)}</p> : null}
      </section>
    </div>
  );
};
