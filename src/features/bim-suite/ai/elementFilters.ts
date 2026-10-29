// Element filters shared by the in-browser commands and the future server search tool (port of cic-hud
// services/ai/bimElementFilters). BuildSIA rows carry standard IFC data (bim_elements: phan_doan_tang, ten_cau_kien,
// thuoc_tinh.psets / phan_loai) instead of cic-hud's project dictionary `hud_chuan`.
import { getIfcLabel, ifcLabels } from '../lib/ifcLabels';
import { normalizeVi, resolveBimElementQuery } from '../lib/vietnameseBimMap';

export { normalizeVi };

export const NO_MATCH_CLASS = '__KHONG_KHOP__';

/**
 * "cột" → IFCCOLUMN; "IFCBEAM" → IFCBEAM. Matches a whole label or a whole part of a label (split by "/"), never a
 * substring: "cột" does not match "Cột tín hiệu đường sắt". Null when empty; [NO_MATCH_CLASS] when unknown.
 */
export function resolveIfcClasses(value?: unknown): string[] | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^ifc[a-z]+$/i.test(raw)) return [raw.toUpperCase()];
  const dictionary = resolveBimElementQuery({ loai_cau_kien: raw });
  if (dictionary.ifcClasses?.length && !dictionary.residualKeyword) return dictionary.ifcClasses;
  const query = normalizeVi(raw).replace(/^(cac|nhung|toan bo|tat ca)\s+/, '');
  const exact = Object.entries(ifcLabels)
    .filter(([cls, label]) => {
      const parts = normalizeVi(label)
        .split('/')
        .map((part) => part.trim());
      return (
        parts.includes(query) || normalizeVi(label) === query || normalizeVi(cls) === `ifc${query.replace(/\s+/g, '')}`
      );
    })
    .map(([cls]) => cls);
  if (exact.length) return exact;
  if (dictionary.ifcClasses?.length) return dictionary.ifcClasses;
  return [NO_MATCH_CLASS];
}

export const ifcLabelOf = (cls: string) => `${getIfcLabel(cls)} (${cls})`;

const BASEMENT = /^(b|basement|ham|tang ham)\s*-?\s*0*(\d+)$/;
const FLOOR = /^(t|l|f|tang|lau|level|floor)?\s*0*(\d+)$/;

/** Equivalent storey codes: "3" → T03, T3, L3, L03, 3, 03; "hầm 1" → B1, B01. */
export function storeyCodes(value: unknown): string[] | null {
  const text = normalizeVi(String(value ?? ''));
  if (!text) return null;
  const basement = text.match(BASEMENT);
  if (basement) {
    const n = Number(basement[2]);
    return [`B${n}`, `B${String(n).padStart(2, '0')}`];
  }
  const floor = text.match(FLOOR);
  if (floor) {
    const n = Number(floor[2]);
    const two = String(n).padStart(2, '0');
    return [`T${two}`, `T${n}`, `L${n}`, `L${two}`, String(n), two];
  }
  return [text.toUpperCase()];
}

export function storeyRegex(value: unknown): RegExp | null {
  const text = normalizeVi(String(value ?? ''));
  if (!text) return null;
  const basement = text.match(BASEMENT);
  if (basement)
    return new RegExp(`(^|[^0-9a-z])(b|ham|tang ham|basement)\\s*-?\\s*0*${Number(basement[2])}([^0-9]|$)`, 'i');
  const floor = text.match(FLOOR);
  if (floor) return new RegExp(`(^|[^0-9a-z])(t|l|f|tang|lau|level|floor)\\s*0*${Number(floor[2])}([^0-9]|$)`, 'i');
  return new RegExp(`(^|[^0-9a-z])${text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}([^0-9a-z]|$)`, 'i');
}

/** The bim_elements columns these filters read. */
export interface FilterRow {
  phan_doan_tang?: string | null;
  ten_cau_kien?: string | null;
  thuoc_tinh?: {
    psets?: Record<string, Record<string, unknown>> | null;
    kieu?: { psets?: Record<string, Record<string, unknown>> | null } | null;
    phan_loai?: string[] | null;
  } | null;
}

export function matchesStorey(row: FilterRow, value: unknown): boolean {
  const regex = storeyRegex(value);
  if (!regex) return true;
  return regex.test(normalizeVi(row.phan_doan_tang ?? ''));
}

export function towerCode(value: unknown): string | null {
  const text = normalizeVi(String(value ?? ''))
    .replace(/^(thap|tower|toa|khoi)\s*/, '')
    .trim();
  return text ? text.toUpperCase() : null;
}

export function matchesTower(row: FilterRow, value: unknown): boolean {
  const code = towerCode(value);
  if (!code) return true;
  const location = normalizeVi(row.phan_doan_tang ?? '');
  const escaped = code.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`((thap|tower|toa|khoi)\\s*${escaped}([^0-9a-z]|$))|(^${escaped}([^0-9a-z]|$))`, 'i').test(
    location,
  );
}

/** Every pset of the element and of its type (type values are inherited). */
const allPsets = (row: FilterRow) => [
  ...Object.values(row.thuoc_tinh?.psets ?? {}),
  ...Object.values(row.thuoc_tinh?.kieu?.psets ?? {}),
];
const psetValues = (row: FilterRow, keys: string[]) =>
  allPsets(row)
    .flatMap((pset) => keys.map((key) => pset?.[key]))
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

const FIRE_NAME = /(chong chay|ngan chay|fire[ -]?(rated|door|resist)|(^|[^0-9a-z])ei\s*[0-9]{2,3}([^0-9]|$))/i;
const NOT_RATED = /^(0|none|khong|no|n\/a|-)$/i;

/** Fire rated when an IFC common pset declares FireRating, or the element name says so. */
export function isFireRated(row: FilterRow): boolean {
  if (psetValues(row, ['FireRating']).some((value) => !NOT_RATED.test(String(value).trim()))) return true;
  return FIRE_NAME.test(normalizeVi(row.ten_cau_kien ?? ''));
}

/** System by Uniclass Ss code / title or a SystemName-like property. */
export function matchesSystem(row: FilterRow, value: unknown): boolean {
  const query = normalizeVi(String(value ?? ''));
  if (!query) return true;
  const classes = (row.thuoc_tinh?.phan_loai ?? []).filter((entry) => /^ss_/i.test(entry.trim()));
  const names = psetValues(row, ['SystemName', 'System Name', 'System', 'SystemType']);
  return normalizeVi([...classes, ...names.map(String)].join(' ')).includes(query);
}

/** Filters that only the server can answer (links, acceptance, psets). */
export const SERVER_ONLY_FILTERS = ['has_acceptance', 'has_document', 'has_task', 'has_asset', 'pset'] as const;

export function needsServerSearch(args: Record<string, unknown>) {
  return SERVER_ONLY_FILTERS.some((key) =>
    key === 'pset' ? Array.isArray(args.pset) && args.pset.length > 0 : typeof args[key] === 'boolean',
  );
}

export interface SearchFilters {
  loai_cau_kien?: string[];
  keyword?: string;
  vat_lieu?: string;
  tang?: string;
  thap?: string;
  he_thong?: string;
  chong_chay?: boolean;
  has_acceptance?: boolean;
  has_document?: boolean;
  has_task?: boolean;
  has_asset?: boolean;
  pset?: { key: string; op: string; value?: string }[];
  global_ids?: string[];
  sap_xep?: string;
}

const OPS = new Set(['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing']);
const bool = (value: unknown) =>
  typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : undefined;

/** Normalise tool arguments into search filters; Vietnamese error on invalid arguments. */
export function buildSearchFilters(args: Record<string, unknown>): {
  filters: SearchFilters;
  canonical?: string;
  error?: string;
} {
  const resolved = resolveBimElementQuery({ loai_cau_kien: args.loai_cau_kien, keyword: args.keyword });
  const classes = args.loai_cau_kien ? resolveIfcClasses(args.loai_cau_kien) : resolved.ifcClasses;
  const filters: SearchFilters = {};
  if (classes?.length) filters.loai_cau_kien = classes;
  // Text left after removing the category may hold conditions the model did not split into arguments.
  let rest = normalizeVi(String(resolved.residualKeyword ?? (resolved.ifcClasses ? '' : (args.keyword ?? ''))));
  const take = (pattern: RegExp, apply: (match: RegExpMatchArray) => void) => {
    const match = rest.match(pattern);
    if (match) {
      apply(match);
      rest = rest.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
    }
  };
  // The dictionary may treat "cửa chống cháy" as a synonym of "cửa": keep the fire condition.
  const whole = normalizeVi(`${String(args.loai_cau_kien ?? '')} ${String(args.keyword ?? '')}`);
  if (/\b(chong chay|ngan chay)\b/.test(whole)) filters.chong_chay = true;
  take(/\b(chong chay|ngan chay)\b/, () => (filters.chong_chay = true));
  take(/\bchua (co )?nghiem thu\b/, () => (filters.has_acceptance = false));
  take(/\b(da (co )?nghiem thu)\b/, () => (filters.has_acceptance = true));
  take(/\b(tang ham|ham|tang|lau)\s*(\d+)\b/, (m) => (filters.tang = `${m[1].includes('ham') ? 'B' : ''}${m[2]}`));
  take(/\b(thap|toa)\s*([a-z]\d?)\b/, (m) => (filters.thap = m[2].toUpperCase()));
  if (rest && rest !== normalizeVi(String(args.loai_cau_kien ?? ''))) filters.keyword = rest.slice(0, 100);
  for (const key of ['vat_lieu', 'thap', 'he_thong'] as const)
    if (typeof args[key] === 'string' && String(args[key]).trim())
      filters[key] = String(args[key]).trim().slice(0, 100);
  const storey = args.tang ?? args.phan_doan_tang;
  if (typeof storey === 'string' && storey.trim()) filters.tang = storey.trim().slice(0, 50);
  for (const key of ['chong_chay', 'has_acceptance', 'has_document', 'has_task', 'has_asset'] as const) {
    const value = bool(args[key]);
    if (value !== undefined) filters[key] = value;
  }
  if (Array.isArray(args.pset)) {
    const conditions = args.pset.slice(0, 10).map((raw: unknown) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        key: String(item.key ?? item.khoa ?? '').trim(),
        op: String(item.op ?? item.toan_tu ?? 'eq')
          .trim()
          .toLowerCase(),
        value: item.value === undefined && item.gia_tri === undefined ? undefined : String(item.value ?? item.gia_tri),
      };
    });
    if (conditions.some((c) => !c.key || !OPS.has(c.op)))
      return {
        filters,
        error: 'Điều kiện thuộc tính cần key và op thuộc eq, ne, contains, gt, gte, lt, lte, exists, missing.',
      };
    filters.pset = conditions;
  }
  if (Array.isArray(args.global_ids)) filters.global_ids = args.global_ids.map(String).slice(0, 2000);
  if (typeof args.sap_xep === 'string') filters.sap_xep = args.sap_xep;
  return { filters, canonical: resolved.canonicalVi ?? undefined };
}
