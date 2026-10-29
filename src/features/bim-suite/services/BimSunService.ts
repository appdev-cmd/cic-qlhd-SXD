// Project location for the sun analysis (bim_project_site) and element finish dates from the project schedule.
import { legacyDb } from '../lib/bimDb';
import { resolveSiteLocation, type SiteLocation } from '../lib/sun/solar';
import { finishDatesByElement } from '../lib/sun/phaseSun';
import { BimScheduleService } from './BimScheduleService';
import type { BimModel } from '@/features/bim-suite/types/bim.types';

export interface ProjectLocation {
  vi_do: number | null;
  kinh_do: number | null;
  goc_bac_thuc: number;
}

const missingTable = (e: { code?: string } | null) =>
  !!e && ['42703', 'PGRST204', 'PGRST205', '42P01'].includes(e.code ?? '');
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export const BimSunService = {
  /** Saved location of the project; null when there is no site row yet (or the table is not installed). */
  async getLocation(projectId: string): Promise<ProjectLocation | null> {
    const { data, error } = await legacyDb
      .from('bim_project_site')
      .select('vi_do,kinh_do,goc_bac_thuc')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) {
      if (missingTable(error)) return null;
      throw new Error(`Lỗi tải vị trí dự án: ${error.message}`);
    }
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { vi_do: num(row.vi_do), kinh_do: num(row.kinh_do), goc_bac_thuc: num(row.goc_bac_thuc) ?? 0 };
  },

  /** Saved location, else a ready model's IfcSite lat/lon, else the assumed default (Hà Nội). */
  async resolveLocation(
    projectId: string,
    models: Pick<BimModel, 'file_name' | 'status' | 'georef'>[] = [],
  ): Promise<SiteLocation> {
    const saved = await BimSunService.getLocation(projectId).catch(() => null);
    return resolveSiteLocation(saved, models);
  },

  async saveLocation(projectId: string, loc: ProjectLocation): Promise<void> {
    const { error } = await legacyDb
      .from('bim_project_site')
      .upsert({ project_id: projectId, ...loc, updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
    if (error) {
      if (missingTable(error)) throw new Error('CSDL chưa có bảng thông số khu đất của dự án.');
      throw new Error(`Không lưu được vị trí: ${error.message}`);
    }
  },

  /**
   * Finish date of each element from the project schedule links (key "model|GlobalId").
   * An element linked to several tasks takes the latest finish; actual finish first, else planned finish.
   */
  async elementFinishDates(projectId: string): Promise<Map<string, string>> {
    const [links, tasks] = await Promise.all([
      BimScheduleService.links(projectId),
      BimScheduleService.tasks(projectId),
    ]);
    return finishDatesByElement(links, tasks);
  },
};
