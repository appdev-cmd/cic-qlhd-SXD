/**
 * Xuất văn bản hành chính ra DOCX: khổ A4, lề 30/20/22/20 mm, Times New Roman,
 * cỡ chữ theo NĐ 30/2020/NĐ-CP, số trang góc phải lề dưới (không hiển thị ở trang đầu).
 * Thư viện `docx` được tải động khi người dùng bấm xuất (không nằm trong bundle chính).
 */
import { A4, FONT_PT, formatAdminDate, type AdminDocument, type DocParagraph } from './model';

const MM_TO_TWIP = 56.6929;
const twip = (mm: number) => Math.round(mm * MM_TO_TWIP);
const half = (ptSize: number) => Math.round(ptSize * 2);
const FONT = 'Times New Roman';

export async function buildDocxBlob(doc: AdminDocument): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = d;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const run = (text: string, size: number, opts: { bold?: boolean; italics?: boolean; allCaps?: boolean } = {}) =>
    new TextRun({ text, font: FONT, size: half(size), ...opts });

  const center = (children: InstanceType<typeof TextRun>[], after = 0) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children });

  /** Đường gạch ngang ngắn dưới tên cơ quan / tiêu ngữ */
  const rule = (widthChars: number) => center([run('_'.repeat(widthChars), 8)], 60);

  const isLetter = doc.kind === 'yeu_cau_bo_sung';

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 42, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              center([run(doc.agencyParent, FONT_PT.agency)]),
              center([run(doc.agency, FONT_PT.agency, { bold: true })]),
              rule(12),
              center([run(`Số: ${doc.number}`, FONT_PT.number)]),
              ...(isLetter ? [center([run(doc.docType, 12)])] : []),
            ],
          }),
          new TableCell({
            width: { size: 58, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              center([run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', FONT_PT.nationalTitle, { bold: true })]),
              center([run('Độc lập - Tự do - Hạnh phúc', FONT_PT.motto, { bold: true })]),
              rule(22),
              center([run(formatAdminDate(doc.place, doc.dateIso), FONT_PT.placeDate, { italics: true })]),
            ],
          }),
        ],
      }),
    ],
  });

  const title: InstanceType<typeof Paragraph>[] = isLetter
    ? doc.recipient
      ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [run(`Kính gửi: ${doc.recipient}.`, FONT_PT.body)] })]
      : []
    : [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 280 }, children: [run(doc.docType, FONT_PT.docType, { bold: true })] }),
        ...(doc.subject ? [center([run(doc.subject, FONT_PT.subject, { bold: true })])] : []),
        rule(12),
        ...(doc.recipient
          ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 }, children: [run(`Kính gửi: ${doc.recipient}.`, FONT_PT.body)] })]
          : []),
      ];

  const bodyParagraph = (para: DocParagraph) =>
    new Paragraph({
      alignment:
        para.align === 'center' ? AlignmentType.CENTER : para.align === 'left' ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
      indent: para.indent === false ? undefined : { firstLine: twip(10) },
      spacing: { after: 120, line: 312 },
      children: para.runs.map((r) => run(r.text, FONT_PT.body, { bold: r.bold || para.heading, italics: r.italic })),
    });

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 48, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              new Paragraph({ children: [run('Nơi nhận:', FONT_PT.recipientsLabel, { bold: true, italics: true })] }),
              ...doc.recipients.map((r) => new Paragraph({ children: [run(`- ${r}`, FONT_PT.recipients)] })),
            ],
          }),
          new TableCell({
            width: { size: 52, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              ...(doc.signer.authority ? [center([run(doc.signer.authority, FONT_PT.signer, { bold: true })])] : []),
              center([run(doc.signer.title, FONT_PT.signer, { bold: true })]),
              new Paragraph({ spacing: { before: 1200 }, children: [] }),
              center([run(doc.signer.name, FONT_PT.signer, { bold: true })]),
            ],
          }),
        ],
      }),
    ],
  });

  const pageNumberFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: half(FONT_PT.pageNumber) })],
      }),
    ],
  });

  const document = new Document({
    creator: 'BuildAppraisal AI — Sở Xây dựng tỉnh Điện Biên',
    title: `${doc.docType} ${doc.number}`,
    styles: { default: { document: { run: { font: FONT, size: half(FONT_PT.body) } } } },
    sections: [
      {
        properties: {
          titlePage: true, // trang đầu không hiển thị số trang
          page: {
            size: { width: twip(A4.widthMm), height: twip(A4.heightMm) },
            margin: {
              top: twip(A4.marginTopMm),
              bottom: twip(A4.marginBottomMm),
              left: twip(A4.marginLeftMm),
              right: twip(A4.marginRightMm),
            },
          },
        },
        footers: { default: pageNumberFooter, first: new Footer({ children: [] }) },
        children: [headerTable, ...title, ...doc.paragraphs.map(bodyParagraph), signatureTable],
      },
    ],
  });

  return Packer.toBlob(document);
}

export async function downloadDocx(doc: AdminDocument, fileName: string) {
  const blob = await buildDocxBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
