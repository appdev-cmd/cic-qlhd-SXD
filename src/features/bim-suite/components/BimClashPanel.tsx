import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimClashPanel.tsx
// Dò va chạm giữa hai mô hình (hoặc trong một mô hình):
//  1. Sàng lọc theo khung bao (AABB) trong Web Worker — có tiến độ, hủy được, báo đủ tổng số khi danh sách bị giới hạn
//  2. Kiểm tra lưới tam giác thật (pha hẹp, cũng trong worker)
//  3. Phân loại thật/giả (quy tắc + AI)  4. Gom theo cặp loại, theo tầng hoặc theo cụm vị trí (lưới 1 m)
//  5. Lưu phiên, gán trạng thái xử lý, nhớ cặp đã bỏ qua trong cả dự án, chạy lại khi có phiên bản mới

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  X,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Crosshair,
  Download,
  Save,
  History,
  RefreshCw,
  Sparkles,
  Trash2,
  Layers,
  Focus,
  EyeOff,
  Ban,
} from 'lucide-react';
import {
  BimModel,
  BimClashRow,
  BimClashSession,
  BimClashStatus,
  BimClashVerdict,
} from '@/features/bim-suite/types/bim.types';
import type { ClashBox } from '../lib/clashDetection';
import { runBroadPhase, isAbortError } from '../lib/clashBroadPhaseClient';
import { runNarrowPhase } from '../lib/narrowPhaseClient';
import { triageClash } from '../lib/narrowPhase';
import { getIfcLabel } from '../lib/ifcLabels';
import {
  clashRowId,
  clusterClashes,
  contextGroups,
  expandBox,
  groupByStorey,
  guidPairKey,
  unionBox,
  UNKNOWN_STOREY,
} from '../lib/clashGrouping';
import type { ClashFocusRequest, ClashFocusMode } from '../lib/clashFocus';
import { BimService } from '../services/BimService';
import { BimClashService } from '../services/BimClashService';
import {
  BIM_AI_ENABLED,
  triageClashesWithAi,
  clusterClashesWithAi,
  type ClashClusterResult,
} from '@/features/bim-suite/adapters/ai';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { formatDate } from '@/features/bim-suite/adapters/utils';

interface BimClashPanelProps {
  projectId: string;
  /** Các mô hình đang hiển thị trong khung 3D */
  models: BimModel[];
  /** Chuỗi phiên bản của mọi mô hình dự án (mới nhất đứng đầu) — để chạy lại phiên trên phiên bản mới */
  versionChains: BimModel[][];
  getBoxes: (modelId: string) => Promise<ClashBox[]>;
  getItemsBrief: (
    modelId: string,
    ids: number[],
  ) => Promise<Record<number, { name?: string; category?: string; guid?: string }>>;
  getItemTriangles: (modelId: string, ids: number[]) => Promise<Map<number, Float32Array>>;
  mapGuidsToIds: (modelId: string, guids: string[]) => Promise<(number | null)[]>;
  onSelectClash: (clash: BimClashRow) => void;
  /**
   * Phóng tới va chạm: đóng khung cả hai cấu kiện, đánh dấu tâm; chế độ 'context' chỉ hiện hai cấu kiện và ngữ cảnh 2 m.
   * Dùng `createClashFocusHandler(() => viewerRef.current)` trong lib/clashFocus. Không truyền → dùng onSelectClash.
   */
  onFocusClash?: (request: ClashFocusRequest) => void | Promise<void>;
  onCreateIssue: (clash: BimClashRow) => void;
  onHighlight: (rows: BimClashRow[] | null) => void;
  onRequestModels?: (modelIds: string[]) => void;
  onClose: () => void;
  canEdit?: boolean;
  currentUserName?: string;
}

/** Số cặp pha rộng tối đa giữ lại (các cặp chồng lấn lớn nhất); tổng số thật vẫn được đếm và báo */
export const CLASH_RESULT_CAP = 1500;
/** Bán kính ngữ cảnh khi chỉ hiện hai cấu kiện (m) */
export const CLASH_CONTEXT_MARGIN = 2;

type GroupMode = 'loai' | 'tang' | 'cum';

const fmt = (v: number, digits = 2) => formatNumber(v, digits);

const STATUS: Record<BimClashStatus, { label: string; cls: string }> = {
  moi: { label: 'Mới', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' },
  dang_xu_ly: { label: 'Đang xử lý', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  da_xu_ly: { label: 'Đã xử lý', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  bo_qua: { label: 'Bỏ qua', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
  da_het: { label: 'Đã hết', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300' },
};

const VERDICT: Record<BimClashVerdict, { label: string; cls: string }> = {
  that: { label: 'Thật', cls: 'text-rose-600' },
  can_xem: { label: 'Cần xem', cls: 'text-amber-600' },
  gia: { label: 'Giả', cls: 'text-slate-400' },
};

const KIND_LABEL = {
  cat_nhau: 'mặt cắt nhau',
  nam_trong: 'nằm lọt bên trong',
  khung_bao: 'chỉ theo khung bao',
} as const;

const VERDICT_ORDER: BimClashVerdict[] = ['that', 'can_xem', 'gia'];

export interface ClashGroup {
  key: string;
  label: string;
  sublabel?: string;
  rows: BimClashRow[];
}

/** Gom dòng va chạm theo chế độ: cặp loại cấu kiện · tầng · cụm vị trí (lưới 1 m) */
export function buildClashGroups(
  rows: BimClashRow[],
  mode: GroupMode,
  storeyOf: (r: BimClashRow) => string | null | undefined,
): ClashGroup[] {
  if (mode === 'tang') {
    return groupByStorey(rows, storeyOf).map(([storey, list]) => {
      const clusters = clusterClashes(list, 1).length;
      return { key: `tang:${storey}`, label: storey, sublabel: `${clusters} cụm vị trí`, rows: list };
    });
  }
  if (mode === 'cum') {
    return clusterClashes(rows, 1).map((c, i) => {
      const storeys = groupByStorey(c.rows, storeyOf);
      const main = storeys[0]?.[0] || UNKNOWN_STOREY;
      const types = [...new Set(c.rows.map((r) => `${getIfcLabel(r.categoryA)} × ${getIfcLabel(r.categoryB)}`))];
      return {
        key: c.id,
        label: `Cụm ${i + 1} · ${main}`,
        sublabel: `${types.slice(0, 2).join('; ')}${types.length > 2 ? '…' : ''} · tâm (${c.center.map((v) => fmt(v, 1)).join('; ')})`,
        rows: c.rows,
      };
    });
  }
  const map = new Map<string, BimClashRow[]>();
  rows.forEach((r) => {
    const key = `${getIfcLabel(r.categoryA)} × ${getIfcLabel(r.categoryB)}`;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  });
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, list]) => ({ key: `loai:${key}`, label: key, rows: list }));
}

export const BimClashPanel: React.FC<BimClashPanelProps> = ({
  projectId,
  models,
  versionChains,
  getBoxes,
  getItemsBrief,
  getItemTriangles,
  mapGuidsToIds,
  onSelectClash,
  onFocusClash,
  onCreateIssue,
  onHighlight,
  onRequestModels,
  onClose,
  canEdit,
  currentUserName,
}) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [view, setView] = useState<'do' | 'phien'>('do');
  const [modelA, setModelA] = useState(models[0]?.id || '');
  const [modelB, setModelB] = useState(models[1]?.id || models[0]?.id || '');
  const [tolerance, setTolerance] = useState(10); // mm
  const [skipSameCategory, setSkipSameCategory] = useState(true);
  const [narrow, setNarrow] = useState(true);
  const [hideFalse, setHideFalse] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('loai');
  const [running, setRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [rows, setRows] = useState<BimClashRow[] | null>(null);
  const [scanInfo, setScanInfo] = useState<{ total: number; capped: boolean; cap: number } | null>(null);
  const [storeys, setStoreys] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<BimClashSession | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  /** Khung bao đọc trong lần dò gần nhất (theo mô hình) — dùng để đóng khung và tìm ngữ cảnh 2 m */
  const runBoxesRef = useRef(new Map<string, ClashBox[]>());

  const { data: sessions = [] } = useQuery({
    queryKey: ['bim-clash-sessions', projectId],
    queryFn: () => BimService.getClashSessions(projectId),
    enabled: !!projectId,
  });
  const dismissedQuery = {
    queryKey: ['bim-clash-dismissed', projectId],
    queryFn: () => BimClashService.getDismissedPairs(projectId),
    staleTime: 60_000,
  };
  useQuery({ ...dismissedQuery, enabled: !!projectId });
  /** Cặp đã bỏ qua của dự án — luôn chờ đọc xong trước khi gắn vào kết quả (không phụ thuộc thời điểm bấm dò) */
  const loadDismissed = async (): Promise<Set<string>> => {
    if (!projectId) return new Set();
    try {
      return await queryClient.fetchQuery(dismissedQuery);
    } catch {
      return new Set();
    }
  };

  // Tổ hợp mô hình thay đổi (bật/tắt mô hình ghép, đổi phiên bản) → chọn lại A/B hợp lệ
  const modelKey = models.map((m) => m.id).join('|');
  useEffect(() => {
    const ids = models.map((m) => m.id);
    setModelA((prev) => (ids.includes(prev) ? prev : ids[0] || ''));
    setModelB((prev) => (ids.includes(prev) ? prev : ids[1] || ids[0] || ''));
    runBoxesRef.current = new Map();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  // Đóng panel giữa chừng → hủy worker
  useEffect(() => () => abortRef.current?.abort(), []);

  const allModels = useMemo(() => versionChains.flat(), [versionChains]);
  const nameOf = (id: string) =>
    allModels.find((m) => m.id === id)?.file_name || models.find((m) => m.id === id)?.file_name || id;
  const rootOf = (id: string) => {
    const chain = versionChains.find((c) => c.some((m) => m.id === id));
    return chain ? chain[chain.length - 1].id : id;
  };
  const latestOf = (rootId: string | null | undefined) =>
    versionChains.find((c) => c.some((m) => m.id === rootId))?.find((m) => m.status === 'ready');

  /** Khung bao luôn đọc lại từ trình xem (trình xem tự đệm và xóa đệm khi đổi độ dịch mô hình ghép) */
  const boxesOf = async (modelId: string) => {
    const boxes = await getBoxes(modelId);
    runBoxesRef.current.set(modelId, boxes);
    return boxes;
  };

  /** Cặp đã bỏ qua ở phiên khác: chỉ đè trạng thái "mới"/chưa lưu, không đè trạng thái người dùng đã đặt */
  const markDismissed = (list: BimClashRow[], dismissed: Set<string>) =>
    list.map((r) =>
      (!r.status || r.status === 'moi') && dismissed.has(guidPairKey(r.guidA, r.guidB))
        ? { ...r, status: 'bo_qua' as BimClashStatus }
        : r,
    );

  const loadStoreys = async (list: BimClashRow[]) => {
    try {
      const byModel = new Map<string, string[]>();
      for (const r of list) {
        if (r.guidA) byModel.set(r.modelA, [...(byModel.get(r.modelA) || []), r.guidA]);
        if (r.guidB) byModel.set(r.modelB, [...(byModel.get(r.modelB) || []), r.guidB]);
      }
      const merged = new Map<string, string | null>();
      for (const [modelId, guids] of byModel) {
        (await BimClashService.getStoreysForGuids(modelId, guids)).forEach((v, k) => merged.set(`${modelId}:${k}`, v));
      }
      setStoreys(merged);
    } catch {
      setStoreys(new Map());
    }
  };

  const storeyOf = (r: BimClashRow) =>
    (r.guidA && storeys.get(`${r.modelA}:${r.guidA}`)) || (r.guidB && storeys.get(`${r.modelB}:${r.guidB}`)) || null;

  const detect = async (a: string, b: string, signal: AbortSignal): Promise<BimClashRow[]> => {
    setProgress(`Đọc khung bao ${nameOf(a)}...`);
    const boxesA = await boxesOf(a);
    const sameModel = a === b;
    setProgress(sameModel ? 'Dò va chạm trong mô hình...' : `Đọc khung bao ${nameOf(b)}...`);
    const boxesB = sameModel ? boxesA : await boxesOf(b);
    if (signal.aborted) throw Object.assign(new Error('Đã hủy dò va chạm'), { name: 'AbortError' });

    setProgress(`Sàng lọc khung bao ${fmt(boxesA.length, 0)} × ${fmt(boxesB.length, 0)} cấu kiện...`);
    const scan = await runBroadPhase(
      boxesA,
      boxesB,
      { tolerance: tolerance / 1000, sameSet: sameModel, maxResults: CLASH_RESULT_CAP },
      {
        signal,
        onProgress: (done, total) => setProgress(`Sàng lọc khung bao ${fmt(done, 0)}/${fmt(total, 0)} cấu kiện...`),
      },
    );
    setScanInfo({ total: scan.total, capped: scan.capped, cap: scan.cap });
    const pairs = scan.pairs;

    setProgress('Đọc thông tin cấu kiện...');
    const idsA = [...new Set(sameModel ? pairs.flatMap((p) => [p.idA, p.idB]) : pairs.map((p) => p.idA))];
    const briefA = await getItemsBrief(a, idsA);
    const briefB = sameModel ? briefA : await getItemsBrief(b, [...new Set(pairs.map((p) => p.idB))]);

    let candidates: BimClashRow[] = pairs
      .map((p) => {
        const ia = briefA[p.idA] || {};
        const ib = briefB[p.idB] || {};
        const row = {
          id: '',
          modelA: a,
          modelB: b,
          idA: p.idA,
          idB: p.idB,
          nameA: ia.name || `#${p.idA}`,
          nameB: ib.name || `#${p.idB}`,
          categoryA: ia.category || '',
          categoryB: ib.category || '',
          guidA: ia.guid,
          guidB: ib.guid,
          overlap: p.overlap,
          depth: p.depth,
          center: p.center,
          kind: 'khung_bao' as const,
        };
        return { ...row, id: clashRowId(row) };
      })
      .filter((r) => !skipSameCategory || !r.categoryA || r.categoryA !== r.categoryB);

    if (narrow && candidates.length) {
      // Pha hẹp: đọc lưới tam giác theo lô, so khớp từng cặp trong worker
      const trisA = new Map<number, Float32Array>();
      const trisB = sameModel ? trisA : new Map<number, Float32Array>();
      const needA = [...new Set(candidates.flatMap((c) => (sameModel ? [c.idA, c.idB] : [c.idA])))];
      const needB = sameModel ? [] : [...new Set(candidates.map((c) => c.idB))];
      for (let i = 0; i < needA.length; i += 200) {
        if (signal.aborted) throw Object.assign(new Error('Đã hủy dò va chạm'), { name: 'AbortError' });
        setProgress(`Đọc lưới tam giác ${nameOf(a)} ${Math.min(i + 200, needA.length)}/${needA.length}...`);
        (await getItemTriangles(a, needA.slice(i, i + 200))).forEach((v, k) => trisA.set(k, v));
      }
      for (let i = 0; i < needB.length; i += 200) {
        if (signal.aborted) throw Object.assign(new Error('Đã hủy dò va chạm'), { name: 'AbortError' });
        setProgress(`Đọc lưới tam giác ${nameOf(b)} ${Math.min(i + 200, needB.length)}/${needB.length}...`);
        (await getItemTriangles(b, needB.slice(i, i + 200))).forEach((v, k) => trisB.set(k, v));
      }
      const meshPairs = candidates.map((c) => ({
        a: trisA.get(c.idA) || new Float32Array(),
        b: trisB.get(c.idB) || new Float32Array(),
      }));
      const results = await runNarrowPhase(
        meshPairs,
        (done, total) => setProgress(`Kiểm tra lưới thật ${done}/${total} cặp...`),
        40,
        signal,
      );
      candidates = candidates.map((c, i) => {
        if (!meshPairs[i].a.length || !meshPairs[i].b.length) return c;
        const res = results[i];
        return { ...c, kind: res.kind ? (res.truncated ? ('khung_bao' as const) : res.kind) : undefined };
      });
    }

    return candidates
      .map((c) => {
        const t = triageClash(c.categoryA, c.categoryB, c.depth, c.kind === undefined ? null : c.kind);
        return {
          ...c,
          kind: c.kind ?? 'khung_bao',
          verdict: c.kind === undefined ? ('gia' as const) : t.verdict,
          reason: t.reason,
          status: 'moi' as BimClashStatus,
        };
      })
      .sort((x, y) =>
        x.verdict === y.verdict
          ? y.depth - x.depth || (x.id < y.id ? -1 : 1)
          : VERDICT_ORDER.indexOf(x.verdict) - VERDICT_ORDER.indexOf(y.verdict),
      );
  };

  const highlightable = (list: BimClashRow[]) =>
    list.filter((r) => r.verdict !== 'gia' && r.status !== 'bo_qua' && r.idA >= 0 && r.idB >= 0);

  const run = async (target?: { a: string; b: string; saveTo?: BimClashSession }) => {
    const a = target?.a || modelA;
    const b = target?.b || modelB;
    if (!a || !b) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setRows(null);
    setScanInfo(null);
    setStoreys(new Map());
    onHighlight(null);
    try {
      const [detected, dismissed] = await Promise.all([detect(a, b, controller.signal), loadDismissed()]);
      let result = markDismissed(detected, dismissed);
      if (target?.saveTo) {
        setProgress('Cập nhật phiên dò...');
        const saved = await BimService.saveClashRun(
          {
            id: target.saveTo.id,
            project_id: projectId,
            ten: target.saveTo.ten,
            model_a: a,
            model_b: b,
            goc_a: rootOf(a),
            goc_b: rootOf(b),
            dung_sai: tolerance / 1000,
            che_do: narrow ? 'luoi' : 'khung_bao',
            ten_nguoi_tao: target.saveTo.ten_nguoi_tao ?? currentUserName ?? null,
          },
          result.filter((r) => r.verdict !== 'gia'),
        );
        setSession(saved.session);
        result = await attachStatuses(saved.session, result);
        queryClient.invalidateQueries({ queryKey: ['bim-clash-sessions', projectId] });
        addToast({
          type: 'success',
          message: `Đã chạy lại “${saved.session.ten}”: ${saved.added} va chạm mới · ${saved.reopened} mở lại · ${saved.closed} đã hết.`,
        });
      }
      if (controller.signal.aborted) return;
      setRows(result);
      const shown = highlightable(result);
      onHighlight(shown.length ? shown : null);
      setProgress('Đọc tầng của cấu kiện...');
      await loadStoreys(result);
    } catch (e: any) {
      if (isAbortError(e)) setError('Đã hủy dò va chạm.');
      else setError(e?.message || 'Không dò được va chạm');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
      setProgress('');
    }
  };

  /**
   * Gắn trạng thái đã lưu (theo cặp GUID) vào kết quả dò. Cặp đã bỏ qua ở phiên khác của dự án
   * mà trong phiên này còn "mới" thì ghi nhận "bỏ qua" luôn để không phải đánh dấu lại.
   */
  const attachStatuses = async (s: BimClashSession, list: BimClashRow[]) => {
    const [records, dismissed] = await Promise.all([BimService.getClashRecords(s.id), loadDismissed()]);
    const byKey = new Map(records.map((r) => [guidPairKey(r.guid_a, r.guid_b), r]));
    const carry = records.filter((r) => r.trang_thai === 'moi' && dismissed.has(guidPairKey(r.guid_a, r.guid_b)));
    await Promise.all(
      carry.map((r) => BimService.updateClashRecord(r.id, { trang_thai: 'bo_qua' }).catch(() => undefined)),
    );
    const carried = new Set(carry.map((r) => r.id));
    return list.map((r) => {
      const rec = byKey.get(guidPairKey(r.guidA, r.guidB));
      if (!rec) return r;
      const status: BimClashStatus = carried.has(rec.id) ? 'bo_qua' : rec.trang_thai;
      return {
        ...r,
        status,
        dbId: rec.id,
        note: rec.ghi_chu,
        verdict: (rec.danh_gia as BimClashVerdict) || r.verdict,
        reason: rec.ly_do_danh_gia || r.reason,
      };
    });
  };

  const saveSession = async () => {
    if (!rows || !sessionName.trim()) return;
    try {
      const saved = await BimService.saveClashRun(
        {
          project_id: projectId,
          ten: sessionName.trim(),
          model_a: modelA,
          model_b: modelB,
          goc_a: rootOf(modelA),
          goc_b: rootOf(modelB),
          dung_sai: tolerance / 1000,
          che_do: narrow ? 'luoi' : 'khung_bao',
          ten_nguoi_tao: currentUserName ?? null,
        },
        rows.filter((r) => r.verdict !== 'gia'),
      );
      setSession(saved.session);
      setRows(await attachStatuses(saved.session, rows));
      setSessionName('');
      queryClient.invalidateQueries({ queryKey: ['bim-clash-sessions', projectId] });
      addToast({ type: 'success', message: `Đã lưu phiên “${saved.session.ten}” (${saved.added} va chạm).` });
    } catch (e: any) {
      addToast({ type: 'error', message: e.message });
    }
  };

  const openSession = async (s: BimClashSession) => {
    setSession(s);
    setView('do');
    setScanInfo(null);
    const records = await BimService.getClashRecords(s.id);
    const a = models.some((m) => m.id === s.model_a) ? s.model_a : latestOf(s.goc_a)?.id || s.model_a;
    const b = models.some((m) => m.id === s.model_b) ? s.model_b : latestOf(s.goc_b)?.id || s.model_b;
    setModelA(a);
    setModelB(b);
    const shown = models.some((m) => m.id === a) && models.some((m) => m.id === b);
    if (!shown) onRequestModels?.([a, b]);
    // Tra id cục bộ theo GUID để phóng tới được
    const guidsA = records.map((r) => r.guid_a);
    const guidsB = records.map((r) => r.guid_b);
    const idsA = shown ? await mapGuidsToIds(a, guidsA) : [];
    const idsB = shown ? await mapGuidsToIds(b, guidsB) : [];
    const list: BimClashRow[] = records.map((r, i) => {
      const row: BimClashRow = {
        id: '',
        dbId: r.id,
        modelA: a,
        modelB: b,
        idA: idsA[i] ?? -1,
        idB: idsB[i] ?? -1,
        nameA: r.ten_a || r.guid_a,
        nameB: r.ten_b || r.guid_b,
        categoryA: r.loai_a || '',
        categoryB: r.loai_b || '',
        guidA: r.guid_a,
        guidB: r.guid_b,
        overlap: 0,
        depth: Number(r.do_sau) || 0,
        center: (r.tam as [number, number, number]) || [0, 0, 0],
        kind: 'cat_nhau',
        verdict: (r.danh_gia as BimClashVerdict) || 'can_xem',
        reason: r.ly_do_danh_gia || undefined,
        status: r.trang_thai,
        note: r.ghi_chu,
      };
      return { ...row, id: clashRowId(row) };
    });
    const marked = markDismissed(list, await loadDismissed());
    setRows(marked);
    const hl = highlightable(marked).filter((r) => r.status !== 'da_het' && r.status !== 'da_xu_ly');
    onHighlight(hl.length ? hl : null);
    loadStoreys(marked);
  };

  const rerunSession = (s: BimClashSession) => {
    const a = latestOf(s.goc_a)?.id || s.model_a;
    const b = latestOf(s.goc_b)?.id || s.model_b;
    setModelA(a);
    setModelB(b);
    if (!models.some((m) => m.id === a) || !models.some((m) => m.id === b)) {
      onRequestModels?.([a, b]);
      addToast({
        type: 'info',
        message: 'Đã bật hiển thị mô hình phiên bản mới nhất — bấm “Chạy lại” thêm lần nữa khi mô hình nạp xong.',
      });
      return;
    }
    setTolerance(Math.round(Number(s.dung_sai) * 1000));
    setView('do');
    run({ a, b, saveTo: s });
  };

  const setStatus = async (row: BimClashRow, status: BimClashStatus) => {
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, status } : r)) ?? prev);
    if (row.dbId) {
      try {
        await BimService.updateClashRecord(row.dbId, { trang_thai: status });
        if (status === 'bo_qua' || row.status === 'bo_qua')
          queryClient.invalidateQueries({ queryKey: ['bim-clash-dismissed', projectId] });
      } catch (e: any) {
        addToast({ type: 'error', message: e.message });
      }
    }
  };

  /** Phóng tới va chạm: đóng khung cả hai cấu kiện, hoặc chỉ hiện hai cấu kiện và ngữ cảnh 2 m */
  const focus = async (row: BimClashRow, mode: ClashFocusMode) => {
    if (!onFocusClash) {
      if (row.idA >= 0) onSelectClash(row);
      return;
    }
    const findBox = (modelId: string, id: number) => runBoxesRef.current.get(modelId)?.find((b) => b.id === id) || null;
    if (!runBoxesRef.current.has(row.modelA) || !runBoxesRef.current.has(row.modelB)) {
      // Phiên mở lại từ CSDL: đọc khung bao của hai mô hình (trình xem đã đệm)
      await Promise.all([...new Set([row.modelA, row.modelB])].map((m) => boxesOf(m).catch(() => [])));
    }
    const pad = 0.25;
    const around = {
      min: row.center.map((v) => v - pad) as [number, number, number],
      max: row.center.map((v) => v + pad) as [number, number, number],
    };
    const box = unionBox([findBox(row.modelA, row.idA), findBox(row.modelB, row.idB)]) || around;
    const request: ClashFocusRequest = { clash: row, mode, center: row.center, box };
    if (mode === 'context') {
      const area = expandBox(box, CLASH_CONTEXT_MARGIN);
      // Ngữ cảnh lấy trên mọi mô hình đang hiển thị
      await Promise.all(models.filter((m) => !runBoxesRef.current.has(m.id)).map((m) => boxesOf(m.id).catch(() => [])));
      const scope = new Map([...runBoxesRef.current].filter(([id]) => models.some((m) => m.id === id)));
      request.contextBox = area;
      request.contextGroups = contextGroups(
        area,
        scope,
        [
          { modelId: row.modelA, id: row.idA },
          { modelId: row.modelB, id: row.idB },
        ].filter((x) => x.id >= 0),
      );
    }
    await onFocusClash(request);
  };

  const aiTriage = async () => {
    if (!rows) return;
    const pending = rows.filter((r) => r.verdict === 'can_xem' && r.status !== 'bo_qua').slice(0, 60);
    if (!pending.length) {
      addToast({ type: 'info', message: 'Không còn va chạm “cần xem” để AI đánh giá.' });
      return;
    }
    setAiRunning(true);
    try {
      const verdicts = await triageClashesWithAi(
        pending.map((r, i) => ({
          index: i,
          loaiA: r.categoryA,
          tenA: r.nameA,
          loaiB: r.categoryB,
          tenB: r.nameB,
          sauMm: Math.round(r.depth * 1000),
          kieu: KIND_LABEL[r.kind || 'khung_bao'],
        })),
      );
      const byId = new Map(verdicts.map((v) => [pending[v.index]?.id, v]));
      setRows(
        (prev) =>
          prev?.map((r) => {
            const v = byId.get(r.id);
            return v ? { ...r, verdict: v.verdict, reason: `AI: ${v.reason}` } : r;
          }) ?? prev,
      );
      await Promise.all(
        pending
          .filter((r) => r.dbId && byId.has(r.id))
          .map((r) =>
            BimService.updateClashRecord(r.dbId!, {
              danh_gia: byId.get(r.id)!.verdict,
              ly_do_danh_gia: `AI: ${byId.get(r.id)!.reason}`,
            }),
          ),
      );
      addToast({ type: 'success', message: `AI đã đánh giá ${verdicts.length} va chạm.` });
    } catch (e: any) {
      addToast({ type: 'error', title: 'AI chưa đánh giá được', message: e.message });
    } finally {
      setAiRunning(false);
    }
  };

  const [clusters, setClusters] = useState<ClashClusterResult[] | null>(null);
  const [clustering, setClustering] = useState(false);

  const aiCluster = async () => {
    if (!rows) return;
    const critical = rows
      .filter((r) => (r.verdict === 'that' || r.verdict === 'can_xem') && r.status !== 'bo_qua')
      .slice(0, 50);
    if (!critical.length) {
      addToast({ type: 'info', message: 'Không có va chạm "thật" hoặc "cần xem" để AI gom cụm.' });
      return;
    }
    setClustering(true);
    try {
      const list = await clusterClashesWithAi(
        critical.map((r, i) => ({
          index: i,
          loaiA: r.categoryA,
          tenA: r.nameA,
          loaiB: r.categoryB,
          tenB: r.nameB,
          sauMm: Math.round(r.depth * 1000),
          kieu: KIND_LABEL[r.kind || 'khung_bao'],
        })),
      );
      setClusters(list);
      addToast({ type: 'success', message: `AI đã phân tích và gom thành ${list.length} cụm nguyên nhân gốc rễ.` });
    } catch (e: any) {
      addToast({ type: 'error', title: 'AI chưa gom cụm được', message: e.message });
    } finally {
      setClustering(false);
    }
  };

  const dismissedCount = useMemo(() => (rows || []).filter((r) => r.status === 'bo_qua').length, [rows]);
  const visible = useMemo(
    () => (rows || []).filter((r) => (!hideFalse || r.verdict !== 'gia') && (showDismissed || r.status !== 'bo_qua')),
    [rows, hideFalse, showDismissed],
  );
  const groups = useMemo(
    () => buildClashGroups(visible, groupMode, storeyOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, groupMode, storeys],
  );

  useEffect(() => {
    if (groups.length && !groups.some((g) => openGroups.has(g.key))) setOpenGroups(new Set([groups[0].key]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, groupMode]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const count = (v: BimClashVerdict) => rows.filter((r) => r.verdict === v && r.status !== 'bo_qua').length;
    return {
      total: rows.length,
      that: count('that'),
      can_xem: count('can_xem'),
      gia: count('gia'),
      open: rows.filter((r) => r.status === 'moi' || r.status === 'dang_xu_ly').length,
    };
  }, [rows]);

  const exportCsv = () => {
    if (!rows?.length) return;
    const head = [
      'STT',
      'Mã dòng',
      'Nhóm',
      'Tầng',
      'Cấu kiện A',
      'Loại A',
      'GUID A',
      'Cấu kiện B',
      'Loại B',
      'GUID B',
      'Tâm X',
      'Tâm Y',
      'Tâm Z',
      'Cắm sâu (mm)',
      'Kiểu',
      'Đánh giá',
      'Lý do',
      'Trạng thái',
    ];
    const body = rows.map((r, i) => [
      i + 1,
      r.id,
      `${getIfcLabel(r.categoryA)} × ${getIfcLabel(r.categoryB)}`,
      storeyOf(r) || '',
      r.nameA,
      getIfcLabel(r.categoryA),
      r.guidA || '',
      r.nameB,
      getIfcLabel(r.categoryB),
      r.guidB || '',
      r.center[0].toFixed(3),
      r.center[1].toFixed(3),
      r.center[2].toFixed(3),
      Math.round(r.depth * 1000),
      KIND_LABEL[r.kind || 'khung_bao'],
      r.verdict ? VERDICT[r.verdict].label : '',
      r.reason || '',
      r.status ? STATUS[r.status].label : '',
    ]);
    const note = scanInfo?.capped
      ? [
          [
            `Lưu ý: tìm thấy ${scanInfo.total} cặp chạm khung bao, danh sách giữ ${scanInfo.cap} cặp chồng lấn lớn nhất.`,
          ],
        ]
      : [];
    const csv = [...note, head, ...body]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `va_cham_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    BimService.logBimActivity(
      'EXPORT',
      { id: modelA, name: nameOf(modelA) },
      `Xuất danh sách ${rows.length} va chạm (${nameOf(modelA)} × ${nameOf(modelB)})`,
    );
    URL.revokeObjectURL(url);
  };

  const selectCls =
    'w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';

  const renderRow = (r: BimClashRow) => (
    <div
      key={r.id}
      data-clash-id={r.id}
      className={`p-1.5 rounded-lg border border-slate-100 dark:border-slate-700 ${r.status === 'da_het' || r.status === 'da_xu_ly' || r.status === 'bo_qua' ? 'opacity-60' : ''}`}
    >
      <button type="button" onClick={() => r.idA >= 0 && focus(r, 'frame')} className="w-full text-left">
        <span className="block truncate text-slate-800 dark:text-slate-100">{r.nameA}</span>
        <span className="flex items-center gap-1 text-2xs text-slate-400">
          <ChevronRight className="w-3 h-3" /> {r.nameB}
        </span>
      </button>
      <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-slate-500">
        {r.verdict && <b className={VERDICT[r.verdict].cls}>{VERDICT[r.verdict].label}</b>}
        <span>sâu {fmt(r.depth * 1000, 0)} mm</span>
        <span className="truncate" data-tooltip={r.reason}>
          {KIND_LABEL[r.kind || 'khung_bao']}
        </span>
        <span className="flex-1" />
        {r.dbId && canEdit ? (
          <BimSelect
            value={r.status || 'moi'}
            onChange={(e) => setStatus(r, e.target.value as BimClashStatus)}
            className={`px-1 py-0.5 rounded text-2xs border-0 ${STATUS[r.status || 'moi'].cls}`}
            aria-label="Trạng thái xử lý"
          >
            {(Object.keys(STATUS) as BimClashStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS[k].label}
              </option>
            ))}
          </BimSelect>
        ) : r.status && (r.dbId || r.status === 'bo_qua') ? (
          <span className={`px-1 rounded ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
        ) : null}
        {canEdit && !r.dbId && r.status !== 'bo_qua' && (
          <button
            type="button"
            disabled
            className="p-0.5 text-slate-300 dark:text-slate-600"
            data-tooltip="Lưu phiên để đánh dấu bỏ qua và ghi nhớ cho các lần dò sau"
          >
            <Ban className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          disabled={r.idA < 0}
          onClick={() => focus(r, 'frame')}
          className="p-0.5 text-slate-400 hover:text-primary-600 disabled:opacity-30"
          data-tooltip="Phóng tới tâm va chạm, đóng khung cả hai cấu kiện"
        >
          <Crosshair className="w-3 h-3" />
        </button>
        {onFocusClash && (
          <button
            type="button"
            disabled={r.idA < 0 && r.idB < 0}
            onClick={() => focus(r, 'context')}
            className="p-0.5 text-slate-400 hover:text-primary-600 disabled:opacity-30"
            data-tooltip="Chỉ hiện 2 cấu kiện và ngữ cảnh 2 m"
            aria-label="Chỉ hiện 2 cấu kiện và ngữ cảnh 2 m"
          >
            <Focus className="w-3 h-3" />
          </button>
        )}
        {canEdit && r.idA >= 0 && (
          <button
            type="button"
            onClick={() => onCreateIssue(r)}
            className="px-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            data-tooltip="Tạo vướng mắc từ va chạm này"
          >
            BCF
          </button>
        )}
      </div>
      {r.reason && (
        <p className="text-2xs text-slate-400 truncate" data-tooltip={r.reason}>
          {r.reason}
        </p>
      )}
    </div>
  );

  return (
    <div className="absolute top-3 left-3 z-20 w-[360px] max-h-[calc(100%-5rem)] flex flex-col rounded-2xl bg-white/95 dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl text-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <Zap className="w-4 h-4 text-amber-500" /> Dò va chạm
        </span>
        <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-2xs">
          <button
            type="button"
            onClick={() => setView('do')}
            className={`px-2 py-0.5 rounded-md ${view === 'do' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500'}`}
          >
            Dò
          </button>
          <button
            type="button"
            onClick={() => setView('phien')}
            className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${view === 'phien' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500'}`}
          >
            <History className="w-3 h-3" /> Phiên đã lưu ({sessions.length})
          </button>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          data-tooltip="Đóng"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {view === 'phien' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {sessions.length === 0 && <p className="p-3 text-center text-slate-400">Chưa có phiên dò nào được lưu.</p>}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`p-2 rounded-lg border ${session?.id === s.id ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-900`}
            >
              <button type="button" onClick={() => openSession(s)} className="w-full text-left">
                <span className="block font-semibold text-slate-800 dark:text-slate-100 truncate">{s.ten}</span>
                <span className="block text-2xs text-slate-400 truncate">
                  {nameOf(s.model_a)} × {nameOf(s.model_b)}
                </span>
                <span className="block text-2xs text-slate-400">
                  {s.so_va_cham} va chạm · {s.che_do === 'luoi' ? 'lưới thật' : 'khung bao'} ·{' '}
                  {formatDate(s.updated_at)}
                  {s.ten_nguoi_tao ? ` · ${s.ten_nguoi_tao}` : ''}
                </span>
              </button>
              <div className="mt-1 flex items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => rerunSession(s)}
                    disabled={running}
                    className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" /> Chạy lại trên phiên bản mới nhất
                  </button>
                )}
                <span className="flex-1" />
                {canEdit && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Xóa phiên “${s.ten}” và toàn bộ trạng thái xử lý?`)) return;
                      await BimService.deleteClashSession(s.id);
                      if (session?.id === s.id) setSession(null);
                      queryClient.invalidateQueries({ queryKey: ['bim-clash-sessions', projectId] });
                      queryClient.invalidateQueries({ queryKey: ['bim-clash-dismissed', projectId] });
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500"
                    data-tooltip="Xóa phiên"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'do' && (
        <>
          <div className="p-3 space-y-2 border-b border-slate-200 dark:border-slate-700">
            {session && (
              <p className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 truncate">
                Phiên: <b>{session.ten}</b>
              </p>
            )}
            {[
              { label: 'Mô hình A', value: modelA, set: setModelA },
              { label: 'Mô hình B', value: modelB, set: setModelB },
            ].map(({ label, value, set }) => (
              <label key={label} className="block">
                <span className="block text-2xs uppercase tracking-wide text-slate-400 mb-0.5">{label}</span>
                <BimSelect
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={selectCls}
                  aria-label={label}
                  disabled={running}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.file_name} (v{m.phien_ban ?? 1})
                    </option>
                  ))}
                </BimSelect>
              </label>
            ))}
            <label className="block">
              <span className="block text-2xs uppercase tracking-wide text-slate-400 mb-0.5">
                Bỏ qua chạm nhẹ hơn (mm)
              </span>
              <BimInput
                type="number"
                min={0}
                step={5}
                value={tolerance}
                onChange={(e) => setTolerance(Math.max(0, Number(e.target.value) || 0))}
                className={selectCls}
              />
            </label>
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <BimInput
                type="checkbox"
                className="accent-primary-600"
                checked={narrow}
                onChange={(e) => setNarrow(e.target.checked)}
              />
              Kiểm tra lưới tam giác thật (chính xác, chậm hơn)
            </label>
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <BimInput
                type="checkbox"
                className="accent-primary-600"
                checked={skipSameCategory}
                onChange={(e) => setSkipSameCategory(e.target.checked)}
              />
              Bỏ qua cặp cùng loại cấu kiện
            </label>
            {running ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-semibold dark:bg-slate-600"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang dò · bấm để hủy
              </button>
            ) : (
              <button
                type="button"
                onClick={() => run()}
                disabled={!modelA || !modelB}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold dark:bg-amber-500"
              >
                <Zap className="w-3.5 h-3.5" /> Bắt đầu dò va chạm
              </button>
            )}
            {progress && (
              <p className="text-2xs text-slate-500 truncate" role="status">
                {progress}
              </p>
            )}
            {error && <p className="text-2xs text-rose-500">{error}</p>}
          </div>

          {rows && summary && (
            <>
              <div className="px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${summary.that ? 'text-rose-500' : summary.can_xem ? 'text-amber-500' : 'text-emerald-500'}`}
                />
                <span className="text-slate-700 dark:text-slate-200 font-semibold">
                  <span className="text-rose-600">{summary.that} thật</span> ·{' '}
                  <span className="text-amber-600">{summary.can_xem} cần xem</span> ·{' '}
                  <span className="text-slate-400">{summary.gia} giả</span>
                </span>
                <span className="flex-1" />
                {BIM_AI_ENABLED && (
                  <>
                    <button
                      type="button"
                      onClick={aiTriage}
                      disabled={aiRunning || clustering}
                      className="p-1 rounded text-violet-600 hover:text-violet-800 disabled:opacity-50"
                      data-tooltip="AI đánh giá các va chạm cần xem (Thật/Giả)"
                    >
                      {aiRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={aiCluster}
                      disabled={clustering || aiRunning}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 disabled:opacity-50"
                      data-tooltip="Gom cụm va chạm theo nguyên nhân gốc rễ bằng AI"
                    >
                      {clustering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                      <span>{clustering ? 'Đang gom...' : 'Gom cụm AI'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={exportCsv}
                  className="p-1 rounded text-slate-400 hover:text-primary-600"
                  data-tooltip="Xuất CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {scanInfo?.capped && (
                  <p
                    role="alert"
                    className="w-full px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950 text-2xs text-amber-800 dark:text-amber-200"
                  >
                    Tìm thấy {fmt(scanInfo.total, 0)} cặp chạm khung bao; danh sách chỉ giữ {fmt(scanInfo.cap, 0)} cặp
                    chồng lấn lớn nhất. Tăng ngưỡng bỏ qua hoặc dò theo từng cặp mô hình/tầng để xem hết.
                  </p>
                )}
                <label className="w-full flex items-center gap-1.5 text-2xs text-slate-500">
                  <BimInput
                    type="checkbox"
                    className="accent-primary-600"
                    checked={hideFalse}
                    onChange={(e) => setHideFalse(e.target.checked)}
                  />
                  Ẩn va chạm giả ({summary.gia})
                </label>
                {dismissedCount > 0 && (
                  <label className="w-full flex items-center gap-1.5 text-2xs text-slate-500">
                    <BimInput
                      type="checkbox"
                      className="accent-primary-600"
                      checked={showDismissed}
                      onChange={(e) => setShowDismissed(e.target.checked)}
                    />
                    <EyeOff className="w-3 h-3" /> Hiện {dismissedCount} cặp đã bỏ qua (nhớ theo dự án)
                  </label>
                )}
                <div className="w-full flex items-center gap-1 text-2xs" role="group" aria-label="Gom va chạm">
                  <span className="text-slate-400 mr-0.5">Gom theo</span>
                  {(
                    [
                      ['loai', 'Cặp loại'],
                      ['tang', 'Tầng'],
                      ['cum', 'Cụm 1 m'],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGroupMode(m)}
                      aria-pressed={groupMode === m}
                      className={`px-1.5 py-0.5 rounded-md border ${groupMode === m ? 'border-amber-400 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {canEdit && !session && rows.length > 0 && (
                <div className="px-3 py-1.5 flex gap-1.5 border-b border-slate-200 dark:border-slate-700">
                  <BimInput
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Tên phiên, VD: KT × MEP tầng 2"
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={saveSession}
                    disabled={!sessionName.trim()}
                    className="px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center gap-1 dark:bg-emerald-600"
                  >
                    <Save className="w-3 h-3" /> Lưu phiên
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {clusters && clusters.length > 0 && (
                  <div className="p-2.5 mb-2 rounded-xl bg-violet-50/80 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-violet-900 dark:text-violet-200">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Cụm nguyên nhân gốc rễ ({clusters.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setClusters(null)}
                        className="text-2xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Đóng
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {clusters.map((c, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-violet-100 dark:border-violet-900 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{c.clusterName}</span>
                            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 font-bold">
                              {c.indices.length} va chạm
                            </span>
                          </div>
                          <p className="text-2xs text-slate-600 dark:text-slate-300">
                            <b>Nguyên nhân:</b> {c.rootCause}
                          </p>
                          <p className="text-2xs text-emerald-700 dark:text-emerald-400">
                            <b>Khắc phục:</b> {c.suggestedAction}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {groups.length === 0 && (
                  <p className="p-3 text-center text-emerald-600">Không phát hiện va chạm cần xử lý.</p>
                )}
                {groups.map((g) => {
                  const open = openGroups.has(g.key);
                  return (
                    <div
                      key={g.key}
                      className="rounded-lg border border-slate-200 dark:border-slate-700"
                      data-group-key={g.key}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left bg-slate-50 dark:bg-slate-900 rounded-t-lg"
                      >
                        {open ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-semibold text-slate-700 dark:text-slate-200">
                            {g.label}
                          </span>
                          {g.sublabel && <span className="block truncate text-2xs text-slate-400">{g.sublabel}</span>}
                        </span>
                        <span className="px-1.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-2xs font-bold">
                          {g.rows.length}
                        </span>
                      </button>
                      {open && (
                        <div className="p-1 space-y-1">
                          {g.rows.slice(0, 300).map(renderRow)}
                          {g.rows.length > 300 && (
                            <p className="text-2xs text-slate-400 text-center">
                              … còn {g.rows.length - 300} va chạm trong nhóm (xem đủ trong file CSV)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
