/**
 * Last results of list/dashboard queries for instant back-navigation (stale-while-revalidate).
 * Keys must include the signed-in user id; everything is dropped on sign-out.
 */
const MAX_ENTRIES = 40;
const entries = new Map<string, unknown>();

export const listCache = {
  get<T>(key: string): T | undefined {
    return entries.get(key) as T | undefined;
  },
  set(key: string, value: unknown) {
    entries.delete(key);
    entries.set(key, value);
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  },
  clear() {
    entries.clear();
  },
};

if (typeof window !== 'undefined') window.addEventListener('appraisal:session-changed', () => listCache.clear());
