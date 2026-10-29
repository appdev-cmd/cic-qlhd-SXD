// features/bim/lib/fragCache.ts
// Tải file .frag có tiến độ (%) + lưu Cache Storage của trình duyệt để mở lại mô hình tức thì.
// Khoá cache gồm đường dẫn + thời điểm cập nhật mô hình → xử lý lại mô hình sẽ tự tải bản mới.
//
// Giới hạn theo DUNG LƯỢNG (byte) chứ không theo số mô hình: một dự án ghép 19 mô hình (~110 MB)
// phải nằm trọn trong cache, nếu không mỗi lần mở lại vẫn tải lại hàng chục MB (lỗi trước 07/10/2026:
// trần 8 mô hình → 11/19 mô hình bị tải lại mỗi lần mở).

import { supabase } from '@/features/bim-suite/adapters/supabase';
import { withStorageApiKey } from '@/features/bim-suite/adapters/supabase';
import type { BimModel } from '@/features/bim-suite/types/bim.types';

// v2: mục cache có header dung lượng; bản v1 (giới hạn theo số mô hình) bị xoá một lần khi mở
const CACHE_NAME = 'bim-frag-v2';
const LEGACY_CACHE_NAMES = ['bim-frag-v1'];
let legacyCleared = false;
const openCache = async () => {
  if (!legacyCleared) {
    legacyCleared = true;
    LEGACY_CACHE_NAMES.forEach((n) => caches.delete(n).catch(() => false));
  }
  return caches.open(CACHE_NAME);
};
/** Trần tuyệt đối của bộ đệm mô hình */
export const MAX_CACHE_BYTES = 600 * 1024 * 1024;
/** Không dùng quá tỉ lệ này của hạn ngạch trình duyệt cấp cho trang */
export const QUOTA_SHARE = 0.5;

const cacheKey = (model: BimModel) =>
  `https://bim-cache.local/${encodeURIComponent(model.frag_path || '')}?v=${encodeURIComponent(model.updated_at || '')}`;

const cachesAvailable = () => typeof window !== 'undefined' && 'caches' in window && window.isSecureContext;

export interface FragLoadProgress {
  loaded: number;
  total: number | null;
  fromCache: boolean;
}

/** Mô hình đang được trình xem giữ → không bị dọn khỏi cache khi hết chỗ */
const pinned = new Set<string>();

/** URL có chữ ký lấy theo lô (một yêu cầu cho cả tổ hợp) thay vì mỗi mô hình một yêu cầu */
const signedUrls = new Map<string, { url: string; exp: number }>();
const SIGNED_TTL_S = 600;

export const prefetchSignedUrls = async (models: BimModel[]) => {
  const now = Date.now();
  const paths = [...new Set(models.map((m) => m.frag_path).filter((p): p is string => !!p))].filter((p) => {
    const hit = signedUrls.get(p);
    return !hit || hit.exp < now + 60_000;
  });
  if (paths.length === 0) return;
  try {
    const { data, error } = await supabase.storage.from('bim-models').createSignedUrls(paths, SIGNED_TTL_S);
    if (error || !data) return;
    data.forEach((d, i) => {
      if (d.signedUrl) signedUrls.set(d.path || paths[i], { url: d.signedUrl, exp: now + (SIGNED_TTL_S - 30) * 1000 });
    });
  } catch {
    // lấy lẻ từng mô hình ở bước tải
  }
};

const signedUrlFor = async (path: string): Promise<string> => {
  const hit = signedUrls.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data: signed, error } = await supabase.storage.from('bim-models').createSignedUrl(path, SIGNED_TTL_S);
  if (error || !signed?.signedUrl) throw new Error(error?.message || 'không tạo được liên kết tải');
  signedUrls.set(path, { url: signed.signedUrl, exp: Date.now() + (SIGNED_TTL_S - 30) * 1000 });
  return signed.signedUrl;
};

/** Trình xem gọi mỗi khi tập mô hình hiển thị đổi; các mô hình này được ưu tiên giữ lại trong cache */
export const pinFragCache = (models: BimModel[]) => {
  pinned.clear();
  models.forEach((m) => m.frag_path && pinned.add(cacheKey(m)));
};

export interface CacheEntryInfo {
  key: string;
  size: number;
  /** Lần dùng gần nhất (ms) */
  at: number;
}

/**
 * Chọn các mục cần xoá để tổng dung lượng về dưới ngân sách (thuần, có test).
 * Thứ tự xoá: mục không được ghim, ít dùng nhất trước; mục được ghim chỉ xoá khi vẫn còn vượt ngân sách.
 */
export const selectEvictions = (entries: CacheEntryInfo[], budget: number, pinnedKeys: Set<string>): string[] => {
  let total = entries.reduce((s, e) => s + e.size, 0);
  if (total <= budget) return [];
  const order = [...entries].sort((a, b) => {
    const pa = pinnedKeys.has(a.key) ? 1 : 0;
    const pb = pinnedKeys.has(b.key) ? 1 : 0;
    return pa - pb || a.at - b.at;
  });
  const out: string[] = [];
  for (const e of order) {
    if (total <= budget) break;
    out.push(e.key);
    total -= e.size;
  }
  return out;
};

/** Ngân sách thực tế: min(trần cố định, một phần hạn ngạch trình duyệt) */
const cacheBudget = async (): Promise<number> => {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) return Math.min(MAX_CACHE_BYTES, Math.floor(est.quota * QUOTA_SHARE));
  } catch {
    // không đọc được hạn ngạch
  }
  return MAX_CACHE_BYTES;
};

// Lần dùng gần nhất lưu riêng (localStorage) — trúng cache chỉ cập nhật siêu dữ liệu này,
// không ghi lại cả tệp .frag hàng chục MB vào Cache Storage như trước.
const ACCESS_KEY = 'bim-frag-access-v1';
let accessMemo: Record<string, number> | null = null;
const readAccess = (): Record<string, number> => {
  if (accessMemo) return accessMemo;
  try {
    const raw = JSON.parse(localStorage.getItem(ACCESS_KEY) || '{}');
    accessMemo = raw && typeof raw === 'object' ? (raw as Record<string, number>) : {};
  } catch {
    accessMemo = {};
  }
  return accessMemo;
};
const writeAccess = (map: Record<string, number>) => {
  accessMemo = map;
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(map));
  } catch {
    // không ghi được: thứ tự LRU lùi về thời điểm ghi tệp
  }
};

/** Ghi nhận vừa dùng một mục cache (chỉ siêu dữ liệu) */
export const touchCacheAccess = (key: string, at = Date.now()) => {
  writeAccess({ ...readAccess(), [key]: at });
};

/** Thời điểm dùng gần nhất = max(lúc ghi tệp, lần trúng cache gần nhất) — thuần, có test */
export const mergeAccessTimes = (entries: CacheEntryInfo[], access: Record<string, number>): CacheEntryInfo[] =>
  entries.map((e) => ({ ...e, at: Math.max(e.at, Number(access[e.key]) || 0) }));

/** Bỏ siêu dữ liệu của mục không còn trong cache */
export const pruneAccessTimes = (
  access: Record<string, number>,
  liveKeys: Iterable<string>,
): Record<string, number> => {
  const live = new Set(liveKeys);
  return Object.fromEntries(Object.entries(access).filter(([k]) => live.has(k)));
};

const entryInfo = async (cache: Cache, req: Request): Promise<CacheEntryInfo> => {
  const res = await cache.match(req);
  return {
    key: req.url,
    size: Number(res?.headers.get('x-cached-size') || 0),
    at: Number(res?.headers.get('x-cached-at') || 0),
  };
};

/** Xoá bản cũ của cùng mô hình, rồi dọn theo ngân sách dung lượng */
const pruneCache = async (cache: Cache, model: BimModel) => {
  const keys = await cache.keys();
  const prefix = `https://bim-cache.local/${encodeURIComponent(model.frag_path || '')}?`;
  const current = cacheKey(model);
  await Promise.all(keys.filter((k) => k.url.startsWith(prefix) && k.url !== current).map((k) => cache.delete(k)));

  const remaining = await cache.keys();
  const entries = mergeAccessTimes(await Promise.all(remaining.map((k) => entryInfo(cache, k))), readAccess());
  const budget = await cacheBudget();
  const evict = selectEvictions(entries, budget, pinned);
  await Promise.all(evict.map((url) => cache.delete(url)));
  const gone = new Set(evict);
  writeAccess(
    pruneAccessTimes(
      readAccess(),
      entries.map((e) => e.key).filter((k) => !gone.has(k)),
    ),
  );
};

const putCache = async (cache: Cache, model: BimModel, buffer: ArrayBuffer) => {
  // Response sao chép dữ liệu từ ArrayBuffer khi tạo → không cần slice()
  await cache.put(
    cacheKey(model),
    new Response(buffer, {
      headers: { 'x-cached-at': String(Date.now()), 'x-cached-size': String(buffer.byteLength) },
    }),
  );
};

/** Dung lượng cache hiện tại (để hiển thị trong Cài đặt) */
export const fragCacheUsage = async (): Promise<{ count: number; bytes: number }> => {
  if (!cachesAvailable()) return { count: 0, bytes: 0 };
  try {
    const cache = await openCache();
    const keys = await cache.keys();
    const entries = await Promise.all(keys.map((k) => entryInfo(cache, k)));
    return { count: entries.length, bytes: entries.reduce((s, e) => s + e.size, 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
};

export const loadFragBuffer = async (
  model: BimModel,
  onProgress?: (p: FragLoadProgress) => void,
): Promise<ArrayBuffer> => {
  if (!model.frag_path) throw new Error('Mô hình chưa có file .frag');

  // 1. Cache trình duyệt
  if (cachesAvailable()) {
    try {
      const cache = await openCache();
      const hit = await cache.match(cacheKey(model));
      if (hit) {
        const buffer = await hit.arrayBuffer();
        onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength, fromCache: true });
        // Cập nhật thời điểm dùng gần nhất (LRU) — chỉ siêu dữ liệu, không ghi lại cả tệp
        touchCacheAccess(cacheKey(model));
        return buffer;
      }
    } catch {
      // Cache không khả dụng (chế độ ẩn danh, hết dung lượng...) → tải bình thường
    }
  }

  // 2. Tải qua URL có chữ ký để đọc được tiến độ (kèm cơ chế thử lại tự động nếu mạng chập chờn)
  let res: Response | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = await signedUrlFor(model.frag_path);
      res = await fetch(withStorageApiKey(url));
      if (res.ok && res.body) break;
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      lastErr = err;
      // URL có thể hết hạn hoặc sai → lần thử sau xin URL mới
      signedUrls.delete(model.frag_path);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  if (!res || !res.ok || !res.body) {
    throw new Error(`Không tải được "${model.file_name}": ${lastErr?.message || 'Lỗi mạng khi tải tệp'}`);
  }

  const total = Number(res.headers.get('content-length')) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const now = Date.now();
    if (now - lastReport > 150) {
      lastReport = now;
      onProgress?.({ loaded, total, fromCache: false });
    }
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  onProgress?.({ loaded, total: total ?? loaded, fromCache: false });

  if (cachesAvailable()) {
    try {
      const cache = await openCache();
      await putCache(cache, model, out.buffer);
      touchCacheAccess(cacheKey(model));
      pruneCache(cache, model).catch(() => undefined);
    } catch {
      // bỏ qua lỗi ghi cache
    }
  }
  return out.buffer;
};

/** Xoá toàn bộ cache mô hình (dùng khi đăng xuất hoặc người dùng yêu cầu) */
export const clearFragCache = async () => {
  writeAccess({});
  if (cachesAvailable()) await caches.delete(CACHE_NAME).catch(() => false);
};

/** Verify an explicit offline download actually persisted. A successful network fetch alone is insufficient. */
export const hasCachedFrag = async (model: BimModel): Promise<boolean> => {
  if (!cachesAvailable()) return false;
  return !!(await (await openCache()).match(cacheKey(model)));
};
