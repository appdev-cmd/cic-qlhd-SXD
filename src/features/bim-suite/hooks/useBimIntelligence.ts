// Analytics overview data of the models shown in the viewer: a bounded element read (with truncation flag), unit
// prices, server quantity summary and coverage, document / acceptance / schedule links, and a model / floor / Uniclass
// scope. Ported from cic-hud useBimIntelligence without IoT sources and the HUD data standard.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../adapters/context';
import type { BimIssue, BimModel } from '../types/bim.types';
import { BimService } from '../services/BimService';
import { BimFieldService } from '../services/BimFieldService';
import { useBimQuantitySummaryMany } from './useBim';
import {
  aggregateInsight,
  floorOptions,
  floorScopeLabel,
  inInsightLocation,
  initialInsightScope,
  matchesUniclass,
  uniclassOptions,
  type InsightScope,
} from '../lib/bimIntelligence';

const ACCEPTED = new Set(['dat', 'dat_co_dieu_kien']);

export function useBimIntelligence(projectId: string, displayModels: BimModel[], issues: BimIssue[], enabled: boolean) {
  const { supabaseUser } = useAuth();
  const userId = supabaseUser?.id;
  const [rawScope, setScope] = useState<InsightScope>(initialInsightScope);
  const models = useMemo(
    () => [
      ...new Map(
        displayModels.filter((m) => m.status === 'ready' && m.project_id === projectId).map((m) => [m.id, m]),
      ).values(),
    ],
    [displayModels, projectId],
  );
  const modelIds = useMemo(() => models.map((m) => m.id).sort(), [models]);
  // A model that left the viewer falls back to "all" without an effect.
  const scope = useMemo<InsightScope>(
    () =>
      rawScope.modelId !== 'all' && !modelIds.includes(rawScope.modelId) ? { ...rawScope, modelId: 'all' } : rawScope,
    [rawScope, modelIds],
  );
  const unfiltered = scope.floorKey === 'all' && scope.uniclassPr === 'all' && scope.uniclassSs === 'all';
  const versionKey = models
    .map((m) => `${m.id}:${m.updated_at}:${m.phien_ban ?? ''}`)
    .sort()
    .join('|');

  const elements = useQuery({
    queryKey: ['bim-insight-elements', userId, projectId, versionKey],
    queryFn: ({ signal }) => BimFieldService.insightElements(projectId, modelIds, signal),
    enabled: enabled && !!userId && modelIds.length > 0,
    staleTime: 60_000,
  });
  const prices = useQuery({
    queryKey: ['bim-unit-prices', projectId],
    queryFn: () => BimService.getUnitPrices(projectId),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
  });
  const links = useQuery({
    queryKey: ['bim-insight-links', userId, projectId],
    queryFn: async () => {
      const [documents, acceptances, tasks] = await Promise.all([
        BimService.getLinkedGuids(projectId),
        BimService.getAcceptanceStatusByGuid(projectId),
        BimService.getTaskLinks(projectId),
      ]);
      return { documents, acceptances, tasks };
    },
    // Only needed to count links inside a floor / Uniclass filter; the unfiltered scope uses bim_scope_coverage.
    enabled: enabled && !!userId && !unfiltered,
    staleTime: 30_000,
  });

  const selectedModels = useMemo(
    () => models.filter((m) => scope.modelId === 'all' || m.id === scope.modelId),
    [models, scope.modelId],
  );
  const selectedIds = useMemo(() => selectedModels.map((m) => m.id).sort(), [selectedModels]);
  // Exact quantities and coverage from the server when no floor / Uniclass filter applies.
  const serverQuantities = useBimQuantitySummaryMany(enabled && unfiltered ? selectedIds : []);
  const serverCoverage = useQuery({
    queryKey: ['bim-scope-coverage', projectId, selectedIds],
    queryFn: () => BimService.getScopeCoverage(projectId, selectedIds),
    enabled: enabled && unfiltered && selectedIds.length > 0,
    staleTime: 60_000,
  });

  const modelRows = useMemo(() => {
    const ids = new Set(selectedIds);
    return (elements.data?.rows ?? []).filter((row) => ids.has(row.model_id));
  }, [elements.data, selectedIds]);
  const floors = useMemo(() => floorOptions(modelRows), [modelRows]);
  const classificationRows = useMemo(
    () => modelRows.filter((row) => inInsightLocation(row, { modelId: scope.modelId, floorKey: scope.floorKey })),
    [modelRows, scope.modelId, scope.floorKey],
  );
  const prOptions = useMemo(() => uniclassOptions(classificationRows, 'pr'), [classificationRows]);
  const ssOptions = useMemo(() => uniclassOptions(classificationRows, 'ss'), [classificationRows]);
  const rows = useMemo(
    () =>
      classificationRows.filter(
        (row) => matchesUniclass(row, 'pr', scope.uniclassPr) && matchesUniclass(row, 'ss', scope.uniclassSs),
      ),
    [classificationRows, scope.uniclassPr, scope.uniclassSs],
  );
  const analysis = useMemo(
    () =>
      aggregateInsight(rows, selectedModels, prices.data ?? [], unfiltered ? (serverQuantities.data ?? null) : null),
    [rows, selectedModels, prices.data, unfiltered, serverQuantities.data],
  );

  const floorLabel = floorScopeLabel(scope.floorKey);
  const scopeLabel = `${scope.modelId === 'all' ? `${selectedModels.length} mô hình đang hiển thị` : (selectedModels[0]?.file_name ?? 'Chưa có mô hình')} · ${floorLabel}${scope.uniclassPr !== 'all' ? ` · Pr: ${scope.uniclassPr}` : ''}${scope.uniclassSs !== 'all' ? ` · Ss: ${scope.uniclassSs}` : ''}`;

  const relatedIssues = useMemo(() => {
    const ids = new Set(selectedIds);
    if (unfiltered) return issues.filter((i) => i.project_id === projectId && (!i.model_id || ids.has(i.model_id)));
    const keys = new Set(rows.map((r) => `${r.model_id}:${r.global_id}`));
    const guids = new Set(rows.map((r) => r.global_id));
    return issues.filter(
      (i) =>
        i.project_id === projectId &&
        !!i.target_element_guid &&
        (i.model_id ? keys.has(`${i.model_id}:${i.target_element_guid}`) : guids.has(i.target_element_guid)),
    );
  }, [issues, projectId, selectedIds, rows, unfiltered]);

  const coverage = useMemo(() => {
    if (unfiltered) {
      const c = serverCoverage.data;
      return c ? { scope: c.scopeGuids, documents: c.linked, accepted: c.accepted, tasks: c.taskLinked } : null;
    }
    if (!links.data) return null;
    const guids = new Set(rows.map((row) => row.global_id));
    return {
      scope: guids.size,
      documents: links.data.documents.filter((g) => guids.has(g)).length,
      accepted: Object.entries(links.data.acceptances).filter(([g, status]) => guids.has(g) && ACCEPTED.has(status))
        .length,
      tasks: Object.keys(links.data.tasks).filter((g) => guids.has(g)).length,
    };
  }, [unfiltered, serverCoverage.data, links.data, rows]);

  const quantitiesPending = unfiltered && selectedIds.length > 0 && serverQuantities.isPending;
  const error = elements.error ?? prices.error ?? (unfiltered ? serverQuantities.error : null);
  const bounded = elements.data;
  return {
    projectId,
    userId,
    scope,
    setScope,
    models,
    selectedModels,
    modelIds: selectedIds,
    floors,
    prOptions,
    ssOptions,
    classificationRows,
    rows,
    analysis,
    scopeLabel,
    floorLabel,
    /** Element read capped: counts cover `loaded` of `total` elements of the shown models. */
    truncated: bounded?.truncated ?? false,
    loaded: bounded?.loaded ?? 0,
    total: bounded?.total ?? 0,
    dataAt: elements.dataUpdatedAt,
    loading: elements.isPending || prices.isPending || quantitiesPending,
    error,
    ready: elements.isSuccess && prices.isSuccess && !quantitiesPending && !error,
    prices: prices.data ?? [],
    refresh: () =>
      Promise.all([
        elements.refetch(),
        prices.refetch(),
        ...(unfiltered
          ? selectedIds.length
            ? [serverQuantities.refetch(), serverCoverage.refetch()]
            : []
          : [links.refetch()]),
      ]),
    coverage,
    linksError: unfiltered ? serverCoverage.error : links.error,
    issues: relatedIssues,
  };
}
export type BimIntelligence = ReturnType<typeof useBimIntelligence>;
