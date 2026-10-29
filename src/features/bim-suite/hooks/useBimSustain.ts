import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BimSustainService } from '../services/BimSustainService';

const KEY = 'bim-6d';
const opts = { retry: false as const, staleTime: 30_000 };

export function useSustainIndex(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'index', projectId],
    queryFn: () => BimSustainService.index(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
/** Project factors plus the organization library. */
export function useFactors(projectId?: string, organizationId?: string | null) {
  return useQuery({
    queryKey: [KEY, 'factors', projectId, organizationId ?? null],
    queryFn: () => BimSustainService.factors(projectId!, organizationId),
    enabled: !!projectId,
    ...opts,
  });
}
export function useOrgFactors(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'org-factors', organizationId],
    queryFn: () => BimSustainService.orgFactors(organizationId!),
    enabled: enabled && !!organizationId,
    ...opts,
  });
}
export function useMaterialMaps(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'maps', projectId],
    queryFn: () => BimSustainService.maps(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useCarbonRows(projectId?: string, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'carbon', projectId],
    queryFn: () => BimSustainService.carbon(projectId!),
    enabled: enabled && !!projectId,
    ...opts,
  });
}
export function useMeters(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'meters', projectId],
    queryFn: () => BimSustainService.meters(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useTargets(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'targets', projectId],
    queryFn: () => BimSustainService.targets(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useAssessments(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'assessments', projectId],
    queryFn: () => BimSustainService.assessments(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useRefreshSustain() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [KEY] });
    // Floor area is shared with the site panel
    void queryClient.invalidateQueries({ queryKey: ['bim-site'] });
  };
}
