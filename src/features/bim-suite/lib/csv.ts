// CSV export and import for BIM tables (UTF-8 with BOM so Excel opens Vietnamese text correctly). Replaces the
// cic-hud exceljs/xlsx exports; .xlsx files are read by lib/xlsxRead.ts.

export type CsvCell = string | number | boolean | null | undefined;

const quote = (value: CsvCell) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A leading = + - @ would be run as a formula by spreadsheet programs.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: CsvCell[][]) => '﻿' + rows.map((row) => row.map(quote).join(',')).join('\r\n');

export function downloadCsv(fileName: string, rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Parses CSV (comma or semicolon, quoted fields, CRLF); numbers stay text. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
