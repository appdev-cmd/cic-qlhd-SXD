import { formatDate as sxdFormatDate } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X, Play, Pause } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { BimTask } from '@/features/bim-suite/types/bim.types';
import { useScheduleBaselines, useScheduleLinks, useScheduleTasks } from '../hooks/useBimPlan';
import { BimScheduleService, toBimTask, type ScheduleTask } from '../services/BimScheduleService';
import {
  SCHEDULE_COLORS,
  scheduleDay,
  scheduleGroupsAt,
  type ScheduleMode,
  type FutureDisplay,
  type ScheduleState,
} from '../lib/schedule4d';
export { SCHEDULE_COLORS, type ScheduleState };
// 4D simulation on the project schedule (Tiến độ tab): plan, actual or a frozen baseline, colouring linked elements.
interface Props {
  embedded?: boolean;
  /** Opens the schedule manager (Tiến độ tab). */
  onOpenSchedule?: () => void;
  displayModelIds?: string[];
  getSelectionElements?: () => Promise<{ modelId: string; guid: string }[]>;
  projectId: string;
  canEdit?: boolean;
  selectedGuid?: string | null;
  onApply: (groups: Record<ScheduleState, string[]> | null, date: Date, future: FutureDisplay) => void;
  onClose: () => void;
}
const DAY = 86400000;
const EMPTY_ROWS: ScheduleTask[] = [];
const EMPTY_LINKS: Record<string, string[]> = {};
const fmt = (time: number) => sxdFormatDate(new Date(time));
export const Bim4DPanel: React.FC<Props> = ({
  projectId,
  embedded = false,
  onOpenSchedule,
  canEdit,
  selectedGuid,
  onApply,
  onClose,
  getSelectionElements,
  displayModelIds,
}) => {
  const taskQuery = useScheduleTasks(projectId);
  const linkQuery = useScheduleLinks(projectId);
  const rows = taskQuery.data ?? EMPTY_ROWS;
  const currentTasks = useMemo(() => rows.filter((t) => !t.la_tom_tat).map(toBimTask), [rows]);
  const links = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const link of linkQuery.data || []) {
      if (displayModelIds && !displayModelIds.includes(link.model_id)) continue;
      (result[link.global_id] ||= []).push(link.task_id);
    }
    return result;
  }, [linkQuery.data, displayModelIds]);
  const baselines = useScheduleBaselines(projectId);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ScheduleMode>('plan');
  const [futureDisplay, setFutureDisplay] = useState<FutureDisplay>('hide');
  const [collapsed, setCollapsed] = useState(false);
  const [baselineId, setBaselineId] = useState('');
  const baseline = baselines.data?.find((b) => b.id === baselineId) || baselines.data?.[0];
  const tasks = useMemo(
    () =>
      mode === 'baseline' && baseline
        ? Object.entries(baseline.tasks).map(
            ([id, t]) =>
              ({
                ma_nhiem_vu: id,
                tieu_de: t.title || id,
                ngay_bat_dau: t.start,
                ngay_han: t.end,
                ngay_bat_dau_thuc_te: null,
                ngay_ket_thuc_thuc_te: null,
                tien_do: 0,
                trang_thai: 'chua_bat_dau',
              }) as BimTask,
          )
        : currentTasks,
    [mode, baseline, currentTasks],
  );
  const activeLinks = mode === 'baseline' ? (baseline?.links ?? EMPTY_LINKS) : links;
  const sourceReady =
    mode !== 'baseline' || !displayModelIds || !baseline?.models?.some((m) => !displayModelIds.includes(m.id));
  const [taskId, setTaskId] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('Kế hoạch đã chốt');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleLinks = useMemo(
    () =>
      taskId === 'all'
        ? activeLinks
        : Object.fromEntries(
            Object.entries(activeLinks)
              .filter(([, ids]) => ids.includes(taskId))
              .map(([guid]) => [guid, [taskId]]),
          ),
    [activeLinks, taskId],
  );
  const range = useMemo(() => {
    const ids = new Set(Object.values(visibleLinks).flat());
    const relevant = tasks.filter((t) => ids.has(t.ma_nhiem_vu));
    const times = (relevant.length ? relevant : tasks)
      .flatMap((t) => [
        t.ngay_bat_dau,
        t.ngay_han,
        t.ngay_bat_dau_thuc_te,
        t.ngay_ket_thuc_thuc_te,
        baseline?.tasks[t.ma_nhiem_vu]?.start,
        baseline?.tasks[t.ma_nhiem_vu]?.end,
      ])
      .map(scheduleDay)
      .filter((t): t is number => t !== null);
    if (!times.length) return null;
    const min = Math.min(...times),
      max = Math.max(...times);
    return { min, max, days: Math.max(0, Math.round((max - min) / DAY)) };
  }, [tasks, visibleLinks, baseline]);
  const days = range?.days ?? 0;
  const index = Math.max(0, Math.min(dayIndex ?? days, days));
  const time = range ? range.min + index * DAY : 0;
  const changeSimulationDate = (value: string) => {
    const day = scheduleDay(value);
    if (day === null || !range) return;
    setPlaying(false);
    setDayIndex(Math.max(0, Math.min(days, Math.round((day - range.min) / DAY))));
  };
  const error = mode === 'baseline' ? baselines.error : taskQuery.error || linkQuery.error;
  const ready =
    (mode === 'baseline' ? !baselines.isLoading : !taskQuery.isLoading && !linkQuery.isLoading) &&
    !error &&
    sourceReady &&
    (mode !== 'baseline' || baseline?.links != null) &&
    (mode !== 'baseline' || (!baselines.isLoading && !!baseline));
  const groups = useMemo(
    () => scheduleGroupsAt(tasks, visibleLinks, time, mode, baseline?.tasks),
    [tasks, visibleLinks, time, mode, baseline],
  );
  useEffect(() => {
    onApply(ready ? groups : null, new Date(time), futureDisplay);
  }, [onApply, ready, groups, time, futureDisplay]);
  useEffect(() => {
    if (!playing || !ready || !range) return;
    const timer = window.setInterval(() => setDayIndex((prev) => Math.min(days, (prev ?? 0) + step)), speed);
    return () => window.clearInterval(timer);
  }, [playing, ready, range, days, step, speed]);
  useEffect(() => {
    if (index >= days) setPlaying(false);
  }, [index, days]);
  const save = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const b = await BimScheduleService.saveBaseline(projectId, name);
      await queryClient.invalidateQueries({ queryKey: ['bim-plan', 'baselines', projectId] });
      setBaselineId(b.id);
      setMode('baseline');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không lưu được kế hoạch');
    } finally {
      setSaving(false);
    }
  };
  const bulk = async (remove: boolean) => {
    if (!getSelectionElements || taskId === 'all') return;
    setSaving(true);
    setActionError(null);
    try {
      const elements = await getSelectionElements();
      if (!elements.length) throw new Error('Chọn cấu kiện trên BIM hoặc bằng Bộ chọn trước.');
      const count = await BimScheduleService.linkSelection(projectId, taskId, elements, remove);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bim-plan', 'links', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['bim-links'] }),
        queryClient.invalidateQueries({ queryKey: ['bim-linked-guids'] }),
      ]);
      setActionError(`${remove ? 'Đã gỡ' : 'Đã gắn'} ${count} liên kết công việc.`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không cập nhật được liên kết');
    } finally {
      setSaving(false);
    }
  };
  const linkedCount = Object.keys(visibleLinks).length;
  const cls = 'rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 min-w-0';
  return (
    <div
      className={`${embedded ? 'h-full overflow-y-auto' : 'absolute left-1/2 -translate-x-1/2 bottom-16 z-20 w-[min(720px,calc(100%-2rem))] max-h-[70%] overflow-auto rounded-2xl backdrop-blur border border-slate-200 dark:border-slate-700 shadow-xl'} bg-white/95 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200`}
    >
      <div className="flex gap-2 items-center p-3 border-b border-slate-200 dark:border-slate-700">
        <CalendarClock className="w-4 h-4 text-violet-600" />
        <b>Mô phỏng tiến độ</b>
        <span className="text-2xs text-slate-500">{linkedCount} cấu kiện · tiến độ dự án</span>
        <span className="flex-1" />
        {collapsed && ready && range && <span className="font-mono">{fmt(time)}</span>}
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="text-slate-500"
          data-tooltip={collapsed ? 'Mở bảng tiến độ' : 'Thu gọn bảng tiến độ'}
        >
          {collapsed ? 'Mở bảng' : 'Thu gọn'}
        </button>
        {onOpenSchedule && (
          <button type="button" onClick={onOpenSchedule} className="text-violet-600">
            Tiến độ
          </button>
        )}
        <button type="button" onClick={onClose} data-tooltip="Tắt mô phỏng">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-2" hidden={collapsed}>
        <p className="text-2xs text-slate-500">
          Nguồn: tiến độ của dự án (tab Tiến độ: nhập từ Excel/MS Project, sinh theo mẫu trình tự hoặc lập tay).
          {!rows.length && !taskQuery.isLoading && ' Dự án chưa có công việc tiến độ.'}
        </p>
        <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          Phần chưa thi công
          <BimSelect
            aria-label="Hiển thị cấu kiện chưa thi công"
            className={`${cls} flex-1`}
            value={futureDisplay}
            onChange={(e) => setFutureDisplay(e.target.value as FutureDisplay)}
          >
            <option value="hide">Ẩn để thấy phần đã thi công</option>
            <option value="solid">Hiện đầy đủ</option>
          </BimSelect>
        </label>
        <BimInput
          aria-label="Tìm công việc tiến độ"
          placeholder="Tìm mã WBS, tầng, bộ môn hoặc công việc…"
          value={taskSearch}
          onChange={(e) => setTaskSearch(e.target.value)}
          className={`${cls} w-full`}
        />
        <div className="flex flex-wrap gap-2">
          <BimSelect
            aria-label="Chế độ mô phỏng tiến độ"
            value={mode}
            onChange={(e) => {
              setPlaying(false);
              setMode(e.target.value as ScheduleMode);
              setTaskId('all');
            }}
            className={cls}
          >
            <option value="plan">Kế hoạch hiện tại</option>
            <option value="actual">Thực tế so với kế hoạch</option>
            <option value="baseline">Kế hoạch đã chốt</option>
          </BimSelect>
          <BimSelect
            aria-label="Công việc mô phỏng"
            value={taskId}
            onChange={(e) => {
              setPlaying(false);
              setTaskId(e.target.value);
            }}
            className={`${cls} flex-1`}
          >
            <option value="all">Mọi công việc đã liên kết</option>
            {tasks
              .filter(
                (t) =>
                  t.ma_nhiem_vu === taskId ||
                  !taskSearch ||
                  t.tieu_de.toLocaleLowerCase('vi').includes(taskSearch.toLocaleLowerCase('vi')),
              )
              .map((t) => (
                <option key={t.ma_nhiem_vu} value={t.ma_nhiem_vu}>
                  {t.tieu_de}
                </option>
              ))}
          </BimSelect>
          <BimSelect
            aria-label="Tốc độ mô phỏng"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className={cls}
          >
            <option value={1000}>Chậm</option>
            <option value={500}>Vừa</option>
            <option value={250}>Nhanh</option>
          </BimSelect>
          <BimSelect
            aria-label="Bước thời gian"
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className={cls}
          >
            <option value={1}>Ngày</option>
            <option value={7}>Tuần</option>
          </BimSelect>
        </div>
        {mode === 'baseline' && (
          <BimSelect
            aria-label="Phiên bản kế hoạch"
            value={baseline?.id || ''}
            onChange={(e) => setBaselineId(e.target.value)}
            className={`${cls} w-full`}
          >
            <option value="">Chọn kế hoạch đã chốt</option>
            {baselines.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.ten} · {fmt(Date.parse(b.created_at))}
              </option>
            ))}
          </BimSelect>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <BimInput
              aria-label="Tên kế hoạch chốt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${cls} flex-1`}
            />
            <button
              type="button"
              disabled={saving || !rows.length || !name.trim() || taskQuery.isLoading || !!taskQuery.error}
              onClick={save}
              className="text-violet-700 disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Chốt kế hoạch dùng chung'}
            </button>
          </div>
        )}
        {canEdit && getSelectionElements && (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving || taskId === 'all' || mode === 'baseline'}
              onClick={() => void bulk(false)}
              className="text-primary-600 disabled:opacity-40"
            >
              Gắn tập đang chọn vào công việc
            </button>
            <button
              type="button"
              disabled={saving || taskId === 'all' || mode === 'baseline'}
              onClick={() => void bulk(true)}
              className="text-rose-600 disabled:opacity-40"
            >
              Gỡ tập đang chọn khỏi công việc
            </button>
          </div>
        )}
        {mode === 'baseline' && baseline && (
          <p className="text-2xs text-slate-500">
            Nguồn đã chốt:{' '}
            {baseline.models?.map((m) => `${m.file_name} v${m.phien_ban || 1}`).join(' · ') ||
              'Chưa có mô hình gắn công việc'}
          </p>
        )}
        {selectedGuid && (
          <p className="text-slate-500">
            Cấu kiện đang chọn:{' '}
            {tasks
              .filter((t) => activeLinks[selectedGuid]?.includes(t.ma_nhiem_vu))
              .map((t) => t.tieu_de)
              .join(' · ') || 'Chưa liên kết công việc'}
          </p>
        )}
        <p className="text-2xs text-slate-500">
          {futureDisplay === 'hide'
            ? 'Phần chưa thi công được ẩn tạm để không che kết cấu đã xây. '
            : 'Phần chưa thi công hiện đầy đủ và có thể che kết cấu bên trong. '}
          Thiếu ngày được hiển thị riêng, không suy ngược từ % hoàn thành.
        </p>
        {actionError && (
          <p role="alert" className="text-rose-600">
            {actionError}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-rose-600">
            Không tải được dữ liệu tiến độ: {error.message}{' '}
            <button
              type="button"
              onClick={() => {
                void taskQuery.refetch();
                void linkQuery.refetch();
                void baselines.refetch();
              }}
            >
              Thử lại
            </button>
          </p>
        ) : !ready ? (
          <p className="text-slate-500">
            {mode === 'baseline' && baseline?.links == null && baseline
              ? 'Bản chốt cũ chưa lưu tập liên kết. Chốt phiên bản mới để mô phỏng lịch sử.'
              : !sourceReady
                ? 'Nạp đúng các phiên bản mô hình nguồn của kế hoạch đã chốt.'
                : mode === 'baseline' && !baseline
                  ? 'Chưa có kế hoạch đã chốt.'
                  : 'Đang tải dữ liệu tiến độ…'}
          </p>
        ) : !range ? (
          <p className="text-slate-500">
            Chưa có công việc có mốc thời gian. Lập WBS tại Công trình → Thi công → Tiến độ rồi gắn cấu kiện.
          </p>
        ) : !linkedCount ? (
          <p className="text-slate-500">
            Chưa gắn cấu kiện vào công việc. Chọn cấu kiện → Thuộc tính → Gắn công việc tiến độ.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-tooltip="Về đầu"
                onClick={() => {
                  setPlaying(false);
                  setDayIndex(0);
                }}
              >
                Đầu
              </button>
              <button
                type="button"
                data-tooltip={playing ? 'Tạm dừng' : 'Chạy mô phỏng'}
                onClick={() => {
                  if (index >= days) setDayIndex(0);
                  setPlaying((p) => !p);
                }}
                className="p-1.5 bg-violet-600 text-white rounded dark:bg-violet-600"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <BimInput
                type="range"
                aria-label="Mốc thời gian mô phỏng"
                min={0}
                max={days}
                value={index}
                onChange={(e) => {
                  setPlaying(false);
                  setDayIndex(Number(e.target.value));
                }}
                className="flex-1 accent-violet-600"
              />
              <span className="font-mono">{fmt(time)}</span>
              <BimInput
                type="date"
                aria-label="Ngày mô phỏng tiến độ"
                value={new Date(time).toISOString().slice(0, 10)}
                min={new Date(range.min).toISOString().slice(0, 10)}
                max={new Date(range.max).toISOString().slice(0, 10)}
                className={`${cls} max-w-32`}
                onInput={(e) => changeSimulationDate(e.currentTarget.value)}
                onChange={(e) => changeSimulationDate(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setDayIndex(
                    Math.round(
                      (scheduleDay(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString())! -
                        range.min) /
                        DAY,
                    ),
                  );
                }}
              >
                Hôm nay
              </button>
              <button
                type="button"
                data-tooltip="Tới cuối"
                onClick={() => {
                  setPlaying(false);
                  setDayIndex(days);
                }}
              >
                Cuối
              </button>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(SCHEDULE_COLORS) as ScheduleState[]).map((state) => (
                <span key={state} className="flex items-center gap-1 text-2xs">
                  <i className="w-2.5 h-2.5 rounded-sm" style={{ background: SCHEDULE_COLORS[state].color }} />
                  {SCHEDULE_COLORS[state].label} <b>{groups[state].length}</b>
                </span>
              ))}
            </div>
            <p className="text-2xs text-slate-400">
              {fmt(range.min)} → {fmt(range.max)} · Ưu tiên màu: chậm → đang làm → thiếu dữ liệu → hoàn thành khi mọi
              công tác đã xong.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
