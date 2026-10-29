import { formatDate } from '../../lib/utils';

/** Gallery dates are ISO (yyyy-mm-dd); older seed images still carry d/m/yyyy. */
export function galleryImageDate(value: string) {
  const legacy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return formatDate(legacy ? `${legacy[3]}-${legacy[2].padStart(2, '0')}-${legacy[1].padStart(2, '0')}` : value);
}

/** Wrap-around step used by the lightbox arrows and ←/→ keys. */
export function stepIndex(index: number, delta: number, length: number) {
  if (length <= 0) return -1;
  return (((index + delta) % length) + length) % length;
}

/** Worker-relative path of a stored original (apiRequest/appraisalService add the /api/appraisal prefix). */
export function contentPath(url: string) {
  return url.replace(/^\/api\/appraisal/, '');
}

/** Image to show after `removedId` disappears from the lightbox list: the next one, else the previous, else none. */
export function nextAfterRemoval(ids: string[], removedId: string): string | null {
  const index = ids.indexOf(removedId);
  if (index < 0) return null;
  const rest = ids.filter((id) => id !== removedId);
  if (!rest.length) return null;
  return rest[Math.min(index, rest.length - 1)];
}
