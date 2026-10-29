import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { DocumentSegment } from './domain.js';
import { uid } from './domain.js';
import { HttpError } from './errors.js';
import { pageText, type OcrGenerator, type OcrPage } from './ocr.js';

export const MAX_BYTES = 18 * 1024 * 1024;
let pdfRuntime: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | undefined;
function nativePdf() {
  return (pdfRuntime ||= (async () => {
    // Explicit imports let Vercel trace the optional native shims and the otherwise dynamic worker.
    const canvas = await import('@napi-rs/canvas');
    for (const key of ['DOMMatrix', 'ImageData', 'Path2D'] as const) {
      if (!(key in globalThis)) Object.defineProperty(globalThis, key, { value: canvas[key], configurable: true });
    }
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    Object.defineProperty(globalThis, 'pdfjsWorker', { value: worker, configurable: true });
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })());
}
export interface DocumentReadResult {
  segments: DocumentSegment[];
  warnings: string[];
  signature: 'not_checked' | 'not_detected' | 'present_unverified';
  ocrProvenance: OcrPage['provenance'][];
}
export interface ReadOptions {
  ocrLimit?: number;
  signal?: AbortSignal;
  beforePage?: (page: number, total: number) => Promise<void> | void;
  generator?: OcrGenerator;
}

/** Check central-directory sizes BEFORE decompression (JSZip alone does not bound expansion). */
function validateZip(bytes: Buffer): void {
  const minimum = Math.max(0, bytes.length - 65_557);
  let end = -1;
  for (let i = bytes.length - 22; i >= minimum; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new HttpError(422, 'DOCX không phải gói ZIP hợp lệ.');
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || cursor + size > end) {
    throw new HttpError(422, 'Gói DOCX nhiều ổ đĩa hoặc ZIP64 không được hỗ trợ.');
  }
  const boundary = cursor + size;
  let expanded = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > boundary || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new HttpError(422, 'Danh mục DOCX không hợp lệ.');
    const flags = bytes.readUInt16LE(cursor + 8);
    const declared = bytes.readUInt32LE(cursor + 24);
    expanded += declared;
    if (flags & 1 || expanded > 60 * 1024 * 1024) throw new HttpError(422, 'DOCX có mật khẩu hoặc giải nén quá lớn.');
    const local = bytes.readUInt32LE(cursor + 42);
    const packed = bytes.readUInt32LE(cursor + 20);
    const method = bytes.readUInt16LE(cursor + 10);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) {
      throw new HttpError(422, 'Phần tệp DOCX không hợp lệ.');
    }
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + packed > bytes.length || ![0, 8].includes(method)) throw new HttpError(422, 'Nén DOCX không hợp lệ.');
    try {
      const content = bytes.subarray(start, start + packed);
      const actual = method === 8 ? inflateRawSync(content, { maxOutputLength: Math.max(1, declared) }) : content;
      if (actual.length !== declared) throw new Error('ZIP entry size mismatch');
    } catch {
      throw new HttpError(422, 'Kích thước giải nén DOCX không khớp khai báo.');
    }
    cursor += 46 + bytes.readUInt16LE(cursor + 28) + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    if (cursor > boundary) throw new HttpError(422, 'Danh mục DOCX không hợp lệ.');
  }
  if (cursor !== boundary) throw new HttpError(422, 'Danh mục DOCX không khớp kích thước.');
}

type XmlNode = Record<string, unknown>;
function nodes(value: unknown): XmlNode[] {
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}
function children(node: XmlNode, key: string): XmlNode[] {
  return nodes(node[key]);
}
function collectText(list: XmlNode[]): string {
  let result = '';
  for (const node of list) {
    if ('#text' in node) result += String(node['#text']);
    else
      for (const [key, value] of Object.entries(node)) {
        if (key === 'w:tab') result += '\t';
        else if (key === 'w:br') result += '\n';
        else if (key !== ':@') result += collectText(nodes(value));
      }
  }
  return result;
}

export async function readDocument(
  filename: string,
  data: Uint8Array,
  options: ReadOptions = {},
): Promise<DocumentReadResult> {
  if (!data.length || data.length > MAX_BYTES) throw new HttpError(422, 'Tệp phải có dữ liệu và nhỏ hơn 18 MB.');
  const bytes = Buffer.from(data);
  const result: DocumentReadResult = { segments: [], warnings: [], signature: 'not_checked', ocrProvenance: [] };
  const append = (text: string, page: number | null, locator: (line: number) => string) => {
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.trim()) result.segments.push({ id: uid(), locator: locator(i + 1), page, text: line.trim() });
    });
  };
  options.signal?.throwIfAborted();
  switch (extname(filename).toLowerCase()) {
    case '.pdf': {
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF')))
        throw new HttpError(422, 'Nội dung không phải PDF hợp lệ.');
      if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF')))
        result.warnings.push('PDF có phần đầu bất thường; chỉ đọc phục hồi, giữ nguyên bản.');
      const { getDocument } = await nativePdf();
      const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, stopAtErrors: false });
      try {
        const document = await task.promise;
        if (document.numPages > 300) throw new HttpError(422, 'Giới hạn 300 trang mỗi tệp. Hãy chia theo bộ hồ sơ.');
        const fields = await document.getFieldObjects();
        result.signature =
          fields &&
          Object.values(fields)
            .flat()
            .some((field) => field.type === 'Sig')
            ? 'present_unverified'
            : 'not_detected';
        let ocrCount = 0;
        for (let pageIndex = 0; pageIndex < document.numPages; pageIndex++) {
          options.signal?.throwIfAborted();
          await options.beforePage?.(pageIndex + 1, document.numPages);
          const page = await document.getPage(pageIndex + 1);
          const content = await page.getTextContent();
          let text = '';
          for (const item of content.items) {
            if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
          }
          let usedOcr = false;
          if (text.trim().length < 20 && ocrCount < (options.ocrLimit ?? 0)) {
            ocrCount++;
            try {
              const ocr = await pageText(bytes, pageIndex, options);
              text = ocr.text;
              usedOcr = Boolean(text.trim());
              result.warnings.push(...ocr.warnings);
              result.ocrProvenance.push(ocr.provenance);
            } catch (error) {
              options.signal?.throwIfAborted();
              if ((error as Error)?.name === 'InterruptedError') throw error;
              result.warnings.push(`Trang ${pageIndex + 1} AI OCR không thành công; cần đọc lại.`);
            }
          }
          if (text.trim().length < 20)
            result.warnings.push(`Trang ${pageIndex + 1} cần OCR hoặc bản PDF có lớp chữ; chưa đọc đủ.`);
          append(text, pageIndex + 1, (line) => `Trang ${pageIndex + 1}, dòng ${line}${usedOcr ? ' (OCR)' : ''}`);
          page.cleanup();
        }
      } catch (error) {
        if (error instanceof HttpError || options.signal?.aborted || (error as Error)?.name === 'InterruptedError')
          throw error;
        console.warn('PDF read failed', {
          errorType: (error as Error)?.name,
          workerUnavailable: /worker/i.test(String(error)),
        });
        throw new HttpError(422, 'PDF không hợp lệ hoặc có mật khẩu. Cần bản cho phép đọc.');
      } finally {
        await task.destroy();
      }
      break;
    }
    case '.docx': {
      validateZip(bytes);
      const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
      const file = zip.file('word/document.xml');
      if (!file) throw new HttpError(422, 'DOCX thiếu nội dung tài liệu.');
      const xml = await file.async('string');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
        throw new HttpError(422, 'XML trong DOCX không hợp lệ.');
      const parsed = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: true,
        parseTagValue: false,
        trimValues: false,
      }).parse(xml) as XmlNode[];
      const document = parsed.find((node) => 'w:document' in node);
      const body = document && children(document, 'w:document').find((node) => 'w:body' in node);
      children(body || {}, 'w:body').forEach((block, i) => {
        if ('w:p' in block) append(collectText(children(block, 'w:p')), null, (line) => `Khối ${i + 1}, dòng ${line}`);
        if ('w:tbl' in block) {
          const lines = children(block, 'w:tbl')
            .filter((node) => 'w:tr' in node)
            .map((row) =>
              children(row, 'w:tr')
                .filter((node) => 'w:tc' in node)
                .map((cell) => collectText(children(cell, 'w:tc')))
                .join(' | '),
            );
          append(lines.join('\n'), null, (line) => `Khối ${i + 1}, dòng ${line}`);
        }
      });
      break;
    }
    case '.txt': {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new HttpError(422, 'TXT cần mã hóa UTF-8.');
      }
      append(text, null, (line) => `Dòng ${line}`);
      break;
    }
    default:
      throw new HttpError(422, 'Hỗ trợ PDF, DOCX và TXT UTF-8. Bảng chi phí có thể nộp trong DOCX/PDF.');
  }
  if (result.segments.reduce((n, segment) => n + segment.text.length, 0) > 1_500_000)
    throw new HttpError(422, 'Nội dung vượt giới hạn xử lý mỗi tệp.');
  return result;
}
