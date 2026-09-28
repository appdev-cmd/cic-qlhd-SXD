import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSmartSearch, removeVietnameseTones } from './smartSearch.ts';

test('removes tones for precomposed and combining forms', () => {
  assert.equal(removeVietnameseTones('Điện Biên'), 'dien bien');
  assert.equal(removeVietnameseTones('Tru\u031Bo\u031B\u0300ng'), 'truong');
});

test('matches without tones and with abbreviations', () => {
  const text = 'Sở Xây dựng tỉnh Điện Biên — Thẩm định BCNCKT';
  assert.ok(matchesSmartSearch(text, 'dien bien'));
  assert.ok(matchesSmartSearch(text, 'sxd'));
  assert.ok(matchesSmartSearch(text, 'sxd db'));
  assert.ok(matchesSmartSearch(text, ''));
});

test('every query word must match, abbreviations do not swallow other words', () => {
  const text = 'Sở Xây dựng tỉnh Điện Biên';
  assert.equal(matchesSmartSearch(text, 'sxd lai chau'), false);
  assert.equal(matchesSmartSearch('', 'sxd'), false);
});
