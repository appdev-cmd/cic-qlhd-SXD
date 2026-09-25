/**
 * Xuất dữ liệu bảng ra CSV UTF-8 (có BOM) — mở trực tiếp bằng Excel, giữ nguyên tiếng Việt.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  return lines.join('\r\n');
}

export function downloadCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]) {
  const blob = new Blob(['﻿', toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
