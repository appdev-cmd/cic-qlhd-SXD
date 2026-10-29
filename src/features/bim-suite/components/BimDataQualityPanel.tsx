import {BimGuide} from '@/features/bim-suite/adapters/controls';
import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/components/BimDataQualityPanel.tsx
// Chất lượng dữ liệu mô hình theo người/đơn vị nộp hoặc bộ môn: % khối lượng khai báo, vật liệu, tầng, proxy.
// Dùng để yêu cầu tư vấn nộp lại IFC đúng Hướng dẫn xuất IFC, và cho chuyển đổi lại các mô hình cũ.

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, RefreshCw, Loader2, ChevronDown, ChevronRight, Copy, BookOpen } from 'lucide-react';
import { BimModel } from '@/features/bim-suite/types/bim.types';
import { BimService } from '../services/BimService';
import { groupDataQuality, DataQualityScore } from '../lib/dataQuality';
import { disciplineLabels } from '../lib/ifcLabels';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { BimCheckService, withQuality } from '../services/BimCheckService';

interface Props {
  projectId: string;
  models: BimModel[];
  canEdit?: boolean;
  className?: string;
}

const TONE: Record<DataQualityScore['muc'], string> = {
  tot: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  kha: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  yeu: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
};

const Bar: React.FC<{ value: number; tone: string; label: string }> = ({ value, tone, label }) => (
  <div className="flex items-center gap-1.5" data-tooltip={`${label}: ${value}%`}>
    <span className="w-14 shrink-0 text-2xs text-slate-400">{label}</span>
    <span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
    <span className="w-9 text-right tabular-nums text-2xs text-slate-500">{value}%</span>
  </div>
);

export const BimDataQualityPanel: React.FC<Props> = ({ projectId, models, canEdit, className = '' }) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [by, setBy] = useState<'nguoi_nop' | 'bo_mon'>('nguoi_nop');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quality = useQuery({
    queryKey: ['bim-field-quality', projectId, models.map((m) => m.updated_at).join(',')],
    queryFn: () => BimCheckService.fieldQuality(projectId),
    staleTime: 60000,
  });
  const ready = useMemo(
    () => withQuality(models, quality.data || []).filter((m) => m.status === 'ready'),
    [models, quality.data],
  );
  const groups = useMemo(() => groupDataQuality(ready, by), [ready, by]);
  // Mô hình chuyển đổi bằng worker cũ: chưa có cảnh báo Qto / toạ độ gốc / ván khuôn / nguồn Pset
  // (bỏ qua bản ghi không còn tệp IFC — worker không chuyển đổi lại được)
  const oldModels = useMemo(() => ready.filter((m) => !m.canh_bao && m.ifc_path), [ready]);
  const total = useMemo(() => {
    const all = ready.map((m) => m.chat_luong).filter(Boolean);
    const n = all.reduce((s, q) => s + (q!.so_cau_kien || 0), 0);
    const declared = all.reduce((s, q) => s + (q!.co_qto || 0) + (q!.co_pset || 0), 0);
    return { n, declared: n ? Math.round((declared / n) * 1000) / 10 : 0 };
  }, [ready]);

  const reprocess = async (ids: string[]) => {
    if (!ids.length) return;
    if (
      !window.confirm(
        `Đưa ${ids.length} mô hình vào hàng đợi chuyển đổi lại? Trong lúc xử lý (vài phút mỗi mô hình), mô hình tạm thời không xem được.`,
      )
    )
      return;
    setBusy(true);
    try {
      for (const id of ids) await BimService.retryModel(id);
      queryClient.invalidateQueries({ queryKey: ['bim-models', projectId] });
      addToast({ type: 'success', message: `Đã đưa ${ids.length} mô hình vào hàng đợi chuyển đổi lại.` });
    } catch (e: any) {
      addToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const copyRequest = (key: string, list: { model: BimModel; score: DataQualityScore }[]) => {
    const lines = [
      `Kính gửi ${by === 'nguoi_nop' ? key : 'đơn vị lập mô hình bộ môn ' + (disciplineLabels[key] || key)},`,
      'Ban QLDA đề nghị hoàn thiện dữ liệu các mô hình IFC sau trước khi nộp lại:',
      ...list
        .filter((x) => x.score.goiY.length)
        .map((x) => `- ${x.model.file_name} (điểm ${x.score.diem}/100): ${x.score.goiY.join('; ')}`),
      `Hướng dẫn xuất IFC: ${window.location.origin}/app/bim/huong-dan`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    addToast({ type: 'success', message: 'Đã sao chép nội dung đề nghị — dán vào công văn / email / vướng mắc.' });
  };

  if (quality.isLoading) return <p className="p-3 text-xs text-slate-500">Đang kiểm tra dữ liệu cấu kiện…</p>;
  if (ready.length === 0)
    return <p className={`text-xs text-slate-400 italic p-3 ${className}`}>Chưa có mô hình xử lý xong.</p>;

  return (
    <div className={`flex flex-col gap-2 text-xs overflow-y-auto ${className}`}>
      {quality.isLoading && <p>Đang kiểm tra dữ liệu cấu kiện…</p>}
      {quality.error && (
        <p role="alert" className="text-red-600">
          Không tải được chỉ số: {quality.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-teal-600" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Chất lượng dữ liệu mô hình</span>
        <span className="flex-1" />
        <BimGuide
          href="/app/bim/huong-dan"
          target="_blank"
          rel="noreferrer"
          className="p-1 text-slate-400 hover:text-teal-600"
          data-tooltip="Hướng dẫn xuất IFC"
        >
          <BookOpen className="w-3.5 h-3.5" />
        </BimGuide>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
          <div className="text-2xs text-slate-400">Cấu kiện có khối lượng khai báo</div>
          <div
            className={`text-lg font-black ${total.declared >= 60 ? 'text-emerald-600' : total.declared >= 30 ? 'text-amber-600' : 'text-rose-600'}`}
          >
            {total.declared}%
          </div>
          <div className="text-2xs text-slate-400">
            {formatNumber(total.n, 2)} cấu kiện · phần còn lại là ước tính hoặc thiếu số đo
          </div>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
          <div className="text-2xs text-slate-400">Mô hình chuyển đổi bằng bản cũ</div>
          <div className={`text-lg font-black ${oldModels.length ? 'text-amber-600' : 'text-emerald-600'}`}>
            {oldModels.length}/{ready.length}
          </div>
          {canEdit && oldModels.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => reprocess(oldModels.map((m) => m.id))}
              className="mt-0.5 text-2xs text-teal-700 dark:text-teal-300 hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Chuyển đổi lại
              tất cả
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900">
        {(
          [
            ['nguoi_nop', 'Theo người / đơn vị nộp'],
            ['bo_mon', 'Theo bộ môn'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setBy(k)}
            className={`py-1 rounded-md ${by === k ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold text-teal-700 dark:text-teal-300' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const expanded = open === g.key;
        const tone = g.diem >= 80 ? 'tot' : g.diem >= 55 ? 'kha' : 'yeu';
        return (
          <div
            key={g.key}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : g.key)}
              className="w-full flex items-center gap-2 p-2 text-left"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {by === 'bo_mon' ? disciplineLabels[g.key] || g.key : g.key}
                </span>
                <span className="block text-2xs text-slate-400">
                  {g.models.length} mô hình · {formatNumber(g.soCauKien, 2)} cấu kiện
                </span>
              </span>
              <span className={`px-1.5 py-0.5 rounded font-bold ${TONE[tone]}`}>{g.diem}</span>
            </button>
            {expanded && (
              <div className="px-2 pb-2 space-y-2">
                {g.models.map(({ model, score }) => (
                  <div key={model.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-1 min-w-0 truncate font-medium text-slate-700 dark:text-slate-200"
                        data-tooltip={model.file_name}
                      >
                        {model.file_name}
                      </span>
                      {!model.canh_bao && (
                        <span className="text-3xs px-1 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                          bản cũ
                        </span>
                      )}
                      <span className={`px-1.5 rounded font-bold ${TONE[score.muc]}`}>{score.diem}</span>
                    </div>
                    <Bar value={score.khaiBao} tone="bg-emerald-500 dark:bg-emerald-500" label="KL khai báo" />
                    <Bar value={score.vatLieu} tone="bg-sky-500 dark:bg-sky-500" label="Vật liệu" />
                    <Bar value={score.tang} tone="bg-violet-500 dark:bg-violet-500" label="Tầng" />
                    {score.proxy > 0 && <Bar value={score.proxy} tone="bg-rose-500 dark:bg-rose-500" label="Proxy" />}
                    {score.goiY.length > 0 && (
                      <p className="text-2xs text-slate-500 leading-snug">→ {score.goiY.join(' · ')}</p>
                    )}
                    {canEdit && !model.canh_bao && model.ifc_path && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reprocess([model.id])}
                        className="text-2xs text-teal-700 dark:text-teal-300 hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" /> Chuyển đổi lại mô hình này
                      </button>
                    )}
                  </div>
                ))}
                {g.models.some((m) => m.score.goiY.length) && (
                  <button
                    type="button"
                    onClick={() => copyRequest(g.key, g.models)}
                    className="w-full py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-400 flex items-center justify-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Sao chép nội dung đề nghị hoàn thiện dữ liệu
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {groups.length === 0 && (
        <p className="text-2xs text-slate-400 italic">Chưa có dữ liệu cấu kiện để tính chỉ số.</p>
      )}
      <p className="text-2xs text-slate-400 leading-relaxed">
        Điểm = 50% khối lượng khai báo (Qto hoặc Pset) + 30% vật liệu + 10% tầng + 10% không dùng
        IfcBuildingElementProxy.
      </p>
    </div>
  );
};
