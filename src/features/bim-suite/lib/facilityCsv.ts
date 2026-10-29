// Asset register CSV export/import with minimal COBie columns (Component/Type/System/Floor/Space). CSV quoting and
// parsing reuse lib/csv.ts; HUD.* columns of cic-hud files are still read, HUD.DataKind is ignored.
import type { FacilityAsset } from '../services/facilityAssetService';
import type { FacilityFloor, FacilitySpace, IfcAssetCandidate } from '../services/FacilityOpsService';
import { parseCsv, toCsv, type CsvCell } from './csv';

export { parseCsv };

/** Export columns: COBie sheet.field names. */
export const COBIE_COLUMNS = [
  'Component.AssetIdentifier',
  'Component.Name',
  'Type.Category',
  'Type.Manufacturer',
  'Type.ModelNumber',
  'Component.SerialNumber',
  'System.Name',
  'Floor.Name',
  'Space.Name',
  'Component.ExtIdentifier',
  'Component.ExtObject',
  'Component.InstallationDate',
  'Component.WarrantyEndDate',
  'Asset.MaintenanceCycleDays',
  'Asset.NextMaintenance',
  'Asset.Status',
] as const;

const ALIASES: Record<string, string> = {
  'component.assetidentifier': 'asset_code',
  assetidentifier: 'asset_code',
  'ma tai san': 'asset_code',
  asset_code: 'asset_code',
  tagnumber: 'asset_code',
  'component.tagnumber': 'asset_code',
  'component.name': 'name',
  name: 'name',
  'ten thiet bi': 'name',
  'type.category': 'category',
  category: 'category',
  'nhom thiet bi': 'category',
  'type.manufacturer': 'manufacturer',
  manufacturer: 'manufacturer',
  'hang san xuat': 'manufacturer',
  'type.modelnumber': 'model',
  modelnumber: 'model',
  model: 'model',
  'component.serialnumber': 'serial_number',
  serialnumber: 'serial_number',
  'so serial': 'serial_number',
  'system.name': 'system',
  system: 'system',
  'he thong': 'system',
  'floor.name': 'floor',
  floor: 'floor',
  tang: 'floor',
  'space.name': 'space',
  space: 'space',
  'component.space': 'space',
  phong: 'space',
  'component.extidentifier': 'guid',
  extidentifier: 'guid',
  guid: 'guid',
  globalid: 'guid',
  'component.extobject': 'model_id',
  extobject: 'model_id',
  model_id: 'model_id',
  'component.installationdate': 'install_date',
  installationdate: 'install_date',
  'ngay lap dat': 'install_date',
  'component.warrantyenddate': 'warranty_expiry',
  warrantyenddate: 'warranty_expiry',
  'bao hanh den': 'warranty_expiry',
  'asset.maintenancecycledays': 'maintenance_cycle_days',
  'hud.maintenancecycledays': 'maintenance_cycle_days',
  'chu ky bao tri': 'maintenance_cycle_days',
  'asset.nextmaintenance': 'next_maintenance',
  'hud.nextmaintenance': 'next_maintenance',
  'bao tri ke tiep': 'next_maintenance',
  'asset.status': 'status',
  'hud.status': 'status',
  status: 'status',
  'trang thai': 'status',
};
const STATUS_ALIASES: Record<string, string> = {
  active: 'Active',
  'hoat dong': 'Active',
  maintenance: 'Maintenance',
  'dang bao tri': 'Maintenance',
  broken: 'Broken',
  hong: 'Broken',
  retired: 'Retired',
  'ngung su dung': 'Retired',
};
const plain = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase();

export function assetsToCobieCsv(assets: FacilityAsset[], floors: FacilityFloor[] = [], spaces: FacilitySpace[] = []) {
  const floorName = new Map(floors.map((floor) => [floor.floor_key, floor.name]));
  const spaceName = new Map(spaces.map((space) => [space.space_code, space.space_code]));
  const rows: CsvCell[][] = assets.map((asset) => [
    asset.asset_code,
    asset.asset_name,
    asset.category,
    asset.manufacturer,
    asset.model,
    asset.serial_number,
    asset.system_name,
    asset.floor_key ? (floorName.get(asset.floor_key) ?? asset.floor_key) : asset.location_floor,
    asset.space_code ? (spaceName.get(asset.space_code) ?? asset.space_code) : asset.location_room,
    asset.bim_element_id,
    asset.model_id,
    asset.install_date,
    asset.warranty_expiry,
    asset.maintenance_cycle_days,
    asset.next_maintenance,
    asset.status,
  ]);
  return toCsv([[...COBIE_COLUMNS], ...rows]);
}
export function missingAssetsCsv(rows: IfcAssetCandidate[]) {
  return toCsv([
    [
      'Component.ExtIdentifier',
      'Component.ExtObject',
      'Component.Name',
      'IFC',
      'System.Name',
      'Floor.Name',
      'Space.Name',
      'Type.Manufacturer',
      'Type.ModelNumber',
      'Component.SerialNumber',
      'Đề xuất mã',
    ],
    ...rows.map((row) => [
      row.global_id,
      row.model_name,
      row.name,
      row.ifc_class,
      row.system_name,
      row.floor_label,
      row.space_name || row.space_code,
      row.manufacturer,
      row.model_label,
      row.serial_number,
      row.suggested_code,
    ]),
  ]);
}

export interface CsvAssetRow {
  [key: string]: string | number | null;
}
export function csvToAssetRows(text: string): { rows: CsvAssetRow[]; unknownColumns: string[] } {
  const [header = [], ...body] = parseCsv(text);
  const keys = header.map((name) => ALIASES[plain(name)] ?? null);
  const unknownColumns = header
    .filter((_, i) => !keys[i])
    .map((name) => name.trim())
    .filter(Boolean);
  if (!keys.includes('asset_code')) throw new Error('Thiếu cột mã tài sản (Component.AssetIdentifier).');
  const rows = body.map((values) => {
    const row: CsvAssetRow = {};
    keys.forEach((key, i) => {
      if (!key) return;
      let value: string | number | null = (values[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '');
      if (value === '') value = null;
      else if (key === 'status') value = STATUS_ALIASES[plain(value)] ?? value;
      else if (key === 'maintenance_cycle_days') value = Number(value);
      else if (['install_date', 'warranty_expiry', 'next_maintenance'].includes(key)) value = isoDate(value);
      row[key] = value;
    });
    return row;
  });
  return { rows, unknownColumns };
}
/** dd/mm/yyyy → yyyy-mm-dd; ISO stays. */
export function isoDate(value: string) {
  const vn = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (vn) return `${vn[3]}-${vn[2].padStart(2, '0')}-${vn[1].padStart(2, '0')}`;
  return value.slice(0, 10);
}
/** Downloads text or bytes through a Blob URL (no file-saver). */
export function downloadBlob(name: string, data: BlobPart, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
