import type { BimCostUnit } from '@/features/bim-suite/types/bim.types';
import { convertUnit } from './estimateImport';

export interface BoqItem {
  ma_boq: string;
  ma_hop_dong: string;
  ten_cong_viec: string;
  ma_hieu_cong_viec: string | null;
  don_vi_tinh: string;
  khoi_luong: number | null;
  don_gia: number | null;
  khoi_luong_nghiem_thu: number | null;
}
export interface BoqMapping {
  id?: string;
  project_id: string;
  boq_id: string;
  model_id: string;
  global_ids: string[];
  unit: BimCostUnit;
  coefficient: number;
  task_id: string | null;
}
export interface Measurement {
  global_id: string;
  express_id: number;
  the_tich_be_tong: number | null;
  dien_tich: number | null;
  chieu_dai: number | null;
  trong_luong: number | null;
  nguon_khoi_luong?: string | null;
}
/** Đo bóc một ánh xạ đã gộp: máy chủ trả (bim_boq_measure) hoặc tính từ danh sách cấu kiện (measureMapping). */
export interface BoqMeasure {
  /** Số GUID khác nhau trong ánh xạ */
  selected: number;
  /** Số GUID còn tìm thấy trong mô hình */
  found?: number;
  /** Tổng đại lượng của các GUID có giá trị hợp lệ (đơn vị của ánh xạ) */
  total: number;
  /** GUID mất liên kết hoặc thiếu/không hợp lệ đại lượng */
  missing: number;
  /** GUID có khối lượng không phải QTO (ước tính hình học) */
  estimated: number;
}
/** Ánh xạ tóm tắt (không kèm danh sách GUID) như bim_boq_overview trả về. */
export type BoqMappingSummary = Omit<BoqMapping, 'global_ids' | 'project_id' | 'boq_id'> & {
  in_scope?: boolean;
  /** Số GUID đã gắn (kể cả khi chưa đo bóc vì ngoài phạm vi mô hình) */
  so_guid?: number;
  measure?: BoqMeasure | null;
};

const finite = (value: unknown): number | null =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : null;

const FIELD = {
  m3: 'the_tich_be_tong',
  m2: 'dien_tich',
  m: 'chieu_dai',
  kg: 'trong_luong',
  cai: null,
} as const;

/** Cùng quy tắc với bim_boq_measure ở máy chủ: mỗi GUID tính một lần, phần tử cuối cùng thắng. */
export function measureMapping(mapping: Pick<BoqMapping, 'global_ids' | 'unit'>, elements: Measurement[]): BoqMeasure {
  const guids = new Set(mapping.global_ids || []);
  const unique = new Map(elements.map((e) => [e.global_id, e]));
  let total = 0,
    missing = 0,
    estimated = 0,
    found = 0;
  for (const guid of guids) {
    const element = unique.get(guid);
    if (element) found++;
    const field = FIELD[mapping.unit];
    const value = element ? (mapping.unit === 'cai' ? 1 : field ? finite(element[field]) : null) : null;
    if (value === null) missing++;
    else total += value;
    if (element?.nguon_khoi_luong && element.nguon_khoi_luong !== 'qto') estimated++;
  }
  return { selected: guids.size, found, total, missing, estimated };
}

export function reconcileBoq(
  item: BoqItem,
  mapping: (Pick<BoqMapping, 'unit' | 'coefficient'> & Partial<BoqMapping>) | undefined | null,
  source: Measurement[] | BoqMeasure | null | undefined,
) {
  const conversion = convertUnit(item.don_vi_tinh || '');
  const measure: BoqMeasure | null = !mapping
    ? null
    : Array.isArray(source)
      ? measureMapping({ global_ids: mapping.global_ids || [], unit: mapping.unit }, source)
      : source || null;
  const selected = measure?.selected ?? 0,
    missing = measure?.missing ?? 0,
    estimated = measure?.estimated ?? 0;
  const compatible =
    !!mapping &&
    !!conversion &&
    conversion.unit === mapping.unit &&
    Number.isFinite(Number(mapping.coefficient)) &&
    Number(mapping.coefficient) > 0;
  const modelQuantity =
    compatible && measure && selected > 0 && !missing
      ? (measure.total * Number(mapping!.coefficient)) / conversion!.factor
      : null;
  const contractQuantity = finite(item.khoi_luong),
    acceptedQuantity = finite(item.khoi_luong_nghiem_thu),
    price = finite(item.don_gia);
  return {
    modelQuantity,
    contractQuantity,
    acceptedQuantity,
    missing,
    estimated,
    selected,
    difference: modelQuantity !== null && contractQuantity !== null ? modelQuantity - contractQuantity : null,
    modelValue: modelQuantity !== null && price !== null ? modelQuantity * price : null,
    issue: !mapping
      ? 'Chưa ánh xạ'
      : !compatible
        ? 'Đơn vị / hệ số không phù hợp'
        : !measure
          ? 'Chưa đo bóc'
          : !selected
            ? 'Chưa chọn cấu kiện'
            : missing
              ? `${missing} cấu kiện thiếu đại lượng / mất liên kết`
              : null,
  };
}
