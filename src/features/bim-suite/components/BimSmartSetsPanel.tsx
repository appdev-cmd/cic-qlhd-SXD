import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimSmartSetsPanel.tsx
// Bộ chọn thông minh: lọc cấu kiện theo bất kỳ cột / Pset / kiểu (VD “Bê tông B25 tầng 2”), ghép nhiều nhóm
// bằng HOẶC (mỗi nhóm là các điều kiện VÀ), gợi ý giá trị theo từ đồng nghĩa tiếng Việt ("cột" → IFCCOLUMN),
// lưu thành tập dùng lại cho cả dự án, và tô màu mô hình theo giá trị một thuộc tính bất kỳ.

import React, { useMemo, useState } from 'react';
import {
  ListFilter,
  Plus,
  X,
  Loader2,
  Search,
  MousePointerClick,
  Focus,
  Palette,
  Save,
  Trash2,
  Play,
  Paintbrush,
  GitBranch,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2, Library } from 'lucide-react';
import { BimOpsService } from '../services/BimOpsService';
import { usePermissionContext } from '@/features/bim-suite/adapters/context';
import { useToast } from '@/features/bim-suite/adapters/toast';
import {
  BimModel,
  BimSetCondition,
  BimSetOperator,
  BimFieldRef,
  BimElementRef,
  BimSmartSet,
} from '@/features/bim-suite/types/bim.types';
import { BimService } from '../services/BimService';
import { BimSelectionService } from '../services/BimSelectionService';
import { useBimFieldCatalog, useBimSmartSets, useSaveBimSmartSet, useDeleteBimSmartSet } from '../hooks/useBim';
import {
  COLUMN_FIELDS,
  OPERATORS,
  fieldKey,
  parseFieldKey,
  fieldLabel,
  isNumericField,
  bucketValues,
  groupsOfSet,
  groupsText,
  storedFromGroups,
  suggestValues,
  validGroups,
  type ConditionGroups,
} from '../lib/smartSets';

export interface SmartSetColoring {
  title: string;
  groups: { modelId: string; color: string; ids: number[] }[];
  legend: { color: string; label: string; count: number }[];
}

interface BimSmartSetsPanelProps {
  projectId: string;
  models: BimModel[];
  canEdit: boolean;
  currentUserName?: string;
  onSelect: (items: { modelId: string; expressId: number }[]) => void;
  onIsolate: (groups: { modelId: string; ids: number[] }[]) => void;
  onColorize: (coloring: SmartSetColoring | null) => void;
  className?: string;
}

const emptyCondition = (): BimSetCondition => ({ truong: 'loai_cau_kien', toan_tu: '=', gia_tri: '' });

const groupByModel = (rows: BimElementRef[]) => {
  const map = new Map<string, number[]>();
  rows.forEach((r) => {
    const list = map.get(r.model_id);
    if (list) list.push(r.express_id);
    else map.set(r.model_id, [r.express_id]);
  });
  return [...map.entries()].map(([modelId, ids]) => ({ modelId, ids }));
};

const SET_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];

type Active = { g: number; i: number } | null;

export const BimSmartSetsPanel: React.FC<BimSmartSetsPanelProps> = ({
  projectId,
  models,
  canEdit,
  currentUserName,
  onSelect,
  onIsolate,
  onColorize,
  className = '',
}) => {
  const modelIds = useMemo(() => models.filter((m) => m.status === 'ready').map((m) => m.id), [models]);
  const { data: catalog = [], isLoading: loadingCatalog } = useBimFieldCatalog(modelIds);
  const { data: sets = [] } = useBimSmartSets(projectId);
  const saveMutation = useSaveBimSmartSet(projectId);
  const deleteMutation = useDeleteBimSmartSet(projectId);
  // Mẫu bộ chọn dùng chung giữa dự án (migration 20261023130000)
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { can } = usePermissionContext();
  const canShare = can('bim', 'create') || can('admin_accounts', 'view');
  const [showTemplates, setShowTemplates] = useState(false);
  const templates = useQuery({
    queryKey: ['bim-set-templates', 'panel'],
    queryFn: () => BimOpsService.templates(),
    enabled: showTemplates,
    retry: false,
  });
  const shareSet = async (id: string, ten: string) => {
    try {
      await BimOpsService.shareSet(id);
      void queryClient.invalidateQueries({ queryKey: ['bim-set-templates'] });
      addToast({ type: 'success', message: `Đã chia sẻ “${ten}” thành mẫu dùng chung.` });
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  const applyTemplate = async (id: string, ten: string) => {
    try {
      await BimOpsService.applyTemplate(id, projectId);
      void queryClient.invalidateQueries({ queryKey: ['bim-smart-sets', projectId] });
      addToast({ type: 'success', message: `Đã thêm “${ten}” vào bộ chọn của dự án.` });
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const [groups, setGroups] = useState<ConditionGroups>([[emptyCondition()]]);
  const [result, setResult] = useState<BimElementRef[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Active>({ g: 0, i: 0 });
  const [setName, setSetName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [colorField, setColorField] = useState<string>('phan_doan_tang');
  const [coloring, setColoring] = useState(false);

  const fieldOptions = useMemo(() => {
    const cols = COLUMN_FIELDS.map((c) => ({
      key: c.key,
      label: c.label,
      group: 'Thông tin chính',
      count: null as number | null,
    }));
    const extra = catalog.map((f) => {
      const path = f.duong_dan as string[];
      return {
        key: fieldKey(f.duong_dan),
        label: fieldLabel(f.duong_dan),
        group: path[0] === 'psets' ? 'Bộ thuộc tính (Pset)' : 'Kiểu & thông tin IFC',
        count: f.so_luong,
      };
    });
    return [...cols, ...extra];
  }, [catalog]);

  const activeCond = active ? (groups[active.g]?.[active.i] ?? null) : null;
  const activeField = activeCond ? fieldKey(activeCond.truong) : null;
  const { data: popular = [] } = useQuery({
    queryKey: ['bim-popular-values', modelIds.join(','), activeField],
    queryFn: () => BimService.getPopularValues(modelIds, parseFieldKey(activeField!)),
    enabled: !!activeField && modelIds.length > 0 && !isNumericField(parseFieldKey(activeField)),
    staleTime: 5 * 60 * 1000,
  });
  const suggestions = useMemo(
    () =>
      activeCond && !isNumericField(activeCond.truong)
        ? suggestValues(activeCond.truong, activeCond.gia_tri ?? '', popular)
        : [],
    [activeCond, popular],
  );

  const update = (next: ConditionGroups) => {
    setGroups(next);
    setResult(null);
  };
  const updateCondition = (g: number, i: number, patch: Partial<BimSetCondition>) =>
    update(groups.map((grp, gi) => (gi !== g ? grp : grp.map((c, ci) => (ci === i ? { ...c, ...patch } : c)))));
  const removeCondition = (g: number, i: number) => {
    const next = groups
      .map((grp, gi) => (gi === g ? grp.filter((_, ci) => ci !== i) : grp))
      .filter((grp) => grp.length > 0);
    update(next.length ? next : [[emptyCondition()]]);
    setActive(null);
  };
  const addCondition = (g: number) => {
    update(groups.map((grp, gi) => (gi === g ? [...grp, emptyCondition()] : grp)));
    setActive({ g, i: groups[g].length });
  };
  const addGroup = () => {
    update([...groups, [emptyCondition()]]);
    setActive({ g: groups.length, i: 0 });
  };

  const run = async (source: ConditionGroups = groups) => {
    const valid = validGroups(source);
    if (valid.length === 0) {
      setError('Nhập ít nhất một điều kiện có giá trị.');
      return null;
    }
    setRunning(true);
    setError(null);
    try {
      const rows = await BimSelectionService.filterGroups(modelIds, valid);
      setResult(rows);
      return rows;
    } catch (err: any) {
      setError(err.message || 'Không lọc được cấu kiện');
      return null;
    } finally {
      setRunning(false);
    }
  };

  const loadSet = async (set: BimSmartSet, action: 'select' | 'isolate' | 'color') => {
    const loaded = groupsOfSet(set);
    setGroups(loaded.length ? loaded : [[emptyCondition()]]);
    setSetName(set.ten);
    setEditingId(set.id);
    const rows = await run(loaded);
    if (!rows) return;
    if (action === 'select') onSelect(rows.map((r) => ({ modelId: r.model_id, expressId: r.express_id })));
    else if (action === 'isolate') onIsolate(groupByModel(rows));
    else {
      const color = set.mau || SET_COLORS[0];
      onColorize({
        title: set.ten,
        groups: groupByModel(rows).map((g) => ({ ...g, color })),
        legend: [{ color, label: set.ten, count: rows.length }],
      });
    }
  };

  const saveSet = () => {
    if (!setName.trim()) return;
    const stored = storedFromGroups(validGroups(groups));
    saveMutation.mutate(
      {
        id: editingId || undefined,
        project_id: projectId,
        ten: setName.trim(),
        dieu_kien: stored.dieu_kien,
        nhom_dieu_kien: stored.nhom_dieu_kien,
        mau: sets.find((s) => s.id === editingId)?.mau || SET_COLORS[sets.length % SET_COLORS.length],
        ten_nguoi_tao: currentUserName,
      },
      { onSuccess: (saved) => setEditingId(saved.id) },
    );
  };

  const colorByProperty = async () => {
    setColoring(true);
    setError(null);
    try {
      const field = parseFieldKey(colorField) as BimFieldRef;
      const rows = await BimService.getFieldValues(modelIds, field);
      const { buckets, missing } = bucketValues(rows);
      const colored = buckets.flatMap((b) =>
        [...b.byModel.entries()].map(([modelId, ids]) => ({ modelId, color: b.color, ids })),
      );
      const legend = buckets.map((b) => ({ color: b.color, label: b.label, count: b.count }));
      if (missing) legend.push({ color: '#cbd5e1', label: 'Không có giá trị (giữ màu gốc)', count: missing });
      onColorize({ title: fieldLabel(field), groups: colored, legend });
    } catch (err: any) {
      setError(err.message || 'Không tô màu được');
    } finally {
      setColoring(false);
    }
  };

  if (modelIds.length === 0) {
    return (
      <p className={`text-xs text-slate-400 italic p-3 ${className}`}>
        Chưa có mô hình nào xử lý xong để lọc cấu kiện.
      </p>
    );
  }

  const inputCls =
    'w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-2xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500';

  // Hàm dựng (không phải component) để ô chọn không bị gắn lại mỗi lần vẽ
  const renderFieldSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <BimSelect value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-label={label}>
      {['Thông tin chính', 'Kiểu & thông tin IFC', 'Bộ thuộc tính (Pset)'].map((g) => (
        <optgroup key={g} label={g}>
          {fieldOptions
            .filter((f) => f.group === g)
            .map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {f.count ? ` (${formatNumber(f.count, 2)})` : ''}
              </option>
            ))}
        </optgroup>
      ))}
    </BimSelect>
  );

  return (
    <div className={`flex flex-col gap-3 overflow-y-auto text-xs ${className}`}>
      {/* Bộ lọc */}
      <section className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-primary-600" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">Lọc theo điều kiện</span>
          {loadingCatalog && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          <span className="flex-1" />
          <span className="text-2xs text-slate-400">{modelIds.length} mô hình</span>
        </div>

        {groups.map((grp, g) => (
          <React.Fragment key={g}>
            {g > 0 && (
              <div
                className="flex items-center gap-2 text-2xs font-bold text-violet-600 dark:text-violet-300"
                aria-hidden
              >
                <span className="flex-1 border-t border-dashed border-violet-300 dark:border-violet-800" /> HOẶC
                <span className="flex-1 border-t border-dashed border-violet-300 dark:border-violet-800" />
              </div>
            )}
            <div
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5"
              role="group"
              aria-label={`Nhóm điều kiện ${g + 1}`}
            >
              {groups.length > 1 && (
                <p className="text-2xs font-semibold text-slate-400 px-1">Nhóm {g + 1} — thỏa mọi điều kiện</p>
              )}
              {grp.map((c, i) => {
                const op = OPERATORS.find((o) => o.key === c.toan_tu);
                const isActive = active?.g === g && active?.i === i;
                return (
                  <div
                    key={i}
                    className={`p-2 rounded-lg border space-y-1.5 ${isActive ? 'border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-950' : 'border-slate-100 dark:border-slate-700'}`}
                    onFocus={() => setActive({ g, i })}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs font-semibold text-slate-400 w-6 shrink-0">
                        {i === 0 ? 'NẾU' : 'VÀ'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {renderFieldSelect(
                          fieldKey(c.truong),
                          (v) => updateCondition(g, i, { truong: parseFieldKey(v), gia_tri: '' }),
                          'Trường',
                        )}
                      </div>
                      {(grp.length > 1 || groups.length > 1) && (
                        <button
                          type="button"
                          className="p-1 text-slate-400 hover:text-rose-500"
                          onClick={() => removeCondition(g, i)}
                          aria-label="Bỏ điều kiện"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 pl-7">
                      <BimSelect
                        value={c.toan_tu}
                        onChange={(e) => updateCondition(g, i, { toan_tu: e.target.value as BimSetOperator })}
                        className={`${inputCls} !w-28 shrink-0`}
                        aria-label="Toán tử"
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </BimSelect>
                      {op?.needsValue && (
                        <BimInput
                          value={c.gia_tri ?? ''}
                          onChange={(e) => updateCondition(g, i, { gia_tri: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && run()}
                          list={isActive ? 'bim-set-suggest' : undefined}
                          placeholder={
                            isNumericField(c.truong)
                              ? 'Số, VD 0.5'
                              : c.truong === 'loai_cau_kien'
                                ? 'VD: cột, dầm, ống gió'
                                : 'Giá trị'
                          }
                          className={inputCls}
                          aria-label="Giá trị"
                        />
                      )}
                    </div>
                    {isActive && op?.needsValue && suggestions.length > 0 && (c.gia_tri ?? '').trim() !== '' && (
                      <div className="pl-7 flex flex-wrap gap-1" aria-label="Gợi ý giá trị">
                        {suggestions.slice(0, 8).map((s) => (
                          <button
                            key={`${s.operator || '='}:${s.value}`}
                            type="button"
                            onClick={() =>
                              updateCondition(g, i, {
                                gia_tri: s.value,
                                ...(s.operator ? { toan_tu: s.operator } : {}),
                              })
                            }
                            className="px-1.5 py-0.5 rounded-full border border-primary-200 dark:border-primary-800 text-2xs text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40"
                            data-tooltip={s.value}
                          >
                            {s.label}
                            {s.count ? <span className="opacity-60"> · {formatNumber(s.count, 2)}</span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => addCondition(g)}
                className="px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary-600 hover:border-primary-400 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Thêm điều kiện (VÀ)
              </button>
            </div>
          </React.Fragment>
        ))}
        <datalist id="bim-set-suggest">
          {popular.map((s) => (
            <option key={s.gia_tri} value={s.gia_tri}>
              {formatNumber(s.so_luong, 2)} cấu kiện
            </option>
          ))}
        </datalist>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={addGroup}
            className="px-2 py-1 rounded-lg border border-dashed border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-300 hover:border-violet-500 flex items-center gap-1"
          >
            <GitBranch className="w-3 h-3" /> Thêm nhóm HOẶC
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => run()}
            disabled={running}
            className="px-3 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold flex items-center gap-1"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Tìm
          </button>
        </div>

        {error && <p className="text-2xs text-rose-600">{error}</p>}

        {result && (
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 space-y-2">
            <p className="text-slate-600 dark:text-slate-300">
              Tìm thấy <b className="text-slate-900 dark:text-white">{formatNumber(result.length, 2)}</b> cấu
              kiện
              {groupByModel(result).length > 1 ? ` trong ${groupByModel(result).length} mô hình` : ''}.
            </p>
            {result.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(result.map((r) => ({ modelId: r.model_id, expressId: r.express_id })))}
                  className="py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary-400 flex items-center justify-center gap-1"
                >
                  <MousePointerClick className="w-3 h-3" /> Chọn
                </button>
                <button
                  type="button"
                  onClick={() => onIsolate(groupByModel(result))}
                  className="py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary-400 flex items-center justify-center gap-1"
                >
                  <Focus className="w-3 h-3" /> Cô lập
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onColorize({
                      title: setName || 'Kết quả lọc',
                      groups: groupByModel(result).map((g) => ({ ...g, color: '#f59e0b' })),
                      legend: [{ color: '#f59e0b', label: groupsText(validGroups(groups)), count: result.length }],
                    })
                  }
                  className="py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary-400 flex items-center justify-center gap-1"
                >
                  <Paintbrush className="w-3 h-3" /> Tô màu
                </button>
              </div>
            )}
            {canEdit && (
              <div className="flex items-center gap-1.5">
                <BimInput
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="Tên bộ chọn, VD: Cột BTCT tầng 2"
                  className={inputCls}
                  aria-label="Tên bộ chọn"
                />
                <button
                  type="button"
                  onClick={saveSet}
                  disabled={!setName.trim() || saveMutation.isPending}
                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1 shrink-0 dark:bg-emerald-600"
                >
                  <Save className="w-3 h-3" /> {editingId ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bộ chọn đã lưu */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <h4 className="font-semibold text-slate-700 dark:text-slate-200">Bộ chọn đã lưu của dự án</h4>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              aria-expanded={showTemplates}
              className="flex items-center gap-1 text-2xs font-semibold text-primary-600 hover:underline"
            >
              <Library className="w-3.5 h-3.5" /> Mẫu dùng chung
            </button>
          )}
        </div>
        {showTemplates && (
          <div className="p-2 rounded-lg border border-primary-100 dark:border-primary-900 bg-primary-50/50 dark:bg-primary-950 space-y-1">
            {templates.isPending ? (
              <p className="text-2xs text-slate-500">Đang tải mẫu…</p>
            ) : templates.error ? (
              <p className="text-2xs text-amber-700">{(templates.error as Error).message}</p>
            ) : !(templates.data ?? []).length ? (
              <p className="text-2xs text-slate-500">Chưa có mẫu dùng chung.</p>
            ) : (
              (templates.data ?? []).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-2xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.mau || SET_COLORS[0] }} />
                  <span className="flex-1 truncate" data-tooltip={t.mo_ta ?? undefined}>
                    {t.ten}
                  </span>
                  <button
                    type="button"
                    onClick={() => void applyTemplate(t.id, t.ten)}
                    className="px-1.5 py-0.5 rounded border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300"
                  >
                    Dùng
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {sets.length === 0 && (
          <p className="text-2xs text-slate-400 italic px-1">
            Chưa có bộ chọn nào. Lọc xong bấm “Lưu” để dùng lại lần sau.
          </p>
        )}
        {sets.map((s) => (
          <div
            key={s.id}
            className="p-2 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.mau || SET_COLORS[0] }} />
              <span className="flex-1 font-semibold text-slate-700 dark:text-slate-200 truncate">{s.ten}</span>
              <button
                type="button"
                data-tooltip="Chạy và chọn"
                onClick={() => loadSet(s, 'select')}
                className="p-1 text-slate-400 hover:text-primary-600"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-tooltip="Cô lập"
                onClick={() => loadSet(s, 'isolate')}
                className="p-1 text-slate-400 hover:text-primary-600"
              >
                <Focus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-tooltip="Tô màu"
                onClick={() => loadSet(s, 'color')}
                className="p-1 text-slate-400 hover:text-primary-600"
              >
                <Paintbrush className="w-3.5 h-3.5" />
              </button>
              {canShare && (
                <button
                  type="button"
                  data-tooltip="Chia sẻ thành mẫu dùng chung cho dự án khác"
                  onClick={() => void shareSet(s.id, s.ten)}
                  className="p-1 text-slate-400 hover:text-primary-600"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  data-tooltip="Xóa bộ chọn"
                  onClick={() => window.confirm(`Xóa bộ chọn “${s.ten}”?`) && deleteMutation.mutate(s.id)}
                  className="p-1 text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="mt-0.5 pl-5 text-2xs text-slate-400 truncate" data-tooltip={groupsText(groupsOfSet(s))}>
              {groupsText(groupsOfSet(s))}
            </p>
          </div>
        ))}
      </section>

      {/* Tô màu theo thuộc tính */}
      <section className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-violet-600" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">Tô màu theo thuộc tính bất kỳ</span>
        </div>
        {renderFieldSelect(colorField, setColorField, 'Thuộc tính tô màu')}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={colorByProperty}
            disabled={coloring}
            className="flex-1 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-1 dark:bg-violet-600"
          >
            {coloring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Palette className="w-3 h-3" />} Tô màu & tạo chú
            giải
          </button>
          <button
            type="button"
            onClick={() => onColorize(null)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700"
          >
            Tắt
          </button>
        </div>
        <p className="text-2xs text-slate-400 leading-relaxed">
          Giá trị số được chia 6 khoảng theo dải màu xanh → đỏ; giá trị chữ mỗi loại một màu. Chú giải hiện ở góc trái
          dưới mô hình.
        </p>
      </section>
    </div>
  );
};
