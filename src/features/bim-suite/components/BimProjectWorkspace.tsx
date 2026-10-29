'use client';
import { lazy, useState } from 'react';


import {
  Boxes,
  CalendarRange,
  ClipboardCheck,
  Coins,
  Database,
  KeyRound,
  Layers,
  Leaf,
  PackageCheck,
  Wrench,
} from 'lucide-react';
import { useSearchParams } from '../adapters/router';
import { BimAssetWorkspace } from './BimAssetWorkspace';
import { BimHandoverWorkspace } from './handover/BimHandoverWorkspace';
import { useBimAccess } from '../adapters/context';
import { ErrorBoundary } from '../adapters/ui';
import { BimModelCheckWorkspace } from './cde/BimModelCheckWorkspace';
import { BimDataQualityPanel } from './BimDataQualityPanel';
import { BimAddinTokens } from './ops/BimAddinTokens';
import { BimScheduleManager } from './plan/BimScheduleManager';
import { BimCostManager } from './plan/BimCostManager';
import { BimProposalWorkspace } from './proposal/BimProposalWorkspace';
import { BimSustainWorkspace } from './sustain/BimSustainWorkspace';
import { useBimModels } from '../hooks/useBim';


// three.js và ThatOpen chỉ chạy trên trình duyệt (WebGL, Worker) và nặng vài MB: tải riêng, không prerender.
const BimProjectViewer = lazy(() => import('./BimProjectViewer'));
const BimProposalSplitView = lazy(() => import('./proposal/BimProposalSplitView').then(m => ({default:m.BimProposalSplitView})));

type Tab =
  'viewer' | 'schedule' | 'cost' | 'sustain' | 'options' | 'assets' | 'handover' | 'check' | 'quality' | 'addin';

export function BimProjectWorkspace({ projectId, projectName }: { projectId: string; projectName: string }) {
  const access = useBimAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  // QR labels and links to assets, inspection routes and work orders open the asset register.
  const [tab, setTab] = useState<Tab>(() =>
    ['bimAsset', 'bimRoute', 'bimOrder'].some((k) => searchParams.get(k)) ? 'assets' : 'viewer',
  );
  const locateGuid = (guid: string) => {
    setTab('viewer');
    setSearchParams((current) => {
      current.set('bimGuid', guid);
      return current;
    });
  };
  const models = useBimModels(projectId);
  const [compare, setCompare] = useState<string[] | null>(null);
  const tabs: [Tab, string, typeof Boxes][] = [
    ['viewer', 'Không gian mô hình', Boxes],
    ['schedule', 'Tiến độ', CalendarRange],
    ['cost', 'Chi phí', Coins],
    ['sustain', 'Bền vững', Leaf],
    ['options', 'Phương án', Layers],
    ['assets', 'Tài sản', Wrench],
    ['handover', 'Bàn giao', PackageCheck],
    ['check', 'Kiểm tra mô hình', ClipboardCheck],
    ['quality', 'Chất lượng dữ liệu', Database],
    ...(access.canWrite ? ([['addin', 'Kết nối add-in', KeyRound]] as [Tab, string, typeof Boxes][]) : []),
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg-surface px-2.5 py-1.5 shadow-xs">
        <div role="tablist" aria-label="Phân hệ mô hình" className="flex flex-wrap items-center gap-1">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={
                'doc-button cursor-pointer !px-2.5 !py-1 !text-xs transition-all ' +
                (tab === key ? 'doc-primary shadow-xs' : 'border-transparent bg-transparent hover:bg-bg-subtle')
              }
              onClick={() => setTab(key)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 text-2xs text-txt-muted 2xl:flex">

        </div>
      </div>
      {/* The viewer stays mounted so loaded models survive switching tabs. */}
      <div hidden={tab !== 'viewer'}>
        <ErrorBoundary>
          <BimProjectViewer
            projectId={projectId}
            projectName={projectName}
            onOpenSchedule={() => setTab('schedule')}
            onOpenSustain={() => setTab('sustain')}
          />
        </ErrorBoundary>
      </div>
      {tab === 'schedule' ? (
        <BimScheduleManager
          projectId={projectId}
          projectName={projectName}
          canWrite={access.canWrite}
          onSimulate={() => setTab('viewer')}
        />
      ) : null}
      {tab === 'cost' ? (
        <BimCostManager projectId={projectId} canWrite={access.canWrite} canManage={access.canManage} />
      ) : null}
      {tab === 'sustain' ? (
        <BimSustainWorkspace
          projectId={projectId}
          canWrite={access.canWrite}
          canManage={access.canManage}
          organizationId={access.organizationId ?? null}
          isOrgAdmin={access.isOrgAdmin}
        />
      ) : null}
      {tab === 'assets' ? (
        <BimAssetWorkspace
          projectId={projectId}
          projectName={projectName}
          models={models.data ?? []}
          onLocateGuid={locateGuid}
        />
      ) : null}
      {tab === 'handover' ? <BimHandoverWorkspace projectId={projectId} projectName={projectName} /> : null}
      {tab === 'options' ? (
        compare ? (
          <ErrorBoundary>
            <BimProposalSplitView projectId={projectId} ids={compare} onClose={() => setCompare(null)} />
          </ErrorBoundary>
        ) : (
          <BimProposalWorkspace projectId={projectId} canWrite={access.canWrite} onCompare={setCompare} />
        )
      ) : null}
      {tab === 'check' ? <BimModelCheckWorkspace projectId={projectId} projectName={projectName} /> : null}
      {tab === 'quality' ? (
        <BimDataQualityPanel
          className="rounded-2xl border border-border bg-bg-surface p-3 shadow-sm"
          projectId={projectId}
          models={models.data ?? []}
          canEdit={access.canWrite}
        />
      ) : null}
      {tab === 'addin' && access.canWrite ? (
        <div className="rounded-2xl border border-border bg-bg-surface p-4 shadow-sm">
          <BimAddinTokens projectId={projectId} />
        </div>
      ) : null}
    </>
  );
}
