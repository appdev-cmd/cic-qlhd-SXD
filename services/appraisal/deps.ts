import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { audit, uid, now, invalidate } from './domain.js';
import { HttpError } from './errors.js';
import { writable } from './auth.js';
import { Store, type CasePayload } from './store.js';
import { readDocument } from './ingestion.js';
import { extractFacts, checklistCandidates } from './facts.js';
import { facts as projectFacts } from './authority.js';
import { legalChecklist, resolveProfile } from './legal.js';
import { RULE_VERSION, type Finding } from './rules.js';
import { requireComplete } from './appraisal-sheet.js';
export function requireAppraisal(value: CasePayload) {
  if ((value.procedure || 'bcnckt') !== 'bcnckt')
    throw new HttpError(422, 'Chức năng thẩm định BCNCKT không áp dụng cho loại hồ sơ này.');
}
export async function edit(store: Store, id: string, revision: number, afterReview = false) {
  writable(store.actor);
  const value = await store.get(id);
  if (value.revision !== revision) throw new HttpError(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.');
  if (await store.hasSuccessor(id))
    throw new HttpError(409, 'Lần nộp này đã có lần bổ sung; mở lần mới nhất để xử lý.');
  const assigned = value.workflow?.assigneeId;
  if (assigned && assigned !== store.actor.id && store.actor.role === 'officer')
    throw new HttpError(403, 'Hồ sơ đã phân công chuyên viên khác.');
  if (value.finalReview && !afterReview)
    throw new HttpError(409, 'Hồ sơ đã khóa sau rà soát. Cần người có thẩm quyền mở lại trước khi sửa.');
  return value;
}
export async function save(
  store: Store,
  value: CasePayload,
  expected: number,
  action: string,
  detail: string,
  jobInput?: Record<string, unknown>,
) {
  value.revision = expected + 1;
  value.updatedAt = now();
  audit(value, store.actor, action, detail);
  return store.save(value, expected, jobInput);
}
export async function attach(
  store: Store,
  value: CasePayload,
  requirementId: string,
  name: string,
  data: Uint8Array,
  role = 'submission',
  documentId?: string,
  storeFile = true,
) {
  const requirement = value.requirements.find((entry) => entry.id === requirementId);
  if (!requirement) throw new HttpError(400, 'Chọn một thành phần hồ sơ có trong checklist.');
  const hash = createHash('sha256').update(data).digest('hex');
  if (
    value.documents.some(
      (document) => document.hash === hash && document.requirementId === requirementId && document.role === role,
    )
  )
    throw new HttpError(409, 'Tệp này đã có trong cùng thành phần hồ sơ.');
  const read = await readDocument(name, data, { ocrLimit: 0 });
  const document = {
    id: documentId || uid(),
    requirementId,
    name: basename(name.replaceAll('\\', '/')),
    role,
    version:
      1 +
      value.documents.filter((document) => document.requirementId === requirementId && document.role === role).length,
    hash,
    size: data.length,
    uploadedAt: now(),
    ...read,
  };
  if (storeFile) await store.putFile(value.id, document.id, data);
  value.documents.push(document);
  value.facts.push(...extractFacts(document));
  if (requirementId === 'TTR' && role === 'submission') value.checklistCandidates = checklistCandidates(document);
  if (role !== 'reference') {
    requirement.status = document.segments.length && !document.warnings.length ? 'submitted' : 'needs_supplement';
    requirement.verifiedBy = null;
  }
  invalidate(value);
  return document;
}
export async function investmentOf(store: Store, value: CasePayload) {
  if (!value.projectId) return null;
  try {
    return projectFacts(await store.project(String(value.projectId))).investment;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}
export function validateFinalReview(value: CasePayload, investment?: string | null) {
  const run = value.runs.at(-1);
  if (!run || run.stale || run.ruleVersion !== RULE_VERSION)
    throw new HttpError(409, 'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.');
  const profile = resolveProfile(value);
  if (!profile.confirmed)
    throw new HttpError(422, 'Cần xác nhận phạm vi và chế độ pháp lý trước khi hoàn tất rà soát.');
  if (legalChecklist(value).some((entry) => entry.applicability === 'unknown'))
    throw new HttpError(422, 'Còn thành phần pháp lý chưa xác định điều kiện áp dụng.');
  if ((run.findings as Finding[]).some((finding) => !finding.review || finding.review.decision === 'defer'))
    throw new HttpError(422, 'Còn nhận xét chưa được đánh giá hoặc đang chờ làm rõ.');
  const active = new Map<string, string>();
  for (const document of value.documents)
    if (document.role !== 'reference') active.set(document.requirementId + '/' + document.role, document.id);
  const ids = new Set(active.values());
  if (value.facts.some((fact) => fact.reviewStatus === 'pending' && ids.has(fact.documentId)))
    throw new HttpError(422, 'Còn dữ liệu trích xuất chưa được xác nhận.');
  if (profile.code === 'nd217' && ['construction', 'concurrent'].includes(profile.scope))
    requireComplete(value, investment);
}
