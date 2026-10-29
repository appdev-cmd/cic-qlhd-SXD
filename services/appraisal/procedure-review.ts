import config from './data/procedure_review.json' with { type: 'json' };
import rules from './data/procedure_rules.json' with { type: 'json' };
import { caseSubtype, now } from './domain.js';
import type { Actor } from './auth.js';
import type { DeadlineCase } from './sla.js';
import { normalizeGrade } from './sla.js';
import { HttpError } from './errors.js';

export const VERSION = rules.VERSION;
export interface Check {
  id: string;
  status: string;
  documentIds: string[];
  note: string;
}
export interface Defect {
  description: string;
  responsible: string;
  dueDate: string | null;
  status: string;
  documentIds: string[];
  resolution: string;
  nonSafetyConfirmed: boolean;
}
export interface ProcedureReview {
  subtype: string;
  ruleVersion: string;
  originalForm: string;
  extensionCount: number | null;
  checks: Check[];
  defects: Defect[];
  authority: string;
  investor: string;
  location: string;
  scope: string;
  parameters: string;
  priorPermit: string;
  designBasis: string;
  conclusion: string;
  conditions: string;
  visitDate: string | null;
  participants: string;
  observations: string;
  details: Record<string, string>;
  [key: string]: unknown;
}
export interface ReviewCheck {
  id: string;
  label: string;
  citation: string;
  conditional: boolean;
  condition: string;
  url: string;
}
export function specification(value: DeadlineCase, subtype?: string | null) {
  const procedure = value.procedure;
  if (!['gpxd', 'nghiem_thu'].includes(procedure || ''))
    throw new HttpError(422, 'Phiếu này dành cho GPXD và kiểm tra nghiệm thu.');
  if (value.legalDate < '2026-07-01')
    throw new HttpError(422, 'Bộ phiếu này áp dụng từ 01/07/2026; cần xác định chế độ chuyển tiếp riêng cho hồ sơ cũ.');
  subtype ||= caseSubtype(value) || (procedure === 'gpxd' ? 'new' : 'complete');
  const permits = config.PERMITS as unknown as Record<string, [string, number]>;
  const inspections = config.INSPECTIONS as Record<string, string>;
  const list = (procedure === 'gpxd' ? rules.permits : rules.inspections) as Record<string, ReviewCheck[]>;
  if (!list[subtype])
    throw new HttpError(
      422,
      procedure === 'gpxd' ? 'Chọn loại thủ tục GPXD hợp lệ.' : 'Chọn loại hậu kiểm, nghiệm thu hợp lệ.',
    );
  const citation =
    procedure === 'gpxd'
      ? `Điều 55–56 và Điều ${permits[subtype][1]} Nghị định 217/2026/NĐ-CP; cần đối chiếu quy định thẩm quyền tại địa phương.`
      : subtype === 'start_notice'
        ? 'Điều 48 Luật Xây dựng 135/2025; khoản 2 Điều 12, Điều 25–27, Phụ lục V NĐ 207/2026; điểm c khoản 2 Điều 67 NĐ 217/2026.'
        : subtype === 'during'
          ? 'Điều 8, 25–27 NĐ 207/2026/NĐ-CP (không quá 03 lần với cấp đặc biệt, cấp I; 02 lần với công trình khác).'
          : 'Điều 24–30, Phụ lục VI, VII, VIII, X NĐ 207/2026/NĐ-CP; Điều 2–5 TT 32/2026/TT-BXD theo đối tượng.';
  const detailFields = Object.entries(config.DETAILS)
    .filter(([key]) =>
      procedure === 'gpxd'
        ? !config.PERMIT_EXCLUDED.includes(key)
        : ((config.INSPECTION_DETAILS as Record<string, string[]>)[subtype!] || config.COMPLETION_DETAILS).includes(
            key,
          ),
    )
    .map(([id, label]) => ({ id, label }));
  return {
    subtype,
    citation,
    ruleVersion: VERSION,
    reviewOutdated: Boolean(value.procedureReview && value.procedureReview.ruleVersion !== VERSION),
    template: (rules.templates as Record<string, unknown>)[subtype],
    detailFields,
    types:
      procedure === 'gpxd'
        ? Object.entries(permits).map(([value, item]) => ({ value, label: item[0] }))
        : Object.entries(inspections).map(([value, label]) => ({ value, label })),
    checks: structuredClone(list[subtype]),
  };
}
export function inspectionLimit(grade: unknown, used: number) {
  const max = ['DB', 'I'].includes(normalizeGrade(grade) || '') ? 3 : 2;
  return { used, max, basis: 'Điểm a khoản 3 Điều 27 NĐ 207/2026/NĐ-CP', exceeded: used >= max };
}
export function validateReview(review: ProcedureReview | null | undefined): void {
  if (review && review.ruleVersion !== VERSION)
    throw new HttpError(422, 'Phiếu dùng checklist cũ; cập nhật theo phiên bản pháp lý hiện hành trước khi trình.');
  if (!review || review.conclusion === 'pending')
    throw new HttpError(422, 'Cần hoàn thành phiếu rà soát chuyên môn trước khi trình lãnh đạo.');
  if (!review.authority?.trim() || !review.scope?.trim())
    throw new HttpError(422, 'Cần xác định cơ quan có thẩm quyền và phạm vi xử lý.');
  if (review.checks.some((check) => check.status === 'pending'))
    throw new HttpError(422, 'Còn nội dung chưa được rà soát.');
  if (review.conclusion !== 'eligible') return;
  if (review.checks.some((check) => check.status === 'missing'))
    throw new HttpError(422, 'Còn nội dung thiếu; chưa được đề xuất đủ điều kiện.');
  for (const defect of review.defects)
    if (
      defect.status === 'open' &&
      !(
        review.subtype === 'conditional' &&
        defect.nonSafetyConfirmed &&
        defect.dueDate &&
        defect.documentIds.length &&
        defect.resolution.trim().length >= 10 &&
        review.conditions.trim().length >= 10
      )
    )
      throw new HttpError(
        422,
        'Tồn tại chưa khắc phục chỉ được xét nghiệm thu có điều kiện khi xác nhận không ảnh hưởng chịu lực, thời hạn sử dụng, công năng; có dẫn chứng, hạn hoàn thành và điều kiện sử dụng.',
      );
  if (!review.details.authorityBasis?.trim())
    throw new HttpError(422, 'Cần căn cứ xác định thẩm quyền cụ thể; hệ thống không tự suy đoán phân cấp địa phương.');
  if (['amendment', 'extension'].includes(review.subtype) && (!review.originalForm || !review.priorPermit.trim()))
    throw new HttpError(422, 'Cần giấy phép đã cấp và mẫu giấy phép gốc để lập nội dung điều chỉnh/gia hạn.');
  if (review.subtype === 'extension' && ![1, 2].includes(review.extensionCount || 0))
    throw new HttpError(422, 'Xác định lần gia hạn 1 hoặc 2; mỗi lần 12 tháng.');
  const required: Record<string, [string, string]> = {
    temporary: ['temporaryTerm', 'Cần thời hạn tồn tại được xác định theo quy định địa phương.'],
    partial: ['remainingSafety', 'Cần xác định an toàn khi tiếp tục thi công phần còn lại.'],
    start_notice: ['startDate', 'Cần ngày khởi công theo thông báo (Phụ lục V NĐ 207/2026).'],
  };
  if (required[review.subtype] && !review.details[required[review.subtype][0]]?.trim())
    throw new HttpError(422, required[review.subtype][1]);
  if (review.subtype === 'during' && !review.visitDate)
    throw new HttpError(422, 'Cần ngày tổ chức kiểm tra; thời hạn thông báo kết quả tính từ ngày này.');
  if (!review.investor.trim() || !review.location.trim())
    throw new HttpError(422, 'Cần thông tin chủ đầu tư và địa điểm trước khi đề xuất đủ điều kiện.');
}
export function applyReview(
  value: DeadlineCase,
  actor: Actor,
  body: ProcedureReview & { revision: number },
  limit?: ReturnType<typeof inspectionLimit>,
) {
  if (
    Object.keys(body.details).some((key) => !Object.hasOwn(config.DETAILS, key)) ||
    Object.values(body.details).some((item) => item.length > 2000)
  )
    throw new HttpError(422, 'Thông tin dự thảo vượt giới hạn hoặc có trường không hợp lệ.');
  if (body.ruleVersion !== VERSION)
    throw new HttpError(409, 'Checklist đã thay đổi; mở lại phiếu và rà soát phiên bản mới.');
  const spec = specification(value, body.subtype);
  const expected = new Map(spec.checks.map((check) => [check.id, check]));
  if (
    body.checks.length !== expected.size ||
    new Set(body.checks.map((check) => check.id)).size !== expected.size ||
    body.checks.some((check) => !expected.has(check.id))
  )
    throw new HttpError(422, 'Checklist chưa đầy đủ theo loại thủ tục đã chọn.');
  if (body.subtype === 'during' && limit?.exceeded && (body.details.extraReason || '').trim().length < 10)
    throw new HttpError(
      422,
      `Đã kiểm tra ${limit.used}/${limit.max} lần trong thi công; chỉ kiểm tra thêm khi có sự cố hoặc nghiệm thu từng phần, có điều kiện — nêu lý do.`,
    );
  const documents = new Map(
    value.documents.filter((document) => document.role === 'submission').map((document) => [document.id, document]),
  );
  for (const check of body.checks) {
    if (check.documentIds.some((id) => !documents.has(id)))
      throw new HttpError(422, 'Dẫn chứng phải là tài liệu nộp trong hồ sơ này.');
    if (check.status !== 'pending' && check.note.trim().length < 10)
      throw new HttpError(422, 'Mỗi kết luận cần giải thích ít nhất 10 ký tự.');
    if (check.status === 'satisfied' && !check.documentIds.length)
      throw new HttpError(422, 'Kết luận đã đáp ứng cần tài liệu dẫn chứng.');
    if (check.status === 'not_applicable' && !expected.get(check.id)!.conditional)
      throw new HttpError(422, 'Nội dung bắt buộc không được đánh dấu không áp dụng.');
  }
  for (const defect of body.defects) {
    if (defect.documentIds.some((id) => !documents.has(id)))
      throw new HttpError(422, 'Tài liệu khắc phục phải thuộc hồ sơ này.');
    if (defect.status === 'resolved' && (!defect.documentIds.length || defect.resolution.trim().length < 10))
      throw new HttpError(422, 'Xác nhận khắc phục cần tài liệu và giải trình.');
  }
  const { revision: _revision, ...result } = structuredClone(body);
  if (body.conclusion === 'eligible') validateReview(result);
  Object.assign(result, {
    reviewedBy: actor.name,
    reviewedAt: now(),
    citation: spec.citation,
    evidenceHashes: Object.fromEntries([...documents].map(([id, document]) => [id, document.hash])),
  });
  if (value.procedureReview) (value.procedureReviewHistory ||= []).push(structuredClone(value.procedureReview));
  value.procedureReview = result;
  value.subtype = body.subtype;
  value.finalReview = null;
}
