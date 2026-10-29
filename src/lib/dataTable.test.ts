import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ariaSortFor,
  clampWidth,
  compareValues,
  fromStoredSort,
  hiddenAtViewport,
  keyboardResizeDelta,
  nextSort,
  redistributeWidths,
  resolveWidth,
  rowNumber,
  skeletonWidth,
  sortRows,
  toStoredSort,
  toggleHidden,
} from './dataTable.ts';

test('compareValues orders numbers numerically, text with Vietnamese collation, empties last', () => {
  assert.ok(compareValues(2, 10) < 0);
  assert.ok(compareValues('HS-2', 'HS-10') < 0);
  assert.ok(compareValues('Điện Biên', 'Lai Châu') < 0);
  assert.ok(compareValues(null, 'a') > 0);
  assert.ok(compareValues('a', undefined) < 0);
  assert.equal(compareValues('', null), 0);
  assert.ok(compareValues(new Date('2026-01-01'), new Date('2026-02-01')) < 0);
});

test('sortRows is stable and keeps empty values at the end in both directions', () => {
  const rows = [
    { id: 'a', v: 3 },
    { id: 'b', v: null },
    { id: 'c', v: 1 },
    { id: 'd', v: 3 },
  ];
  const ids = (list: typeof rows) => list.map((r) => r.id).join('');
  assert.equal(ids(sortRows(rows, (r) => r.v, 'asc')), 'cadb');
  assert.equal(ids(sortRows(rows, (r) => r.v, 'desc')), 'adcb');
  assert.equal(ids(sortRows(rows, undefined, 'asc')), 'abcd');
  assert.equal(ids(rows), 'abcd', 'input is not mutated');
});

test('nextSort starts ascending and flips the active column', () => {
  assert.deepEqual(nextSort(null, 'name'), { columnId: 'name', direction: 'asc' });
  assert.deepEqual(nextSort({ columnId: 'name', direction: 'asc' }, 'name'), { columnId: 'name', direction: 'desc' });
  assert.deepEqual(nextSort({ columnId: 'name', direction: 'desc' }, 'name'), { columnId: 'name', direction: 'asc' });
  assert.deepEqual(nextSort({ columnId: 'name', direction: 'desc' }, 'code'), { columnId: 'code', direction: 'asc' });
});

test('ariaSortFor reports the header state', () => {
  assert.equal(ariaSortFor(null, 'a'), 'none');
  assert.equal(ariaSortFor({ columnId: 'a', direction: 'asc' }, 'a'), 'ascending');
  assert.equal(ariaSortFor({ columnId: 'a', direction: 'desc' }, 'a'), 'descending');
  assert.equal(ariaSortFor({ columnId: 'b', direction: 'desc' }, 'a'), 'none');
});

test('stored sort round-trips with the legacy { column, descending } shape', () => {
  assert.deepEqual(fromStoredSort({ column: 2, descending: true }), { columnId: '2', direction: 'desc' });
  assert.deepEqual(toStoredSort({ columnId: '2', direction: 'desc' }), { column: 2, descending: true });
  assert.deepEqual(toStoredSort({ columnId: 'name', direction: 'asc' }), { column: 'name', descending: false });
  assert.equal(fromStoredSort(null), null);
});

test('resolveWidth and clampWidth convert declared widths', () => {
  assert.equal(resolveWidth(140), 140);
  assert.equal(resolveWidth('13%'), 130);
  assert.equal(resolveWidth('8%'), 120);
  assert.equal(resolveWidth('90px'), 90);
  assert.equal(resolveWidth('10rem'), 160);
  assert.equal(resolveWidth(undefined, 200), 200);
  assert.equal(resolveWidth('auto', 150), 150);
  assert.equal(clampWidth(20, 60), 60);
  assert.equal(clampWidth(5000), 1200);
});

test('keyboardResizeDelta maps arrow keys, Shift for large steps', () => {
  assert.equal(keyboardResizeDelta('ArrowRight'), 16);
  assert.equal(keyboardResizeDelta('ArrowLeft'), -16);
  assert.equal(keyboardResizeDelta('ArrowRight', true), 64);
  assert.equal(keyboardResizeDelta('Enter'), null);
});

test('redistributeWidths keeps total width and respects the minimum', () => {
  const next = redistributeWidths([200, 200, 100], 0, 50);
  assert.deepEqual(next, [250, 150, 100]);
  const clamped = redistributeWidths([200, 200, 100], 0, 500, 80);
  assert.deepEqual(clamped, [320, 80, 100]);
  assert.equal(
    clamped.reduce((a, b) => a + b, 0),
    500,
  );
  assert.deepEqual(redistributeWidths([100, 100], 1, 30), [100, 100], 'last column has no neighbour');
});

test('hiddenAtViewport hides secondary columns below the breakpoint', () => {
  assert.equal(hiddenAtViewport('lg', 800), true);
  assert.equal(hiddenAtViewport('lg', 1024), false);
  assert.equal(hiddenAtViewport(undefined, 320), false);
});

test('toggleHidden never hides the last visible column', () => {
  assert.deepEqual(toggleHidden([], 'a', ['a', 'b']), ['a']);
  assert.deepEqual(toggleHidden(['a'], 'b', ['a', 'b']), ['a']);
  assert.deepEqual(toggleHidden(['a'], 'a', ['a', 'b']), []);
});

test('rowNumber continues across pages', () => {
  assert.equal(rowNumber(0, 0), 1);
  assert.equal(rowNumber(50, 0), 51);
  assert.equal(rowNumber(100, 9), 110);
  assert.equal(rowNumber(undefined, 4), 5);
  assert.equal(rowNumber(-3, 0), 1);
});

test('skeletonWidth is deterministic and bounded', () => {
  assert.equal(skeletonWidth(1, 2), skeletonWidth(1, 2));
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 8; c++) {
      const width = skeletonWidth(r, c);
      assert.ok(width >= 40 && width < 90);
    }
});
