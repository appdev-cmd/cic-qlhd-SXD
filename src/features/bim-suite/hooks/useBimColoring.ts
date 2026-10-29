// Model colouring (one place calls viewer.colorize): 4D simulation, clash results, smart sets/Uniclass, field progress,
// element category, acceptance status, linked records and changes against the previous version. Ported from cic-hud
// useBimColoring without the AI highlight source, which arrives with the AI phases.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BimColorGroup, BimViewerRef } from '../viewer/types';
import type { BimColorMode } from '../components/BimToolbar';
import type { SmartSetColoring } from '../components/BimSmartSetsPanel';
import type { BimClashRow, BimModel } from '../types/bim.types';
import { useBimAcceptanceStatus, useBimLinkedGuids, useBimVersionDiff } from './useBim';
import { getIfcLabel } from '../lib/ifcLabels';
import { useBimFieldActual } from './useBimPlan';
import { SCHEDULE_COLORS, scheduleAppearance, type FutureDisplay, type ScheduleState } from '../lib/schedule4d';

export interface LegendItem {
  color: string;
  label: string;
  count: number;
}

const CATEGORY_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#ca8a04',
  '#9333ea',
  '#be123c',
  '#475569',
];

export const ACCEPTANCE_COLORS: Record<string, { color: string; label: string }> = {
  dat: { color: '#16a34a', label: 'Nghiệm thu đạt' },
  dat_co_dieu_kien: { color: '#f59e0b', label: 'Đạt có điều kiện' },
  khong_dat: { color: '#dc2626', label: 'Không đạt' },
  cho_nghiem_thu: { color: '#2563eb', label: 'Chờ nghiệm thu' },
};

export const ACTUAL_COLORS: Record<string, { color: string; label: string }> = {
  da_nghiem_thu: { color: '#15803d', label: 'Đã nghiệm thu' },
  da_thi_cong: { color: '#0891b2', label: 'Đã thi công' },
  dang_thi_cong: { color: '#f59e0b', label: 'Đang thi công' },
  cham: { color: '#dc2626', label: 'Chậm tiến độ' },
  chua_bat_dau: { color: '#94a3b8', label: 'Chưa bắt đầu' },
};

const EMPTY_DIFF: never[] = [];

export function useBimColoring({
  projectId,
  loadedIds,
  colorMode,
  activeModel,
  clashRows,
  setColoring,
  scheduleGroups = null,
  scheduleFutureDisplay = 'hide',
  viewerRef,
}: {
  projectId: string;
  loadedIds: string[];
  colorMode: BimColorMode;
  /** Ready model whose changes against model_goc_id are shown in 'version' mode. */
  activeModel: BimModel | null;
  clashRows: BimClashRow[] | null;
  setColoring: SmartSetColoring | null;
  /** 4D simulation: GlobalIds per task state at the simulated date (takes precedence over other sources). */
  scheduleGroups?: Record<ScheduleState, string[]> | null;
  scheduleFutureDisplay?: FutureDisplay;
  viewerRef: RefObject<BimViewerRef | null>;
}): LegendItem[] {
  const [legend, setLegend] = useState<LegendItem[]>([]);
  const colored = useRef(false);
  const guidCache = useRef(new Map<string, Map<string, number | null>>());
  const actual = useBimFieldActual(projectId, colorMode === 'tien_do');
  const { data: acceptanceMap } = useBimAcceptanceStatus(projectId, colorMode === 'acceptance');
  const { data: linkedGuids } = useBimLinkedGuids(colorMode === 'linked' ? projectId : undefined);
  const { data: versionDiff = EMPTY_DIFF } = useBimVersionDiff(
    colorMode === 'version' ? activeModel?.model_goc_id : null,
    colorMode === 'version' ? activeModel?.id : null,
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || loadedIds.length === 0) return;
    if (colorMode === 'none' && !scheduleGroups && !clashRows?.length && !setColoring && !colored.current) return;
    let cancelled = false;
    const byGuids = async (guids: string[], color: string, groups: BimColorGroup[]) => {
      let count = 0;
      for (const modelId of loadedIds) {
        const ids = guids.length ? await viewer.getLocalIdsByGuids(modelId, guids) : [];
        if (ids.length) groups.push({ modelId, color, ids });
        count += ids.length;
      }
      return count;
    };

    const run = async () => {
      const groups: BimColorGroup[] = [];
      const items: LegendItem[] = [];
      if (scheduleGroups) {
        for (const state of Object.keys(SCHEDULE_COLORS) as ScheduleState[]) {
          const guids = [...new Set(scheduleGroups[state])];
          if (!guids.length) continue;
          let count = 0;
          for (const modelId of loadedIds) {
            let cache = guidCache.current.get(modelId);
            if (!cache) guidCache.current.set(modelId, (cache = new Map()));
            const missing = guids.filter((g) => !cache!.has(g));
            if (missing.length) {
              const mapped = await viewer.mapGuidsToIds(modelId, missing);
              missing.forEach((g, i) => cache!.set(g, mapped[i] ?? null));
            }
            if (cancelled) return;
            const ids = guids.map((g) => cache!.get(g)).filter((id): id is number => typeof id === 'number');
            if (ids.length) groups.push({ modelId, ...scheduleAppearance(state, scheduleFutureDisplay), ids });
            count += ids.length;
          }
          const hidden = state === 'chua_bat_dau' && scheduleFutureDisplay === 'hide';
          items.push({
            color: SCHEDULE_COLORS[state].color,
            label: SCHEDULE_COLORS[state].label + (hidden ? ' (đang ẩn)' : ''),
            count,
          });
        }
        if (!groups.length) items.push({ color: '#94a3b8', label: 'Chưa gắn cấu kiện vào công việc', count: 0 });
      } else if (clashRows?.length) {
        const byModel = new Map<string, Set<number>>();
        for (const r of clashRows) {
          byModel.set(r.modelA, (byModel.get(r.modelA) ?? new Set()).add(r.idA));
          byModel.set(r.modelB, (byModel.get(r.modelB) ?? new Set()).add(r.idB));
        }
        byModel.forEach((ids, modelId) => groups.push({ modelId, color: '#dc2626', ids: [...ids] }));
        items.push({
          color: '#dc2626',
          label: 'Cấu kiện có va chạm',
          count: groups.reduce((s, g) => s + g.ids.length, 0),
        });
      } else if (setColoring) {
        const loaded = new Set(loadedIds);
        setColoring.groups.forEach((g) => loaded.has(g.modelId) && g.ids.length && groups.push(g));
        items.push(...setColoring.legend);
      } else if (colorMode === 'tien_do') {
        for (const [state, look] of Object.entries(ACTUAL_COLORS)) {
          let count = 0;
          for (const modelId of loadedIds) {
            const guids = (actual.data ?? [])
              .filter((r) => r.model_id === modelId && r.trang_thai === state)
              .map((r) => r.global_id);
            const ids = guids.length ? await viewer.getLocalIdsByGuids(modelId, guids) : [];
            if (cancelled) return;
            if (ids.length) groups.push({ modelId, color: look.color, ids });
            count += ids.length;
          }
          if (count) items.push({ ...look, count });
        }
        if (actual.error) items.push({ color: '#dc2626', label: 'Không tải được tiến độ hiện trường', count: 0 });
        else if (!items.length)
          items.push({
            color: '#94a3b8',
            label: actual.isLoading
              ? 'Đang tải tiến độ hiện trường…'
              : 'Chưa có cấu kiện gắn tiến độ hoặc biên bản nghiệm thu',
            count: 0,
          });
      } else if (colorMode === 'category') {
        const counts = new Map<string, number>();
        const colorOf = new Map<string, string>();
        for (const modelId of loadedIds) {
          for (const cat of await viewer.getCategories(modelId)) {
            if (!colorOf.has(cat.category))
              colorOf.set(cat.category, CATEGORY_PALETTE[colorOf.size % CATEGORY_PALETTE.length]);
            groups.push({ modelId, color: colorOf.get(cat.category)!, ids: cat.ids });
            counts.set(cat.category, (counts.get(cat.category) || 0) + cat.ids.length);
          }
        }
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .forEach(([cat, count]) => items.push({ color: colorOf.get(cat)!, label: getIfcLabel(cat), count }));
      } else if (colorMode === 'acceptance' && acceptanceMap) {
        const byStatus = new Map<string, string[]>();
        Object.entries(acceptanceMap).forEach(([guid, st]) => byStatus.set(st, [...(byStatus.get(st) || []), guid]));
        for (const [st, guids] of byStatus) {
          const look = ACCEPTANCE_COLORS[st] ?? { color: '#64748b', label: st };
          items.push({ ...look, count: await byGuids(guids, look.color, groups) });
        }
        if (!items.length) items.push({ color: '#94a3b8', label: 'Chưa có biên bản gắn cấu kiện', count: 0 });
      } else if (colorMode === 'linked' && linkedGuids) {
        items.push({
          color: '#0891b2',
          label: 'Có tài liệu, nhiệm vụ hoặc biên bản liên kết',
          count: await byGuids(linkedGuids, '#0891b2', groups),
        });
      } else if (colorMode === 'version' && activeModel) {
        const ids = (state: string) =>
          versionDiff.filter((r) => r.trang_thai === state && r.express_id_moi !== null).map((r) => r.express_id_moi!);
        const added = ids('them_moi');
        const changed = ids('da_sua');
        if (added.length) groups.push({ modelId: activeModel.id, color: '#16a34a', ids: added });
        if (changed.length) groups.push({ modelId: activeModel.id, color: '#f59e0b', ids: changed });
        items.push({ color: '#16a34a', label: 'Thêm mới', count: added.length });
        items.push({ color: '#f59e0b', label: 'Đã sửa đổi', count: changed.length });
        items.push({
          color: '#dc2626',
          label: 'Đã xóa (không còn trong mô hình)',
          count: versionDiff.filter((r) => r.trang_thai === 'da_xoa').length,
        });
      }
      if (cancelled) return;
      await viewer.colorize(groups.length ? groups : null);
      if (cancelled) return;
      colored.current = groups.length > 0;
      setLegend((prev) => (JSON.stringify(prev) === JSON.stringify(items) ? prev : items));
    };
    run().catch(() => {
      if (!cancelled) setLegend([{ color: '#dc2626', label: 'Không áp dụng được màu mô hình', count: 0 }]);
    });
    return () => {
      cancelled = true;
    };
  }, [
    colorMode,
    scheduleGroups,
    scheduleFutureDisplay,
    clashRows,
    setColoring,
    loadedIds,
    acceptanceMap,
    linkedGuids,
    versionDiff,
    activeModel,
    viewerRef,
    actual.data,
    actual.error,
    actual.isLoading,
  ]);

  return legend;
}
