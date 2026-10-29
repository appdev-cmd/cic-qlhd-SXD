import { Router } from 'express';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Decimal } from 'decimal.js';
import { requestStore } from './routes-cases.js';
import { body } from './validation.js';
import { attach, edit, save } from './deps.js';
import { uid, invalidate } from './domain.js';
import { HttpError } from './errors.js';
import { remote, runtimeMode } from './auth.js';
import { decimalScale, decimalString, type checklistCandidates } from './facts.js';

export function decodeBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new HttpError(422, 'Dữ liệu tệp không hợp lệ.');
  return Buffer.from(value, 'base64');
}
export function documentsRouter() {
  const router = Router();
  router.post('/cases/:id/documents', async (req, res) => {
    const input = body('Upload', req.body);
    const store = requestStore(res);
    if (runtimeMode() !== 'demo') throw new HttpError(422, 'Sử dụng phiên tải tài liệu trực tiếp.');
    const value = await edit(store, req.params.id, input.revision);
    const document = await attach(
      store,
      value,
      input.requirementId,
      input.name,
      decodeBase64(input.contentBase64),
      input.role,
    );
    res.json(
      await save(
        store,
        value,
        input.revision,
        'Nộp tài liệu',
        `${document.name} • phiên bản ${document.version}; bản gốc được giữ nguyên.`,
      ),
    );
  });
  router.get('/cases/:id/documents/:doc_id', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    const document = value.documents.find((entry) => entry.id === req.params.doc_id);
    if (!document) throw new HttpError(404, 'Không có tệp.');
    const mime: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain; charset=utf-8',
    };
    res
      .set('Content-Type', mime[extname(document.name).toLowerCase()] || 'application/octet-stream')
      .send(await store.file(value.id, document.id));
  });
  router.post('/cases/:id/requirements', async (req, res) => {
    const input = body('AddRequirement', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    value.requirements.push({
      id: 'ADD-' + uid().slice(0, 8),
      name: input.name,
      category: input.category,
      required: true,
      status: 'missing',
      note: 'Bổ sung theo danh mục tờ trình/chuyên viên.',
      verifiedBy: null,
    });
    invalidate(value);
    res.json(await save(store, value, input.revision, 'Thêm thành phần hồ sơ', input.name));
  });
  router.post('/cases/:id/checklist/accept', async (req, res) => {
    const input = body('AcceptChecklist', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const candidates = (value.checklistCandidates || []) as ReturnType<typeof checklistCandidates>;
    const candidate = candidates.find((entry) => entry.id === input.candidateId);
    if (!candidate) throw new HttpError(404, 'Không có đề xuất thành phần.');
    if (!value.requirements.some((item) => item.id === candidate.requirementId))
      value.requirements.push({
        id: candidate.requirementId,
        name: candidate.name,
        category: candidate.category,
        required: true,
        status: 'missing',
        note: 'Xác nhận từ tờ trình: ' + candidate.locator,
        verifiedBy: null,
      });
    candidate.accepted = true;
    invalidate(value);
    res.json(await save(store, value, input.revision, 'Xác nhận danh mục theo tờ trình', candidate.name));
  });
  router.patch('/cases/:id/requirements/:req_id', async (req, res) => {
    const input = body('RequirementReview', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const requirement = value.requirements.find((entry) => entry.id === req.params.req_id);
    if (!requirement) throw new HttpError(404, 'Không có thành phần hồ sơ.');
    if (
      input.status === 'verified' &&
      !value.documents.some(
        (document) =>
          document.requirementId === requirement.id && document.role !== 'reference' && document.segments.length,
      )
    )
      throw new HttpError(422, 'Chưa có tài liệu đầu vào để xác nhận.');
    Object.assign(requirement, {
      status: input.status,
      note: input.note,
      verifiedBy: input.status === 'verified' ? store.actor.name : null,
    });
    invalidate(value);
    res.json(await save(store, value, input.revision, 'Kiểm tra thành phần', requirement.name + ': ' + input.note));
  });
  router.patch('/cases/:id/facts/:fact_id', async (req, res) => {
    const input = body('FactReview', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    const fact = value.facts.find((entry) => entry.id === req.params.fact_id);
    if (!fact) throw new HttpError(404, 'Không có dữ liệu.');
    let canonical = input.value.trim();
    if (fact.unit) {
      try {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(canonical)) throw new Error('Invalid number');
        const number = new Decimal(canonical);
        if (!number.isFinite() || number.abs().gte('1e18')) throw new Error('Out of bounds');
        canonical = decimalString(number, decimalScale(canonical));
      } catch {
        throw new HttpError(422, 'Nhập số hợp lệ; phần thập phân dùng dấu chấm.');
      }
    }
    if (!canonical) throw new HttpError(422, 'Giá trị không hợp lệ.');
    const old = fact.value;
    Object.assign(fact, {
      value: canonical,
      reviewStatus: input.decision,
      reviewedBy: store.actor.name,
      reviewNote: input.note,
    });
    invalidate(value);
    res.json(
      await save(
        store,
        value,
        input.revision,
        'Xác nhận dữ liệu',
        `${fact.label}: ${old} → ${canonical}. ${input.note}`,
      ),
    );
  });
  router.post('/cases/:id/uploads', async (req, res) => {
    const input = body('PrepareUpload', req.body);
    const store = requestStore(res);
    const value = await edit(store, req.params.id, input.revision);
    if (runtimeMode() === 'demo') throw new HttpError(422, 'Dùng tải tài liệu cục bộ trong chế độ mẫu.');
    if (!['.pdf', '.docx', '.txt'].includes(extname(input.name).toLowerCase()))
      throw new HttpError(422, 'Hỗ trợ PDF, DOCX và TXT.');
    if (!value.requirements.some((item) => item.id === input.requirementId))
      throw new HttpError(422, 'Thành phần không thuộc hồ sơ.');
    const id = uid();
    await store.query(true, async (q) => {
      await q.run(
        'insert into public.appraisal_upload_sessions(id,case_id,actor_id,expected_revision,requirement_id,file_name,file_size,sha256,file_role) values(?,?,?,?,?,?,?,?,?)',
        [
          id,
          value.id,
          store.actor.id,
          input.revision,
          input.requirementId,
          basename(input.name.replaceAll('\\', '/')),
          input.size,
          input.sha256,
          input.role,
        ],
      );
    });
    const path = value.id + '/' + id;
    const signed = (await (
      await remote('/storage/v1/object/upload/sign/appraisal-originals/' + path, store.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upsert: false }),
      })
    ).json()) as { url?: string };
    const token = signed.url
      ? new URL(signed.url, process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).searchParams.get('token')
      : null;
    if (!token) throw new HttpError(503, 'Không tạo được phiên tải tệp.');
    res.json({ id, path, token });
  });
  router.post('/cases/:id/uploads/:upload_id/finalize', async (req, res) => {
    const store = requestStore(res);
    const value = await store.get(req.params.id);
    await edit(store, value.id, value.revision);
    if (runtimeMode() === 'demo') throw new HttpError(422, 'Dùng tải tài liệu cục bộ trong chế độ mẫu.');
    if (value.documents.some((document) => document.id === req.params.upload_id)) {
      res.json(value);
      return;
    }
    const session = await store.query(
      false,
      async (q) =>
        (
          await q.run<{
            expected_revision: number;
            file_size: string | number;
            sha256: string;
            requirement_id: string;
            file_name: string;
            file_role: string;
          }>(
            "select * from public.appraisal_upload_sessions where id=? and case_id=? and state='pending' and expires_at>now()",
            [req.params.upload_id, value.id],
          )
        ).rows[0],
    );
    if (!session) throw new HttpError(404, 'Phiên tải không tồn tại hoặc đã hết hạn.');
    if (value.revision !== session.expected_revision)
      throw new HttpError(409, 'Hồ sơ đã thay đổi trong lúc tải. Tải lại hồ sơ và chọn lại tệp.');
    const data = Buffer.from(
      await (
        await remote(
          '/storage/v1/object/authenticated/appraisal-originals/' + value.id + '/' + req.params.upload_id,
          store.token,
        )
      ).arrayBuffer(),
    );
    if (data.length !== Number(session.file_size) || createHash('sha256').update(data).digest('hex') !== session.sha256)
      throw new HttpError(422, 'Dung lượng hoặc mã kiểm tra tệp không khớp.');
    await attach(
      store,
      value,
      session.requirement_id,
      session.file_name,
      data,
      session.file_role,
      req.params.upload_id,
      false,
    );
    const saved = await save(store, value, value.revision, 'Tiếp nhận tài liệu', session.file_name);
    await store.query(true, async (q) => {
      await q.run("update public.appraisal_upload_sessions set state='completed' where id=?", [req.params.upload_id]);
    });
    res.json(saved);
  });
  return router;
}
