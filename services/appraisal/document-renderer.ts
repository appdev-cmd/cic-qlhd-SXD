import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Footer,
  PageNumber,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Block {
  heading?: string;
  text?: string[];
  rows?: string[][];
  keepTogether?: boolean;
  letterhead?: boolean;
  nationalOnly?: boolean;
  agency?: string;
}
const mm = (value: number) => (value * 72) / 25.4;
const twips = (value: number) => Math.round((value * 1440) / 25.4);
export const A4 = { width: mm(210), height: mm(297), left: mm(30), right: mm(20), top: mm(22), bottom: mm(20) };
function fontPaths() {
  const custom = process.env.APPRAISAL_FONT_DIR;
  if (custom && existsSync(resolve(custom, 'times.ttf')) && existsSync(resolve(custom, 'timesbd.ttf')))
    return [resolve(custom, 'times.ttf'), resolve(custom, 'timesbd.ttf')];
  const root = resolve(process.cwd(), 'services/appraisal/assets/fonts');
  return [resolve(root, 'LiberationSerif-Regular.ttf'), resolve(root, 'LiberationSerif-Bold.ttf')];
}
export async function documentBytes(
  title: string,
  blocks: Block[],
  format: 'pdf' | 'docx' = 'pdf',
  _sample = true,
): Promise<Buffer> {
  if (format === 'docx') return docxBytes(title, blocks);
  return pdfBytes(title, blocks);
}
function paragraph(text: string, options: { bold?: boolean; size?: number; center?: boolean; keep?: boolean } = {}) {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    keepNext: options.keep,
    spacing: { after: 120 },
    children: [
      new TextRun({ text, font: 'Times New Roman', size: options.size || 26, bold: options.bold, color: '000000' }),
    ],
  });
}
async function docxBytes(title: string, blocks: Block[]): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];
  if (blocks[0]?.nationalOnly)
    children.push(
      paragraph('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc', {
        center: true,
        bold: true,
        keep: true,
      }),
    );
  else if (blocks[0]?.letterhead)
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: twips(66), type: WidthType.DXA },
                children: [paragraph((blocks[0].agency || '') + '\nSố: [chưa cấp]', { center: true, size: 24 })],
              }),
              new TableCell({
                width: { size: twips(94), type: WidthType.DXA },
                children: [
                  paragraph(
                    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n[Địa danh, ngày ban hành chưa xác nhận]',
                    { center: true, size: 24 },
                  ),
                ],
              }),
            ],
          }),
        ],
        borders: Object.fromEntries(
          ['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((key) => [
            key,
            { style: BorderStyle.NONE, size: 0 },
          ]),
        ),
      }),
    );
  children.push(
    paragraph(title, {
      bold: true,
      size: blocks[0]?.letterhead ? 28 : 34,
      center: Boolean(blocks[0]?.letterhead),
      keep: true,
    }),
  );
  for (const block of blocks) {
    if (block.heading) children.push(paragraph(block.heading, { bold: true, keep: true }));
    (block.text || []).forEach((text, i) =>
      children.push(paragraph(String(text), { keep: Boolean(block.keepTogether && i < block.text!.length - 1) })),
    );
    if (block.rows?.length)
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, i) =>
              new TableRow({
                tableHeader: i === 0,
                cantSplit: true,
                children: row.map(
                  (text) =>
                    new TableCell({
                      width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
                      shading: i === 0 ? { fill: 'E8EDF3' } : undefined,
                      children: [paragraph(String(text), { size: 20 })],
                    }),
                ),
              }),
          ),
          borders: Object.fromEntries(
            ['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((key) => [
              key,
              { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
            ]),
          ),
        }),
      );
  }
  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 26, color: '000000' },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(210), height: twips(297) },
            margin: { left: twips(30), right: twips(20), top: twips(22), bottom: twips(20) },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Trang ', font: 'Times New Roman', size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 18 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
function pdfBytes(title: string, blocks: Block[]): Promise<Buffer> {
  return new Promise((resolveBuffer, reject) => {
    const doc = new PDFDocument({
      size: [A4.width, A4.height],
      margins: { left: A4.left, right: A4.right, top: A4.top, bottom: A4.bottom },
      bufferPages: true,
      info: { Title: title, Producer: 'BuildAppraisal Node' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.once('end', () => resolveBuffer(Buffer.concat(chunks)));
    doc.once('error', reject);
    try {
      const [regular, bold] = fontPaths();
      doc.registerFont('AppraisalSerif', readFileSync(regular));
      doc.registerFont('AppraisalSerifBold', readFileSync(bold));
      const width = A4.width - A4.left - A4.right;
      const bottom = A4.height - A4.bottom;
      const text = (value: string, size = 13, heavy = false, center = false, keep = false) => {
        doc.font(heavy ? 'AppraisalSerifBold' : 'AppraisalSerif').fontSize(size);
        const height = doc.heightOfString(value, { width, lineGap: 3 });
        if (keep && doc.y + Math.min(height, 60) + 25 > bottom) doc.addPage();
        doc.text(value, A4.left, doc.y, { width, align: center ? 'center' : 'left', lineGap: 3 });
        doc.moveDown(0.35);
      };
      if (blocks[0]?.nationalOnly)
        text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc', 12, true, true, true);
      else if (blocks[0]?.letterhead) {
        doc.font('AppraisalSerif').fontSize(12);
        const y = doc.y;
        const agency = (blocks[0].agency || '') + '\nSố: [chưa cấp]';
        const nation =
          'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n[Địa danh, ngày ban hành chưa xác nhận]';
        const leftWidth = mm(66);
        const rightWidth = mm(94);
        const h = Math.max(
          doc.heightOfString(agency, { width: leftWidth }),
          doc.heightOfString(nation, { width: rightWidth }),
        );
        doc.text(agency, A4.left, y, { width: leftWidth, align: 'center' });
        doc.text(nation, A4.left + leftWidth, y, { width: rightWidth, align: 'center' });
        doc.y = y + h + 12;
      }
      text(title, blocks[0]?.letterhead ? 14 : 17, true, Boolean(blocks[0]?.letterhead), true);
      const linesFor = (value: string, cellWidth: number) => {
        const lines: string[] = [];
        doc.font('AppraisalSerif').fontSize(9);
        for (const paragraph of String(value).split(/\r?\n/)) {
          let line = '';
          for (const word of paragraph.split(/\s+/)) {
            const candidate = line ? line + ' ' + word : word;
            if (doc.widthOfString(candidate) <= cellWidth) {
              line = candidate;
              continue;
            }
            if (line) lines.push(line);
            line = '';
            for (const char of word) {
              if (doc.widthOfString(line + char) > cellWidth && line) {
                lines.push(line);
                line = '';
              }
              line += char;
            }
          }
          lines.push(line);
        }
        return lines;
      };
      const table = (rows: string[][]) => {
        const columns = rows[0].length;
        const cell = width / columns;
        const header = rows[0].map((value) => linesFor(value, cell - 12));
        const draw = (parts: string[][], start: number, count: number, heading: boolean) => {
          const y = doc.y;
          const height = count * 12 + 10;
          for (let column = 0; column < columns; column++) {
            const x = A4.left + column * cell;
            if (heading) doc.rect(x, y, cell, height).fill('#E8EDF3');
            doc.rect(x, y, cell, height).lineWidth(0.4).stroke('#D9D9D9');
            doc.fillColor('black').font('AppraisalSerif').fontSize(9);
            for (let line = 0; line < count; line++)
              doc.text(parts[column]?.[start + line] || '', x + 6, y + 5 + line * 12, { lineBreak: false });
          }
          doc.y = y + height;
          doc.x = A4.left;
        };
        const headerCount = Math.max(...header.map((lines) => lines.length));
        const headerHeight = headerCount * 12 + 10;
        if (doc.y + headerHeight + 22 > bottom) doc.addPage();
        draw(header, 0, headerCount, true);
        for (const row of rows.slice(1)) {
          const parts = row.map((value) => linesFor(value, cell - 12));
          const total = Math.max(...parts.map((lines) => lines.length));
          let start = 0;
          if (total * 12 + 10 <= bottom - A4.top - headerHeight && doc.y + total * 12 + 10 > bottom) {
            doc.addPage();
            draw(header, 0, headerCount, true);
          }
          while (start < total) {
            let available = Math.floor((bottom - doc.y - 10) / 12);
            if (available < 1) {
              doc.addPage();
              draw(header, 0, headerCount, true);
              available = Math.floor((bottom - doc.y - 10) / 12);
            }
            const count = Math.min(available, total - start);
            draw(parts, start, count, false);
            start += count;
          }
        }
        doc.y += 8;
      };
      for (const block of blocks) {
        if (block.heading) text(block.heading, 13, true, false, true);
        for (let i = 0; i < (block.text || []).length; i++)
          text(String(block.text![i]), 13, false, false, Boolean(block.keepTogether && i < block.text!.length - 1));
        if (block.rows?.length) table(block.rows);
      }
      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        doc.font('AppraisalSerif').fontSize(9).fillColor('black');
        const label = 'Trang ' + (i + 1);
        doc.text(label, A4.width - A4.right - doc.widthOfString(label), A4.height - mm(12), { lineBreak: false });
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
