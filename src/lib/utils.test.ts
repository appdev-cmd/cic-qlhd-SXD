import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime, formatCurrency, formatNumber } from './utils.ts';

test('formatDate returns dd/mm/yyyy and handles empty values', () => {
  assert.equal(formatDate('2026-09-28'), '28/09/2026');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(undefined), '—');
});

test('formatDateTime includes hours and minutes', () => {
  assert.match(formatDateTime('2026-09-28T08:05:00'), /^28\/09\/2026 08:05$/);
});

test('formatCurrency groups thousands', () => {
  assert.match(formatCurrency(1234567890), /1\.234\.567\.890/);
});

test('formatNumber uses Vietnamese grouping and handles empty values', () => {
  assert.equal(formatNumber(1234567.5), '1.234.567,5');
  assert.equal(formatNumber('42'), '42');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber('abc'), '—');
});
