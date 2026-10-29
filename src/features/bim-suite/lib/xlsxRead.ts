// Reads the first sheet of an .xlsx (Office Open XML, via JSZip) or a .csv file into rows of cells. Dates in .xlsx stay
// serial numbers (toIsoDate in planImport converts them). Replaces the cic-hud `xlsx` package reader.
import { parseCsv } from './csv';

export type SheetCell = string | number | boolean | null;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Text of every <t> in a fragment (rich-text runs are concatenated; phonetic runs are skipped). */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => decode(m[1]))
    .join('');

const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};

export async function readXlsxFirstSheet(data: ArrayBuffer | Uint8Array): Promise<SheetCell[][]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(data);
  const read = (path: string) => zip.file(path)?.async('string') ?? Promise.resolve(null);
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('Tệp không phải bảng tính Excel (.xlsx).');
  const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = (await read('xl/_rels/workbook.xml.rels')) ?? '';
  const target = relId
    ? (new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ??
      new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${relId}"`).exec(rels)?.[1])
    : undefined;
  const sheetPath = target
    ? target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`
    : 'xl/worksheets/sheet1.xml';
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('Không đọc được trang tính đầu tiên.');
  const shared = [...((await read('xl/sharedStrings.xml')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf(m[1]),
  );
  const rows: SheetCell[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1);
    const row: SheetCell[] = [];
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: SheetCell = null;
      if (type === 's') value = raw === undefined ? null : (shared[Number(raw)] ?? null);
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str' || type === 'e') value = raw === undefined ? null : decode(raw);
      else if (type === 'b') value = raw === '1';
      else if (raw !== undefined && raw !== '') value = Number.isFinite(Number(raw)) ? Number(raw) : decode(raw);
      row[ref ? columnIndex(ref) : row.length] = value;
    }
    rows[rowNumber - 1] = Array.from(row, (v) => v ?? null);
  }
  return Array.from(rows, (r) => r ?? []).filter((r) => r.some((v) => v !== null && v !== ''));
}

/** First sheet of an .xlsx, or the rows of a .csv file. */
export async function readFirstSheet(file: File): Promise<SheetCell[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  if (/\.xls$/i.test(file.name)) throw new Error('Định dạng .xls cũ chưa hỗ trợ; lưu lại dưới dạng .xlsx hoặc .csv.');
  return readXlsxFirstSheet(await file.arrayBuffer());
}
