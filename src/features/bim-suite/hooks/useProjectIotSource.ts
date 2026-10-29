// Registered gateways of a project and their combined status, shared by Operations, Analysis and the AI panel.
// Never falls back to sample data: no gateway means the IoT views show how to register one.
import { useQuery } from '@tanstack/react-query';
import { BimIotService } from '../services/BimIotService';
import { iotSourceStatus } from '../lib/iotSourceSelection';
import { IOT_KEY } from './useBimIot';

export function useProjectIotSource(projectId: string, enabled = true) {
  const query = useQuery({
    queryKey: [IOT_KEY, 'gateways', projectId],
    queryFn: () => BimIotService.gateways(projectId),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
  const gateways = query.data ?? [];
  // Reference time = when the list was fetched (no Date.now() during render).
  const status = iotSourceStatus(gateways, query.dataUpdatedAt);
  return { ...query, gateways, status };
}
