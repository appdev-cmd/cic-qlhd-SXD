// React Query hooks of the asset operations module; work orders and the register stay in sync through
// useFacilityRealtime (one channel per project).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../adapters/context';
import { vnDate } from '../lib/workOrderFilters';
import { FacilityOpsService } from '../services/FacilityOpsService';
import { getProjectAssets } from '../services/facilityAssetService';
import { facilityPollInterval, useFacilityRealtime } from './useFacilityRealtime';

/** Today's date in Vietnam (yyyy-mm-dd), refreshed every minute; keeps render pure. */
export function useVnToday() {
  const [today, setToday] = useState(() => vnDate());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(vnDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

/** Asset register of the project (bim_assets). */
export function useFacilityAssets(projectId: string, enabled = true) {
  const live = useFacilityRealtime(projectId, enabled);
  return useQuery({
    queryKey: ['bim-facility-assets', projectId],
    queryFn: () => getProjectAssets(projectId),
    enabled: !!projectId && enabled,
    staleTime: 15000,
    refetchInterval: enabled ? facilityPollInterval(live) : false,
  });
}
export function useWorkOrders(projectId: string, assetId?: string, enabled = true) {
  const live = useFacilityRealtime(projectId, enabled);
  return useQuery({
    queryKey: ['bim-work-orders', projectId, assetId || 'all'],
    queryFn: () => FacilityOpsService.orders(projectId, assetId),
    enabled: !!projectId && enabled,
    staleTime: 15000,
    refetchInterval: enabled ? facilityPollInterval(live) : false,
  });
}
export function useMyWorkOrders(projectId: string) {
  const { supabaseUser } = useAuth();
  const live = useFacilityRealtime(projectId, !!supabaseUser);
  const query = useQuery({
    queryKey: ['bim-my-orders', projectId, supabaseUser?.id],
    queryFn: () => FacilityOpsService.myOrders(projectId, supabaseUser!.id),
    enabled: !!projectId && !!supabaseUser,
    staleTime: 5000,
    refetchInterval: facilityPollInterval(live),
  });
  return { ...query, userId: supabaseUser?.id ?? null, live };
}
/** Project owner and members (assignees). */
export const useFacilityPeople = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['bim-maintenance-assignees', projectId],
    queryFn: () => FacilityOpsService.people(projectId),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60000,
  });
export const useOrderParts = (orderId?: string | null) =>
  useQuery({
    queryKey: ['facility-order-parts', orderId],
    queryFn: () => FacilityOpsService.parts(orderId!),
    enabled: !!orderId,
    staleTime: 5000,
  });
export const usePmPlans = (projectId: string) =>
  useQuery({
    queryKey: ['facility-pm-plans', projectId],
    queryFn: () => FacilityOpsService.plans(projectId),
    enabled: !!projectId,
    staleTime: 15000,
  });
export const useFacilityFloors = (projectId: string) =>
  useQuery({
    queryKey: ['facility-floors', projectId],
    queryFn: () => FacilityOpsService.floors(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60000,
  });
export const useFacilitySpaces = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['facility-spaces', projectId],
    queryFn: () => FacilityOpsService.spaces(projectId),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60000,
  });
export function useFacilityKpis(projectId: string) {
  const live = useFacilityRealtime(projectId);
  return useQuery({
    queryKey: ['facility-kpi', projectId],
    queryFn: () => FacilityOpsService.kpis(projectId),
    enabled: !!projectId,
    staleTime: 15000,
    refetchInterval: live ? false : 60000,
  });
}
export const useHandoverItems = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['facility-handover', projectId],
    queryFn: () => FacilityOpsService.handoverItems(projectId),
    enabled: !!projectId && enabled,
    staleTime: 10000,
  });
export const useInspectionRoutes = (projectId: string) =>
  useQuery({
    queryKey: ['facility-routes', projectId],
    queryFn: () => FacilityOpsService.routes(projectId),
    enabled: !!projectId,
    staleTime: 15000,
  });
export const useRouteSteps = (routeId?: string | null) =>
  useQuery({
    queryKey: ['facility-route-steps', routeId],
    queryFn: () => FacilityOpsService.steps(routeId!),
    enabled: !!routeId,
    staleTime: 15000,
  });
export const useRoundScans = (roundId?: string | null) =>
  useQuery({
    queryKey: ['facility-round-scans', roundId],
    queryFn: () => FacilityOpsService.scans(roundId!),
    enabled: !!roundId,
    staleTime: 3000,
  });
export const useInspectionRounds = (projectId: string, routeId?: string | null) =>
  useQuery({
    queryKey: ['facility-rounds', projectId, routeId || 'all'],
    queryFn: () => FacilityOpsService.rounds(projectId, routeId || undefined),
    enabled: !!projectId,
    staleTime: 5000,
  });
export const useFaultDiagnoses = (projectId: string, assetId?: string) =>
  useQuery({
    queryKey: ['facility-fault-diagnoses', projectId, assetId || 'all'],
    queryFn: () => FacilityOpsService.faultDiagnoses(projectId, assetId ? [assetId] : undefined),
    enabled: !!projectId,
    staleTime: 60_000,
  });
export const useOpenIotAlerts = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['facility-open-alerts', projectId],
    queryFn: () => FacilityOpsService.openAlerts(projectId),
    enabled: !!projectId && enabled,
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });
/** Account names for history rows (instead of shortened UUIDs). */
export const useActorNames = (projectId: string, ids: (string | null | undefined)[]) => {
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  return useQuery({
    queryKey: ['facility-actor-names', projectId, key],
    queryFn: () => FacilityOpsService.actorNames(projectId, key ? key.split(',') : []),
    enabled: !!projectId && !!key,
    staleTime: 5 * 60000,
  });
};
