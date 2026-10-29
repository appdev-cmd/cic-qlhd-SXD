import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { BimFieldService } from '../services/BimFieldService';

export const useBimWeeklyReports = (projectId: string) =>
  useQuery({
    queryKey: ['bim-weekly-reports', projectId],
    queryFn: () => BimFieldService.reports(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

export const useBimUsage = (projectId: string, days = 30) =>
  useQuery({
    queryKey: ['bim-usage', projectId, days],
    queryFn: () => BimFieldService.usage(projectId, days),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

/**
 * Counts viewer tool use: each [tool, value] signal is tracked when its value becomes truthy or changes, at most once
 * per tool every two minutes. Never blocks or reports errors to the viewer.
 */
export function useBimUsageTracking(projectId: string, signals: [string, unknown][]) {
  const last = useRef(new Map<string, { value: unknown; at: number }>());
  useEffect(() => {
    for (const [tool, value] of signals) {
      const key = `${projectId}:${tool}`;
      const previous = last.current.get(key);
      if (!value || previous?.value === value || (previous && Date.now() - previous.at < 120_000)) continue;
      last.current.set(key, { value, at: Date.now() });
      BimFieldService.track(projectId, tool).catch(() => undefined);
    }
  }, [projectId, signals]);
}
