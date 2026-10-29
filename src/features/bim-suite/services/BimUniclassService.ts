// Mã Uniclass 2015 của các mô hình, đếm ở máy chủ từ IfcClassificationReference (RPC bim_uniclass_tong_hop).
import { legacyDb } from '../lib/bimDb';

export interface UniclassCode {
  /** Bảng Uniclass viết thường: pr, ss, ef, … */
  bang: string;
  ma: string;
  ten: string | null;
  so_luong: number;
}

export const BimUniclassService = {
  async summary(modelIds: string[]): Promise<UniclassCode[]> {
    if (!modelIds.length) return [];
    const { data, error } = await legacyDb.rpc('bim_uniclass_tong_hop', { p_model_ids: modelIds });
    if (error) throw new Error(`Lỗi đọc mã Uniclass: ${error.message}`);
    return (data ?? []) as UniclassCode[];
  },
};
