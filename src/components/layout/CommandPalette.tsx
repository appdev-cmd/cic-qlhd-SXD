import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, FileText, FolderKanban, Loader2, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { SlaBadge } from '../appraisal/SlaBadge';
import { cn } from '../../lib/utils';
import { matchesSmartSearch } from '../../lib/smartSearch';
import { NAV_ITEMS } from '../../layouts/navigation';
import { appraisalService } from '../../services/appraisalService';
import { projectService } from '../../services/projectService';
import { useEntityPanel } from '../../hooks/useEntityPanel';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import type { DossierSummary } from '../../types/appraisal';
import type { Project } from '../../types/project';

type Result =
  | { kind: 'page'; id: string; label: string; hint: string; icon: React.ReactNode; run: () => void }
  | { kind: 'dossier'; id: string; label: string; hint: string; dossier: DossierSummary; run: () => void }
  | { kind: 'project'; id: string; label: string; hint: string; run: () => void };

const SECTION_LABELS = { page: 'Trang', dossier: 'Hồ sơ', project: 'Dự án' } as const;

/**
 * Tìm nhanh toàn hệ thống (Ctrl+K hoặc /): trang, hồ sơ (mã, tên), dự án.
 * Hỗ trợ gõ không dấu và viết tắt (sxd, gpxd, bcnckt…) qua lib/smartSearch.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [dossiers, setDossiers] = useState<DossierSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { open: openEntity } = useEntityPanel();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDossiers([]);
      setProjects([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setDossiers([]);
      setProjects([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      Promise.allSettled([
        appraisalService.page({ search: q, limit: 6, offset: 0 }),
        projectService.list({ search: q, limit: 5, offset: 0 }),
      ]).then(([d, p]) => {
        if (!alive) return;
        setDossiers(d.status === 'fulfilled' ? d.value.items : []);
        setProjects(p.status === 'fulfilled' ? p.value.items : []);
        setLoading(false);
      });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const done = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const pages: Result[] = NAV_ITEMS.filter(
      (item) => !q || matchesSmartSearch(item.label + ' ' + item.shortLabel + ' ' + (item.keywords || ''), q),
    )
      .slice(0, q ? 5 : 8)
      .map((item) => {
        const Icon = item.icon;
        return {
          kind: 'page',
          id: 'page-' + item.to,
          label: item.label,
          hint: 'Mở trang',
          icon: <Icon size={16} />,
          run: done(() => navigate(item.to)),
        };
      });
    const dossierResults: Result[] = dossiers.map((d) => ({
      kind: 'dossier',
      id: 'dossier-' + d.id,
      label: d.name,
      hint: [d.procedure ? PROJECT_PROCEDURES[d.procedure]?.label : '', d.projectName].filter(Boolean).join(' · '),
      dossier: d,
      run: done(() => openEntity('dossier', { id: d.id, name: d.name })),
    }));
    const projectResults: Result[] = projects.map((p) => ({
      kind: 'project',
      id: 'project-' + p.id,
      label: p.name,
      hint: [p.code, p.investorName].filter(Boolean).join(' · '),
      run: done(() => openEntity('project', { id: p.id, name: p.name })),
    }));
    return [...dossierResults, ...projectResults, ...pages];
  }, [query, dossiers, projects, navigate, openEntity, onClose]);

  useEffect(() => setActive(0), [results.length, query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let lastKind: Result['kind'] | null = null;
  return (
    <Modal heading="Tìm nhanh" onClose={onClose} size="lg" className="max-h-[70vh]">
      <div className="-mx-6 -mt-5">
        <div className="flex items-center gap-3 border-b border-border dark:border-slate-700 px-6 py-3">
          <Search size={18} className="shrink-0 text-ink-muted dark:text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                results[active]?.run();
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            aria-activedescendant={results[active] ? 'cmd-' + results[active].id : undefined}
            aria-label="Tìm hồ sơ, dự án hoặc trang"
            placeholder="Mã hồ sơ, tên dự án, chủ đầu tư… (gõ không dấu, viết tắt: gpxd, bcnckt)"
            className="min-w-0 flex-1 bg-transparent text-base text-ink dark:text-slate-100 placeholder:text-ink-muted dark:placeholder:text-slate-500 focus:outline-none"
          />
          {loading && <Loader2 size={16} className="animate-spin text-ink-muted dark:text-slate-400" />}
        </div>
        <ul id="command-results" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink-muted dark:text-slate-400">
              {query.trim().length < 2
                ? 'Gõ ít nhất 2 ký tự để tìm hồ sơ và dự án.'
                : 'Không tìm thấy kết quả phù hợp.'}
            </li>
          )}
          {results.map((r, index) => {
            const header = r.kind !== lastKind;
            lastKind = r.kind;
            return (
              <React.Fragment key={r.id}>
                {header && (
                  <li
                    role="presentation"
                    className="px-3 pb-1 pt-3 text-2xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400"
                  >
                    {SECTION_LABELS[r.kind]}
                  </li>
                )}
                <li
                  id={'cmd-' + r.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={r.run}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2',
                    index === active
                      ? 'bg-primary-50 dark:bg-slate-700 text-ink dark:text-slate-100'
                      : 'text-ink-secondary dark:text-slate-300',
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-subtle dark:bg-slate-900 text-primary-700 dark:text-primary-300">
                    {r.kind === 'page' ? (
                      r.icon
                    ) : r.kind === 'dossier' ? (
                      <FileText size={16} />
                    ) : (
                      <FolderKanban size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.label}</span>
                    {r.hint && (
                      <span className="block truncate text-xs text-ink-muted dark:text-slate-400">{r.hint}</span>
                    )}
                  </span>
                  {r.kind === 'dossier' && r.dossier.slaState && (
                    <SlaBadge sla={r.dossier.slaState} dueDate={r.dossier.slaDueDate} />
                  )}
                  {index === active && (
                    <CornerDownLeft size={14} className="shrink-0 text-ink-muted dark:text-slate-400" />
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-4 border-t border-border dark:border-slate-700 bg-subtle dark:bg-slate-900 px-6 py-2 text-2xs text-ink-muted dark:text-slate-400">
          <span>
            <kbd className="font-mono">↑↓</kbd> chọn
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> mở
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> đóng
          </span>
          <span className="ml-auto">
            <kbd className="font-mono">Ctrl K</kbd> hoặc <kbd className="font-mono">/</kbd> để mở từ mọi trang
          </span>
        </div>
      </div>
    </Modal>
  );
}
