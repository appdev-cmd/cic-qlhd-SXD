// Multi-step plans, undo stack, short descriptions of tool calls and question budgets for the BIM assistant
// (port of cic-hud services/ai/aiPlan).
import { getIfcLabel } from '../lib/ifcLabels';
import { normalizeVi } from '../lib/vietnameseBimMap';
import { BIM_VIEW_CHANGING_TOOLS } from './toolNames';

export interface BimToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ViewerPlan {
  id: string;
  steps: PlanStep[];
}

/** Plan approval: true runs every step, false cancels. */
export type PlanApprover = (plan: ViewerPlan) => Promise<boolean>;

export const COLOR_NAMES: Record<string, string> = {
  '#dc2626': 'đỏ',
  '#2563eb': 'xanh dương',
  '#eab308': 'vàng',
  '#16a34a': 'xanh lá',
  '#22c55e': 'xanh lá',
  '#ea580c': 'cam',
  '#f97316': 'cam',
  '#7c3aed': 'tím',
  '#a855f7': 'tím',
  '#db2777': 'hồng',
  '#0891b2': 'xanh ngọc',
};
const colorLabel = (value: unknown) => {
  const hex = String(value ?? '').toLowerCase();
  return COLOR_NAMES[hex] ?? (hex || 'mặc định');
};
/** "IFCCOLUMN" or "IFCCOLUMN,IFCCOLUMNTYPE" → "cột / trụ"; free text is kept. */
const categoryLabel = (value: unknown) => {
  const raw = String(value ?? '');
  const first = raw.split(',')[0].trim();
  return /^ifc[a-z]+$/i.test(first) ? getIfcLabel(first).toLowerCase() : raw;
};
const target = (args: Record<string, unknown>) => {
  const guids = Array.isArray(args.guids) ? args.guids.length : 0;
  const floor = args.tang ? ` tầng ${String(args.tang)}` : '';
  if (args.loai_cau_kien) return `${categoryLabel(args.loai_cau_kien)}${floor}`;
  if (guids) return `${guids} cấu kiện theo GUID${floor}`;
  return `đối tượng chỉ định${floor}`;
};
const PRESET_LABELS: Record<string, string> = {
  iso: 'phối cảnh',
  top: 'từ trên (mặt bằng)',
  bottom: 'từ dưới',
  front: 'mặt trước',
  back: 'mặt sau',
  left: 'bên trái',
  right: 'bên phải',
};
const DISCIPLINE_LABELS: Record<string, string> = {
  KIEN_TRUC: 'Kiến trúc',
  KET_CAU: 'Kết cấu',
  MEP: 'Cơ điện (MEP)',
  KIEN_TRUC_VA_KET_CAU: 'Kiến trúc và Kết cấu',
  TAT_CA: 'tất cả',
};

/** Short Vietnamese description of a tool call for plan previews and the action log. */
export function describeToolCall(tool: string, args: Record<string, unknown> = {}): string {
  switch (tool) {
    case 'viewer_isolate_elements':
      return `Cô lập ${target(args)}`;
    case 'viewer_highlight_elements':
      return Array.isArray(args.danh_sach)
        ? `Tô màu ${args.danh_sach
            .map(
              (item: { loai_cau_kien?: unknown; color?: unknown } | null) =>
                `${item?.loai_cau_kien ? categoryLabel(item.loai_cau_kien) : 'nhóm'} ${colorLabel(item?.color)}`,
            )
            .join(', ')}${args.tang ? ` tầng ${String(args.tang)}` : ''}`
        : `Tô màu ${target(args)} ${colorLabel(args.color)}`;
    case 'viewer_xray_elements':
      return `X-Ray ${target(args)}`;
    case 'viewer_hide_elements':
      return `Ẩn ${target(args)}`;
    case 'viewer_show_all':
      return 'Hiện lại toàn bộ mô hình';
    case 'viewer_fly_to_element':
      return `Bay tới cấu kiện ${String(args.guid ?? '')}`;
    case 'viewer_set_section':
      return args.tat
        ? 'Tắt mặt cắt'
        : args.tang
          ? `Cắt ngang tầng ${String(args.tang)}${args.toa_nha ? ` ${String(args.toa_nha)}` : ''}`
          : args.cao_do_m !== undefined
            ? `Cắt ngang ở cao độ ${String(args.cao_do_m)} m`
            : 'Đặt mặt cắt';
    case 'viewer_set_section_box':
      return args.tat
        ? 'Tắt hộp cắt'
        : args.tang
          ? `Hộp cắt quanh tầng ${String(args.tang)}`
          : `Hộp cắt quanh ${target(args)}`;
    case 'viewer_set_view':
      return `Nhìn ${PRESET_LABELS[String(args.preset ?? 'iso')] ?? String(args.preset)}`;
    case 'viewer_toggle_discipline': {
      const name = DISCIPLINE_LABELS[String(args.bo_mon ?? '')] ?? String(args.bo_mon ?? '');
      return `${args.hien_thi === false ? 'Ẩn' : args.chi_hien_bo_mon_nay ? 'Chỉ hiện' : 'Hiện'} bộ môn ${name}`;
    }
    case 'viewer_apply_view':
      return `Áp góc nhìn "${String(args.ten ?? args.id ?? '')}"`;
    case 'viewer_list_saved_views':
      return 'Liệt kê góc nhìn đã lưu';
    case 'viewer_save_view':
      return `Lưu góc nhìn "${String(args.ten ?? '')}"`;
    case 'viewer_get_section_context':
      return 'Đọc tầng và cao độ của mô hình';
    case 'viewer_show_clash_cluster':
      return `Hiển thị cụm va chạm ${String(args.cum ?? '')}`;
    case 'viewer_filter_uniclass':
      return `${args.action === 'highlight' ? 'Tô màu' : 'Cô lập'} theo Uniclass ${[args.pr, args.ss].filter(Boolean).join(' + ')}${args.tang ? ` tầng ${String(args.tang)}` : ''}`;
    case 'get_bim_uniclass':
      return `Tra Uniclass ${[args.pr, args.ss, args.query].filter(Boolean).join(' + ') || 'đang dùng'}`;
    case 'viewer_measure_distance':
      return 'Đo khoảng cách giữa hai cấu kiện';
    case 'viewer_undo':
      return 'Hoàn tác thao tác khung nhìn gần nhất';
    case 'search_bim_elements': {
      const parts = [
        args.loai_cau_kien,
        args.tang ? `tầng ${String(args.tang)}` : null,
        args.thap ? `tháp ${String(args.thap)}` : null,
        args.chong_chay ? 'chống cháy' : null,
        args.has_acceptance === false ? 'chưa nghiệm thu' : args.has_acceptance ? 'đã nghiệm thu' : null,
        args.keyword,
      ].filter(Boolean);
      return `Tìm cấu kiện${parts.length ? `: ${parts.join(', ')}` : ''}`;
    }
    default:
      return tool;
  }
}

export function needsPlanPreview(calls: { name: string }[]): boolean {
  return calls.filter((call) => BIM_VIEW_CHANGING_TOOLS.has(call.name)).length >= 2;
}

let planSeq = 0;
export function buildPlan(calls: { name: string; args?: Record<string, unknown> }[]): ViewerPlan {
  planSeq += 1;
  return {
    id: `plan-${planSeq}-${Math.random().toString(36).slice(2, 7)}`,
    steps: calls.map((call) => ({
      tool: call.name,
      args: call.args ?? {},
      summary: describeToolCall(call.name, call.args ?? {}),
    })),
  };
}

/** Undo stack for the assistant's view actions; keeps at most `limit` steps. */
export class ViewerUndoStack<S = unknown> {
  private items: { label: string; snapshot: S }[] = [];
  constructor(private readonly limit = 20) {}
  push(label: string, snapshot: S) {
    this.items.push({ label, snapshot });
    if (this.items.length > this.limit) this.items.shift();
  }
  pop() {
    return this.items.pop() ?? null;
  }
  peek() {
    return this.items[this.items.length - 1] ?? null;
  }
  get depth() {
    return this.items.length;
  }
  clear() {
    this.items = [];
  }
  labels() {
    return this.items.map((item) => item.label);
  }
}

export type QuestionKind = 'viewer' | 'lookup' | 'analysis';

export interface QuestionBudget {
  kind: QuestionKind;
  maxRounds: number;
  timeMs: number;
  maxOutputTokens: number;
}

/** Tool rounds, time and answer length by question kind (used by the future server assistant). */
export function questionBudget(question: string): QuestionBudget {
  const raw = normalizeVi(question);
  if (/\b(bao cao|soan|lap ke hoach|ke hoach|tong hop toan dien|danh gia|phan tich|de xuat|giao ban)\b/.test(raw))
    return { kind: 'analysis', maxRounds: 10, timeMs: 90_000, maxOutputTokens: 8192 };
  // "tóm tắt", "tất cả", "bất thường", "an toàn", "dự án" are not view commands (tắt/bật/ẩn).
  const text = raw.replace(/\b(tom tat|tat ca|an toan|du an|bat (thuong|ky|dau|buoc))\b/g, ' ');
  if (
    /\b(chi hien|co lap|to mau|x-?ray|xuyen thau|an|hien lai|bat|tat|cat ngang|cat tang|cat o|hop cat|bay toi|goc nhin|hoan tac|do khoang cach|cum va cham)\b/.test(
      text,
    )
  )
    return { kind: 'viewer', maxRounds: 5, timeMs: 30_000, maxOutputTokens: 2048 };
  return { kind: 'lookup', maxRounds: 6, timeMs: 45_000, maxOutputTokens: 4096 };
}
