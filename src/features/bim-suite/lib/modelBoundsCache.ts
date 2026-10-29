// features/bim/lib/modelBoundsCache.ts
// Ghi nhớ khung bao của mô hình đã từng nạp (theo phiên bản tệp) để lần sau ưu tiên nạp trước
// những mô hình nằm trong khung nhìn hiện tại. Mô hình chưa từng nạp giữ thứ tự gốc.

export type Vec3 = [number, number, number];
export interface CachedBounds {
  min: Vec3;
  max: Vec3;
}

const STORAGE_KEY = 'bim-model-bounds-v1';
const MAX_ENTRIES = 200;

type Store = Record<string, CachedBounds & { at: number }>;

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

const readStore = (): Store => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    const out: Store = {};
    for (const [key, value] of Object.entries(raw as Record<string, any>)) {
      if (value && isVec3(value.min) && isVec3(value.max))
        out[key] = { min: value.min, max: value.max, at: Number(value.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
};

export const readModelBounds = (key: string): CachedBounds | null => {
  const hit = readStore()[key];
  return hit ? { min: hit.min, max: hit.max } : null;
};

export const rememberModelBounds = (key: string, bounds: CachedBounds) => {
  if (!isVec3(bounds.min) || !isVec3(bounds.max)) return;
  try {
    const store = readStore();
    store[key] = { min: bounds.min, max: bounds.max, at: Date.now() };
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => store[a].at - store[b].at)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete store[k]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // trình duyệt chặn localStorage: bỏ qua, chỉ mất ưu tiên nạp
  }
};

/**
 * Thứ tự nạp: mô hình đã biết khung bao và nằm trong khung nhìn (gần camera trước),
 * rồi mô hình chưa biết khung bao (giữ thứ tự gốc), cuối cùng mô hình nằm ngoài khung nhìn.
 * Mô hình đầu danh sách (mô hình chính) luôn giữ vị trí đầu nếu chưa nạp.
 */
export const orderModelsByView = <M>(
  models: M[],
  boundsOf: (model: M) => CachedBounds | null,
  view: { visible: (b: CachedBounds) => boolean; distance: (b: CachedBounds) => number },
  keepFirst = true,
): M[] => {
  if (models.length < 2) return [...models];
  const [head, ...rest] = keepFirst ? models : [undefined as unknown as M, ...models];
  const ranked = (keepFirst ? rest : models).map((model, index) => {
    const b = boundsOf(model);
    const group = b ? (view.visible(b) ? 0 : 2) : 1;
    return { model, index, group, d: b ? view.distance(b) : 0 };
  });
  ranked.sort((a, b) => a.group - b.group || (a.group === 1 ? a.index - b.index : a.d - b.d || a.index - b.index));
  const ordered = ranked.map((r) => r.model);
  return keepFirst ? [head, ...ordered] : ordered;
};
