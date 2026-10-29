// features/bim/lib/ids.ts
// IDS 1.0 (buildingSMART Information Delivery Specification): đọc file .ids và chuyển các "facet"
// thành điều kiện lọc cấu kiện trên máy chủ (RPC bim_loc_cau_kien).
//
// Hỗ trợ: entity (tên lớp, predefinedType), attribute (Name, Description, Tag, ObjectType, PredefinedType),
// property (Pset + tên thuộc tính, giá trị), material. Giá trị: simpleValue, xs:enumeration, xs:pattern,
// giới hạn số (min/maxInclusive/Exclusive). Classification: Uniclass Pr/Ss (mã IfcClassificationReference); partOf và
// hệ phân loại khác chưa hỗ trợ → báo "bỏ qua".

import type { BimSetCondition, BimFieldRef } from '@/features/bim-suite/types/bim.types';

export type IdsValue =
  | { kind: 'simple'; value: string }
  | { kind: 'enum'; values: string[] }
  | { kind: 'pattern'; pattern: string }
  | { kind: 'bounds'; min?: number; minInclusive?: boolean; max?: number; maxInclusive?: boolean };

export type IdsCardinality = 'required' | 'optional' | 'prohibited';

export type IdsFacet =
  | { type: 'entity'; name: IdsValue; predefinedType?: IdsValue }
  | { type: 'attribute'; name: IdsValue; value?: IdsValue; cardinality: IdsCardinality }
  | {
      type: 'property';
      propertySet: IdsValue;
      baseName: IdsValue;
      value?: IdsValue;
      dataType?: string;
      cardinality: IdsCardinality;
    }
  | { type: 'material'; value?: IdsValue; cardinality: IdsCardinality }
  | { type: 'classification'; system?: IdsValue; value?: IdsValue; cardinality: IdsCardinality }
  | { type: 'partOf'; relation?: string; cardinality: IdsCardinality };

export interface IdsSpecification {
  name: string;
  description?: string;
  instructions?: string;
  ifcVersion?: string;
  /** Số cấu kiện áp dụng tối thiểu (minOccurs của applicability): 0 = không bắt buộc có */
  minOccurs: number;
  maxOccurs?: number | 'unbounded';
  applicability: IdsFacet[];
  requirements: IdsFacet[];
}

export interface IdsDocument {
  title: string;
  author?: string;
  version?: string;
  description?: string;
  specifications: IdsSpecification[];
}

const local = (el: Element) => el.localName;
const kids = (el: Element | null | undefined, name?: string) =>
  el ? Array.from(el.children).filter((c) => !name || local(c) === name) : [];
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] as Element | undefined;
const text = (el: Element | undefined) => (el?.textContent ?? '').trim();

const parseValue = (el: Element | undefined): IdsValue | undefined => {
  if (!el) return undefined;
  const simple = kid(el, 'simpleValue');
  if (simple) return { kind: 'simple', value: text(simple) };
  const restriction = kid(el, 'restriction');
  if (!restriction) return undefined;
  const enums = kids(restriction, 'enumeration').map((e) => e.getAttribute('value') ?? '');
  if (enums.length) return { kind: 'enum', values: enums };
  const pattern = kid(restriction, 'pattern');
  if (pattern) return { kind: 'pattern', pattern: pattern.getAttribute('value') ?? '' };
  const num = (name: string) => {
    const v = kid(restriction, name)?.getAttribute('value');
    return v === undefined || v === null || v === '' ? undefined : Number(v);
  };
  const minI = num('minInclusive');
  const minE = num('minExclusive');
  const maxI = num('maxInclusive');
  const maxE = num('maxExclusive');
  if ([minI, minE, maxI, maxE].some((n) => n !== undefined)) {
    return {
      kind: 'bounds',
      min: minI ?? minE,
      minInclusive: minI !== undefined,
      max: maxI ?? maxE,
      maxInclusive: maxI !== undefined,
    };
  }
  return undefined;
};

const cardinalityOf = (el: Element, fallback: IdsCardinality = 'required'): IdsCardinality => {
  const c = el.getAttribute('cardinality');
  if (c === 'optional' || c === 'prohibited' || c === 'required') return c;
  // IDS 0.9: minOccurs/maxOccurs trên facet
  if (el.getAttribute('maxOccurs') === '0') return 'prohibited';
  if (el.getAttribute('minOccurs') === '0') return 'optional';
  return fallback;
};

const parseFacet = (el: Element): IdsFacet | null => {
  switch (local(el)) {
    case 'entity':
      return {
        type: 'entity',
        name: parseValue(kid(el, 'name')) ?? { kind: 'simple', value: '' },
        predefinedType: parseValue(kid(el, 'predefinedType')),
      };
    case 'attribute':
      return {
        type: 'attribute',
        name: parseValue(kid(el, 'name')) ?? { kind: 'simple', value: '' },
        value: parseValue(kid(el, 'value')),
        cardinality: cardinalityOf(el),
      };
    case 'property':
      return {
        type: 'property',
        propertySet: parseValue(kid(el, 'propertySet')) ?? { kind: 'simple', value: '' },
        baseName: parseValue(kid(el, 'baseName') || kid(el, 'name')) ?? { kind: 'simple', value: '' },
        value: parseValue(kid(el, 'value')),
        dataType: el.getAttribute('dataType') || undefined,
        cardinality: cardinalityOf(el),
      };
    case 'material':
      return { type: 'material', value: parseValue(kid(el, 'value')), cardinality: cardinalityOf(el) };
    case 'classification':
      return {
        type: 'classification',
        system: parseValue(kid(el, 'system')),
        value: parseValue(kid(el, 'value')),
        cardinality: cardinalityOf(el),
      };
    case 'partOf':
      return { type: 'partOf', relation: el.getAttribute('relation') || undefined, cardinality: cardinalityOf(el) };
    default:
      return null;
  }
};

/** Đọc nội dung file .ids (XML). Trên máy chủ (Node) truyền `parser` từ src/lib/xml/dom.ts. */
export const parseIds = (xml: string, parser: Pick<DOMParser, 'parseFromString'> = new DOMParser()): IdsDocument => {
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('File IDS không đúng định dạng XML');
  const root = doc.documentElement;
  if (local(root) !== 'ids') throw new Error('Không phải file IDS (thiếu thẻ <ids>)');
  const info = kid(root, 'info');
  const specs = kids(kid(root, 'specifications'), 'specification').map((s) => {
    const app = kid(s, 'applicability');
    const minOccurs = app?.getAttribute('minOccurs') ?? s.getAttribute('minOccurs');
    const maxOccurs = app?.getAttribute('maxOccurs') ?? s.getAttribute('maxOccurs');
    return {
      name: s.getAttribute('name') || 'Yêu cầu không tên',
      description: s.getAttribute('description') || undefined,
      instructions: s.getAttribute('instructions') || undefined,
      ifcVersion: s.getAttribute('ifcVersion') || undefined,
      minOccurs: minOccurs === null || minOccurs === undefined ? 0 : Number(minOccurs) || 0,
      maxOccurs: maxOccurs === 'unbounded' ? 'unbounded' : maxOccurs ? Number(maxOccurs) : undefined,
      applicability: kids(app)
        .map(parseFacet)
        .filter((f): f is IdsFacet => !!f),
      requirements: kids(kid(s, 'requirements'))
        .map(parseFacet)
        .filter((f): f is IdsFacet => !!f),
    } as IdsSpecification;
  });
  return {
    title: text(kid(info, 'title')) || 'Bộ yêu cầu IDS',
    author: text(kid(info, 'author')) || undefined,
    version: text(kid(info, 'version')) || undefined,
    description: text(kid(info, 'description')) || undefined,
    specifications: specs,
  };
};

// ── Chuyển facet → điều kiện lọc ─────────────────────────────────────

const ATTRIBUTE_FIELDS: Record<string, BimFieldRef> = {
  name: 'ten_cau_kien',
  globalid: 'global_id',
  description: ['thong_tin', 'Mô tả'],
  tag: ['thong_tin', 'Mã (Tag)'],
  objecttype: ['thong_tin', 'Kiểu đối tượng'],
  predefinedtype: ['thong_tin', 'Loại định nghĩa sẵn'],
};

/** Giá trị → điều kiện (có thể nhiều điều kiện AND với giới hạn số) */
const valueConditions = (field: BimFieldRef, v: IdsValue | undefined, upper = false): BimSetCondition[] => {
  if (!v) return [{ truong: field, toan_tu: 'co' }];
  const norm = (s: string) => (upper ? s.toUpperCase() : s);
  switch (v.kind) {
    case 'simple':
      return [{ truong: field, toan_tu: '=', gia_tri: norm(v.value) }];
    case 'enum':
      return [{ truong: field, toan_tu: 'trong', gia_tri: v.values.map(norm).join('|') }];
    case 'pattern':
      return [{ truong: field, toan_tu: 'khop_mau', gia_tri: v.pattern }];
    case 'bounds': {
      const out: BimSetCondition[] = [];
      if (v.min !== undefined)
        out.push({ truong: field, toan_tu: v.minInclusive ? '>=' : '>', gia_tri: String(v.min) });
      if (v.max !== undefined)
        out.push({ truong: field, toan_tu: v.maxInclusive ? '<=' : '<', gia_tri: String(v.max) });
      return out.length ? out : [{ truong: field, toan_tu: 'co' }];
    }
  }
};

export interface FacetQuery {
  /** Điều kiện "có dữ liệu" của facet (VD Pset có thuộc tính này) */
  exists: BimSetCondition[];
  /** Điều kiện "đúng giá trị" (bao gồm cả exists) */
  match: BimSetCondition[];
  label: string;
}

const valueLabel = (v?: IdsValue) =>
  !v
    ? ''
    : v.kind === 'simple'
      ? ` = “${v.value}”`
      : v.kind === 'enum'
        ? ` ∈ {${v.values.join(', ')}}`
        : v.kind === 'pattern'
          ? ` khớp mẫu /${v.pattern}/`
          : ` trong [${v.min ?? '−∞'}; ${v.max ?? '+∞'}]`;

/** Facet → truy vấn; null = chưa hỗ trợ (VD classification, partOf, Pset theo mẫu) */
export const facetToQuery = (f: IdsFacet): FacetQuery | null => {
  if (f.type === 'entity') {
    const conds = valueConditions('loai_cau_kien', f.name, true);
    if (f.predefinedType) conds.push(...valueConditions(['thong_tin', 'Loại định nghĩa sẵn'], f.predefinedType, true));
    return { exists: conds, match: conds, label: `Loại cấu kiện${valueLabel(f.name)}` };
  }
  if (f.type === 'attribute') {
    if (f.name.kind !== 'simple') return null;
    const field = ATTRIBUTE_FIELDS[f.name.value.toLowerCase()];
    if (!field) return null;
    const exists: BimSetCondition[] = [{ truong: field, toan_tu: 'co' }];
    return {
      exists,
      match: f.value ? [...exists, ...valueConditions(field, f.value)] : exists,
      label: `Thuộc tính ${f.name.value}${valueLabel(f.value)}`,
    };
  }
  if (f.type === 'property') {
    if (f.propertySet.kind !== 'simple' || f.baseName.kind !== 'simple') return null;
    // Bộ số lượng (Qto_*) được worker lưu riêng ở thuoc_tinh.qto
    const group = /^qto_/i.test(f.propertySet.value) ? 'qto' : 'psets';
    const field: BimFieldRef = [group, f.propertySet.value, f.baseName.value];
    const exists: BimSetCondition[] = [{ truong: field, toan_tu: 'co' }];
    return {
      exists,
      match: f.value ? [...exists, ...valueConditions(field, f.value)] : exists,
      label: `${f.propertySet.value}.${f.baseName.value}${valueLabel(f.value)}`,
    };
  }
  if (f.type === 'material') {
    const exists: BimSetCondition[] = [{ truong: 'vat_lieu', toan_tu: 'co' }];
    const match =
      f.value?.kind === 'simple'
        ? [...exists, { truong: 'vat_lieu', toan_tu: 'chua', gia_tri: f.value.value } as BimSetCondition]
        : f.value
          ? [...exists, ...valueConditions('vat_lieu', f.value)]
          : exists;
    return { exists, match, label: `Vật liệu${f.value ? valueLabel(f.value) : ' (bắt buộc có)'}` };
  }
  if (f.type === 'classification') {
    // Only Uniclass with an unambiguous Pr/Ss table maps to the canonical fields.
    // Other systems remain explicitly unsupported rather than silently passing.
    if (!f.system || f.system.kind !== 'simple' || !/^uniclass\s*(2015)?\s*(pr|ss)?$/i.test(f.system.value.trim()))
      return null;
    const codes = f.value?.kind === 'simple' ? [f.value.value] : f.value?.kind === 'enum' ? f.value.values : [];
    const tableFromSystem = f.system.value.match(/\b(pr|ss)$/i)?.[1]?.toLowerCase();
    const tables = new Set(codes.map((code) => /^(pr|ss)_/i.exec(code)?.[1]?.toLowerCase()));
    const table = tableFromSystem ?? (tables.size === 1 ? [...tables][0] : undefined);
    if (!table || (codes.length > 0 && (tables.has(undefined) || [...tables].some((value) => value !== table))))
      return null;
    // The converter stores IfcClassificationReference codes as thuoc_tinh.phan_loai = ["<code> - <name>", …]; the
    // conditions run on that JSON text: any code of the table, or one of the given codes exactly.
    const field = ['phan_loai'];
    const prefix = table === 'pr' ? 'Pr_' : 'Ss_';
    const exists: BimSetCondition[] = [{ truong: field, toan_tu: 'khop_mau', gia_tri: `"${prefix}` }];
    if (f.value && !codes.length) return null; // patterns and ranges on codes are not supported
    const escape = (code: string) => code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = codes.length
      ? [
          {
            truong: field,
            toan_tu: 'khop_mau',
            gia_tri: `"(${codes.map(escape).join('|')})( - [^"]*)?"`,
          } as BimSetCondition,
        ]
      : [];
    return {
      exists,
      match: f.value ? [...exists, ...exact] : exists,
      label: `Uniclass ${table === 'pr' ? 'Pr · Sản phẩm' : 'Ss · Hệ thống'}${valueLabel(f.value)}`,
    };
  }
  return null;
};

export const facetLabel = (f: IdsFacet) => {
  const q = facetToQuery(f);
  if (q) return q.label;
  if (f.type === 'classification') return `Phân loại${valueLabel(f.system)}${valueLabel(f.value)}`;
  if (f.type === 'partOf') return `Thuộc (${f.relation || 'quan hệ'})`;
  return 'Điều kiện';
};

export const cardinalityLabel: Record<IdsCardinality, string> = {
  required: 'bắt buộc',
  optional: 'nếu có thì phải đúng',
  prohibited: 'không được có',
};

// ── Đánh giá ─────────────────────────────────────────────────────────

export interface IdsElementRef {
  model_id: string;
  express_id: number;
  global_id?: string | null;
}

export interface IdsRequirementResult {
  label: string;
  cardinality: IdsCardinality;
  supported: boolean;
  failed: IdsElementRef[];
}

export interface IdsSpecResult {
  spec: IdsSpecification;
  applicableCount: number;
  supported: boolean;
  /** Vi phạm số lượng áp dụng tối thiểu (minOccurs ≥ 1 nhưng không có cấu kiện nào) */
  occursFailed: boolean;
  requirements: IdsRequirementResult[];
  failedElements: IdsElementRef[];
  status: 'dat' | 'khong_dat' | 'khong_ap_dung' | 'chua_ho_tro';
}

const keyOf = (e: IdsElementRef) => `${e.model_id}:${e.express_id}`;

/**
 * Đánh giá một yêu cầu IDS. `query` chạy bộ lọc trên máy chủ (AND các điều kiện).
 * - required: đạt = áp dụng ∧ match
 * - prohibited: vi phạm = áp dụng ∧ exists
 * - optional: vi phạm = (áp dụng ∧ exists) − (áp dụng ∧ match)
 */
export const evaluateSpec = async (
  spec: IdsSpecification,
  query: (conds: BimSetCondition[]) => Promise<IdsElementRef[]>,
): Promise<IdsSpecResult> => {
  const appQueries = spec.applicability.map(facetToQuery);
  if (appQueries.length === 0 || appQueries.some((q) => !q)) {
    return {
      spec,
      applicableCount: 0,
      supported: false,
      occursFailed: false,
      requirements: [],
      failedElements: [],
      status: 'chua_ho_tro',
    };
  }
  const appConds = appQueries.flatMap((q) => q!.match);
  const applicable = await query(appConds);
  // minOccurs ≥ 1: phải có ít nhất một cấu kiện; maxOccurs = 0: không được có cấu kiện nào
  const occursFailed =
    (spec.minOccurs >= 1 && applicable.length === 0) || (spec.maxOccurs === 0 && applicable.length > 0);
  if (spec.maxOccurs === 0) {
    return {
      spec,
      applicableCount: applicable.length,
      supported: true,
      occursFailed,
      requirements: [],
      failedElements: applicable,
      status: applicable.length > 0 ? 'khong_dat' : 'dat',
    };
  }
  const requirements: IdsRequirementResult[] = [];
  const failedKeys = new Map<string, IdsElementRef>();

  if (applicable.length > 0) {
    const appKeys = new Set(applicable.map(keyOf));
    for (const facet of spec.requirements) {
      const q = facetToQuery(facet);
      const cardinality = (facet as any).cardinality ?? 'required';
      if (!q) {
        requirements.push({ label: facetLabel(facet), cardinality, supported: false, failed: [] });
        continue;
      }
      let failed: IdsElementRef[];
      if (cardinality === 'prohibited') {
        failed = await query([...appConds, ...q.exists]);
      } else if (cardinality === 'optional') {
        const has = await query([...appConds, ...q.exists]);
        const ok = new Set((await query([...appConds, ...q.match])).map(keyOf));
        failed = has.filter((e) => !ok.has(keyOf(e)));
      } else {
        const ok = new Set((await query([...appConds, ...q.match])).map(keyOf));
        failed = applicable.filter((e) => !ok.has(keyOf(e)));
      }
      failed = failed.filter((e) => appKeys.has(keyOf(e)));
      failed.forEach((e) => failedKeys.set(keyOf(e), e));
      requirements.push({ label: q.label, cardinality, supported: true, failed });
    }
  }

  const failedElements = [...failedKeys.values()];
  const status: IdsSpecResult['status'] = occursFailed
    ? 'khong_dat'
    : applicable.length === 0
      ? 'khong_ap_dung'
      : failedElements.length > 0
        ? 'khong_dat'
        : 'dat';
  return {
    spec,
    applicableCount: applicable.length,
    supported: true,
    occursFailed,
    requirements,
    failedElements,
    status,
  };
};
