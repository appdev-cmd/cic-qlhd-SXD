// Project schedule (ACC Schedule, phase B5): WBS tasks, element links, baselines, sequence templates, generation and
// import (migration 20261027130000). Replaces cic-hud's ERP construction-progress source.
import { legacyDb } from '../lib/bimDb';
import type { ScheduleImportRow } from '../lib/planImport';
import type { TaskBaseline } from '../lib/schedule4d';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) fail(error, context);
  return data as T;
}

export interface ScheduleTask {
  id: string;
  project_id: string;
  ma_wbs: string;
  ten: string;
  bat_dau: string | null;
  ket_thuc: string | null;
  bat_dau_thuc_te: string | null;
  ket_thuc_thuc_te: string | null;
  phan_tram_thuc_te: number | null;
  ty_trong: number;
  tien_nhiem_id: string | null;
  vi_tri: string | null;
  bo_mon: string | null;
  la_tom_tat: boolean;
  thu_tu: number;
  ghi_chu: string | null;
}
export interface ScheduleLink {
  task_id: string;
  model_id: string;
  global_id: string;
}
export interface ScheduleBaseline {
  id: string;
  ten: string;
  tasks: TaskBaseline;
  links: Record<string, string[]> | null;
  models: { id: string; file_name: string; phien_ban: number | null; discipline: string | null }[];
  created_at: string;
}
export interface ScheduleStep {
  ten: string;
  cong_tac?: string;
  loai_cau_kien: string[];
  thoi_luong_ngay: number;
  ty_trong?: number;
}
export interface ScheduleTemplate {
  id: string;
  project_id: string | null;
  ten: string;
  mo_ta: string | null;
  loai_du_an: string;
  buoc: ScheduleStep[];
  he_thong: boolean;
}

export { toBimTask } from '../lib/schedule4d';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const BimScheduleService = {
  async tasks(projectId: string): Promise<ScheduleTask[]> {
    const { data, error } = await legacyDb
      .from('bim_schedule_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('thu_tu')
      .order('ma_wbs')
      .limit(10000);
    if (error) fail(error, 'Lỗi tải tiến độ');
    return ((data ?? []) as ScheduleTask[]).map((t) => ({
      ...t,
      phan_tram_thuc_te: num(t.phan_tram_thuc_te),
      ty_trong: Number(t.ty_trong) || 0,
    }));
  },
  async saveTask(projectId: string, task: Partial<ScheduleTask> & { id?: string }): Promise<void> {
    const payload = {
      ma_wbs: task.ma_wbs?.trim(),
      ten: task.ten?.trim(),
      bat_dau: task.bat_dau || null,
      ket_thuc: task.ket_thuc || null,
      bat_dau_thuc_te: task.bat_dau_thuc_te || null,
      ket_thuc_thuc_te: task.ket_thuc_thuc_te || null,
      phan_tram_thuc_te: task.phan_tram_thuc_te ?? null,
      ty_trong: task.ty_trong ?? 0,
      tien_nhiem_id: task.tien_nhiem_id || null,
      vi_tri: task.vi_tri || null,
      bo_mon: task.bo_mon || null,
      la_tom_tat: task.la_tom_tat ?? false,
    };
    const { error } = task.id
      ? await legacyDb.from('bim_schedule_tasks').update(payload).eq('id', task.id)
      : await legacyDb
          .from('bim_schedule_tasks')
          .insert({ ...payload, project_id: projectId, thu_tu: task.thu_tu ?? 0 });
    if (error) fail(error, /duplicate|unique/i.test(error.message) ? 'Mã WBS đã có' : 'Không lưu được công việc');
  },
  async deleteTask(id: string): Promise<void> {
    const { error } = await legacyDb.from('bim_schedule_tasks').delete().eq('id', id);
    if (error) fail(error, 'Không xóa được công việc');
  },
  async links(projectId: string): Promise<ScheduleLink[]> {
    const rows: ScheduleLink[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await legacyDb
        .from('bim_schedule_links')
        .select('task_id, model_id, global_id')
        .eq('project_id', projectId)
        .order('task_id')
        .order('model_id')
        .order('global_id')
        .range(from, from + 999);
      if (error) fail(error, 'Lỗi tải liên kết tiến độ');
      rows.push(...((data ?? []) as ScheduleLink[]));
      if (!data || data.length < 1000 || rows.length >= 200000) break;
    }
    return rows;
  },
  linkSelection: (projectId: string, taskId: string, elements: { modelId: string; guid: string }[], remove: boolean) =>
    rpc<number>(
      'bim_link_schedule_selection',
      { p_project: projectId, p_task: taskId, p_elements: elements, p_remove: remove },
      'Không cập nhật được liên kết',
    ),
  async baselines(projectId: string): Promise<ScheduleBaseline[]> {
    const { data, error } = await legacyDb
      .from('bim_schedule_baselines')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Lỗi tải kế hoạch đã chốt');
    return (data ?? []) as ScheduleBaseline[];
  },
  saveBaseline: (projectId: string, name: string) =>
    rpc<ScheduleBaseline>(
      'bim_save_schedule_baseline',
      { p_project: projectId, p_ten: name },
      'Không chốt được kế hoạch',
    ),

  async templates(projectId: string): Promise<ScheduleTemplate[]> {
    const { data, error } = await legacyDb
      .from('bim_4d_mau_trinh_tu')
      .select('*')
      .or(`he_thong.eq.true,project_id.eq.${projectId}`)
      .order('he_thong', { ascending: false })
      .order('ten');
    if (error) fail(error, 'Lỗi tải mẫu trình tự');
    return (data ?? []) as ScheduleTemplate[];
  },
  async saveTemplate(t: Omit<ScheduleTemplate, 'id' | 'he_thong'> & { id?: string }): Promise<void> {
    const payload = { project_id: t.project_id, ten: t.ten, mo_ta: t.mo_ta, loai_du_an: t.loai_du_an, buoc: t.buoc };
    const { error } = t.id
      ? await legacyDb.from('bim_4d_mau_trinh_tu').update(payload).eq('id', t.id).eq('he_thong', false)
      : await legacyDb.from('bim_4d_mau_trinh_tu').insert(payload);
    if (error) fail(error, 'Không lưu được mẫu');
  },
  async deleteTemplate(id: string): Promise<void> {
    const { error } = await legacyDb.from('bim_4d_mau_trinh_tu').delete().eq('id', id).eq('he_thong', false);
    if (error) fail(error, 'Không xóa được mẫu');
  },
  generate: (a: { projectId: string; templateId: string; modelIds: string[]; start: string; prefix?: string }) =>
    rpc<{ so_cong_viec: number; so_lien_ket: number; so_tang: number; bat_dau: string; ket_thuc: string }>(
      'bim_4d_sinh_tien_do',
      {
        p_project: a.projectId,
        p_mau: a.templateId,
        p_model_ids: a.modelIds,
        p_bat_dau: a.start,
        p_tien_to: a.prefix ?? null,
      },
      'Không sinh được tiến độ',
    ),
  importSchedule: (projectId: string, rows: (ScheduleImportRow & { model_id?: string | null })[]) =>
    rpc<{ them: number; cap_nhat: number; lien_ket: number; loi: { dong: number; wbs?: string; loi: string }[] }>(
      'bim_4d_nhap_tien_do',
      { p_project: projectId, p_rows: rows },
      'Không nhập được tiến độ',
    ),
};
