// Uniclass 2015 helpers on BuildSIA data (port of cic-hud features/bim/lib/uniclass). The converter stores the
// IfcClassificationReference entries of each element in bim_elements.thuoc_tinh.phan_loai as "Pr_20_85_16 - Title";
// the RPC bim_uniclass_tong_hop counts them per code. cic-hud read codes and Vietnamese labels from its project data
// dictionary instead; here labels are the titles written in the IFC file.
import type { BimSetCondition } from '@/features/bim-suite/types/bim.types';
import { normalizeVi } from '../lib/vietnameseBimMap';

/** One row of bim_uniclass_tong_hop (same shape as services/BimUniclassService UniclassCode). */
export interface UniclassCodeRow {
  /** Lowercase table: pr, ss, ef, ... */
  bang: string;
  ma: string;
  ten: string | null;
  so_luong: number;
}

export type UniclassTable = 'pr' | 'ss';
export const UNICLASS_TABLE_PREFIX: Record<UniclassTable, string> = { pr: 'Pr', ss: 'Ss' };
export const UNICLASS_UNCLASSIFIED = 'unclassified';

/** "Pr_20_85_16 - Concrete columns" → { table: 'pr', code: 'Pr_20_85_16', title: 'Concrete columns' }. */
export function parseUniclassEntry(entry: string): { table: string; code: string; title: string | null } | null {
  const match = String(entry ?? '')
    .trim()
    .match(/^([A-Za-z]{2}(?:_\d{2}){1,5})(?:\s+-\s+(.*))?$/);
  if (!match) return null;
  const code = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return { table: code.slice(0, 2).toLowerCase(), code, title: match[2]?.trim() || null };
}

/** Canonical case for a code ("pr_20_85" → "Pr_20_85"); null when it is not a code of that table. */
export function normalizeUniclassCode(table: UniclassTable, value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!new RegExp(`^${UNICLASS_TABLE_PREFIX[table]}(?:_\\d{2}){1,5}$`, 'i').test(raw)) return null;
  return UNICLASS_TABLE_PREFIX[table] + raw.slice(2);
}

/** A parent code selects itself and every child code (Pr_20_85 → Pr_20_85_16_15). */
export function matchesUniclass(code: string | null | undefined, selected?: string): boolean {
  if (!selected || selected === 'all') return true;
  if (selected === UNICLASS_UNCLASSIFIED) return !code;
  const a = String(code ?? '').toLowerCase();
  const b = selected.toLowerCase();
  return a === b || a.startsWith(`${b}_`);
}

export function uniclassOptions(codes: UniclassCodeRow[], table: UniclassTable) {
  return codes
    .filter((row) => row.bang === table)
    .map((row) => ({ code: row.ma, label: row.ten ?? '', count: row.so_luong }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Codes of a table that a (parent) code selects. */
export const codesUnder = (codes: UniclassCodeRow[], table: UniclassTable, selected: string) =>
  codes.filter((row) => row.bang === table && matchesUniclass(row.ma, selected));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Element filter conditions for bim_loc_cau_kien (AND). phan_loai is read as JSON text, so a code is matched at the
 * start of an array entry followed by child segments only; unclassified = no entry of that table.
 */
export function uniclassConditions(filter: { pr?: string; ss?: string }): BimSetCondition[] {
  const out: BimSetCondition[] = [];
  for (const table of ['pr', 'ss'] as const) {
    const value = filter[table];
    if (!value || value === 'all') continue;
    if (value === UNICLASS_UNCLASSIFIED) {
      out.push({ truong: ['phan_loai'], toan_tu: 'khong_chua', gia_tri: `"${UNICLASS_TABLE_PREFIX[table]}_` });
      continue;
    }
    const code = normalizeUniclassCode(table, value);
    if (!code) continue;
    out.push({ truong: ['phan_loai'], toan_tu: 'khop_mau', gia_tri: `"${escapeRegex(code)}(_[0-9]{2})*([^_0-9]|$)` });
  }
  return out;
}

/** Codes and titles whose code or title contains the query (accent-insensitive). */
export function searchUniclass(codes: UniclassCodeRow[], query: string) {
  const q = normalizeVi(query);
  if (!q) return codes;
  return codes.filter((row) => normalizeVi(`${row.ma} ${row.ten ?? ''}`).includes(q));
}

export const uniclassSummary = (codes: UniclassCodeRow[]) => ({
  he_thong: 'Uniclass 2015',
  nguon: 'IfcClassificationReference trong tệp IFC (thuoc_tinh.phan_loai)',
  pr: uniclassOptions(codes, 'pr'),
  ss: uniclassOptions(codes, 'ss'),
  ghi_chu: 'Tên mã lấy theo tệp IFC; mã cha gồm toàn bộ mã con. Pr/Ss không thay GUID.',
});
