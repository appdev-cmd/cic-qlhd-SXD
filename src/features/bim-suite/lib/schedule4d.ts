// features/bim/lib/schedule4d.ts
// Trạng thái và màu tô của mô phỏng tiến độ 4D — tách khỏi Bim4DPanel để tab nạp panel theo nhu cầu (lazy)

import type { BimTask } from '@/features/bim-suite/types/bim.types';
import type { ScheduleTask } from '../services/BimScheduleService';
export type ScheduleMode = 'plan' | 'actual' | 'baseline';
export type FutureDisplay = 'hide' | 'solid';
export type ScheduleState = 'hoan_thanh' | 'dang_lam' | 'chua_bat_dau' | 'cham_tien_do' | 'chua_du_du_lieu';

export const SCHEDULE_COLORS: Record<ScheduleState, { color: string; label: string }> = {
  hoan_thanh: { color: '#16a34a', label: 'Đã hoàn thành' },
  dang_lam: { color: '#f59e0b', label: 'Đang thi công' },
  cham_tien_do: { color: '#dc2626', label: 'Chậm so với kế hoạch' },
  chua_bat_dau: { color: '#94a3b8', label: 'Chưa bắt đầu' },
  chua_du_du_lieu: { color: '#64748b', label: 'Thiếu mốc thời gian' },
};

export const scheduleAppearance = (state: ScheduleState, future: FutureDisplay) => ({
  color: SCHEDULE_COLORS[state].color,
  visible: state !== 'chua_bat_dau' || future !== 'hide',
  opacity: 1,
});

export const scheduleDay = (value?: string | null): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const at = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value.slice(0, 10) ? at : null;
};
export type TaskBaseline = Record<string, { start: string | null; end: string | null; title?: string }>;
export const taskStateAt = (task: BimTask, at: number, mode: ScheduleMode, baseline?: TaskBaseline): ScheduleState => {
  const plannedStart = scheduleDay(mode === 'baseline' ? baseline?.[task.ma_nhiem_vu]?.start : task.ngay_bat_dau);
  const plannedEnd = scheduleDay(mode === 'baseline' ? baseline?.[task.ma_nhiem_vu]?.end : task.ngay_han);
  if (mode !== 'actual') {
    if (plannedStart === null || plannedEnd === null || plannedEnd < plannedStart) return 'chua_du_du_lieu';
    return at < plannedStart ? 'chua_bat_dau' : at >= plannedEnd ? 'hoan_thanh' : 'dang_lam';
  }
  const start = scheduleDay(task.ngay_bat_dau_thuc_te);
  const done = scheduleDay(task.ngay_ket_thuc_thuc_te);
  if (done !== null && start !== null && done < start) return 'chua_du_du_lieu';
  if (done !== null && done <= at) return 'hoan_thanh';
  if (plannedEnd !== null && at > plannedEnd) return 'cham_tien_do';
  if (start !== null) return at >= start ? 'dang_lam' : 'chua_bat_dau';
  return plannedStart !== null ? 'chua_bat_dau' : 'chua_du_du_lieu';
};

/** Each GUID gets exactly one colour, regardless of task/link order. */
export function scheduleGroupsAt(
  tasks: BimTask[],
  links: Record<string, string[]>,
  at: number,
  mode: ScheduleMode,
  baseline?: TaskBaseline,
) {
  const groups: Record<ScheduleState, string[]> = {
    hoan_thanh: [],
    dang_lam: [],
    cham_tien_do: [],
    chua_bat_dau: [],
    chua_du_du_lieu: [],
  };
  const byId = new Map(tasks.map((task) => [task.ma_nhiem_vu, task]));
  for (const [guid, ids] of Object.entries(links)) {
    const states = [...new Set(ids)].map((id) =>
      byId.has(id) ? taskStateAt(byId.get(id)!, at, mode, baseline) : 'chua_du_du_lieu',
    );
    if (!states.length) continue;
    const state: ScheduleState = states.includes('cham_tien_do')
      ? 'cham_tien_do'
      : states.includes('dang_lam')
        ? 'dang_lam'
        : states.includes('chua_du_du_lieu')
          ? 'chua_du_du_lieu'
          : states.every((s) => s === 'hoan_thanh')
            ? 'hoan_thanh'
            : 'chua_bat_dau';
    groups[state].push(guid);
  }
  return groups;
}

/** Schedule task in the BimTask shape the ported 4D code reads. */
export const toBimTask = (t: ScheduleTask): BimTask => ({
  ma_nhiem_vu: t.id,
  tieu_de: `${t.ma_wbs} · ${t.ten}`,
  trang_thai: t.phan_tram_thuc_te != null && t.phan_tram_thuc_te >= 100 ? 'hoan_thanh' : null,
  tien_do: t.phan_tram_thuc_te,
  ngay_bat_dau: t.bat_dau,
  ngay_han: t.ket_thuc,
  ngay_bat_dau_thuc_te: t.bat_dau_thuc_te,
  ngay_ket_thuc_thuc_te: t.ket_thuc_thuc_te,
});
