import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentPath, galleryImageDate, nextAfterRemoval, stepIndex } from './galleryUtils';

test('gallery dates accept ISO and legacy d/m/yyyy values', () => {
  assert.equal(galleryImageDate('2026-10-05'), '05/10/2026');
  assert.equal(galleryImageDate('5/10/2026'), '05/10/2026');
});

test('lightbox steps wrap around both ends', () => {
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(1, 1, 3), 2);
  assert.equal(stepIndex(0, 1, 0), -1);
});

test('stored originals are fetched through the worker-relative path', () => {
  assert.equal(contentPath('/api/appraisal/projects/p/images/i/content'), '/projects/p/images/i/content');
  assert.equal(contentPath('https://example.com/a.png'), 'https://example.com/a.png');
});

test('removing the open image moves to the next, then the previous, then closes', () => {
  assert.equal(nextAfterRemoval(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(nextAfterRemoval(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(nextAfterRemoval(['a'], 'a'), null);
  assert.equal(nextAfterRemoval(['a'], 'x'), null);
});
