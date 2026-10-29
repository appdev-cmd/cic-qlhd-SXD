import type { FragmentsModel, SpatialTreeItem } from '@thatopen/fragments';
import { sensorFloor } from './iotSensorFloors';
import { unwrap } from './viewerConstants';

export interface IotFloorGeometry {
  model: FragmentsModel;
  ids: Set<number>;
  glassIds: number[];
}

// Cache immutable IFC membership, scoped to the loaded model instance (not a model ID).
const floorCache = new WeakMap<FragmentsModel, Promise<Map<string, IotFloorGeometry>>>();

async function readFloors(model: FragmentsModel): Promise<Map<string, IotFloorGeometry>> {
  const [root, geometry, glass] = await Promise.all([
    model.getSpatialStructure(),
    model.getItemsIdsWithGeometry(),
    model.getItemsOfCategories([/^IFCCURTAINWALL$/i, /^IFCWINDOW$/i]),
  ]);
  const geometryIds = new Set(geometry);
  const glassIds = new Set(Object.values(glass).flat());
  const storeys: SpatialTreeItem[] = [];
  const walk = (node: SpatialTreeItem) => {
    if (String(node.category).toUpperCase() === 'IFCBUILDINGSTOREY') {
      storeys.push(...(node.children ?? []).filter((item) => typeof item.localId === 'number'));
      return;
    }
    node.children?.forEach(walk);
  };
  walk(root);
  if (!storeys.length) return new Map();
  const attributes = await model.getItemsData(
    storeys.map((s) => s.localId!),
    {
      attributesDefault: false,
      attributes: ['Name'],
    },
  );
  const floors = new Map<string, IotFloorGeometry>();
  storeys.forEach((storey, index) => {
    const floor = sensorFloor({
      location: String(unwrap(attributes[index]?.Name) ?? ''),
      tower: '',
    });
    if (!floor) return;
    const entry = floors.get(floor.key) ?? { model, ids: new Set<number>(), glassIds: [] };
    const collect = (node: SpatialTreeItem) => {
      if (typeof node.localId === 'number' && geometryIds.has(node.localId)) entry.ids.add(node.localId);
      node.children?.forEach(collect);
    };
    collect(storey);
    entry.glassIds = [...entry.ids].filter((id) => glassIds.has(id));
    floors.set(floor.key, entry);
  });
  return floors;
}

export async function resolveIotFloor(model: FragmentsModel, key: string) {
  let pending = floorCache.get(model);
  if (!pending) {
    pending = readFloors(model);
    floorCache.set(model, pending);
    pending.catch(() => floorCache.delete(model));
  }
  return (await pending).get(key) ?? null;
}
