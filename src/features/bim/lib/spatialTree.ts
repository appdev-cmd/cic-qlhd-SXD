// features/bim/lib/spatialTree.ts
// Xử lý cây không gian IFC (Công trình › Tầng › Loại › Cấu kiện) cho danh sách ảo hóa:
// mặc định thu gọn từ cấp tầng trở xuống, làm phẳng các nút đang mở, tìm kiếm theo từ đồng nghĩa
// và lấy tên cấu kiện theo nút mở (không đọc tên của mọi cấu kiện ngay khi mở cây).

import { getIfcLabel } from './ifcLabels';
import { normalizeVi } from './vietnameseBimMap';
import type { ResolvedSearch } from './bimSearch';

export interface SpatialNodeLike {
  key: string;
  name: string;
  category: string;
  localId: number | null;
  ids: number[];
  children: SpatialNodeLike[];
}

/** Cây trả về từ trình xem; `resolveNames` đọc tên của nhóm cấu kiện khi cần (theo lô) */
export type LazySpatialTree<N extends SpatialNodeLike = SpatialNodeLike> = N[] & {
  resolveNames?: (ids: number[]) => Promise<Map<number, string>>;
};

export const STOREY_CATEGORY = 'IFCBUILDINGSTOREY';
const ABOVE_STOREY = new Set([
  'IFCPROJECT',
  'IFCSITE',
  'IFCBUILDING',
  'IFCFACILITY',
  'IFCFACILITYPART',
  'IFCBRIDGE',
  'IFCBRIDGEPART',
  'IFCROAD',
  'IFCROADPART',
  'IFCRAILWAY',
  'IFCRAILWAYPART',
  'IFCTUNNEL',
]);

const upper = (s: string | null | undefined) => String(s || '').toUpperCase();

/** Mở sẵn các cấp trên tầng (dự án, khu đất, công trình); tầng và cấp dưới thu gọn */
export function defaultExpandedKeys(nodes: SpatialNodeLike[]): Set<string> {
  const out = new Set<string>();
  const walk = (list: SpatialNodeLike[]) => {
    for (const n of list) {
      if (!n.children.length) continue;
      if (ABOVE_STOREY.has(upper(n.category))) {
        out.add(n.key);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  if (out.size === 0) {
    for (const n of nodes) if (n.children.length && upper(n.category) !== STOREY_CATEGORY) out.add(n.key);
  }
  return out;
}

export interface FlatSpatialRow<N extends SpatialNodeLike = SpatialNodeLike> {
  node: N;
  depth: number;
  /** Lớp IFC hiệu lực: của chính nút hoặc nút nhóm loại phía trên */
  category: string;
  hasChildren: boolean;
  expanded: boolean;
}

/** Làm phẳng các nút đang hiển thị (duyệt sâu, giữ thứ tự) — đầu vào của danh sách ảo hóa */
export function flattenVisible<N extends SpatialNodeLike>(
  nodes: N[],
  expanded: Set<string>,
  visible?: Set<string> | null,
): FlatSpatialRow<N>[] {
  const rows: FlatSpatialRow<N>[] = [];
  const stack: { node: N; depth: number; category: string }[] = [];
  for (let i = nodes.length - 1; i >= 0; i--)
    stack.push({ node: nodes[i], depth: 0, category: upper(nodes[i].category) });
  while (stack.length) {
    const { node, depth, category } = stack.pop()!;
    if (visible && !visible.has(node.key)) continue;
    const hasChildren = node.children.length > 0;
    const isOpen = hasChildren && expanded.has(node.key);
    rows.push({ node, depth, category, hasChildren, expanded: isOpen });
    if (isOpen) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i] as N;
        stack.push({ node: child, depth: depth + 1, category: upper(child.category) || category });
      }
    }
  }
  return rows;
}

/** Cấu kiện con trực tiếp (lá) của một nút chưa có tên — cần đọc khi mở nút */
export function unnamedLeafIds(node: SpatialNodeLike, names: Map<number, string>): number[] {
  const out: number[] = [];
  for (const c of node.children)
    if (!c.children.length && c.localId !== null && !names.has(c.localId)) out.push(c.localId);
  return out;
}

/** Mọi lá chưa có tên trong cây (dùng khi tìm theo tên) */
export function allUnnamedLeafIds(nodes: SpatialNodeLike[], names: Map<number, string>): number[] {
  const out: number[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.children.length) {
      if (n.localId !== null && !names.has(n.localId)) out.push(n.localId);
    } else stack.push(...n.children);
  }
  return out;
}

export function countLeaves(nodes: SpatialNodeLike[]): number {
  let total = 0;
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.children.length) total += n.localId !== null ? 1 : 0;
    else stack.push(...n.children);
  }
  return total;
}

/** Tên hiển thị: tên đã đọc → tên nút (tầng, công trình) → nhãn tiếng Việt của lớp IFC */
export function displayName(
  row: Pick<FlatSpatialRow, 'node' | 'category' | 'hasChildren'>,
  names: Map<number, string>,
): string {
  const { node } = row;
  if (node.localId !== null && names.has(node.localId)) return names.get(node.localId)!;
  if (!row.hasChildren && node.localId !== null) return `${getIfcLabel(row.category) || 'Cấu kiện'} #${node.localId}`;
  if (node.localId === null && node.category) return getIfcLabel(upper(node.category));
  return node.name || getIfcLabel(row.category) || 'Nhóm';
}

export interface TreeSearchResult {
  /** Khóa các nút được hiển thị (nút khớp, toàn bộ nhánh con của nó và các nút cha) */
  visible: Set<string>;
  /** Nút cần mở để thấy kết quả */
  expanded: Set<string>;
  /** Số nút khớp trực tiếp */
  matches: number;
}

/**
 * Lọc cây theo từ khóa đã phân giải. `normNames` là tên đã bỏ dấu theo localId (đọc dần khi cần).
 * Nút nhóm loại (VD IFCCOLUMN) khớp từ đồng nghĩa "cột" → cả nhánh hiển thị.
 */
export function searchSpatialTree(
  nodes: SpatialNodeLike[],
  r: ResolvedSearch,
  normNames: Map<number, string>,
): TreeSearchResult {
  const visible = new Set<string>();
  const expanded = new Set<string>();
  let matches = 0;
  const labelCache = new Map<string, string>();
  const catHay = (cat: string) => {
    let v = labelCache.get(cat);
    if (v === undefined) {
      v = cat ? `${normalizeVi(cat)} ${normalizeVi(getIfcLabel(cat))}` : '';
      labelCache.set(cat, v);
    }
    return v;
  };
  const showAll = (n: SpatialNodeLike) => {
    const stack = [n];
    while (stack.length) {
      const x = stack.pop()!;
      visible.add(x.key);
      stack.push(...x.children);
    }
  };
  const isMatch = (n: SpatialNodeLike, cat: string) => {
    const name = n.localId !== null ? (normNames.get(n.localId) ?? (n.children.length ? normalizeVi(n.name) : '')) : '';
    const hay = `${name} ${catHay(cat)}`;
    if (
      r.classes.length &&
      r.classes.includes(cat) &&
      (r.residualNorm.length === 0 || r.residualNorm.every((t) => hay.includes(t)))
    )
      return true;
    return r.normTokens.length > 0 && r.normTokens.every((t) => hay.includes(t));
  };
  const visit = (n: SpatialNodeLike, parentCat: string): boolean => {
    const cat = upper(n.category) || parentCat;
    if (isMatch(n, cat)) {
      matches++;
      showAll(n);
      if (n.children.length) expanded.add(n.key);
      return true;
    }
    let any = false;
    for (const c of n.children) if (visit(c, cat)) any = true;
    if (any) {
      visible.add(n.key);
      expanded.add(n.key);
    }
    return any;
  };
  for (const n of nodes) visit(n, '');
  return { visible, expanded, matches };
}
