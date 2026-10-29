// features/bim/lib/tabUtils.ts
// Tiện ích dùng chung của tab Mô hình BIM: lưu tuỳ chọn trình duyệt, gom chuỗi phiên bản

import type { BimModel } from '@/features/bim-suite/types/bim.types';

export const readPref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
export const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // bộ nhớ trình duyệt không khả dụng
  }
};

/** Gom các mô hình thành chuỗi phiên bản; trả về map id → phiên bản mới nhất cùng chuỗi */
export const buildVersionChains = (models: BimModel[]) => {
  const byId = new Map(models.map((m) => [m.id, m]));
  const rootOf = (m: BimModel): string => {
    let cur = m;
    const seen = new Set<string>();
    while (cur.model_goc_id && byId.has(cur.model_goc_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.model_goc_id)!;
    }
    return cur.id;
  };
  const chains = new Map<string, BimModel[]>();
  models.forEach((m) => {
    const root = rootOf(m);
    chains.set(root, [...(chains.get(root) || []), m]);
  });
  chains.forEach((list) => list.sort((a, b) => (b.phien_ban ?? 1) - (a.phien_ban ?? 1)));
  return [...chains.values()];
};

// ── Tổ hợp mô hình mặc định (quy tắc chung, không phụ thuộc tên tệp của dự án cụ thể) ──

/** Tổ hợp mô hình hiển thị: mô hình chính + các mô hình ghép */
export interface BimComposition {
  active: string | null;
  overlay: string[];
}

/** Tổng dung lượng IFC gốc tối đa để tự động ghép Kiến trúc + Kết cấu khi dự án chưa đặt tổ hợp mặc định */
export const AUTO_COMPOSE_MAX_IFC_BYTES = 300 * 1024 * 1024;

const DISCIPLINE_PRIORITY: Record<string, number> = { TOAN_THE: 0, KIEN_TRUC: 1, KET_CAU: 2, CAU: 3, HAM: 3, MEP: 4 };

/** So sánh tên tệp theo thứ tự tự nhiên (1FL < 2FL < 10FL) */
const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });

/** Sắp xếp mô hình: Toàn thể › Kiến trúc › Kết cấu › Cầu/Hầm › MEP, trong cùng bộ môn theo tên tự nhiên */
export const sortModelsForDisplay = (models: BimModel[]): BimModel[] =>
  [...models].sort(
    (a, b) =>
      (DISCIPLINE_PRIORITY[a.discipline] ?? 9) - (DISCIPLINE_PRIORITY[b.discipline] ?? 9) ||
      naturalCompare(a.file_name, b.file_name),
  );

/** Mô hình chính mặc định: Toàn thể nếu có, rồi Kiến trúc, Kết cấu...; chỉ xét mô hình đã sẵn sàng */
export const pickPrimaryModel = (models: BimModel[]): BimModel | null =>
  sortModelsForDisplay(models.filter((m) => m.status === 'ready'))[0] ?? null;

/** Build an exact visible set, promoting another visible model when the primary is hidden. */
export const compositionFromModelIds = (
  models: BimModel[],
  ids: string[],
  preferredActive?: string | null,
): BimComposition => {
  const requested = new Set(ids);
  const visible = sortModelsForDisplay(models.filter((m) => m.status === 'ready' && requested.has(m.id)));
  const active = visible.find((m) => m.id === preferredActive)?.id ?? visible[0]?.id ?? null;
  return { active, overlay: visible.filter((m) => m.id !== active).map((m) => m.id) };
};

/**
 * Tổ hợp mặc định khi dự án chưa lưu cấu hình: mô hình chính theo pickPrimaryModel;
 * tự ghép thêm Kiến trúc + Kết cấu nếu tổng IFC gốc của chúng không quá lớn (tránh tự tải hàng trăm MB).
 */
export const defaultComposition = (models: BimModel[], maxIfcBytes = AUTO_COMPOSE_MAX_IFC_BYTES): BimComposition => {
  const primary = pickPrimaryModel(models);
  if (!primary) return { active: null, overlay: [] };
  const core = sortModelsForDisplay(
    models.filter(
      (m) =>
        m.status === 'ready' && (m.discipline === 'KIEN_TRUC' || m.discipline === 'KET_CAU') && m.id !== primary.id,
    ),
  );
  const total = core.reduce((s, m) => s + (m.file_size || 0), 0) + (primary.file_size || 0);
  return { active: primary.id, overlay: total <= maxIfcBytes ? core.map((m) => m.id) : [] };
};

/** Lọc tổ hợp đã lưu theo mô hình còn tồn tại và sẵn sàng; trả null nếu không còn gì dùng được */
export const sanitizeComposition = (
  saved: Partial<BimComposition> | null | undefined,
  models: BimModel[],
): BimComposition | null => {
  if (!saved) return null;
  // Explicitly hiding every model must survive reopening the tab.
  if (saved.active === null && Array.isArray(saved.overlay) && saved.overlay.length === 0)
    return { active: null, overlay: [] };
  const ready = new Set(models.filter((m) => m.status === 'ready').map((m) => m.id));
  const active = saved.active && ready.has(saved.active) ? saved.active : null;
  const overlay = (Array.isArray(saved.overlay) ? saved.overlay : []).filter((id) => ready.has(id) && id !== active);
  if (!active && overlay.length === 0) return null;
  return { active: active ?? overlay.shift() ?? null, overlay };
};
