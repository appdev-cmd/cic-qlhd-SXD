import { Decimal } from 'decimal.js';
import { FIELDS, REQUIREMENTS, uid, type CaseDocument } from './domain.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });
export const decimalScale = (value: string): number =>
  Math.max(0, (value.split(/[eE]/)[0].split('.')[1]?.length || 0) - Number(value.split(/[eE]/)[1] || 0));
export function decimalString(value: Decimal, scale = value.decimalPlaces()): string {
  const text = value.toFixed(scale);
  return value.isZero() && value.isNegative() && !text.startsWith('-') ? '-' + text : text;
}

export interface Fact {
  id: string;
  key: string;
  label: string;
  value: string;
  rawValue: string;
  unit: string;
  documentId: string;
  segmentId: string;
  locator: string;
  quote: string;
  method: string;
  reviewStatus: string;
  reviewedBy: string | null;
  reviewNote: string;
}
export function number(text: string): string | null {
  const match = text.match(/^\s*([+-]?[\d.,\s]+)/);
  if (!match) return null;
  let raw = match[1].trim().replaceAll(' ', '');
  if (raw.includes(',')) raw = raw.replaceAll('.', '').replaceAll(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replaceAll('.', '');
  try {
    const n = new Decimal(raw);
    return n.isFinite() && n.abs().lt('1e18') ? decimalString(n, decimalScale(raw)) : null;
  } catch {
    return null;
  }
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function extractFacts(document: CaseDocument): Fact[] {
  const result: Fact[] = [];
  for (const segment of document.segments) {
    const text = segment.text.normalize('NFC').trim();
    for (const [key, [label, unit]] of Object.entries(FIELDS)) {
      const match = text.match(new RegExp(escape(label) + '\\s*[:|]\\s*([^|;]+)', 'iu'));
      if (!match) continue;
      const raw = match[1].trim();
      const value = unit ? number(raw) : raw;
      if (value !== null)
        result.push({
          id: uid(),
          key,
          label,
          value,
          rawValue: raw,
          unit,
          documentId: document.id,
          segmentId: segment.id,
          locator: segment.locator,
          quote: text,
          method: 'label_parser',
          reviewStatus: 'pending',
          reviewedBy: null,
          reviewNote: '',
        });
    }
  }
  return result;
}
export function checklistCandidates(document: CaseDocument) {
  const candidates: Array<{
    id: string;
    requirementId: string;
    name: string;
    category: string;
    documentId: string;
    segmentId: string;
    locator: string;
    quote: string;
    accepted: boolean;
  }> = [];
  for (const [code, name, category] of REQUIREMENTS) {
    if (!code.startsWith('PL')) continue;
    const reference = name.match(/\d+[/-][\p{L}\p{N}_/-]+/u)?.[0];
    if (!reference) continue;
    const segment = document.segments.find((entry) => entry.text.toLowerCase().includes(reference.toLowerCase()));
    if (segment)
      candidates.push({
        id: uid(),
        requirementId: code,
        name,
        category,
        documentId: document.id,
        segmentId: segment.id,
        locator: segment.locator,
        quote: segment.text,
        accepted: false,
      });
  }
  let inSection = false;
  for (const segment of document.segments) {
    const text = segment.text.trim();
    if (/danh mục.*(?:gửi kèm|kèm theo)|hồ sơ.*(?:gửi kèm|trình thẩm định gồm)/iu.test(text)) {
      inSection = true;
      continue;
    }
    if (inSection && /^(?:III[.\s]|Nơi nhận|ĐẠI DIỆN)/iu.test(text)) break;
    if (inSection && text.length < 300 && /^(?:[-•]|\d+[.)]|PL\d+:)/u.test(text)) {
      if (
        candidates.some((entry) => entry.quote === text) ||
        /khảo sát|thiết kế cơ sở|thuyết minh|tổng mức|năng lực/iu.test(text)
      )
        continue;
      candidates.push({
        id: uid(),
        requirementId: 'ADD-' + uid().slice(0, 8),
        name: text.slice(0, 200),
        category: 'Theo tờ trình',
        documentId: document.id,
        segmentId: segment.id,
        locator: segment.locator,
        quote: text,
        accepted: false,
      });
    }
  }
  return candidates;
}
