// features/bim/lib/dataQuality.ts
// Chấm điểm chất lượng dữ liệu mô hình từ chỉ số lưu sẵn (bim_models.chat_luong)

import type { BimDataQualityStats, BimModel } from '@/features/bim-suite/types/bim.types';

export interface DataQualityScore {
  /** % cấu kiện có khối lượng khai báo (Qto chuẩn hoặc Pset) */
  khaiBao: number;
  /** % cấu kiện chỉ có khối lượng ước tính từ hình học */
  uocTinh: number;
  vatLieu: number;
  tang: number;
  proxy: number;
  /** Điểm tổng 0–100 */
  diem: number;
  muc: 'tot' | 'kha' | 'yeu';
  goiY: string[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * Điểm = 50% khối lượng khai báo + 30% vật liệu + 10% tầng + 10% không dùng IfcBuildingElementProxy.
 * Trọng số ưu tiên đúng thứ ảnh hưởng tới bóc tách khối lượng / chi phí.
 */
export const scoreDataQuality = (q: BimDataQualityStats | null | undefined): DataQualityScore | null => {
  if (!q || !q.so_cau_kien) return null;
  const n = q.so_cau_kien;
  const khaiBao = pct(q.co_qto + q.co_pset, n);
  const vatLieu = pct(q.co_vat_lieu, n);
  const tang = pct(q.co_tang, n);
  const proxy = pct(q.proxy, n);
  const diem = Math.round(khaiBao * 0.5 + vatLieu * 0.3 + tang * 0.1 + (100 - proxy) * 0.1);
  const goiY: string[] = [];
  if (khaiBao < 60) goiY.push('Xuất lại IFC có bật “Export base quantities” (hoặc bộ thuộc tính Revit “Dimensions”)');
  if (vatLieu < 80) goiY.push('Gán vật liệu (có mác bê tông/thép) cho cấu kiện');
  if (tang < 95) goiY.push('Gán cấu kiện vào tầng (IfcBuildingStorey)');
  if (proxy > 5) goiY.push('Phân loại lại các IfcBuildingElementProxy về đúng lớp IFC');
  return {
    khaiBao,
    uocTinh: pct(q.uoc_tinh, n),
    vatLieu,
    tang,
    proxy,
    diem,
    muc: diem >= 80 ? 'tot' : diem >= 55 ? 'kha' : 'yeu',
    goiY,
  };
};

export interface DataQualityGroup {
  key: string;
  models: { model: BimModel; score: DataQualityScore }[];
  soCauKien: number;
  diem: number;
}

/** Gom theo người/đơn vị nộp (uploaded_by) và bộ môn, điểm nhóm có trọng số theo số cấu kiện */
export const groupDataQuality = (models: BimModel[], by: 'nguoi_nop' | 'bo_mon'): DataQualityGroup[] => {
  const map = new Map<string, DataQualityGroup>();
  for (const model of models) {
    const score = scoreDataQuality(model.chat_luong);
    if (!score) continue;
    const key = (by === 'nguoi_nop' ? model.uploaded_by : model.discipline) || 'Không rõ';
    const g = map.get(key) || { key, models: [], soCauKien: 0, diem: 0 };
    g.models.push({ model, score });
    g.soCauKien += model.chat_luong!.so_cau_kien;
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.diem = Math.round(
      g.models.reduce((s, m) => s + m.score.diem * m.model.chat_luong!.so_cau_kien, 0) / Math.max(g.soCauKien, 1),
    );
    g.models.sort((a, b) => a.score.diem - b.score.diem);
  }
  return [...map.values()].sort((a, b) => a.diem - b.diem);
};
