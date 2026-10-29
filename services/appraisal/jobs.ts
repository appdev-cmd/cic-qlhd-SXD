import { randomUUID, createHash } from 'node:crypto';
import { QueueClient } from '@vercel/queue';
import { Store, type CasePayload } from './store.js';
import { transaction, actorId } from './database.js';
import { DEMO_ACTOR, runtimeMode, remote, type Actor } from './auth.js';
import { withQuery } from './query.js';
import { readDocument } from './ingestion.js';
import { generate, configured, modelName, providerId } from './provider.js';
import { extractFacts, checklistCandidates } from './facts.js';
import { analyze } from './rules.js';
import { semanticNotes } from './semantic.js';
import { invalidate, now } from './domain.js';
import { save } from './deps.js';
import { HttpError } from './errors.js';

export const TOPIC = 'appraisal-node-jobs';
export const queue = new QueueClient(process.env.VERCEL ? {} : { region: 'iad1' });
interface Transcript {
  lines: string[];
  illegible: boolean;
}
export interface JobInput {
  signedUrl?: string;
  pages?: Record<string, Transcript>;
  [key: string]: unknown;
}
interface Job {
  id: string;
  case_id: string;
  actor_id?: string;
  actor: Actor;
  snapshot: CasePayload;
  state: string;
  runtime_input: JobInput;
}
class ContinueJob extends Error {
  constructor() {
    super('Continue OCR in another invocation');
    this.name = 'InterruptedError';
  }
}
class CancelledJob extends Error {
  constructor() {
    super('Job snapshot changed');
    this.name = 'InterruptedError';
  }
}
const originalCache = new Map<string, { data: Buffer; until: number }>();

export async function prepareOcrInput(store: Store, value: CasePayload, documentId: string): Promise<JobInput> {
  if (!configured()) throw new HttpError(503, 'Chưa cấu hình AI OCR phía máy chủ.');
  if (value.job?.status === 'running') throw new HttpError(409, 'Đợi công việc đang chạy hoàn tất hoặc hủy trước.');
  const document = value.documents.find((entry) => entry.id === documentId);
  if (!document || !document.name.toLowerCase().endsWith('.pdf'))
    throw new HttpError(422, 'OCR chỉ áp dụng cho PDF đã nộp.');
  const data = await store.file(value.id, documentId);
  if (createHash('sha256').update(data).digest('hex') !== document.hash)
    throw new HttpError(409, 'Tệp không khớp dấu kiểm tra bản gốc.');
  if (runtimeMode() === 'demo') return { pages: {} };
  const response = (await (
    await remote('/storage/v1/object/sign/appraisal-originals/' + value.id + '/' + documentId, store.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 86400 }),
    })
  ).json()) as { signedURL?: string; signedUrl?: string };
  const signed = response.signedURL || response.signedUrl;
  if (!signed) throw new HttpError(503, 'Không tạo được quyền đọc bản gốc cho OCR.');
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const path = signed.startsWith('/object/') ? '/storage/v1' + signed : signed;
  const url = new URL(path, base);
  if (
    url.origin !== new URL(base).origin ||
    url.pathname !== `/storage/v1/object/sign/appraisal-originals/${value.id}/${documentId}`
  ) {
    throw new HttpError(503, 'Địa chỉ đọc bản gốc OCR không hợp lệ.');
  }
  return { signedUrl: url.toString(), pages: {} };
}
async function claim(id: string, worker: string): Promise<Job | null> {
  if (runtimeMode() === 'cloud') {
    const row = await transaction(
      null,
      async (client) =>
        (await client.query<Job>('select * from public.claim_node_appraisal_job($1,$2)', [id, worker])).rows[0],
    );
    if (!row) return null;
    const actor = await transaction(
      row.actor_id!,
      async (client) =>
        (
          await client.query<{ id: string; full_name: string; province_id: string; department: string; role: string }>(
            'select id,full_name,province_id,department,role from public.profiles where id=$1 and is_active is true',
            [row.actor_id],
          )
        ).rows[0],
    );
    if (!actor) {
      await finish(id, worker, 'failed');
      return null;
    }
    return {
      ...row,
      actor: {
        id: actor.id,
        name: actor.full_name,
        tenantId: actor.province_id,
        department: actor.department,
        role: actor.role,
      },
    };
  }
  return withQuery({ ...DEMO_ACTOR }, true, async (q) => {
    const row = (
      await q.run<{
        id: string;
        case_id: string;
        actor: string;
        snapshot: string;
        state: string;
        attempts: number;
        lease_until: number | null;
        runtime_input: string;
      }>('select * from jobs where id=?', [id])
    ).rows[0];
    if (!row) return null;
    const result = {
      ...row,
      actor: JSON.parse(row.actor),
      snapshot: JSON.parse(row.snapshot),
      runtime_input: JSON.parse(row.runtime_input),
    } as Job;
    if (['completed', 'failed', 'stale', 'cancelled'].includes(row.state)) return result;
    if (row.state === 'running' && (row.lease_until || 0) > Date.now() / 1000) throw new Error('Job busy');
    if (row.attempts >= 3) {
      await q.run("update jobs set state='failed',lease_until=null where id=?", [id]);
      return { ...result, state: 'failed' };
    }
    await q.run("update jobs set state='running',attempts=attempts+1,lease_owner=?,lease_until=? where id=?", [
      worker,
      Date.now() / 1000 + 180,
      id,
    ]);
    return { ...result, state: 'running' };
  });
}
async function finish(id: string, worker: string, state: string) {
  if (runtimeMode() === 'cloud')
    await transaction(null, async (client) => {
      await client.query('select public.finish_appraisal_job($1,$2,$3)', [id, worker, state]);
    });
  else
    await withQuery({ ...DEMO_ACTOR }, true, async (q) => {
      await q.run("update jobs set state=?,lease_until=null where id=? and lease_owner=? and state='running'", [
        state,
        id,
        worker,
      ]);
    });
}
async function checkpoint(job: Job, worker: string, continuation = false) {
  if (runtimeMode() === 'cloud')
    await transaction(null, async (client) => {
      await client.query('select public.checkpoint_node_appraisal_job($1,$2,$3::jsonb,$4)', [
        job.id,
        worker,
        JSON.stringify(job.runtime_input),
        continuation,
      ]);
    });
  else
    await withQuery(job.actor, true, async (q) => {
      await q.run(
        `update jobs set runtime_input=?${continuation ? ",state='queued',attempts=0,lease_owner=null,lease_until=null" : ''} where id=? and lease_owner=? and state='running'`,
        [JSON.stringify(job.runtime_input), job.id, worker],
      );
    });
}
async function retry(job: Job, worker: string) {
  if (runtimeMode() === 'cloud')
    await transaction(null, async (client) => {
      await client.query('select public.retry_node_appraisal_job($1,$2)', [job.id, worker]);
    });
  else
    await withQuery(job.actor, true, async (q) => {
      await q.run(
        "update jobs set state='queued',lease_owner=null,lease_until=null where id=? and lease_owner=? and state='running'",
        [job.id, worker],
      );
    });
}
function renew(job: Job, worker: string) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (runtimeMode() === 'cloud')
        await transaction(null, async (client) => {
          await client.query('select public.renew_appraisal_job($1,$2)', [job.id, worker]);
        });
      else
        await withQuery(job.actor, true, async (q) => {
          await q.run("update jobs set lease_until=? where id=? and lease_owner=? and state='running'", [
            Date.now() / 1000 + 180,
            job.id,
            worker,
          ]);
        });
    } catch {
      console.error('Appraisal job lease renewal failed.');
    } finally {
      busy = false;
    }
  }, 20_000);
  timer.unref();
  return () => clearInterval(timer);
}
async function original(job: Job, store: Store): Promise<Buffer> {
  const cached = originalCache.get(job.id);
  if (cached && cached.until > Date.now()) return cached.data;
  const id = String(job.snapshot.job!.documentId);
  const document = job.snapshot.documents.find((entry) => entry.id === id)!;
  let data: Buffer;
  if (runtimeMode() === 'demo') data = await store.file(job.case_id, id);
  else {
    const url = new URL(job.runtime_input.signedUrl || '');
    const base = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!);
    if (
      url.origin !== base.origin ||
      url.pathname !== `/storage/v1/object/sign/appraisal-originals/${job.case_id}/${id}`
    )
      throw new HttpError(422, 'Quyền đọc bản gốc OCR không hợp lệ.');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new HttpError(503, 'Chưa đọc được bản gốc OCR. Có thể chạy lại.');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 18 * 1024 * 1024) throw new HttpError(422, 'Tệp OCR vượt giới hạn.');
    data = Buffer.from(await response.arrayBuffer());
  }
  if (data.length > 18 * 1024 * 1024 || createHash('sha256').update(data).digest('hex') !== document.hash)
    throw new HttpError(422, 'Bản gốc OCR không khớp dấu kiểm tra.');
  if (originalCache.size >= 2) originalCache.delete(originalCache.keys().next().value!);
  originalCache.set(job.id, { data, until: Date.now() + 30 * 60_000 });
  return data;
}
export async function processJob(jobId: string): Promise<void> {
  actorId(jobId);
  const worker = randomUUID();
  const job = await claim(jobId, worker);
  if (!job) return;
  const store = new Store('', job.actor);
  if (['completed', 'stale', 'cancelled'].includes(job.state)) return;
  if (job.state === 'failed') {
    const value = await store.get(job.case_id);
    if (value.job?.id === job.id && !value.job.finishedAt && !['completed', 'cancelled'].includes(value.job.status)) {
      value.job.status = 'failed';
      value.job.finishedAt = now();
      await save(
        store,
        value,
        value.revision,
        'Kiểm tra chưa hoàn tất',
        'Đã hết số lần thử. Bản gốc được giữ nguyên; có thể chạy lại.',
      );
    }
    return;
  }
  const stopLease = renew(job, worker);
  try {
    const snapshot = job.snapshot;
    const expected = snapshot.revision;
    const check = async () => {
      const value = await store.get(job.case_id);
      if (value.revision !== expected || value.job?.id !== job.id || value.job.status !== 'running')
        throw new CancelledJob();
      return value;
    };
    await check();
    if (snapshot.job?.mode === 'ocr') {
      const documentId = String(snapshot.job.documentId);
      const document = snapshot.documents.find((entry) => entry.id === documentId)!;
      const data = await original(job, store);
      let pageIndex = 0;
      let completed = 0;
      job.runtime_input.pages ||= {};
      const read = await readDocument(document.name, data, {
        ocrLimit: 300,
        beforePage: async (page) => {
          pageIndex = page;
          await check();
        },
        generator: async (request) => {
          const cached = job.runtime_input.pages![pageIndex];
          if (cached) return cached;
          if (completed >= 2) throw new ContinueJob();
          const result = await generate<Transcript>(request);
          job.runtime_input.pages![pageIndex] = result;
          completed++;
          await checkpoint(job, worker);
          return result;
        },
      });
      if (!read.segments.length) throw new HttpError(422, 'AI OCR chưa đọc được nội dung tài liệu.');
      const value = await check();
      const target = value.documents.find((entry) => entry.id === documentId)!;
      Object.assign(target, read, { ocrAt: now() });
      value.facts = value.facts.filter((fact) => fact.documentId !== documentId).concat(extractFacts(target));
      if (target.requirementId === 'TTR' && target.role === 'submission')
        value.checklistCandidates = checklistCandidates(target);
      for (const requirement of value.requirements)
        if (requirement.id === target.requirementId && target.role !== 'reference') {
          requirement.status = 'submitted';
          requirement.verifiedBy = null;
        }
      invalidate(value);
      Object.assign(value.job!, { status: 'completed', finishedAt: now() });
      await save(
        store,
        value,
        expected,
        'Hoàn tất AI OCR',
        `${target.name}: ${read.segments.length} đoạn; cần đối chiếu bản gốc và xác nhận lại dữ liệu.`,
      );
    } else {
      const run = analyze(snapshot, String(snapshot.job?.mode || 'intake'));
      if (snapshot.job?.useModel) {
        try {
          const result = await semanticNotes(snapshot, run);
          run.aiNotes = result.notes;
          run.aiStatus = result.message;
          if (configured()) Object.assign(run, { provider: 'rules+' + providerId(), model: modelName() });
        } catch {
          run.aiStatus = 'Lỗi gọi mô hình hoặc kết quả không hợp lệ. Chỉ có kết quả quy tắc; có thể chạy lại.';
        }
      }
      const value = await check();
      value.runs.push(run);
      Object.assign(value.job!, { status: 'completed', finishedAt: now() });
      await save(store, value, expected, 'Hoàn tất kiểm tra', `${run.findings.length} nhận xét; ${run.aiStatus}`);
    }
    originalCache.delete(job.id);
    await finish(job.id, worker, 'completed');
  } catch (error) {
    if (error instanceof ContinueJob) {
      await checkpoint(job, worker, true);
      if (process.env.VERCEL) await publishJob(job.id);
      else {
        const timer = setTimeout(() => {
          void publishJob(job.id);
        }, 10);
        timer.unref();
      }
      return;
    }
    if (error instanceof CancelledJob) {
      originalCache.delete(job.id);
      await finish(job.id, worker, 'stale');
      return;
    }
    console.error('Appraisal job retry', {
      jobId: job.id,
      mode: job.snapshot.job?.mode,
      error: error instanceof HttpError ? error.message : error instanceof Error ? error.name : 'UnknownError',
    });
    await retry(job, worker);
    throw new Error('Appraisal job will be retried.');
  } finally {
    stopLease();
  }
}
const localJobs = new Map<string, Promise<void>>();
export async function waitForLocalJobs(): Promise<void> {
  await Promise.all([...localJobs.values()]);
}
export async function publishJob(id: string): Promise<void> {
  if (process.env.VERCEL) {
    await queue.send(TOPIC, { jobId: id });
    return;
  }
  if (localJobs.has(id)) return;
  const operation = new Promise<void>((resolve) => {
    setImmediate(() => {
      void processJob(id)
        .catch(() => {
          const timer = setTimeout(() => {
            void publishJob(id);
          }, 1500);
          timer.unref();
        })
        .finally(() => {
          localJobs.delete(id);
          resolve();
        });
    });
  });
  localJobs.set(id, operation);
}
/** Recover persisted jobs after a local worker restart; never scan another runtime's queue. */
export async function resumeLocalJobs(): Promise<void> {
  if (process.env.VERCEL) return;
  const jobs =
    runtimeMode() === 'cloud'
      ? await transaction(
          null,
          async (client) =>
            (await client.query<{ id: string }>('select * from public.pending_node_appraisal_jobs()')).rows,
        )
      : await withQuery(
          { ...DEMO_ACTOR },
          false,
          async (q) =>
            (
              await q.run<{ id: string }>(
                "select id from jobs where json_extract(snapshot,'$.job.engine')='node' and (state='queued' or (state='running' and lease_until<?)) limit 20",
                [Date.now() / 1000],
              )
            ).rows,
        );
  for (const job of jobs) await publishJob(job.id);
}
