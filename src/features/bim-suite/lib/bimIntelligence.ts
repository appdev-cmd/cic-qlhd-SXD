// Shared analysis of the models in scope: quantity groups, 5D cost, information-quality findings, Uniclass and floor
// filters, plus the project schedule/cost figures (phase B5) shown on the analytics overview. Pure functions only (the
// tests import this file). Ported from cic-hud lib/bimIntelligence without the HUD data standard (hud_chuan) and IoT:
// "not applicable" elements are recognised by IFC class, floors are the IFC storey names, Uniclass codes come from
// IfcClassificationReference (thuoc_tinh.phan_loai, same source as BimUniclassPanel).
import type { BimElement, BimModel, BimQuantitySummaryRow, BimUnitPrice } from '../types/bim.types';
import type { ScheduleTask } from '../services/BimScheduleService';
import type { EvmPeriod } from '../services/BimPlanService';
import type { ContractVariations } from '../services/BimVariationService';
import type { CostSummary } from '../services/BimContractService';
import { buildCostRows } from './costing';

export type InsightElement = Pick<
  BimElement,
  | 'id'
  | 'project_id'
  | 'model_id'
  | 'express_id'
  | 'global_id'
  | 'ten_cau_kien'
  | 'loai_cau_kien'
  | 'phan_doan_tang'
  | 'vat_lieu'
  | 'nguon_khoi_luong'
  | 'the_tich_be_tong'
  | 'dien_tich'
  | 'chieu_dai'
  | 'trong_luong'
> & {
  /** "<code> - <name>" entries of IfcClassificationReference (thuoc_tinh.phan_loai). */
  phan_loai?: string[] | null;
};

export interface InsightScope {
  modelId: string;
  /** Storey name (phan_doan_tang), NO_FLOOR for elements without a storey, or 'all'. */
  floorKey: string;
  uniclassPr: string;
  uniclassSs: string;
}
export const initialInsightScope: InsightScope = {
  modelId: 'all',
  floorKey: 'all',
  uniclassPr: 'all',
  uniclassSs: 'all',
};
export const NO_FLOOR = '__khong_tang__';

export const elementKey = (row: Pick<InsightElement, 'model_id' | 'express_id'>) => `${row.model_id}:${row.express_id}`;
export const elementFloorKey = (row: Pick<InsightElement, 'phan_doan_tang'>) => row.phan_doan_tang?.trim() || NO_FLOOR;
export const floorScopeLabel = (key: string) =>
  key === 'all' ? 'Tất cả tầng' : key === NO_FLOOR ? 'Chưa gán tầng' : key;
export const inInsightLocation = (row: InsightElement, scope: Pick<InsightScope, 'modelId' | 'floorKey'>) =>
  (scope.modelId === 'all' || row.model_id === scope.modelId) &&
  (scope.floorKey === 'all' || elementFloorKey(row) === scope.floorKey);

/** Storeys present in the rows, natural sort, with the element count. */
export function floorOptions(rows: InsightElement[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(elementFloorKey(row), (counts.get(elementFloorKey(row)) ?? 0) + 1);
  return [...counts]
    .map(([key, count]) => ({ key, label: floorScopeLabel(key), count }))
    .sort((a, b) =>
      a.key === NO_FLOOR ? 1 : b.key === NO_FLOOR ? -1 : a.label.localeCompare(b.label, 'vi', { numeric: true }),
    );
}

// ── Uniclass 2015 (IfcClassificationReference) ─────────────────────────────────────────────────────────────────────
export type UniclassTable = 'pr' | 'ss';
const UNICLASS_CODE = /^([A-Za-z]{2}(?:_[0-9]{2}){1,4})/;

/** Uniclass codes of one table on an element ("Pr_20_85_16_15"), parsed like bim_uniclass_tong_hop. */
export function uniclassCodes(
  row: Pick<InsightElement, 'phan_loai'>,
  table: UniclassTable,
): { code: string; name: string | null }[] {
  const out: { code: string; name: string | null }[] = [];
  for (const entry of Array.isArray(row.phan_loai) ? row.phan_loai : []) {
    const text = String(entry ?? '');
    const code = UNICLASS_CODE.exec(text)?.[1];
    if (!code || code.slice(0, 2).toLowerCase() !== table) continue;
    const name = / - (.*)$/.exec(text)?.[1]?.trim() || null;
    out.push({ code: `${code.slice(0, 2)[0].toUpperCase()}${code[1].toLowerCase()}${code.slice(2)}`, name });
  }
  return out;
}
/** A parent code selects its children (Pr_20_85 → Pr_20_85_16_15). */
export function matchesUniclass(row: Pick<InsightElement, 'phan_loai'>, table: UniclassTable, code: string): boolean {
  if (!code || code === 'all') return true;
  const want = code.toLowerCase();
  return uniclassCodes(row, table).some((c) => {
    const have = c.code.toLowerCase();
    return have === want || have.startsWith(`${want}_`);
  });
}
/** Codes used in the rows with the element count, sorted by code. */
export function uniclassOptions(
  rows: InsightElement[],
  table: UniclassTable,
): { code: string; name: string | null; count: number }[] {
  const map = new Map<string, { code: string; name: string | null; count: number }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const c of uniclassCodes(row, table)) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      const cur = map.get(c.code) ?? { code: c.code, name: c.name, count: 0 };
      cur.count += 1;
      cur.name ??= c.name;
      map.set(c.code, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
/** Share of elements carrying a Pr / Ss code. */
export function uniclassSummary(rows: InsightElement[]) {
  const pr = rows.filter((r) => uniclassCodes(r, 'pr').length > 0).length;
  const ss = rows.filter((r) => uniclassCodes(r, 'ss').length > 0).length;
  return {
    tong: rows.length,
    co_pr: pr,
    co_ss: ss,
    chua_phan_loai: rows.filter((r) => !uniclassCodes(r, 'pr').length && !uniclassCodes(r, 'ss').length).length,
  };
}

// ── Information-quality findings ───────────────────────────────────────────────────────────────────────────────────
export const QUALITY_FINDINGS = {
  material: 'Thiếu vật liệu',
  floor: 'Thiếu thông tin tầng',
  quantity: 'Thiếu dữ liệu khối lượng áp dụng',
  estimated: 'Khối lượng ước tính hình học',
  proxy: 'Phân loại IFC Proxy',
} as const;
export type FindingKey = keyof typeof QUALITY_FINDINGS;

/** Spatial / reference objects that carry no measured quantity (rooms, openings, grids, annotations, zones). */
const NOT_MEASURED =
  /^IFC(SPACE|OPENINGELEMENT|GRID|ANNOTATION|SITE|BUILDING|BUILDINGSTOREY|ZONE|SPATIALZONE|VIRTUALELEMENT|EXTERNALSPATIALELEMENT)$/;
/** Equipment measured by count. */
const COUNTABLE =
  /^IFC(CHILLER|TANK|UNITARYEQUIPMENT|ELECTRICDISTRIBUTIONBOARD|AIRTERMINAL|FIRESUPPRESSIONTERMINAL|LIGHTFIXTURE|PUMP|FAN|VALVE|SENSOR|ACTUATOR|ELECTRICMOTOR|TRANSFORMER|SANITARYTERMINAL|OUTLET|SWITCHINGDEVICE|ALARM|BOILER|COIL)$/;

export const quantityApplies = (row: Pick<InsightElement, 'loai_cau_kien'>) =>
  !NOT_MEASURED.test((row.loai_cau_kien ?? '').toUpperCase());
const validQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function quantityStatus(
  row: InsightElement,
): 'not_applicable' | 'declared' | 'geometry' | 'count' | 'available' | 'missing' {
  if (!quantityApplies(row)) return 'not_applicable';
  if (COUNTABLE.test(row.loai_cau_kien.toUpperCase())) return 'count';
  if (![row.the_tich_be_tong, row.dien_tich, row.chieu_dai, row.trong_luong].some(validQuantity)) return 'missing';
  if (['qto', 'pset'].includes(row.nguon_khoi_luong ?? '')) return 'declared';
  return row.nguon_khoi_luong === 'hinh_hoc' ? 'geometry' : 'available';
}
export function hasFinding(row: InsightElement, key: FindingKey) {
  if (key === 'material') return quantityApplies(row) && !row.vat_lieu?.trim();
  if (key === 'floor') return !row.phan_doan_tang?.trim();
  if (key === 'quantity') return quantityStatus(row) === 'missing';
  if (key === 'estimated') return quantityApplies(row) && row.nguon_khoi_luong === 'hinh_hoc';
  return row.loai_cau_kien === 'IFCBUILDINGELEMENTPROXY';
}

// ── Quantities ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type QuantityGroupBy = 'loai_cau_kien' | 'vat_lieu' | 'phan_doan_tang' | 'model_id';
type QuantityMetric = 'tong_the_tich' | 'tong_dien_tich' | 'tong_chieu_dai' | 'tong_trong_luong';
const roundTo = (value: number | null, digits = 3) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * One quantity summary for the dashboard, the AI assistant and the exports. Input: groups per (model, class, material,
 * storey) from aggregateInsight or v_bim_khoi_luong_tong_hop. Null is not zero: groups without values are reported.
 */
export function summarizeQuantityRows(
  rows: BimQuantitySummaryRow[],
  groupBy: QuantityGroupBy = 'loai_cau_kien',
  limit = 60,
) {
  const groups = new Map<string, BimQuantitySummaryRow[]>();
  for (const row of rows) {
    const key = String(row[groupBy] || '(không xác định)');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const sum = (list: BimQuantitySummaryRow[], key: QuantityMetric) => {
    const values = list.map((row) => row[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const missing = (
    list: BimQuantitySummaryRow[],
    key: 'thieu_the_tich' | 'thieu_dien_tich' | 'thieu_chieu_dai' | 'thieu_trong_luong',
  ) => list.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const describe = (list: BimQuantitySummaryRow[]) => ({
    so_luong: list.reduce((total, row) => total + (Number(row.so_luong) || 0), 0),
    the_tich_m3: roundTo(sum(list, 'tong_the_tich')),
    dien_tich_m2: roundTo(sum(list, 'tong_dien_tich')),
    chieu_dai_m: roundTo(sum(list, 'tong_chieu_dai')),
    trong_luong_kg: roundTo(sum(list, 'tong_trong_luong'), 1),
    thieu_the_tich: missing(list, 'thieu_the_tich'),
    thieu_dien_tich: missing(list, 'thieu_dien_tich'),
    co_uoc_tinh_hinh_hoc: list.some((row) => row.co_uoc_tinh_hinh_hoc),
  });
  const nhom = [...groups.entries()]
    .map(([key, list]) => ({ nhom: key, ...describe(list) }))
    .sort(
      (a, b) =>
        (b.the_tich_m3 ?? -1) - (a.the_tich_m3 ?? -1) || b.so_luong - a.so_luong || a.nhom.localeCompare(b.nhom, 'vi'),
    );
  const total = describe(rows);
  return {
    nhom_theo: groupBy,
    so_nhom: nhom.length,
    so_cau_kien: total.so_luong,
    tong: total,
    nhom: nhom.slice(0, limit),
    bi_gioi_han: nhom.length > limit,
    ghi_chu: total.co_uoc_tinh_hinh_hoc
      ? 'Một phần khối lượng ước tính từ hình học 3D; diện tích là diện tích bề mặt, không phải ván khuôn.'
      : undefined,
  };
}

/** Groups element rows like v_bim_khoi_luong_tong_hop (elements that carry no quantity are left out). */
export function quantityGroups(rows: InsightElement[]): BimQuantitySummaryRow[] {
  const groups = new Map<string, InsightElement[]>();
  for (const row of rows) {
    if (!quantityApplies(row)) continue;
    const key = JSON.stringify([row.model_id, row.loai_cau_kien, row.vat_lieu ?? '', row.phan_doan_tang ?? '']);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const first = list[0];
    const values = (key: 'the_tich_be_tong' | 'dien_tich' | 'chieu_dai' | 'trong_luong') =>
      list.map((row) => row[key]).filter(validQuantity);
    const sum = (key: Parameters<typeof values>[0]) => {
      const found = values(key);
      return found.length ? found.reduce((a, b) => a + b, 0) : null;
    };
    return {
      model_id: first.model_id,
      project_id: first.project_id,
      loai_cau_kien: first.loai_cau_kien,
      vat_lieu: first.vat_lieu ?? '',
      phan_doan_tang: first.phan_doan_tang ?? '',
      so_luong: list.length,
      tong_the_tich: sum('the_tich_be_tong'),
      tong_dien_tich: sum('dien_tich'),
      tong_chieu_dai: sum('chieu_dai'),
      tong_trong_luong: sum('trong_luong'),
      thieu_the_tich: list.length - values('the_tich_be_tong').length,
      thieu_dien_tich: list.length - values('dien_tich').length,
      thieu_chieu_dai: list.length - values('chieu_dai').length,
      thieu_trong_luong: list.length - values('trong_luong').length,
      co_uoc_tinh_hinh_hoc: list.some((row) => row.nguon_khoi_luong === 'hinh_hoc'),
    };
  });
}

/**
 * Quantities, cost and quality figures of the rows in scope. `serverQuantities` (v_bim_khoi_luong_tong_hop of the
 * selected models) replaces the client grouping when the scope has no floor/Uniclass filter, so totals stay exact
 * even when the element read was capped.
 */
export function aggregateInsight(
  rows: InsightElement[],
  models: BimModel[],
  prices: BimUnitPrice[],
  serverQuantities?: BimQuantitySummaryRow[] | null,
) {
  const quantities = serverQuantities ?? quantityGroups(rows);
  const cost = buildCostRows(quantities, prices);
  const counts = Object.fromEntries(
    (Object.keys(QUALITY_FINDINGS) as FindingKey[]).map((key) => [
      key,
      rows.filter((row) => hasFinding(row, key)).length,
    ]),
  ) as Record<FindingKey, number>;
  const applicable = rows.filter(quantityApplies);
  const knownQuantity = applicable.filter((row) => quantityStatus(row) !== 'missing').length;
  const declared = applicable.filter((row) => ['qto', 'pset'].includes(row.nguon_khoi_luong ?? '')).length;
  return {
    count: rows.length,
    counts,
    declared,
    applicableQuantityCount: applicable.length,
    notApplicableQuantityCount: rows.length - applicable.length,
    knownQuantity,
    knownQuantityPercent: applicable.length ? (knownQuantity / applicable.length) * 100 : null,
    declaredPercent: applicable.length ? (declared / applicable.length) * 100 : null,
    quantities,
    quantitySource: serverQuantities ? ('server' as const) : ('elements' as const),
    cost,
    modelCount: models.length,
  };
}
export type InsightAnalysis = ReturnType<typeof aggregateInsight>;

// ── Project schedule and cost (phase B5) ───────────────────────────────────────────────────────────────────────────
/** Leaf schedule tasks: total, finished (actual 100 %), late (planned end before `today` and not finished). */
export function scheduleProgress(
  tasks: Pick<ScheduleTask, 'la_tom_tat' | 'ket_thuc' | 'phan_tram_thuc_te' | 'ty_trong' | 'bat_dau'>[],
  today: string,
) {
  const leaves = tasks.filter((t) => !t.la_tom_tat);
  const pct = (t: (typeof leaves)[number]) => Math.max(0, Math.min(100, Number(t.phan_tram_thuc_te) || 0));
  const weight = leaves.reduce((s, t) => s + (Number(t.ty_trong) > 0 ? Number(t.ty_trong) : 1), 0);
  const actual = weight
    ? leaves.reduce((s, t) => s + (Number(t.ty_trong) > 0 ? Number(t.ty_trong) : 1) * pct(t), 0) / weight
    : null;
  return {
    tong: leaves.length,
    hoan_thanh: leaves.filter((t) => pct(t) >= 100).length,
    cham: leaves.filter((t) => !!t.ket_thuc && t.ket_thuc.slice(0, 10) < today && pct(t) < 100).length,
    dang_lam: leaves.filter((t) => pct(t) > 0 && pct(t) < 100).length,
    /** Weighted actual % (weight = ty_trong, 1 when unset); null without tasks. */
    thuc_te_phan_tram: actual === null ? null : Math.round(actual * 10) / 10,
  };
}

/** Field progress states of the elements of the selected models (bim_field_actual rows). */
export function fieldActualCounts(rows: { model_id: string; trang_thai: string }[], modelIds: string[]) {
  const ids = new Set(modelIds);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    if (!ids.has(row.model_id)) continue;
    counts[row.trang_thai] = (counts[row.trang_thai] ?? 0) + 1;
    total += 1;
  }
  return { total, counts };
}

/** Change orders over all contracts. */
export function changeOrderTotals(contracts: ContractVariations[]) {
  const orders = contracts.flatMap((c) => c.phu_luc);
  return {
    hop_dong: contracts.length,
    gia_tri_goc: contracts.reduce((s, c) => s + c.gia_tri_goc, 0),
    duyet_gia_tri: contracts.reduce((s, c) => s + c.phat_sinh_da_ky, 0),
    cho_gia_tri: contracts.reduce((s, c) => s + c.phat_sinh_chua_ky, 0),
    duyet_so: orders.filter((o) => o.trang_thai === 'da_duyet').length,
    cho_so: orders.filter((o) => o.trang_thai === 'de_xuat').length,
  };
}

/** Budget vs commitments (bim_cost_summary). */
export function budgetTotals(summary: CostSummary) {
  const sum = (key: 'cam_ket' | 'du_kien' | 'thay_doi_duyet' | 'thay_doi_cho') =>
    summary.lines.reduce((s, l) => s + l[key], 0);
  const camKet = sum('cam_ket') + summary.chua_gan_ngan_sach.cam_ket;
  return {
    ngan_sach: summary.tong_ngan_sach,
    cam_ket: camKet,
    du_kien: sum('du_kien'),
    thay_doi_duyet: sum('thay_doi_duyet') + summary.chua_gan_ngan_sach.thay_doi_duyet,
    thay_doi_cho: sum('thay_doi_cho'),
    ty_le_cam_ket: summary.tong_ngan_sach > 0 ? camKet / summary.tong_ngan_sach : null,
  };
}

/** Latest closed EVM period (list ordered newest first by BimPlanService.periods, re-sorted defensively). */
export const latestEvm = (periods: EvmPeriod[]): EvmPeriod | null =>
  [...periods].sort((a, b) => b.ngay_chot.localeCompare(a.ngay_chot) || b.created_at.localeCompare(a.created_at))[0] ??
  null;
