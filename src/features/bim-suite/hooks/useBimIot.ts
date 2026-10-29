// React Query hooks for the IoT operations views of one project, plus the live measurement stream.
// Shared alert/order state refetches after writes, on focus and whenever iot-ingest broadcasts a batch with alert
// changes on the private channel iot:<project>; a slow poll is the fallback when Realtime is down.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BimIotService } from '../services/BimIotService';
import type { IotCatalog, IotPoint } from '../lib/iotTypes';
import type { IotLiveState } from '../lib/iotLiveFrame';
import { iotGatewaySession, type GatewayTransport, type LiveSession } from '../lib/iotLiveSession';

export const IOT_KEY = 'bim-iot';
const POLL_MS = 60_000;

export function useBimIot(project: string) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: [IOT_KEY, 'state', project],
    queryFn: () => BimIotService.state(project),
    enabled: !!project,
    staleTime: 5000,
    refetchInterval: POLL_MS,
    retry: 1,
    refetchOnWindowFocus: 'always',
  });
  useEffect(() => {
    if (!project) return;
    return BimIotService.onBatch(project, (alerts) => {
      if (alerts > 0) void cache.invalidateQueries({ queryKey: [IOT_KEY, 'state', project] });
    });
  }, [cache, project]);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: [IOT_KEY, 'state', project] }),
      cache.invalidateQueries({ queryKey: [IOT_KEY, 'events', project] }),
      // Asset workspace caches (work orders, KPI) are refreshed by their own Realtime hook; touch the common keys.
      cache.invalidateQueries({ queryKey: ['bim-work-orders', project] }),
      cache.invalidateQueries({ queryKey: ['facility-kpi', project] }),
    ]);
  };
  return { ...query, refresh };
}

export function useIotCatalog(project: string, enabled = true) {
  return useQuery({
    queryKey: [IOT_KEY, 'catalog', project],
    queryFn: () => BimIotService.gatewayCatalog(project),
    enabled: enabled && !!project,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useIotAlertEvents(project: string, alert: string, enabled: boolean) {
  return useQuery({
    queryKey: [IOT_KEY, 'events', project, alert],
    queryFn: () => BimIotService.events(project, alert),
    enabled: enabled && !!project,
    staleTime: 5000,
  });
}

export function useIotActorNames(project: string, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: [IOT_KEY, 'actors', project, unique.join(',')],
    queryFn: () => BimIotService.actorNames(project, unique),
    enabled: !!project && unique.length > 0,
    staleTime: 300_000,
  });
}

export interface IotLiveStream extends IotLiveState {
  staleMsFor(point: Pick<IotPoint, 'point_id' | 'stale_after_seconds'>): number;
  sourceStaleMs: number;
}
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;

/**
 * Live readings of a project: iot_latest snapshot + Realtime iot:<project>. The returned object only changes when
 * the session state changes (new frame, connection, a point going stale), not on every render.
 */
export function useIotLiveStream(data: IotCatalog | undefined, transport?: GatewayTransport): IotLiveStream | null {
  const session = useMemo<LiveSession | null>(
    () => (data ? iotGatewaySession(data, transport ?? BimIotService.latestTransport(data.project_id)) : null),
    [data, transport],
  );
  const state = useSyncExternalStore(
    session?.subscribe ?? emptySubscribe,
    session?.getSnapshot ?? emptySnapshot,
    session?.getSnapshot ?? emptySnapshot,
  );
  return useMemo(
    () =>
      state && session ? { ...state, staleMsFor: session.staleMsFor, sourceStaleMs: session.sourceStaleMs } : null,
    [state, session],
  );
}
