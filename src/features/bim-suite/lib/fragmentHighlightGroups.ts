import type { BufferGeometry } from 'three';

/**
 * Fragments 3.4.8 can emit the original visibility runs alongside highlight runs.
 * An opaque original underneath an alpha highlight makes X-Ray look solid.
 * Subtract only the highlighted ranges from the original draw groups; keep all
 * highlight groups and any original ranges that have not received an override.
 * Runs on geometry groups only, never changes IFC data, indices or materials.
 */
export function removeHighlightOverdraw(geometry: Pick<BufferGeometry, 'groups'>): void {
  const highlights = geometry.groups.filter((group) => (group.materialIndex ?? 0) >= 2);
  if (!highlights.length) return;
  const result: BufferGeometry['groups'] = [];
  let changed = false;
  for (const group of geometry.groups) {
    if ((group.materialIndex ?? 0) >= 2) {
      result.push(group);
      continue;
    }
    let ranges = [{ start: group.start, end: group.start + group.count }];
    for (const highlight of highlights) {
      const start = highlight.start,
        end = start + highlight.count;
      ranges = ranges.flatMap((range) => {
        if (end <= range.start || start >= range.end) return [range];
        changed = true;
        const remaining = [];
        if (start > range.start) remaining.push({ start: range.start, end: start });
        if (end < range.end) remaining.push({ start: end, end: range.end });
        return remaining;
      });
    }
    for (const range of ranges) result.push({ ...group, start: range.start, count: range.end - range.start });
  }
  if (changed) geometry.groups = result;
}
