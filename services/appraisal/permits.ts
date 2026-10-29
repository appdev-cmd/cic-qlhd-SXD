import { Router } from 'express';
import { caseSubtype, uid, now, vnToday } from './domain.js';
import { HttpError } from './errors.js';
import { runtimeMode } from './auth.js';
import { type Calendar } from './sla.js';
import { Store, type CasePayload } from './store.js';
import { requestStore } from './routes-cases.js';
import { edit, save } from './deps.js';
import { body } from './validation.js';

type Event = { type: string; date: string; [key: string]: unknown };
type Permit = {
  id: string;
  number: string;
  kind: string;
  form: string;
  issueDate: string;
  startDeadline: string;
  publicUntil: string;
  content: Record<string, string>;
  events: Event[];
  startedAt?: string | null;
  [key: string]: unknown;
};
type Row = Permit & {
  caseId: string;
  projectId?: unknown;
  projectName?: unknown;
  projectCode?: unknown;
  history: Permit[];
  extensions: number;
  status: string;
  statusLabel: string;
};
export const STATUS_LABELS: Record<string, string> = {
  valid: 'Còn hiệu lực, chưa khởi công',
  started: 'Đã khởi công',
  start_overdue: 'Quá thời hạn khởi công, chưa gia hạn',
  revoked: 'Đã thu hồi',
  returned: 'Đã thu hồi, đã nộp lại bản gốc',
  cancelled: 'Đã hủy',
};
const reasons = {
  unlawful: 'Giấy phép được cấp không đúng quy định của pháp luật (điểm a khoản 1 Điều 65)',
  not_remedied: 'Chủ đầu tư không khắc phục việc xây dựng sai giấy phép trong thời hạn (điểm b khoản 1 Điều 65)',
};
export function addMonths(day: string, count: number) {
  const d = new Date(day + 'T00:00:00Z');
  const date = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count + 1);
  d.setUTCDate(0);
  d.setUTCDate(Math.min(date, d.getUTCDate()));
  return d.toISOString().slice(0, 10);
}
export function permitStatus(permit: Permit, today = vnToday()) {
  const events = new Set(permit.events.map((e) => e.type));
  return events.has('cancel')
    ? 'cancelled'
    : events.has('return')
      ? 'returned'
      : events.has('revoke')
        ? 'revoked'
        : permit.startedAt
          ? 'started'
          : permit.startDeadline && permit.startDeadline < today
            ? 'start_overdue'
            : 'valid';
}
export function permitView(value: CasePayload, calendar: Calendar) {
  const permit = value.permit as Permit | undefined;
  const review = value.procedureReview as { conclusion?: string } | undefined;
  const eligible = review?.conclusion === 'eligible';
  const reviewed = value.finalReview?.decision === 'reviewed';
  const actions: string[] = [];
  if (!permit && eligible && reviewed) actions.push('issue');
  if (permit) {
    const events = new Set(permit.events.map((e) => e.type));
    if (!events.has('revoke')) actions.push('revoke');
    else if (!events.has('return') && !events.has('cancel')) actions.push('return', 'cancel');
  }
  const status = permit ? permitStatus(permit) : null;
  const revoked = permit?.events.find((e) => e.type === 'revoke');
  const consultations = ((value.permitConsultations || []) as Array<Record<string, any>>).map((item) => {
    const due = calendar.add(item.sentDate, 2);
    return {
      ...item,
      dueDate: due,
      status: item.respondedDate ? 'responded' : due < vnToday() ? 'silent_consent' : 'waiting',
    };
  });
  return {
    consultations,
    consultDays: 2,
    permit: permit || null,
    status,
    statusLabel: status ? STATUS_LABELS[status] : null,
    returnDueDate: revoked ? calendar.add(revoked.date, 5) : null,
    cancelFromDate: revoked ? calendar.add(revoked.date, 10) : null,
    actions,
    revokeReasons: reasons,
    subtype: caseSubtype(value),
    eligible,
    reviewed,
  };
}
export async function permitRegister(store: Store): Promise<Row[]> {
  return store.query(false, async (q) => {
    const field = (path: string) =>
      q.pg ? `payload#>>'{${path.replaceAll('.', ',')}}'` : `json_extract(payload,'$.${path}')`;
    const table = q.pg ? 'public.appraisal_cases' : 'cases';
    const records = (
      await q.run(
        `select payload from ${table} where ${q.pg ? "payload->'permit' is not null and payload->'permit'<>'null'::jsonb" : "json_extract(payload,'$.permit') is not null"}`,
      )
    ).rows.map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload));
    const starts = (
      await q.run(
        `select ${field('procedureReview.details.permitNumber')} as n,${field('procedureReview.details.startDate')} as d from ${table} where ${field('procedureReview.conclusion')}='eligible' and coalesce(${field('procedureReview.subtype')},${field('procedureSubtype')},'')='start_notice'`,
      )
    ).rows;
    const startMap = new Map(starts.filter((r) => r.n && r.d).map((r) => [String(r.n).trim(), String(r.d)]));
    const grouped = new Map<string, Row>();
    const items = records
      .map((c) => ({
        ...c.permit,
        caseId: c.id,
        projectId: c.projectId ?? null,
        projectName: c.projectName ?? null,
        projectCode: c.projectCode ?? null,
      }))
      .sort(
        (a, b) =>
          a.issueDate.localeCompare(b.issueDate) ||
          Number(!['amendment', 'extension', 'reissue'].includes(a.kind)) -
            Number(!['amendment', 'extension', 'reissue'].includes(b.kind)),
      );
    for (const record of items) {
      const row = grouped.get(record.number);
      if (row && ['amendment', 'extension', 'reissue'].includes(record.kind)) {
        row.history.push(record);
        if (record.kind === 'extension') {
          row.extensions++;
          row.startDeadline = record.startDeadline;
          row.publicUntil = [row.publicUntil, record.publicUntil].sort().at(-1)!;
        }
        if (record.kind === 'amendment') row.content = record.content;
        row.events.push(...record.events);
      } else grouped.set(record.number, { ...record, history: [], extensions: 0 });
    }
    return [...grouped.values()]
      .map((row) => {
        row.startedAt ||= startMap.get(row.number) || null;
        const status = permitStatus(row);
        return {
          ...row,
          investor: row.content.investor || '',
          location: row.content.location || '',
          public: row.publicUntil >= vnToday() && status !== 'cancelled',
          status,
          statusLabel: STATUS_LABELS[status],
          history: row.history.map((h) => ({ kind: h.kind, issueDate: h.issueDate, caseId: h.caseId })),
        } as unknown as Row;
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  });
}
let issuance: Promise<unknown> = Promise.resolve();
async function issueLock<T>(store: Store, operation: () => Promise<T>) {
  const run = async () => {
    if (runtimeMode() === 'demo') return operation();
    return store.query(true, async (q) => {
      await q.run("select pg_advisory_xact_lock(hashtext('gpxd-permit-number:' || ?))", [store.actor.tenantId]);
      return operation();
    });
  };
  if (runtimeMode() !== 'demo') return run();
  const pending = issuance.then(run);
  issuance = pending.catch(() => undefined);
  return pending;
}
export function permitsRouter() {
  const router = Router();
  router.get('/permits', async (_req, res) => res.json({ items: await permitRegister(requestStore(res)) }));
  router.get('/cases/:id/permit', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    const result = permitView(value, await store.calendar());
    res.json({
      ...result,
      ...(result.actions.includes('issue') && ['amendment', 'extension', 'reissue'].includes(result.subtype || '')
        ? {
            basePermits: (await permitRegister(store))
              .filter((p) => p.projectId === value.projectId)
              .map((p) => ({ number: p.number, projectName: p.projectName, status: p.statusLabel })),
          }
        : {}),
    });
  });
  router.post('/cases/:id/consultations/permit', async (req, res) => {
    const input = { agency: '', subject: '', response: '', ...body('ConsultationCommand', req.body) };
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    if (value.procedure !== 'gpxd') throw new HttpError(422, 'Chức năng này dành cho hồ sơ cấp giấy phép xây dựng.');
    if (input.date > vnToday()) throw new HttpError(422, 'Ngày không được sau ngày hiện tại.');
    const items = (value.permitConsultations ||= []) as Array<Record<string, any>>;
    let label = '';
    if (input.action === 'send') {
      if (input.agency.trim().length < 3 || input.subject.trim().length < 5)
        throw new HttpError(422, 'Nhập cơ quan được hỏi ý kiến và nội dung cần ý kiến.');
      items.push({
        id: uid(),
        agency: input.agency.trim(),
        subject: input.subject.trim(),
        sentDate: input.date,
        response: '',
        respondedDate: null,
        actor: store.actor.name,
        at: now(),
      });
      label = 'Gửi văn bản lấy ý kiến: ' + input.agency.trim();
    } else {
      const item = items.find((i) => i.id === input.id);
      if (!item) throw new HttpError(404, 'Không có văn bản lấy ý kiến này.');
      if (item.respondedDate) throw new HttpError(409, 'Đã ghi nhận ý kiến trả lời.');
      if (input.date < item.sentDate || input.response.trim().length < 3)
        throw new HttpError(422, 'Nhập nội dung trả lời và ngày nhận không trước ngày gửi.');
      Object.assign(item, { response: input.response.trim(), respondedDate: input.date });
      label = 'Ghi nhận ý kiến của ' + item.agency;
    }
    res.json(await save(store, value, input.revision, label, input.subject || input.response));
  });
  router.post('/cases/:id/permit', async (req, res) => {
    const input = { basePermit: '', number: '', note: '', reference: '', ...body('PermitCommand', req.body) };
    const store = requestStore(res);
    const operation = async () => {
      const value = await edit(store, req.params.id, input.revision, true);
      const calendar = await store.calendar();
      if (value.procedure !== 'gpxd') throw new HttpError(422, 'Chức năng này dành cho hồ sơ cấp giấy phép xây dựng.');
      if (input.date > vnToday()) throw new HttpError(422, 'Ngày không được sau ngày hiện tại.');
      if (runtimeMode() !== 'demo' && !['head_of_department', 'director', 'admin'].includes(store.actor.role))
        throw new HttpError(403, 'Chỉ trưởng phòng hoặc lãnh đạo được cấp, thu hồi, hủy giấy phép.');
      if (!permitView(value, calendar).actions.includes(input.action))
        throw new HttpError(409, 'Thao tác không phù hợp tình trạng hồ sơ, giấy phép.');
      let label = '';
      if (input.action === 'issue') {
        const register = await permitRegister(store);
        const subtype = caseSubtype(value) || 'new';
        const base = register.find((p) => p.number === input.basePermit.trim());
        const derived = ['amendment', 'extension', 'reissue'].includes(subtype);
        if (derived && !base)
          throw new HttpError(422, 'Chọn giấy phép gốc trong sổ giấy phép để ghi điều chỉnh, gia hạn, cấp lại.');
        if (derived && base && base.projectId !== value.projectId)
          throw new HttpError(422, 'Giấy phép gốc phải thuộc cùng dự án.');
        if (derived && base && ['revoked', 'returned', 'cancelled'].includes(base.status))
          throw new HttpError(409, 'Giấy phép gốc đã bị thu hồi hoặc hủy.');
        if (subtype === 'extension' && base!.extensions >= 2)
          throw new HttpError(409, 'Mỗi giấy phép chỉ được gia hạn tối đa 02 lần (điểm a khoản 3 Điều 63).');
        const year = input.date.slice(0, 4);
        const used = register
          .map((p) => new RegExp('^\\s*(\\d+)/' + year + '/GPXD\\s*$', 'i').exec(p.number))
          .filter(Boolean)
          .map((m) => Number(m![1]));
        const number = derived
          ? base!.number
          : input.number.trim() || `${String(Math.max(0, ...used) + 1).padStart(3, '0')}/${year}/GPXD`;
        if (!derived && register.some((p) => p.number === number))
          throw new HttpError(409, 'Số giấy phép đã được sử dụng.');
        const review = value.procedureReview as Record<string, any>;
        const content: Record<string, string> = {
          name: String(value.projectName || value.name),
          investor: review.investor || '',
          location: review.location || '',
          scope: review.scope || '',
        };
        for (const key of [
          'buildingClass',
          'land',
          'elevation',
          'setback',
          'density',
          'landRatio',
          'boundaries',
          'area',
          'floorArea',
          'height',
          'floors',
          'color',
          'depth',
          'route',
          'temporaryTerm',
        ])
          if (review.details?.[key]) content[key] = review.details[key];
        value.permit = {
          id: uid(),
          number,
          kind: subtype,
          form: derived
            ? base!.form
            : ['repair', 'relocation'].includes(subtype)
              ? '04'
              : subtype === 'temporary'
                ? '05'
                : '03',
          issueDate: input.date,
          issuedBy: store.actor.name,
          content,
          note: input.note.trim(),
          events: [],
          startDeadline:
            subtype === 'extension'
              ? addMonths([base!.startDeadline, input.date].sort().at(-1)!, 12)
              : derived
                ? base!.startDeadline
                : addMonths(input.date, 12),
          publicUntil: addMonths(input.date, 12),
          ...(subtype === 'extension' ? { extensionNo: base!.extensions + 1 } : {}),
        };
        label =
          (
            {
              amendment: 'Ghi điều chỉnh giấy phép số ',
              extension: 'Gia hạn giấy phép số ',
              reissue: 'Cấp lại giấy phép số ',
            } as Record<string, string>
          )[subtype] || 'Cấp giấy phép xây dựng số ';
        label += number;
      } else {
        const permit = value.permit as Permit;
        if (input.action === 'revoke' && (!input.reason || !input.reference.trim()))
          throw new HttpError(422, 'Nêu căn cứ thu hồi và số, ngày quyết định thu hồi.');
        if (input.action === 'cancel') {
          const revoked = permit.events.find((e) => e.type === 'revoke')!;
          if (input.date <= calendar.add(revoked.date, 10))
            throw new HttpError(
              422,
              'Chỉ hủy khi quá 10 ngày làm việc kể từ quyết định thu hồi mà chưa nộp lại giấy phép.',
            );
          if (!input.reference.trim()) throw new HttpError(422, 'Nhập số, ngày quyết định hủy giấy phép.');
        }
        permit.events.push({
          type: input.action,
          date: input.date,
          reference: input.reference.trim(),
          reason: input.reason,
          note: input.note.trim(),
          actor: store.actor.name,
          at: now(),
        });
        label =
          { revoke: 'Thu hồi giấy phép số ', return: 'Nhận lại bản gốc giấy phép số ', cancel: 'Hủy giấy phép số ' }[
            input.action
          ] + permit.number;
      }
      return save(
        store,
        value,
        input.revision,
        label,
        [input.reference, input.note].filter(Boolean).join(' — ') || label,
      );
    };
    res.json(input.action === 'issue' ? await issueLock(store, operation) : await operation());
  });
  return router;
}
