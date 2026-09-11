"use client";

import React, { useCallback } from 'react';
import { useSlidePanel } from '@/contexts/SlidePanelContext';
import { DossierDetailPanel } from './DossierDetailPanel';
import { CreateDossierPanel } from './CreateDossierPanel';

export type EntityType = 'dossier' | 'project' | 'permit' | 'investor' | 'staff';

export interface EntityPanelOptions {
  id: string;
  title?: string;
  url?: string;
}

export function useEntityPanel() {
  const { openPanel, closePanel, closeAllPanels } = useSlidePanel();

  const openCreateDossier = useCallback((onSuccess?: () => void) => {
    const panelId = 'create-dossier-panel';
    return openPanel({
      id: panelId,
      title: 'Tiếp nhận hồ sơ mới',
      component: (
        <CreateDossierPanel
          onClose={() => closePanel(panelId)}
          onSuccess={() => {
            closePanel(panelId);
            if (onSuccess) onSuccess();
          }}
        />
      ),
      width: '680px',
    });
  }, [openPanel, closePanel]);

  const open = useCallback(
    (type: EntityType, options: EntityPanelOptions) => {
      const panelId = `${type}-${options.id}`;

      let component: React.ReactNode = null;
      let title = options.title;

      switch (type) {
        case 'dossier':
          component = (
            <DossierDetailPanel
              id={options.id}
              onClose={() => closePanel(panelId)}
            />
          );
          title = title || `Hồ sơ ${options.id}`;
          break;

        case 'project':
          component = (
            <div className="p-6">
              <h2 className="text-lg font-bold">Chi tiết Dự án #{options.id}</h2>
              <p className="text-sm text-slate-500 mt-2">Dữ liệu dự án từ Supabase...</p>
            </div>
          );
          title = title || `Dự án ${options.id}`;
          break;

        case 'permit':
          component = (
            <div className="p-6">
              <h2 className="text-lg font-bold">Giấy phép xây dựng #{options.id}</h2>
              <p className="text-sm text-slate-500 mt-2">Hồ sơ cấp GPXD...</p>
            </div>
          );
          title = title || `GPXD ${options.id}`;
          break;

        default:
          component = <div className="p-6">Chi tiết thực thể #{options.id}</div>;
      }

      return openPanel({
        id: panelId,
        title,
        component,
        url: options.url || `/${type}s/${options.id}`,
        width: '680px',
      });
    },
    [openPanel, closePanel]
  );

  return { open, openCreateDossier, close: closePanel, closeAll: closeAllPanels };
}

export default useEntityPanel;

