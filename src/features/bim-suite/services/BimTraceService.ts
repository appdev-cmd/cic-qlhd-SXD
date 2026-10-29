// MEP network trace (migration 20261027140000): connections and systems extracted from IFC ports by the converter.
import { legacyDb } from '../lib/bimDb';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};

export interface TraceNode {
  guid: string;
  cap: number;
  ten: string | null;
  loai: string | null;
  tang: string | null;
}
export interface TraceResult {
  goc: string;
  thuong_nguon: TraceNode[];
  ha_nguon: TraceNode[];
  lien_ke: string[];
  he_thong: { guid: string; ten: string | null; loai_he: string | null; so_thanh_vien: number }[];
  /** tai_san is always [] until facility management (phase B7) */
  anh_huong: { tang: { tang: string | null; so_cau_kien: number }[]; tai_san: unknown[] };
  gioi_han: boolean;
  co_mang: boolean;
}
export interface NetworkInfo {
  ket_noi: number;
  he_thong: { guid: string; ten: string | null; so_thanh_vien: number }[];
}

export const BimTraceService = {
  async network(modelId: string): Promise<NetworkInfo> {
    const [k, s] = await Promise.all([
      legacyDb.from('bim_ket_noi').select('id', { count: 'exact', head: true }).eq('model_id', modelId),
      legacyDb.from('bim_he_thong').select('guid,ten,thanh_vien').eq('model_id', modelId).order('ten'),
    ]);
    const error = k.error ?? s.error;
    if (error) fail(error, 'Lỗi tải mạng kết nối');
    return {
      ket_noi: k.count ?? 0,
      he_thong: ((s.data ?? []) as { guid: string; ten: string | null; thanh_vien: string[] | null }[]).map((x) => ({
        guid: x.guid,
        ten: x.ten,
        so_thanh_vien: x.thanh_vien?.length ?? 0,
      })),
    };
  },
  async trace(modelId: string, guid: string): Promise<TraceResult> {
    const { data, error } = await legacyDb.rpc('bim_truy_vet', { p_model: modelId, p_guid: guid });
    if (error) fail(error, 'Không truy vết được');
    return data as TraceResult;
  },
  async systemMembers(modelId: string, systemGuid: string): Promise<string[]> {
    const { data, error } = await legacyDb
      .from('bim_he_thong')
      .select('thanh_vien')
      .eq('model_id', modelId)
      .eq('guid', systemGuid)
      .maybeSingle();
    if (error) fail(error, 'Lỗi tải hệ thống');
    return (data as { thanh_vien: string[] | null } | null)?.thanh_vien ?? [];
  },
};
