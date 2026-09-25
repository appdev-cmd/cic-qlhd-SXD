import React, { lazy, Suspense, useCallback, useContext } from 'react';
import { Building, Building2, UserCheck } from 'lucide-react';
import { PanelIdContext, useSlidePanel, type SlidePanelEntry } from '../context/SlidePanelContext';
import { PanelLoading } from '../components/entity/PanelState';

export type EntityType = 'project' | 'organization' | 'personnel';

const ProjectPanelById = lazy(() =>
  import('../pages/projects/ProjectPanelById').then((m) => ({ default: m.ProjectPanelById }))
);
const OrganizationDetailPanel = lazy(() =>
  import('../components/entity/OrganizationDetailPanel').then((m) => ({ default: m.OrganizationDetailPanel }))
);
const PersonnelDetailPanel = lazy(() =>
  import('../components/entity/PersonnelDetailPanel').then((m) => ({ default: m.PersonnelDetailPanel }))
);

const ENTITY_CONFIG: Record<
  EntityType,
  { icon: React.ReactNode; path: string; render: (id: string) => React.ReactNode }
> = {
  project: { icon: <Building size={14} />, path: 'projects', render: (id) => <ProjectPanelById id={id} /> },
  organization: { icon: <Building2 size={14} />, path: 'organizations', render: (id) => <OrganizationDetailPanel id={id} /> },
  personnel: { icon: <UserCheck size={14} />, path: 'personnel', render: (id) => <PersonnelDetailPanel id={id} /> },
};

export function entityPanelId(type: EntityType, id: string) {
  return `${type}-${id}`;
}

/** Đường dẫn chuẩn tới thực thể theo mã (UUID / mã hồ sơ) — không dùng slug tiếng Việt. */
export function entityUrl(type: EntityType, id: string) {
  return `/${ENTITY_CONFIG[type].path}/${encodeURIComponent(id)}`;
}

/**
 * Hook trung tâm mở Slide Panel chi tiết thực thể.
 *   const { open } = useEntityPanel(); open('project', { id: project.id, label: project.name });
 */
export function useEntityPanel() {
  const { openPanel } = useSlidePanel();

  const open = useCallback(
    (type: EntityType, opts: { id: string; label?: string; subtitle?: string }) => {
      const cfg = ENTITY_CONFIG[type];
      const entry: SlidePanelEntry = {
        id: entityPanelId(type, opts.id),
        title: opts.label ?? 'Đang tải...',
        subtitle: opts.subtitle,
        tabTitle: opts.label,
        icon: cfg.icon,
        component: <Suspense fallback={<PanelLoading />}>{cfg.render(opts.id)}</Suspense>,
        storageKey: `slidepanel-${type}`,
      };
      openPanel(entry);
    },
    [openPanel]
  );

  return { open };
}

/** Dùng bên trong nội dung panel để cập nhật tiêu đề khi dữ liệu đã tải xong. */
export function useCurrentPanel() {
  const panelId = useContext(PanelIdContext);
  const { updatePanelMeta } = useSlidePanel();
  const setMeta = useCallback(
    (meta: Partial<Pick<SlidePanelEntry, 'title' | 'subtitle' | 'tabTitle'>>) => {
      if (panelId) updatePanelMeta(panelId, meta);
    },
    [panelId, updatePanelMeta]
  );
  return { panelId, setMeta };
}
