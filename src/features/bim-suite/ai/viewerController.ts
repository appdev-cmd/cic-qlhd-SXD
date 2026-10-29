// Viewer operations the assistant may perform and the executor that maps tool calls onto them (port of cic-hud
// services/ai/bimViewerTools executeBimViewerTool). Pure: the controller is built by hooks/useAiViewerController on
// BimViewerRef, tests drive a fake one.
import type { BimViewpoint } from '@/features/bim-suite/types/bim.types';
import type { SectionLocationRequest, SectionLocationResult } from '../lib/sectionLocation';
import { BIM_VIEWER_TOOL_LIST } from './toolNames';

export type BimViewPresetName = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right' | 'bottom';
export const VIEW_PRESETS: readonly BimViewPresetName[] = ['iso', 'top', 'front', 'back', 'left', 'right', 'bottom'];

export interface BimElementRef {
  guid: string;
  modelId?: string;
}

/** Elements by viewer local id, per model. */
export interface BimIdGroup {
  modelId: string;
  ids: number[];
}

export interface BimMeasureDistance {
  /** Distance between the bounding-box centres (m) */
  khoang_cach_tam_m: number;
  /** Smallest gap between the two bounding boxes (m); 0 when they overlap */
  khoang_ho_m: number;
  chenh_lech_m: { x: number; y: number; z: number };
  cau_kien: { guid: string; model_id: string; ten?: string }[];
}

export interface BimSectionBoxRequest {
  guids?: string[];
  storey?: string;
  building?: string;
  paddingM?: number;
}

export interface BimClashClusterResult {
  cum: number;
  tong_so_cum: number;
  so_va_cham: number;
  tam_m: [number, number, number];
  cap: { a: string; b: string; do_sau_mm: number }[];
  nguon: string;
}

export interface BimHighlightItem {
  loai_cau_kien?: string;
  guids?: string[];
  color?: string;
}

export interface BimHighlightManyResult {
  thanh_cong?: boolean;
  tong_so_luong?: number;
  found?: number;
  chi_tiet?: { loai_cau_kien?: string; so_luong: number; mau: string }[];
  ghi_chu?: string;
  error?: string;
}

/** Opaque display state for undo; the controller decides what it holds. */
export type BimViewerSnapshot = unknown;

/** Operations the assistant may perform on the 3D viewer. `storey` limits element tools to one floor. */
export interface BimViewerController {
  isolate: (guids: string[], category?: string, storey?: string) => Promise<{ found: number }>;
  highlight: (
    guids: string[],
    color?: string,
    category?: string,
    options?: { accumulate?: boolean; storey?: string },
  ) => Promise<{ found: number }>;
  highlightMany?: (items: BimHighlightItem[], storey?: string) => Promise<BimHighlightManyResult>;
  xray: (guids: string[], color?: string, category?: string, storey?: string) => Promise<{ found: number }>;
  hide: (guids: string[], category?: string, storey?: string) => Promise<{ found: number }>;
  /** Isolate / colour elements already resolved to local ids (Uniclass filter). */
  isolateGroups?: (groups: BimIdGroup[]) => Promise<{ found: number }>;
  highlightGroups?: (groups: BimIdGroup[], color: string) => Promise<{ found: number }>;
  showAll: () => Promise<void>;
  flyTo: (guid: string) => Promise<boolean>;
  setSection: (axis: 'x' | 'y' | 'z', position: number, flip?: boolean) => void;
  getSectionContext?: () => Promise<unknown>;
  setSectionByLocation?: (request: SectionLocationRequest, flip?: boolean) => Promise<SectionLocationResult>;
  clearSection: () => void;
  setView: (preset: BimViewPresetName) => void;
  toggleDiscipline?: (discipline: string, visible: boolean, isolate?: boolean) => Promise<{ count: number }>;
  /** Measure between two elements; leave both empty to use the two selected elements. */
  measureBetween?: (
    a?: BimElementRef | null,
    b?: BimElementRef | null,
  ) => Promise<BimMeasureDistance | { error: string }>;
  /** Section box around elements or one storey, in metres. */
  setSectionBox?: (
    request: BimSectionBoxRequest,
  ) => Promise<{ found: number; box?: { min: number[]; max: number[] } } | { error: string }>;
  listSavedViews?: () => Promise<{ id: string; name: string; created_at?: string }[]>;
  applySavedView?: (idOrName: string) => Promise<{ id: string; name: string } | { error: string; choices?: string[] }>;
  /** Save the current view; only called after the user confirmed the draft. */
  saveView?: (name: string, description?: string) => Promise<{ id: string; name: string }>;
  showClashCluster?: (cluster: number, cellSizeM?: number) => Promise<BimClashClusterResult | { error: string }>;
  getViewpoint?: () => BimViewpoint | null;
  restoreViewpoint?: (viewpoint: BimViewpoint) => Promise<void>;
  captureState?: () => Promise<BimViewerSnapshot>;
  restoreState?: (snapshot: BimViewerSnapshot) => Promise<void>;
  /** Push the current state on the undo stack before an assistant action. */
  checkpoint?: (label: string) => Promise<void>;
  /** Go back to before the latest assistant action. */
  undo?: () => Promise<{ label: string } | null>;
  undoDepth?: () => number;
}

export const BIM_VIEWER_TOOL_NAMES: ReadonlySet<string> = new Set<string>(BIM_VIEWER_TOOL_LIST);

const finite = (value: unknown) =>
  value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const HEX = /^#[0-9a-f]{6}$/i;
const colorArg = (value: unknown) => (typeof value === 'string' && HEX.test(value) ? value : undefined);

/** Run one viewer tool and return a short result object (Vietnamese keys, as the cic-hud model expects). */
export async function executeBimViewerTool(
  name: string,
  args: Record<string, unknown>,
  controller: BimViewerController,
): Promise<Record<string, unknown>> {
  const guids = Array.isArray(args.guids) ? args.guids.filter((g): g is string => typeof g === 'string' && !!g) : [];
  const category = text(args.loai_cau_kien);
  const storey = text(args.tang) ?? (typeof args.tang === 'number' ? String(args.tang) : undefined);
  const scope = storey ? ` ở tầng ${storey}` : '';

  switch (name) {
    case 'viewer_isolate_elements': {
      if (!category && guids.length === 0) return { error: 'Cần truyền loai_cau_kien hoặc ít nhất một GUID' };
      const { found } = await controller.isolate(guids, category, storey);
      return found > 0
        ? {
            found,
            da_co_lap: found,
            loai_cau_kien: category,
            ghi_chu: `Đã cô lập ${found} cấu kiện${scope} trên mô hình 3D`,
          }
        : {
            found: 0,
            error: `Không tìm thấy cấu kiện phù hợp (${category || 'theo GUID'})${scope} trong các mô hình đang hiển thị`,
          };
    }
    case 'viewer_xray_elements': {
      if (!category && guids.length === 0) return { error: 'Cần truyền loai_cau_kien hoặc ít nhất một GUID' };
      const { found } = await controller.xray(guids, colorArg(args.color), category, storey);
      return found > 0
        ? {
            found,
            da_bat_xray: found,
            loai_cau_kien: category,
            ghi_chu: `Đã bật X-Ray nhìn xuyên thấu cho ${found} cấu kiện${scope}`,
          }
        : { found: 0, error: `Không tìm thấy cấu kiện${scope} trong mô hình đang hiển thị` };
    }
    case 'viewer_highlight_elements': {
      const list = Array.isArray(args.danh_sach)
        ? (args.danh_sach.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
        : [];
      if (list.length && controller.highlightMany) {
        const items: BimHighlightItem[] = list.map((item) => ({
          loai_cau_kien: text(item.loai_cau_kien),
          guids: Array.isArray(item.guids) ? item.guids.filter((g): g is string => typeof g === 'string') : undefined,
          color: colorArg(item.color),
        }));
        const result = await controller.highlightMany(items, storey);
        const found = Number(result.found ?? result.tong_so_luong ?? 0);
        return result.error ? { ...result, found: 0 } : { ...result, found };
      }
      if (!category && guids.length === 0)
        return { error: 'Cần truyền loai_cau_kien hoặc ít nhất một GUID hoặc danh_sach' };
      const { found } = await controller.highlight(guids, colorArg(args.color), category, {
        accumulate: args.accumulate !== false,
        storey,
      });
      return found > 0
        ? { found, da_to_mau: found, loai_cau_kien: category }
        : { found: 0, error: `Không tìm thấy cấu kiện${scope} trong mô hình đang hiển thị` };
    }
    case 'viewer_hide_elements': {
      if (!category && guids.length === 0) return { error: 'Cần truyền loai_cau_kien hoặc ít nhất một GUID' };
      const { found } = await controller.hide(guids, category, storey);
      return found > 0
        ? { found, da_an: found, loai_cau_kien: category }
        : { found: 0, error: `Không tìm thấy cấu kiện cần ẩn${scope} trong mô hình đang hiển thị` };
    }
    case 'viewer_toggle_discipline': {
      const discipline = String(args.bo_mon || '').trim();
      const visible = args.hien_thi !== false;
      const isolate = args.chi_hien_bo_mon_nay === true;
      if (!discipline) return { error: 'Cần bo_mon' };
      if (!controller.toggleDiscipline) return { error: 'Trình xem hiện tại chưa hỗ trợ bật tắt bộ môn' };
      const { count } = await controller.toggleDiscipline(discipline, visible, isolate);
      if (!count) return { found: 0, error: `Không có mô hình sẵn sàng thuộc bộ môn ${discipline}` };
      return {
        thanh_cong: true,
        found: count,
        bo_mon: discipline,
        so_mo_hinh: count,
        ghi_chu: isolate
          ? `Đã chuyển sang chỉ hiển thị bộ môn ${discipline} (${count} mô hình)`
          : visible
            ? `Đã hiển thị bộ môn ${discipline} (${count} mô hình)`
            : `Đã ẩn bộ môn ${discipline} (${count} mô hình)`,
      };
    }
    case 'viewer_show_all':
      await controller.showAll();
      return { thanh_cong: true, ket_qua: 'Đã hiện lại toàn bộ cấu kiện, bỏ chế độ cô lập' };
    case 'viewer_fly_to_element': {
      const guid = text(args.guid);
      if (!guid) return { error: 'Thiếu GUID' };
      const ok = await controller.flyTo(guid);
      return ok
        ? { found: 1, ket_qua: 'Đã đưa camera tới cấu kiện' }
        : { found: 0, error: 'Không tìm thấy cấu kiện trong mô hình đang hiển thị' };
    }
    case 'viewer_get_section_context':
      return controller.getSectionContext
        ? ((await controller.getSectionContext()) as Record<string, unknown>)
        : { error: 'Trình xem chưa hỗ trợ đọc thông tin tầng và cao độ.' };
    case 'viewer_set_section': {
      if (args.tat === true) {
        controller.clearSection();
        return { thanh_cong: true, ket_qua: 'Đã tắt mặt cắt' };
      }
      const axis = (['x', 'y', 'z'].includes(String(args.axis)) ? String(args.axis) : 'y') as 'x' | 'y' | 'z';
      if (args.tang !== undefined || args.cao_do_m !== undefined) {
        if (args.position !== undefined)
          return { error: 'Dùng tầng/cao độ mét hoặc tỷ lệ position, không truyền đồng thời.' };
        if (!controller.setSectionByLocation) return { error: 'Trình xem chưa hỗ trợ cắt theo tầng hoặc cao độ mét.' };
        const result = await controller.setSectionByLocation(
          {
            axis,
            storey: args.tang !== undefined ? String(args.tang) : undefined,
            building: text(args.toa_nha),
            elevation: args.cao_do_m !== undefined ? Number(args.cao_do_m) : undefined,
            offset: args.do_cao_tren_san_m !== undefined ? Number(args.do_cao_tren_san_m) : undefined,
          },
          args.flip === true,
        );
        if ('error' in result) return { ...result };
        return {
          thanh_cong: true,
          truc: result.axis,
          cao_do_cat_m: result.elevation,
          tang: result.storeys,
          do_cao_tren_san_m: result.offset,
          nguon: result.source,
          ket_qua: result.storeys?.length
            ? `Đã cắt ngang ${result.storeys.join(', ')} ở cao độ ${result.elevation.toFixed(2)} m, cao ${result.offset} m trên mốc sàn của mô hình.`
            : `Đã cắt theo trục ${result.axis} tại tọa độ ${result.elevation.toFixed(2)} m trong hệ tọa độ mô hình.`,
        };
      }
      if (args.position === undefined)
        return { error: 'Cần tên tầng (tang), cao độ mét (cao_do_m) hoặc tỷ lệ position.' };
      const position = Number(args.position);
      if (typeof args.position !== 'number' || !Number.isFinite(position) || position < 0 || position > 1)
        return { error: 'Tỷ lệ position phải là số trong khoảng 0–1.' };
      controller.setSection(axis, position, args.flip === true);
      return {
        thanh_cong: true,
        ket_qua: `Đã cắt mô hình theo trục ${axis} tại vị trí ${(position * 100).toFixed(0)}%`,
      };
    }
    case 'viewer_set_section_box': {
      if (args.tat === true) {
        controller.clearSection();
        return { thanh_cong: true, ket_qua: 'Đã tắt hộp cắt' };
      }
      if (!controller.setSectionBox) return { error: 'Trình xem chưa hỗ trợ hộp cắt theo cấu kiện hoặc tầng.' };
      if (!guids.length && args.tang === undefined) return { error: 'Cần guids hoặc tang để dựng hộp cắt.' };
      const result = await controller.setSectionBox({
        guids: guids.length ? guids : undefined,
        storey: args.tang !== undefined ? String(args.tang) : undefined,
        building: text(args.toa_nha),
        paddingM: finite(args.le_m) ?? 0.5,
      });
      if ('error' in result) return { found: 0, ...result };
      return result.found > 0
        ? { thanh_cong: true, ...result, ket_qua: `Đã dựng hộp cắt quanh ${result.found} cấu kiện.` }
        : { found: 0, error: 'Không tìm thấy cấu kiện để dựng hộp cắt trong mô hình đang hiển thị.' };
    }
    case 'viewer_set_view': {
      const requested = String(args.preset || 'iso') as BimViewPresetName;
      const preset = VIEW_PRESETS.includes(requested) ? requested : 'iso';
      controller.setView(preset);
      return { thanh_cong: true, ket_qua: `Đã đặt hướng nhìn ${preset}` };
    }
    case 'viewer_measure_distance': {
      if (!controller.measureBetween) return { error: 'Trình xem chưa hỗ trợ đo giữa hai cấu kiện.' };
      const a = text(args.guid_a) ? { guid: text(args.guid_a)!, modelId: text(args.model_id_a) } : null;
      const b = text(args.guid_b) ? { guid: text(args.guid_b)!, modelId: text(args.model_id_b) } : null;
      if (!!a !== !!b) return { error: 'Cần đủ hai GUID, hoặc bỏ trống cả hai để đo hai cấu kiện đang chọn.' };
      const result = await controller.measureBetween(a, b);
      if ('error' in result) return { found: 0, ...result };
      return {
        thanh_cong: true,
        found: 2,
        ...result,
        ghi_chu: 'Đo theo khung bao hình học của mô hình đang ghép; không thay kích thước thiết kế.',
      };
    }
    case 'viewer_list_saved_views': {
      if (!controller.listSavedViews) return { error: 'Trình xem chưa hỗ trợ góc nhìn đã lưu.' };
      const views = await controller.listSavedViews();
      return { tong_so: views.length, goc_nhin: views.slice(0, 50), bi_gioi_han: views.length > 50 };
    }
    case 'viewer_apply_view': {
      if (!controller.applySavedView) return { error: 'Trình xem chưa hỗ trợ góc nhìn đã lưu.' };
      const key = String(args.id || args.ten || '').trim();
      if (!key) return { error: 'Cần tên hoặc id góc nhìn.' };
      const result = await controller.applySavedView(key);
      return 'error' in result ? { found: 0, ...result } : { thanh_cong: true, found: 1, da_ap: result };
    }
    case 'viewer_save_view':
      // Writes data: the assistant turns this into a draft the user confirms; never written from here.
      return { error: 'Lưu góc nhìn cần người dùng xác nhận bản nháp.' };
    case 'viewer_show_clash_cluster': {
      if (!controller.showClashCluster) return { error: 'Trình xem chưa hỗ trợ cụm va chạm.' };
      const cluster = Math.floor(Number(args.cum));
      if (!Number.isFinite(cluster) || cluster < 1) return { error: 'cum phải là số nguyên từ 1.' };
      const cell = finite(args.o_luoi_m);
      const result = await controller.showClashCluster(cluster, cell && cell > 0 ? cell : 1);
      return 'error' in result ? { found: 0, ...result } : { thanh_cong: true, found: result.so_va_cham, ...result };
    }
    case 'viewer_undo': {
      if (!controller.undo) return { error: 'Không có ngăn xếp hoàn tác cho khung nhìn này.' };
      const undone = await controller.undo();
      return undone
        ? { thanh_cong: true, da_hoan_tac: undone.label, con_lai: controller.undoDepth?.() ?? 0 }
        : { error: 'Không còn thao tác nào để hoàn tác.' };
    }
    default:
      return { error: `Công cụ không hỗ trợ: ${name}` };
  }
}
