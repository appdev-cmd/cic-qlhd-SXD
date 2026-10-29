import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Analytics side panel of the viewer: overview dashboard, information quality, IDS, 5D cost, data quality and reports
// (weekly report + periodic report of this project), plus the Word export of the model report. Ported from cic-hud
// BimAnalyticsPanel; the ISO 19650 CDE tab is dropped (CDE lives in the BuildSIA document library), the IoT / HUD
// scope is replaced by a model / floor / Uniclass filter built from the IFC data.
import React, { useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Coins, Database, FileCheck2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { BimIssue, BimModel, BimQualityReport } from '../types/bim.types';
import { BimService } from '../services/BimService';
import { useBimIntelligence } from '../hooks/useBimIntelligence';
import { exportBimReportDocx } from '../lib/bimReport';
import type { InsightElement } from '../lib/bimIntelligence';
import type { SmartSetColoring } from './BimSmartSetsPanel';
import { BimInsightDashboard, BimInsightScopeBar, type InsightActions } from './BimInsightDashboard';
import { BimQualityPanel } from './BimQualityPanel';
import { BimIdsPanel } from './BimIdsPanel';
import { BimCostPanel } from './BimCostPanel';
import { BimDataQualityPanel } from './BimDataQualityPanel';
import { BimWeeklyReportPanel } from './BimWeeklyReportPanel';
import { BimPeriodicReport } from './ops/BimPeriodicReport';

export type AnalyticsTab = 'tong_quan' | 'chat_luong' | 'ids' | 'chi_phi' | 'du_lieu' | 'bao_cao';

export interface BimAnalyticsPanelProps {
  projectId: string;
  projectName?: string;
  /** Models loaded in the 3D view (federated); only `ready` ones of this project are analysed. */
  displayModels: BimModel[];
  /** Model in focus (quality check, cost panel default, report header); defaults to the first shown model. */
  activeModel?: BimModel | null;
  /** Project issues (BIM issues list of the viewer). */
  issues: BimIssue[];
  canEdit?: boolean;
  currentUserName?: string;
  /** Organization of the project and org-admin flag, for the IDS standard library. */
  organizationId?: string;
  canManageStandards?: boolean;
  /** Flies to and selects one element. */
  onLocateElement: (modelId: string, expressId: number, guid?: string) => void;
  onSelectElements?: (items: { modelId: string; expressId: number }[]) => void;
  /** Colours element groups on the model (null clears). */
  onColorize?: (coloring: SmartSetColoring | null) => void;
  /** Hands a question to the AI assistant; AI buttons are hidden without it. */
  onAsk?: (question: string) => void;
  /** Opens the issue form pre-filled (title, description, first element). */
  onDraftIssue?: (draft: {
    title: string;
    description: string;
    modelId?: string;
    expressId?: number;
    guid?: string;
    elementName?: string | null;
  }) => void;
  initialTab?: AnalyticsTab;
  className?: string;
}

const TABS: { key: AnalyticsTab; label: string; icon: React.ElementType }[] = [
  { key: 'tong_quan', label: 'Tổng quan', icon: BarChart3 },
  { key: 'chat_luong', label: 'Chất lượng', icon: ShieldCheck },
  { key: 'ids', label: 'IDS', icon: FileCheck2 },
  { key: 'chi_phi', label: 'Chi phí', icon: Coins },
  { key: 'du_lieu', label: 'Dữ liệu', icon: Database },
  { key: 'bao_cao', label: 'Báo cáo', icon: CalendarClock },
];
const COLOR = '#e34948';
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const BimAnalyticsPanel: React.FC<BimAnalyticsPanelProps> = ({
  projectId,
  projectName,
  displayModels,
  activeModel,
  issues,
  canEdit,
  currentUserName,
  organizationId,
  canManageStandards,
  onLocateElement,
  onSelectElements,
  onColorize,
  onAsk,
  onDraftIssue,
  initialTab = 'tong_quan',
  className = '',
}) => {
  const { addToast } = useToast();
  const [tab, setTab] = useState<AnalyticsTab>(initialTab);
  const [reportView, setReportView] = useState<'tuan' | 'ky'>('tuan');
  const [quality, setQuality] = useState<{ modelId: string; report: BimQualityReport } | null>(null);
  const [checking, setChecking] = useState(false);
  const [qualityModelId, setQualityModelId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const w = useBimIntelligence(projectId, displayModels, issues, tab === 'tong_quan' || tab === 'chi_phi');
  const shown = w.models;
  const focus = (activeModel && shown.find((m) => m.id === activeModel.id)) || shown[0] || null;
  const qualityModel = shown.find((m) => m.id === qualityModelId) || focus;
  const unfiltered = w.scope.floorKey === 'all' && w.scope.uniclassPr === 'all' && w.scope.uniclassSs === 'all';

  const actions = useMemo<InsightActions>(
    () => ({
      onAsk,
      onLocate: (row: InsightElement) => onLocateElement(row.model_id, row.express_id, row.global_id),
      onSelect: onSelectElements
        ? (rows) => onSelectElements(rows.map((r) => ({ modelId: r.model_id, expressId: r.express_id })))
        : undefined,
      onColor: onColorize
        ? (rows, title) => {
            const byModel = new Map<string, number[]>();
            for (const r of rows) byModel.set(r.model_id, [...(byModel.get(r.model_id) ?? []), r.express_id]);
            onColorize({
              title,
              groups: [...byModel].map(([modelId, ids]) => ({ modelId, color: COLOR, ids })),
              legend: [{ color: COLOR, label: title, count: rows.length }],
            });
          }
        : undefined,
      onDraft: onDraftIssue
        ? (title, description, row) =>
            onDraftIssue({
              title,
              description,
              modelId: row?.model_id,
              expressId: row?.express_id,
              guid: row?.global_id,
              elementName: row?.ten_cau_kien,
            })
        : undefined,
    }),
    [onAsk, onLocateElement, onSelectElements, onColorize, onDraftIssue],
  );

  const runQuality = async () => {
    if (!qualityModel) return;
    setChecking(true);
    try {
      setQuality({ modelId: qualityModel.id, report: await BimService.checkModelQuality(qualityModel.id) });
    } catch (e) {
      addToast({ title: 'Không kiểm tra được', message: errorText(e), type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const exportReport = async () => {
    const model = w.selectedModels[0] ?? focus;
    if (!model || !w.ready) return;
    setExporting(true);
    try {
      await exportBimReportDocx({
        projectName: projectName || projectId,
        model,
        federatedModels: w.selectedModels,
        quantities: w.analysis.quantities,
        costRows: w.analysis.cost.rows,
        costTotal: w.analysis.cost.total,
        scopeLabel: w.scopeLabel,
        sourceAt: w.dataAt,
        // A quality check covers the whole model, so it is only attached to an unfiltered single-model scope.
        quality:
          unfiltered && quality && w.selectedModels.length === 1 && quality.modelId === model.id
            ? quality.report
            : null,
        issues: w.issues,
        preparedBy: currentUserName,
        truncatedNote:
          w.truncated && !unfiltered
            ? `Mô hình lớn: số liệu theo bộ lọc tính trên ${formatNumber(w.loaded, 2)}/${formatNumber(w.total, 2)} cấu kiện đã đọc.`
            : null,
      });
      addToast({ title: 'Đã xuất báo cáo', message: 'Tệp Word đã được tải về máy.', type: 'success' });
      BimService.logBimActivity(
        'EXPORT',
        { id: model.id, name: model.file_name },
        `Xuất báo cáo Word mô hình BIM dự án ${projectName || projectId}`,
      );
    } catch (e) {
      addToast({ title: 'Lỗi xuất báo cáo', message: errorText(e) || 'Không tạo được tệp Word', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        role="tablist"
        aria-label="Phân tích mô hình"
        className="grid shrink-0 grid-cols-6 gap-0.5 rounded-lg bg-bg-subtle p-0.5 dark:bg-slate-900"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            data-tooltip={label}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-md py-1 text-2xs font-semibold leading-tight transition-colors ${
              tab === key
                ? 'bg-bg-surface text-primary-700 shadow-sm dark:bg-slate-800 dark:text-primary-300'
                : 'text-txt-muted'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        {tab === 'tong_quan' && (
          <BimInsightDashboard
            value={w}
            actions={actions}
            canEdit={canEdit}
            onExportReport={() => void exportReport()}
            exporting={exporting}
          />
        )}

        {tab === 'chat_luong' && (
          <div className="flex h-full flex-col">
            {shown.length > 1 && (
              <BimSelect
                value={qualityModel?.id || ''}
                onChange={(e) => setQualityModelId(e.target.value)}
                aria-label="Mô hình kiểm tra"
                className="mb-2 w-full rounded-xl border border-border bg-white px-2 py-1 text-2xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                {shown.map((m) => (
                  <option key={m.id} value={m.id}>
                    Kiểm tra: {m.file_name}
                  </option>
                ))}
              </BimSelect>
            )}
            <p className="mb-2 text-2xs text-txt-muted">
              Kiểm tra chất lượng trên toàn mô hình đã chọn; danh sách theo tầng và Uniclass nằm trong Tổng quan.
            </p>
            <BimQualityPanel
              model={qualityModel}
              report={quality && quality.modelId === qualityModel?.id ? quality.report : null}
              isRunning={checking}
              onRun={() => void runQuality()}
              onLocate={(expressId, guid) => qualityModel && onLocateElement(qualityModel.id, expressId, guid)}
              className="min-h-0 flex-1"
            />
          </div>
        )}

        {tab === 'ids' && (
          <>
            <p className="mb-2 text-2xs text-txt-muted">
              IDS kiểm tra toàn bộ các mô hình đang hiển thị theo yêu cầu của tệp IDS.
            </p>
            <BimIdsPanel
              models={shown}
              organizationId={organizationId}
              canManageStandards={canManageStandards}
              onSelect={onSelectElements}
              onColorize={onColorize}
              className="h-full"
            />
          </>
        )}

        {tab === 'chi_phi' && (
          <div className="space-y-2">
            <BimInsightScopeBar value={w} />
            {!unfiltered && !w.ready ? (
              <p role="status" className="p-3 text-xs text-txt-muted">
                {w.error
                  ? `Chưa tải đủ nguồn theo phạm vi: ${w.error.message}`
                  : 'Đang tải khối lượng trong phạm vi đã chọn…'}
              </p>
            ) : (
              <BimCostPanel
                projectId={projectId}
                model={focus}
                models={w.selectedModels}
                scopedQuantities={unfiltered ? undefined : w.analysis.quantities}
                scopeLabel={unfiltered ? undefined : w.scopeLabel}
                canEdit={canEdit}
                onSelectElements={onSelectElements}
                className="h-full"
              />
            )}
            {!unfiltered && w.truncated && (
              <p className="text-2xs text-amber-700 dark:text-amber-300">
                Khối lượng theo bộ lọc tính trên {formatNumber(w.loaded, 2)}/{formatNumber(w.total, 2)}{' '}
                cấu kiện đã đọc.
              </p>
            )}
          </div>
        )}

        {tab === 'du_lieu' && (
          <>
            <p className="mb-2 text-2xs text-txt-muted">
              Chỉ số chất lượng tổng hợp trên toàn mô hình, không theo tầng. Xem Tổng quan để lọc và định vị từng vấn
              đề.
            </p>
            <BimDataQualityPanel projectId={projectId} models={shown} canEdit={canEdit} className="h-full" />
          </>
        )}

        {tab === 'bao_cao' && (
          <div className="space-y-2">
            <div role="tablist" aria-label="Loại báo cáo" className="grid grid-cols-2 gap-1">
              {(
                [
                  ['tuan', 'Báo cáo tuần'],
                  ['ky', 'Báo cáo kỳ'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={reportView === key}
                  className={`doc-button px-2 py-1 text-xs ${reportView === key ? 'doc-primary' : ''}`}
                  onClick={() => setReportView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {reportView === 'tuan' ? (
              <BimWeeklyReportPanel
                projectId={projectId}
                projectName={projectName}
                canEdit={canEdit}
                className="h-full"
              />
            ) : (
              <BimPeriodicReport projectId={projectId} projectName={projectName} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
