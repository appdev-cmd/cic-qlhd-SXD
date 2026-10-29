// features/bim/lib/reviewLink.ts
// Liên kết mở trình xem từ dẫn chứng thẩm tra (TT-B2): ?bimModel=<phiên bản đã chốt>[,…]&bimGuid=<GlobalId>
// &bimView=<góc nhìn đã lưu>&bimState=<trạng thái góc nhìn đã đóng băng>. Hàm thuần, có test.

import type { BimClipPlaneState, BimViewpoint, BimViewpointVisibility } from '@/features/bim-suite/types/bim.types';
import { VIEW_PARAM, readViewParam } from './savedViews';

export const MODEL_PARAM = 'bimModel';
export const GUID_PARAM = 'bimGuid';
export const STATE_PARAM = 'bimState';
export { VIEW_PARAM };

/** Số phiên bản mô hình tối đa trong một liên kết */
export const MAX_REVIEW_MODELS = 10;
/** Độ dài tối đa của bimState trong URL; vượt thì bỏ trạng thái ẩn/cô lập (partial), rồi bỏ hẳn */
export const MAX_STATE_PARAM = 6000;

export const IFC_GUID = /^[0-9A-Za-z_$]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isModelId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** Các phiên bản mô hình cần mở (lặp tham số hoặc phân tách bằng dấu phẩy), bỏ trùng, chữ thường. */
export const readModelParam = (params: URLSearchParams): string[] => {
  const out: string[] = [];
  for (const raw of params.getAll(MODEL_PARAM).flatMap((v) => v.split(','))) {
    const id = raw.trim().toLowerCase();
    if (isModelId(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_REVIEW_MODELS) break;
  }
  return out;
};

/** GUID trong URL: giữ cách đọc cũ (chuỗi bất kỳ ≤ 64 ký tự, không ký tự điều khiển). */
export const readGuidParam = (params: URLSearchParams): string | null => {
  const raw = params.get(GUID_PARAM)?.trim();
  // eslint-disable-next-line no-control-regex
  return raw && raw.length <= 64 && !/[\u0000-\u001f\u007f]/.test(raw) ? raw : null;
};

/** Góc nhìn đóng băng: bỏ ảnh ghi chú (data URL lớn), giữ camera, mặt cắt, hiển thị, lựa chọn, xuyên thấu, phép đo. */
export type FrozenViewState = Omit<BimViewpoint, 'markup'>;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(finite);
const ids = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((n) => Number.isSafeInteger(n) && n >= 0) ? (v as number[]) : null;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Đọc lại một trạng thái góc nhìn từ dữ liệu không tin cậy; null khi thiếu camera hợp lệ. */
export const sanitizeViewState = (raw: unknown): FrozenViewState | null => {
  if (!record(raw) || !record(raw.camera)) return null;
  const { position, target, fov } = raw.camera;
  if (!vec3(position) || !vec3(target)) return null;
  const out: FrozenViewState = { camera: { position, target, ...(finite(fov) ? { fov } : {}) } };
  if (Array.isArray(raw.sectionPlanes)) {
    const planes = raw.sectionPlanes.filter(
      (p): p is BimClipPlaneState => record(p) && vec3(p.normal) && finite(p.constant),
    );
    if (planes.length) out.sectionPlanes = planes.map((p) => ({ normal: p.normal, constant: p.constant }));
  }
  if (record(raw.section) && raw.section.version === 2)
    out.section = raw.section as unknown as FrozenViewState['section'];
  if (Array.isArray(raw.modelIds)) {
    const models = raw.modelIds.filter((m): m is string => typeof m === 'string' && m.length <= 64);
    if (models.length) out.modelIds = models;
  }
  if (record(raw.visibility)) {
    const visibility: Record<string, BimViewpointVisibility> = {};
    for (const [model, value] of Object.entries(raw.visibility)) {
      if (!record(value) || model.length > 64) continue;
      const hidden = ids(value.hidden) ?? [];
      const isolated = value.isolated === null ? null : ids(value.isolated);
      if (value.isolated !== null && isolated === null) continue;
      visibility[model] = { isolated, hidden };
    }
    if (Object.keys(visibility).length) out.visibility = visibility;
  }
  if (Array.isArray(raw.selection)) {
    const selection = raw.selection.flatMap((s) =>
      record(s) && typeof s.modelId === 'string' && ids(s.ids) ? [{ modelId: s.modelId, ids: s.ids as number[] }] : [],
    );
    if (selection.length) out.selection = selection;
  }
  for (const key of ['isolatedIds', 'hiddenIds', 'selectedIds'] as const) {
    const list = ids(raw[key]);
    if (list?.length) out[key] = list;
  }
  if (record(raw.ghost) && typeof raw.ghost.active === 'boolean')
    out.ghost = { active: raw.ghost.active, ...(finite(raw.ghost.opacity) ? { opacity: raw.ghost.opacity } : {}) };
  if (Array.isArray(raw.measurements) && raw.measurements.length)
    out.measurements = raw.measurements as FrozenViewState['measurements'];
  return out;
};

/** Trạng thái lưu vào dẫn chứng bim_view (bất biến; góc nhìn đã lưu vẫn có thể bị sửa/xóa sau đó). */
export const freezeViewState = (state: BimViewpoint): FrozenViewState | null => sanitizeViewState(state);

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (value: string) => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

/**
 * Mã hóa trạng thái cho tham số bimState. Quá dài thì bỏ phần hiển thị/lựa chọn/phép đo (partial: chỉ còn camera
 * và mặt cắt); vẫn quá dài thì trả null (trình xem dùng bimView).
 */
export const encodeViewState = (state: unknown): { value: string; partial: boolean } | null => {
  const clean = sanitizeViewState(state);
  if (!clean) return null;
  const full = toBase64Url(JSON.stringify({ v: 1, s: clean }));
  if (full.length <= MAX_STATE_PARAM) return { value: full, partial: false };
  const { camera, sectionPlanes, section, modelIds, ghost } = clean;
  const compact = { camera, sectionPlanes, section, modelIds, ghost };
  const reduced = toBase64Url(JSON.stringify({ v: 1, s: compact, partial: true }));
  return reduced.length <= MAX_STATE_PARAM ? { value: reduced, partial: true } : null;
};

export const decodeViewState = (
  raw: string | null | undefined,
): { state: FrozenViewState; partial: boolean } | null => {
  if (!raw || raw.length > MAX_STATE_PARAM || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (!record(parsed) || parsed.v !== 1) return null;
    const state = sanitizeViewState(parsed.s);
    return state ? { state, partial: parsed.partial === true } : null;
  } catch {
    return null;
  }
};

export type ReviewLink = {
  modelIds: string[];
  guid: string | null;
  viewId: string | null;
  state: FrozenViewState | null;
  partial: boolean;
};

/** Mọi tham số liên kết thẩm tra của trình xem. */
export const readReviewLink = (params: URLSearchParams): ReviewLink => {
  const decoded = decodeViewState(params.get(STATE_PARAM));
  return {
    modelIds: readModelParam(params),
    guid: readGuidParam(params),
    viewId: readViewParam(params),
    state: decoded?.state ?? null,
    partial: decoded?.partial ?? false,
  };
};

/** Tạo phần query của liên kết thẩm tra (không gồm dấu ?). */
export const buildReviewQuery = (link: {
  modelIds?: string[];
  guid?: string | null;
  viewId?: string | null;
  state?: unknown;
}): string => {
  const query = new URLSearchParams();
  const models = [...new Set((link.modelIds ?? []).map((m) => m.toLowerCase()).filter(isModelId))].slice(
    0,
    MAX_REVIEW_MODELS,
  );
  if (models.length) query.set(MODEL_PARAM, models.join(','));
  if (link.guid) query.set(GUID_PARAM, link.guid);
  if (link.viewId) query.set(VIEW_PARAM, link.viewId);
  const encoded = link.state ? encodeViewState(link.state) : null;
  if (encoded) query.set(STATE_PARAM, encoded.value);
  return query.toString();
};

/** Thay phiên bản mới nhất của mỗi chuỗi bằng phiên bản đang thẩm tra (nếu chuỗi có phiên bản đó). */
export const pickReviewVersions = <T extends { id: string }>(chains: T[][], reviewIds: readonly string[]): T[] =>
  chains.map((chain) => chain.find((m) => reviewIds.includes(m.id)) ?? chain[0]);
