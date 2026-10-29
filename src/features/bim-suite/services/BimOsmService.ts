// G10: building footprints around the project from OpenStreetMap (public Overpass API) and GeoJSON snapshots of them
// in project storage (bim-models/boi-canh/{project}/osm-<ts>.geojson), listed by bim_boi_canh.
// Only the project coordinates and radius are sent to Overpass; no user data.
import { supabase } from '@/features/bim-suite/adapters/supabase';
import { legacyDb } from '../lib/bimDb';
import {
  OVERPASS_URL,
  overpassQuery,
  parseOverpass,
  toGeoJson,
  type OsmBuilding,
  type OsmSnapshot,
} from '../lib/osmContext';

const BUCKET = 'bim-models';

export interface OsmSnapshotRef {
  id: string;
  project_id: string;
  ten: string;
  duong_dan: string;
  tam_vi_do: number | null;
  tam_kinh_do: number | null;
  ban_kinh_m: number | null;
  so_cong_trinh: number | null;
  nguon: string;
  created_by: string | null;
  created_at: string;
}

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export const BimOsmService = {
  async fetchBuildings(lat: number, lon: number, radius: number, signal?: AbortSignal): Promise<OsmBuilding[]> {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: overpassQuery(lat, lon, radius) }),
      signal,
    });
    if (res.status === 429 || res.status === 504) throw new Error('Máy chủ Overpass đang bận, thử lại sau ít phút.');
    if (!res.ok) throw new Error(`Không tải được dữ liệu OpenStreetMap (HTTP ${res.status}).`);
    return parseOverpass(await res.json());
  },

  /** Upload the snapshot to project storage and register it in bim_boi_canh. */
  async saveSnapshot(projectId: string, snapshot: OsmSnapshot): Promise<OsmSnapshotRef> {
    const path = `boi-canh/${projectId}/osm-${Date.now()}.geojson`;
    const body = new Blob([JSON.stringify(snapshot)], { type: 'application/geo+json' });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, { contentType: 'application/geo+json', upsert: false });
    if (upErr) throw new Error(`Không tải được bản chụp lên kho: ${upErr.message}`);
    const [lon, lat] = snapshot.center;
    const { data, error } = await legacyDb
      .from('bim_boi_canh')
      .insert({
        project_id: projectId,
        ten: `Bối cảnh OpenStreetMap ${snapshot.features.length} khối, bán kính ${snapshot.radius_m} m, tải ${dmy(snapshot.downloaded_at)}`,
        duong_dan: path,
        tam_vi_do: lat,
        tam_kinh_do: lon,
        ban_kinh_m: snapshot.radius_m,
        so_cong_trinh: snapshot.features.length,
        nguon: 'OpenStreetMap',
      })
      .select('*')
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(`Không lưu được bản chụp bối cảnh: ${error.message}`);
    }
    return data as OsmSnapshotRef;
  },

  /** Saved snapshots of the project, newest first. */
  async listSnapshots(projectId: string): Promise<OsmSnapshotRef[]> {
    const { data, error } = await legacyDb
      .from('bim_boi_canh')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`Lỗi tải danh sách bản chụp bối cảnh: ${error.message}`);
    return (data ?? []) as OsmSnapshotRef[];
  },

  /** Read a saved snapshot through a signed URL of the private bucket. */
  async openSnapshot(ref: Pick<OsmSnapshotRef, 'duong_dan'>): Promise<OsmSnapshot> {
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(ref.duong_dan, 300);
    if (error || !signed) throw new Error(`Không mở được bản chụp đã lưu${error ? `: ${error.message}` : '.'}`);
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`Không đọc được bản chụp đã lưu (HTTP ${res.status}).`);
    return (await res.json()) as OsmSnapshot;
  },

  async deleteSnapshot(ref: Pick<OsmSnapshotRef, 'id' | 'duong_dan'>): Promise<void> {
    const { error } = await legacyDb.from('bim_boi_canh').delete().eq('id', ref.id);
    if (error) throw new Error(`Không xóa được bản chụp: ${error.message}`);
    await supabase.storage.from(BUCKET).remove([ref.duong_dan]);
  },

  toSnapshot: (buildings: OsmBuilding[], lat: number, lon: number, radius: number) =>
    toGeoJson(buildings, { lat, lon, radius, downloadedAt: new Date().toISOString() }),
};
