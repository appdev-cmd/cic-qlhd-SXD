import plans from './data/analytics-plans.json' with { type: 'json' };
import type { Store } from './store.js';
import { vnToday } from './domain.js';
import { runtimeMode } from './auth.js';
import { addCalendarDays, soonLimit } from './sla.js';
import { Decimal } from 'decimal.js';
interface Plan {
  sql: string;
  params: Array<{ ref?: string; days?: number; literal?: unknown }>;
}
export function bindPlan(plan: Plan, actor: string, today: string, soon: string) {
  return [
    plan.sql,
    plan.params.map((item) =>
      item.ref === 'actorId'
        ? actor
        : item.ref === 'today'
          ? today
          : item.ref === 'soon'
            ? soon
            : item.ref === 'dateOffset'
              ? addCalendarDays(today, item.days!)
              : item.literal,
    ),
  ] as const;
}
const round = (value: number) =>
  new Decimal(value.toPrecision(17)).toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN).toNumber();
export async function performance(store: Store, kind = 'all', today = vnToday()) {
  kind = ['sample', 'real'].includes(kind) ? kind : 'all';
  const soon = soonLimit(await store.calendar(), today);
  const role = ['head_of_department', 'director'].includes(store.actor.role) ? 'head_of_department' : 'officer';
  const mode = runtimeMode();
  const selected = (plans.performance as unknown as Record<string, Record<string, Record<string, Plan[]>>>)[mode][kind][
    role
  ];
  const [kpiRows, officerRows, mineRows] = await store.query(false, async (q) => {
    const result: Array<Record<string, unknown>[]> = [];
    for (const plan of selected) {
      const [sql, values] = bindPlan(plan, store.actor.id, today, soon);
      result.push((await q.run(sql, values)).rows);
    }
    return result;
  });
  const row = kpiRows[0] || {};
  const period = (key: string) => {
    const onTime = Number(row[key + '_completed'] || 0);
    const late = Number(row[key + '_completed_late'] || 0);
    const days = row[key + '_days'];
    return {
      received: Number(row[key + '_received'] || 0),
      completed: onTime + late,
      completedLate: late,
      onTimeRate: onTime + late ? round((onTime * 100) / (onTime + late)) : null,
      averageDays: days == null ? null : round(Number(days)),
    };
  };
  const officers = officerRows.map((row) => {
    const counts = Object.fromEntries(plans.performanceStates.map((key) => [key, Number(row[key] || 0)]));
    const done = counts.completed + counts.completed_late;
    return {
      id: row.id || null,
      name: String(row.name || 'Chưa phân công'),
      ...counts,
      overdue: counts.overdue,
      supplement_overdue: counts.supplement_overdue,
      due_soon: counts.due_soon,
      onTimeRate: done ? round((counts.completed * 100) / done) : null,
    };
  });
  officers.sort(
    (a, b) =>
      b.overdue + b.supplement_overdue - (a.overdue + a.supplement_overdue) ||
      b.due_soon - a.due_soon ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const mine = Object.fromEntries(
    mineRows.map((row) => [
      String(row.procedure),
      {
        queue: Number(row.queue || 0),
        ownQueue: Number(row.own_queue ?? row.queue ?? 0),
        overdue: Number(row.overdue || 0),
        dueSoon: Number(row.due_soon || 0),
        supplementOverdue: Number(row.supplement_overdue || 0),
      },
    ]),
  );
  return { period: { days: 30, current: period('current'), previous: period('previous') }, officers, mine };
}
export async function dashboard(store: Store, kind = 'all') {
  kind = ['sample', 'real'].includes(kind) ? kind : 'all';
  const pg = runtimeMode() === 'cloud';
  const statements = (plans.dashboard as unknown as Record<string, Plan[]>)[kind];
  const rows = await store.query(false, async (q) => {
    if (pg) {
      const result: Array<Record<string, unknown>[]> = [];
      for (const plan of statements) result.push((await q.run(plan.sql, [])).rows);
      return result;
    }
    const where = kind === 'all' ? '' : ` where coalesce(sample,0)=${kind === 'sample' ? 1 : 0}`;
    const sql = [
      "select count(*) as total,coalesce(sum(status in ('intake','analyzing','analyzed','processing','suspended')),0) as in_progress,coalesce(sum(documentCount),0) as documents,coalesce(sum(status='reviewed'),0) as reviewed,coalesce(sum(status='request_supplement'),0) as supplements,count(distinct dossierId) as dossiers from case_summaries" +
        where,
      'select 0 as total',
      'select procedure as id,count(*) as total from case_summaries' + where + ' group by 1 order by 1',
      'select substr(createdAt,1,7) as id,procedure,count(*) as total from case_summaries' +
        where +
        ' group by 1,2 order by 1,2',
      "select coalesce(status,'unknown') as id,count(*) as total from case_summaries" +
        where +
        ' group by 1 order by 1',
      'select projectId as id,max(projectName) as name,count(*) as total,count(distinct dossierId) as dossiers from case_summaries' +
        where +
        (where ? ' and ' : ' where ') +
        "projectId is not null and projectId<>'' group by 1 order by 3 desc,2,1 limit 6",
      'select id,name,projectName as project_name,projectId as project_id,status from case_summaries' +
        where +
        ' order by updatedAt desc,id limit 10',
    ];
    const result: Array<Record<string, unknown>[]> = [];
    for (const query of sql) result.push((await q.run(query)).rows);
    return result;
  });
  const [cases, projects, procedures, monthRows, statuses, top, recent] = rows;
  const numeric = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? value : Number(value)]));
  const months = new Map<string, { id: string; total: number; procedures: Record<string, number> }>();
  for (const row of monthRows) {
    const id = String(row.id);
    const month = months.get(id) || { id, total: 0, procedures: {} };
    month.total += Number(row.total);
    month.procedures[String(row.procedure)] = Number(row.total);
    months.set(id, month);
  }
  let totalProjects = Number(projects[0]?.total || 0);
  let topProjects = top.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    total: Number(row.total),
    dossiers: Number(row.dossiers),
  }));
  if (!pg) {
    const local = await store.projects({ limit: 1 });
    totalProjects = local.total;
    topProjects = await Promise.all(
      topProjects.map(async (row) => {
        let name = row.name || 'Dự án chưa đặt tên';
        try {
          const project = await store.project(String(row.id));
          name = project.name || name;
        } catch {
          /* Historical project can be absent from the local fixture list. */
        }
        return { ...row, name };
      }),
    );
  }
  return {
    cases: numeric(cases[0]),
    projects: { total: totalProjects },
    procedures: procedures.map((row) => ({ ...row, total: Number(row.total) })),
    months: [...months.values()],
    statuses: statuses.map((row) => ({ ...row, total: Number(row.total) })),
    top_projects: topProjects,
    recent,
    sla: await store.slaCounts(kind),
    performance: await performance(store, kind),
    ...(!pg ? { mode: 'demo' } : {}),
  };
}
