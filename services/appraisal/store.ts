import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSearch, remote, runtimeMode, type Actor } from './auth.js';
import { withQuery, type Query } from './query.js';
import { HttpError } from './errors.js';
import { compute, evaluate, loadCalendar, soonLimit, STATES, type SlaSnapshot } from './sla.js';
import { deriveStatus } from './workflow.js';
import type { AnalysisCase } from './rules.js';
import { vnToday } from './domain.js';

export type CasePayload = AnalysisCase;
export type Project = {
  id: string;
  code: string;
  title?: string;
  name?: string;
  department?: string;
  group_type?: string;
  grade?: string;
  projectGroup?: string;
  buildingGrade?: string;
  [key: string]: unknown;
};
const decode = <T>(value: unknown): T => (typeof value === 'string' ? (JSON.parse(value) as T) : (value as T));
export const DATA_DIR = () => resolve(process.env.APPRAISAL_DATA_DIR || '.appraisal-data');
export interface PageOptions {
  offset?: number;
  limit?: number;
  procedure?: string | null;
  projectId?: string | null;
  search?: string;
  kind?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  direction?: string;
  dossierId?: string | null;
  sla?: string;
  scope?: string;
}
const fields = [
  'id',
  'name',
  'province',
  'department',
  'projectId',
  'projectName',
  'projectCode',
  'sample',
  'submissionCode',
  'submissionRound',
  'dossierId',
  'previousSubmissionId',
  'sampleScenario',
  'legalDate',
  'createdAt',
  'updatedAt',
  'status',
  'revision',
  'slaDueDate',
  'slaPaused',
  'slaCompletedAt',
  'workflowState',
  'slaWaitingDue',
  'slaOutcome',
  'slaDueKind',
  'assignee',
  'assigneeId',
];
const nested: Record<string, string> = {
  slaDueDate: "payload->'sla'->>'dueDate'",
  slaPaused: "(payload->'sla'->>'paused')::boolean",
  slaCompletedAt: "payload->'sla'->>'completedAt'",
  workflowState: "payload->'workflow'->>'state'",
  slaWaitingDue: "payload->'sla'->>'waitingDueDate'",
  slaOutcome: "payload->'sla'->>'outcome'",
  slaDueKind: "payload->'sla'->>'dueKind'",
  assigneeId: "payload->'workflow'->>'assigneeId'",
};
export class Store {
  constructor(
    public token: string,
    public actor: Actor,
  ) {}
  query<T>(write: boolean, operation: (query: Query) => Promise<T>) {
    return withQuery(this.actor, write, operation);
  }
  async all(offset = 0, procedure?: string | null, projectId?: string | null): Promise<CasePayload[]> {
    return this.query(false, async (q) => {
      const field = (key: string) => (q.pg ? `payload->>'${key}'` : `json_extract(payload,'$.${key}')`);
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (procedure) {
        clauses.push(`coalesce(${field('procedure')},'bcnckt')=?`);
        values.push(procedure);
      }
      if (projectId) {
        clauses.push(field('projectId') + '=?');
        values.push(projectId);
      }
      const table = q.pg ? 'public.appraisal_cases' : 'cases';
      const rows = (
        await q.run(
          `select payload from ${table}${clauses.length ? ' where ' + clauses.join(' and ') : ''} order by ${q.pg ? 'created_at' : 'rowid'} desc limit 100 offset ?`,
          [...values, offset],
        )
      ).rows;
      return rows.map((row) => decode<CasePayload>(row.payload));
    });
  }
  async get(id: string): Promise<CasePayload> {
    const value = await this.query(false, async (q) => {
      const table = q.pg ? 'public.appraisal_cases' : 'cases';
      const row = (await q.run(`select payload from ${table} where id=?`, [id])).rows[0];
      if (!row) throw new HttpError(404, 'Không tìm thấy hồ sơ trong phạm vi quyền.');
      const value = decode<CasePayload>(row.payload);
      if (!q.pg && !value.dossierId) {
        const root = (
          await q.run(
            `with recursive ancestors(id,previous,depth) as (
          select id,json_extract(payload,'$.previousSubmissionId'),0 from cases where id=? union all
          select c.id,json_extract(c.payload,'$.previousSubmissionId'),a.depth+1 from cases c join ancestors a on c.id=a.previous where a.depth<1000
        ) select id,depth from ancestors order by depth desc limit 1`,
            [id],
          )
        ).rows[0];
        value.dossierId = root.id;
        value.submissionRound = Number(root.depth) + 1;
      }
      return value;
    });
    return this.withJobState(value);
  }
  async withJobState(value: CasePayload): Promise<CasePayload> {
    if (value.job?.status !== 'running') return value;
    const status = await this.query(false, async (q) => {
      if (q.pg) {
        const job = (
          await q.run<{ job: { status: string } | null }>('select public.read_appraisal_job(?) as job', [value.job!.id])
        ).rows[0]?.job;
        const state = job?.status || 'stale';
        if (value.job?.engine === 'node' && state === 'queued' && process.env.VERCEL) {
          // A persisted job survives a publish outage. Polling retries its delivery; claims are exclusive.
          await (await import('./jobs.js')).publishJob(String(value.job.id));
        }
        return state;
      }
      return String((await q.run('select state from jobs where id=?', [value.job!.id])).rows[0]?.state || 'stale');
    });
    if (['stale', 'failed', 'cancelled'].includes(status)) {
      value.job = { ...value.job, status: status === 'stale' ? 'interrupted' : status };
      value.status = deriveStatus(value);
    }
    return value;
  }
  async progress(id: string) {
    const value = await this.query(false, async (q) => {
      const row = (
        await q.run(
          `select revision,${q.pg ? "payload->'job'" : "json_extract(payload,'$.job')"} as job from ${q.pg ? 'public.appraisal_cases' : 'cases'} where id=?`,
          [id],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, 'Không tìm thấy hồ sơ trong phạm vi quyền.');
      return row;
    });
    const job = value.job
      ? (
          await this.withJobState({
            job: decode(value.job),
            runs: [],
            workflow: {},
            finalReview: null,
          } as unknown as CasePayload)
        ).job
      : null;
    return { revision: value.revision, job: job ? { id: job.id, status: job.status, mode: job.mode } : null };
  }
  calendar() {
    return loadCalendar(this.actor.id, runtimeMode() === 'cloud');
  }
  async project(id: string): Promise<Project> {
    if (runtimeMode() === 'demo') {
      const file = resolve(DATA_DIR(), 'projects.json');
      const projects = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Project[]) : [];
      const result = projects.find((project) => project.id === id);
      if (!result) throw new HttpError(404, 'Không tìm thấy dự án trong phạm vi quyền.');
      return result;
    }
    return this.query(false, async (q) => {
      const row = (await q.run<Project>('select * from public.projects where id=?', [id])).rows[0];
      if (!row) throw new HttpError(404, 'Không tìm thấy dự án trong phạm vi quyền.');
      return row;
    });
  }
  async classification(value: CasePayload) {
    if (!value.projectId) return {};
    try {
      const project = await this.project(String(value.projectId));
      return { group: project.group_type ?? project.projectGroup, grade: project.grade ?? project.buildingGrade };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return {};
      throw error;
    }
  }
  async derive(value: CasePayload) {
    value.status = deriveStatus(value);
    value.sla = compute(value, await this.calendar(), await this.classification(value));
    return value;
  }
  async save(
    value: CasePayload,
    expected: number | null = null,
    jobInput?: Record<string, unknown>,
  ): Promise<CasePayload> {
    await this.derive(value);
    return this.query(true, async (q) => {
      if (q.pg) {
        const result = (
          await q.run<{ payload: CasePayload }>('select public.persist_appraisal_case(?,?,?::jsonb) as payload', [
            value.id,
            expected,
            JSON.stringify(value),
          ])
        ).rows[0].payload;
        if (jobInput !== undefined && value.job?.engine === 'node')
          await q.run('select public.set_node_appraisal_input(?,?::jsonb)', [value.job.id, JSON.stringify(jobInput)]);
        return result;
      }
      if (expected === null) {
        if (value.previousSubmissionId) {
          const row = (await q.run('select payload from cases where id=?', [value.previousSubmissionId])).rows[0];
          const prior = row ? decode<CasePayload>(row.payload) : null;
          if (
            !prior ||
            ['projectId', 'procedure', 'tenantId', 'department', 'sample'].some((key) => prior[key] !== value[key])
          )
            throw new HttpError(403, 'Lần trước không thuộc cùng dự án và phạm vi quyền.');
          if (
            prior.revision !== value.previousRevision ||
            (
              await q.run("select 1 from cases where json_extract(payload,'$.previousSubmissionId')=?", [
                value.previousSubmissionId,
              ])
            ).rows.length
          )
            throw new HttpError(409, 'Lần trước đã thay đổi hoặc đã có lần bổ sung.');
          Object.assign(value, {
            dossierId: prior.dossierId || value.dossierId || prior.id,
            submissionRound: Number(prior.submissionRound || 1) + 1,
            previousSubmissionName: prior.name,
          });
        } else Object.assign(value, { dossierId: value.id, submissionRound: 1 });
        await q.run('insert into cases values(?,?,?)', [value.id, value.revision, JSON.stringify(value)]);
      } else {
        if (
          (await q.run("select 1 from cases where json_extract(payload,'$.previousSubmissionId')=?", [value.id])).rows
            .length
        )
          throw new HttpError(409, 'Lần nộp đã có lần bổ sung; dữ liệu lần trước được giữ nguyên.');
        const result = await q.run('update cases set revision=?,payload=? where id=? and revision=?', [
          value.revision,
          JSON.stringify(value),
          value.id,
          expected,
        ]);
        if (result.rowCount !== 1) throw new HttpError(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
      }
      const job = value.job;
      if (job?.status === 'running')
        await q.run('insert or ignore into jobs(id,case_id,actor,snapshot,created_at) values(?,?,?,?,?)', [
          job.id,
          value.id,
          JSON.stringify(this.actor),
          JSON.stringify(value),
          Date.now() / 1000,
        ]);
      else if (job && ['completed', 'cancelled', 'failed'].includes(job.status))
        await q.run('update jobs set state=?,lease_until=null where id=?', [job.status, job.id]);
      if (jobInput !== undefined && job?.engine === 'node')
        await q.run('update jobs set runtime_input=? where id=?', [JSON.stringify(jobInput), job.id]);
      return value;
    });
  }
  async hasSuccessor(id: string): Promise<boolean> {
    return this.query(false, async (q) =>
      Boolean(
        (
          await q.run(
            q.pg
              ? 'select 1 from public.appraisal_cases where previous_submission_id=? limit 1'
              : "select 1 from cases where json_extract(payload,'$.previousSubmissionId')=? limit 1",
            [id],
          )
        ).rows.length,
      ),
    );
  }
  async lineage(id: string, offset = 0) {
    const value = await this.get(id);
    const root = String(value.dossierId || id);
    const page = await this.page({ offset, limit: 50, dossierId: root, sort: 'submissionRound', direction: 'asc' });
    const latest = await this.page({ limit: 1, dossierId: root, sort: 'submissionRound', direction: 'desc' });
    return { ...page, latestId: latest.items[0]?.id || id };
  }
  async inspectionCount(projectId: unknown, excludeId: string, dossierId?: unknown): Promise<number> {
    if (!projectId) return 0;
    return this.query(false, async (q) => {
      const field = (key: string) => (q.pg ? `payload->>'${key}'` : `json_extract(payload,'$.${key}')`);
      const subtype = q.pg
        ? "coalesce(payload->>'subtype',payload->'procedureReview'->>'subtype',payload->'procedureReviewHistory'->-1->>'subtype')"
        : "coalesce(json_extract(payload,'$.subtype'),json_extract(payload,'$.procedureReview.subtype'),json_extract(payload,'$.procedureReviewHistory[#-1].subtype'))";
      const table = q.pg ? 'public.appraisal_cases' : 'cases';
      const state = q.pg ? "payload->'workflow'->>'state'" : "json_extract(payload,'$.workflow.state')";
      const final = q.pg ? "payload->'finalReview'->>'decision'" : "json_extract(payload,'$.finalReview.decision')";
      const successor = q.pg
        ? 'n.previous_submission_id=c.id'
        : "json_extract(n.payload,'$.previousSubmissionId')=c.id";
      return Number(
        (
          await q.run(
            `select count(*) as n from ${table} c where ${field('projectId')}=? and id<>? and coalesce(${field('dossierId')},${q.pg ? 'id::text' : 'id'})<>?
        and coalesce(${field('procedure')},'bcnckt')='nghiem_thu' and ${subtype}='during'
        and coalesce(${state},case when ${final}='reviewed' then 'reviewed' else 'received' end) not in ('received','assigned','rejected','stopped')
        and not exists(select 1 from ${table} n where ${successor})`,
            [projectId, excludeId, dossierId || excludeId],
          )
        ).rows[0].n,
      );
    });
  }
  async putFile(caseId: string, id: string, data: Uint8Array): Promise<void> {
    if (runtimeMode() === 'cloud') {
      await remote(
        `/storage/v1/object/appraisal-originals/${encodeURIComponent(caseId)}/${encodeURIComponent(id)}`,
        this.token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' },
          body: Buffer.from(data),
        },
      );
    } else
      await this.query(true, async (q) => {
        await q.run('insert into files values(?,?,?)', [caseId, id, Buffer.from(data)]);
      });
  }
  async file(caseId: string, id: string): Promise<Buffer> {
    const value = await this.get(caseId);
    if (!value.documents.some((document) => document.id === id)) throw new HttpError(404, 'Tệp không thuộc hồ sơ.');
    if (runtimeMode() === 'cloud')
      return Buffer.from(
        await (
          await remote(
            `/storage/v1/object/authenticated/appraisal-originals/${encodeURIComponent(caseId)}/${encodeURIComponent(id)}`,
            this.token,
          )
        ).arrayBuffer(),
      );
    return this.query(false, async (q) => {
      const row = (await q.run<{ data: Uint8Array }>('select data from files where case_id=? and id=?', [caseId, id]))
        .rows[0];
      if (!row) throw new HttpError(404, 'Không tìm thấy bản gốc.');
      return Buffer.from(row.data);
    });
  }
  private summary(pg: boolean) {
    return {
      field: (key: string) => (pg ? nested[key] || `payload->>'${key}'` : `"${key}"`),
      successor: pg
        ? 'exists(select 1 from public.appraisal_cases n where n.previous_submission_id=appraisal_cases.id)'
        : 'exists(select 1 from case_summaries n where n."previousSubmissionId"=case_summaries.id)',
    };
  }
  private slaConditions(pg: boolean, soon: string, today: string): Record<string, [string, unknown[]]> {
    const { field: f, successor } = this.summary(pg);
    const done = f('slaCompletedAt') + ' is not null';
    const paused = `coalesce(${f('slaPaused')},${pg ? 'false)' : '0)=1'}`;
    const running = `not (${done}) and not ${successor} and not ${paused}`;
    const due = f('slaDueDate');
    const closed = `coalesce(${f('slaOutcome')},'') in ('rejected','stopped')`;
    const waitingOpen = `not (${done}) and not ${successor} and ${paused}`;
    const waiting = f('slaWaitingDue');
    return {
      completed: [`${done} and not ${closed} and (${due} is null or ${f('slaCompletedAt')}<=${due})`, []],
      completed_late: [`${done} and not ${closed} and ${f('slaCompletedAt')}>${due}`, []],
      closed: [`${done} and ${closed}`, []],
      superseded: [`not (${done}) and ${successor}`, []],
      paused: [`${waitingOpen} and (${waiting} is null or ${waiting}>=?)`, [today]],
      supplement_overdue: [`${waitingOpen} and ${waiting}<?`, [today]],
      unconfigured: [`${running} and ${due} is null`, []],
      overdue: [`${running} and ${due}<?`, [today]],
      due_soon: [`${running} and ${due}>=? and ${due}<=?`, [today, soon]],
      on_track: [`${running} and ${due}>?`, [soon]],
    };
  }
  async slaCounts(kind = 'all') {
    const calendar = await this.calendar();
    const today = vnToday();
    return this.query(false, async (q) => {
      const conditions = this.slaConditions(q.pg, soonLimit(calendar, today), today);
      const values: unknown[] = [];
      const select = Object.values(conditions)
        .map(([sql, args], i) => {
          values.push(...args);
          return `coalesce(sum(case when ${sql} then 1 else 0 end),0) as n${i}`;
        })
        .join(',');
      const where = ['sample', 'real'].includes(kind)
        ? q.pg
          ? " where coalesce((payload->>'sample')::boolean,false)=" + (kind === 'sample' ? 'true' : 'false')
          : ' where coalesce(sample,0)=' + (kind === 'sample' ? 1 : 0)
        : '';
      const row = (
        await q.run(`select ${select} from ${q.pg ? 'public.appraisal_cases' : 'case_summaries'}${where}`, values)
      ).rows[0];
      return Object.keys(conditions).map((id, i) => ({ id, total: Number(row['n' + i]) }));
    });
  }
  async projects(
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
  ) {
    const sorts: Record<string, string> = {
      name: 'title',
      code: 'code',
      investorName: 'investor_name',
      location: 'location_district',
      totalInvestment: 'investment_cost',
      stage: 'stage',
      slaStatus: 'sla_status',
      submissionDate: 'submission_date',
    };
    const sort = sorts[options.sort || ''] ? options.sort! : 'submissionDate';
    const direction = options.direction === 'asc' ? 'asc' : 'desc';
    const offset = options.offset || 0;
    const limit = options.limit ?? 50;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new HttpError(422, 'Phân trang không hợp lệ.');
    if (runtimeMode() === 'demo') {
      const file = resolve(DATA_DIR(), 'projects.json');
      const all = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Project[]) : [];
      const rows = all.filter(
        (project) =>
          normalizeSearch(
            ['name', 'code', 'investorName', 'location'].map((key) => project[key] || '').join(' '),
          ).includes(normalizeSearch(options.search || '')) &&
          (!options.stage || project.stage === options.stage) &&
          (!options.group || project.projectGroup === options.group) &&
          (!options.status || project.slaStatus === options.status),
      );
      const compare = (a: Project, b: Project) => {
        const left = a[sort];
        const right = b[sort];
        if (left == null && right != null) return 1;
        if (right == null && left != null) return -1;
        const result =
          left === right
            ? 0
            : typeof left === 'number' && typeof right === 'number'
              ? left - right
              : String(left ?? '') < String(right ?? '')
                ? -1
                : 1;
        return (result || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) * (direction === 'asc' ? 1 : -1);
      };
      rows.sort(compare);
      return { items: rows.slice(offset, offset + limit), total: rows.length, offset, limit };
    }
    return this.query(false, async (q) => {
      const clauses: string[] = ['true'];
      const values: unknown[] = [];
      for (const [column, value] of [
        ['stage', options.stage],
        ["regexp_replace(group_type,'^Nhóm\\s*','','i')", options.group],
        ['sla_status', options.status],
      ])
        if (value) {
          clauses.push(column + '=?');
          values.push(value);
        }
      if (options.search) {
        clauses.push("public.f_unaccent(lower(concat_ws(' ',title,code,investor_name,location_district))) like ?");
        values.push('%' + normalizeSearch(options.search).replaceAll('%', '\\%').replaceAll('_', '\\_') + '%');
      }
      const where = clauses.join(' and ');
      const total = Number((await q.run('select count(*) as n from public.projects where ' + where, values)).rows[0].n);
      const columns =
        'id,code,title,lat,lng,field,group_type,grade,investment_cost,investor_id,investor_name,location_district,stage,sla_status,submission_date,deadline,lead_reviewer_name,department,province_code,planning_compliance,standard_compliance,fire_safety_status,estimated_savings,thumbnail_url,images,contractors,tt39_data';
      const items = (
        await q.run<Project>(
          `select ${columns} from public.projects where ${where} order by ${sorts[sort]} ${direction} nulls last,id ${direction} limit ? offset ?`,
          [...values, limit, offset],
        )
      ).rows;
      return { items, total, offset, limit };
    });
  }
  async page(options: PageOptions = {}) {
    const offset = options.offset || 0;
    const limit = options.limit ?? 50;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new HttpError(422, 'Phân trang không hợp lệ.');
    const calendar = await this.calendar();
    const today = vnToday();
    return this.query(false, async (q) => {
      const { field: f, successor } = this.summary(q.pg);
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (options.sla && STATES[options.sla]) {
        const [sql, args] = this.slaConditions(q.pg, soonLimit(calendar, today), today)[options.sla];
        clauses.push('(' + sql + ')');
        values.push(...args);
      }
      if (['mine', 'queue'].includes(options.scope || '')) {
        if (options.scope === 'queue' && ['head_of_department', 'director'].includes(this.actor.role)) {
          clauses.push(f('workflowState') + '=?');
          values.push('pending_review');
        } else {
          clauses.push(f('assigneeId') + '=?');
          values.push(this.actor.id);
          if (options.scope === 'queue')
            clauses.push(
              `coalesce(${f('workflowState')},'received') in ('received','assigned','processing','site_visit','correction')`,
            );
        }
      }
      if (options.dossierId) {
        clauses.push(
          q.pg
            ? 'dossier_id=?'
            : `id in (with recursive family(id,depth) as (select id,0 from cases where id=? union all select c.id,f.depth+1 from cases c join family f on json_extract(c.payload,'$.previousSubmissionId')=f.id where f.depth<1000) select id from family)`,
        );
        values.push(options.dossierId);
      }
      for (const [key, value] of [
        ['procedure', options.procedure],
        ['projectId', options.projectId],
        ['status', options.status],
      ])
        if (value) {
          clauses.push((key === 'procedure' ? `coalesce(${f(key!)},'bcnckt')` : f(key!)) + '=?');
          values.push(value);
        }
      if (['sample', 'real'].includes(options.kind || '')) {
        clauses.push((q.pg ? "coalesce((payload->>'sample')::boolean,false)" : 'coalesce(sample,0)') + '=?');
        values.push(options.kind === 'sample');
      }
      for (const [value, operator] of [
        [options.dateFrom, '>='],
        [options.dateTo, '<='],
      ])
        if (value) {
          clauses.push(f('legalDate') + operator + '?');
          values.push(value);
        }
      if (options.search) {
        const expression = ['name', 'province', 'projectName', 'projectCode']
          .map((key) => `coalesce(${f(key)},'')`)
          .join(" || ' ' || ");
        clauses.push(
          (q.pg ? `public.f_unaccent(lower(${expression}))` : 'normalize_search(searchText)') + " like ? escape '\\'",
        );
        values.push(
          '%' +
            normalizeSearch(options.search).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') +
            '%',
        );
      }
      const sort = [...fields, 'documentCount', 'procedure'].includes(options.sort || '') ? options.sort! : 'updatedAt';
      const direction = options.direction === 'asc' ? 'asc' : 'desc';
      const count = q.pg ? "jsonb_array_length(payload->'documents')" : 'documentCount';
      let sorted = sort === 'documentCount' ? count : f(sort);
      if (sort === 'submissionRound') sorted = `cast(coalesce(${f(sort)},'1') as integer)`;
      const projection = `${q.pg ? 'jsonb_build_object' : 'json_object'}(${fields.map((key) => `'${key}',${q.pg && !nested[key] ? `payload->'${key}'` : f(key)}`).join(',')},'procedure',coalesce(${f('procedure')},'bcnckt'),'documentCount',${count},'hasSuccessor',${successor}) as summary`;
      const table = q.pg ? 'public.appraisal_cases' : 'case_summaries';
      const where = clauses.length ? ' where ' + clauses.join(' and ') : '';
      const total = Number((await q.run(`select count(*) as n from ${table}${where}`, values)).rows[0].n);
      const rows = (
        await q.run(
          `select ${projection} from ${table}${where} order by ${sorted} ${direction}${q.pg ? ' nulls last' : ''},id ${direction} limit ? offset ?`,
          [...values, limit, offset],
        )
      ).rows;
      const items = rows.map((row) => {
        const value = decode<Record<string, unknown>>(row.summary);
        const superseded = Boolean(value.hasSuccessor);
        delete value.hasSuccessor;
        value.slaState = evaluate(
          {
            dueDate: value.slaDueDate as string,
            paused: Boolean(value.slaPaused),
            completedAt: value.slaCompletedAt as string,
            waitingDueDate: value.slaWaitingDue as string,
            outcome: value.slaOutcome as string,
            dueKind: value.slaDueKind as string,
          },
          calendar,
          superseded,
          today,
        );
        return value;
      });
      return { items, total, offset, limit };
    });
  }
}
