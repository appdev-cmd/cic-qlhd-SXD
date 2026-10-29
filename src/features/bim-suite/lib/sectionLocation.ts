/** Resolve user-facing storeys/metres against the loaded, coordinated model geometry. */
export type SectionAxis = 'x' | 'y' | 'z';
export interface SectionLocationRequest {
  axis?: SectionAxis;
  elevation?: number;
  storey?: string;
  building?: string;
  offset?: number;
}
interface Model {
  id: string;
  file_name: string;
  discipline: string;
}
interface Storey {
  name: string;
  localId: number;
  ids: number[];
  floorIds?: number[];
  elevation?: number | null;
}
interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}
export interface SectionLocationReader {
  getSceneBox: () => Bounds | null;
  getStoreys: (modelId: string) => Promise<Storey[]>;
  getBoxOf: (modelId: string, ids: number[]) => Promise<Bounds | null>;
  getItemTriangles?: (modelId: string, ids: number[]) => Promise<Map<number, Float32Array>>;
}
export type SectionLocationResult =
  | {
      axis: SectionAxis;
      position: number;
      elevation: number;
      storeys?: string[];
      offset?: number;
      source: 'metres' | 'storey_metadata' | 'storey_geometry';
    }
  | { error: string; choices?: string[] };

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const floorKey = (value: string): string | null => {
  const text = normalize(value);
  const basement = text.match(/(?:^|\b)(?:ham\s*(?:b)?|b)\s*0*(\d+)\b/);
  if (basement) return `b${Number(basement[1])}`;
  const numbered = text.match(/(?:^|\b)(?:tang|t|level|floor|storey)\s*0*(\d+)\b/) || text.match(/^0*(\d+)$/);
  return numbered ? `t${Number(numbered[1])}` : null;
};
export const matchesStorey = (name: string, requested: string) => {
  const key = floorKey(requested);
  if (key) return floorKey(name) === key;
  return normalize(name) === normalize(requested);
};
const DISCIPLINE_RANK: Record<string, number> = { KET_CAU: 0, KIEN_TRUC: 1, TOAN_THE: 2 };
const rank = (discipline: string) => DISCIPLINE_RANK[discipline] ?? 3;

export async function getSectionContext(models: Model[], viewer: SectionLocationReader) {
  const scene = viewer.getSceneBox();
  const floors = await Promise.all(
    models.map(async (model) => ({
      model_id: model.id,
      mo_hinh: model.file_name,
      tang: (await viewer.getStoreys(model.id)).map((s) => s.name),
    })),
  );
  return {
    khung_bao_met: scene,
    truc_cao_do: 'y',
    moc_cao_do: 'Hệ tọa độ mô hình đang ghép; không mặc định là cao độ quốc gia',
    mo_hinh: floors,
  };
}

export async function resolveSectionLocation(
  request: SectionLocationRequest,
  models: Model[],
  viewer: SectionLocationReader,
): Promise<SectionLocationResult> {
  const scene = viewer.getSceneBox();
  if (!scene) return { error: 'Chưa có hình học mô hình để xác định vị trí cắt.' };
  const axis = request.storey ? 'y' : (request.axis ?? 'y');
  if (request.storey && request.axis && request.axis !== 'y')
    return { error: 'Cắt theo tầng phải dùng trục cao độ y.' };
  const index = { x: 0, y: 1, z: 2 }[axis];
  const [min, max] = [scene.min[index], scene.max[index]];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6)
    return { error: 'Khung bao mô hình không hợp lệ để cắt.' };
  const finish = (
    elevation: number,
    source: 'metres' | 'storey_metadata' | 'storey_geometry',
    storeys?: string[],
    offset?: number,
  ): SectionLocationResult => {
    if (!Number.isFinite(elevation)) return { error: 'Cao độ cắt phải là số mét hợp lệ.' };
    if (elevation < min || elevation > max)
      return { error: `Cao độ ${elevation} m nằm ngoài mô hình (${min.toFixed(2)}–${max.toFixed(2)} m).` };
    return { axis, position: (elevation - min) / (max - min), elevation, source, storeys, offset };
  };
  if (request.elevation !== undefined) {
    if (request.storey)
      return { error: 'Chọn cao độ tuyệt đối hoặc tầng kèm độ cao trên sàn, không truyền đồng thời cả hai.' };
    return finish(request.elevation, 'metres');
  }
  if (!request.storey?.trim()) return { error: 'Cần tên tầng hoặc cao độ cắt theo mét.' };
  const offset = request.offset ?? 1.5;
  const building = request.building || normalize(request.storey).match(/\bthap\s+[a-z0-9]+\b/)?.[0];
  if (!Number.isFinite(offset) || offset < 0) return { error: 'Độ cao cắt trên sàn phải là số mét không âm.' };
  const available: string[] = [];
  const candidates: { model: Model; storey: Storey; metadataReliable: boolean }[] = [];
  for (const model of [...models].sort((a, b) => rank(a.discipline) - rank(b.discipline))) {
    const storeys = await viewer.getStoreys(model.id);
    const elevations = new Set(
      storeys.map((s) => s.elevation).filter((e) => e !== null && e !== undefined && Number.isFinite(e)),
    );
    // Some converted files replace every storey elevation with zero. Do not trust that as floor data.
    const metadataReliable = storeys.length === 1 || elevations.size > 1;
    for (const storey of storeys) {
      available.push(storey.name);
      if (!matchesStorey(storey.name, request.storey)) continue;
      if (building && !normalize(`${storey.name} ${model.file_name}`).includes(normalize(building))) continue;
      candidates.push({ model, storey, metadataReliable });
    }
  }
  if (!candidates.length)
    return {
      error: `Không tìm thấy tầng “${request.storey}”${request.building ? ` của ${request.building}` : ''} trong mô hình đang nạp.`,
      choices: [...new Set(available)].slice(0, 80),
    };
  // Prefer structure/architecture as the floor datum; MEP geometry often starts at ceiling height.
  const bestRank = Math.min(...candidates.map((c) => rank(c.model.discipline)));
  const preferred = candidates.filter((c) => rank(c.model.discipline) === bestRank);
  const resolved: { name: string; elevation: number; source: 'storey_metadata' | 'storey_geometry' }[] = [];
  for (const { model, storey, metadataReliable } of preferred) {
    // Slab bounds give a better floor datum than beams/columns with rotated bounding boxes.
    const datumIds = storey.floorIds?.length ? storey.floorIds : storey.ids;
    const bounds = datumIds.length ? await viewer.getBoxOf(model.id, datumIds) : null;
    let floorDatum: number | undefined;
    if (storey.floorIds?.length && viewer.getItemTriangles && bestRank < 3) {
      // Fragment representation boxes can be padded. Use the actual slab vertices for a cut datum.
      const triangles = await viewer.getItemTriangles(model.id, storey.floorIds);
      let lowest = Infinity;
      for (const vertices of triangles.values()) {
        for (let i = 1; i < vertices.length; i += 3) {
          if (Number.isFinite(vertices[i])) lowest = Math.min(lowest, vertices[i]);
        }
      }
      if (Number.isFinite(lowest)) floorDatum = lowest;
    }
    const value = storey.elevation;
    if (
      metadataReliable &&
      value !== null &&
      value !== undefined &&
      Number.isFinite(value) &&
      value >= scene.min[1] &&
      value <= scene.max[1] &&
      (!bounds || (value >= bounds.min[1] - 6 && value <= bounds.max[1]))
    ) {
      resolved.push({ name: storey.name, elevation: value, source: 'storey_metadata' });
    } else if ((floorDatum !== undefined || bounds) && bestRank < 3) {
      resolved.push({ name: storey.name, elevation: floorDatum ?? bounds!.min[1], source: 'storey_geometry' });
    }
  }
  if (!resolved.length)
    return {
      error:
        'Chưa xác định được cao độ sàn của tầng này. Hãy nạp mô hình Kết cấu/Kiến trúc có phân tầng; không cần tự đổi sang tỷ lệ 0–1.',
    };
  const values = resolved.map((r) => r.elevation);
  if (Math.max(...values) - Math.min(...values) > 0.05)
    return {
      error: 'Tầng này nằm ở nhiều tháp hoặc mô hình có cao độ khác nhau. Cần chọn rõ tên tháp/mô hình trước khi cắt.',
      choices: resolved.map((r) => `${r.name}: ${r.elevation.toFixed(2)} m`),
    };
  return finish(resolved[0].elevation + offset, resolved[0].source, [...new Set(resolved.map((r) => r.name))], offset);
}
