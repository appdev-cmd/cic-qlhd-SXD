import { BimDownload } from '@/features/bim-suite/adapters/controls';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimIdsPanel.tsx
// Kiểm tra mô hình theo IDS (buildingSMART Information Delivery Specification):
// nạp file .ids (bộ mẫu, chuẩn dữ liệu của đơn vị hoặc tệp máy), chạy kiểm tra trên máy chủ, xem cấu kiện không đạt,
// xuất báo cáo CSV. Quản trị đơn vị lưu tệp IDS làm chuẩn dữ liệu dùng chung cho các dự án của đơn vị.

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileCheck2,
  Upload,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  MinusCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Paintbrush,
  MousePointerClick,
  FileSpreadsheet,
  Download,
  Save,
  Trash2,
} from 'lucide-react';
import { BimModel } from '@/features/bim-suite/types/bim.types';
import { BimService } from '../services/BimService';
import { IdsDocument, IdsSpecResult, parseIds, evaluateSpec, facetLabel, cardinalityLabel } from '../lib/ids';
import type { SmartSetColoring } from './BimSmartSetsPanel';
import { BimCheckService } from '../services/BimCheckService';
import { downloadCsv } from '../lib/csv';
import { useToast } from '@/features/bim-suite/adapters/toast';

const TEMPLATES = [
  { file: 'dan-dung.ids', label: 'Công trình dân dụng' },
  { file: 'di-tich-go.ids', label: 'Tu bổ di tích kiến trúc gỗ' },
  { file: 'duong-sat.ids', label: 'Đường sắt (IFC 4.3)' },
];

interface BimIdsPanelProps {
  models: BimModel[];
  /** Organization whose data standards (IDS files) are offered; admins can add and remove them. */
  organizationId?: string;
  canManageStandards?: boolean;
  onSelect?: (items: { modelId: string; expressId: number }[]) => void;
  onColorize?: (coloring: SmartSetColoring | null) => void;
  className?: string;
}

const STATUS = {
  dat: { icon: CheckCircle2, cls: 'text-emerald-600', label: 'Đạt' },
  khong_dat: { icon: XCircle, cls: 'text-rose-600', label: 'Không đạt' },
  khong_ap_dung: { icon: MinusCircle, cls: 'text-slate-400', label: 'Không có cấu kiện áp dụng' },
  chua_ho_tro: { icon: HelpCircle, cls: 'text-amber-500', label: 'Chưa hỗ trợ kiểm tra tự động' },
} as const;

const byModel = (els: { model_id: string; express_id: number }[]) => {
  const map = new Map<string, number[]>();
  els.forEach((e) => map.set(e.model_id, [...(map.get(e.model_id) || []), e.express_id]));
  return [...map.entries()].map(([modelId, ids]) => ({ modelId, ids }));
};

export const BimIdsPanel: React.FC<BimIdsPanelProps> = ({
  models,
  organizationId,
  canManageStandards = false,
  onSelect,
  onColorize,
  className = '',
}) => {
  const { addToast } = useToast();
  const cache = useQueryClient();
  const standards = useQuery({
    queryKey: ['bim-data-standards', organizationId],
    queryFn: () => BimCheckService.standards(organizationId!),
    enabled: !!organizationId,
  });
  const [xml, setXml] = useState('');
  const [fromStandard, setFromStandard] = useState<string | null>(null);
  const modelIds = useMemo(() => models.filter((m) => m.status === 'ready').map((m) => m.id), [models]);
  const [doc, setDoc] = useState<IdsDocument | null>(null);
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState<IdsSpecResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (xml: string, name: string) => {
    try {
      setDoc(parseIds(xml));
      setXml(xml);
      setFromStandard(null);
      setFileName(name);
      setResults(null);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadTemplate = async (value: string) => {
    try {
      if (value.startsWith('std:')) {
        const id = value.slice(4);
        const standard = standards.data?.find((s) => s.id === id);
        load(await BimCheckService.standardXml(id), standard?.ten ?? 'chuan-du-lieu.ids');
        setFromStandard(id);
        return;
      }
      const res = await fetch(`/bim/ids/${value}`);
      load(await res.text(), value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nạp được tệp IDS');
    }
  };
  const saveStandard = async () => {
    if (!organizationId || !doc) return;
    try {
      await BimCheckService.saveStandard(organizationId, {
        ten: doc.title || fileName,
        phien_ban: doc.version,
        ids_xml: xml,
      });
      void cache.invalidateQueries({ queryKey: ['bim-data-standards', organizationId] });
      addToast({ type: 'success', message: 'Đã lưu vào chuẩn dữ liệu của đơn vị.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Không lưu được' });
    }
  };
  const removeStandard = async (id: string) => {
    try {
      await BimCheckService.deleteStandard(id);
      void cache.invalidateQueries({ queryKey: ['bim-data-standards', organizationId] });
      setFromStandard(null);
      addToast({ type: 'success', message: 'Đã gỡ chuẩn dữ liệu khỏi đơn vị.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Không gỡ được' });
    }
  };

  const run = async () => {
    if (!doc) return;
    setRunning(true);
    setError(null);
    const out: IdsSpecResult[] = [];
    try {
      for (let i = 0; i < doc.specifications.length; i++) {
        setProgress(`Đang kiểm tra ${i + 1}/${doc.specifications.length}: ${doc.specifications[i].name}`);
        out.push(await evaluateSpec(doc.specifications[i], (conds) => BimService.filterElements(modelIds, conds)));
        setResults([...out]);
      }
    } catch (err: any) {
      setError(err.message || 'Không kiểm tra được');
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  const summary = useMemo(() => {
    if (!results) return null;
    const count = (s: IdsSpecResult['status']) => results.filter((r) => r.status === s).length;
    return {
      dat: count('dat'),
      khong_dat: count('khong_dat'),
      khong_ap_dung: count('khong_ap_dung'),
      chua_ho_tro: count('chua_ho_tro'),
    };
  }, [results]);

  const colorFailures = () => {
    if (!results) return;
    const failed = results.flatMap((r) => r.failedElements);
    const unique = new Map(failed.map((e) => [`${e.model_id}:${e.express_id}`, e]));
    onColorize?.({
      title: `IDS: ${doc?.title || fileName}`,
      groups: byModel([...unique.values()]).map((g) => ({ ...g, color: '#dc2626' })),
      legend: [{ color: '#dc2626', label: 'Cấu kiện không đạt yêu cầu IDS', count: unique.size }],
    });
  };

  const exportCsv = () => {
    if (!results || !doc) return;
    const nameOf = new Map(models.map((m) => [m.id, m.file_name]));
    const rows: (string | number)[][] = [
      [
        'STT',
        'Yêu cầu',
        'Kết quả',
        'Cấu kiện áp dụng',
        'Cấu kiện không đạt',
        'Điều kiện',
        'Mô hình',
        'Express ID',
        'GUID',
      ],
    ];
    results.forEach((r, i) => {
      const head = [i + 1, r.spec.name, STATUS[r.status].label, r.applicableCount, r.failedElements.length];
      const failures = r.requirements.flatMap((q) =>
        q.supported
          ? q.failed
              .slice(0, 5000)
              .map((e) => [q.label, nameOf.get(e.model_id) || e.model_id, e.express_id, e.global_id || ''])
          : [[`${q.label} (chưa hỗ trợ)`, '', '', '']],
      );
      if (!failures.length) rows.push([...head, '', '', '', '']);
      failures.forEach((x) => rows.push([...head, ...x]));
    });
    downloadCsv(`Kiem_tra_IDS_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    BimService.logBimActivity(
      'EXPORT',
      { id: modelIds[0], name: doc.title },
      `Xuất báo cáo kiểm tra IDS "${doc.title}" (${modelIds.length} mô hình)`,
    );
  };

  if (modelIds.length === 0)
    return <p className={`text-xs text-slate-400 italic p-3 ${className}`}>Chưa có mô hình xử lý xong để kiểm tra.</p>;

  return (
    <div className={`flex flex-col gap-2 text-xs overflow-y-auto ${className}`}>
      <div className="flex items-center gap-2">
        <FileCheck2 className="w-4 h-4 text-primary-600" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Kiểm tra theo IDS (buildingSMART)</span>
      </div>
      <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Nạp bộ yêu cầu thông tin (.ids) của Chủ đầu tư, hệ thống đối chiếu từng cấu kiện trong {modelIds.length} mô hình
        đang hiển thị.
      </p>

      <div className="flex flex-wrap gap-1.5">
        <BimSelect
          value=""
          onChange={(e) => e.target.value && loadTemplate(e.target.value)}
          className="flex-1 min-w-[140px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-2xs"
          aria-label="Bộ IDS mẫu"
        >
          <option value="">Chọn bộ yêu cầu…</option>
          {standards.data?.length ? (
            <optgroup label="Chuẩn dữ liệu của đơn vị">
              {standards.data.map((st) => (
                <option key={st.id} value={`std:${st.id}`}>
                  {st.ten}
                  {st.phien_ban ? ` · v${st.phien_ban}` : ''}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Bộ mẫu">
            {TEMPLATES.map((t) => (
              <option key={t.file} value={t.file}>
                {t.label}
              </option>
            ))}
          </optgroup>
        </BimSelect>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary-400 flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Nạp file .ids
        </button>
        <BimInput
          ref={fileRef}
          type="file"
          accept=".ids,.xml"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) load(await f.text(), f.name);
          }}
        />
      </div>

      {error && <p className="text-2xs text-rose-600">{error}</p>}

      {doc && (
        <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{doc.title}</p>
              <p className="text-2xs text-slate-400 truncate">
                {fileName} · {doc.specifications.length} yêu cầu{doc.version ? ` · v${doc.version}` : ''}
              </p>
            </div>
            {canManageStandards && organizationId && !fromStandard && !TEMPLATES.some((t) => t.file === fileName) && (
              <button
                type="button"
                onClick={() => void saveStandard()}
                className="p-1 text-slate-400 hover:text-primary-600"
                data-tooltip="Lưu làm chuẩn dữ liệu của đơn vị"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
            )}
            {canManageStandards && fromStandard && (
              <button
                type="button"
                onClick={() => void removeStandard(fromStandard)}
                className="p-1 text-slate-400 hover:text-rose-600"
                data-tooltip="Gỡ khỏi chuẩn dữ liệu của đơn vị"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {TEMPLATES.some((t) => t.file === fileName) && (
              <BimDownload
                href={`/bim/ids/${fileName}`}
                download
                className="p-1 text-slate-400 hover:text-primary-600"
                data-tooltip="Tải file mẫu để chỉnh sửa"
              >
                <Download className="w-3.5 h-3.5" />
              </BimDownload>
            )}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="w-full py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-1.5"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Đang kiểm tra…' : results ? 'Kiểm tra lại' : 'Chạy kiểm tra'}
          </button>
          {progress && <p className="text-2xs text-slate-400 truncate">{progress}</p>}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-4 gap-1 text-center">
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => {
            const S = STATUS[k];
            return (
              <div key={k} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900">
                <S.icon className={`w-3.5 h-3.5 mx-auto ${S.cls}`} />
                <div className="font-black text-slate-800 dark:text-slate-100">{summary[k]}</div>
                <div className="text-3xs text-slate-400 leading-tight">{S.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {results && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={colorFailures}
            className="flex-1 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center justify-center gap-1"
          >
            <Paintbrush className="w-3 h-3 text-rose-500" /> Tô đỏ cấu kiện lỗi
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex-1 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 flex items-center justify-center gap-1"
          >
            <FileSpreadsheet className="w-3 h-3 text-emerald-600" /> Xuất CSV
          </button>
        </div>
      )}

      {results?.map((r, i) => {
        const S = STATUS[r.status];
        const expanded = open === i;
        return (
          <div key={i} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : i)}
              className="w-full flex items-start gap-2 p-2 text-left"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-400" />
              )}
              <S.icon className={`w-4 h-4 shrink-0 ${S.cls}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-700 dark:text-slate-200">{r.spec.name}</span>
                <span className="block text-2xs text-slate-400">
                  {formatNumber(r.applicableCount, 2)} cấu kiện áp dụng
                  {r.failedElements.length ? ` · ${formatNumber(r.failedElements.length, 2)} không đạt` : ''}
                  {r.occursFailed
                    ? r.spec.maxOccurs === 0
                      ? ' · không được phép có'
                      : ' · thiếu cấu kiện bắt buộc'
                    : ''}
                </span>
              </span>
            </button>
            {expanded && (
              <div className="px-2 pb-2 pl-9 space-y-1.5">
                {r.spec.description && <p className="text-2xs text-slate-500">{r.spec.description}</p>}
                <p className="text-2xs text-slate-400">Áp dụng: {r.spec.applicability.map(facetLabel).join(' · ')}</p>
                {r.requirements.map((q, k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    {q.supported ? (
                      q.failed.length ? (
                        <XCircle className="w-3 h-3 text-rose-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      )
                    ) : (
                      <HelpCircle className="w-3 h-3 text-amber-500 shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300" data-tooltip={q.label}>
                      {q.label} <span className="text-slate-400">({cardinalityLabel[q.cardinality]})</span>
                    </span>
                    {q.failed.length > 0 && onSelect && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelect(q.failed.map((e) => ({ modelId: e.model_id, expressId: e.express_id })))
                        }
                        className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950 text-rose-600 text-2xs flex items-center gap-0.5"
                      >
                        <MousePointerClick className="w-2.5 h-2.5" /> {formatNumber(q.failed.length, 2)}
                      </button>
                    )}
                  </div>
                ))}
                {r.spec.maxOccurs === 0 && r.failedElements.length > 0 && onSelect && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(r.failedElements.map((e) => ({ modelId: e.model_id, expressId: e.express_id })))
                    }
                    className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950 text-rose-600 text-2xs"
                  >
                    Chọn {formatNumber(r.failedElements.length, 2)} cấu kiện vi phạm
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
