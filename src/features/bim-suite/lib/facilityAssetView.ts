// 3D state of the operations view: highlight assets (red, isolated or with ghosted context) and a single owner that
// releases exactly what the view applied (coloring, isolation) when the panel unmounts or switches mode.
import type { BimViewerRef } from '../viewer/types';
import type { FacilityAssetLabel } from '../viewer/facilityAssetLayer';
import type { FacilityAsset } from '../services/facilityAssetService';
import { MAINT_STATES, maintState } from './maintenance';

/** Asset → label of the viewer facility layer (assets bound to a model element only). */
export function facilityAssetLabels(
  assets: FacilityAsset[],
  modelIds: string[],
  floorName?: (key: string) => string | undefined,
): FacilityAssetLabel[] {
  const loaded = new Set(modelIds);
  return assets
    .filter((a) => a.bim_element_id && a.model_id && loaded.has(a.model_id))
    .map((a) => ({
      assetId: a.asset_id,
      modelId: a.model_id!,
      guid: a.bim_element_id!,
      name: a.asset_name,
      code: a.asset_code || '',
      location:
        (a.floor_key ? floorName?.(a.floor_key) : undefined) ||
        [a.location_floor, a.location_room].filter(Boolean).join(' · ') ||
        a.location ||
        '',
      color: MAINT_STATES[maintState(a)].color,
    }));
}

export async function applyFacilityAssetView(
  viewer: BimViewerRef,
  assets: FacilityAssetLabel[],
  context: boolean,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const groups = await Promise.all(
    [...new Set(assets.map((asset) => asset.modelId))].map(async (modelId) => {
      const guids = [...new Set(assets.filter((asset) => asset.modelId === modelId).map((asset) => asset.guid))];
      const ids = await viewer.mapGuidsToIds(modelId, guids);
      if (ids.length !== guids.length || ids.some((id) => id === null))
        throw new Error('Chưa khớp đủ GUID thiết bị với mô hình. Hãy tải lại BIM.');
      return { modelId, ids: ids.filter((id): id is number => id !== null), guids };
    }),
  );
  if (!groups.length) return { found: 0 };
  signal?.throwIfAborted();
  await viewer.resetIotFloorView();
  signal?.throwIfAborted();
  viewer.setSelection(null, null);
  await viewer.showAll();
  signal?.throwIfAborted();
  await viewer.colorize(null);
  signal?.throwIfAborted();
  await viewer.setGhostMode(context, 0.08);
  signal?.throwIfAborted();
  if (!context) await viewer.isolateMany(groups);
  await viewer.colorize(
    groups.map((group) => ({ ...group, color: '#dc2626', opacity: 1 })),
    { accumulate: false },
  );
  signal?.throwIfAborted();
  await viewer.focusIotSensors(groups.map(({ modelId, guids }) => ({ modelId, guids })));
  return { found: groups.reduce((sum, group) => sum + group.ids.length, 0) };
}

/** Removes every 3D state the operations view may have applied (ghost, color, isolation, IoT floor). */
export async function clearFacilityAssetView(viewer: BimViewerRef | null | undefined) {
  if (!viewer) return;
  await viewer.setGhostMode?.(false);
  await viewer.colorize?.(null);
  await viewer.showAll?.();
  await viewer.resetIotFloorView?.();
}

export interface OperationsViewState {
  colored: boolean;
  isolated: boolean;
}
type OwnerViewer = Pick<BimViewerRef, 'setGhostMode' | 'isolateMany' | 'focusIotSensors' | 'showAll'>;
export function createOperationsViewOwner(getViewer: () => OwnerViewer | null | undefined, clearColoring: () => void) {
  const state: OperationsViewState = { colored: false, isolated: false };
  return {
    state,
    markColored(value: boolean) {
      state.colored = value;
    },
    async isolate(groups: { modelId: string; ids: number[] }[], focus?: { modelId: string; guids: string[] }[]) {
      const viewer = getViewer();
      if (!viewer) return;
      // A ghost mode set elsewhere (e.g. the AI panel) would hide the isolation result: clear it first.
      await viewer.setGhostMode?.(false);
      await viewer.isolateMany(groups);
      if (focus) await viewer.focusIotSensors?.(focus);
      state.isolated = true;
    },
    async showAll() {
      await getViewer()?.showAll();
      state.isolated = false;
    },
    /** Releases everything the operations view applied; call on unmount / tab change. */
    async release() {
      if (state.colored) {
        clearColoring();
        state.colored = false;
      }
      if (state.isolated) {
        state.isolated = false;
        await getViewer()?.showAll();
      }
    },
  };
}
