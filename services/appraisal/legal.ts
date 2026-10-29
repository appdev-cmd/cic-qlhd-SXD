import config from './data/legal.json' with { type: 'json' };
import { latestDocuments, type AppraisalCase } from './domain.js';

export const { CUTOFF, ND217, ND206, LAW135, ANNEX217, SCOPES } = config;
export const ref = (label: string, url = ND217) => ({ label, url });
export interface LegalContext {
  submissionDate?: string;
  priorStatus?: string;
  stage?: string;
  scope?: string;
  confirmedBy?: string | null;
  [key: string]: unknown;
}
export interface LegalCase extends Pick<AppraisalCase, 'documents'> {
  legalDate: string;
  legalContext?: LegalContext;
  legalRequirements?: Record<
    string,
    { requirementIds?: string[]; applicability?: string; note?: string; reviewedBy?: string | null }
  >;
}
export function resolveProfile(value: LegalCase) {
  const context = value.legalContext || {};
  const assessed = value.legalDate;
  const submitted = context.submissionDate;
  const prior = context.priorStatus || 'unknown';
  const stage = context.stage || 'original';
  let code = 'pending';
  let reason = 'Cần ngày trình và tình trạng hồ sơ tại mốc 01/07/2026 để xét chuyển tiếp.';
  if (assessed < '2024-12-30') reason = 'Thời điểm trước gói NĐ 175/2024; cần bổ sung bộ quy tắc lịch sử tương ứng.';
  else if (assessed < CUTOFF) {
    code = 'nd175';
    reason = 'Thời điểm đánh giá trước 01/07/2026; đối chiếu NĐ 175/2024 và các sửa đổi có hiệu lực khi đó.';
  } else if (['amendment', 'remaining_phase'].includes(stage) && prior === 'result_eligible') {
    code = 'nd217';
    reason =
      'Điều chỉnh/giai đoạn còn lại sau kết quả trước 01/07/2026: khoản 1 Điều 76; thẩm quyền còn phải xét khoản 7–9.';
  } else if (prior === 'result_eligible' && stage === 'original') {
    code = 'completed_legacy';
    reason = 'Đã có kết quả trước 01/07/2026: không thẩm định lại chỉ vì đổi nghị định (khoản 1 Điều 76).';
  } else if (submitted && submitted >= CUTOFF) {
    code = 'nd217';
    reason = 'Hồ sơ trình từ 01/07/2026; xét NĐ 217/2026 và các điều kiện phạm vi, thẩm quyền.';
  } else if (submitted && submitted < CUTOFF) {
    if (prior === 'eligible_pending') {
      code = 'nd175';
      reason =
        'Đã trình, đủ điều kiện thẩm định nhưng chưa có kết quả trước 01/07/2026: tiếp tục theo NĐ 175 (khoản 2 Điều 76).';
    } else if (['ineligible', 'result_ineligible'].includes(prior)) {
      code = 'nd217';
      reason =
        'Hồ sơ không đủ điều kiện thẩm định hoặc kết quả chưa đủ điều kiện tổng hợp trình phê duyệt: áp dụng NĐ 217 (khoản 2 Điều 76).';
    }
  }
  const scope = context.scope || 'unknown';
  return {
    code,
    reason,
    scope,
    scopeLabel: (SCOPES as Record<string, string>)[scope],
    confirmed: Boolean(context.confirmedBy) && code !== 'pending' && scope !== 'unknown',
    context,
    label: (
      {
        nd175: 'NĐ 175/2024 và văn bản sửa đổi theo thời điểm',
        nd217: 'NĐ 217/2026',
        pending: 'Chưa đủ căn cứ chọn chế độ pháp lý',
        completed_legacy: 'Hồ sơ lịch sử đã có kết quả',
      } as Record<string, string>
    )[code],
    refs: [ref('Điều 75; khoản 1, 2, 7–9 Điều 76 NĐ 217/2026')],
    templates:
      code === 'nd217'
        ? {
            submission: '01',
            notice:
              ({ construction: '03', decision_maker: '07', concurrent: '08' } as Record<string, string>)[scope] || null,
            decision: '09',
            supplement: '15',
            suspension: '16',
          }
        : code === 'nd175'
          ? { submission: '01', notice: scope === 'construction' ? '03' : null, decision: '06' }
          : {},
  };
}
type LegalItem = [string, string, string, string[], string];
export function legalChecklist(value: LegalCase, profile = resolveProfile(value)) {
  if (!['nd217', 'nd175'].includes(profile.code) || !['construction', 'concurrent'].includes(profile.scope)) return [];
  const modern = profile.code === 'nd217';
  const documents = latestDocuments(value);
  const items = (modern ? config.NEW_ITEMS : config.OLD_ITEMS) as LegalItem[];
  return items.map(([key, name, condition, defaults, clause]) => {
    const review = value.legalRequirements?.[profile.code + '.' + key] || {};
    const groups = review.requirementIds || defaults;
    const attached = documents.filter((document) => groups.includes(document.requirementId));
    const applicability = condition ? review.applicability || 'unknown' : 'required';
    return {
      id: profile.code + '.' + key,
      name,
      condition: condition || 'Thành phần cơ bản theo điều khoản',
      conditional: Boolean(condition),
      applicability,
      state:
        applicability === 'not_applicable'
          ? 'not_applicable'
          : applicability === 'unknown'
            ? 'unknown'
            : attached.length
              ? 'attached'
              : 'missing',
      requirementIds: groups,
      documentIds: attached.map((document) => document.id),
      note: review.note || '',
      reviewedBy: review.reviewedBy || null,
      legalRef: ref(
        modern && key === 'capacity'
          ? `${clause} NĐ 217/2026`
          : `${clause} Điều ${modern ? 35 : 17} NĐ ${modern ? '217/2026' : '175/2024'}`,
        modern
          ? ND217
          : 'https://xaydungchinhsach.chinhphu.vn/nghi-dinh-so-175-2024-nd-cp-ve-quan-ly-hoat-dong-xay-dung-119241231085735892.htm',
      ),
    };
  });
}
export function legalOverview(value: LegalCase) {
  const profile = resolveProfile(value);
  return {
    profile,
    checklist: legalChecklist(value, profile),
    warnings: [
      'Khoản 1 Điều 35 NĐ 217: kiểm tra ngôn ngữ, quy cách, tính pháp lý và xác nhận của cơ quan trình; không tự coi tài liệu OCR là bản ký hợp lệ.',
      'Nộp tệp chưa chứng minh tính hợp lệ, phê duyệt khảo sát, chữ ký số hoặc đủ bản vẽ.',
      'Thẩm quyền phải kiểm tra Điều 32–33 và chuyển tiếp Điều 76; địa phương công trình không tự quyết định cơ quan thẩm định.',
      'QCVN 10:2025/BCA trong thư mục bị đặt tên nhầm: nội dung về trang bị PCCC, không phải tiếp cận sử dụng. Kiểm tra QCVN 10:2024/BXD và chuyển tiếp.',
      'Bản dự thảo và bản chuyển đổi chưa đối chiếu nguyên bản không được dùng làm căn cứ kết luận.',
    ],
    scopeNotes: [
      'CQ chuyên môn: Điều 27 Luật 135/2025, Điều 38 NĐ 217; quy hoạch, đấu nối, quy chuẩn/tiêu chuẩn, an toàn/PCCC, chi phí trong phạm vi quy định.',
      'Đơn vị của người quyết định đầu tư: Điều 26 Luật 135/2025; tổng hợp chủ trương, khả thi/hiệu quả, môi trường, quản lý và các nội dung thuộc nhiệm vụ được giao.',
      'Chi phí: tách khoản 2–3 và khoản 5 Điều 7 NĐ 206. Cộng số học hoặc chênh lệch tổng không phải kết luận chấp thuận/cắt giảm chi phí.',
    ],
  };
}
export function appraisalDuration(group: string, grade: string) {
  if (group === 'national') return { duration: 60, unit: 'calendar_days' };
  const days: Record<string, [number, number]> = { A: [25, 20], B: [20, 16], C: [15, 12] };
  if (!days[group] || !['special', 'I', 'II', 'III', 'IV'].includes(grade)) return null;
  return { duration: days[group][['special', 'I'].includes(grade) ? 0 : 1], unit: 'working_days' };
}
