import {formatDate as sxdFormatDate} from '@/lib/utils';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Project schedule (ACC Schedule): WBS tasks imported from Excel/MS Project, generated from a sequence template or
// entered by hand; progress is updated here and drives 4D colouring, 5D completed quantities and EVM.
import React, { useMemo, useState } from 'react';
import { CalendarClock, Copy, Download, FileUp, Lock, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { Modal } from '@/features/bim-suite/adapters/ui';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useBimModels } from '../../hooks/useBim';
import {
  useRefreshPlan,
  useScheduleBaselines,
  useScheduleLinks,
  useScheduleTasks,
  useScheduleTemplates,
} from '../../hooks/useBimPlan';
import {
  BimScheduleService,
  type ScheduleStep,
  type ScheduleTask,
  type ScheduleTemplate,
} from '../../services/BimScheduleService';
import {
  downloadTemplate,
  parseMsProjectXml,
  parseScheduleSheet,
  readFirstSheet,
  type ScheduleImportRow,
} from '../../lib/planImport';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field =
  'mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const label = 'block text-xs font-semibold text-txt-secondary dark:text-slate-300';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

function Footer({
  onClose,
  onSubmit,
  disabled,
  busy,
  text,
}: {
  onClose: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  text: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-txt-secondary dark:border-slate-600 dark:text-slate-200"
      >
        Hủy
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || busy}
        className="rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {busy ? 'Đang xử lý…' : text}
      </button>
    </div>
  );
}

/** Mô hình sẵn sàng, bản mới nhất của mỗi chuỗi phiên bản. */
function useLatestModels(projectId: string) {
  const models = useBimModels(projectId);
  return useMemo(() => {
    const list = models.data ?? [];
    const superseded = new Set(list.map((m) => m.model_goc_id).filter(Boolean));
    return list.filter((m) => m.status === 'ready' && !superseded.has(m.id));
  }, [models.data]);
}

function ImportModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const models = useLatestModels(projectId);
  const [model, setModel] = useState('');
  const [rows, setRows] = useState<ScheduleImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    try {
      const r = /\.xml$/i.test(file.name)
        ? parseMsProjectXml(await file.text())
        : parseScheduleSheet(await readFirstSheet(file));
      setRows(r.rows);
      setWarnings(r.warnings);
    } catch (e) {
      setRows([]);
      setWarnings([errorText(e)]);
    }
  };
  const run = async () => {
    setBusy(true);
    try {
      const res = await BimScheduleService.importSchedule(
        projectId,
        rows.map((r) => ({ ...r, model_id: r.guid?.length && model ? model : null })),
      );
      refresh();
      addToast({
        type: res.loi.length ? 'info' : 'success',
        message: `Thêm ${res.them}, cập nhật ${res.cap_nhat} công việc, gắn ${res.lien_ket} cấu kiện${res.loi.length ? `; ${res.loi.length} dòng bị bỏ qua` : ''}.`,
      });
      if (res.loi.length) setWarnings(res.loi.map((l) => `Dòng ${l.dong}${l.wbs ? ` (${l.wbs})` : ''}: ${l.loi}`));
      else onClose();
    } catch (e) {
      addToast({ type: 'error', title: 'Không nhập được tiến độ', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const withGuid = rows.filter((r) => r.guid?.length).length;
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="full"
      title={`Nhập tiến độ · ${projectName}`}
      description="Excel có cột Mã WBS, Tên công việc (tùy chọn: Bắt đầu, Kết thúc, Tỷ trọng, Tiền nhiệm, % hoàn thành, Vị trí, Bộ môn, GUID) hoặc MS Project XML. Công việc trùng mã WBS được cập nhật, không tạo trùng."
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void run()}
          disabled={!rows.length || (withGuid > 0 && !model)}
          busy={busy}
          text={`Nhập ${rows.length} công việc`}
        />
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Tệp tiến độ (.xlsx, .csv, MS Project .xml)
            <BimInput
              type="file"
              accept=".xlsx,.csv,.xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
              }}
              className="mt-1 block w-full text-sm text-txt-secondary dark:text-slate-300"
            />
          </label>
        </div>
        <button
          type="button"
          className={btn}
          onClick={() =>
            void downloadTemplate(
              'mau-tien-do.csv',
              [
                'Mã WBS',
                'Tên công việc',
                'Bắt đầu',
                'Kết thúc',
                'Tỷ trọng',
                'Tiền nhiệm',
                '% hoàn thành',
                'Vị trí',
                'Bộ môn',
                'GUID',
              ],
              [
                ['1', 'Phần thân', '', '', '', '', '', '', '', ''],
                ['1.1', 'Sàn tầng 2', '01/03/2026', '10/03/2026', 60, '', 0, 'Tầng 2', 'KC', ''],
              ],
            )
          }
        >
          <Download className="h-3 w-3" aria-hidden /> Tải tệp mẫu
        </button>
        {withGuid > 0 && (
          <label className={label}>
            {withGuid} công việc có cột GUID — gắn vào mô hình
            <BimSelect value={model} onChange={(e) => setModel(e.target.value)} className={field}>
              <option value="">Chọn mô hình…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.file_name}
                </option>
              ))}
            </BimSelect>
          </label>
        )}
        {warnings.length > 0 && (
          <ul className="max-h-24 list-disc overflow-auto rounded-xl bg-amber-50 py-1.5 pl-6 pr-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-xl border border-border dark:border-slate-600">
            <BimTable className="w-full text-2xs">
              <thead className="sticky top-0 bg-bg-subtle text-left dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-1">WBS</th>
                  <th className="px-2 py-1">Công việc</th>
                  <th className="px-2 py-1">Bắt đầu</th>
                  <th className="px-2 py-1">Kết thúc</th>
                  <th className="px-2 py-1">Tiền nhiệm</th>
                  <th className="px-2 py-1">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-border/60 dark:border-slate-700">
                    <td className="px-2 py-0.5 font-mono">{r.ma_wbs}</td>
                    <td className={`px-2 py-0.5 ${r.la_tom_tat ? 'font-bold' : ''}`}>{r.ten}</td>
                    <td className="px-2 py-0.5 font-mono">{r.bat_dau ?? '—'}</td>
                    <td className="px-2 py-0.5 font-mono">{r.ket_thuc ?? '—'}</td>
                    <td className="px-2 py-0.5 font-mono">{r.tien_nhiem_wbs ?? ''}</td>
                    <td className="px-2 py-0.5">{r.phan_tram_thuc_te ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </BimTable>
            {rows.length > 200 && <p className="p-1.5 text-2xs text-txt-muted">Hiển thị 200/{rows.length} dòng.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GenerateModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const templates = useScheduleTemplates(projectId);
  const models = useLatestModels(projectId);
  const [tpl, setTpl] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [start, setStart] = useState(today());
  const [prefix, setPrefix] = useState('TD');
  const [busy, setBusy] = useState(false);
  const template = templates.data?.find((t) => t.id === tpl);
  const run = async () => {
    setBusy(true);
    try {
      const r = await BimScheduleService.generate({ projectId, templateId: tpl, modelIds: chosen, start, prefix });
      refresh();
      addToast({
        type: 'success',
        message: `Đã tạo ${r.so_cong_viec} công việc trên ${r.so_tang} tầng, gắn ${formatNumber(r.so_lien_ket, 2)} cấu kiện, từ ${r.bat_dau} đến ${r.ket_thuc}.`,
      });
      onClose();
    } catch (e) {
      addToast({ type: 'error', title: 'Không sinh được tiến độ', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="full"
      title={`Sinh tiến độ từ mẫu · ${projectName}`}
      description="Mỗi tầng × mỗi bước của mẫu thành một công việc nối tiếp nhau, gắn sẵn cấu kiện đúng loại trên tầng đó. Bước không có cấu kiện thì bỏ qua."
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void run()}
          disabled={!tpl || !chosen.length || !start}
          busy={busy}
          text="Sinh tiến độ"
        />
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Mẫu trình tự
            <BimSelect value={tpl} onChange={(e) => setTpl(e.target.value)} className={field}>
              <option value="">Chọn mẫu…</option>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.he_thong ? '' : '[Dự án] '}
                  {t.ten}
                </option>
              ))}
            </BimSelect>
          </label>
          <label className={label}>
            Ngày bắt đầu
            <BimInput type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Tiền tố mã WBS
            <BimInput
              value={prefix}
              maxLength={10}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              className={field}
            />
          </label>
        </div>
        <fieldset>
          <legend className={label}>Mô hình</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {models.length === 0 && <span className="text-xs text-txt-muted">Dự án chưa có mô hình sẵn sàng.</span>}
            {models.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs dark:border-slate-600"
              >
                <BimInput
                  type="checkbox"
                  className="accent-primary-600"
                  checked={chosen.includes(m.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id)))}
                />
                {m.file_name}
              </label>
            ))}
          </div>
        </fieldset>
        {template && (
          <ol className="space-y-0.5 rounded-xl bg-bg-subtle p-2 text-2xs dark:bg-slate-900">
            {template.buoc.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.ten} · {s.thoi_luong_ngay} ngày · {s.loai_cau_kien.join(', ')}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}

function TemplateEditor({
  base,
  projectId,
  onClose,
}: {
  base: ScheduleTemplate;
  projectId: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const editing = !base.he_thong && base.project_id === projectId;
  const [name, setName] = useState(editing ? base.ten : `${base.ten} (dự án)`);
  const [steps, setSteps] = useState<ScheduleStep[]>(base.buoc.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<ScheduleStep>) =>
    setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = async () => {
    setBusy(true);
    try {
      await BimScheduleService.saveTemplate({
        id: editing ? base.id : undefined,
        project_id: projectId,
        ten: name.trim(),
        mo_ta: base.mo_ta,
        loai_du_an: base.loai_du_an,
        buoc: steps,
      });
      refresh();
      addToast({ type: 'success', message: 'Đã lưu mẫu của dự án.' });
      onClose();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const cell =
    'w-full rounded border border-border bg-white px-1 py-0.5 text-2xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="full"
      title={editing ? 'Sửa mẫu của dự án' : 'Nhân bản mẫu cho dự án'}
      footer={
        <Footer
          onClose={onClose}
          onSubmit={() => void save()}
          disabled={
            !name.trim() ||
            steps.length === 0 ||
            steps.some((s) => !s.ten.trim() || !s.loai_cau_kien.length || s.thoi_luong_ngay < 1)
          }
          busy={busy}
          text="Lưu mẫu"
        />
      }
    >
      <div className="space-y-2">
        <label className={label}>
          Tên mẫu
          <BimInput value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <BimTable className="w-full text-2xs">
          <thead>
            <tr className="text-left text-txt-secondary">
              <th className="py-1">Bước</th>
              <th>Loại cấu kiện IFC (cách nhau dấu phẩy)</th>
              <th className="w-20">Số ngày/tầng</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-1">
                  <BimInput value={s.ten} onChange={(e) => set(i, { ten: e.target.value })} className={cell} />
                </td>
                <td className="pr-1">
                  <BimInput
                    value={s.loai_cau_kien.join(', ')}
                    onChange={(e) =>
                      set(i, {
                        loai_cau_kien: e.target.value
                          .split(/[\s,;]+/)
                          .map((x) => x.trim().toUpperCase())
                          .filter(Boolean),
                      })
                    }
                    className={`${cell} font-mono`}
                  />
                </td>
                <td className="pr-1">
                  <BimInput
                    type="number"
                    min={1}
                    max={365}
                    value={s.thoi_luong_ngay}
                    onChange={(e) => set(i, { thoi_luong_ngay: Math.max(1, Number(e.target.value) || 1) })}
                    className={cell}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Xóa bước ${s.ten}`}
                    onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </BimTable>
        <button
          type="button"
          className={btn}
          onClick={() =>
            setSteps((l) => [...l, { ten: 'Bước mới', loai_cau_kien: [], thoi_luong_ngay: 1, ty_trong: 1 }])
          }
        >
          <Plus className="h-3 w-3" aria-hidden /> Thêm bước
        </button>
      </div>
    </Modal>
  );
}

type TaskDraft = Partial<ScheduleTask> & { id?: string };

function TaskEditor({
  projectId,
  task,
  tasks,
  onClose,
}: {
  projectId: string;
  task: TaskDraft;
  tasks: ScheduleTask[];
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const [t, setT] = useState<TaskDraft>(task);
  const [busy, setBusy] = useState(false);
  const set = (patch: TaskDraft) => setT((x) => ({ ...x, ...patch }));
  const pct = t.phan_tram_thuc_te;
  const invalid =
    !t.ma_wbs?.trim() ||
    !t.ten?.trim() ||
    (!!t.bat_dau && !!t.ket_thuc && t.ket_thuc < t.bat_dau) ||
    (pct != null && (pct < 0 || pct > 100));
  const save = async () => {
    setBusy(true);
    try {
      await BimScheduleService.saveTask(projectId, t);
      refresh();
      onClose();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={t.id ? `Sửa công việc ${task.ma_wbs}` : 'Thêm công việc'}
      footer={
        <Footer onClose={onClose} onSubmit={() => void save()} disabled={invalid} busy={busy} text="Lưu công việc" />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Mã WBS
          <BimInput
            value={t.ma_wbs ?? ''}
            maxLength={50}
            onChange={(e) => set({ ma_wbs: e.target.value })}
            className={field}
          />
        </label>
        <label className={label}>
          Tên công việc
          <BimInput value={t.ten ?? ''} maxLength={300} onChange={(e) => set({ ten: e.target.value })} className={field} />
        </label>
        <label className={label}>
          Bắt đầu (kế hoạch)
          <BimInput
            type="date"
            value={t.bat_dau ?? ''}
            onChange={(e) => set({ bat_dau: e.target.value || null })}
            className={field}
          />
        </label>
        <label className={label}>
          Kết thúc (kế hoạch)
          <BimInput
            type="date"
            value={t.ket_thuc ?? ''}
            onChange={(e) => set({ ket_thuc: e.target.value || null })}
            className={field}
          />
        </label>
        <label className={label}>
          Bắt đầu thực tế
          <BimInput
            type="date"
            value={t.bat_dau_thuc_te ?? ''}
            onChange={(e) => set({ bat_dau_thuc_te: e.target.value || null })}
            className={field}
          />
        </label>
        <label className={label}>
          Kết thúc thực tế
          <BimInput
            type="date"
            value={t.ket_thuc_thuc_te ?? ''}
            onChange={(e) => set({ ket_thuc_thuc_te: e.target.value || null })}
            className={field}
          />
        </label>
        <label className={label}>
          % hoàn thành thực tế
          <BimInput
            type="number"
            min={0}
            max={100}
            value={pct ?? ''}
            onChange={(e) => set({ phan_tram_thuc_te: e.target.value === '' ? null : Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className={label}>
          Tỷ trọng
          <BimInput
            type="number"
            min={0}
            value={t.ty_trong ?? 0}
            onChange={(e) => set({ ty_trong: Math.max(0, Number(e.target.value) || 0) })}
            className={field}
          />
        </label>
        <label className={label}>
          Tiền nhiệm
          <BimSelect
            value={t.tien_nhiem_id ?? ''}
            onChange={(e) => set({ tien_nhiem_id: e.target.value || null })}
            className={field}
          >
            <option value="">Không có</option>
            {tasks
              .filter((x) => x.id !== t.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.ma_wbs} · {x.ten}
                </option>
              ))}
          </BimSelect>
        </label>
        <label className={label}>
          Vị trí / tầng
          <BimInput
            value={t.vi_tri ?? ''}
            maxLength={200}
            onChange={(e) => set({ vi_tri: e.target.value })}
            className={field}
          />
        </label>
        <label className={label}>
          Bộ môn
          <BimInput
            value={t.bo_mon ?? ''}
            maxLength={50}
            onChange={(e) => set({ bo_mon: e.target.value })}
            className={field}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-txt-secondary dark:text-slate-300">
          <BimInput
            type="checkbox"
            className="accent-primary-600"
            checked={!!t.la_tom_tat}
            onChange={(e) => set({ la_tom_tat: e.target.checked })}
          />
          Công việc tóm tắt (nhóm, không gắn cấu kiện)
        </label>
      </div>
    </Modal>
  );
}

const dmy = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const DAY = 86400000;
/** Planned % of a task on a day: share of its duration elapsed. */
const plannedPct = (t: ScheduleTask, now: number) => {
  if (!t.bat_dau || !t.ket_thuc) return null;
  const a = Date.parse(t.bat_dau),
    b = Date.parse(t.ket_thuc) + DAY;
  return Math.max(0, Math.min(100, ((now - a) / Math.max(DAY, b - a)) * 100));
};

export const BimScheduleManager: React.FC<{
  projectId: string;
  projectName: string;
  canWrite: boolean;
  onSimulate?: () => void;
}> = ({ projectId, projectName, canWrite, onSimulate }) => {
  const { addToast } = useToast();
  const refresh = useRefreshPlan();
  const tasks = useScheduleTasks(projectId);
  const links = useScheduleLinks(projectId);
  const baselines = useScheduleBaselines(projectId);
  const templates = useScheduleTemplates(projectId);
  const [modal, setModal] = useState<'import' | 'generate' | null>(null);
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [task, setTask] = useState<TaskDraft | null>(null);
  const [search, setSearch] = useState('');
  const [now] = useState(() => Date.now());
  const list = useMemo(() => tasks.data ?? [], [tasks.data]);
  const linkCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links.data ?? []) m.set(l.task_id, (m.get(l.task_id) ?? 0) + 1);
    return m;
  }, [links.data]);
  const summary = useMemo(() => {
    const leaves = list.filter((t) => !t.la_tom_tat);
    let w = 0,
      kh = 0,
      tt = 0,
      late = 0;
    for (const t of leaves) {
      const p = plannedPct(t, now);
      if (p !== null && (t.phan_tram_thuc_te ?? 0) + 5 < p) late++;
      if (!t.ty_trong || p === null) continue;
      w += t.ty_trong;
      kh += p * t.ty_trong;
      tt += (t.phan_tram_thuc_te ?? 0) * t.ty_trong;
    }
    return {
      leaves: leaves.length,
      late,
      kh: w ? Math.round((kh / w) * 10) / 10 : null,
      tt: w ? Math.round((tt / w) * 10) / 10 : null,
    };
  }, [list, now]);
  const q = search.trim().toLocaleLowerCase('vi');
  const shown = list.filter(
    (t) => !q || `${t.ma_wbs} ${t.ten} ${t.vi_tri ?? ''} ${t.bo_mon ?? ''}`.toLocaleLowerCase('vi').includes(q),
  );
  const byId = useMemo(() => new Map(list.map((t) => [t.id, t])), [list]);
  const freeze = async () => {
    const name = window
      .prompt('Tên kế hoạch chốt (baseline)', `Kế hoạch ${sxdFormatDate(new Date())}`)
      ?.trim();
    if (!name) return;
    try {
      await BimScheduleService.saveBaseline(projectId, name);
      refresh();
      addToast({ type: 'success', message: `Đã chốt “${name}”.` });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const remove = async (t: ScheduleTask) => {
    if (!window.confirm(`Xóa công việc ${t.ma_wbs} · ${t.ten}? Liên kết cấu kiện của công việc cũng bị xóa.`)) return;
    try {
      await BimScheduleService.deleteTask(t.id);
      refresh();
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const error = tasks.error ?? links.error;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          ['Công việc', formatNumber(summary.leaves, 2)],
          ['Chậm so kế hoạch', String(summary.late)],
          ['Thực tế / kế hoạch', summary.kh === null ? 'Chưa có tỷ trọng' : `${summary.tt}% / ${summary.kh}%`],
          ['Cấu kiện gắn tiến độ', formatNumber((links.data?.length ?? 0), 2)],
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="text-2xs font-semibold text-txt-muted">{k}</p>
            <p
              className={`mt-1 font-mono text-lg font-bold tabular-nums ${k === 'Chậm so kế hoạch' && summary.late ? 'text-rose-600 dark:text-rose-300' : 'text-txt-primary dark:text-white'}`}
            >
              {v}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-bg-surface p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <BimInput
          aria-label="Tìm công việc"
          placeholder="Tìm mã WBS, công việc, vị trí, bộ môn…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        {canWrite && (
          <button type="button" className={btn} onClick={() => setTask({ ma_wbs: '', ten: '', ty_trong: 1 })}>
            <Plus className="h-3 w-3" aria-hidden /> Thêm công việc
          </button>
        )}
        {canWrite && (
          <button type="button" className={btn} onClick={() => setModal('import')}>
            <FileUp className="h-3 w-3" aria-hidden /> Nhập tiến độ
          </button>
        )}
        {canWrite && (
          <button type="button" className={btn} onClick={() => setModal('generate')}>
            <Wand2 className="h-3 w-3" aria-hidden /> Sinh từ mẫu
          </button>
        )}
        {canWrite && (
          <button type="button" className={btn} disabled={!list.length} onClick={() => void freeze()}>
            <Lock className="h-3 w-3" aria-hidden /> Chốt kế hoạch
          </button>
        )}
        {onSimulate && (
          <button type="button" className={btn} onClick={onSimulate}>
            <CalendarClock className="h-3 w-3" aria-hidden /> Mô phỏng 4D
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {errorText(error)}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-bg-surface shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <BimTable className="w-full min-w-[920px] text-xs" aria-label="Tiến độ dự án">
          <thead className="text-left text-txt-secondary dark:text-slate-300">
            <tr>
              <th className="px-3 py-2">WBS</th>
              <th className="px-2 py-2">Công việc</th>
              <th className="px-2 py-2">Kế hoạch</th>
              <th className="px-2 py-2">Thực tế</th>
              <th className="px-2 py-2">Tiền nhiệm</th>
              <th className="px-2 py-2 text-right">KH / TT %</th>
              <th className="px-2 py-2 text-right">Cấu kiện</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 500).map((t) => {
              const p = t.la_tom_tat ? null : plannedPct(t, now);
              const late = p !== null && (t.phan_tram_thuc_te ?? 0) + 5 < p;
              const pre = t.tien_nhiem_id ? byId.get(t.tien_nhiem_id) : null;
              return (
                <tr key={t.id} className="border-t border-border/70 dark:border-slate-700">
                  <td className="px-3 py-1.5 font-mono">{t.ma_wbs}</td>
                  <td className={`px-2 py-1.5 ${t.la_tom_tat ? 'font-bold' : ''}`}>
                    {t.ten}
                    {(t.vi_tri || t.bo_mon) && (
                      <span className="block text-2xs text-txt-muted">
                        {[t.vi_tri, t.bo_mon].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {dmy(t.bat_dau)} → {dmy(t.ket_thuc)}
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">
                    {t.bat_dau_thuc_te || t.ket_thuc_thuc_te
                      ? `${dmy(t.bat_dau_thuc_te)} → ${dmy(t.ket_thuc_thuc_te)}`
                      : '—'}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{pre?.ma_wbs ?? ''}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono tabular-nums ${late ? 'font-bold text-rose-600 dark:text-rose-300' : ''}`}
                  >
                    {p === null ? '—' : Math.round(p)} / {t.phan_tram_thuc_te ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {t.la_tom_tat ? '' : formatNumber((linkCount.get(t.id) ?? 0), 2)}
                  </td>
                  <td className="px-3 py-1.5">
                    {canWrite && (
                      <span className="flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Sửa ${t.ma_wbs}`}
                          className="text-txt-muted hover:text-primary-600"
                          onClick={() => setTask(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa ${t.ma_wbs}`}
                          className="text-txt-muted hover:text-rose-600"
                          onClick={() => void remove(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </BimTable>
        {tasks.isSuccess && !list.length && (
          <p className="p-3 text-xs text-txt-muted">
            Dự án chưa có tiến độ. Nhập từ Excel/MS Project, sinh từ mẫu trình tự theo tầng của mô hình, hoặc thêm từng
            công việc.
          </p>
        )}
        {shown.length > 500 && (
          <p className="p-2 text-2xs text-txt-muted">
            Hiển thị 500/{shown.length} công việc; dùng ô tìm để thu hẹp.
          </p>
        )}
        <p className="border-t border-border px-3 py-1.5 text-2xs text-txt-muted dark:border-slate-700">
          Kế hoạch % là tỷ lệ thời gian đã qua của công việc; tổng hợp gia quyền theo tỷ trọng. Chậm: thực tế thấp hơn
          kế hoạch quá 5 điểm. Gắn cấu kiện với công việc ở bảng Mô phỏng 4D của trình xem.
        </p>
      </div>

      <section
        className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        aria-labelledby="bim-baselines"
      >
        <h3
          id="bim-baselines"
          className="mb-2 flex items-center gap-1.5 text-sm font-bold text-txt-primary dark:text-white"
        >
          <Lock className="h-4 w-4" aria-hidden /> Kế hoạch đã chốt
        </h3>
        {(baselines.data ?? []).length === 0 ? (
          <p className="text-xs text-txt-muted">
            Chưa chốt kế hoạch nào. Bản chốt lưu ngày kế hoạch và liên kết cấu kiện, không sửa được, dùng để so trong mô
            phỏng 4D.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {baselines.data!.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span className="font-semibold">{b.ten}</span>
                <span className="text-txt-muted">
                  {Object.keys(b.tasks ?? {}).length} công việc · {formatDateTime(new Date(b.created_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        aria-labelledby="bim-tpl"
      >
        <h3 id="bim-tpl" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-txt-primary dark:text-white">
          <CalendarClock className="h-4 w-4" aria-hidden /> Mẫu trình tự thi công
        </h3>
        {templates.error ? (
          <p className="text-xs text-rose-600">{errorText(templates.error)}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {(templates.data ?? []).map((t) => (
              <article key={t.id} className="rounded-xl border border-border p-2.5 text-xs dark:border-slate-600">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-txt-primary dark:text-white">
                    {t.ten}{' '}
                    {t.he_thong && (
                      <span className="ml-1 rounded bg-bg-subtle px-1 text-2xs text-txt-muted dark:bg-slate-700">
                        Hệ thống
                      </span>
                    )}
                  </p>
                  {canWrite && (
                    <div className="flex gap-1">
                      <button type="button" className={btn} onClick={() => setEditing(t)}>
                        {t.he_thong ? (
                          <>
                            <Copy className="h-3 w-3" aria-hidden /> Nhân bản
                          </>
                        ) : (
                          'Sửa'
                        )}
                      </button>
                      {!t.he_thong && (
                        <button
                          type="button"
                          aria-label={`Xóa mẫu ${t.ten}`}
                          className={btn}
                          onClick={() =>
                            void BimScheduleService.deleteTemplate(t.id).then(
                              () => {
                                refresh();
                                addToast({ type: 'success', message: 'Đã xóa mẫu.' });
                              },
                              (e) => addToast({ type: 'error', message: errorText(e) }),
                            )
                          }
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {t.mo_ta && <p className="mt-0.5 text-2xs text-txt-secondary dark:text-slate-300">{t.mo_ta}</p>}
                <ol className="mt-1 list-decimal pl-4 text-2xs text-txt-secondary dark:text-slate-300">
                  {t.buoc.map((st, i) => (
                    <li key={i}>
                      {st.ten} · {st.thoi_luong_ngay} ngày
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal === 'import' && (
        <ImportModal projectId={projectId} projectName={projectName} onClose={() => setModal(null)} />
      )}
      {modal === 'generate' && (
        <GenerateModal projectId={projectId} projectName={projectName} onClose={() => setModal(null)} />
      )}
      {editing && <TemplateEditor base={editing} projectId={projectId} onClose={() => setEditing(null)} />}
      {task && <TaskEditor projectId={projectId} task={task} tasks={list} onClose={() => setTask(null)} />}
    </div>
  );
};
