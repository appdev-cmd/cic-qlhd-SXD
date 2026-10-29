import blueprints from './data/procedure-blueprints.json' with { type: 'json' };
import config from './data/procedure_review.json' with { type: 'json' };
import { VERSION, specification, type ProcedureReview, type Defect } from './procedure-review.js';
import type { AnalysisCase } from './rules.js';
import type { Block } from './document-renderer.js';
import { HttpError } from './errors.js';
import { formatDate } from '../../src/lib/utils.js';
type Blueprint = { title: string; blocks: Block[] };
function interpolate(value: string, context: Record<string, unknown>): string {
  return value.replace(/\{\{([\w.]+)(?:\|([^}]*))?\}\}/g, (_match, path: string, fallback?: string) => {
    let item: unknown = context;
    for (const key of path.split('.'))
      item =
        item && typeof item === 'object' && Object.hasOwn(item, key)
          ? (item as Record<string, unknown>)[key]
          : undefined;
    return item ? String(item) : fallback ? decodeURIComponent(fallback) : '';
  });
}
export function procedureDraft(value: AnalysisCase, review: ProcedureReview, kind = 'draft'): [string, Block[]] {
  const template = (blueprints as Record<string, Blueprint>)[`${value.procedure}/${review.subtype}/${kind}`];
  if (!template) throw new HttpError(422, 'Không có mẫu văn bản cho loại thủ tục này.');
  const context = {
    project: value.projectName || value.name,
    r: review,
    details: Object.fromEntries(
      Object.keys(config.DETAILS).map((key) => [key, review.details[key] || '[chưa xác nhận]']),
    ),
    dates: { visitDate: review.visitDate ? formatDate(review.visitDate) : '' },
  };
  const defectContext = (defect: Defect) => ({
    ...context,
    defect: { ...defect, statusLabel: defect.status === 'resolved' ? 'đã khắc phục' : 'chưa khắc phục' },
    dates: { ...context.dates, defectDue: defect.dueDate ? formatDate(defect.dueDate) : '' },
  });
  const submitted = value.documents.filter((document) => document.role === 'submission');
  const blocks = template.blocks
    .filter((block) => block.heading !== 'Công việc còn lại và theo dõi khắc phục' || review.defects.length)
    .map((block) => ({
      ...block,
      ...(block.heading ? { heading: interpolate(block.heading, context) } : {}),
      ...(block.agency ? { agency: interpolate(block.agency, context) } : {}),
      ...(block.text
        ? {
            text: block.text.flatMap((line) => {
              if (line.includes('{{defect.') || line.includes('{{dates.defectDue'))
                return review.defects.map((defect) => interpolate(line, defectContext(defect)));
              if (line.includes('{{document.'))
                return submitted.length
                  ? submitted.map((document) => interpolate(line, { ...context, document }))
                  : ['[Chưa nộp tài liệu]'];
              return [interpolate(line, context)];
            }),
          }
        : {}),
    }));
  const permit = value.permit as { number: string; issueDate: string; startDeadline: string } | undefined;
  if (permit && kind !== 'application' && value.procedure === 'gpxd')
    blocks[1].text!.unshift(
      `Số: ${permit.number} — ngày cấp ${formatDate(permit.issueDate)}; hạn khởi công đến ${formatDate(permit.startDeadline)} (khoản 10 Điều 49 NĐ 217/2026).`,
    );
  return [interpolate(template.title, context), blocks];
}
export function procedureBlocks(value: AnalysisCase, kind: string): [string, Block[]] {
  const review = value.procedureReview as ProcedureReview | undefined;
  if (!review) throw new HttpError(422, 'Lưu phiếu rà soát trước khi xuất dự thảo.');
  if (review.ruleVersion !== VERSION) throw new HttpError(409, 'Cập nhật phiếu theo checklist mới trước khi xuất.');
  const spec = specification(value, review.subtype);
  if (kind === 'draft' || kind === 'application') return procedureDraft(value, review, kind);
  const labels = new Map(spec.checks.map((check) => [check.id, check.label + '\n' + check.citation]));
  const documents = new Map(value.documents.map((document) => [document.id, document.name]));
  const states: Record<string, string> = {
    pending: 'Chưa đánh giá',
    satisfied: 'Đã đối chiếu, đáp ứng',
    missing: 'Thiếu / chưa đáp ứng',
    not_applicable: 'Không áp dụng',
  };
  const title =
    kind === 'minutes'
      ? 'BIÊN BẢN GHI NHẬN KIỂM TRA HIỆN TRƯỜNG'
      : value.procedure === 'gpxd'
        ? 'PHIẾU RÀ SOÁT HỒ SƠ CẤP GIẤY PHÉP XÂY DỰNG'
        : 'PHIẾU KIỂM TRA CÔNG TÁC NGHIỆM THU';
  const blocks: Block[] = [
    {
      heading: 'Phạm vi dự thảo',
      text: ['Chưa ký, chưa cấp số; sử dụng để rà soát nội bộ. Không thay thế văn bản ban hành.', spec.citation],
    },
    {
      heading: 'Thông tin công trình',
      text: [
        'Cơ quan: ' + review.authority,
        'Dự án: ' + (value.projectName || value.name),
        'Chủ đầu tư: ' + review.investor,
        'Địa điểm: ' + review.location,
        'Phạm vi: ' + review.scope,
        'Thông số: ' + review.parameters,
        'Thiết kế / căn cứ: ' + review.designBasis,
        'Giấy phép đã cấp: ' + review.priorPermit,
      ],
    },
    {
      heading: 'Nội dung đối chiếu',
      rows: [
        ['Nội dung', 'Đánh giá', 'Giải thích và tài liệu'],
        ...review.checks.map((check) => {
          if (check.documentIds.some((id) => !documents.has(id)))
            throw new HttpError(422, 'Tài liệu dẫn chứng không còn trong hồ sơ.');
          return [
            labels.get(check.id) || check.id,
            states[check.status],
            check.note + '\n' + check.documentIds.map((id) => documents.get(id)!).join(', '),
          ];
        }),
      ],
    },
    {
      heading: 'Kiểm tra hiện trường',
      text: [
        'Ngày: ' + (review.visitDate ? formatDate(review.visitDate) : 'Chưa xác định'),
        'Thành phần: ' + review.participants,
        review.observations,
      ],
    },
    {
      heading: 'Tồn tại và khắc phục',
      rows: [
        ['Nội dung', 'Phụ trách / hạn', 'Tình trạng'],
        ...review.defects.map((defect) => [
          defect.description,
          defect.responsible + ' / ' + (defect.dueDate ? formatDate(defect.dueDate) : 'Chưa xác định'),
          (defect.status === 'resolved' ? 'Đã xác nhận khắc phục' : 'Chưa khắc phục') + '\n' + defect.resolution,
        ]),
      ],
    },
    {
      heading: 'Đề xuất của người rà soát',
      text: [
        (
          {
            pending: 'Chưa kết luận',
            supplement: 'Đề nghị bổ sung',
            eligible: 'Đề xuất đủ điều kiện trong phạm vi đã đối chiếu',
            ineligible: 'Đề xuất chưa đủ điều kiện',
          } as Record<string, string>
        )[review.conclusion],
        review.conditions,
        'Người rà soát: ' + (review.reviewedBy || '[chưa xác nhận]'),
      ],
    },
  ];
  if (kind === 'minutes')
    return [
      title,
      [
        blocks[0],
        blocks[1],
        blocks[3],
        blocks[4],
        blocks[5],
        {
          keepTogether: true,
          heading: 'Xác nhận của các bên tham gia',
          text: [
            '[Đại diện cơ quan kiểm tra, chủ đầu tư và các bên tham gia ký, ghi rõ họ tên, chức vụ — chưa ký].',
            'Đây là biên bản ghi nhận kiểm tra hiện trường; biên bản nghiệm thu của chủ đầu tư được lập riêng theo khoản 5, 6 Điều 24 NĐ 207/2026.',
          ],
        },
      ],
    ];
  if (value.procedure === 'gpxd' && !review.defects.length && !review.visitDate)
    return [title, [blocks[0], blocks[1], blocks[2], blocks[5]]];
  return [title, blocks];
}
