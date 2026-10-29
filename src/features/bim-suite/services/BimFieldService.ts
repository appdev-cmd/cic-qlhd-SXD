// Weekly and periodic BIM reports, tool usage, and the bounded element read of the analytics overview (phase B6,
// migration 20261027140000). Quality, field actuals and BOQ code matching of cic-hud's BimFieldService live in
// BimCheckService, Bim5dService and BimBoqService.
import { legacyDb } from '../lib/bimDb';
import { boundedList, readAllRows, type BoundedList } from '../lib/readAllRows';
import type { BimWeeklyReport } from '../types/bim.types';
import type { InsightElement } from '../lib/bimIntelligence';
import type { PeriodicReportData } from '../lib/bimPeriodicReport';

/** Weekly report content: cic-hud sections 1–6 plus schedule and cost (absent in reports made before B6). */
export type WeeklyReportContent = BimWeeklyReport['noi_dung'] & {
  tien_do?: { tong: number; hoan_thanh: number; cham: number } | null;
  chi_phi?: { lenh_duyet_so: number; lenh_duyet_gia_tri: number; lenh_cho_so: number; hop_dong_ky_so: number } | null;
};
export type WeeklyReport = Omit<BimWeeklyReport, 'noi_dung'> & { noi_dung: WeeklyReportContent };

/** Cap of the element read behind the analytics overview; above it the result is flagged as truncated. */
export const INSIGHT_ELEMENT_LIMIT = 50_000;
const INSIGHT_PAGE = 1000;
const INSIGHT_COLUMNS =
  'id,project_id,model_id,express_id,global_id,ten_cau_kien,loai_cau_kien,phan_doan_tang,vat_lieu,nguon_khoi_luong,the_tich_be_tong,dien_tich,chieu_dai,trong_luong,phan_loai:thuoc_tinh->phan_loai';

async function rpc<T>(name: string, args: Record<string, unknown>, context: string): Promise<T> {
  const { data, error } = await legacyDb.rpc(name, args);
  if (error) throw new Error(`${context}: ${error.message}`);
  return data as T;
}

export const BimFieldService = {
  /** Stored weekly reports of the project, newest first. */
  reports: (project: string) =>
    readAllRows<WeeklyReport>((from, to, count) =>
      legacyDb
        .from('bim_bao_cao_tuan')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('project_id', project)
        .order('tuan_bat_dau', { ascending: false })
        .order('id')
        .range(from, to),
    ),
  /** Builds (or rebuilds) the report of the week starting on `week` (Monday, yyyy-mm-dd); writers only. */
  createReport: (project: string, week?: string) =>
    rpc<WeeklyReportContent>(
      'bim_field_weekly_report',
      { p_project: project, p_week: week || null },
      'Không tạo được báo cáo tuần',
    ),
  /** Project figures of a period, both dates inclusive (yyyy-mm-dd). */
  periodic: (project: string, from: string, to: string) =>
    rpc<PeriodicReportData>(
      'bim_bao_cao_ky',
      { p_project: project, p_tu: from, p_den: to },
      'Không tổng hợp được báo cáo kỳ',
    ),

  /** Tool usage of the last `days` days: uses and distinct users per tool, most used first. */
  async usage(project: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const rows = await readAllRows<{ cong_cu: string; so_lan: number; nguoi_dung: string }>((from, to, count) =>
      legacyDb
        .from('bim_su_dung')
        .select('cong_cu,so_lan,nguoi_dung', count ? { count: 'exact' } : undefined)
        .eq('project_id', project)
        .gte('ngay', since)
        .order('ngay')
        .order('cong_cu')
        .order('nguoi_dung')
        .range(from, to),
    );
    const totals = new Map<string, number>();
    const users = new Map<string, Set<string>>();
    for (const r of rows) {
      totals.set(r.cong_cu, (totals.get(r.cong_cu) || 0) + Number(r.so_lan || 0));
      const set = users.get(r.cong_cu) || new Set<string>();
      set.add(r.nguoi_dung);
      users.set(r.cong_cu, set);
    }
    return [...totals]
      .map(([cong_cu, so_lan]) => ({ cong_cu, so_lan, so_nguoi: users.get(cong_cu)?.size ?? 0 }))
      .sort((a, b) => b.so_lan - a.so_lan);
  },
  /** Counts one use of a viewer tool (bim_field_track, one row per day/project/tool/user). */
  track: (project: string, tool: string) =>
    rpc<void>('bim_field_track', { p_project: project, p_tool: tool }, 'Không ghi được lượt dùng'),

  /**
   * Compact element columns of the selected models for the overview, at most `limit` rows (pages of 1000, stable
   * order). `truncated` tells the UI that counts cover only the first `loaded` of `total` elements.
   */
  async insightElements(
    projectId: string,
    modelIds: string[],
    signal?: AbortSignal,
    limit = INSIGHT_ELEMENT_LIMIT,
  ): Promise<BoundedList<InsightElement>> {
    const ids = [...new Set(modelIds)].sort();
    if (!ids.length) return boundedList([]);
    const rows: InsightElement[] = [];
    let total: number | null = null;
    while (rows.length < limit) {
      const from = rows.length;
      const to = Math.min(limit, from + INSIGHT_PAGE) - 1;
      let query = legacyDb
        .from('bim_elements')
        .select(INSIGHT_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .in('model_id', ids)
        .order('model_id')
        .order('express_id')
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (error) throw new Error(`Lỗi tải cấu kiện phân tích: ${error.message}`);
      if (from === 0 && count != null) total = count;
      const batch = (data ?? []) as unknown as InsightElement[];
      rows.push(...batch.map((r) => ({ ...r, phan_loai: Array.isArray(r.phan_loai) ? r.phan_loai : null })));
      if (batch.length < to - from + 1 || (total !== null && rows.length >= total)) break;
    }
    return boundedList(rows, total ?? rows.length);
  },
};
