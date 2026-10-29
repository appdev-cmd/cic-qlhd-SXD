import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { documentBytes, A4 } from './document-renderer.js';

test('Node DOCX uses A4, statutory margins, Times New Roman, repeated table headings and page numbers', async () => {
  const bytes = await documentBytes(
    'PHIẾU THẨM ĐỊNH',
    [
      {
        heading: 'Điện Biên',
        text: ['Nội dung tiếng Việt.'],
        rows: [
          ['Mã', 'Nội dung'],
          ['01', 'Bản gốc'],
        ],
      },
    ],
    'docx',
  );
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const size = xml.match(/<w:pgSz[^>]+>/)![0];
  const margin = xml.match(/<w:pgMar[^>]+>/)![0];
  assert.match(size, /w:w="11906"/);
  assert.match(size, /w:h="16838"/);
  for (const [key, value] of Object.entries({ left: 1701, right: 1134, top: 1247, bottom: 1134 }))
    assert.match(margin, new RegExp(`w:${key}="${value}"`));
  assert.match(xml, /Times New Roman/);
  assert.match(xml, /w:tblHeader/);
  assert.match(xml, /w:cantSplit/);
  const footer = await zip.file('word/footer1.xml')!.async('string');
  assert.match(footer, /PAGE/);
  assert.match(xml, /Nội dung tiếng Việt/);
});
test('Node PDF preserves Vietnamese text and A4 boundaries across long paragraphs and tables', async () => {
  const rows = [
    ['STT', 'Nội dung', 'Dẫn chứng'],
    ...Array.from({ length: 120 }, (_, i) => [
      String(i + 1),
      'Kiểm tra hồ sơ tại Điện Biên',
      'Đối chiếu bản gốc và xác nhận',
    ]),
  ];
  const bytes = await documentBytes('PHIẾU THẨM ĐỊNH', [
    { letterhead: true, agency: 'SỞ XÂY DỰNG ĐIỆN BIÊN', text: ['Tài liệu kiểm thử; chưa ký, chưa cấp số.'] },
    { heading: 'Danh mục và dẫn chứng', rows },
    { heading: 'Kết luận cần rà soát', text: ['Nội dung chưa thay thế kết quả phê duyệt.'] },
  ]);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const document = await task.promise;
    assert.ok(document.numPages > 2);
    let text = '';
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      assert.ok(Math.abs(viewport.width - A4.width) < 0.02);
      assert.ok(Math.abs(viewport.height - A4.height) < 0.02);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item);
      assert.ok(items.some((item) => item.str === 'Trang ' + i));
      for (const item of items) {
        text += item.str + '\n';
        if (!item.str.trim() || item.str.startsWith('Trang ')) continue;
        assert.ok(item.transform[4] >= A4.left - 1, 'Text starts within the left margin.');
        assert.ok(item.transform[4] + item.width <= A4.width - A4.right + 1, 'Text ends within the right margin.');
        assert.ok(item.transform[5] >= A4.bottom - 1, 'Body text stays above the bottom margin.');
      }
    }
    assert.match(text, /SỞ XÂY DỰNG ĐIỆN BIÊN/);
    assert.match(text, /Kiểm tra hồ sơ tại Điện Biên/);
    assert.match(text, /Kết luận cần rà soát/);
  } finally {
    await task.destroy();
  }
});
