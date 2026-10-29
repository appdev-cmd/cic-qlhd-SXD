import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/SpatialTree.tsx
// Cây cấu kiện công trình: nhóm theo loại IFC, theo vị trí (tầng / phân đoạn) hoặc theo cây không gian của tệp IFC.
// Khi ghép nhiều mô hình, cây hiển thị theo cấp: Mô hình › Nhóm › Cấu kiện.

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  Search,
  Folder,
  FolderOpen,
  Box,
  ChevronRight,
  ChevronDown,
  Layers,
  Loader2,
  MapPin,
  Shapes,
  Eye,
  EyeOff,
  Building2,
  Boxes,
} from 'lucide-react';
import { BimElement, BimElementFilter, BimModel, BimQuantitySummaryRow } from '@/features/bim-suite/types/bim.types';
import type { BimSpatialNode } from './BimViewer';
import { getIfcLabel, disciplineLabels } from '../lib/ifcLabels';
import { useBimElementsPaged, useBimQuantitySummary } from '../hooks/useBim';
import { resolveSearch } from '../lib/bimSearch';
import { normalizeVi } from '../lib/vietnameseBimMap';
import {
  allUnnamedLeafIds,
  countLeaves,
  defaultExpandedKeys,
  displayName,
  flattenVisible,
  searchSpatialTree,
  unnamedLeafIds,
  type FlatSpatialRow,
  type LazySpatialTree,
} from '../lib/spatialTree';
import { VirtualRows } from './VirtualRows';

type GroupMode = 'loai' | 'vi_tri' | 'khong_gian';

interface SpatialTreeProps {
  /** Các mô hình đang hiển thị trong khung 3D (mô hình chính + mô hình ghép) */
  models: BimModel[];
  selectedModelId?: string | null;
  selectedExpressId?: number | null;
  onSelectElement: (element: BimElement, modelId: string) => void;
  /** Đọc cây không gian trực tiếp từ mô hình 3D (Công trình › Tầng › Loại › Cấu kiện) */
  loadSpatialTree?: (modelId: string) => Promise<BimSpatialNode[]>;
  /** Ẩn/hiện nhánh trên mô hình 3D */
  onHiddenChange?: (hiddenIds: number[], modelId: string) => void;
  /** Chọn cấu kiện theo expressId khi bấm trong cây không gian */
  onSelectExpressId?: (expressId: number, modelId: string) => void;
  className?: string;
}

interface Group {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  filter: BimElementFilter;
}

const buildGroups = (rows: BimQuantitySummaryRow[], mode: GroupMode): Group[] => {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = mode === 'loai' ? r.loai_cau_kien : r.phan_doan_tang;
    const g = map.get(key);
    if (g) {
      g.count += r.so_luong;
      continue;
    }
    map.set(
      key,
      mode === 'loai'
        ? { key, label: getIfcLabel(key), sublabel: key, count: r.so_luong, filter: { loai_cau_kien: key } }
        : { key, label: key || 'Chưa gán vị trí', count: r.so_luong, filter: { phan_doan_tang: key } },
    );
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
};

const shortName = (model: BimModel) => model.file_name.replace(/\.(ifc|ifczip|zip)$/i, '');

const ElementRow: React.FC<{ el: BimElement; selected: boolean; onClick: () => void; showType?: boolean }> = ({
  el,
  selected,
  onClick,
  showType,
}) => (
  <button
    onClick={onClick}
    data-tooltip={`${el.ten_cau_kien || ''}\nGUID: ${el.global_id}`}
    className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-md transition-colors ${
      selected
        ? 'bg-primary-600 text-white font-medium shadow-sm'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
    }`}
  >
    <Box className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-white' : 'text-slate-400'}`} />
    <span className="truncate flex-1">
      {el.ten_cau_kien || `Cấu kiện #${el.express_id}`}
      {showType && (
        <span className={`ml-1 text-2xs ${selected ? 'text-primary-100' : 'text-slate-400'}`}>
          · {getIfcLabel(el.loai_cau_kien)}
        </span>
      )}
    </span>
    {el.the_tich_be_tong != null && el.the_tich_be_tong > 0 && (
      <span className={`text-2xs shrink-0 ${selected ? 'text-primary-100' : 'text-slate-400'}`}>
        {formatNumber(el.the_tich_be_tong, 2)} m³
      </span>
    )}
  </button>
);

/** Danh sách cấu kiện của một nhóm/tìm kiếm, có nút "Tải thêm" */
const ElementList: React.FC<{
  modelId: string;
  filter: BimElementFilter;
  selectedExpressId?: number | null;
  onSelectElement: (el: BimElement) => void;
  showType?: boolean;
  emptyLabel?: string;
}> = ({ modelId, filter, selectedExpressId, onSelectElement, showType, emptyLabel }) => {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useBimElementsPaged(
    modelId,
    filter,
  );
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-2xs text-slate-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Đang tải...
      </div>
    );
  }
  if (isError) return <p className="px-2 py-1.5 text-2xs text-rose-500">Không tải được danh sách cấu kiện</p>;
  if (items.length === 0)
    return <p className="px-2 py-1.5 text-2xs text-slate-400 italic">{emptyLabel || 'Không có cấu kiện'}</p>;

  return (
    <>
      {items.map((el) => (
        <ElementRow
          key={el.express_id}
          el={el}
          selected={selectedExpressId === el.express_id}
          onClick={() => onSelectElement(el)}
          showType={showType}
        />
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full flex items-center justify-center gap-1.5 py-1 text-2xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-60"
        >
          {isFetchingNextPage && <Loader2 className="w-3 h-3 animate-spin" />}
          Tải thêm cấu kiện
        </button>
      )}
    </>
  );
};

const TREE_ROW_HEIGHT = 24;
const NAME_CHUNK = 2000;

/** Một dòng của cây không gian (đã làm phẳng), có nút ẩn/hiện riêng */
const SpatialNodeRow: React.FC<{
  row: FlatSpatialRow<BimSpatialNode>;
  label: string;
  hidden: boolean;
  selected: boolean;
  onToggleOpen: (node: BimSpatialNode) => void;
  onToggleHidden: (node: BimSpatialNode) => void;
  onSelect: (expressId: number) => void;
}> = ({ row, label, hidden, selected, onToggleOpen, onToggleHidden, onSelect }) => {
  const { node, depth, hasChildren, expanded } = row;
  return (
    <div
      className={`h-full flex items-center gap-1 pr-1 rounded-md ${
        selected ? 'bg-primary-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
      }`}
      style={{ paddingLeft: depth * 10 + 2 }}
      data-node-key={node.key}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleOpen(node)}
          className="p-0.5 text-slate-400 shrink-0"
          aria-label={expanded ? 'Thu gọn' : 'Mở rộng'}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        className={`flex-1 min-w-0 text-left truncate ${hidden ? 'opacity-40 line-through' : ''}`}
        data-tooltip={`${label} · ${node.ids.length} cấu kiện`}
        onClick={() => (!hasChildren && node.localId !== null ? onSelect(node.localId) : onToggleOpen(node))}
      >
        {label}
      </button>
      <span className={`text-2xs shrink-0 tabular-nums ${selected ? 'text-primary-100' : 'text-slate-400'}`}>
        {node.ids.length}
      </span>
      <button
        type="button"
        onClick={() => onToggleHidden(node)}
        className={`p-0.5 shrink-0 ${selected ? 'text-primary-100' : 'text-slate-400 hover:text-primary-600'}`}
        data-tooltip={hidden ? 'Hiện nhánh này' : 'Ẩn nhánh này'}
      >
        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </div>
  );
};

const union = (a: Set<string>, b: Set<string>) => {
  const out = new Set(a);
  b.forEach((k) => out.add(k));
  return out;
};

/**
 * Cây không gian của một mô hình (đọc trực tiếp từ khung nhìn 3D).
 * Danh sách ảo hóa; tên cấu kiện đọc theo lô khi mở nút (hoặc khi tìm theo tên), không đọc hết khi mở cây.
 */
export const ModelSpatialTree: React.FC<{
  modelId: string;
  search?: string;
  selectedExpressId?: number | null;
  loadSpatialTree?: (modelId: string) => Promise<BimSpatialNode[]>;
  onHiddenChange?: (ids: number[], modelId: string) => void;
  onSelectExpressId?: (expressId: number, modelId: string) => void;
  maxHeight?: number;
}> = ({ modelId, search = '', selectedExpressId, loadSpatialTree, onHiddenChange, onSelectExpressId, maxHeight }) => {
  const [tree, setTree] = useState<LazySpatialTree<BimSpatialNode> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [namesVersion, setNamesVersion] = useState(0);
  const namesRef = useRef(new Map<number, string>());
  const normNamesRef = useRef(new Map<number, string>());
  const pendingRef = useRef(new Set<number>());
  const generationRef = useRef(0);
  const loaderRef = useRef(loadSpatialTree);
  loaderRef.current = loadSpatialTree;
  const snapshotRef = useRef<Set<string> | null>(null);

  // Đổi mô hình → đọc lại cây, xóa tên đã đọc
  useEffect(() => {
    const generation = ++generationRef.current;
    setTree(null);
    setLoadError(null);
    setHiddenNodes(new Set());
    namesRef.current = new Map();
    normNamesRef.current = new Map();
    pendingRef.current = new Set();
    const loader = loaderRef.current;
    if (!loader) return;
    loader(modelId)
      .then((data) => {
        if (generation !== generationRef.current) return;
        const t = (data || []) as LazySpatialTree<BimSpatialNode>;
        // Tên các nút nhóm đã có sẵn (tầng, công trình) dùng luôn cho tìm kiếm
        const stack = [...t];
        while (stack.length) {
          const n = stack.pop()!;
          if (n.children.length) {
            if (n.localId !== null && n.name && n.name !== n.category) {
              namesRef.current.set(n.localId, n.name);
              normNamesRef.current.set(n.localId, normalizeVi(n.name));
            }
            stack.push(...n.children);
          }
        }
        setExpanded(defaultExpandedKeys(t));
        setTree(t);
      })
      .catch((e: any) => {
        if (generation === generationRef.current) setLoadError(e?.message || 'Không đọc được cây không gian');
      });
  }, [modelId]);

  /** Đọc tên theo lô (2.000 cấu kiện/lần) qua worker của mô hình; bỏ kết quả nếu đã đổi mô hình */
  const requestNames = useCallback(
    async (ids: number[]) => {
      const resolve = tree?.resolveNames;
      if (!resolve) return;
      const need = ids.filter((id) => !namesRef.current.has(id) && !pendingRef.current.has(id));
      if (!need.length) return;
      need.forEach((id) => pendingRef.current.add(id));
      const generation = generationRef.current;
      for (let i = 0; i < need.length; i += NAME_CHUNK) {
        const slice = need.slice(i, i + NAME_CHUNK);
        try {
          const got = await resolve(slice);
          if (generation !== generationRef.current) return;
          got.forEach((name, id) => {
            namesRef.current.set(id, name);
            normNamesRef.current.set(id, normalizeVi(name));
          });
        } catch {
          // Không đọc được tên lô này: giữ nhãn loại cấu kiện
        } finally {
          slice.forEach((id) => pendingRef.current.delete(id));
        }
        if (generation !== generationRef.current) return;
        setNamesVersion((v) => v + 1);
      }
    },
    [tree],
  );

  const resolved = useMemo(() => resolveSearch(search), [search]);
  const searching = resolved.raw.length > 0;

  // Tìm theo tên cần tên của mọi cấu kiện: đọc dần ở nền (không chặn giao diện), kết quả cập nhật theo lô
  const totalLeaves = useMemo(() => (tree ? countLeaves(tree) : 0), [tree]);
  useEffect(() => {
    if (!tree || !searching) return;
    requestNames(allUnnamedLeafIds(tree, namesRef.current));
  }, [tree, searching, requestNames]);

  const searchResult = useMemo(
    () => (tree && searching ? searchSpatialTree(tree, resolved, normNamesRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, resolved, searching, namesVersion],
  );

  // Khi tìm: mở các nhánh chứa kết quả; xóa từ khóa → trả lại trạng thái mở/thu gọn trước đó
  useEffect(() => {
    if (searchResult) {
      if (!snapshotRef.current) snapshotRef.current = expanded;
      setExpanded((prev) => union(prev, searchResult.expanded));
    } else if (snapshotRef.current) {
      setExpanded(snapshotRef.current);
      snapshotRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResult]);

  const rows = useMemo(
    () => (tree ? flattenVisible(tree, expanded, searchResult ? searchResult.visible : null) : []),
    [tree, expanded, searchResult],
  );

  const toggleOpen = (node: BimSpatialNode) => {
    const opening = !expanded.has(node.key);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.key)) next.delete(node.key);
      else next.add(node.key);
      return next;
    });
    // Mở nút → đọc tên các cấu kiện con trực tiếp của nút này
    if (opening) requestNames(unnamedLeafIds(node, namesRef.current));
  };

  const toggleHiddenNode = (node: BimSpatialNode) => {
    const next = new Set(hiddenNodes);
    if (next.has(node.key)) next.delete(node.key);
    else next.add(node.key);
    setHiddenNodes(next);
    // Gộp toàn bộ cấu kiện thuộc các nhánh đang ẩn
    const hiddenIds = new Set<number>();
    const stack: BimSpatialNode[] = [...(tree || [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (next.has(n.key)) n.ids.forEach((id) => hiddenIds.add(id));
      else stack.push(...n.children);
    }
    onHiddenChange?.([...hiddenIds], modelId);
  };

  const selectedIndex = useMemo(
    () =>
      selectedExpressId == null ? -1 : rows.findIndex((r) => !r.hasChildren && r.node.localId === selectedExpressId),
    [rows, selectedExpressId],
  );

  if (loadError) return <p className="p-4 text-center text-rose-500">{loadError}</p>;
  if (tree === null) {
    return (
      <div className="p-4 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc cây không gian...
      </div>
    );
  }
  if (tree.length === 0)
    return <p className="p-4 text-center text-slate-400">Mô hình không khai báo cấu trúc không gian.</p>;

  const names = namesRef.current;
  const loadingNames = searching && !!tree.resolveNames && pendingRef.current.size > 0;

  return (
    <div className="space-y-0.5">
      {hiddenNodes.size > 0 && (
        <button
          type="button"
          onClick={() => {
            setHiddenNodes(new Set());
            onHiddenChange?.([], modelId);
          }}
          className="w-full py-1 mb-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-2xs text-slate-600 dark:text-slate-300"
        >
          Hiện lại {hiddenNodes.size} nhánh đang ẩn
        </button>
      )}
      {searching && (
        <p className="px-2 py-0.5 text-2xs text-slate-400 flex items-center gap-1" role="status">
          {loadingNames && <Loader2 className="w-3 h-3 animate-spin" />}
          {searchResult?.matches ? `${formatNumber(searchResult.matches, 2)} nhánh khớp` : 'Chưa có nhánh khớp'}
          {resolved.canonicalVi ? ` · hiểu là "${resolved.canonicalVi}"` : ''}
          {loadingNames ? ` · đang đọc tên cấu kiện (${formatNumber(totalLeaves, 2)})` : ''}
        </p>
      )}
      <VirtualRows
        items={rows}
        rowHeight={TREE_ROW_HEIGHT}
        maxHeight={maxHeight}
        getKey={(r) => r.node.key}
        scrollToIndex={selectedIndex >= 0 ? selectedIndex : null}
        ariaLabel="Cây không gian"
        renderRow={(r) => (
          <SpatialNodeRow
            row={r}
            label={displayName(r, names)}
            hidden={hiddenNodes.has(r.node.key)}
            selected={!r.hasChildren && r.node.localId !== null && r.node.localId === selectedExpressId}
            onToggleOpen={toggleOpen}
            onToggleHidden={toggleHiddenNode}
            onSelect={(id) => onSelectExpressId?.(id, modelId)}
          />
        )}
      />
    </div>
  );
};

/** Nội dung cây của MỘT mô hình theo chế độ nhóm đang chọn */
const ModelTreeBody: React.FC<{
  model: BimModel;
  mode: GroupMode;
  search: string;
  selectedExpressId?: number | null;
  isSelectedModel: boolean;
  openGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  onSelectElement: (el: BimElement, modelId: string) => void;
  loadSpatialTree?: (modelId: string) => Promise<BimSpatialNode[]>;
  onHiddenChange?: (ids: number[], modelId: string) => void;
  onSelectExpressId?: (expressId: number, modelId: string) => void;
}> = ({
  model,
  mode,
  search,
  selectedExpressId,
  isSelectedModel,
  openGroups,
  toggleGroup,
  onSelectElement,
  loadSpatialTree,
  onHiddenChange,
  onSelectExpressId,
}) => {
  const { data: summary = [], isLoading } = useBimQuantitySummary(
    mode === 'khong_gian' || search ? undefined : model.id,
  );
  const groups = useMemo(() => buildGroups(summary, mode === 'khong_gian' ? 'loai' : mode), [summary, mode]);
  const expressId = isSelectedModel ? selectedExpressId : null;

  if (mode === 'khong_gian') {
    return (
      <ModelSpatialTree
        modelId={model.id}
        search={search}
        selectedExpressId={expressId}
        loadSpatialTree={loadSpatialTree}
        onHiddenChange={onHiddenChange}
        onSelectExpressId={onSelectExpressId}
      />
    );
  }

  if (search) {
    return (
      <ElementList
        modelId={model.id}
        filter={{ search }}
        selectedExpressId={expressId}
        onSelectElement={(el) => onSelectElement(el, model.id)}
        showType
        emptyLabel="Không có cấu kiện khớp từ khóa"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải cây cấu kiện...
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="p-4 text-center text-slate-400 dark:text-slate-500">
        Chưa có dữ liệu cấu kiện.
        <br />
        <span className="text-2xs">Mô hình cần được chuyển đổi (hoặc chuyển đổi lại) để bóc tách cấu kiện.</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {groups.map((g) => {
        const groupKey = `${model.id}:${mode}:${g.key}`;
        const isOpen = !!openGroups[groupKey];
        return (
          <div key={g.key} className="space-y-0.5">
            <button
              onClick={() => toggleGroup(groupKey)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-medium transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="w-4 h-4 text-primary-500 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-primary-500 shrink-0" />
                )}
                <span className="truncate">{g.label}</span>
                {g.sublabel && <span className="text-2xs text-slate-400 font-mono truncate">({g.sublabel})</span>}
              </div>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-2xs shrink-0 font-medium">
                {formatNumber(g.count, 2)}
              </span>
            </button>

            {isOpen && (
              <div className="pl-6 pr-1 space-y-0.5 border-l border-slate-200/60 dark:border-slate-700 ml-3 my-0.5">
                <ElementList
                  modelId={model.id}
                  filter={g.filter}
                  selectedExpressId={expressId}
                  onSelectElement={(el) => onSelectElement(el, model.id)}
                  showType={mode === 'vi_tri'}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const SpatialTree: React.FC<SpatialTreeProps> = ({
  models,
  selectedModelId,
  selectedExpressId,
  onSelectElement,
  loadSpatialTree,
  onHiddenChange,
  onSelectExpressId,
  className = '',
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<GroupMode>('loai');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<'all' | string>('all');
  const [openModels, setOpenModels] = useState<Record<string, boolean>>({});

  const ready = useMemo(() => models.filter((m) => m.status === 'ready'), [models]);
  const targets = useMemo(() => (scope === 'all' ? ready : ready.filter((m) => m.id === scope)), [ready, scope]);
  const multi = targets.length > 1;
  const total = ready.reduce((s, m) => s + (m.element_count ?? 0), 0);
  const shownTotal = targets.reduce((s, m) => s + (m.element_count ?? 0), 0);

  // Trì hoãn tìm kiếm 300ms để không truy vấn theo từng phím
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Bỏ tích mô hình đang xem riêng → quay lại xem tất cả
  useEffect(() => {
    if (scope !== 'all' && !ready.some((m) => m.id === scope)) setScope('all');
  }, [ready, scope]);

  // Mô hình chứa cấu kiện đang chọn luôn được mở sẵn
  useEffect(() => {
    if (selectedModelId) setOpenModels((prev) => (prev[selectedModelId] ? prev : { ...prev, [selectedModelId]: true }));
  }, [selectedModelId]);

  const toggleGroup = (key: string) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden ${className}`}
    >
      {/* Tìm kiếm & chế độ nhóm */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <BimInput
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm tên, loại (VD: cột, ống gió), vật liệu, GUID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
        </div>

        {ready.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <BimSelect
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 text-2xs bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900 rounded-lg text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tất cả {ready.length} mô hình đang ghép</option>
              {ready.map((m) => (
                <option key={m.id} value={m.id}>
                  {shortName(m)}
                </option>
              ))}
            </BimSelect>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
          <div className="flex shrink-0 rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-900">
            {(
              [
                ['loai', 'Loại', Shapes],
                ['vi_tri', 'Vị trí', MapPin],
                ['khong_gian', 'Cây', Building2],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 transition-colors ${
                  mode === m
                    ? 'bg-white font-semibold text-primary-600 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                    : 'hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" />
                {label}
              </button>
            ))}
          </div>
          <span
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            data-tooltip={
              multi
                ? `${ready.length} mô hình đang hiển thị · ${formatNumber(shownTotal, 2)} cấu kiện`
                : `${formatNumber(shownTotal, 2)} cấu kiện`
            }
          >
            <Layers className="h-3 w-3 shrink-0 text-violet-500" />
            {formatNumber(shownTotal, 2)}
            {shownTotal !== total && <span className="text-slate-400">/{formatNumber(total, 2)}</span>} CK
          </span>
        </div>
      </div>

      {/* Nội dung cây */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {targets.length === 0 ? (
          <div className="p-6 text-center text-slate-400 dark:text-slate-500">Chưa chọn mô hình</div>
        ) : search && multi ? (
          // Tìm kiếm khi ghép: gom kết quả theo từng mô hình
          <div className="space-y-1">
            <p className="px-2 py-1 text-2xs text-slate-400">
              Kết quả tìm “{search}” trong {targets.length} mô hình
            </p>
            {targets.map((m) => (
              <div key={m.id} className="space-y-0.5">
                <p className="px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 truncate">
                  {shortName(m)}
                </p>
                <div className="pl-2 border-l border-violet-200/60 dark:border-violet-900 ml-1">
                  <ModelTreeBody
                    model={m}
                    mode={mode}
                    search={search}
                    selectedExpressId={selectedExpressId}
                    isSelectedModel={selectedModelId === m.id}
                    openGroups={openGroups}
                    toggleGroup={toggleGroup}
                    onSelectElement={onSelectElement}
                    loadSpatialTree={loadSpatialTree}
                    onHiddenChange={onHiddenChange}
                    onSelectExpressId={onSelectExpressId}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : !multi ? (
          // Một mô hình: hiện thẳng nhóm cấu kiện cho gọn
          <ModelTreeBody
            model={targets[0]}
            mode={mode}
            search={search}
            selectedExpressId={selectedExpressId}
            isSelectedModel={selectedModelId === targets[0].id || targets.length === 1}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
            onSelectElement={onSelectElement}
            loadSpatialTree={loadSpatialTree}
            onHiddenChange={onHiddenChange}
            onSelectExpressId={onSelectExpressId}
          />
        ) : (
          // Ghép nhiều mô hình: Mô hình › Nhóm › Cấu kiện
          targets.map((m) => {
            const isOpen = !!openModels[m.id];
            return (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200/80 dark:border-slate-700 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenModels((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                    selectedModelId === m.id
                      ? 'bg-violet-50 dark:bg-violet-950'
                      : 'bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700/40'
                  }`}
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <Boxes className="w-4 h-4 text-violet-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span
                      className="block truncate font-semibold text-slate-800 dark:text-slate-100"
                      data-tooltip={m.file_name}
                    >
                      {shortName(m)}
                    </span>
                    <span className="block text-2xs text-slate-400 truncate">
                      {disciplineLabels[m.discipline] || m.discipline} · v{m.phien_ban ?? 1}
                    </span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-2xs shrink-0 font-medium tabular-nums">
                    {formatNumber((m.element_count ?? 0), 2)}
                  </span>
                </button>
                {isOpen && (
                  <div className="p-1.5 border-t border-slate-200/70 dark:border-slate-700">
                    <ModelTreeBody
                      model={m}
                      mode={mode}
                      search={search}
                      selectedExpressId={selectedExpressId}
                      isSelectedModel={selectedModelId === m.id}
                      openGroups={openGroups}
                      toggleGroup={toggleGroup}
                      onSelectElement={onSelectElement}
                      loadSpatialTree={loadSpatialTree}
                      onHiddenChange={onHiddenChange}
                      onSelectExpressId={onSelectExpressId}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
