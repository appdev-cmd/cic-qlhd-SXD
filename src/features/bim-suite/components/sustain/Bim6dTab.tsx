// Viewer "Bền vững" tab: carbon and operational energy (Bim6dPanel), QCVN 04-3:2026 check (BimEnvelopePanel).
import React, { useState } from 'react';
import type { BimViewerRef } from '../../viewer/types';
import { Bim6dPanel } from './Bim6dPanel';
import { BimEnvelopePanel } from './BimEnvelopePanel';

type Props = React.ComponentProps<typeof Bim6dPanel> & { viewerRef: React.RefObject<BimViewerRef | null> };

export const Bim6dTab: React.FC<Props> = ({ viewerRef, className, ...props }) => {
  const [view, setView] = useState<'carbon' | 'qcvn'>('carbon');
  return (
    <div className={`flex min-h-0 flex-col ${className ?? ''}`}>
      <div role="tablist" aria-label="Bền vững 6D" className="flex gap-1 px-3 pt-2">
        {(
          [
            ['carbon', 'Carbon, năng lượng'],
            ['qcvn', 'QCVN 04-3:2026'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`flex-1 rounded-lg border px-2 py-1 text-2xs font-semibold ${view === k ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-secondary dark:border-slate-600 dark:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'carbon' ? (
        <Bim6dPanel {...props} className="min-h-0 flex-1" />
      ) : (
        <BimEnvelopePanel
          projectId={props.projectId}
          viewerRef={viewerRef}
          canEdit={props.canEdit}
          onOpenSustain={props.onOpenSustain}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
};
