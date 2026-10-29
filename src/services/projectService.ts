import type { Project, ProjectTT39Data } from '../types/project';
import { apiRequest, type Page } from './apiClient';

export function mapProject(row: Record<string, any>): Project {
  if ('name' in row && 'projectGroup' in row) {
    const existing = row as Project;
    return {
      ...existing,
      lat: existing.lat == null ? null : Number(existing.lat),
      lng: existing.lng == null ? null : Number(existing.lng),
      tt39_data: existing.tt39_data ?? null,
    };
  }
  const group = String(row.group_type ?? '').replace(/^Nhóm\s*/i, '');
  const grade = String(row.grade ?? '').replace(/^Cấp\s*/i, '');
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  return {
    id: row.id,
    code: row.code,
    name: row.title || row.name || 'Dự án',
    field: row.field || undefined,
    investmentForm: row.investment_form || row.investmentForm || undefined,
    decidedByCommune: Boolean(row.decided_by_commune ?? row.decidedByCommune),
    coverImage: row.thumbnail_url || row.coverImage || undefined,
    images: Array.isArray(row.images) ? row.images : [],
    investorId: row.investor_id || row.investorId || '',
    investorName: row.investor_name || row.investorName || 'Chưa xác định',
    location: row.location_district || row.location || 'Chưa xác định',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    tt39_data: row.tt39_data ?? null,
    projectGroup: (['A', 'B', 'C', 'QG'].includes(group) ? group : null) as Project['projectGroup'],
    buildingGrade: (['I', 'II', 'III', 'IV', 'DB'].includes(grade) ? grade : null) as Project['buildingGrade'],
    totalInvestment: row.investment_cost == null ? null : Number(row.investment_cost),
    stage: row.stage,
    slaStatus: row.sla_status,
    submissionDate: row.submission_date || '',
    deadlineDate: row.deadline || '',
    assignee: row.lead_reviewer_name || 'Chưa phân công',
    department: row.department || '',
    planningCompliance: row.planning_compliance ?? null,
    standardCompliance: row.standard_compliance ?? null,
    fireSafetyStatus: row.fire_safety_status ?? null,
    estimatedSavings: row.estimated_savings == null ? null : Number(row.estimated_savings),
    contractors: Array.isArray(row.contractors) ? row.contractors : [],
  };
}
export const projectService = {
  async list(
    options: {
      search?: string;
      offset?: number;
      limit?: number;
      stage?: string;
      group?: string;
      status?: string;
      sort?: string;
      direction?: string;
    } = {},
  ): Promise<Page<Project>> {
    const query = new URLSearchParams();
    Object.entries(options).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') query.set(k, String(v));
    });
    const page = await apiRequest<Page<Record<string, any>>>('/projects?' + query);
    return { ...page, items: page.items.map(mapProject) };
  },
  async getById(id: string): Promise<Project> {
    return mapProject(await apiRequest('/projects/' + encodeURIComponent(id)));
  },
  async getAll(): Promise<Project[]> {
    const rows: Project[] = [];
    let offset = 0;
    while (true) {
      const page = await projectService.list({ offset, limit: 100 });
      rows.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total || !page.items.length) return rows;
    }
  },
  async getTT39Data(project: Project): Promise<ProjectTT39Data | null> {
    const row = await apiRequest<Record<string, any>>('/projects/' + encodeURIComponent(project.id));
    return row.tt39_data ?? null;
  },
};
