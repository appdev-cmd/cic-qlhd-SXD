// G10: bối cảnh từ OpenStreetMap: khung nhà và chiều cao quanh vị trí dự án (Overpass API), đổi sang hệ trình xem, dựng khối đùn.
// Dữ liệu © những người đóng góp OpenStreetMap, giấy phép ODbL 1.0: phải ghi nguồn khi hiển thị và khi lưu bản chụp.
import * as THREE from 'three';

export const OSM_ATTRIBUTION =
  '© Những người đóng góp OpenStreetMap, dữ liệu theo giấy phép ODbL 1.0 (openstreetmap.org/copyright)';
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Chiều cao một tầng khi chỉ có số tầng, và chiều cao mặc định khi không có cả hai (ghi rõ trong kết quả). */
export const LEVEL_HEIGHT = 3.2;
export const DEFAULT_HEIGHT = 9;

export function overpassQuery(lat: number, lon: number, radius: number): string {
  const r = Math.round(Math.min(Math.max(radius, 50), 1000));
  return `[out:json][timeout:25];(way["building"](around:${r},${lat},${lon});relation["building"]["type"="multipolygon"](around:${r},${lat},${lon}););out body;>;out skel qt;`;
}

export type HeightSource = 'chieu_cao' | 'so_tang' | 'mac_dinh';
export interface OsmBuilding {
  id: string;
  name: string | null;
  /** Vòng ngoài [kinh độ, vĩ độ], không lặp điểm cuối */
  ring: [number, number][];
  height: number;
  minHeight: number;
  source: HeightSource;
  levels: number | null;
}

const num = (s: string | undefined) => {
  if (!s) return null;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(m|ft)?\s*$/i.exec(s);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return m[2]?.toLowerCase() === 'ft' ? v * 0.3048 : v;
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}

/** Đọc kết quả Overpass: mỗi way building (và vòng ngoài của relation multipolygon) thành một khối. */
export function parseOverpass(json: { elements?: OverpassElement[] }): OsmBuilding[] {
  const nodes = new Map<number, [number, number]>();
  const ways = new Map<number, OverpassElement>();
  for (const e of json.elements ?? []) {
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) nodes.set(e.id, [e.lon, e.lat]);
    if (e.type === 'way') ways.set(e.id, e);
  }
  const out: OsmBuilding[] = [];
  const make = (id: string, tags: Record<string, string>, wayIds: number[]) => {
    const ring: [number, number][] = [];
    for (const w of wayIds)
      for (const n of ways.get(w)?.nodes ?? []) {
        const p = nodes.get(n);
        if (p) ring.push(p);
      }
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
      ring.pop();
    if (ring.length < 3) return;
    const h = num(tags.height) ?? num(tags['building:height']);
    const lv = num(tags['building:levels']);
    const minH = num(tags.min_height) ?? (num(tags['building:min_level']) ?? 0) * LEVEL_HEIGHT;
    const [height, source]: [number, HeightSource] =
      h && h > 0 ? [h, 'chieu_cao'] : lv && lv > 0 ? [lv * LEVEL_HEIGHT, 'so_tang'] : [DEFAULT_HEIGHT, 'mac_dinh'];
    out.push({
      id,
      name: tags.name ?? null,
      ring,
      height,
      minHeight: Math.min(minH, height - 0.5),
      source,
      levels: lv,
    });
  };
  for (const e of json.elements ?? []) {
    if (e.type === 'way' && e.tags?.building) make(`way/${e.id}`, e.tags, [e.id]);
    if (e.type === 'relation' && e.tags?.building)
      make(
        `relation/${e.id}`,
        e.tags,
        (e.members ?? []).filter((m) => m.type === 'way' && m.role === 'outer').map((m) => m.ref),
      );
  }
  return out;
}

export interface GeoPlacement {
  /** Vĩ độ, kinh độ của điểm neo (vị trí dự án hoặc gốc toạ độ mô hình) */
  lat: number;
  lon: number;
  /** Điểm neo trong hệ trình xem (x, z) và cao độ mặt đất y */
  x: number;
  z: number;
  y: number;
  /** Góc Bắc thật so với −Z của trình xem, độ, chiều kim đồng hồ (như phân tích nắng) */
  north: number;
}

/** Kinh độ, vĩ độ → (x, z) trình xem: mặt phẳng tiếp tuyến tại điểm neo (sai số nhỏ trong bán kính vài km). */
export function toViewer(lon: number, lat: number, g: GeoPlacement): [number, number] {
  const east = (lon - g.lon) * Math.cos((g.lat * Math.PI) / 180) * 111_320;
  const north = (lat - g.lat) * 110_540;
  const n = (g.north * Math.PI) / 180;
  // Bắc thật trong trình xem = (sin n, −cos n); Đông thật = (cos n, sin n)
  return [g.x + east * Math.cos(n) + north * Math.sin(n), g.z + east * Math.sin(n) - north * Math.cos(n)];
}

/** Tam giác (9 số/tam giác) của một khối đùn: mặt đáy, mặt mái, các mặt bên. */
export function extrude(ringXZ: [number, number][], y0: number, y1: number): Float32Array {
  const pts = ringXZ.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const faces = THREE.ShapeUtils.triangulateShape(pts, []);
  const out: number[] = [];
  for (const [a, b, c] of faces) {
    out.push(pts[a].x, y1, pts[a].y, pts[c].x, y1, pts[c].y, pts[b].x, y1, pts[b].y); // mái
    out.push(pts[a].x, y0, pts[a].y, pts[b].x, y0, pts[b].y, pts[c].x, y0, pts[c].y); // đáy
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    out.push(p.x, y0, p.y, q.x, y0, q.y, q.x, y1, q.y, p.x, y0, p.y, q.x, y1, q.y, p.x, y1, p.y);
  }
  return Float32Array.from(out);
}

export interface ContextBuild {
  tris: Float32Array;
  used: number;
  /** Bỏ vì trùng khung công trình (chính công trình trên bản đồ) */
  skipped: number;
  bySource: Record<HeightSource, number>;
}

/** Dựng khối bối cảnh; bỏ nhà có tâm nằm trong khung công trình (mở rộng `margin` m) vì đó là chính công trình. */
export function buildContext(
  buildings: OsmBuilding[],
  g: GeoPlacement,
  own: { min: [number, number]; max: [number, number] } | null,
  margin = 5,
): ContextBuild {
  const parts: Float32Array[] = [];
  const bySource: Record<HeightSource, number> = { chieu_cao: 0, so_tang: 0, mac_dinh: 0 };
  let skipped = 0;
  for (const b of buildings) {
    const ring = b.ring.map(([lon, lat]) => toViewer(lon, lat, g));
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length,
      cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    if (
      own &&
      cx > own.min[0] - margin &&
      cx < own.max[0] + margin &&
      cz > own.min[1] - margin &&
      cz < own.max[1] + margin
    ) {
      skipped++;
      continue;
    }
    parts.push(extrude(ring, g.y + b.minHeight, g.y + b.height));
    bySource[b.source]++;
  }
  const tris = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    tris.set(p, o);
    o += p.length;
  }
  return { tris, used: parts.length, skipped, bySource };
}

/** Bản chụp GeoJSON để lưu trong dự án: ghi ngày tải, nguồn, bán kính, điểm neo, chiều cao dùng và nguồn chiều cao. */
export function toGeoJson(
  buildings: OsmBuilding[],
  meta: { lat: number; lon: number; radius: number; downloadedAt: string },
) {
  return {
    type: 'FeatureCollection' as const,
    attribution: OSM_ATTRIBUTION,
    license: 'ODbL-1.0',
    source: OVERPASS_URL,
    downloaded_at: meta.downloadedAt,
    center: [meta.lon, meta.lat],
    radius_m: meta.radius,
    level_height_m: LEVEL_HEIGHT,
    default_height_m: DEFAULT_HEIGHT,
    features: buildings.map((b) => ({
      type: 'Feature' as const,
      id: b.id,
      properties: {
        name: b.name,
        height: b.height,
        min_height: b.minHeight,
        height_source: b.source,
        levels: b.levels,
      },
      geometry: { type: 'Polygon' as const, coordinates: [[...b.ring, b.ring[0]]] },
    })),
  };
}
export type OsmSnapshot = ReturnType<typeof toGeoJson>;

/** Đọc lại bản chụp đã lưu. */
export function fromGeoJson(g: OsmSnapshot): OsmBuilding[] {
  return g.features.map((f) => {
    const ring = f.geometry.coordinates[0].slice(0, -1) as [number, number][];
    return {
      id: String(f.id),
      name: f.properties.name,
      ring,
      height: f.properties.height,
      minHeight: f.properties.min_height ?? 0,
      source: f.properties.height_source,
      levels: f.properties.levels,
    };
  });
}
