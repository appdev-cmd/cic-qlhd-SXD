import { Router } from 'express';
import { requestStore } from './routes-cases.js';
import { body } from './validation.js';
import { edit, save, requireAppraisal, investmentOf, validateFinalReview } from './deps.js';
import { uid, now, invalidate } from './domain.js';
import { HttpError } from './errors.js';
import { RULE_VERSION, type Finding } from './rules.js';
import { runtimeMode, writable } from './auth.js';
import { state } from './workflow.js';
import * as sheet from './appraisal-sheet.js';
import { specification, applyReview, inspectionLimit, type ProcedureReview } from './procedure-review.js';
import { prepareOcrInput, publishJob } from './jobs.js';
import * as stamping from './stamping.js';

export function reviewRouter() {
  const router = Router();
  router.post('/cases/:id/analysis', async (req, res) => {
    const input = body('RunRequest', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    requireAppraisal(value);
    if (value.job?.status === 'running') throw new HttpError(409, 'Hồ sơ đang được kiểm tra.');
    const jobId = uid();
    value.job = {
      id: jobId,
      status: 'running',
      startedAt: now(),
      mode: input.mode || 'intake',
      useModel: Boolean(input.useModel),
      engine: 'node',
    };
    const saved = await save(
      store,
      value,
      input.revision,
      'Bắt đầu kiểm tra',
      `Phạm vi ${input.mode}; mô hình: ${input.useModel}`,
      {},
    );
    await publishJob(jobId);
    res.json(saved);
  });
  router.post('/cases/:id/documents/:doc_id/ocr', async (req, res) => {
    const input = body('Mutation', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const jobInput = await prepareOcrInput(store, value, req.params.doc_id);
    const jobId = uid();
    value.job = {
      id: jobId,
      status: 'running',
      mode: 'ocr',
      documentId: req.params.doc_id,
      startedAt: now(),
      useModel: true,
      engine: 'node',
    };
    const saved = await save(
      store,
      value,
      input.revision,
      'Đưa tài liệu vào hàng đợi AI OCR',
      'Đọc trang scan; giữ nguyên bản gốc, dữ liệu trích xuất cần xác nhận lại.',
      jobInput,
    );
    await publishJob(jobId);
    res.json(saved);
  });
  router.post('/cases/:id/cancel', async (req, res) => {
    const input = body('Mutation', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    if (value.job) value.job.status = 'cancelled';
    res.json(await save(store, value, input.revision, 'Hủy kiểm tra', 'Kết quả của lượt đang chạy sẽ không được ghi.'));
  });
  router.patch('/cases/:id/findings/:finding_id', async (req, res) => {
    const input = body('app__schemas__Review', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const run = value.runs.at(-1);
    if (!run || run.stale) throw new HttpError(409, 'Cần chạy lại kiểm tra trước khi đánh giá.');
    const finding = (run.findings as Finding[]).find((entry) => entry.id === req.params.finding_id);
    if (!finding) throw new HttpError(404, 'Không có nhận xét trong lượt hiện tại.');
    finding.review = { decision: input.decision, note: input.note, actor: store.actor.name, at: now() };
    value.finalReview = null;
    res.json(await save(store, value, input.revision, 'Đánh giá nhận xét', finding.title + ': ' + input.note));
  });
  router.post('/cases/:id/consultations', async (req, res) => {
    const input = body('Consultation', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const consultations = (value.consultations ||= []) as Array<Record<string, unknown>>;
    consultations.push({
      id: uid(),
      text: input.text,
      response: input.response || '',
      actor: store.actor.name,
      at: now(),
      status: input.response?.trim() ? 'responded' : 'open',
    });
    value.finalReview = null;
    res.json(await save(store, value, input.revision, 'Ghi ý kiến và giải trình', input.text));
  });
  router.post('/cases/:id/final-review', async (req, res) => {
    const input = body('FinalReview', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    requireAppraisal(value);
    if (runtimeMode() !== 'demo' && !['head_of_department', 'director'].includes(store.actor.role))
      throw new HttpError(403, 'Chỉ trưởng phòng hoặc lãnh đạo được hoàn tất rà soát.');
    const run = value.runs.at(-1);
    if (!run || run.stale || run.ruleVersion !== RULE_VERSION)
      throw new HttpError(409, 'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.');
    if (input.decision === 'reviewed') validateFinalReview(value, await investmentOf(store, value));
    const source = state(value);
    const target = input.decision === 'reviewed' ? 'reviewed' : 'awaiting_supplement';
    value.finalReview = {
      decision: input.decision,
      note: input.note,
      actor: store.actor.name,
      at: now(),
      simulation: Boolean(value.sample) || runtimeMode() === 'demo',
    };
    value.workflow = {
      ...value.workflow,
      state: target,
      history: [
        ...(value.workflow?.history || []),
        {
          from: source,
          to: target,
          action: target === 'reviewed' ? 'Hoàn tất rà soát nội bộ' : 'Yêu cầu bổ sung',
          note: input.note,
          actor: store.actor.name,
          at: now(),
        },
      ],
    };
    res.json(await save(store, value, input.revision, 'Hoàn tất rà soát nội bộ', input.note));
  });
  router.post('/cases/:id/reopen', async (req, res) => {
    const input = body('ReopenReview', req.body);
    const store = requestStore(res);
    writable(store.actor);
    if (runtimeMode() !== 'demo' && !['head_of_department', 'director'].includes(store.actor.role))
      throw new HttpError(403, 'Chỉ trưởng phòng hoặc lãnh đạo được mở lại hồ sơ.');
    const value = await store.get(req.params.id);
    if (value.revision !== input.revision) throw new HttpError(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
    if (!value.finalReview) throw new HttpError(409, 'Hồ sơ chưa khóa sau rà soát.');
    if (await store.hasSuccessor(value.id)) throw new HttpError(409, 'Mở lần nộp mới nhất để xử lý.');
    const stamping = value.stamping as { status?: string } | undefined;
    if (stamping && ['stamped', 'archived'].includes(stamping.status || ''))
      throw new HttpError(409, 'Bản vẽ đã được đóng dấu thẩm định; xử lý điều chỉnh bằng lần trình mới.');
    delete value.stamping;
    ((value.reviewHistory ||= []) as unknown[]).push(value.finalReview);
    invalidate(value);
    value.workflow = {
      ...value.workflow,
      state: 'processing',
      history: [
        ...(value.workflow?.history || []),
        {
          from: value.workflow?.state,
          to: 'processing',
          action: 'Mở lại để rà soát',
          actor: store.actor.name,
          at: now(),
          note: input.note,
        },
      ],
    };
    res.json(await save(store, value, input.revision, 'Mở lại hồ sơ để rà soát', input.note));
  });
  router.get('/cases/:id/appraisal-sheet', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    requireAppraisal(value);
    res.json(sheet.view(value, await investmentOf(store, value)));
  });
  router.post('/cases/:id/appraisal-sheet', async (req, res) => {
    const input = body('SheetInput', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    requireAppraisal(value);
    const result = sheet.apply(value, store.actor, input as sheet.Sheet, await investmentOf(store, value));
    res.json(
      await save(
        store,
        value,
        input.revision,
        'Cập nhật phiếu thẩm định (Điều 38)',
        'Kết luận: ' + ((sheet.CONCLUSIONS as Record<string, string>)[result.conclusion] || 'chưa chọn'),
      ),
    );
  });
  router.get('/cases/:id/procedure-review', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    const spec = specification(value, req.query.subtype as string | undefined);
    const limit =
      spec.subtype === 'during'
        ? inspectionLimit(
            (await store.classification(value)).grade,
            await store.inspectionCount(value.projectId, value.id, value.dossierId),
          )
        : undefined;
    res.json({ ...spec, ...(limit ? { inspectionLimit: limit } : {}), review: value.procedureReview || null });
  });
  router.post('/cases/:id/procedure-review', async (req, res) => {
    const input = body('app__procedure_review__Review', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const limit =
      input.subtype === 'during'
        ? inspectionLimit(
            (await store.classification(value)).grade,
            await store.inspectionCount(value.projectId, value.id, value.dossierId),
          )
        : undefined;
    applyReview(value, store.actor, input as unknown as ProcedureReview & { revision: number }, limit);
    res.json(
      await save(
        store,
        value,
        input.revision,
        'Lưu phiếu rà soát chuyên môn',
        'Đã ghi nhận checklist, dẫn chứng và nội dung theo dõi khắc phục.',
      ),
    );
  });
  router.get('/cases/:id/stamping', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    requireAppraisal(value);
    res.json(stamping.view(value, await store.calendar()));
  });
  router.post('/cases/:id/stamping', async (req, res) => {
    const input = body('StampingCommand', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision, true);
    requireAppraisal(value);
    const label = stamping.apply(
      value,
      store.actor,
      input as stamping.StampCommand,
      await store.calendar(),
      runtimeMode() === 'demo',
    );
    res.json(
      await save(
        store,
        value,
        input.revision,
        label,
        [input.reference, input.note].filter(Boolean).join(' — ') || label,
      ),
    );
  });
  return router;
}
