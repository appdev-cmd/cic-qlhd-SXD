import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BimPlanService } from '../services/BimPlanService';
import { BimScheduleService } from '../services/BimScheduleService';
import { BimCostService } from '../services/BimCostService';
import { BimBoqService } from '../services/BimBoqService';
import { Bim5dService } from '../services/Bim5dService';

const KEY = 'bim-plan';
const opts = { retry: false as const, staleTime: 30_000 };

export function useScheduleTasks(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'tasks', projectId],
    queryFn: () => BimScheduleService.tasks(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useScheduleLinks(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'links', projectId],
    queryFn: () => BimScheduleService.links(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useScheduleBaselines(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'baselines', projectId],
    queryFn: () => BimScheduleService.baselines(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useScheduleTemplates(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'templates', projectId],
    queryFn: () => BimScheduleService.templates(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useNorms(search: string, book?: string) {
  return useQuery({
    queryKey: [KEY, 'norms', search, book ?? ''],
    queryFn: () => BimPlanService.norms(search, book),
    ...opts,
  });
}
export function usePriceRows(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'prices', projectId],
    queryFn: () => BimPlanService.priceRows(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useBids(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'bids', projectId],
    queryFn: () => BimPlanService.bids(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useEstimates(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'estimates', projectId],
    queryFn: () => BimPlanService.estimates(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}
export function useCashFlow(estimateId?: string) {
  return useQuery({
    queryKey: [KEY, 'cashflow', estimateId],
    queryFn: () => BimPlanService.cashFlow(estimateId!),
    enabled: !!estimateId,
    ...opts,
  });
}
export function useEvmPeriods(projectId?: string) {
  return useQuery({
    queryKey: [KEY, 'periods', projectId],
    queryFn: () => BimPlanService.periods(projectId!),
    enabled: !!projectId,
    ...opts,
  });
}

/** Refreshes schedule, cost and element-link queries after a change. */
export function useRefreshPlan() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      KEY,
      'bim-5d-overview',
      'bim-boq',
      'bim-cost',
      'bim-linked-guids',
      'bim-links',
      'bim-unit-prices',
      'bim-field-actual',
    ])
      void queryClient.invalidateQueries({ queryKey: [key] });
  };
}
/** Full estimates (rows included) for the estimate versions panel. */
export function useBimEstimates(projectId: string) {
  return useQuery({
    queryKey: ['bim-cost', 'estimates', projectId],
    queryFn: () => BimCostService.estimates(projectId),
    enabled: !!projectId,
    ...opts,
  });
}

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();
export function useBimBoqContracts(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['bim-boq', 'contracts', projectId],
    queryFn: () => BimBoqService.contracts(projectId),
    enabled: enabled && !!projectId,
    ...opts,
  });
}
export function useBimBoqOverview(
  projectId: string,
  options: { modelIds?: string[] | null; contract?: string | null } = {},
  enabled = true,
) {
  const ids = options.modelIds ? sortedIds(options.modelIds) : null;
  return useQuery({
    queryKey: ['bim-boq', 'overview', projectId, ids, options.contract || null],
    queryFn: () => BimBoqService.overview(projectId, { modelIds: ids, contract: options.contract || null }),
    enabled: enabled && !!projectId,
    ...opts,
  });
}
export function useBimBoqFacets(modelId: string | undefined) {
  return useQuery({
    queryKey: ['bim-boq', 'facets', modelId],
    queryFn: () => BimBoqService.facets(modelId!),
    enabled: !!modelId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
export function useBim5dOverview(projectId: string, modelIds: string[], enabled = true) {
  const ids = sortedIds(modelIds);
  return useQuery({
    queryKey: ['bim-5d-overview', projectId, ids],
    queryFn: () => Bim5dService.overview(projectId, ids),
    enabled: enabled && !!projectId && ids.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
export function useBimFieldActual(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['bim-field-actual', projectId],
    queryFn: () => Bim5dService.fieldActual(projectId),
    enabled: enabled && !!projectId,
    ...opts,
  });
}
