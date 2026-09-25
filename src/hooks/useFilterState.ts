import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

type FilterValues = Record<string, string>;

function readStored(storageKey: string): FilterValues {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as FilterValues) : {};
  } catch {
    return {};
  }
}

function writeStored(storageKey: string, values: FilterValues) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // bỏ qua khi localStorage không khả dụng
  }
}

/**
 * Trạng thái bộ lọc danh sách, đồng bộ lên URL (chia sẻ được liên kết) và lưu localStorage
 * (giữ nguyên khi quay lại trang). URL được ưu tiên hơn giá trị đã lưu.
 * Giá trị rỗng '' nghĩa là "Tất cả".
 */
export function useFilterState<T extends FilterValues>(storageKey: string, defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fullKey = `cic_filters_${storageKey}`;

  const filters = useMemo(() => {
    const stored = readStored(fullKey);
    const result = { ...defaults } as T;
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const fromUrl = searchParams.get(key);
      if (fromUrl !== null) result[key] = fromUrl as T[typeof key];
      else if (stored[key] !== undefined) result[key] = stored[key] as T[typeof key];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults là hằng số khai báo tại trang
  }, [searchParams, fullKey]);

  const apply = useCallback(
    (next: T) => {
      writeStored(fullKey, next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v && v !== defaults[k]) params.set(k, v);
            else params.delete(k);
          }
          return params;
        },
        { replace: true }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullKey, setSearchParams]
  );

  const setFilter = useCallback(
    <K extends keyof T & string>(key: K, value: T[K]) => apply({ ...filters, [key]: value }),
    [apply, filters]
  );

  const resetFilters = useCallback(() => apply({ ...defaults }), [apply, defaults]);

  const activeCount = useMemo(
    () => (Object.keys(defaults) as (keyof T)[]).filter((k) => filters[k] !== defaults[k]).length,
    [filters, defaults]
  );

  return { filters, setFilter, setFilters: apply, resetFilters, activeCount };
}
