// features/bim/lib/filterAggregation.ts
// Bộ lọc liên mô hình: gộp loại cấu kiện và tầng từ mọi mô hình đang hiển thị, rồi tính danh sách ẩn
// cho từng mô hình (trước đây chỉ áp lên mô hình đang chọn).

export interface CategoryGroupLike {
  category: string;
  ids: number[];
}
export interface StoreyGroupLike {
  localId: number;
  name: string;
  ids: number[];
  elevation?: number | null;
}

export interface AggregatedCategory {
  category: string;
  total: number;
  byModel: Record<string, number[]>;
}

export interface AggregatedStorey {
  /** Khoá gộp: tên tầng đã chuẩn hoá (không dấu, không phân biệt hoa thường) */
  key: string;
  name: string;
  elevation: number | null;
  total: number;
  byModel: Record<string, number[]>;
}

export const storeyKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

export const aggregateCategories = (
  perModel: { modelId: string; categories: CategoryGroupLike[] }[],
): AggregatedCategory[] => {
  const map = new Map<string, AggregatedCategory>();
  for (const { modelId, categories } of perModel) {
    for (const c of categories) {
      const key = c.category.toUpperCase();
      let entry = map.get(key);
      if (!entry) {
        entry = { category: c.category, total: 0, byModel: {} };
        map.set(key, entry);
      }
      entry.byModel[modelId] = [...(entry.byModel[modelId] ?? []), ...c.ids];
      entry.total += c.ids.length;
    }
  }
  return [...map.values()];
};

export const aggregateStoreys = (perModel: { modelId: string; storeys: StoreyGroupLike[] }[]): AggregatedStorey[] => {
  const map = new Map<string, AggregatedStorey>();
  for (const { modelId, storeys } of perModel) {
    for (const s of storeys) {
      const key = storeyKey(s.name);
      let entry = map.get(key);
      if (!entry) {
        entry = { key, name: s.name, elevation: null, total: 0, byModel: {} };
        map.set(key, entry);
      }
      if (s.elevation !== null && s.elevation !== undefined && Number.isFinite(s.elevation)) {
        entry.elevation = entry.elevation === null ? s.elevation : Math.min(entry.elevation, s.elevation);
      }
      entry.byModel[modelId] = [...(entry.byModel[modelId] ?? []), ...s.ids];
      entry.total += s.ids.length;
    }
  }
  // Thấp → cao; tầng không có cao độ xếp sau theo tên
  return [...map.values()].sort((a, b) => {
    if (a.elevation !== null && b.elevation !== null && a.elevation !== b.elevation) return a.elevation - b.elevation;
    if (a.elevation === null && b.elevation !== null) return 1;
    if (b.elevation === null && a.elevation !== null) return -1;
    return a.name.localeCompare(b.name, 'vi', { numeric: true });
  });
};

/**
 * Danh sách ẩn theo từng mô hình: loại ẩn ∪ tầng ẩn ∪ toàn bộ mô hình bị tắt.
 * Luôn trả đủ khoá cho mọi mô hình (mảng rỗng = bỏ lọc) để bên gọi xoá được lọc cũ.
 */
export const computeHiddenByModel = (input: {
  modelIds: string[];
  categories: AggregatedCategory[];
  storeys: AggregatedStorey[];
  hiddenCategories: ReadonlySet<string>;
  hiddenStoreys: ReadonlySet<string>;
  hiddenModels: ReadonlySet<string>;
}): Record<string, number[]> => {
  const sets = new Map<string, Set<number>>(input.modelIds.map((id) => [id, new Set<number>()]));
  const addAll = (byModel: Record<string, number[]>, only?: string) => {
    for (const [modelId, ids] of Object.entries(byModel)) {
      if (only && modelId !== only) continue;
      const set = sets.get(modelId);
      if (set) ids.forEach((id) => set.add(id));
    }
  };
  for (const c of input.categories) if (input.hiddenCategories.has(c.category)) addAll(c.byModel);
  for (const s of input.storeys) if (input.hiddenStoreys.has(s.key)) addAll(s.byModel);
  for (const modelId of input.hiddenModels) for (const c of input.categories) addAll(c.byModel, modelId);
  const out: Record<string, number[]> = {};
  for (const [modelId, set] of sets) out[modelId] = [...set];
  return out;
};

export const countHidden = (hidden: Record<string, number[]>) =>
  Object.values(hidden).reduce((n, ids) => n + ids.length, 0);
