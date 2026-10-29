// Asset register as a COBie 2.4 (reduced) workbook: Facility, Floor, Space, Type, Component, System, Job. Sheet and
// column names stay English per COBie so FM software can read them; missing values are "n/a" by COBie convention.
// Written with lib/xlsxWrite.ts (JSZip) instead of exceljs.
import type { FacilityAsset } from '../services/facilityAssetService';
import type { FacilityFloor, FacilitySpace, PmPlan } from '../services/FacilityOpsService';
import { writeXlsx } from './xlsxWrite';

export const COBIE_SHEETS = ['Facility', 'Floor', 'Space', 'Type', 'Component', 'System', 'Job'] as const;
const NA = 'n/a';
const SYSTEM = 'BuildSIA BIM';
const v = (x: unknown) => (x === null || x === undefined || String(x).trim() === '' ? NA : String(x));
/** Blocks formula injection when opened in Excel. */
const safe = (x: unknown) => {
  const s = v(x);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
};

export interface CobieInput {
  projectId: string;
  projectName: string;
  createdBy: string;
  createdOn: string;
  assets: FacilityAsset[];
  floors: FacilityFloor[];
  spaces: FacilitySpace[];
  plans: PmPlan[];
}

/** Type = category + manufacturer + model; the same triple shares one Type. */
export const typeNameOf = (a: Pick<FacilityAsset, 'category' | 'manufacturer' | 'model'>) =>
  [a.category ?? 'Chưa phân loại', a.manufacturer, a.model].filter(Boolean).join(' · ');
const componentNameOf = (a: FacilityAsset) => a.asset_code?.trim() || a.asset_name;

export function cobieRows(
  input: CobieInput,
): Record<(typeof COBIE_SHEETS)[number], { header: string[]; rows: string[][] }> {
  const { assets, floors, spaces, plans, createdBy: by, createdOn: on } = input;
  const floorName = new Map(floors.map((f) => [f.floor_key, f.name]));
  const types = new Map<string, FacilityAsset>();
  for (const a of assets) if (!types.has(typeNameOf(a))) types.set(typeNameOf(a), a);
  const systems = new Map<string, string[]>();
  for (const a of assets)
    if (a.system_name) systems.set(a.system_name, [...(systems.get(a.system_name) ?? []), componentNameOf(a)]);
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));
  return {
    Facility: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'ProjectName',
        'SiteName',
        'LinearUnits',
        'AreaUnits',
        'ExternalSystem',
        'ExternalProjectIdentifier',
        'Description',
      ],
      rows: [
        [
          safe(input.projectName),
          by,
          on,
          NA,
          safe(input.projectName),
          NA,
          'meters',
          'square meters',
          SYSTEM,
          input.projectId,
          'Xuất từ sổ tài sản phân hệ BIM',
        ],
      ],
    },
    Floor: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'ExtSystem',
        'ExtObject',
        'ExtIdentifier',
        'Description',
        'Elevation',
        'Height',
      ],
      rows: floors.map((f) => [
        safe(f.name),
        by,
        on,
        'Floor',
        f.source === 'ifc' ? 'IFC' : SYSTEM,
        'IfcBuildingStorey',
        f.floor_key,
        safe(f.building),
        v(f.elevation_m),
        NA,
      ]),
    },
    Space: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'FloorName',
        'Description',
        'ExtSystem',
        'ExtObject',
        'ExtIdentifier',
        'RoomTag',
        'UsableHeight',
        'GrossArea',
        'NetArea',
      ],
      rows: spaces.map((s) => [
        safe(s.space_code),
        by,
        on,
        NA,
        safe(floorName.get(s.floor_key) ?? s.floor_key),
        safe(s.name),
        s.source === 'ifc' ? 'IFC' : SYSTEM,
        'IfcSpace',
        s.space_code,
        safe(s.space_code),
        NA,
        NA,
        NA,
      ]),
    },
    Type: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'Description',
        'AssetType',
        'Manufacturer',
        'ModelNumber',
        'WarrantyGuarantorParts',
        'WarrantyDurationParts',
        'WarrantyDurationUnit',
        'ExpectedLife',
      ],
      rows: [...types].map(([name, a]) => [
        safe(name),
        by,
        on,
        safe(a.category),
        NA,
        'Fixed',
        safe(a.manufacturer),
        safe(a.model),
        safe(a.warranty_provider),
        NA,
        NA,
        NA,
      ]),
    },
    Component: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'TypeName',
        'Space',
        'Description',
        'ExtSystem',
        'ExtObject',
        'ExtIdentifier',
        'SerialNumber',
        'InstallationDate',
        'WarrantyStartDate',
        'TagNumber',
        'BarCode',
        'AssetIdentifier',
      ],
      rows: assets.map((a) => [
        safe(componentNameOf(a)),
        by,
        on,
        safe(typeNameOf(a)),
        safe(a.space_code ?? a.location_room),
        safe(a.asset_name),
        a.model_id ? 'IFC' : SYSTEM,
        safe(a.model_id),
        safe(a.bim_element_id),
        safe(a.serial_number),
        v(a.install_date),
        v(a.install_date),
        safe(a.asset_code),
        NA,
        a.asset_id,
      ]),
    },
    System: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'ComponentNames',
        'ExtSystem',
        'ExtObject',
        'ExtIdentifier',
        'Description',
      ],
      rows: [...systems].map(([name, comps]) => [
        safe(name),
        by,
        on,
        NA,
        safe(comps.join(',')),
        SYSTEM,
        'IfcSystem',
        NA,
        NA,
      ]),
    },
    Job: {
      header: [
        'Name',
        'CreatedBy',
        'CreatedOn',
        'Category',
        'Status',
        'TypeName',
        'Description',
        'Duration',
        'DurationUnit',
        'Start',
        'TaskStartUnit',
        'Frequency',
        'FrequencyUnit',
        'ExtSystem',
        'ExtObject',
        'ExtIdentifier',
        'TaskNumber',
        'Priors',
        'ResourceNames',
      ],
      rows: plans.map((p, i) => {
        const a = p.asset_id ? assetById.get(p.asset_id) : undefined;
        return [
          safe(p.name),
          by,
          on,
          'PM',
          p.active ? 'Active' : 'Inactive',
          safe(a ? typeNameOf(a) : p.asset_category),
          safe(p.checklist_template.join('; ')),
          NA,
          NA,
          v(p.start_on),
          'day',
          String(p.cycle_days),
          'day',
          SYSTEM,
          'facility_pm_plans',
          p.id,
          String(i + 1),
          NA,
          NA,
        ];
      }),
    },
  };
}

export async function buildCobieWorkbook(input: CobieInput): Promise<Uint8Array> {
  const data = cobieRows(input);
  return writeXlsx(
    COBIE_SHEETS.map((name) => ({ name, rows: [data[name].header, ...data[name].rows], header: true, width: 18 })),
    'Phân hệ BIM',
  );
}
