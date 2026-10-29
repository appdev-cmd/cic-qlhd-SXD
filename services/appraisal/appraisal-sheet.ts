import config from './data/appraisal_sheet.json' with { type: 'json' };
import type { Actor } from './auth.js';
import type { AnalysisCase, Finding } from './rules.js';
import { now } from './domain.js';
import { HttpError } from './errors.js';
export const { VERSION, PLANNING_BASES, SECTIONS, STATUSES, CONCLUSIONS } = config;
export interface Section {
  id: string;
  status: string;
  assessment: string;
  requirements: string[];
  findingIds: string[];
}
export interface Sheet {
  planningBasis: string;
  sections: Section[];
  conclusion: string;
  recommendations: string;
  updatedBy?: string;
  updatedAt?: string;
  version?: string;
}
export const costApplies = (investment?: string | null) =>
  investment == null || ['', 'dau_tu_cong', 'ppp'].includes(investment);
export const applicability = (investment?: string | null): Record<string, boolean> =>
  Object.fromEntries(SECTIONS.map((section) => [section.id, section.id !== 'cost' || costApplies(investment)]));
export function suggest(section: (typeof SECTIONS)[number], findings: Finding[]) {
  const scoped = findings.filter((finding) => section.categories.includes(finding.category));
  const issues = scoped.filter((finding) => finding.result !== 'consistent');
  const open = issues.filter((finding) => !finding.review || finding.review.decision === 'defer');
  const accepted = issues.filter(
    (finding) => finding.review?.decision === 'accept' && finding.result !== 'requires_specialist',
  );
  const status = !scoped.length || open.length ? null : accepted.length ? 'revise' : 'meets';
  const reason = !scoped.length
    ? 'Chưa có kết quả kiểm tra thuộc nhóm này; chuyên viên đánh giá trực tiếp.'
    : open.length
      ? `Còn ${open.length} nhận xét chưa đánh giá hoặc đang chờ làm rõ.`
      : accepted.length
        ? `${accepted.length} nội dung đã được ghi nhận cần chỉnh sửa, hoàn thiện.`
        : 'Không còn nội dung cần làm rõ trong phạm vi kiểm tra tự động.';
  return {
    status,
    reason,
    requirements: accepted.map((finding) => finding.title + ': ' + (finding.review?.note || finding.explanation)),
    findings: issues.map((finding) => ({
      id: finding.id,
      title: finding.title,
      result: finding.result,
      decision: finding.review?.decision || null,
    })),
  };
}
export const suggestedConclusion = (statuses: string[]): string | null =>
  statuses.includes('pending')
    ? null
    : statuses.includes('fails')
      ? 'ineligible'
      : statuses.includes('revise')
        ? 'eligible_after_revision'
        : 'eligible';
export function problems(sheet: Partial<Sheet> | null | undefined, applicable: Record<string, boolean>): string[] {
  if (!sheet || !Object.keys(sheet).length) return ['Chưa lập phiếu thẩm định theo Điều 38 NĐ 217/2026.'];
  const issues: string[] = [];
  const rows = new Map((sheet.sections || []).map((section) => [section.id, section]));
  if (applicable.planning && !sheet.planningBasis)
    issues.push('Chọn loại quy hoạch làm căn cứ lập dự án (khoản 1 Điều 38).');
  const statuses: string[] = [];
  for (const spec of SECTIONS) {
    if (!applicable[spec.id]) continue;
    const row = rows.get(spec.id);
    const status = row?.status || 'pending';
    statuses.push(status);
    if (status === 'pending') {
      issues.push('Chưa đánh giá: ' + spec.title + '.');
      continue;
    }
    if (status !== 'not_applicable' && !row?.assessment.trim())
      issues.push('Thiếu nhận xét đánh giá: ' + spec.title + '.');
    if (['revise', 'fails'].includes(status) && !row?.requirements.some((requirement) => requirement.trim()))
      issues.push('Nêu yêu cầu chỉnh sửa, hoàn thiện: ' + spec.title + '.');
  }
  const conclusion = sheet.conclusion || 'pending';
  const expected = suggestedConclusion(statuses);
  if (conclusion === 'pending') issues.push('Chưa chọn kết luận (mục VI.1 Mẫu số 03).');
  else if (expected && conclusion !== expected)
    issues.push(
      'Kết luận "' +
        (CONCLUSIONS as Record<string, string>)[conclusion] +
        '" không khớp mức đáp ứng của các nội dung (gợi ý: ' +
        (CONCLUSIONS as Record<string, string>)[expected].toLowerCase() +
        ').',
    );
  return issues;
}
export function view(value: AnalysisCase, investment?: string | null) {
  const sheet = value.appraisalSheet as Sheet | undefined;
  const rows = new Map((sheet?.sections || []).map((section) => [section.id, section]));
  const run = value.runs.at(-1);
  const findings = run && !run.stale ? (run.findings as Finding[]) : [];
  const applicable = applicability(investment);
  const basis = (PLANNING_BASES as Record<string, { criteria: string[]; basis: string }>)[sheet?.planningBasis || ''];
  const sections = SECTIONS.map((spec) => {
    const row = rows.get(spec.id);
    return {
      id: spec.id,
      title: spec.title,
      form: spec.form,
      basis: basis && spec.id === 'planning' ? basis.basis : spec.basis,
      criteria: spec.id === 'planning' ? basis?.criteria || [] : spec.criteria,
      applicable: applicable[spec.id],
      status: row?.status || (applicable[spec.id] ? 'pending' : 'not_applicable'),
      assessment: row?.assessment || '',
      requirements: row?.requirements || [],
      findingIds: row?.findingIds || [],
      suggestion: suggest(spec, findings),
    };
  });
  const issues = problems(sheet, applicable);
  return {
    version: VERSION,
    planningBases: Object.fromEntries(Object.entries(PLANNING_BASES).map(([key, item]) => [key, item.label])),
    statuses: STATUSES,
    conclusions: CONCLUSIONS,
    planningBasis: sheet?.planningBasis || '',
    sections,
    conclusion: sheet?.conclusion || 'pending',
    recommendations: sheet?.recommendations || '',
    suggestedConclusion: suggestedConclusion(
      sections.filter((section) => section.applicable).map((section) => section.status),
    ),
    problems: issues,
    complete: !issues.length,
    hasRun: Boolean(findings.length),
    locked: Boolean(value.finalReview),
    updatedBy: sheet?.updatedBy || null,
    updatedAt: sheet?.updatedAt || null,
  };
}
export function apply(value: AnalysisCase, actor: Actor, body: Sheet, investment?: string | null): Sheet {
  if ((value.procedure || 'bcnckt') !== 'bcnckt')
    throw new HttpError(422, 'Phiếu thẩm định theo Điều 38 dành cho hồ sơ BCNCKT.');
  if (value.finalReview)
    throw new HttpError(409, 'Hồ sơ đã hoàn tất rà soát. Mở lại hồ sơ trước khi sửa phiếu thẩm định.');
  if (new Set(body.sections.map((section) => section.id)).size !== body.sections.length)
    throw new HttpError(422, 'Mỗi nhóm nội dung chỉ khai một lần.');
  const applicable = applicability(investment);
  const result: Sheet = {
    version: VERSION,
    planningBasis: body.planningBasis,
    sections: body.sections.map((section) => ({
      ...section,
      requirements: section.requirements.map((requirement) => requirement.trim()).filter(Boolean),
      status: applicable[section.id] ? section.status : 'not_applicable',
    })),
    conclusion: body.conclusion,
    recommendations: body.recommendations.trim(),
    updatedBy: actor.name,
    updatedAt: now(),
  };
  value.appraisalSheet = result;
  return result;
}
export function requireComplete(value: AnalysisCase, investment?: string | null) {
  const issues = problems(value.appraisalSheet as Sheet | undefined, applicability(investment));
  if (issues.length) throw new HttpError(422, 'Phiếu thẩm định chưa hoàn chỉnh: ' + issues.slice(0, 3).join(' '));
}
