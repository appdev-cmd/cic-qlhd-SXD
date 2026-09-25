import type { Project, ProjectTT39Data } from '../types/domain';
import type { ProjectAppraisalData } from '../types/appraisal';
import { isDemoMode } from '../lib/dataMode';
import { requireSupabase } from '../lib/supabase';
import { loadDemo } from './demoSource';
import { mapProject, PROJECT_LIST_COLUMNS, type ProjectRow } from './rows';
import {
  compareValues,
  demoSearch,
  fetchAllChunked,
  applySearch,
  unwrap,
  type Paged,
  type SortSpec,
} from './query';

export type ProjectSortKey =
  | 'code'
  | 'name'
  | 'investorName'
  | 'location'
  | 'totalInvestment'
  | 'stage'
  | 'slaStatus'
  | 'submissionDate'
  | 'deadlineDate'
  | 'assignee';

const SORT_COLUMNS: Record<ProjectSortKey, string> = {
  code: 'code',
  name: 'title',
  investorName: 'investor_name',
  location: 'location_district',
  totalInvestment: 'investment_cost',
  stage: 'stage',
  slaStatus: 'sla_status',
  submissionDate: 'submission_date',
  deadlineDate: 'deadline',
  assignee: 'lead_reviewer_name',
};

export interface ProjectFilters {
  search?: string;
  stage?: Project['stage'];
  projectGroup?: Project['projectGroup'];
  slaStatus?: Project['slaStatus'];
  slaStatuses?: Project['slaStatus'][];
  assigneeStaffId?: string;
  investorId?: string;
  /** Tổ chức tham gia (chủ đầu tư hoặc nhà thầu/tư vấn trong danh sách contractors) */
  organizationId?: string;
  /** Cá nhân chủ trì trong danh sách contractors */
  personnelId?: string;
  submittedFrom?: string;
  submittedTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
}

export interface ProjectQuery extends ProjectFilters {
  sort?: SortSpec<ProjectSortKey>;
  page?: number; // bắt đầu từ 0
  pageSize?: number;
}

export interface ProjectDetail {
  tt39: ProjectTT39Data | null;
  appraisal: ProjectAppraisalData | null;
}

// ─── Chế độ DEMO ──────────────────────────────────────────────────────────────

function demoFilter(items: Project[], f: ProjectFilters): Project[] {
  let rows = demoSearch(items, f.search, (p) => [p.name, p.code, p.investorName, p.location, p.assignee, p.field]);
  rows = rows.filter(
    (p) =>
      (!f.stage || p.stage === f.stage) &&
      (!f.projectGroup || p.projectGroup === f.projectGroup) &&
      (!f.slaStatus || p.slaStatus === f.slaStatus) &&
      (!f.slaStatuses?.length || f.slaStatuses.includes(p.slaStatus)) &&
      (!f.assigneeStaffId || p.assigneeStaffId === f.assigneeStaffId) &&
      (!f.investorId || p.investorId === f.investorId) &&
      (!f.organizationId ||
        p.investorId === f.organizationId ||
        p.contractors.some((c) => c.orgId === f.organizationId)) &&
      (!f.personnelId || p.contractors.some((c) => c.leadPersonnelId === f.personnelId)) &&
      (!f.submittedFrom || p.submissionDate >= f.submittedFrom) &&
      (!f.submittedTo || p.submissionDate <= f.submittedTo) &&
      (!f.deadlineFrom || p.deadlineDate >= f.deadlineFrom) &&
      (!f.deadlineTo || p.deadlineDate <= f.deadlineTo)
  );
  return rows;
}

// ─── Chế độ LIVE (Supabase) ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder PostgREST có generic lồng rất sâu
type FilterBuilder = any;

function applyLiveFilters<Q>(q: Q, f: ProjectFilters): Q {
  let query = applySearch(q as FilterBuilder, f.search);
  if (f.stage) query = query.eq('stage', f.stage);
  if (f.projectGroup) query = query.eq('group_type', f.projectGroup);
  if (f.slaStatus) query = query.eq('sla_status', f.slaStatus);
  if (f.slaStatuses?.length) query = query.in('sla_status', f.slaStatuses);
  if (f.assigneeStaffId) query = query.eq('lead_reviewer_staff_id', f.assigneeStaffId);
  if (f.investorId) query = query.eq('investor_id', f.investorId);
  if (f.organizationId) {
    query = query.or(
      `investor_id.eq.${f.organizationId},contractors.cs.${JSON.stringify([{ orgId: f.organizationId }])}`
    );
  }
  if (f.personnelId) {
    query = query.or(`contractors.cs.${JSON.stringify([{ leadPersonnelId: f.personnelId }])}`);
  }
  if (f.submittedFrom) query = query.gte('submission_date', f.submittedFrom);
  if (f.submittedTo) query = query.lte('submission_date', f.submittedTo);
  if (f.deadlineFrom) query = query.gte('deadline', f.deadlineFrom);
  if (f.deadlineTo) query = query.lte('deadline', f.deadlineTo);
  return query as Q;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function listProjects(params: ProjectQuery = {}): Promise<Paged<Project>> {
  const { sort = { key: 'submissionDate', direction: 'desc' }, page = 0, pageSize = 200 } = params;

  if (isDemoMode) {
    const demo = await loadDemo();
    const filtered = demoFilter(demo.projects, params).sort((a, b) => {
      const diff = compareValues(a[sort.key], b[sort.key]);
      return sort.direction === 'asc' ? diff : -diff;
    });
    return { rows: filtered.slice(page * pageSize, (page + 1) * pageSize), total: filtered.length };
  }

  const from = page * pageSize;
  const base = requireSupabase().from('projects').select(PROJECT_LIST_COLUMNS, { count: 'exact' });
  const result = await applyLiveFilters(base, params)
    .order(SORT_COLUMNS[sort.key], { ascending: sort.direction === 'asc' })
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);

  const rows = unwrap(result, 'Không tải được danh sách hồ sơ') as unknown as ProjectRow[];
  return { rows: rows.map(mapProject), total: result.count ?? rows.length };
}

/** Toàn bộ dự án khớp bộ lọc (phân khối 1000 dòng) — dùng cho bản đồ GIS, xuất Excel. */
export async function listAllProjects(filters: ProjectFilters = {}): Promise<Project[]> {
  if (isDemoMode) {
    const demo = await loadDemo();
    return demoFilter(demo.projects, filters);
  }
  const rows = await fetchAllChunked<ProjectRow>(
    (from, to) =>
      applyLiveFilters(requireSupabase().from('projects').select(PROJECT_LIST_COLUMNS), filters)
        .order('code')
        .range(from, to) as unknown as PromiseLike<{ data: ProjectRow[] | null; error: null }>,
    'Không tải được dữ liệu dự án'
  );
  return rows.map(mapProject);
}

export async function getProject(id: string): Promise<Project | null> {
  if (isDemoMode) {
    const demo = await loadDemo();
    return demo.projects.find((p) => p.id === id || p.code === id) ?? null;
  }
  const column = id.startsWith('DA-') ? 'code' : 'id';
  const result = await requireSupabase().from('projects').select(PROJECT_LIST_COLUMNS).eq(column, id).maybeSingle();
  const row = unwrap(result, 'Không tải được hồ sơ') as unknown as ProjectRow | null;
  return row ? mapProject(row) : null;
}

export async function getProjectDetail(project: Project): Promise<ProjectDetail> {
  if (isDemoMode) {
    const demo = await loadDemo();
    return {
      tt39: demo.mockData.getProjectTT39Data(project),
      appraisal: demo.appraisal.getProjectAppraisalData(project),
    };
  }
  const result = await requireSupabase()
    .from('projects')
    .select('tt39_data, appraisal_data')
    .eq('id', project.id)
    .maybeSingle();
  const row = unwrap(result, 'Không tải được dữ liệu thẩm định') as {
    tt39_data: ProjectTT39Data | Record<string, never> | null;
    appraisal_data: ProjectAppraisalData | Record<string, never> | null;
  } | null;
  const isFilled = (v: object | null | undefined) => Boolean(v && Object.keys(v).length > 0);
  return {
    tt39: isFilled(row?.tt39_data) ? (row!.tt39_data as ProjectTT39Data) : null,
    appraisal: isFilled(row?.appraisal_data) ? (row!.appraisal_data as ProjectAppraisalData) : null,
  };
}
