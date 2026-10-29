import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimQuickSelect.tsx
// Chọn nhanh nhiều cấu kiện để nghiệm thu: lọc theo tầng, loại cấu kiện, vật liệu, gói việc tiến độ thi công và
// tình trạng nghiệm thu (trên mọi mô hình đang hiển thị, ghép KT / KC / MEP), rồi chọn trên mô hình, cô lập hoặc
// lập biên bản nghiệm thu cho cả nhóm. Số đếm từng lựa chọn tính ở máy chủ (GROUP BY), không tải mọi cấu kiện.

import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Loader2, MousePointerClick, Focus, X, Wand2, ChevronDown, ChevronRight } from 'lucide-react';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
// Tiến độ thi công (B5) chưa chuyển: nguồn rỗng, bộ lọc gói tiến độ tự ẩn.
import { useScheduleTasks } from '../hooks/useBimPlan';
import { useBimWorkspaceAcceptance } from '../hooks/useBim';
import { getIfcLabel } from '../lib/ifcLabels';
import { storeyRank } from '../lib/clashGrouping';
import { BimSelectionService, type QuickSelectParams } from '../services/BimSelectionService';

type NtFilter = 'all' | 'chua' | 'da';

interface BimQuickSelectProps {
  projectId: string;
  models: BimModel[];
  canEdit: boolean;
  onSelect: (items: { modelId: string; expressId: number }[]) => void;
  onIsolate: (groups: { modelId: string; ids: number[] }[]) => void;
  /** Lập biên bản nghiệm thu cho nhóm cấu kiện (GUID), kèm tên gợi ý và mô hình chính của nhóm.
   *  Bỏ trống khi dự án chưa có mô-đun nghiệm thu: ẩn bộ lọc và nút nghiệm thu. */
  onGroupAcceptance?: (
    guids: string[],
    title: string,
    modelId: string,
    elements: { modelId: string; guid: string }[],
  ) => void;
}

const ACCEPTED = new Set(['dat', 'dat_co_dieu_kien']);

/**
 * Tách bản đồ nghiệm thu (khóa JSON [model, guid]) thành tham số cho máy chủ:
 * khóa "model|guid" khi hồ sơ gắn mô hình, GUID trần khi hồ sơ không gắn mô hình.
 */
export function acceptanceParams(acceptance: Record<string, string>): { keys: string[]; guids: string[] } {
  const keys: string[] = [];
  const guids: string[] = [];
  // GUID đã có hồ sơ gắn đúng mô hình (bất kỳ kết luận nào) thì hồ sơ không gắn mô hình không ghi đè
  const modelSpecific = new Set<string>();
  const parsed: [string, string, string][] = [];
  for (const [key, status] of Object.entries(acceptance)) {
    try {
      const [model, guid] = JSON.parse(key) as [string, string];
      if (!guid) continue;
      parsed.push([model || '', guid, status]);
      if (model) modelSpecific.add(guid);
    } catch {
      // khóa không đúng dạng → bỏ qua
    }
  }
  for (const [model, guid, status] of parsed) {
    if (!ACCEPTED.has(status)) continue;
    if (model) keys.push(`${model}|${guid}`);
    else if (!modelSpecific.has(guid)) guids.push(guid);
  }
  return { keys: keys.sort(), guids: guids.sort() };
}

const chip = (active: boolean) =>
  `px-2 py-0.5 rounded-full border text-2xs whitespace-nowrap ${
    active
      ? 'border-primary-500 bg-primary-600 text-white font-semibold'
      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400'
  }`;

const toggle = (set: Set<string>, v: string) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

export const BimQuickSelect: React.FC<BimQuickSelectProps> = ({
  projectId,
  models,
  canEdit,
  onSelect,
  onIsolate,
  onGroupAcceptance,
}) => {
  const modelIds = useMemo(
    () =>
      models
        .filter((m) => m.status === 'ready')
        .map((m) => m.id)
        .sort(),
    [models],
  );
  const [open, setOpen] = useState(true);
  const [floors, setFloors] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<Set<string>>(new Set());
  const [pkg, setPkg] = useState<string>('');
  const [nt, setNt] = useState<NtFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const taskQuery = useScheduleTasks(projectId);
  const acceptanceQuery = useBimWorkspaceAcceptance(projectId, open);
  const accepted = useMemo(() => acceptanceParams(acceptanceQuery.data || {}), [acceptanceQuery.data]);

  const params: QuickSelectParams = useMemo(
    () => ({
      modelIds,
      projectId,
      floors: [...floors].sort(),
      types: [...types].sort(),
      materials: [...materials].sort(),
      pkg: pkg || null,
      nt,
      acceptedKeys: accepted.keys,
      acceptedGuids: accepted.guids,
    }),
    [modelIds, projectId, floors, types, materials, pkg, nt, accepted],
  );
  const facetQuery = useQuery({
    queryKey: ['bim-quick-select-facets', params],
    queryFn: () => BimSelectionService.quickSelectFacets(params),
    enabled: open && modelIds.length > 0 && !acceptanceQuery.isLoading,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const facetData = facetQuery.data;

  const pkgName = useMemo(
    () =>
      new Map(
        (taskQuery.data || [])
          .filter((t) => !t.la_tom_tat)
          .map((t) => [
            t.id,
            {
              name: `${t.ma_wbs} · ${t.ten}`,
              group: t.vi_tri || 'Tiến độ',
            },
          ]),
      ),
    [taskQuery.data],
  );

  const facets = useMemo(() => {
    const f = facetData;
    return {
      floors: [...(f?.floors || [])].sort(
        (a, b) => storeyRank(a[0]) - storeyRank(b[0]) || a[0].localeCompare(b[0], 'vi', { numeric: true }),
      ),
      types: [...(f?.types || [])].sort((a, b) => b[1] - a[1]),
      materials: [...(f?.materials || [])].sort((a, b) => b[1] - a[1]),
      pkgs: (f?.pkgs || [])
        .filter(([id]) => pkgName.has(id))
        .sort((a, b) =>
          (pkgName.get(a[0])!.group + pkgName.get(a[0])!.name).localeCompare(
            pkgName.get(b[0])!.group + pkgName.get(b[0])!.name,
            'vi',
            { numeric: true },
          ),
        ),
      total: f?.total ?? 0,
      accepted: f?.accepted ?? 0,
    };
  }, [facetData, pkgName]);

  const error =
    (facetQuery.error as Error | null) || (taskQuery.error as Error | null) || (acceptanceQuery.error as Error | null);
  const isLoading = (facetQuery.isLoading && !facetData) || taskQuery.isLoading || acceptanceQuery.isLoading;
  const refreshing = facetQuery.isFetching;
  const anyFilter = floors.size > 0 || types.size > 0 || materials.size > 0 || !!pkg || nt !== 'all';
  const total = facets.total;

  const title = useMemo(() => {
    const parts: string[] = [];
    if (pkg && pkgName.get(pkg)) parts.push(pkgName.get(pkg)!.name);
    else {
      if (types.size) parts.push([...types].map((t) => getIfcLabel(t).toLowerCase()).join(', '));
      if (floors.size)
        parts.push(
          [...floors]
            .sort((a, b) => storeyRank(a) - storeyRank(b))
            .map((f) => f.toLowerCase())
            .join(', '),
        );
    }
    return `Nghiệm thu ${parts.join(' – ') || `${total} cấu kiện`}`;
  }, [pkg, pkgName, types, floors, total]);

  const reset = () => {
    setFloors(new Set());
    setTypes(new Set());
    setMaterials(new Set());
    setPkg('');
    setNt('all');
  };

  /** Đọc danh sách cấu kiện thỏa điều kiện từ máy chủ rồi thực hiện thao tác */
  const withElements = async (
    action: string,
    fn: (rows: { model_id: string; express_id: number; global_id: string }[]) => void,
  ) => {
    setBusy(action);
    setActionError(null);
    try {
      fn(await BimSelectionService.quickSelectElements(params));
    } catch (e: any) {
      setActionError(e?.message || 'Không đọc được danh sách cấu kiện');
    } finally {
      setBusy(null);
    }
  };

  const groupsOf = (rows: { model_id: string; express_id: number }[]) => {
    const map = new Map<string, number[]>();
    rows.forEach((r) => {
      const list = map.get(r.model_id);
      if (list) list.push(r.express_id);
      else map.set(r.model_id, [r.express_id]);
    });
    return [...map.entries()].map(([modelId, ids]) => ({ modelId, ids }));
  };

  const disabled = !!error || isLoading || !!busy || !anyFilter || !total;

  return (
    <div className="rounded-xl border border-primary-200 dark:border-primary-900 bg-primary-50/40 dark:bg-primary-950 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <Wand2 className="w-3.5 h-3.5 text-primary-600" />
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {onGroupAcceptance ? 'Chọn nhanh để nghiệm thu' : 'Chọn nhanh cấu kiện'}
        </span>
        <span className="text-2xs text-slate-400 truncate">theo tầng · loại · vật liệu · gói việc · tình trạng</span>
      </button>
      {(error || actionError) && (
        <p role="alert" className="px-3 py-2 text-rose-600">
          Không tải được bộ chọn: {error?.message || actionError}
        </p>
      )}
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đếm cấu kiện của {modelIds.length} mô hình...
            </div>
          ) : modelIds.length === 0 || (!error && facetData && facetData.floors.length === 0 && !anyFilter) ? (
            <p className="text-slate-400 italic py-2">Chưa có mô hình sẵn sàng.</p>
          ) : (
            <>
              <div>
                <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tầng</div>
                <div className="flex flex-wrap gap-1">
                  {facets.floors.map(([f, n]) => (
                    <button
                      key={f}
                      type="button"
                      className={chip(floors.has(f))}
                      onClick={() => setFloors((s) => toggle(s, f))}
                    >
                      {f} <span className="opacity-70">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Loại cấu kiện</div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {facets.types.map(([t, n]) => (
                    <button
                      key={t}
                      type="button"
                      className={chip(types.has(t))}
                      onClick={() => setTypes((s) => toggle(s, t))}
                      data-tooltip={t}
                    >
                      {getIfcLabel(t)} <span className="opacity-70">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              {facets.materials.length > 1 && (
                <div>
                  <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Vật liệu</div>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {facets.materials.map(([m, n]) => (
                      <button
                        key={m}
                        type="button"
                        className={chip(materials.has(m))}
                        onClick={() => setMaterials((s) => toggle(s, m))}
                        data-tooltip={m}
                      >
                        <span className="max-w-[160px] inline-block truncate align-bottom">{m}</span>{' '}
                        <span className="opacity-70">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {facets.pkgs.length > 0 && (
                <div>
                  <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Gói việc tiến độ thi công
                  </div>
                  <BimSelect
                    value={pkg}
                    onChange={(e) => setPkg(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    aria-label="Gói việc tiến độ thi công"
                  >
                    <option value="">— Mọi gói việc —</option>
                    {[...new Set(facets.pkgs.map(([id]) => pkgName.get(id)!.group))].map((g) => (
                      <optgroup key={g} label={g}>
                        {facets.pkgs
                          .filter(([id]) => pkgName.get(id)!.group === g)
                          .map(([id, n]) => (
                            <option key={id} value={id}>
                              {pkgName.get(id)!.name} ({n})
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </BimSelect>
                </div>
              )}
              {onGroupAcceptance && (
                <div className="flex items-center gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-slate-500 mr-1">Nghiệm thu</span>
                  {(
                    [
                      ['all', 'Tất cả'],
                      ['chua', 'Chưa nghiệm thu'],
                      ['da', 'Đã nghiệm thu'],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" className={chip(nt === k)} onClick={() => setNt(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 border-t border-primary-100 dark:border-primary-900">
                <span className="text-slate-700 dark:text-slate-200">
                  <b className="tabular-nums">{formatNumber(total, 2)}</b> cấu kiện
                  {facets.accepted > 0 && (
                    <span className="text-emerald-600"> · {formatNumber(facets.accepted, 2)} đã nghiệm thu</span>
                  )}
                </span>
                {refreshing && <Loader2 className="w-3 h-3 animate-spin text-slate-400" aria-label="Đang đếm" />}
                <span className="flex-1" />
                {anyFilter && (
                  <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-0.5 text-slate-400 hover:text-slate-600"
                    data-tooltip="Bỏ mọi điều kiện"
                  >
                    <X className="w-3 h-3" /> Bỏ lọc
                  </button>
                )}
              </div>
              <div className={`grid ${onGroupAcceptance ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    withElements('select', (rows) =>
                      onSelect(rows.map((r) => ({ modelId: r.model_id, expressId: r.express_id }))),
                    )
                  }
                  className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-primary-400 disabled:opacity-40"
                >
                  {busy === 'select' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MousePointerClick className="w-3.5 h-3.5" />
                  )}{' '}
                  Chọn
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => withElements('isolate', (rows) => onIsolate(groupsOf(rows)))}
                  className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-primary-400 disabled:opacity-40"
                >
                  {busy === 'isolate' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Focus className="w-3.5 h-3.5" />
                  )}{' '}
                  Cô lập
                </button>
                {onGroupAcceptance && (
                  <button
                    type="button"
                    disabled={disabled || !canEdit}
                    onClick={() =>
                      withElements('accept', (rows) => {
                        const withGuid = rows.filter((r) => r.global_id);
                        if (!withGuid.length) return;
                        const guids = [...new Set(withGuid.map((r) => r.global_id))];
                        const counts = new Map<string, number>();
                        rows.forEach((r) => counts.set(r.model_id, (counts.get(r.model_id) || 0) + 1));
                        const mainModel = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || modelIds[0];
                        onSelect(rows.map((r) => ({ modelId: r.model_id, expressId: r.express_id })));
                        onGroupAcceptance(
                          guids,
                          title,
                          mainModel,
                          withGuid.map((r) => ({ modelId: r.model_id, guid: r.global_id })),
                        );
                      })
                    }
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-40 dark:bg-emerald-600"
                    data-tooltip={canEdit ? `${title} (${total} cấu kiện)` : 'Cần quyền chỉnh sửa dự án'}
                  >
                    {busy === 'accept' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ClipboardCheck className="w-3.5 h-3.5" />
                    )}{' '}
                    Nghiệm thu
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
