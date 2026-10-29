import { Router } from 'express';
import { requestStore } from './routes-cases.js';
import { requireAppraisal } from './deps.js';
import { RULE_VERSION } from './rules.js';
import { HttpError } from './errors.js';
import { exportDocument } from './reporting.js';
import { procedureBlocks } from './procedure-documents.js';
import { documentBytes, type Block } from './document-renderer.js';
import { formatDate } from '../../src/lib/utils.js';
const mime = (format: string) =>
  format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export function exportsRouter() {
  const router = Router();
  router.get('/cases/:id/export/:kind/:format', async (req, res) => {
    const value = await requestStore(res).get(req.params.id);
    requireAppraisal(value);
    if (req.params.format !== 'json' && value.runs.length && value.runs.at(-1)?.ruleVersion !== RULE_VERSION)
      throw new HttpError(409, 'Bộ quy tắc đã cập nhật. Chạy kiểm tra lại trước khi xuất dự thảo.');
    const result = await exportDocument(value, req.params.kind, req.params.format);
    res
      .set({
        'Content-Type': result.mime,
        'Content-Disposition': `attachment; filename="${req.params.kind}.${req.params.format}"`,
      })
      .send(result.data);
  });
  router.get('/cases/:id/procedure-review/:kind/:format', async (req, res) => {
    const value = await requestStore(res).get(req.params.id);
    const [title, blocks] = procedureBlocks(value, req.params.kind);
    res
      .set({
        'Content-Type': mime(req.params.format),
        'Content-Disposition': `attachment; filename="${req.params.kind}.${req.params.format}"`,
      })
      .send(await documentBytes(title, blocks, req.params.format as 'pdf' | 'docx', Boolean(value.sample)));
  });
  router.get('/cases/:id/internal-record/:format', async (req, res) => {
    const value = await requestStore(res).get(req.params.id);
    const procedure = (
      { bcnckt: 'Thẩm định BCNCKT', gpxd: 'Cấp giấy phép xây dựng', nghiem_thu: 'Hậu kiểm và nghiệm thu' } as Record<
        string,
        string
      >
    )[value.procedure || 'bcnckt'];
    const consultations = (value.consultations || []) as Array<{ text: string; response: string }>;
    const blocks: Block[] = [
      {
        heading: 'Thông tin hồ sơ',
        text: [
          value.name,
          'Dự án: ' + (value.projectName || 'Chưa gắn'),
          'Nghiệp vụ: ' + procedure,
          'Lần nộp: ' + (value.submissionRound || 1),
          'Phòng xử lý: ' + value.department,
          'Phụ trách: ' + (value.assignee || 'Chưa phân công'),
          'Phiếu ghi nhận quá trình xử lý nội bộ; chưa ký, chưa cấp số, không thay thế văn bản ban hành.',
        ],
      },
      {
        heading: 'Danh mục tài liệu',
        rows: [
          ['STT', 'Tên tài liệu', 'Phiên bản'],
          ...value.documents.map((document, i) => [String(i + 1), document.name, String(document.version || 1)]),
        ],
      },
      {
        heading: 'Quá trình xử lý',
        rows: [
          ['Thời điểm', 'Thao tác', 'Người thực hiện', 'Nội dung'],
          ...value.audit.map((event) => [formatDate(event.at.slice(0, 10)), event.action, event.actor, event.detail]),
        ],
      },
      {
        heading: 'Ý kiến và giải trình',
        text: consultations.map((item) => item.text + '\nGiải trình: ' + (item.response || 'Chưa có')),
      },
    ];
    res
      .set({
        'Content-Type': mime(req.params.format),
        'Content-Disposition': `attachment; filename="phieu-xu-ly.${req.params.format}"`,
      })
      .send(
        await documentBytes(
          'PHIẾU THEO DÕI XỬ LÝ HỒ SƠ',
          blocks,
          req.params.format as 'pdf' | 'docx',
          Boolean(value.sample),
        ),
      );
  });
  return router;
}
