// Word (.docx) building blocks for the BIM reports, generated in the browser with `docx` 9.9 (no file-saver).
// Adapted from cic-hud utils/docxHelpers (Vietnamese administrative layout per NĐ 30/2020: Times New Roman, 1.5 line
// spacing, 1.27 cm first-line indent) with BuildSIA branding in the title block and footer.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';

export const BRAND = 'BuildSIA';
export const FONT = 'Times New Roman';
/** Half-point sizes. */
export const SZ = { TITLE: 28, BODY: 26, TABLE: 22, NOTE: 22, FOOTER: 20 } as const;
const LINE_ONE_HALF = 360;
const INDENT_MM = 12.7;

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
export type DocBlock = Paragraph | Table;

export const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
} as const;

// docx 9 takes the portrait size and swaps width/height itself for a landscape section.
export const PORTRAIT_A4 = {
  page: {
    size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
    margin: {
      top: convertMillimetersToTwip(22),
      bottom: convertMillimetersToTwip(20),
      left: convertMillimetersToTwip(30),
      right: convertMillimetersToTwip(20),
    },
  },
};
export const LANDSCAPE_A4 = PORTRAIT_A4;

export interface ParagraphOptions {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  alignment?: Align;
  /** First-line indent in mm. */
  indent?: number;
  after?: number;
  before?: number;
  underline?: boolean;
  color?: string;
  lineSpacing?: number;
}

/** Single-run paragraph. */
export function p(text: string, opts: ParagraphOptions = {}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
        size: opts.size || SZ.BODY,
        font: FONT,
        color: opts.color,
      }),
    ],
    alignment: opts.alignment || AlignmentType.JUSTIFIED,
    indent: opts.indent ? { firstLine: convertMillimetersToTwip(opts.indent) } : undefined,
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: opts.lineSpacing ?? LINE_ONE_HALF },
  });
}

/** Empty spacer paragraph. */
export function pEmpty(after = 200): Paragraph {
  return new Paragraph({ spacing: { after, line: 240 }, children: [] });
}

/** Bold section heading ("I. THÔNG TIN MÔ HÌNH"). */
export function pHeading(text: string, opts: { alignment?: Align; before?: number; after?: number } = {}): Paragraph {
  return p(text, {
    bold: true,
    alignment: opts.alignment || AlignmentType.LEFT,
    indent: INDENT_MM,
    before: opts.before ?? 200,
    after: opts.after ?? 120,
  });
}

/** Table header cell with the BuildSIA tint. */
export function headerCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: SZ.TABLE, font: FONT })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
      }),
    ],
    borders: THIN_BORDER,
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.CLEAR, fill: 'E2F0EB' },
  });
}

/** Table data cell; line breaks in the text become separate paragraphs. */
export function dataCell(text: string, alignment: Align = AlignmentType.LEFT, bold = false): TableCell {
  return new TableCell({
    children: String(text ?? '')
      .split(/\r?\n/)
      .map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, size: SZ.TABLE, font: FONT, bold })],
            alignment,
            spacing: { before: 40, after: 40 },
          }),
      ),
    borders: THIN_BORDER,
    verticalAlign: VerticalAlign.TOP,
  });
}

/** Full-width table with a repeated header row; an empty body prints one "Không có dòng nào." row. */
export function simpleTable(headers: string[], rows: string[][], aligns?: Align[]): Table {
  const body = rows.length ? rows : [headers.map((_, i) => (i === 0 ? 'Không có dòng nào.' : ''))];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => headerCell(h)) }),
      ...body.map(
        (r) => new TableRow({ children: r.map((cell, i) => dataCell(cell, aligns?.[i] ?? AlignmentType.LEFT)) }),
      ),
    ],
  });
}

/** Brand line, document type (upper case) and subject, centred. */
export function buildTitleBlock(docType: string, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: `${BRAND} · Quản lý thông tin công trình (BIM)`,
          italics: true,
          size: SZ.NOTE,
          font: FONT,
          color: '555555',
        }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: docType.toUpperCase(), bold: true, size: SZ.TITLE, font: FONT })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60, before: 0 },
    }),
    new Paragraph({
      children: [new TextRun({ text: subtitle, bold: true, size: SZ.TITLE, font: FONT })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  ];
}

/** "BuildSIA · Trang 2/5" footer. */
export function buildPageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `${BRAND} · Trang `, size: SZ.FOOTER, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: SZ.FOOTER, font: FONT }),
          new TextRun({ text: '/', size: SZ.FOOTER, font: FONT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: SZ.FOOTER, font: FONT }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

/** One landscape A4 section with the page footer. */
export function buildDocument(
  children: DocBlock[],
  properties: typeof LANDSCAPE_A4 | typeof PORTRAIT_A4 = LANDSCAPE_A4,
): Document {
  return new Document({
    creator: BRAND,
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{ properties, footers: { default: buildPageFooter() }, children }],
  });
}

/** Keeps letters (Vietnamese included), digits, dot, dash and underscore; spaces become underscores. */
export const safeFileName = (name: string) =>
  name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 150) || 'Bao_cao';

/** Downloads a blob through an object URL (same approach as lib/csv.ts). */
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Packs the document and downloads it as .docx. */
export async function downloadDocx(doc: Document, fileName: string): Promise<void> {
  const blob = await Packer.toBlob(doc);
  downloadBlob(fileName.endsWith('.docx') ? fileName : `${fileName}.docx`, blob);
}

export { AlignmentType, Packer };
