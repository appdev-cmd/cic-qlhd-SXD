// features/bim/lib/savedViews.ts
// Góc nhìn lưu: thẻ, sắp xếp, lọc và liên kết chia sẻ (?view=<id>) — hàm thuần, có test.

import type { BimSavedView } from '@/features/bim-suite/types/bim.types';

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 32;

/** "Họp tuần, MEP; #Tầng 3" → ["Họp tuần", "MEP", "Tầng 3"]; bỏ trùng không phân biệt hoa thường */
export const parseTags = (input: string | string[] | null | undefined): string[] => {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[,;#\n]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    const tag = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
};

export const collectTags = (views: Pick<BimSavedView, 'tags'>[]): string[] => {
  const map = new Map<string, string>();
  views.forEach((v) =>
    (v.tags ?? []).forEach((t) => {
      const key = t.toLocaleLowerCase('vi');
      if (!map.has(key)) map.set(key, t);
    }),
  );
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'vi'));
};

export type SavedViewSort = 'moi_nhat' | 'cu_nhat' | 'ten' | 'cap_nhat';

export const SAVED_VIEW_SORTS: { key: SavedViewSort; label: string }[] = [
  { key: 'moi_nhat', label: 'Mới tạo trước' },
  { key: 'cap_nhat', label: 'Cập nhật gần nhất' },
  { key: 'cu_nhat', label: 'Cũ trước' },
  { key: 'ten', label: 'Tên A–Z' },
];

const time = (s?: string | null) => (s ? Date.parse(s) || 0 : 0);

export const sortViews = <T extends Pick<BimSavedView, 'name' | 'created_at' | 'updated_at'>>(
  views: T[],
  sort: SavedViewSort,
): T[] => {
  const list = [...views];
  switch (sort) {
    case 'ten':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
    case 'cu_nhat':
      return list.sort((a, b) => time(a.created_at) - time(b.created_at));
    case 'cap_nhat':
      return list.sort((a, b) => time(b.updated_at || b.created_at) - time(a.updated_at || a.created_at));
    default:
      return list.sort((a, b) => time(b.created_at) - time(a.created_at));
  }
};

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export const filterViews = <T extends Pick<BimSavedView, 'name' | 'tags' | 'description'>>(
  views: T[],
  filter: { tag?: string | null; query?: string },
): T[] => {
  const tag = filter.tag?.toLocaleLowerCase('vi');
  const q = filter.query ? fold(filter.query.trim()) : '';
  return views.filter((v) => {
    if (tag && !(v.tags ?? []).some((t) => t.toLocaleLowerCase('vi') === tag)) return false;
    if (q && !fold(`${v.name} ${(v.tags ?? []).join(' ')} ${v.description ?? ''}`).includes(q)) return false;
    return true;
  });
};

/**
 * Tham số URL của liên kết chia sẻ góc nhìn. Dùng `bimView` (cùng họ với bimIssue/bimGuid) vì `view`
 * đã được trang dự án dùng cho kiểu hiển thị kế hoạch/danh sách.
 */
export const VIEW_PARAM = 'bimView';

/** Liên kết mở thẳng góc nhìn trong phân hệ BIM (/app/bim/<dự án>) (cùng dạng với liên kết vướng mắc) */
export const buildViewShareUrl = (origin: string, projectId: string, viewId: string): string =>
  `${origin.replace(/\/$/, '')}/app/bim/${encodeURIComponent(projectId)}?${VIEW_PARAM}=${encodeURIComponent(viewId)}`;

/** Mã góc nhìn hợp lệ trong URL (chuỗi id, không ký tự lạ) */
export const readViewParam = (params: URLSearchParams): string | null => {
  const raw = params.get(VIEW_PARAM)?.trim();
  return raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
};
