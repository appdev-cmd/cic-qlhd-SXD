// Truy vấn hình học & cấu trúc mô hình: hộp bao từng cấu kiện, tầng, lưới tam giác, trạng thái hiện
import { useRef } from 'react';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { isItemShown } from '../lib/marqueeGeometry';
import { toVec3, unwrap } from '../lib/viewerConstants';
import type { ViewerContext } from './context';
import type { ViewerCore } from './useViewerCore';
import type { BimStoreyGroup } from './types';

/** Biểu thức khớp đúng tên danh mục / lớp IFC (không phân biệt hoa thường) */
export const categoryPatterns = (categoryNames: string[]) => categoryNames.map((c) => new RegExp(`^${c}$`, 'i'));

/** Cấu kiện có hình học thuộc các danh mục khớp mẫu (bỏ IFCPROJECT, IFCPERSONANDORGANIZATION...) */
export const categoryItemIds = async (
  m: FRAGS.FragmentsModel,
  patterns: RegExp[],
  withGeometry?: Set<number>,
  excluded?: Set<number>,
) => {
  const geometryIds = withGeometry ?? new Set(await m.getItemsIdsWithGeometry());
  const items = await m.getItemsOfCategories(patterns);
  return (Object.values(items).flat() as number[]).filter(
    (x) => typeof x === 'number' && geometryIds.has(x) && !excluded?.has(x),
  );
};

export function useGeometryQueries(ctx: ViewerContext, core: ViewerCore) {
  const { boxesCacheRef, iotFloorRef, visibilityRef, colorHiddenRef, loadedRef } = ctx;
  const { getModel } = core;

  /** Khung bao riêng của từng cấu kiện (toạ độ thế giới, đã cộng độ dịch mô hình ghép) */
  const collectBoxes = async (modelId: string, ids?: number[]) => {
    if (!ids && boxesCacheRef.current.has(modelId)) {
      return boxesCacheRef.current.get(modelId)!;
    }
    const m = getModel(modelId);
    if (!m) return [];
    const withGeometry = new Set<number>(
      (await m.getItemsIdsWithGeometry()).filter(
        (express_id) =>
          !visibilityRef.current.get(modelId)?.contextOnly?.has(express_id) &&
          !visibilityRef.current.get(modelId)?.annotationHidden?.has(express_id),
      ),
    );
    const target = (ids && ids.length ? ids : [...withGeometry]).filter((id) => withGeometry.has(id));
    if (target.length === 0) return [];
    const out: { id: number; min: [number, number, number]; max: [number, number, number] }[] = [];
    // Đọc theo lô để không giữ quá nhiều Box3 cùng lúc trên mô hình lớn
    const CHUNK = 5000;
    for (let i = 0; i < target.length; i += CHUNK) {
      const slice = target.slice(i, i + CHUNK);
      const boxes = await m.getBoxes(slice);
      if (!boxes || boxes.length !== slice.length) {
        // Thư viện bỏ qua một số cấu kiện → lùi về đọc từng cấu kiện cho lô này
        for (const id of slice) {
          const box = await m.getMergedBox([id]);
          if (box && !box.isEmpty()) out.push({ id, min: toVec3(box.min), max: toVec3(box.max) });
        }
        continue;
      }
      boxes.forEach((box, k) => {
        if (box && !box.isEmpty()) out.push({ id: slice[k], min: toVec3(box.min), max: toVec3(box.max) });
      });
    }
    // Cộng thêm độ dịch của mô hình ghép để so trong cùng hệ toạ độ thế giới
    const offset = m.object.position;
    if (offset.lengthSq() > 1e-9) {
      out.forEach((b) => {
        b.min = [b.min[0] + offset.x, b.min[1] + offset.y, b.min[2] + offset.z];
        b.max = [b.max[0] + offset.x, b.max[1] + offset.y, b.max[2] + offset.z];
      });
    }
    if (!ids) {
      boxesCacheRef.current.set(modelId, out);
    }
    return out;
  };

  /** Tầng của một mô hình (đệm theo vị trí ghép: dịch mô hình thì đọc lại cao độ) */
  const storeyCacheRef = useRef(new WeakMap<FRAGS.FragmentsModel, { key: string; value: Promise<BimStoreyGroup[]> }>());
  const storeysOf = (modelId: string, m: FRAGS.FragmentsModel): Promise<BimStoreyGroup[]> => {
    const key = `${modelId}:${m.object.position.toArray().join(',')}`;
    const hit = storeyCacheRef.current.get(m);
    if (hit && hit.key === key) return hit.value;
    const value = readStoreys(m, modelId).catch((err) => {
      storeyCacheRef.current.delete(m);
      throw err;
    });
    storeyCacheRef.current.set(m, { key, value });
    return value;
  };
  const readStoreys = async (m: FRAGS.FragmentsModel, modelId: string): Promise<BimStoreyGroup[]> => {
    const root = await m.getSpatialStructure();
    const storeys: { localId: number; ids: number[] }[] = [];
    const collect = (node: any, out: number[]) => {
      for (const child of node?.children || []) {
        if (typeof child.localId === 'number') out.push(child.localId);
        collect(child, out);
      }
    };
    // Cây không gian Fragments: nút nhóm {category, localId: null} → con là item {localId, category: null}
    const STOREY_CATEGORIES = new Set([
      'IFCBUILDINGSTOREY',
      'IFCFACILITYPART',
      'IFCBRIDGEPART',
      'IFCROADPART',
      'IFCRAILWAYPART',
    ]);
    const walk = (node: any) => {
      if (!node) return;
      const cat = String(node.category || '').toUpperCase();
      if (STOREY_CATEGORIES.has(cat)) {
        for (const item of node.children || []) {
          if (typeof item.localId !== 'number') continue;
          const ids: number[] = [];
          collect(item, ids);
          storeys.push({ localId: item.localId, ids });
        }
        return;
      }
      (node.children || []).forEach(walk);
    };
    walk(root);
    if (storeys.length === 0) return [];
    const data = await m.getItemsData(
      storeys.map((s) => s.localId),
      { attributesDefault: false, attributes: ['Name', 'Elevation'] },
    );
    const slabItems = await m.getItemsOfCategories([/^IFCSLAB$/]);
    const slabs = new Set(Object.values(slabItems).flat() as number[]);
    const coordinates = await m.getCoordinationMatrix();
    m.object.updateMatrixWorld(true);
    return storeys
      .map((s, i) => ({
        ...s,
        name: String(unwrap((data[i] as any)?.Name) ?? `Tầng #${s.localId}`),
        elevation: unwrap((data[i] as any)?.Elevation) == null ? null : Number(unwrap((data[i] as any)?.Elevation)),
      }))
      .sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))
      .map(({ localId, name, ids, elevation }) => ({
        localId,
        name,
        ids: ids.filter(
          (express_id) =>
            !visibilityRef.current.get(modelId)?.contextOnly?.has(express_id) &&
            !visibilityRef.current.get(modelId)?.annotationHidden?.has(express_id),
        ),
        floorIds: ids.filter((id) => slabs.has(id)),
        elevation:
          elevation !== null && Number.isFinite(elevation)
            ? new THREE.Vector3(0, elevation, 0).applyMatrix4(coordinates).applyMatrix4(m.object.matrixWorld).y
            : null,
      }))
      .filter((s) => s.ids.length);
  };

  /** Lưới tam giác (toạ độ thế giới, 9 số/tam giác) của từng cấu kiện, đọc theo lô từ worker */
  const readTriangles = async (modelId: string, ids: number[], isCancelled?: () => boolean) => {
    const out = new Map<number, Float32Array>();
    const m = getModel(modelId);
    if (!m || ids.length === 0) return out;
    m.object.updateMatrixWorld(true);
    const world = m.object.matrixWorld;
    const CHUNK = 40;
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (isCancelled?.()) break;
      const slice = ids.slice(i, i + CHUNK);
      let geoms: FRAGS.MeshData[][];
      try {
        geoms = await m.getItemsGeometry(slice);
      } catch {
        continue;
      }
      geoms.forEach((meshes, k) => {
        let count = 0;
        meshes.forEach((md) => (count += md.indices?.length ?? 0));
        const tris = new Float32Array(count * 3);
        let o = 0;
        for (const md of meshes) {
          const pos = md.positions;
          const idx = md.indices;
          if (!pos || !idx) continue;
          // Ma trận đi qua worker → là đối tượng thường, không còn phương thức của THREE.Matrix4
          const tf: any = md.transform;
          const local = new THREE.Matrix4().fromArray(
            Array.isArray(tf) ? tf : (tf?.elements ?? new THREE.Matrix4().elements),
          );
          const e = local.premultiply(world).elements;
          for (let t = 0; t < idx.length; t++) {
            const p = idx[t] * 3;
            const x = pos[p];
            const y = pos[p + 1];
            const z = pos[p + 2];
            tris[o++] = e[0] * x + e[4] * y + e[8] * z + e[12];
            tris[o++] = e[1] * x + e[5] * y + e[9] * z + e[13];
            tris[o++] = e[2] * x + e[6] * y + e[10] * z + e[14];
          }
        }
        out.set(slice[k], o === tris.length ? tris : tris.slice(0, o));
      });
    }
    return out;
  };

  /** Cấu kiện đang thật sự hiện (ẩn tay, lọc, cô lập, ẩn bởi 4D, cô lập tầng IoT) */
  const itemShown = (modelId: string, id: number) => {
    const floor = iotFloorRef.current;
    const floorIds = floor
      ? floor.get(modelId)?.model === getModel(modelId)
        ? floor.get(modelId)!.ids
        : new Set<number>()
      : null;
    return isItemShown(id, visibilityRef.current.get(modelId), colorHiddenRef.current.get(modelId), floorIds);
  };

  /** Cấu kiện có hình học theo danh mục / lớp IFC trên mọi mô hình đang mở (theo thứ tự nạp, kể cả mô hình không có) */
  const findCategoryItems = async (categoryNames: string[]) => {
    const patterns = categoryPatterns(categoryNames);
    const groups: { modelId: string; ids: number[] }[] = [];
    for (const [modelId, m] of loadedRef.current)
      groups.push({
        modelId,
        ids: await categoryItemIds(
          m,
          patterns,
          undefined,
          new Set([
            ...(visibilityRef.current.get(modelId)?.contextOnly ?? []),
            ...(visibilityRef.current.get(modelId)?.annotationHidden ?? []),
          ]),
        ),
      });
    return groups;
  };

  return { collectBoxes, storeysOf, readTriangles, itemShown, findCategoryItems };
}

export type GeometryQueries = ReturnType<typeof useGeometryQueries>;
