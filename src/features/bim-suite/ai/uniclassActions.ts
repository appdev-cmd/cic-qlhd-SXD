// Uniclass tools: read codes / counts and isolate or colour every element of a code (port of cic-hud
// features/bim/lib/uniclassActions). Data comes through a small context so tests and the server can supply it:
// in the browser hooks/useAiViewerController reads bim_uniclass_tong_hop and bim_loc_cau_kien.
import type { BimIdGroup, BimViewerController } from './viewerController';
import {
  codesUnder,
  normalizeUniclassCode,
  searchUniclass,
  uniclassSummary,
  UNICLASS_TABLE_PREFIX,
  UNICLASS_UNCLASSIFIED,
  type UniclassCodeRow,
} from './uniclass';

export interface UniclassElementFilter {
  pr?: string;
  ss?: string;
  /** Storey of the loaded models ("3", "T03", "B1"). */
  storey?: string;
}

export interface UniclassToolContext {
  /** Models in scope (the loaded models of the viewer). */
  modelIds: string[];
  /** Human label of the scope, e.g. "2 mô hình đang nạp". */
  label: string;
  codes: () => Promise<UniclassCodeRow[]>;
  /** Elements of the filter as viewer local ids per model. */
  elements: (filter: UniclassElementFilter) => Promise<BimIdGroup[]>;
}

const HEX = /^#[0-9a-f]{6}$/i;
const total = (groups: BimIdGroup[]) => groups.reduce((sum, group) => sum + group.ids.length, 0);

/** Validated filter or an error message. */
export function uniclassFilterArgs(args: Record<string, unknown>): UniclassElementFilter | { error: string } {
  const filter: UniclassElementFilter = {};
  for (const table of ['pr', 'ss'] as const) {
    const raw = args[table];
    if (raw === undefined || raw === null || raw === '' || raw === 'all') continue;
    if (raw === UNICLASS_UNCLASSIFIED) {
      filter[table] = UNICLASS_UNCLASSIFIED;
      continue;
    }
    const code = normalizeUniclassCode(table, raw);
    if (!code)
      return {
        error: `Mã ${UNICLASS_TABLE_PREFIX[table]} không hợp lệ; tra get_bim_uniclass để chọn mã có trong mô hình.`,
      };
    filter[table] = code;
  }
  if (typeof args.tang === 'string' && args.tang.trim()) filter.storey = args.tang.trim();
  return filter;
}

export async function executeUniclassTool(
  name: string,
  args: Record<string, unknown>,
  ctx: UniclassToolContext,
  viewer?: BimViewerController | null,
): Promise<Record<string, unknown>> {
  const filter = uniclassFilterArgs(args);
  if ('error' in filter) return filter;
  if (!ctx.modelIds.length) return { error: 'Chưa nạp mô hình nào trên khung nhìn.' };

  if (name === 'viewer_filter_uniclass') {
    if (!filter.pr && !filter.ss) return { error: 'Cần mã Pr hoặc Ss để điều khiển BIM.' };
    if (args.action !== undefined && !['isolate', 'highlight'].includes(String(args.action)))
      return { error: 'Thao tác không hợp lệ.' };
    if (!viewer) return { error: 'Khung nhìn BIM chưa sẵn sàng.' };
    const action = args.action === 'highlight' ? 'highlight' : 'isolate';
    const groups = (await ctx.elements(filter)).filter((group) => group.ids.length);
    if (!groups.length)
      return { found: 0, message: 'Không có cấu kiện khớp trong phạm vi đang chọn; khung nhìn giữ nguyên.' };
    const color = typeof args.color === 'string' && HEX.test(args.color) ? args.color : '#2563eb';
    let result: { found: number };
    if (action === 'highlight') {
      if (!viewer.highlightGroups) return { error: 'Trình xem chưa hỗ trợ tô màu theo mã phân loại.' };
      result = await viewer.highlightGroups(groups, color);
    } else {
      if (!viewer.isolateGroups) return { error: 'Trình xem chưa hỗ trợ cô lập theo mã phân loại.' };
      result = await viewer.isolateGroups(groups);
    }
    return { ...result, action, pr: filter.pr, ss: filter.ss, tang: filter.storey, pham_vi: ctx.label };
  }

  if (name !== 'get_bim_uniclass') return { error: `Công cụ không hỗ trợ: ${name}` };
  const codes = await ctx.codes();
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!filter.pr && !filter.ss && !filter.storey) {
    const found = query ? searchUniclass(codes, query) : codes;
    return { ...uniclassSummary(found), so_ma: found.length, pham_vi: ctx.label };
  }
  const groups = (await ctx.elements(filter)).filter((group) => group.ids.length);
  return {
    he_thong: 'Uniclass 2015',
    pr: filter.pr,
    ss: filter.ss,
    tang: filter.storey,
    so_cau_kien: total(groups),
    theo_mo_hinh: groups.map((group) => ({ model_id: group.modelId, so_cau_kien: group.ids.length })),
    ma_khop: [
      ...(filter.pr && filter.pr !== UNICLASS_UNCLASSIFIED ? codesUnder(codes, 'pr', filter.pr) : []),
      ...(filter.ss && filter.ss !== UNICLASS_UNCLASSIFIED ? codesUnder(codes, 'ss', filter.ss) : []),
    ]
      .slice(0, 30)
      .map((row) => ({ ma: row.ma, ten: row.ten, so_luong: row.so_luong })),
    pham_vi: ctx.label,
    nguon: 'IfcClassificationReference trong tệp IFC',
  };
}
