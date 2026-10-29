import { useEffect, useRef, useState } from 'react';
import { todayIso } from '../lib/utils';
import { appraisalService as api } from '../services/appraisalService';
import type { Dossier, Health } from '../types/appraisal';
import type { Project } from '../types/project';
import { useCaseProgress } from './useCaseProgress';

/**
 * Data layer of the BCNCKT appraisal workspace: loads the submission (by id or the latest one of a project),
 * polls progress while a job runs, and wraps every mutation with busy/error handling.
 * `onAnalysisCompleted` fires once when an analysis started (or observed running) in this session completes.
 */
export function useAppraisalCase({
  dossierId,
  project,
  onAnalysisCompleted,
}: {
  dossierId?: string;
  project?: Project;
  onAnalysisCompleted?: () => void;
}) {
  const [d, setD] = useState<Dossier | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [pollError, setPollError] = useState('');
  const pendingAnalysis = useRef<string | null>(null);
  const completed = useRef(onAnalysisCompleted);
  completed.current = onAnalysisCompleted;

  /** Runs a user action: toggles `busy`, clears and records the error message. */
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được thao tác.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setHealth(await api.health());
    if (d?.id) setD(await api.get(d.id));
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const h = await api.health();
        if (live) setHealth(h);
        const id =
          dossierId || (project ? (await api.list(0, { procedure: 'bcnckt', projectId: project.id }))[0]?.id : null);
        if (id) {
          const item = await api.get(id);
          if (live) setD(item);
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [dossierId, project?.id]);

  useEffect(() => {
    pendingAnalysis.current = null;
    setPollError('');
  }, [dossierId, project?.id]);

  useCaseProgress(
    d,
    (next) => setD((current) => (current?.id === next.id && current.revision <= next.revision ? next : current)),
    setPollError,
  );

  useEffect(() => {
    if (!d?.job || d.job.mode === 'ocr') return;
    if (d.job.status === 'running') {
      pendingAnalysis.current = d.job.id;
      return;
    }
    if (pendingAnalysis.current !== d.job.id) return;
    pendingAnalysis.current = null;
    if (d.job.status === 'completed') completed.current?.();
  }, [d?.job?.id, d?.job?.status]);

  /** Sends a revision-checked mutation and stores the returned submission. */
  const mutate = async (path: string, body: unknown, method = 'POST') => {
    if (!d) return;
    const next = await api.mutate(d.id, path, { revision: d.revision, ...(body as object) }, method);
    setD(next);
  };

  const startAnalysis = (mode: string, useModel: boolean) =>
    action(async () => {
      if (!d) return;
      setStarting(true);
      setPollError('');
      try {
        const next = await api.mutate(d.id, '/analysis', { revision: d.revision, mode, useModel });
        pendingAnalysis.current = next.job?.id || null;
        setD(next);
      } finally {
        setStarting(false);
      }
    });

  const cancelAnalysis = () => action(() => mutate('/cancel', {}));

  const createFromProject = (p: Project) =>
    action(async () =>
      setD(
        await api.create({
          name: p.name,
          province: p.location,
          projectId: p.id,
          legalDate: p.submissionDate || todayIso(),
        }),
      ),
    );

  return {
    d,
    setD,
    health,
    loading,
    busy,
    error,
    setError,
    starting,
    pollError,
    action,
    refresh,
    mutate,
    startAnalysis,
    cancelAnalysis,
    createFromProject,
  };
}

export type AppraisalCase = ReturnType<typeof useAppraisalCase>;
