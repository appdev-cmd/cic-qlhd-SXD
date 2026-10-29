import config from './data/stamping.json' with { type: 'json' };
import { now, vnToday } from './domain.js';
import type { AnalysisCase } from './rules.js';
import type { Actor } from './auth.js';
import type { Calendar } from './sla.js';
import type { Sheet } from './appraisal-sheet.js';
import { HttpError } from './errors.js';
interface Drawing {
  code: string;
  name: string;
  sheets: number;
}
export interface StampCommand {
  revision: number;
  action: string;
  date: string;
  note: string;
  reference: string;
  noticeReference: string;
  drawings: Drawing[];
}
interface Stamp {
  status: string;
  history: Array<{ date: string; [key: string]: unknown }>;
  drawings?: Drawing[];
  stampedAt?: string;
  stampedBy?: string;
  pdfDueDate?: string;
  pdfReceivedAt?: string;
  noticeReference?: string;
}
const actions = config.ACTIONS as unknown as Record<string, [string[], string]>;
export function initial(value: AnalysisCase): string {
  if (value.finalReview?.decision !== 'reviewed') return 'not_started';
  const conclusion = (value.appraisalSheet as Sheet | undefined)?.conclusion;
  return (
    (
      { eligible: 'to_stamp', eligible_after_revision: 'awaiting_request', ineligible: 'unstamped' } as Record<
        string,
        string
      >
    )[conclusion || ''] || 'not_started'
  );
}
export function status(value: AnalysisCase) {
  return (value.stamping as Stamp | undefined)?.status || initial(value);
}
export function archive(value: AnalysisCase, current: string) {
  const categories = new Map(value.requirements.map((item) => [item.id, item.category]));
  const docs = value.documents.filter((document) => document.role !== 'reference');
  const has = (...groups: string[]) =>
    docs.some(
      (document) =>
        groups.includes(document.requirementId) || groups.includes(categories.get(document.requirementId) || ''),
    );
  const consulted = ((value.consultations || []) as Array<{ response?: string }>).some((entry) => entry.response);
  return [
    { name: 'Tờ trình thẩm định', state: has('TTR') ? 'done' : 'missing' },
    { name: 'Hồ sơ pháp lý trình thẩm định', state: has('Tiếp nhận', 'Pháp lý') ? 'done' : 'missing' },
    { name: 'Kết luận của tổ chức, cá nhân tham gia thẩm định (nếu có)', state: consulted ? 'done' : 'optional' },
    {
      name: 'Thông báo kết quả thẩm định (Mẫu số 03)',
      state: value.finalReview?.decision === 'reviewed' ? 'done' : 'missing',
    },
    {
      name: 'Bản chụp PDF bản vẽ đã đóng dấu thẩm định',
      state: current === 'archived' ? 'done' : current === 'unstamped' ? 'optional' : 'missing',
    },
  ];
}
export function view(value: AnalysisCase, calendar?: Calendar) {
  const record = value.stamping as Stamp | undefined;
  const current = status(value);
  let due = record?.pdfDueDate || null;
  if (record?.stampedAt && !due && calendar) due = calendar.add(record.stampedAt, config.PDF_COPY_DAYS);
  return {
    status: current,
    label: (config.STATUSES as Record<string, string>)[current],
    basis: (config.BASIS as Record<string, string>)[current] || null,
    conclusion: (value.appraisalSheet as Sheet | undefined)?.conclusion || null,
    actions: Object.entries(actions)
      .filter(([, [sources]]) => sources.includes(current))
      .map(([id]) => ({ id, label: (config.LABELS as Record<string, string>)[id] })),
    drawings: record?.drawings || [],
    noticeReference: record?.noticeReference || '',
    stampedAt: record?.stampedAt || null,
    stampedBy: record?.stampedBy || null,
    pdfDueDate: due,
    pdfReceivedAt: record?.pdfReceivedAt || null,
    history: record?.history || [],
    archive: archive(value, current),
  };
}
export function apply(value: AnalysisCase, actor: Actor, input: StampCommand, calendar: Calendar, demo = false) {
  if ((value.procedure || 'bcnckt') !== 'bcnckt')
    throw new HttpError(422, 'Đóng dấu thẩm định chỉ áp dụng cho hồ sơ BCNCKT.');
  const current = status(value);
  const [sources, target] = actions[input.action];
  if (!sources.includes(current))
    throw new HttpError(
      409,
      'Thao tác không phù hợp bước hiện tại: ' + (config.STATUSES as Record<string, string>)[current] + '.',
    );
  if (input.action === 'stamp' && !demo && !config.LEADERS.includes(actor.role))
    throw new HttpError(403, 'Chỉ trưởng phòng hoặc lãnh đạo được xác nhận đóng dấu thẩm định.');
  if (input.date > vnToday()) throw new HttpError(422, 'Ngày không được sau ngày hiện tại.');
  const record: Stamp = structuredClone((value.stamping as Stamp) || { status: current, history: [] });
  if (input.action === 'request' && !input.reference.trim())
    throw new HttpError(422, 'Nhập số, ngày văn bản đề nghị đóng dấu.');
  if (input.action === 'refuse' && input.note.trim().length < 5)
    throw new HttpError(422, 'Nêu nội dung chưa đáp ứng yêu cầu tại thông báo kết quả thẩm định.');
  if (input.action === 'stamp') {
    if (!input.drawings.length) throw new HttpError(422, 'Liệt kê các bản vẽ được đóng dấu thẩm định.');
    if (!input.noticeReference.trim())
      throw new HttpError(422, 'Nhập số, ngày thông báo kết quả thẩm định ghi trên dấu (Mẫu số 14).');
    if (record.history.length && input.date < record.history.at(-1)!.date)
      throw new HttpError(422, 'Ngày đóng dấu không được trước ngày tiếp nhận đề nghị.');
    Object.assign(record, {
      drawings: input.drawings,
      noticeReference: input.noticeReference.trim(),
      stampedAt: input.date,
      stampedBy: actor.name,
      pdfDueDate: calendar.add(input.date, config.PDF_COPY_DAYS),
    });
  }
  if (input.action === 'pdf_received') {
    if (input.date < record.stampedAt!) throw new HttpError(422, 'Ngày nhận bản chụp không được trước ngày đóng dấu.');
    record.pdfReceivedAt = input.date;
  }
  record.history.push({
    action: input.action,
    label: (config.LABELS as Record<string, string>)[input.action],
    from: current,
    to: target,
    date: input.date,
    reference: input.reference.trim(),
    note: input.note.trim(),
    actor: actor.name,
    at: now(),
  });
  record.status = target;
  value.stamping = record;
  return (config.LABELS as Record<string, string>)[input.action];
}
