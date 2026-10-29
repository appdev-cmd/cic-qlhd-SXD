import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inlineText, parseInline, parseMarkdown, slugify, splitSections, type Block } from './markdown.ts';
import { HELP_ANCHORS } from './helpAnchors.ts';

test('parses inline code, bold, italic and links', () => {
  const nodes = parseInline('Bấm **Lưu** rồi xem `BCNCKT_Lan02.pdf`, *ghi chú* và [mục 5](#5-tiếp-nhận).');
  assert.deepEqual(
    nodes.map((n) => n.type),
    ['text', 'strong', 'text', 'code', 'text', 'em', 'text', 'link', 'text'],
  );
  const link = nodes.find((n) => n.type === 'link');
  assert.equal(link?.type === 'link' && link.href, '#5-tiếp-nhận');
  assert.equal(inlineText(nodes), 'Bấm Lưu rồi xem BCNCKT_Lan02.pdf, ghi chú và mục 5.');
});

test('keeps underscores inside words and unmatched markers literal', () => {
  assert.equal(inlineText(parseInline('TMĐT_Lan02 và 2 * 3')), 'TMĐT_Lan02 và 2 * 3');
  assert.deepEqual(parseInline('a < b & <script>'), [{ type: 'text', text: 'a < b & <script>' }]);
});

test('slugifies headings like GitHub, keeping Vietnamese letters', () => {
  assert.equal(slugify('1. Phạm vi hỗ trợ và nguyên tắc sử dụng'), '1-phạm-vi-hỗ-trợ-và-nguyên-tắc-sử-dụng');
  assert.equal(slugify('5. Tiếp nhận, liên kết dự án và nộp tài liệu'), '5-tiếp-nhận-liên-kết-dự-án-và-nộp-tài-liệu');
});

test('parses headings, tables, nested lists, task lists, quotes and code blocks', () => {
  const blocks = parseMarkdown(
    [
      '# Tiêu đề',
      '',
      '## 1. Mục một',
      '',
      '| Cột A | Cột B |',
      '| --- | :---: |',
      '| `x` | **y** |',
      '',
      '1. Bước một',
      '2. Bước hai:',
      '   - Ý con',
      '   - Ý con 2',
      '3. Bước ba',
      '',
      '- [ ] Việc chưa xong',
      '- [x] Việc đã xong',
      '',
      '> Trích dẫn',
      '',
      '```mermaid',
      'flowchart TD',
      '```',
      'Dòng một  ',
      'dòng hai',
    ].join('\n'),
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'heading', 'table', 'list', 'list', 'quote', 'code', 'paragraph'],
  );
  const table = blocks[2] as Extract<Block, { type: 'table' }>;
  assert.equal(table.rows.length, 1);
  assert.deepEqual(table.align, [undefined, 'center']);
  const ordered = blocks[3] as Extract<Block, { type: 'list' }>;
  assert.ok(ordered.ordered);
  assert.equal(ordered.items.length, 3);
  assert.equal(ordered.items[1].blocks[1].type, 'list');
  const tasks = blocks[4] as Extract<Block, { type: 'list' }>;
  assert.deepEqual(
    tasks.items.map((i) => i.checked),
    [false, true],
  );
  const code = blocks[6] as Extract<Block, { type: 'code' }>;
  assert.equal(code.lang, 'mermaid');
  assert.equal(code.text, 'flowchart TD');
  const para = blocks[7] as Extract<Block, { type: 'paragraph' }>;
  assert.ok(para.inlines.some((n) => n.type === 'break'));
});

test('the user guide splits into sections whose ids match its own table of contents', () => {
  const source = readFileSync(new URL('../../docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md', import.meta.url), 'utf8');
  const sections = splitSections(parseMarkdown(source));
  const ids = new Set(sections.map((s) => s.id));
  const anchors = [...source.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(anchors.length >= 20);
  for (const anchor of anchors) assert.ok(ids.has(anchor), 'missing anchor ' + anchor);
  assert.ok(sections.some((s) => s.subsections.length > 0));
  assert.ok(!/localhost:(3008|3001|8000)/.test(source));
  const subIds = new Set(sections.flatMap((s) => s.subsections.map((x) => x.id)));
  for (const anchor of Object.values(HELP_ANCHORS)) assert.ok(subIds.has(anchor), 'missing help anchor ' + anchor);
});
