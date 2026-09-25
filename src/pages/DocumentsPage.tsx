import { FileText, CheckCircle2, Stamp, FilePlus2 } from 'lucide-react';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { PanelLoading } from '../components/entity/PanelState';
import {
  DOCUMENT_TEMPLATE_LABELS,
  ProjectDocumentPreview,
  type DocumentTemplate,
} from '../components/documents/ProjectDocumentPreview';
import { useProjectDetail, useProjects } from '../hooks/useData';
import { useFilterState } from '../hooks/useFilterState';
import { cn } from '../lib/utils';
import type { Project } from '../types/domain';

const TEMPLATE_ICONS: Record<DocumentTemplate, typeof FileText> = {
  mau_03: FileText,
  gpxd: CheckCircle2,
  yeu_cau_bo_sung: FilePlus2,
  mau_14: Stamp,
};

function PreviewForProject({ project, template }: { project: Project; template: DocumentTemplate }) {
  const { data, isLoading } = useProjectDetail(project);
  if (isLoading) return <PanelLoading label="Đang dựng văn bản..." />;
  return <ProjectDocumentPreview project={project} appraisal={data?.appraisal ?? null} template={template} />;
}

export function DocumentsPage() {
  const { filters, setFilter } = useFilterState('documents', { project: '', template: 'mau_03' });
  const { data } = useProjects({ sort: { key: 'code', direction: 'asc' }, pageSize: 500 });
  const projects = data?.rows ?? [];
  const project = projects.find((p) => p.id === filters.project) ?? projects[0];
  const template = (filters.template || 'mau_03') as DocumentTemplate;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-surface shadow-xs dark:bg-slate-900 dark:border-slate-800 print:hidden">
        <div className="w-96 max-w-full">
          <SearchableSelect
            value={project?.id}
            onChange={(v) => setFilter('project', v)}
            placeholder="Chọn hồ sơ để lập văn bản"
            options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}`, sublabel: p.investorName }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(DOCUMENT_TEMPLATE_LABELS) as DocumentTemplate[]).map((t) => {
            const Icon = TEMPLATE_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter('template', t)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                  template === t
                    ? 'bg-primary-500 text-white shadow-xs'
                    : 'bg-subtle text-ink-secondary hover:text-ink dark:bg-slate-800'
                )}
              >
                <Icon size={14} />
                {DOCUMENT_TEMPLATE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {project ? <PreviewForProject project={project} template={template} /> : <PanelLoading label="Đang tải danh sách hồ sơ..." />}
    </div>
  );
}
