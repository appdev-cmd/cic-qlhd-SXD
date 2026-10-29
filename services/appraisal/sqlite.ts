import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSearch } from './auth.js';

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
  'procedure',
  'documentCount',
  'searchText',
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
const paths: Record<string, string> = {
  slaDueDate: 'sla.dueDate',
  slaPaused: 'sla.paused',
  slaCompletedAt: 'sla.completedAt',
  workflowState: 'workflow.state',
  slaWaitingDue: 'sla.waitingDueDate',
  slaOutcome: 'sla.outcome',
  slaDueKind: 'sla.dueKind',
  assigneeId: 'workflow.assigneeId',
};

/** Same SQLite schema and triggers as the existing demo, including legacy dossier ancestry. */
export function openDemoDatabase(path?: string): DatabaseSync {
  const file = path || resolve(process.env.APPRAISAL_DATA_DIR || '.appraisal-data', 'appraisal.sqlite');
  if (file !== ':memory:') mkdirSync(resolve(file, '..'), { recursive: true });
  const db = new DatabaseSync(file);
  db.function('normalize_search', { deterministic: true }, normalizeSearch);
  db.exec(`PRAGMA busy_timeout=20000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files(case_id TEXT,id TEXT PRIMARY KEY,data BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,actor TEXT NOT NULL,
      snapshot TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,lease_until REAL,created_at REAL NOT NULL);`);
  ensureSummary(db);
  if (
    !db
      .prepare('pragma table_info(jobs)')
      .all()
      .some((row) => row.name === 'runtime_input')
  ) {
    db.exec("alter table jobs add column runtime_input TEXT NOT NULL DEFAULT '{}'");
  }
  return db;
}

export function ensureSummary(db: DatabaseSync): void {
  const current = db
    .prepare('pragma table_info(case_summaries)')
    .all()
    .map((row) => row.name);
  if (JSON.stringify(current) === JSON.stringify(fields)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (current.length) {
      for (const event of ['insert', 'update', 'delete']) db.exec(`drop trigger if exists cases_summary_${event}`);
      db.exec('drop table case_summaries');
    }
    const integers = new Set(['sample', 'submissionRound', 'revision', 'documentCount', 'slaPaused']);
    db.exec(
      'create table case_summaries (' +
        fields
          .map((key) => `"${key}" ${integers.has(key) ? 'integer' : 'text'}${key === 'id' ? ' primary key' : ''}`)
          .join(',') +
        ')',
    );
    const expressions = (prefix: string) =>
      fields
        .map((key) => {
          const get = (field: string) => `json_extract(${prefix}payload,'$.${field}')`;
          if (key === 'id') return prefix + 'id';
          if (key === 'procedure') return `coalesce(${get(key)},'bcnckt')`;
          if (key === 'documentCount') return `coalesce(json_array_length(${prefix}payload,'$.documents'),0)`;
          if (key === 'dossierId')
            return `coalesce(${get(key)},(select dossierId from case_summaries where id=${get('previousSubmissionId')}),${prefix}id)`;
          if (key === 'searchText')
            return ['name', 'province', 'projectName', 'projectCode']
              .map((field) => `coalesce(${get(field)},'')`)
              .join(" || ' ' || ");
          return get(paths[key] || key);
        })
        .join(',');
    for (const event of ['insert', 'update'])
      db.exec(`create trigger cases_summary_${event}
      after ${event} on cases begin insert or replace into case_summaries values(${expressions('NEW.')}); end`);
    db.exec(
      'create trigger cases_summary_delete after delete on cases begin delete from case_summaries where id=OLD.id; end',
    );
    db.exec('insert or replace into case_summaries select ' + expressions('cases.') + ' from cases');
    db.exec(`update case_summaries set dossierId=(with recursive ancestors(id,previous,depth) as (
      select id,previousSubmissionId,0 from case_summaries s where s.id=case_summaries.id
      union all select s.id,s.previousSubmissionId,a.depth+1 from case_summaries s
      join ancestors a on s.id=a.previous where a.depth<1000
    ) select id from ancestors order by depth desc limit 1) where previousSubmissionId is not null`);
    for (const key of [
      'assigneeId',
      'workflowState',
      'name',
      'updatedAt',
      'projectId',
      'procedure',
      'status',
      'sample',
      'dossierId',
      'slaDueDate',
      'previousSubmissionId',
    ]) {
      db.exec(`create index idx_case_summary_${key} on case_summaries("${key}",id)`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
