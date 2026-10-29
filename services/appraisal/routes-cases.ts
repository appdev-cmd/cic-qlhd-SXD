import { Router, type Response } from 'express';
import { createHash } from 'node:crypto';
import { Store, type CasePayload } from './store.js';
import { body } from './validation.js';
import { runtimeMode, writable } from './auth.js';
import { newCase, audit, now, invalidate, caseSubtype } from './domain.js';
import { edit, save, requireAppraisal, investmentOf, validateFinalReview } from './deps.js';
import { legalOverview, legalChecklist } from './legal.js';
import { RULE_VERSION } from './rules.js';
import { evaluate } from './sla.js';
import * as workflow from './workflow.js';
import { policy, VERSION } from './procedure-policy.js';
import { resolveAuthority } from './authority.js';
import { canonicalJson } from './json.js';
import { HttpError } from './errors.js';
export const requestStore = (res: Response) => new Store(res.locals.context.token, res.locals.context.actor);
export const integer = (value: unknown, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > maximum)
    throw new HttpError(422, 'Giá trị phân trang không hợp lệ.');
  return number;
};
export function casesRouter() {
  const router = Router();
  router.get('/submissions', async (req, res) => {
    const text = (key: string) => (typeof req.query[key] === 'string' ? (req.query[key] as string) : '');
    if (
      text('search').length > 200 ||
      text('projectId').length > 100 ||
      (text('procedure') && !['bcnckt', 'gpxd', 'nghiem_thu'].includes(text('procedure'))) ||
      !['', 'mine', 'queue'].includes(text('scope'))
    )
      throw new HttpError(422, 'Bộ lọc hồ sơ không hợp lệ.');
    res.json(
      await requestStore(res).page({
        offset: integer(req.query.offset),
        limit: integer(req.query.limit, 50, 100),
        procedure: text('procedure'),
        projectId: text('projectId'),
        search: text('search'),
        kind: text('kind'),
        status: text('status'),
        dateFrom: text('dateFrom'),
        dateTo: text('dateTo'),
        sort: text('sort'),
        direction: text('direction'),
        sla: text('sla'),
        scope: text('scope'),
      }),
    );
  });
  router.get('/cases', async (req, res) => {
    const values = await requestStore(res).all(
      integer(req.query.offset),
      req.query.procedure as string,
      req.query.projectId as string,
    );
    res.json(
      values.map((value) => ({
        ...Object.fromEntries(
          [
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
            'sampleScenario',
            'legalDate',
            'createdAt',
            'updatedAt',
            'status',
            'revision',
          ].map((key) => [key, value[key] ?? null]),
        ),
        procedure: value.procedure || 'bcnckt',
        documentCount: value.documents.length,
      })),
    );
  });
  router.post('/cases', async (req, res) => {
    const input = body('CreateCase', req.body);
    const store = requestStore(res);
    writable(store.actor);
    const project = input.projectId ? await store.project(input.projectId) : null;
    if (runtimeMode() === 'cloud' && !project) throw new HttpError(422, 'Chọn dự án trước khi tạo hồ sơ.');
    const value = newCase(input.name, input.province, store.actor, input.legalDate, input) as unknown as CasePayload;
    if (project)
      Object.assign(value, {
        projectName: project.title || project.name,
        projectCode: project.code,
        department: runtimeMode() === 'cloud' ? project.department || store.actor.department : store.actor.department,
      });
    audit(value, store.actor, 'Tạo hồ sơ', 'Tiếp nhận hồ sơ theo nghiệp vụ và dự án đã chọn.');
    res.json(await store.save(value));
  });
  router.get('/cases/:id', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    value.readOnly = await store.hasSuccessor(value.id);
    for (const run of value.runs) if (run.ruleVersion !== RULE_VERSION) run.stale = true;
    value.slaState = evaluate(value.sla as never, await store.calendar(), Boolean(value.readOnly));
    res.json(value);
  });
  router.get('/cases/:id/progress', async (req, res) => res.json(await requestStore(res).progress(req.params.id)));
  router.get('/cases/:id/submissions', async (req, res) =>
    res.json(await requestStore(res).lineage(req.params.id, integer(req.query.offset))),
  );
  router.post('/cases/:id/project', async (req, res) => {
    const input = body('ProjectLink', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const old = value.projectName || 'Chưa gắn dự án';
    const project = await store.project(input.projectId);
    Object.assign(value, {
      projectId: project.id,
      projectName: project.title || project.name,
      projectCode: project.code,
    });
    if (runtimeMode() === 'cloud') value.department = project.department;
    invalidate(value);
    res.json(
      await save(
        store,
        value,
        input.revision,
        'Gắn hồ sơ với dự án',
        `${old} → ${input.projectName} (${input.projectCode}). Cần rà soát lại kết quả sau thay đổi liên kết.`,
      ),
    );
  });
  router.post('/cases/:id/supplements', async (req, res) => {
    const input = body('Supplement', req.body);
    input.requestId = input.requestId.toLowerCase();
    const store = requestStore(res);
    writable(store.actor);
    const prior = await store.get(req.params.id);
    const fingerprint = createHash('sha256')
      .update(canonicalJson({ actor: store.actor.id, previous: prior.id, ...input }, true))
      .digest('hex');
    let existing: CasePayload | undefined;
    try {
      existing = await store.get(input.requestId);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
    if (existing) {
      if (existing.creationRequest !== fingerprint)
        throw new HttpError(409, 'Yêu cầu tạo lần nộp đã được dùng với nội dung khác.');
      res.json(existing);
      return;
    }
    if (prior.revision !== input.revision || (await store.hasSuccessor(prior.id)))
      throw new HttpError(409, 'Lần nộp đã thay đổi hoặc đã có lần bổ sung. Tải lại hồ sơ.');
    if (prior.job?.status === 'running')
      throw new HttpError(409, 'Chờ lượt kiểm tra hoàn tất trước khi tạo lần bổ sung.');
    if (input.legalDate < prior.legalDate)
      throw new HttpError(422, 'Ngày đánh giá lần bổ sung không được trước lần nộp trước.');
    if (!prior.projectId) throw new HttpError(422, 'Gắn hồ sơ với dự án trước khi tạo lần bổ sung.');
    await store.project(String(prior.projectId));
    const value = newCase(input.name, String(prior.province), store.actor, input.legalDate, {
      projectId: String(prior.projectId),
      sample: Boolean(prior.sample),
      procedure: prior.procedure,
      projectName: prior.projectName as string,
      projectCode: prior.projectCode as string,
    }) as unknown as CasePayload;
    Object.assign(value, {
      id: input.requestId,
      department: prior.department,
      previousSubmissionId: prior.id,
      previousRevision: prior.revision,
      previousSubmissionName: prior.name,
      dossierId: prior.dossierId || prior.id,
      submissionRound: Number(prior.submissionRound || 1) + 1,
      submissionReason: input.reason,
      creationRequest: fingerprint,
    });
    value.requirements = prior.requirements.map((item) => ({ ...item, status: 'missing', note: '', verifiedBy: null }));
    value.workflow = { state: 'received', counters: { ...prior.workflow?.counters } };
    audit(value, store.actor, 'Tạo lần bổ sung', prior.name + ' — ' + input.reason);
    res.json(await store.save(value));
  });
  router.get('/cases/:id/legal', async (req, res) => {
    const value = await requestStore(res).get(req.params.id);
    requireAppraisal(value);
    res.json(legalOverview(value));
  });
  router.post('/cases/:id/legal/context', async (req, res) => {
    const input = body('LegalContextReview', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    requireAppraisal(value);
    if (input.submissionDate > value.legalDate)
      throw new HttpError(422, 'Ngày trình không được sau ngày đánh giá của hồ sơ.');
    if (input.submissionDate >= '2026-07-01' && ['eligible_pending', 'ineligible'].includes(input.priorStatus))
      throw new HttpError(
        422,
        'Trạng thái đã trình trước 01/07 không phù hợp ngày trình. Chọn chưa xác định nếu không có hồ sơ chuyển tiếp.',
      );
    const { revision, ...context } = input;
    value.legalContext = { ...context, confirmedBy: store.actor.name, confirmedAt: now() };
    invalidate(value);
    res.json(await save(store, value, revision, 'Xác nhận phạm vi pháp lý', input.note));
  });
  router.post('/cases/:id/legal/requirements/:key', async (req, res) => {
    const input = body('LegalRequirementReview', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    requireAppraisal(value);
    const item = legalChecklist(value).find((item) => item.id === req.params.key);
    if (!item) throw new HttpError(404, 'Thành phần không thuộc chế độ pháp lý/phạm vi hiện tại.');
    if (!item.conditional && input.applicability !== 'applicable')
      throw new HttpError(422, 'Thành phần cơ bản không thể đánh dấu không áp dụng.');
    if (input.requirementIds.some((id) => !value.requirements.some((item) => item.id === id)))
      throw new HttpError(422, 'Nhóm tài liệu không thuộc hồ sơ.');
    const { revision, ...review } = input;
    (value.legalRequirements ||= {})[req.params.key] = {
      ...review,
      reviewedBy: store.actor.name,
      reviewedAt: now(),
    } as typeof review;
    invalidate(value);
    res.json(await save(store, value, revision, 'Đối chiếu thành phần theo pháp luật', item.name + ' — ' + input.note));
  });
  router.get('/cases/:id/workflow', async (req, res) =>
    res.json(await workflowState(requestStore(res), req.params.id)),
  );
  router.post('/cases/:id/workflow', async (req, res) => {
    const input = body('WorkflowCommand', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    if (input.action === 'approve' && (value.procedure || 'bcnckt') === 'bcnckt')
      validateFinalReview(value, await investmentOf(store, value));
    const label = workflow.apply(value, store.actor, input.action, input.note, input.visitDate);
    res.json(await save(store, value, input.revision, label, input.note));
  });
  router.post('/cases/:id/assignment', async (req, res) => {
    const input = body('Assignment', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    if (!['head_of_department', 'director'].includes(store.actor.role))
      throw new HttpError(403, 'Chỉ lãnh đạo được phân công.');
    const info = await workflowState(store, value.id);
    const target = info.reviewers.find((person) => person.id === input.assigneeId);
    if (!target) throw new HttpError(422, 'Người được phân công phải đang hoạt động và cùng phạm vi hồ sơ.');
    if (input.deadline && input.deadline < value.legalDate)
      throw new HttpError(422, 'Hạn xử lý không được trước ngày đánh giá.');
    const current = value.workflow || {};
    value.workflow = {
      ...current,
      state: ['received', 'assigned'].includes(info.state) ? 'assigned' : info.state,
      assigneeId: input.assigneeId,
      assigneeName: target.full_name,
      deadline: input.deadline || null,
      deadlineBasis: input.note,
      history: [
        ...(current.history || []),
        { action: 'Phân công', note: target.full_name + ' — ' + input.note, actor: store.actor.name, at: now() },
      ],
    };
    value.assignee = target.full_name;
    res.json(await save(store, value, input.revision, 'Phân công xử lý', target.full_name + ' — ' + input.note));
  });
  return router;
}
export async function workflowState(store: Store, id: string) {
  const value = await store.get(id);
  let project = {};
  if (value.projectId) {
    try {
      project = await store.project(String(value.projectId));
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
  }
  const appraised =
    value.procedure === 'gpxd' && value.projectId
      ? (await store.page({ limit: 1, procedure: 'bcnckt', projectId: String(value.projectId), status: 'reviewed' }))
          .total > 0
      : false;
  const rules = policy(value.procedure);
  const limits: Record<string, unknown> = {};
  for (const key of ['request_supplement', 'suspend', 'extend']) {
    const rule = key === 'request_supplement' ? rules.supplement : (rules[key] as typeof rules.supplement);
    if (rule)
      limits[key] = { used: value.workflow?.counters?.[key] || 0, max: rule.max ?? null, form: rule.form ?? null };
  }
  const reviewers =
    runtimeMode() === 'cloud'
      ? await store.query(
          false,
          async (q) =>
            (await q.run<{ id: string; full_name: string }>('select * from public.appraisal_reviewers(?)', [id])).rows,
        )
      : [];
  const frozen = await store.hasSuccessor(id);
  const state = workflow.state(value);
  return {
    authority: resolveAuthority(value.procedure || 'bcnckt', project, appraised, caseSubtype(value)),
    policy: { version: VERSION, limits, resultForm: rules.resultForm ?? null },
    state,
    label: (workflow.STATES as Record<string, string>)[state],
    actions: frozen ? [] : workflow.options(value, store.actor),
    reviewers,
    canAssign: !frozen && !value.finalReview && ['head_of_department', 'director'].includes(store.actor.role),
    canReopen: !frozen && Boolean(value.finalReview) && ['head_of_department', 'director'].includes(store.actor.role),
    workflow: value.workflow || {},
  };
}
