import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/bim-suite/adapters/context';
import { BimLodService } from '../services/BimLodService';
import type { VerificationRow } from '../lib/lod500';

const KEY = 'bim-lod';

export function useLodResults(projectId: string) {
  const { supabaseUser } = useAuth();
  return useQuery({
    queryKey: [KEY, 'latest', supabaseUser?.id, projectId],
    queryFn: () => BimLodService.latest(projectId),
    enabled: !!supabaseUser,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLodActions() {
  const queryClient = useQueryClient();
  const opts = { onSuccess: () => void queryClient.invalidateQueries({ queryKey: [KEY] }) };
  return {
    evaluate: useMutation({ mutationFn: (modelId: string) => BimLodService.evaluate(modelId), ...opts }),
    importRows: useMutation({
      mutationFn: (a: { modelId: string; rows: VerificationRow[] }) =>
        BimLodService.importVerification(a.modelId, a.rows),
      ...opts,
    }),
  };
}
