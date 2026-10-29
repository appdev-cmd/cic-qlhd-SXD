import { Decimal } from 'decimal.js';
import templates from './data/bcnckt-blueprints.json' with { type: 'json' };
import { legalOverview } from './legal.js';
import { latestDocuments } from './domain.js';
import { SECTIONS, STATUSES, CONCLUSIONS, type Sheet } from './appraisal-sheet.js';
import { view as stampView } from './stamping.js';
import { documentBytes, type Block } from './document-renderer.js';
import type { AnalysisCase, Finding, analyze } from './rules.js';
import { formatDate } from '../../src/lib/utils.js';
import { HttpError } from './errors.js';
export const money = (value: string | number) =>
  new Decimal(value).toFixed(0, Decimal.ROUND_HALF_EVEN).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' VNĐ';
function replaceProject(template: { title: string; blocks: Block[] }, name: string) {
  const fill = (value: unknown): unknown =>
    typeof value === 'string'
      ? value.replaceAll('{{project}}', name)
      : Array.isArray(value)
        ? value.map(fill)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item)]))
          : value;
  return fill(template) as { title: string; blocks: Block[] };
}
export function draftBlocks(value: AnalysisCase, kind: string): [string, Block[]] | null {
  const profile = legalOverview(value).profile;
  if (profile.code !== 'nd217' || kind === 'report') return null;
  if (profile.scope !== 'construction' && ['notice', 'supplement', 'suspension', 'stamp'].includes(kind)) return null;
  const template = (templates as Record<string, { title: string; blocks: Block[] }>)[kind];
  if (!template) throw new HttpError(422, 'Loại văn bản không hợp lệ.');
  const name = String(value.projectName || value.name);
  const { title, blocks } = replaceProject(template, name);
  if (kind === 'stamp') {
    const record = stampView(value);
    const conclusion = (CONCLUSIONS as Record<string, string>)[record.conclusion || ''] || '[Chưa có kết luận]';
    blocks[1].text = [
      'THẨM ĐỊNH THIẾT KẾ XÂY DỰNG',
      'Căn cứ thông báo kết quả thẩm định số: ' + (record.noticeReference || '[chưa ghi]'),
      'Hồ sơ thiết kế: ' + name,
      'Kết luận: ' + conclusion,
      'Người phê duyệt/thẩm định: ' + (record.stampedBy || '[chưa đóng dấu]') + ' (ký, ghi rõ họ tên)',
      'Kích thước mẫu dấu: rộng 4–6 cm, dài 6–9 cm. Hồ sơ trực tuyến xác nhận bằng chữ ký số.',
    ];
    blocks[2].rows = [
      ['STT', 'Ký hiệu', 'Tên bản vẽ', 'Số tờ'],
      ...record.drawings.map((drawing, i) => [String(i + 1), drawing.code, drawing.name, String(drawing.sheets)]),
    ];
    blocks[3].text = [
      'Trạng thái: ' + record.label + '.',
      'Ngày đóng dấu: ' + (record.stampedAt || '[chưa đóng dấu]'),
      'Hạn nộp bản chụp PDF (05 ngày làm việc, điểm b khoản 9 Điều 36): ' + (record.pdfDueDate || '—'),
      ...record.archive.map(
        (item) =>
          item.name +
          ': ' +
          ({ done: 'đã có', missing: 'còn thiếu', optional: 'nếu có' } as Record<string, string>)[item.state],
      ),
    ];
    return [title, blocks];
  }
  blocks[1].text![3] =
    'Phạm vi pháp lý: ' + (profile.confirmed ? 'đã được xác nhận lựa chọn.' : 'đang chờ chuyên viên xác nhận.');
  const lastRun = value.runs.at(-1);
  const findings = lastRun && !lastRun.stale ? (lastRun.findings as Finding[]) : [];
  const documents = new Map(value.documents.map((document) => [document.id, document]));
  const description = (finding: Finding) => {
    const text = [finding.title + ': ' + finding.explanation];
    if (finding.calculation) text.push('Kiểm tra sơ bộ: ' + finding.calculation);
    for (const source of finding.sources.slice(0, 1))
      text.push(
        'Chứng cứ: ' +
          (documents.get(source.documentId)?.name || 'Tài liệu') +
          ' — ' +
          source.locator +
          ': ' +
          source.quote,
      );
    for (const reference of finding.legalRefs) text.push('Căn cứ đối chiếu: ' + reference.label);
    if (finding.review) text.push('Ý kiến chuyên viên: ' + finding.review.note);
    return text;
  };
  if (kind === 'notice') {
    blocks
      .find((block) => block.heading === 'II. HỒ SƠ TRÌNH THẨM ĐỊNH')!
      .text!.push(
        ...latestDocuments(value).map(
          (document) => `${document.name} — phiên bản ${document.version} (đã nhận tệp, chưa xác nhận hợp lệ)`,
        ),
      );
    const sheet = value.appraisalSheet as Sheet | undefined;
    const rows = new Map((sheet?.sections || []).map((section) => [section.id, section]));
    const requests: string[] = [];
    for (const [i, spec] of SECTIONS.entries()) {
      const row = rows.get(spec.id);
      const status = row?.status || 'pending';
      let text: string[];
      if (status === 'pending') {
        text = findings
          .filter((finding) => spec.categories.includes(finding.category) && finding.result !== 'consistent')
          .flatMap(description);
        if (!text.length) text = ['[Chưa có đánh giá chuyên môn được xác nhận].'];
      } else if (status === 'not_applicable') text = ['Không thuộc nội dung thẩm định của dự án này.'];
      else {
        text = ['Mức độ đáp ứng: ' + (STATUSES as Record<string, string>)[status] + '.'];
        if (row?.assessment) text.push(row.assessment);
        for (const item of row?.requirements || []) {
          text.push('Yêu cầu: ' + item);
          requests.push(item);
        }
      }
      blocks.find((block) => block.heading === `${i + 1}. ${spec.title}`)!.text = text;
    }
    const conclusion = sheet?.conclusion || 'pending';
    blocks.find((block) => block.heading === 'VI. KẾT LUẬN VÀ KIẾN NGHỊ')!.text = [
      Object.hasOwn(CONCLUSIONS, conclusion)
        ? '1. Kết luận: Báo cáo nghiên cứu khả thi ' +
          name +
          ' ' +
          (CONCLUSIONS as Record<string, string>)[conclusion].toLowerCase() +
          '.'
        : '1. Kết luận: [Chưa lựa chọn. Người có thẩm quyền xác định: đủ điều kiện / chưa đủ điều kiện / chỉ đủ điều kiện sau khi hoàn thiện để tổng hợp, trình phê duyệt].',
      '2. Kiến nghị: ' +
        (sheet?.recommendations ||
          '[Hoàn thiện các vấn đề đã được chuyên viên xác nhận; không dùng toàn bộ cảnh báo máy làm yêu cầu hành chính].'),
      ...requests.map((item) => '- ' + item),
    ];
  } else if (['supplement', 'suspension'].includes(kind)) {
    const selected =
      kind === 'supplement'
        ? findings.filter(
            (finding) =>
              (finding.code.startsWith('INPUT.') || finding.code.startsWith('LAW.INPUT.')) &&
              finding.result === 'insufficient_evidence',
          )
        : findings.filter((finding) => finding.result === 'inconsistent');
    const text = selected.flatMap(description);
    blocks.find((block) => block.heading === 'Nội dung đề xuất cần xác minh')!.text = text.length
      ? text
      : ['Chưa phát hiện nội dung phù hợp loại phiếu này. Không có căn cứ tự phát hành phiếu.'];
  }
  return [title, blocks];
}
export function reportBlocks(value: AnalysisCase, kind: string): [string, Block[]] {
  const draft = draftBlocks(value, kind);
  if (draft) return draft;
  const titles: Record<string, string> = {
    report: 'Báo cáo hỗ trợ kiểm tra BCNCKT',
    supplement: 'Dự thảo yêu cầu bổ sung hồ sơ',
    notice: 'Dự thảo thông báo kết quả rà soát BCNCKT',
    decision: 'Khung dự thảo quyết định phê duyệt dự án',
    suspension: 'Ghi chú rà soát trước khi tạm dừng thẩm định',
  };
  if (!titles[kind]) throw new HttpError(422, 'Không có biểu mẫu áp dụng cho chế độ pháp lý này.');
  const overview = legalOverview(value);
  const blocks: Block[] = [
    {
      heading: 'Thông tin hồ sơ',
      text: [
        value.name,
        'Địa phương công trình: ' + value.province,
        'Thời điểm đánh giá: ' + formatDate(value.legalDate),
        'Cán bộ phụ trách: ' + value.assignee,
        'Phạm vi: hỗ trợ đọc, đối chiếu và kiểm tra; không thay thế kết luận thẩm định của cơ quan có thẩm quyền.',
      ],
    },
    {
      heading: 'Chế độ pháp lý và phạm vi',
      text: [
        overview.profile.label,
        overview.profile.reason,
        overview.profile.scopeLabel,
        'Các khung biểu mẫu được triển khai cho CQ chuyên môn theo NĐ 217. Phạm vi khác hoặc hồ sơ lịch sử chỉ xuất báo cáo hỗ trợ, cần hoàn thiện biểu mẫu tương ứng.',
      ],
    },
  ];
  const run = value.runs.at(-1) as ReturnType<typeof analyze> | undefined;
  if (!run || run.stale) {
    blocks.push({
      heading: 'Chưa có kết quả kiểm tra còn hiệu lực',
      text: ['Tài liệu chưa được kiểm tra hoặc đã thay đổi. Cần chạy lại trước khi sử dụng kết quả.'],
    });
    return [titles[kind], blocks];
  }
  blocks.push({
    heading: 'Phương pháp và tình trạng',
    text: [
      run.aiStatus,
      'Bộ quy tắc: ' + run.ruleVersion,
      'Các nhận xét và nguồn bên dưới cần chuyên viên kiểm tra. Không xác nhận chữ ký số hoặc tính đúng của số liệu hiện trường.',
    ],
  });
  if (kind === 'decision')
    blocks.push({
      heading: 'Điều kiện để hoàn thiện dự thảo',
      text: [
        'Chưa xác nhận đủ điều kiện phê duyệt. Chưa cấp số văn bản, ngày ban hành hoặc người ký.',
        'Điều 1: Nội dung dự án phải được đối chiếu với dữ liệu đã xác nhận.',
        'Điều 2: Trách nhiệm thực hiện và cơ quan liên quan do người có thẩm quyền xác định.',
        'Điều 3: Chỉ hoàn thiện hiệu lực và chữ ký sau quy trình phê duyệt hợp lệ.',
      ],
    });
  const labels: Record<string, string> = {
    consistent: 'Số liệu/đầu vào khớp trong phạm vi kiểm tra',
    inconsistent: 'Cần làm rõ khác biệt',
    insufficient_evidence: 'Chưa đủ dữ liệu',
    requires_specialist: 'Cần chuyên viên xác nhận',
  };
  const documents = new Map(value.documents.map((document) => [document.id, document]));
  const findings =
    kind === 'supplement' ? run.findings.filter((finding) => finding.result !== 'consistent') : run.findings;
  findings.forEach((finding, i) => {
    const text = [(labels[finding.result] || finding.result) + '. ' + finding.explanation];
    if (finding.calculation) text.push('Phép tính: ' + finding.calculation);
    if (finding.missingEvidence.length) text.push('Cần cung cấp/xác nhận: ' + finding.missingEvidence.join('; '));
    for (const reference of finding.legalRefs) text.push('Căn cứ: ' + reference.label + ' — ' + reference.url);
    for (const source of finding.sources.slice(0, kind === 'report' ? 4 : 1))
      text.push(
        'Nguồn: ' +
          (documents.get(source.documentId)?.name || 'Tài liệu') +
          ' — ' +
          source.locator +
          ': ' +
          source.quote,
      );
    if (finding.sources.length > 4) text.push('Các nguồn còn lại có trong kết quả JSON và màn hình bằng chứng.');
    if (finding.review) text.push('Ý kiến chuyên viên: ' + finding.review.note + ' — ' + finding.review.actor);
    blocks.push({ heading: `${i + 1}. ${finding.title}`, text });
  });
  (run.aiNotes || []).forEach((note, i) =>
    blocks.push({
      heading: `Đề xuất AI cần xác minh ${i + 1}`,
      text: [
        note.text,
        ...note.sources.map(
          (source) =>
            'Nguồn: ' +
            (documents.get(source.documentId)?.name || 'Tài liệu') +
            ' — ' +
            source.locator +
            ': ' +
            source.text,
        ),
      ],
    }),
  );
  if (run.costComparison)
    blocks.push({
      heading: 'Đối chiếu chi phí',
      text: [
        'Tiết kiệm ròng theo tổng: ' + money(run.costComparison.netSavings) + '. Chưa có kết luận cắt giảm chi phí.',
      ],
      rows: [
        ['Khoản mục', 'Lần đầu', 'Lần mới', 'Thay đổi'],
        ...run.costComparison.items.map((item) => [
          item.name,
          money(item.before),
          money(item.after),
          money(item.difference),
        ]),
      ],
    });
  blocks.push({
    heading: 'Kết luận của báo cáo hỗ trợ',
    text: [
      'Chưa thay thế thông báo kết quả thẩm định hoặc quyết định phê duyệt. Các nội dung chuyên ngành và dữ liệu chưa xác nhận cần được xử lý trước khi người có thẩm quyền kết luận.',
      'Rà soát nội bộ: ' + (value.finalReview ? value.finalReview.note : 'Chưa hoàn tất.'),
    ],
  });
  return [titles[kind], blocks];
}
export async function exportDocument(value: AnalysisCase, kind: string, format: string) {
  if (format === 'json') return { data: Buffer.from(JSON.stringify(value, null, 2)), mime: 'application/json' };
  const [title, blocks] = reportBlocks(value, kind);
  return {
    data: await documentBytes(title, blocks, format as 'pdf' | 'docx', Boolean(value.sample)),
    mime:
      format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
