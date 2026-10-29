// Tab "Khu đất" của trình xem: phân tích nắng (F1), mặt đứng (G9), nắng theo tiến độ (G6), bối cảnh OpenStreetMap (G10) và chỉ số quy hoạch (G1).
import React, { useState } from 'react';
import type { BimModel } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../../viewer/types';
import { BimSunPanel } from './BimSunPanel';
import { BimSitePanel } from './BimSitePanel';
import { BimSunPhasePanel } from './BimSunPhasePanel';
import { BimFacadePanel } from './BimFacadePanel';
import { BimContextPanel } from './BimContextPanel';

export interface BimSiteTabProps {
  projectId: string;
  viewerRef: React.RefObject<BimViewerRef | null>;
  /** Models of the project: a ready model's IfcSite lat/lon is the location fallback when the project has none. */
  models?: BimModel[];
  /** Models loaded in the viewer: the floor area is computed for these (all current models when empty). */
  loadedIds?: string[];
  canEdit: boolean;
  className?: string;
}

const NO_MODELS: BimModel[] = [];
const NO_IDS: string[] = [];
type SiteView = 'nang' | 'mat_dung' | 'tien_do' | 'boi_canh' | 'quy_hoach';
const VIEWS: [SiteView, string][] = [
  ['nang', 'Nắng'],
  ['mat_dung', 'Mặt đứng'],
  ['tien_do', 'Tiến độ'],
  ['boi_canh', 'Bối cảnh'],
  ['quy_hoach', 'Quy hoạch'],
];

export const BimSiteTab: React.FC<BimSiteTabProps> = ({
  projectId,
  viewerRef,
  models = NO_MODELS,
  loadedIds = NO_IDS,
  canEdit,
  className = '',
}) => {
  const [view, setView] = useState<SiteView>('nang');
  const common = { projectId, viewerRef, models, className: 'min-h-0 flex-1' };
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div role="tablist" aria-label="Phân tích khu đất" className="flex gap-1 px-2 pt-2">
        {VIEWS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`flex-1 rounded-lg border px-2 py-1 text-2xs font-semibold ${view === k ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-secondary hover:bg-bg-subtle dark:border-slate-600 dark:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Đổi mục thì gỡ panel cũ (xóa lớp phủ của nó) */}
      {view === 'nang' && <BimSunPanel {...common} canEdit={canEdit} />}
      {view === 'mat_dung' && <BimFacadePanel {...common} />}
      {view === 'tien_do' && <BimSunPhasePanel {...common} />}
      {view === 'boi_canh' && <BimContextPanel {...common} canEdit={canEdit} />}
      {view === 'quy_hoach' && <BimSitePanel {...common} loadedIds={loadedIds} canEdit={canEdit} />}
    </div>
  );
};
