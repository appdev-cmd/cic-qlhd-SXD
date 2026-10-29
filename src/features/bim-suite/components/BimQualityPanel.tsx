import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/components/BimQualityPanel.tsx
// Kiểm tra chất lượng thông tin mô hình (IDS rút gọn): tên, vật liệu, khối lượng, Pset, tầng...

import React, { useState } from 'react';
import { ShieldCheck, Loader2, ChevronDown, ChevronRight, AlertTriangle, Info, XCircle, Crosshair } from 'lucide-react';
import { BimModel, BimQualityReport, BimQualityRule } from '@/features/bim-suite/types/bim.types';
import { getIfcLabel } from '../lib/ifcLabels';

interface BimQualityPanelProps {
  model?: BimModel | null;
  report: BimQualityReport | null;
  isRunning: boolean;
  onRun: () => void;
  onLocate: (expressId: number, guid: string) => void;
  className?: string;
}

const SEVERITY_STYLE: Record<BimQualityRule['severity'], { icon: React.ElementType; color: string; label: string }> = {
  loi: { icon: XCircle, color: 'text-rose-500', label: 'Lỗi' },
  canh_bao: { icon: AlertTriangle, color: 'text-amber-500', label: 'Cảnh báo' },
  thong_tin: { icon: Info, color: 'text-sky-500', label: 'Thông tin' },
};

const scoreColor = (score: number) =>
  score >= 85 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600';

export const BimQualityPanel: React.FC<BimQualityPanelProps> = ({
  model,
  report,
  isRunning,
  onRun,
  onLocate,
  className = '',
}) => {
  const [open, setOpen] = useState<string | null>(null);

  if (!model) {
    return (
      <p className={`text-xs text-slate-400 italic p-3 ${className}`}>
        Chọn một mô hình đã xử lý xong để kiểm tra chất lượng thông tin.
      </p>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-2 pb-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Chất lượng thông tin mô hình</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-2xs font-semibold flex items-center gap-1 dark:bg-emerald-600"
        >
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {isRunning ? 'Đang quét...' : report ? 'Quét lại' : 'Bắt đầu kiểm tra'}
        </button>
      </div>

      {!report && !isRunning && (
        <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Đối chiếu từng cấu kiện với yêu cầu thông tin tối thiểu: có tên, có vật liệu, gắn tầng/phân đoạn, có khối
          lượng và bộ thuộc tính. Kết quả giúp yêu cầu tư vấn bổ sung dữ liệu trước khi nghiệm thu mô hình.
        </p>
      )}

      {report && (
        <div className="flex-1 overflow-y-auto space-y-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <div className="text-center">
              <div className={`text-2xl font-black tabular-nums ${scoreColor(report.score)}`}>{report.score}</div>
              <div className="text-3xs uppercase tracking-wide text-slate-400">điểm /100</div>
            </div>
            <div className="flex-1 text-2xs text-slate-600 dark:text-slate-300">
              Đã kiểm tra <b>{formatNumber(report.totalElements, 2)}</b> cấu kiện.
              <div className="text-slate-400 mt-0.5">
                {report.rules.filter((r) => r.severity === 'loi' && r.count > 0).length} nhóm lỗi ·{' '}
                {report.rules.filter((r) => r.severity === 'canh_bao' && r.count > 0).length} nhóm cảnh báo
              </div>
            </div>
          </div>

          {report.rules.map((rule) => {
            const style = SEVERITY_STYLE[rule.severity];
            const Icon = style.icon;
            const ratio = rule.total ? (rule.count / rule.total) * 100 : 0;
            const expanded = open === rule.id;
            return (
              <div key={rule.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : rule.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <Icon className={`w-3.5 h-3.5 ${rule.count ? style.color : 'text-emerald-500'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-2xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {rule.label}
                    </span>
                    <span className="block h-1 mt-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <span
                        className={`block h-full ${rule.severity === 'loi' ? 'bg-rose-500 dark:bg-rose-500' : rule.severity === 'canh_bao' ? 'bg-amber-500 dark:bg-amber-500' : 'bg-sky-500 dark:bg-sky-500'}`}
                        style={{ width: `${Math.min(100, ratio)}%` }}
                      />
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span
                      className={`block text-2xs font-bold tabular-nums ${rule.count ? style.color : 'text-emerald-600'}`}
                    >
                      {formatNumber(rule.count, 2)}
                    </span>
                    <span className="block text-3xs text-slate-400">{ratio.toFixed(1)}%</span>
                  </span>
                </button>

                {expanded && (
                  <div className="px-2.5 pb-2 border-t border-slate-100 dark:border-slate-700">
                    <p className="py-1.5 text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {rule.description}
                    </p>
                    {rule.count === 0 ? (
                      <p className="text-2xs text-emerald-600">Không có cấu kiện nào vi phạm.</p>
                    ) : (
                      <>
                        <div className="space-y-0.5 max-h-52 overflow-y-auto">
                          {rule.samples.map((s) => (
                            <button
                              key={`${s.express_id}`}
                              type="button"
                              onClick={() => onLocate(s.express_id, s.global_id)}
                              className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left hover:bg-slate-100 dark:hover:bg-slate-700/60"
                            >
                              <Crosshair className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="flex-1 min-w-0 truncate text-2xs text-slate-700 dark:text-slate-200">
                                {s.ten_cau_kien || `#${s.express_id}`}
                              </span>
                              <span className="text-3xs text-slate-400 shrink-0">{getIfcLabel(s.loai_cau_kien)}</span>
                            </button>
                          ))}
                        </div>
                        {rule.count > rule.samples.length && (
                          <p className="pt-1 text-2xs text-slate-400">
                            … và {formatNumber((rule.count - rule.samples.length), 2)} cấu kiện khác.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
