import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckCircle2, FileDown, Loader2, Printer } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { A4, FONT_PT, formatAdminDate, type AdminDocument, type DocParagraph } from '../../lib/documents/model';

const CONTENT_WIDTH_MM = A4.widthMm - A4.marginLeftMm - A4.marginRightMm;
const CONTENT_HEIGHT_MM = A4.heightMm - A4.marginTopMm - A4.marginBottomMm;

const pt = (n: number) => `${n}pt`;

const PAGE_STYLE: CSSProperties = {
  width: `${A4.widthMm}mm`,
  height: `${A4.heightMm}mm`,
  maxHeight: `${A4.heightMm}mm`,
  paddingTop: `${A4.marginTopMm}mm`,
  paddingBottom: `${A4.marginBottomMm}mm`,
  paddingLeft: `${A4.marginLeftMm}mm`,
  paddingRight: `${A4.marginRightMm}mm`,
  boxSizing: 'border-box',
  overflow: 'hidden',
  fontFamily: '"Times New Roman", Times, serif',
  color: '#000',
  background: '#fff',
  position: 'relative',
};

function Runs({ para }: { para: DocParagraph }) {
  return (
    <>
      {para.runs.map((r, i) => (
        <span key={i} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined }}>
          {r.text}
        </span>
      ))}
    </>
  );
}

function HeaderBlock({ doc }: { doc: AdminDocument }) {
  const isLetter = doc.kind === 'yeu_cau_bo_sung';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', lineHeight: 1.15 }}>
      <div style={{ width: '42%', textAlign: 'center' }}>
        <div style={{ fontSize: pt(FONT_PT.agency), textTransform: 'uppercase' }}>{doc.agencyParent}</div>
        <div style={{ fontSize: pt(FONT_PT.agency), fontWeight: 700, textTransform: 'uppercase' }}>{doc.agency}</div>
        <div style={{ width: '30%', margin: '2pt auto 6pt', borderTop: '0.75pt solid #000' }} />
        <div style={{ fontSize: pt(FONT_PT.number) }}>Số: {doc.number}</div>
        {isLetter && <div style={{ fontSize: pt(12), marginTop: '4pt' }}>{doc.docType}</div>}
      </div>
      <div style={{ width: '56%', textAlign: 'center' }}>
        <div style={{ fontSize: pt(FONT_PT.nationalTitle), fontWeight: 700, whiteSpace: 'nowrap' }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div style={{ fontSize: pt(FONT_PT.motto), fontWeight: 700 }}>Độc lập - Tự do - Hạnh phúc</div>
        <div style={{ width: '62%', margin: '2pt auto 6pt', borderTop: '0.75pt solid #000' }} />
        <div style={{ fontSize: pt(FONT_PT.placeDate), fontStyle: 'italic' }}>{formatAdminDate(doc.place, doc.dateIso)}</div>
      </div>
    </div>
  );
}

function TitleBlock({ doc }: { doc: AdminDocument }) {
  if (doc.kind === 'yeu_cau_bo_sung') {
    return doc.recipient ? (
      <div style={{ textAlign: 'center', fontSize: pt(FONT_PT.body), marginTop: '12pt' }}>Kính gửi: {doc.recipient}.</div>
    ) : null;
  }
  return (
    <div style={{ textAlign: 'center', marginTop: '14pt', lineHeight: 1.2 }}>
      <div style={{ fontSize: pt(FONT_PT.docType), fontWeight: 700 }}>{doc.docType}</div>
      {doc.subject && <div style={{ fontSize: pt(FONT_PT.subject), fontWeight: 700, marginTop: '2pt' }}>{doc.subject}</div>}
      <div style={{ width: '30%', margin: '4pt auto 0', borderTop: '0.75pt solid #000' }} />
      {doc.recipient && <div style={{ fontSize: pt(FONT_PT.body), marginTop: '8pt' }}>Kính gửi: {doc.recipient}.</div>}
    </div>
  );
}

function ParagraphBlock({ para }: { para: DocParagraph }) {
  return (
    <p
      style={{
        fontSize: pt(FONT_PT.body),
        lineHeight: 1.3,
        textAlign: para.align ?? 'justify',
        textIndent: para.indent === false ? 0 : '1cm',
        margin: '0 0 6pt',
        fontWeight: para.heading ? 700 : undefined,
      }}
    >
      <Runs para={para} />
    </p>
  );
}

function SignatureBlock({ doc }: { doc: AdminDocument }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10pt' }}>
      <div style={{ width: '45%' }}>
        <div style={{ fontSize: pt(FONT_PT.recipientsLabel), fontWeight: 700, fontStyle: 'italic' }}>Nơi nhận:</div>
        {doc.recipients.map((r) => (
          <div key={r} style={{ fontSize: pt(FONT_PT.recipients), lineHeight: 1.2 }}>
            - {r}
          </div>
        ))}
      </div>
      <div style={{ width: '50%', textAlign: 'center', fontSize: pt(FONT_PT.signer), lineHeight: 1.2 }}>
        {doc.signer.authority && <div style={{ fontWeight: 700 }}>{doc.signer.authority}</div>}
        <div style={{ fontWeight: 700 }}>{doc.signer.title}</div>
        <div style={{ height: '26mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {doc.isSigned ? (
            <div style={{ border: '1pt solid #b91c1c', color: '#b91c1c', padding: '3pt 6pt', fontSize: pt(9), fontFamily: 'Arial, sans-serif' }}>
              <CheckCircle2 size={10} style={{ display: 'inline', marginRight: 3 }} />
              Ký số bởi: SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN
            </div>
          ) : (
            <span style={{ fontSize: pt(10), fontStyle: 'italic', color: '#888' }}>(Chờ ký số)</span>
          )}
        </div>
        <div style={{ fontWeight: 700 }}>{doc.signer.name}</div>
      </div>
    </div>
  );
}

function buildBlocks(doc: AdminDocument): ReactNode[] {
  return [
    <HeaderBlock key="header" doc={doc} />,
    <TitleBlock key="title" doc={doc} />,
    <div key="spacer" style={{ height: '10pt' }} />,
    ...doc.paragraphs.map((para, i) => <ParagraphBlock key={`p${i}`} para={para} />),
    <SignatureBlock key="sign" doc={doc} />,
  ];
}

/**
 * Xem trước văn bản trên khổ A4 cố định 210 × 297 mm (lề 30/20/22/20 mm), tự động chia trang —
 * không cắt mất nội dung. Số trang ở góc phải lề dưới, không hiển thị ở trang đầu (NĐ 30/2020).
 */
export function AdminDocumentView({
  doc,
  onExportDocx,
  isExporting,
}: {
  doc: AdminDocument;
  onExportDocx?: () => void;
  isExporting?: boolean;
}) {
  const blocks = buildBlocks(doc);
  const measureRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([blocks.map((_, i) => i)]);

  useLayoutEffect(() => {
    const container = measureRef.current;
    const mm = mmRef.current;
    if (!container || !mm) return;
    const pxPerMm = mm.getBoundingClientRect().height / 100;
    const pageHeightPx = CONTENT_HEIGHT_MM * pxPerMm;
    const heights = Array.from(container.children).map((el) => {
      const style = window.getComputedStyle(el);
      return (el as HTMLElement).getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    });

    const result: number[][] = [];
    let current: number[] = [];
    let used = 0;
    heights.forEach((h, i) => {
      if (current.length > 0 && used + h > pageHeightPx) {
        result.push(current);
        current = [];
        used = 0;
      }
      current.push(i);
      used += h;
    });
    if (current.length) result.push(current);
    setPages((prev) => (JSON.stringify(prev) === JSON.stringify(result) ? prev : result));
  }, [doc]);

  return (
    <div className="flex flex-col items-center gap-4 py-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-[210mm] px-4 py-2 rounded-xl bg-surface border border-border shadow-sm dark:bg-slate-900 dark:border-slate-800 print:hidden">
        <div className="flex items-center gap-2 text-xs">
          <span className={doc.isDraft ? 'w-2.5 h-2.5 rounded-full bg-amber-500' : 'w-2.5 h-2.5 rounded-full bg-emerald-500'} />
          <span className="font-semibold text-ink">
            {doc.isDraft ? 'Dự thảo' : 'Đã ban hành'} • A4 210×297 mm • {pages.length} trang
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="In hoặc lưu PDF (chọn “Lưu dưới dạng PDF” trong hộp thoại in)" placement="top">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-xs font-medium text-ink dark:bg-slate-800 dark:border-slate-700"
            >
              <Printer size={14} />
              In / Lưu PDF
            </button>
          </Tooltip>
          {onExportDocx && (
            <Tooltip content="Xuất file Word (.docx) đúng thể thức, khổ A4" placement="top">
              <button
                type="button"
                onClick={onExportDocx}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium shadow-sm disabled:opacity-60"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Xuất DOCX
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Vùng đo chiều cao (ẩn) — cùng độ rộng vùng nội dung trang */}
      <div aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: -10000, top: 0 }}>
        <div ref={mmRef} style={{ height: '100mm' }} />
        <div ref={measureRef} style={{ width: `${CONTENT_WIDTH_MM}mm`, fontFamily: '"Times New Roman", Times, serif' }}>
          {blocks}
        </div>
      </div>

      <div className="a4-print-root flex flex-col items-center gap-6">
        {pages.map((indices, pageIdx) => (
          <div key={pageIdx} className="a4-page shadow-2xl border border-slate-300" style={PAGE_STYLE}>
            {doc.isDraft && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '72pt',
                    fontWeight: 700,
                    color: 'rgba(185, 28, 28, 0.07)',
                    transform: 'rotate(-30deg)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  DỰ THẢO
                </span>
              </div>
            )}
            {indices.map((i) => blocks[i])}
            {pageIdx > 0 && (
              <div
                style={{
                  position: 'absolute',
                  right: `${A4.marginRightMm}mm`,
                  bottom: '8mm',
                  fontSize: pt(FONT_PT.pageNumber),
                }}
              >
                {pageIdx + 1}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
