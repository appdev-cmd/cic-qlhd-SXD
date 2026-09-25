import { useEffect } from 'react';
import { useProject } from '../../hooks/useData';
import { useCurrentPanel } from '../../hooks/useEntityPanel';
import { PanelError, PanelLoading } from '../../components/entity/PanelState';
import { ProjectDetailSlidePanel } from './ProjectDetailSlidePanel';

/** Nội dung panel hồ sơ dự án, tải theo mã (id hoặc mã hồ sơ DA-...). */
export function ProjectPanelById({ id }: { id: string }) {
  const { data: project, isLoading, error } = useProject(id);
  const { setMeta } = useCurrentPanel();

  useEffect(() => {
    if (project) {
      setMeta({
        title: project.name,
        subtitle: `Mã: ${project.code} • ${project.investorName}`,
        tabTitle: project.code,
      });
    }
  }, [project, setMeta]);

  if (isLoading) return <PanelLoading label="Đang tải hồ sơ..." />;
  if (error || !project) return <PanelError error={error as Error | null} notFoundLabel={`Không tìm thấy hồ sơ ${id}`} />;
  return <ProjectDetailSlidePanel project={project} />;
}
