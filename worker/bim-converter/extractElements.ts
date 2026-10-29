// Trích xuất cấu kiện, bộ thuộc tính (Pset), khối lượng (Qto), vật liệu và vị trí không gian
// từ file IFC bằng web-ifc thuần (tương thích cả Trình duyệt WebAssembly lẫn Node).

import * as WEBIFC from 'web-ifc';

/** Băm SHA-1 thuần JS (không phụ thuộc Node crypto, chạy được trên cả trình duyệt và Node) */
const sha1Hex = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  const ml = bytes.length * 8;
  const wordCount = (((bytes.length + 8) >> 6) + 1) << 4;
  const words = new Int32Array(wordCount);
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length & 3) * 8);
  words[wordCount - 2] = Math.floor(ml / 0x100000000);
  words[wordCount - 1] = ml >>> 0;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);
  const rol = (n: number, c: number) => (n << c) | (n >>> (32 - c));

  for (let i = 0; i < wordCount; i += 16) {
    for (let j = 0; j < 16; j++) w[j] = words[i + j];
    for (let j = 16; j < 80; j++) w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      const f =
        j < 20 ? (b & c) | (~b & d) : j < 40 ? b ^ c ^ d : j < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = j < 20 ? 0x5a827999 : j < 40 ? 0x6ed9eba1 : j < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (rol(a, 5) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
};

/** JSON có thứ tự khóa cố định (để băm ổn định) */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
};

export interface ExtractedElement {
  express_id: number;
  global_id: string;
  ten_cau_kien: string | null;
  loai_cau_kien: string;
  phan_doan_tang: string | null;
  parent_express_id: number | null;
  vat_lieu: string | null;
  the_tich_be_tong: number | null;
  dien_tich: number | null;
  dien_tich_van_khuon: number | null;
  chieu_dai: number | null;
  trong_luong: number | null;
  nguon_khoi_luong: 'qto' | 'hinh_hoc' | null;
  thuoc_tinh: ElementProperties;
  hash_noi_dung?: string;
}

export interface ElementProperties {
  thong_tin?: Record<string, string>;
  psets?: Record<string, Record<string, unknown>>;
  qto?: Record<string, Record<string, unknown>>;
  kieu?: { ten: string | null; loai: string; psets?: Record<string, Record<string, unknown>> };
  phan_loai?: string[];
}

export interface Georef {
  eastings?: number;
  northings?: number;
  orthogonalHeight?: number;
  xAxisAbscissa?: number;
  xAxisOrdinate?: number;
  scale?: number;
  crs?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
}

export interface ExtractResult {
  elements: ExtractedElement[];
  schema: string | null;
  authoringApp: string | null;
  /** Toạ độ gốc (IfcMapConversion / IfcSite) */
  georef?: Georef | null;
  /** Tỉ lệ cấu kiện có hình học nhưng không khai báo bộ số lượng (Base Quantities) */
  qtoMissingRatio?: number;
  qtoMissingCount?: number;
}

// Các lớp IFC không phải cấu kiện vật lý cần bỏ qua
const SKIPPED_CLASSES = new Set([
  'IFCOPENINGELEMENT',
  'IFCOPENINGSTANDARDCASE',
  'IFCVOIDINGFEATURE',
  'IFCVIRTUALELEMENT',
  'IFCANNOTATION',
  'IFCGRID',
  'IFCDISTRIBUTIONPORT',
  'IFCPORT',
]);

// ------------------------------------------------------------
// Tiện ích đọc giá trị IFC
// ------------------------------------------------------------

/** Giải mã chuỗi STEP (\X2\...\X0\, \X\hh, \S\) sang Unicode. */
export const decodeIfcString = (input: string): string => {
  if (!input || !input.includes('\\')) return input;
  return input
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) => {
      let out = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      return out;
    })
    .replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) => {
      let out = '';
      for (let i = 0; i + 8 <= hex.length; i += 8) out += String.fromCodePoint(parseInt(hex.slice(i, i + 8), 16));
      return out;
    })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, ch: string) => String.fromCharCode(ch.charCodeAt(0) + 128));
};

const raw = (val: any): any => (val !== null && typeof val === 'object' && 'value' in val ? val.value : val);

const str = (val: any): string | null => {
  const v = raw(val);
  if (v === null || v === undefined || v === '') return null;
  return decodeIfcString(String(v)).trim() || null;
};

const num = (val: any): number | null => {
  const v = raw(val);
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Chuẩn hóa giá trị thuộc tính IFC (IfcBoolean, IfcLabel, IfcReal...) thành JSON thuần. */
const normalizeValue = (val: any): unknown => {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.map(normalizeValue);
  const v = raw(val);
  if (v === 'T' || v === '.T.' || v === true) return true;
  if (v === 'F' || v === '.F.' || v === false) return false;
  if (v === 'U' || v === '.U.') return null;
  if (typeof v === 'string') return decodeIfcString(v);
  return v;
};

const ids = (val: any): number[] => {
  if (val === null || val === undefined) return [];
  const list = Array.isArray(val) ? val : [val];
  return list.map((x) => raw(x)).filter((x): x is number => typeof x === 'number');
};

const forEachLineOfType = (api: WEBIFC.IfcAPI, modelID: number, type: number, cb: (line: any) => void) => {
  const vec = api.GetLineIDsWithType(modelID, type, true);
  for (let i = 0; i < vec.size(); i++) {
    try {
      cb(api.GetLine(modelID, vec.get(i)));
    } catch {
      // bỏ qua dòng lỗi cú pháp
    }
  }
};

// ------------------------------------------------------------
// Đơn vị đo: quy đổi Qto về m / m² / m³ / kg
// ------------------------------------------------------------

const SI_PREFIX: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
};

interface UnitScales {
  length: number;
  area: number;
  volume: number;
  mass: number;
}

const readUnitScales = (api: WEBIFC.IfcAPI, modelID: number): UnitScales => {
  const scales: UnitScales = { length: 1, area: 1, volume: 1, mass: 1 };
  const unitFactor = (unit: any, depth = 0): number => {
    if (!unit || depth > 4) return 1;
    if (unit.type === WEBIFC.IFCSIUNIT) {
      const prefix = str(unit.Prefix);
      const p = prefix ? (SI_PREFIX[prefix.replace(/\./g, '')] ?? 1) : 1;
      const name = str(unit.Name)?.replace(/\./g, '');
      if (name === 'SQUARE_METRE') return p * p;
      if (name === 'CUBIC_METRE') return p * p * p;
      if (name === 'GRAM') return p / 1000; // quy về kg
      return p;
    }
    if (unit.type === WEBIFC.IFCCONVERSIONBASEDUNIT) {
      const measureId = raw(unit.ConversionFactor);
      if (typeof measureId !== 'number') return 1;
      const measure = api.GetLine(modelID, measureId);
      const factor = num(measure?.ValueComponent) ?? 1;
      const baseId = raw(measure?.UnitComponent);
      const base = typeof baseId === 'number' ? api.GetLine(modelID, baseId) : null;
      return factor * unitFactor(base, depth + 1);
    }
    return 1;
  };

  forEachLineOfType(api, modelID, WEBIFC.IFCUNITASSIGNMENT, (assign) => {
    for (const unitId of ids(assign.Units)) {
      try {
        const unit = api.GetLine(modelID, unitId);
        const unitType = str(unit?.UnitType)?.replace(/\./g, '');
        const factor = unitFactor(unit);
        if (unitType === 'LENGTHUNIT') scales.length = factor;
        else if (unitType === 'AREAUNIT') scales.area = factor;
        else if (unitType === 'VOLUMEUNIT') scales.volume = factor;
        else if (unitType === 'MASSUNIT') scales.mass = factor;
      } catch {
        // đơn vị không đọc được → giữ mặc định SI
      }
    }
  });
  return scales;
};

// ------------------------------------------------------------
// Đọc Property Set / Element Quantity (có cache vì Pset dùng chung nhiều cấu kiện)
// ------------------------------------------------------------

interface ParsedDefinition {
  kind: 'pset' | 'qto';
  name: string;
  values: Record<string, unknown>;
  quantities?: { name: string; kind: 'length' | 'area' | 'volume' | 'weight' | 'count'; value: number }[];
}

const parseDefinition = (
  api: WEBIFC.IfcAPI,
  modelID: number,
  defId: number,
  scales: UnitScales,
  cache: Map<number, ParsedDefinition | null>,
): ParsedDefinition | null => {
  if (cache.has(defId)) return cache.get(defId)!;
  let result: ParsedDefinition | null = null;
  try {
    const def = api.GetLine(modelID, defId);
    const name = str(def?.Name) || `#${defId}`;

    if (def?.type === WEBIFC.IFCPROPERTYSET) {
      const values: Record<string, unknown> = {};
      for (const propId of ids(def.HasProperties)) {
        const prop = api.GetLine(modelID, propId);
        const propName = str(prop?.Name);
        if (!propName) continue;
        if (prop.type === WEBIFC.IFCPROPERTYSINGLEVALUE) {
          values[propName] = normalizeValue(prop.NominalValue);
        } else if (prop.type === WEBIFC.IFCPROPERTYENUMERATEDVALUE) {
          values[propName] = normalizeValue(prop.EnumerationValues);
        } else if (prop.type === WEBIFC.IFCPROPERTYLISTVALUE) {
          values[propName] = normalizeValue(prop.ListValues);
        } else if (prop.type === WEBIFC.IFCPROPERTYBOUNDEDVALUE) {
          values[propName] = { min: normalizeValue(prop.LowerBoundValue), max: normalizeValue(prop.UpperBoundValue) };
        }
      }
      result = { kind: 'pset', name, values };
    } else if (def?.type === WEBIFC.IFCELEMENTQUANTITY) {
      const values: Record<string, unknown> = {};
      const quantities: ParsedDefinition['quantities'] = [];
      for (const qId of ids(def.Quantities)) {
        const q = api.GetLine(modelID, qId);
        const qName = str(q?.Name);
        if (!qName) continue;
        let kind: 'length' | 'area' | 'volume' | 'weight' | 'count' | null = null;
        let value: number | null = null;
        if (q.type === WEBIFC.IFCQUANTITYLENGTH) {
          kind = 'length';
          value = num(q.LengthValue);
          if (value !== null) value *= scales.length;
        } else if (q.type === WEBIFC.IFCQUANTITYAREA) {
          kind = 'area';
          value = num(q.AreaValue);
          if (value !== null) value *= scales.area;
        } else if (q.type === WEBIFC.IFCQUANTITYVOLUME) {
          kind = 'volume';
          value = num(q.VolumeValue);
          if (value !== null) value *= scales.volume;
        } else if (q.type === WEBIFC.IFCQUANTITYWEIGHT) {
          kind = 'weight';
          value = num(q.WeightValue);
          if (value !== null) value *= scales.mass;
        } else if (q.type === WEBIFC.IFCQUANTITYCOUNT) {
          kind = 'count';
          value = num(q.CountValue);
        }
        if (kind && value !== null) {
          values[qName] = Math.round(value * 1e6) / 1e6;
          quantities.push({ name: qName, kind, value });
        }
      }
      result = { kind: 'qto', name, values, quantities };
    }
  } catch {
    result = null;
  }
  cache.set(defId, result);
  return result;
};

// Thứ tự ưu tiên chọn đại lượng đại diện từ Qto
const VOLUME_KEYS = ['NetVolume', 'GrossVolume', 'Volume'];
const AREA_KEYS = [
  'NetArea',
  'NetSideArea',
  'NetSurfaceArea',
  'GrossArea',
  'GrossSideArea',
  'OuterSurfaceArea',
  'NetFootprintArea',
  'GrossFootprintArea',
  'CrossSectionArea',
];
const LENGTH_KEYS = ['Length', 'NetLength', 'GrossLength', 'Height', 'Depth'];
const WEIGHT_KEYS = ['NetWeight', 'GrossWeight', 'Weight'];
const FORMWORK_PATTERN = /formwork|v[aá]n\s*khu[oô]n/i;

// Loại không kỳ vọng có bộ số lượng (không tính vào cảnh báo thiếu Qto)
const NO_QTO_EXPECTED = new Set([
  'IFCSPACE',
  'IFCOPENINGELEMENT',
  'IFCANNOTATION',
  'IFCGRID',
  'IFCVIRTUALELEMENT',
  'IFCBUILDINGELEMENTPROXY',
  'IFCFURNISHINGELEMENT',
  'IFCFURNITURE',
  'IFCDISTRIBUTIONPORT',
  'IFCALIGNMENT',
  'IFCSITE',
]);

// Cấu kiện dạng tấm: diện tích đại diện là diện tích một mặt
const PLATE_LIKE = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCSLAB',
  'IFCROOF',
  'IFCCOVERING',
  'IFCPLATE',
  'IFCCURTAINWALL',
  'IFCFOOTING',
]);

const pickQuantity = (defs: ParsedDefinition[], kind: string, keys: string[]): number | null => {
  const all = defs.flatMap((d) => d.quantities || []).filter((q) => q.kind === kind);
  for (const key of keys) {
    const hit = all.find((q) => q.name.toLowerCase() === key.toLowerCase());
    if (hit) return hit.value;
  }
  return all.length > 0 ? all[0].value : null;
};

// ------------------------------------------------------------
// Vật liệu
// ------------------------------------------------------------

const readMaterialNames = (api: WEBIFC.IfcAPI, modelID: number, matId: number, depth = 0): string[] => {
  if (depth > 5) return [];
  try {
    const m = api.GetLine(modelID, matId);
    if (!m) return [];
    switch (m.type) {
      case WEBIFC.IFCMATERIAL:
        return [str(m.Name)].filter(Boolean) as string[];
      case WEBIFC.IFCMATERIALLIST:
        return ids(m.Materials).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALLAYERSETUSAGE:
        return ids(m.ForLayerSet).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALLAYERSET:
        return ids(m.MaterialLayers).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALLAYER:
      case WEBIFC.IFCMATERIALPROFILE:
      case WEBIFC.IFCMATERIALCONSTITUENT:
        return ids(m.Material).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALPROFILESETUSAGE:
        return ids(m.ForProfileSet).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALPROFILESET:
        return ids(m.MaterialProfiles).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      case WEBIFC.IFCMATERIALCONSTITUENTSET:
        return ids(m.MaterialConstituents).flatMap((id) => readMaterialNames(api, modelID, id, depth + 1));
      default:
        return [];
    }
  } catch {
    return [];
  }
};

// ------------------------------------------------------------
// Thể tích / diện tích từ hình học (dự phòng khi IFC không xuất Qto)
// ------------------------------------------------------------

/** Thể tích, diện tích bề mặt và diện tích các mặt nằm ngang (pháp tuyến gần ±Y hoặc ±Z) */
interface GeometryStats {
  volume: number;
  area: number;
  posY: number;
  negY: number;
  posZ: number;
  negZ: number;
}

const computeGeometryVolumes = (
  api: WEBIFC.IfcAPI,
  modelID: number,
  wanted: Set<number>,
): Map<number, GeometryStats> => {
  const result = new Map<number, GeometryStats>();
  if (wanted.size === 0) return result;

  api.StreamAllMeshes(modelID, (mesh) => {
    if (!wanted.has(mesh.expressID)) return;
    // Thể tích có dấu tính theo 2 điểm tham chiếu khác nhau: lưới khép kín cho cùng kết quả,
    // lưới hở (bề mặt địa hình, tấm mỏng không đóng) cho kết quả lệch → không dùng thể tích.
    let volume = 0;
    let volumeAlt = 0;
    let area = 0;
    let posY = 0,
      negY = 0,
      posZ = 0,
      negZ = 0;
    let ref: number[] | null = null;
    let closedCheckFailed = false;
    const count = mesh.geometries.size();
    for (let g = 0; g < count; g++) {
      const placed = mesh.geometries.get(g);
      const geom = api.GetGeometry(modelID, placed.geometryExpressID);
      try {
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const m = placed.flatTransformation; // ma trận 4x4 column-major
        // Biến đổi đỉnh không cấp phát mảng: ghi vào 3 biến out
        let ox = 0,
          oy = 0,
          oz = 0;
        const tx = (i: number) => {
          const x = verts[i * 6],
            y = verts[i * 6 + 1],
            z = verts[i * 6 + 2];
          ox = m[0] * x + m[4] * y + m[8] * z + m[12];
          oy = m[1] * x + m[5] * y + m[9] * z + m[13];
          oz = m[2] * x + m[6] * y + m[10] * z + m[14];
        };
        for (let t = 0; t + 2 < idx.length; t += 3) {
          tx(idx[t]);
          // Dời gốc về đỉnh đầu tiên để tránh sai số với toạ độ quốc gia lớn (VN-2000)
          if (!ref) ref = [ox, oy, oz];
          const ax = ox - ref[0],
            ay = oy - ref[1],
            az = oz - ref[2];
          tx(idx[t + 1]);
          const bx = ox - ref[0],
            by = oy - ref[1],
            bz = oz - ref[2];
          tx(idx[t + 2]);
          const cx0 = ox - ref[0],
            cy0 = oy - ref[1],
            cz0 = oz - ref[2];

          // thể tích có dấu của tứ diện (gốc, a, b, c) và (gốc dịch 1m theo mỗi trục) để kiểm tra lưới kín
          volume += (ax * (by * cz0 - bz * cy0) - ay * (bx * cz0 - bz * cx0) + az * (bx * cy0 - by * cx0)) / 6;
          const ax1 = ax - 1,
            ay1 = ay - 1,
            az1 = az - 1;
          const bx1 = bx - 1,
            by1 = by - 1,
            bz1 = bz - 1;
          const cx1 = cx0 - 1,
            cy1 = cy0 - 1,
            cz1 = cz0 - 1;
          volumeAlt +=
            (ax1 * (by1 * cz1 - bz1 * cy1) - ay1 * (bx1 * cz1 - bz1 * cx1) + az1 * (bx1 * cy1 - by1 * cx1)) / 6;

          const ux = bx - ax,
            uy = by - ay,
            uz = bz - az;
          const vx = cx0 - ax,
            vy = cy0 - ay,
            vz = cz0 - az;
          const nx = uy * vz - uz * vy,
            ny = uz * vx - ux * vz,
            nz = ux * vy - uy * vx;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          area += len / 2;
          if (len > 1e-12) {
            const fy = ny / len;
            const fz = nz / len;
            if (fy > 0.7) posY += len / 2;
            else if (fy < -0.7) negY += len / 2;
            if (fz > 0.7) posZ += len / 2;
            else if (fz < -0.7) negZ += len / 2;
          }
        }
      } finally {
        geom.delete();
      }
    }
    const scale = Math.max(Math.abs(volume), Math.abs(volumeAlt), 1e-9);
    closedCheckFailed = Math.abs(volume - volumeAlt) / scale > 0.01;
    const prev = result.get(mesh.expressID) || { volume: 0, area: 0, posY: 0, negY: 0, posZ: 0, negZ: 0 };
    result.set(mesh.expressID, {
      volume: closedCheckFailed || prev.volume < 0 ? -1 : prev.volume + Math.abs(volume),
      area: prev.area + area,
      posY: prev.posY + posY,
      negY: prev.negY + negY,
      posZ: prev.posZ + posZ,
      negZ: prev.negZ + negZ,
    });
  });
  return result;
};

// ------------------------------------------------------------
// Toạ độ gốc: IfcMapConversion (IFC4) hoặc IfcSite RefLatitude/RefLongitude
// ------------------------------------------------------------
const dms = (v: any): number | null => {
  const arr = raw(v);
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const [d, m, s2, us] = arr.map((x: any) => Number(raw(x)) || 0);
  const sign = d < 0 || m < 0 || s2 < 0 ? -1 : 1;
  return sign * (Math.abs(d) + Math.abs(m) / 60 + (Math.abs(s2) + Math.abs(us || 0) / 1e6) / 3600);
};

const readGeoref = (api: WEBIFC.IfcAPI, modelID: number): Georef | null => {
  let out: Georef | null = null;
  const mapType = (WEBIFC as any).IFCMAPCONVERSION;
  if (mapType) {
    forEachLineOfType(api, modelID, mapType, (mc) => {
      if (out) return;
      let crs: string | null = null;
      try {
        const target = raw(mc.TargetCRS);
        if (target) crs = str(api.GetLine(modelID, target).Name);
      } catch {
        /* bỏ qua */
      }
      out = {
        eastings: num(mc.Eastings) ?? 0,
        northings: num(mc.Northings) ?? 0,
        orthogonalHeight: num(mc.OrthogonalHeight) ?? 0,
        xAxisAbscissa: num(mc.XAxisAbscissa) ?? undefined,
        xAxisOrdinate: num(mc.XAxisOrdinate) ?? undefined,
        scale: num(mc.Scale) ?? undefined,
        crs,
      };
    });
  }
  forEachLineOfType(api, modelID, WEBIFC.IFCSITE, (site) => {
    const lat = dms(site.RefLatitude);
    const lon = dms(site.RefLongitude);
    if (lat === null && lon === null) return;
    out = { ...(out || {}), latitude: lat, longitude: lon, elevation: num(site.RefElevation) };
  });
  return out;
};

// Cấu kiện bê tông được tính ván khuôn từ hình học khi mô hình không khai báo
const FORMWORK_TYPES = new Set([
  'IFCBEAM',
  'IFCCOLUMN',
  'IFCSLAB',
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCFOOTING',
  'IFCSTAIR',
  'IFCSTAIRFLIGHT',
  'IFCMEMBER',
]);
const CONCRETE_PATTERN = /b[eê]\s*t[oô]ng|concrete|btct|\bb\s?\d{2}\b|\bm\s?\d{3}\b|\bc\d{2}\/\d{2}/i;
// Dầm, sàn, bản thang: ván khuôn gồm mặt bên + mặt đáy; cột, tường, móng: chỉ mặt bên
const FORMWORK_WITH_BOTTOM = new Set(['IFCBEAM', 'IFCSLAB', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCMEMBER']);

// ------------------------------------------------------------
// Hàm chính
// ------------------------------------------------------------

export interface ExtractOptions {
  /** Tính khối lượng từ hình học cho cấu kiện không có Qto (mặc định: true) */
  geometryFallback?: boolean;
  onProgress?: (percent: number, message: string) => void;
}

export const extractElements = (api: WEBIFC.IfcAPI, modelID: number, options: ExtractOptions = {}): ExtractResult => {
  const { geometryFallback = true, onProgress } = options;
  const report = (p: number, msg: string) => onProgress?.(Math.round(p), msg);

  let schema: string | null = null;
  let authoringApp: string | null = null;
  try {
    schema = api.GetModelSchema(modelID) || null;
  } catch {
    /* ignore */
  }
  try {
    const header = api.GetHeaderLine(modelID, WEBIFC.FILE_NAME);
    const args = header?.arguments || [];
    // FILE_NAME(name, time_stamp, author, organization, preprocessor_version, originating_system, authorization)
    authoringApp = str(args[5]) || str(args[4]);
  } catch {
    /* ignore */
  }

  const scales = readUnitScales(api, modelID);
  report(5, 'Đã đọc đơn vị đo');

  // 1. Dựng chỉ mục quan hệ (một lần duyệt cho mỗi loại quan hệ)
  const defsByObject = new Map<number, number[]>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES, (rel) => {
    const defIds = ids(rel.RelatingPropertyDefinition);
    for (const objId of ids(rel.RelatedObjects)) {
      const list = defsByObject.get(objId) || [];
      list.push(...defIds);
      defsByObject.set(objId, list);
    }
  });

  const typeByObject = new Map<number, number>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELDEFINESBYTYPE, (rel) => {
    const typeId = ids(rel.RelatingType)[0];
    if (typeId === undefined) return;
    for (const objId of ids(rel.RelatedObjects)) typeByObject.set(objId, typeId);
  });

  const materialByObject = new Map<number, number>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELASSOCIATESMATERIAL, (rel) => {
    const matId = ids(rel.RelatingMaterial)[0];
    if (matId === undefined) return;
    for (const objId of ids(rel.RelatedObjects)) materialByObject.set(objId, matId);
  });

  const classificationByObject = new Map<number, string[]>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELASSOCIATESCLASSIFICATION, (rel) => {
    const refId = ids(rel.RelatingClassification)[0];
    if (refId === undefined) return;
    let label: string | null = null;
    try {
      const ref = api.GetLine(modelID, refId);
      const code = str(ref?.Identification) || str(ref?.ItemReference);
      label = [code, str(ref?.Name)].filter(Boolean).join(' - ') || null;
    } catch {
      /* ignore */
    }
    if (!label) return;
    for (const objId of ids(rel.RelatedObjects)) {
      const list = classificationByObject.get(objId) || [];
      list.push(label);
      classificationByObject.set(objId, list);
    }
  });

  const containerByObject = new Map<number, number>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, (rel) => {
    const structId = ids(rel.RelatingStructure)[0];
    if (structId === undefined) return;
    for (const objId of ids(rel.RelatedElements)) containerByObject.set(objId, structId);
  });

  const parentByObject = new Map<number, number>();
  forEachLineOfType(api, modelID, WEBIFC.IFCRELAGGREGATES, (rel) => {
    const parentId = ids(rel.RelatingObject)[0];
    if (parentId === undefined) return;
    for (const objId of ids(rel.RelatedObjects)) parentByObject.set(objId, parentId);
  });
  report(20, 'Đã dựng chỉ mục quan hệ');

  // 2. Tên vị trí không gian (tầng / phân đoạn / hạng mục)
  const spatialNameCache = new Map<number, string | null>();
  const spatialName = (structId: number): string | null => {
    if (spatialNameCache.has(structId)) return spatialNameCache.get(structId)!;
    let name: string | null = null;
    try {
      const s = api.GetLine(modelID, structId);
      const n = str(s?.Name);
      const ln = str(s?.LongName);
      name = n && ln && n !== ln ? `${n} - ${ln}` : n || ln;
    } catch {
      /* ignore */
    }
    spatialNameCache.set(structId, name);
    return name;
  };

  const locationOf = (id: number): string | null => {
    let cur: number | undefined = id;
    for (let depth = 0; cur !== undefined && depth < 10; depth++) {
      const container = containerByObject.get(cur);
      if (container !== undefined) return spatialName(container);
      cur = parentByObject.get(cur);
    }
    return null;
  };

  // 3. Liệt kê cấu kiện vật lý (loại trừ phần tử không gian: khu đất, công trình, tầng, phân đoạn...)
  const spatialIds = new Set<number>();
  for (const spatialType of [(WEBIFC as any).IFCSPATIALELEMENT, (WEBIFC as any).IFCSPATIALSTRUCTUREELEMENT]) {
    if (typeof spatialType !== 'number') continue;
    try {
      const vec = api.GetLineIDsWithType(modelID, spatialType, true);
      for (let i = 0; i < vec.size(); i++) spatialIds.add(vec.get(i));
    } catch {
      // loại không tồn tại trong schema của file
    }
  }

  const elementIds: number[] = [];
  const allLines = api.GetAllLines(modelID);
  const total = allLines.size();
  for (let i = 0; i < total; i++) {
    const id = allLines.get(i);
    if (spatialIds.has(id)) continue;
    const type = api.GetLineType(modelID, id);
    if (!api.IsIfcElement(type)) continue;
    const className = api.GetNameFromTypeCode(type)?.toUpperCase();
    if (!className || SKIPPED_CLASSES.has(className)) continue;
    elementIds.push(id);
  }
  report(30, `Tìm thấy ${elementIds.length} cấu kiện`);

  // 4. Đọc chi tiết từng cấu kiện
  const defCache = new Map<number, ParsedDefinition | null>();
  const typeCache = new Map<number, ElementProperties['kieu'] & { defs: ParsedDefinition[]; materialId?: number }>();
  const elements: ExtractedElement[] = [];

  const readType = (typeId: number) => {
    if (typeCache.has(typeId)) return typeCache.get(typeId)!;
    let entry: any = { ten: null, loai: '', defs: [] as ParsedDefinition[] };
    try {
      const t = api.GetLine(modelID, typeId);
      const defs = [...ids(t?.HasPropertySets), ...(defsByObject.get(typeId) || [])]
        .map((d) => parseDefinition(api, modelID, d, scales, defCache))
        .filter((d): d is ParsedDefinition => !!d);
      const psets: Record<string, Record<string, unknown>> = {};
      for (const d of defs) if (d.kind === 'pset') psets[d.name] = d.values;
      entry = {
        ten: str(t?.Name),
        loai: api.GetNameFromTypeCode(t.type)?.toUpperCase() || '',
        psets: Object.keys(psets).length ? psets : undefined,
        defs,
        materialId: materialByObject.get(typeId),
      };
    } catch {
      /* ignore */
    }
    typeCache.set(typeId, entry);
    return entry;
  };

  const needGeometry = new Set<number>();
  const needFormwork = new Set<number>();
  let qtoMissing = 0;
  let qtoCounted = 0;

  elementIds.forEach((id, index) => {
    let line: any;
    try {
      line = api.GetLine(modelID, id);
    } catch {
      return;
    }
    const globalId = str(line?.GlobalId);
    if (!globalId) return;

    const loai = api.GetNameFromTypeCode(line.type)?.toUpperCase() || 'IFCELEMENT';
    const defs = (defsByObject.get(id) || [])
      .map((d) => parseDefinition(api, modelID, d, scales, defCache))
      .filter((d): d is ParsedDefinition => !!d);

    const typeId = typeByObject.get(id);
    const typeInfo = typeId !== undefined ? readType(typeId) : null;

    const props: ElementProperties = {};
    const thongTin: Record<string, string> = {};
    for (const [key, label] of [
      ['Description', 'Mô tả'],
      ['ObjectType', 'Kiểu đối tượng'],
      ['Tag', 'Mã (Tag)'],
      ['PredefinedType', 'Loại định nghĩa sẵn'],
    ] as const) {
      const v = str(line[key]);
      if (v) thongTin[label] = v.replace(/^\.|\.$/g, '');
    }
    if (Object.keys(thongTin).length) props.thong_tin = thongTin;

    const psets: Record<string, Record<string, unknown>> = {};
    const qtos: Record<string, Record<string, unknown>> = {};
    for (const d of defs) (d.kind === 'pset' ? psets : qtos)[d.name] = d.values;
    // Qto khai báo ở kiểu (type) dùng khi cấu kiện không có Qto riêng
    const qtoDefs = defs.filter((d) => d.kind === 'qto');
    if (qtoDefs.length === 0 && typeInfo) {
      for (const d of typeInfo.defs.filter((x: ParsedDefinition) => x.kind === 'qto')) {
        qtos[d.name] = d.values;
        qtoDefs.push(d);
      }
    }
    if (Object.keys(psets).length) props.psets = psets;
    if (Object.keys(qtos).length) props.qto = qtos;
    if (typeInfo && (typeInfo.ten || typeInfo.psets)) {
      props.kieu = { ten: typeInfo.ten, loai: typeInfo.loai, psets: typeInfo.psets };
    }
    const classes = classificationByObject.get(id);
    if (classes?.length) props.phan_loai = classes;

    // Vật liệu: của cấu kiện, nếu không có thì của kiểu
    const matId = materialByObject.get(id) ?? typeInfo?.materialId;
    const materials = matId !== undefined ? [...new Set(readMaterialNames(api, modelID, matId))] : [];

    let volume = pickQuantity(qtoDefs, 'volume', VOLUME_KEYS);
    let area = pickQuantity(qtoDefs, 'area', AREA_KEYS);
    const length = pickQuantity(qtoDefs, 'length', LENGTH_KEYS);
    const weight = pickQuantity(qtoDefs, 'weight', WEIGHT_KEYS);

    // Ván khuôn: chỉ lấy khi mô hình khai báo rõ (Pset/Qto có tên chứa formwork/ván khuôn)
    let formwork: number | null = null;
    for (const group of [...Object.values(qtos), ...Object.values(psets)]) {
      for (const [k, v] of Object.entries(group)) {
        if (FORMWORK_PATTERN.test(k) && typeof v === 'number') formwork = v;
      }
    }

    const hasQto = volume !== null || area !== null || length !== null || weight !== null;
    if (volume === null && geometryFallback) needGeometry.add(id);
    if (geometryFallback && formwork === null && FORMWORK_TYPES.has(loai) && CONCRETE_PATTERN.test(materials.join(' ')))
      needFormwork.add(id);
    if (!NO_QTO_EXPECTED.has(loai)) {
      qtoCounted++;
      if (!hasQto) qtoMissing++;
    }

    const round = (v: number | null) => (v === null ? null : Math.round(v * 1e6) / 1e6);
    const truncate = (v: string | null, max: number) => (v && v.length > max ? v.slice(0, max) : v);

    elements.push({
      express_id: id,
      global_id: globalId.slice(0, 22),
      ten_cau_kien: truncate(str(line.Name), 255),
      loai_cau_kien: loai.slice(0, 100),
      phan_doan_tang: truncate(locationOf(id), 100),
      parent_express_id: parentByObject.get(id) ?? null,
      vat_lieu: materials.length ? materials.join('; ') : null,
      the_tich_be_tong: round(volume),
      dien_tich: round(area),
      dien_tich_van_khuon: round(formwork),
      chieu_dai: round(length),
      trong_luong: round(weight),
      nguon_khoi_luong: hasQto ? 'qto' : null,
      thuoc_tinh: props,
    });

    if (index % 2000 === 0)
      report(30 + (index / Math.max(elementIds.length, 1)) * 50, `Đã đọc ${index}/${elementIds.length} cấu kiện`);
  });

  // 5. Dự phòng: tính thể tích/diện tích bề mặt từ hình học
  if (geometryFallback && (needGeometry.size > 0 || needFormwork.size > 0)) {
    report(
      80,
      `Tính khối lượng hình học cho ${needGeometry.size} cấu kiện thiếu Qto, ván khuôn ${needFormwork.size} cấu kiện bê tông`,
    );
    try {
      const wanted = new Set<number>([...needGeometry, ...needFormwork]);
      const geo = computeGeometryVolumes(api, modelID, wanted);
      // Trục đứng: so tổng diện tích mặt ngang của sàn theo Y và theo Z (web-ifc thường xuất Y hướng lên)
      let slabY = 0;
      let slabZ = 0;
      for (const el of elements) {
        if (el.loai_cau_kien !== 'IFCSLAB') continue;
        const g = geo.get(el.express_id);
        if (g) {
          slabY += g.posY + g.negY;
          slabZ += g.posZ + g.negZ;
        }
      }
      const upIsZ = slabZ > slabY * 1.5;
      for (const el of elements) {
        if (!needFormwork.has(el.express_id)) continue;
        const g = geo.get(el.express_id);
        if (!g || g.volume <= 1e-9) continue;
        const up = upIsZ ? g.posZ : g.posY;
        const down = upIsZ ? g.negZ : g.negY;
        // Mặt trên không cần ván khuôn; mặt đáy chỉ cần với dầm/sàn (winding ngược thì up/down đổi chỗ, diện tích như nhau)
        const top = Math.max(up, down);
        const bottom = Math.min(up, down);
        const fw = FORMWORK_WITH_BOTTOM.has(el.loai_cau_kien) ? g.area - top : g.area - top - bottom;
        if (fw > 1e-6) el.dien_tich_van_khuon = Math.round(fw * 1e6) / 1e6;
      }
      for (const el of elements) {
        if (!needGeometry.has(el.express_id)) continue;
        const g = geo.get(el.express_id);
        if (!g) continue;
        const closed = g.volume > 1e-9;
        if (!closed && g.area <= 1e-9) continue;
        if (closed) el.the_tich_be_tong = Math.round(g.volume * 1e6) / 1e6;
        if (el.dien_tich === null) {
          // Khối kín dạng tấm (tường, sàn, mái...): diện tích một mặt ≈ ½ tổng bề mặt; bề mặt hở: giữ nguyên
          const area = closed && PLATE_LIKE.has(el.loai_cau_kien) ? g.area / 2 : g.area;
          el.dien_tich = Math.round(area * 1e6) / 1e6;
        }
        el.nguon_khoi_luong = el.nguon_khoi_luong ?? 'hinh_hoc';
      }
    } catch (err: any) {
      console.warn('[EXTRACT] Không tính được khối lượng hình học:', err?.message || err);
    }
  }

  // Mã băm nội dung để so sánh phiên bản mô hình (cùng GUID nhưng khác thuộc tính/khối lượng → "đã sửa")
  for (const el of elements) {
    const { express_id: _id, parent_express_id: _parent, hash_noi_dung: _h, ...content } = el;
    el.hash_noi_dung = sha1Hex(stableStringify(content)).slice(0, 16);
  }

  let georef: Georef | null = null;
  try {
    georef = readGeoref(api, modelID);
  } catch {
    /* bỏ qua */
  }

  report(100, `Hoàn tất trích xuất ${elements.length} cấu kiện`);
  return {
    elements,
    schema,
    authoringApp,
    georef,
    qtoMissingRatio: qtoCounted ? Math.round((qtoMissing / qtoCounted) * 1000) / 1000 : 0,
    qtoMissingCount: qtoMissing,
  };
};
