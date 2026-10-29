import { formatNumber, formatDateTime } from '@/lib/utils';
// features/bim/lib/detectDiscipline.ts
// Tự động nhận diện bộ môn của mô hình IFC từ:
//   1. Tên file theo quy ước ISO 19650 / TCVN (VD: 26065_ARRA_CIC_ARCH_ZZ_ZZ, ..._STR_..., ..._ELEC_...)
//   2. Thống kê loại thực thể IFC trong nội dung file (tường/cửa → kiến trúc, dầm/cột/cốt thép → kết cấu,
//      ống/máng/thiết bị → MEP, ray/tuyến → đường ray, cầu, hầm, tín hiệu)

import type { BimDiscipline } from '@/features/bim-suite/types/bim.types';

export interface DisciplineDetection {
  discipline: BimDiscipline;
  /** 0..1 */
  confidence: number;
  reason: string;
  /** Hệ thống con của MEP (điện, cấp thoát nước, điều hòa thông gió, PCCC) nếu nhận diện được */
  system?: string;
}

// Mã bộ môn trong tên file (so khớp theo từng đoạn tách bởi _ - . khoảng trắng)
const NAME_TOKENS: { discipline: BimDiscipline; tokens: string[] }[] = [
  { discipline: 'KIEN_TRUC', tokens: ['ARCH', 'ARC', 'AR', 'KT', 'KIENTRUC', 'ARCHITECTURE', 'ARCHITECTURAL'] },
  {
    discipline: 'KET_CAU',
    tokens: ['STR', 'STRU', 'STRUC', 'STRUCT', 'STRUCTURE', 'STRUCTURAL', 'KC', 'KETCAU', 'CIV', 'CIVIL'],
  },
  {
    discipline: 'MEP',
    tokens: [
      'MEP',
      'MEPF',
      'ELEC',
      'ELE',
      'EL',
      'ELECTRICAL',
      'ELV',
      'MECH',
      'MEC',
      'ME',
      'MECHANICAL',
      'PLUM',
      'PLUMB',
      'PLUMBING',
      'PLB',
      'HVAC',
      'ACMV',
      'FP',
      'FIRE',
      'FIREFIGHTING',
      'SPRINKLER',
      'PCCC',
      'SAN',
      'SANITARY',
      'DRAIN',
      'DRAINAGE',
      'WS',
      'CD',
      'DIEN',
      'NUOC',
      'DHKK',
      'CAPTHOAT',
      'CTN',
      'PS',
      'PMN',
      'CHONGSET',
    ],
  },
  { discipline: 'CAU', tokens: ['BRIDGE', 'BRG', 'BR', 'CAU'] },
  { discipline: 'HAM', tokens: ['TUNNEL', 'TUN', 'TNL', 'HAM'] },
  { discipline: 'NHA_GA', tokens: ['STATION', 'STN', 'STA', 'GA', 'NHAGA', 'DEPOT'] },
  {
    discipline: 'DUONG_RAY',
    tokens: [
      'TRACK',
      'TRK',
      'RAIL',
      'RWY',
      'ROAD',
      'RD',
      'RAY',
      'ALIGN',
      'ALIGNMENT',
      'DUONG',
      'NENDUONG',
      'EARTHWORK',
    ],
  },
  {
    discipline: 'THONG_TIN_TIN_HIEU',
    tokens: ['SIG', 'SIGNAL', 'SIGNALLING', 'TEL', 'TELECOM', 'COM', 'COMM', 'ICT', 'SCADA', 'OCS', 'TTTH', 'TINHIEU'],
  },
];

// Trọng số loại thực thể IFC cho từng bộ môn (chỉ đếm cấu kiện, không đếm hình học/thuộc tính)
const ENTITY_WEIGHTS: Record<string, Partial<Record<BimDiscipline, number>>> = {
  IFCWALL: { KIEN_TRUC: 1 },
  IFCWALLSTANDARDCASE: { KIEN_TRUC: 1 },
  IFCCURTAINWALL: { KIEN_TRUC: 1 },
  IFCDOOR: { KIEN_TRUC: 2 },
  IFCWINDOW: { KIEN_TRUC: 2 },
  IFCSTAIR: { KIEN_TRUC: 1 },
  IFCSTAIRFLIGHT: { KIEN_TRUC: 1 },
  IFCRAILING: { KIEN_TRUC: 1 },
  IFCROOF: { KIEN_TRUC: 1 },
  IFCCOVERING: { KIEN_TRUC: 1 },
  IFCSPACE: { KIEN_TRUC: 1 },
  IFCFURNISHINGELEMENT: { KIEN_TRUC: 1 },
  IFCFURNITURE: { KIEN_TRUC: 1 },
  IFCRAMP: { KIEN_TRUC: 1 },
  // Revit xuất đố & tấm vách kính thành IfcMember / IfcPlate → trọng số thấp, nghiêng kiến trúc
  IFCPLATE: { KIEN_TRUC: 0.1, KET_CAU: 0.05 },
  IFCMEMBER: { KIEN_TRUC: 0.1, KET_CAU: 0.1 },
  IFCSLAB: { KIEN_TRUC: 0.5, KET_CAU: 0.5 },

  IFCBEAM: { KET_CAU: 1.5 },
  IFCCOLUMN: { KET_CAU: 1.5 },
  IFCFOOTING: { KET_CAU: 2 },
  IFCPILE: { KET_CAU: 2 },
  IFCREINFORCINGBAR: { KET_CAU: 2 },
  IFCREINFORCINGMESH: { KET_CAU: 2 },
  IFCTENDON: { KET_CAU: 2 },
  IFCMECHANICALFASTENER: { KET_CAU: 1 },
  IFCFASTENER: { KET_CAU: 0.5, DUONG_RAY: 0.5 },
  IFCSTRUCTURALANALYSISMODEL: { KET_CAU: 5 },
  IFCSTRUCTURALCURVEMEMBER: { KET_CAU: 2 },

  IFCFLOWSEGMENT: { MEP: 2 },
  IFCFLOWFITTING: { MEP: 2 },
  IFCFLOWTERMINAL: { MEP: 2 },
  IFCFLOWCONTROLLER: { MEP: 2 },
  IFCFLOWMOVINGDEVICE: { MEP: 2 },
  IFCFLOWSTORAGEDEVICE: { MEP: 2 },
  IFCFLOWTREATMENTDEVICE: { MEP: 2 },
  IFCENERGYCONVERSIONDEVICE: { MEP: 2 },
  IFCDISTRIBUTIONPORT: { MEP: 0.5 },
  IFCDISTRIBUTIONCONTROLELEMENT: { MEP: 1 },
  IFCDISTRIBUTIONELEMENT: { MEP: 1 },
  IFCPIPESEGMENT: { MEP: 2 },
  IFCPIPEFITTING: { MEP: 2 },
  IFCDUCTSEGMENT: { MEP: 2 },
  IFCDUCTFITTING: { MEP: 2 },
  IFCAIRTERMINAL: { MEP: 2 },
  IFCCABLESEGMENT: { MEP: 2 },
  IFCCABLECARRIERSEGMENT: { MEP: 2 },
  IFCCABLECARRIERFITTING: { MEP: 2 },
  IFCCABLEFITTING: { MEP: 2 },
  IFCLIGHTFIXTURE: { MEP: 2 },
  IFCLAMP: { MEP: 2 },
  IFCOUTLET: { MEP: 2 },
  IFCSWITCHINGDEVICE: { MEP: 2 },
  IFCELECTRICAPPLIANCE: { MEP: 2 },
  IFCELECTRICDISTRIBUTIONBOARD: { MEP: 2 },
  IFCSANITARYTERMINAL: { MEP: 2 },
  IFCFIRESUPPRESSIONTERMINAL: { MEP: 2 },
  IFCVALVE: { MEP: 2 },
  IFCPUMP: { MEP: 2 },
  IFCFAN: { MEP: 2 },
  IFCSENSOR: { MEP: 1, THONG_TIN_TIN_HIEU: 1 },

  IFCRAIL: { DUONG_RAY: 3 },
  IFCTRACKELEMENT: { DUONG_RAY: 3 },
  IFCCOURSE: { DUONG_RAY: 2 },
  IFCPAVEMENT: { DUONG_RAY: 2 },
  IFCKERB: { DUONG_RAY: 2 },
  IFCEARTHWORKSFILL: { DUONG_RAY: 2 },
  IFCEARTHWORKSCUT: { DUONG_RAY: 2 },
  IFCALIGNMENT: { DUONG_RAY: 10 },
  IFCRAILWAY: { DUONG_RAY: 20 },
  IFCROAD: { DUONG_RAY: 20 },

  IFCBRIDGE: { CAU: 30 },
  IFCBRIDGEPART: { CAU: 5 },
  IFCBEARING: { CAU: 3 },
  IFCTUNNEL: { HAM: 30 },
  IFCTUNNELPART: { HAM: 5 },

  IFCSIGNAL: { THONG_TIN_TIN_HIEU: 3 },
  IFCCOMMUNICATIONSAPPLIANCE: { THONG_TIN_TIN_HIEU: 3 },
  IFCAUDIOVISUALAPPLIANCE: { THONG_TIN_TIN_HIEU: 2 },
  IFCALARM: { THONG_TIN_TIN_HIEU: 1, MEP: 1 },
  IFCMOBILETELECOMMUNICATIONSAPPLIANCE: { THONG_TIN_TIN_HIEU: 3 },
};

// Hệ thống con của MEP: mã trong tên file và loại thực thể đặc trưng
const MEP_SYSTEMS: { label: string; tokens: string[]; entities: string[] }[] = [
  {
    label: 'Điện',
    tokens: ['ELEC', 'ELE', 'EL', 'ELECTRICAL', 'ELV', 'DIEN', 'CHONGSET', 'LV'],
    entities: [
      'IFCCABLESEGMENT',
      'IFCCABLECARRIERSEGMENT',
      'IFCCABLECARRIERFITTING',
      'IFCCABLEFITTING',
      'IFCLIGHTFIXTURE',
      'IFCLAMP',
      'IFCOUTLET',
      'IFCSWITCHINGDEVICE',
      'IFCELECTRICAPPLIANCE',
      'IFCELECTRICDISTRIBUTIONBOARD',
    ],
  },
  {
    label: 'Cấp thoát nước',
    tokens: [
      'PLUM',
      'PLUMB',
      'PLUMBING',
      'PLB',
      'SAN',
      'SANITARY',
      'DRAIN',
      'DRAINAGE',
      'WS',
      'CD',
      'NUOC',
      'CAPTHOAT',
      'CTN',
    ],
    entities: ['IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCSANITARYTERMINAL', 'IFCVALVE', 'IFCPUMP'],
  },
  {
    label: 'Điều hòa, thông gió',
    tokens: ['HVAC', 'ACMV', 'MECH', 'MEC', 'MECHANICAL', 'DHKK'],
    entities: ['IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCAIRTERMINAL', 'IFCFAN'],
  },
  {
    label: 'Phòng cháy chữa cháy',
    tokens: ['FP', 'FIRE', 'FIREFIGHTING', 'SPRINKLER', 'PCCC'],
    entities: ['IFCFIRESUPPRESSIONTERMINAL', 'IFCALARM'],
  },
];

/** Xác định hệ thống MEP con: ưu tiên mã trong tên file, sau đó loại thực thể chiếm nhiều nhất */
export const detectMepSystem = (fileName: string, counts: Record<string, number>): string | undefined => {
  const parts = fileName
    .replace(/\.(ifc|ifczip|zip)$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .split(/[_\-.\s]+/);
  const theoTen = MEP_SYSTEMS.find((s) => parts.some((p) => s.tokens.includes(p)));
  if (theoTen) return theoTen.label;
  const diem = MEP_SYSTEMS.map((s) => ({ s, n: s.entities.reduce((t, e) => t + (counts[e] || 0), 0) })).sort(
    (a, b) => b.n - a.n,
  );
  return diem[0] && diem[0].n > 0 ? diem[0].s.label : undefined;
};

/** Chuẩn hoá tên mô hình để so khớp phiên bản: bỏ đuôi, mã phiên bản, ngày tháng, "copy", "(1)" */
export const normalizeModelName = (fileName: string): string =>
  fileName
    .replace(/\.(ifc|ifczip|zip)$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\(\d+\)|\bCOPY\b|\bBAN SAO\b/g, ' ')
    .replace(/[_\-.\s](V|VER|VERSION|REV|R|P|LAN)[_\-.]?\d{1,3}(?=$|[_\-.\s])/g, ' ') // _v2, -R03, _rev1, _P01, _lan2
    .replace(/[_\-.\s](19|20)\d{2}[_\-.]?\d{2}[_\-.]?\d{2}(?=$|[_\-.\s])/g, ' ') // 20260918, 2026-09-18
    .replace(/[_\-.\s]\d{2}[_\-.]\d{2}[_\-.](19|20)\d{2}(?=$|[_\-.\s])/g, ' ') // 18-09-2026
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

/** Tìm mô hình đã có trong dự án mà file mới nhiều khả năng là phiên bản tiếp theo */
export const matchExistingModel = <T extends { file_name: string }>(fileName: string, models: T[]): T | null => {
  const ten = normalizeModelName(fileName);
  if (!ten) return null;
  return models.find((m) => normalizeModelName(m.file_name) === ten) || null;
};

const LABELS: Record<BimDiscipline, string> = {
  TOAN_THE: 'Toàn thể công trình',
  CAU: 'Công trình cầu',
  HAM: 'Công trình hầm',
  NHA_GA: 'Nhà ga',
  DUONG_RAY: 'Tuyến ray & nền đường',
  KIEN_TRUC: 'Kiến trúc',
  KET_CAU: 'Kết cấu',
  MEP: 'Cơ điện (MEP)',
  THONG_TIN_TIN_HIEU: 'Thông tin & tín hiệu',
  DIEN: 'Điện',
  CAP_THOAT_NUOC: 'Cấp thoát nước',
  PCCC: 'Phòng cháy chữa cháy',
  HA_TANG: 'Hạ tầng kỹ thuật',
  KHAC: 'Bộ môn khác',
};

// Cụm từ tiếng Việt viết tách (không dấu, viết hoa, ghép liền) → bộ môn
const COMPOUND_TOKENS: Record<string, BimDiscipline> = {
  KETCAU: 'KET_CAU',
  CAUTHANG: 'KIEN_TRUC',
  KIENTRUC: 'KIEN_TRUC',
  HOANTHIEN: 'KIEN_TRUC',
  NHAGA: 'NHA_GA',
  DUONGRAY: 'DUONG_RAY',
  NENDUONG: 'DUONG_RAY',
  TINHIEU: 'THONG_TIN_TIN_HIEU',
  THONGTIN: 'THONG_TIN_TIN_HIEU',
  CAPTHOAT: 'MEP',
  CAPNUOC: 'MEP',
  THOATNUOC: 'MEP',
  DIEUHOA: 'MEP',
  THONGGIO: 'MEP',
  CODIEN: 'MEP',
  CHUACHAY: 'MEP',
};

/** Nhận diện theo tên file */
export const detectFromFileName = (fileName: string): { discipline: BimDiscipline; token: string } | null => {
  const base = fileName.replace(/\.(ifc|ifczip|zip)$/i, '');
  const normalized = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase();
  const parts = normalized.split(/[_\-.\s]+/).filter(Boolean);
  const khop: { discipline: BimDiscipline; token: string }[] = [];
  // Cụm từ tiếng Việt hai âm tiết xét trước; âm tiết đã thuộc cụm thì không xét lẻ
  // (tránh hiểu "kết cấu", "cầu thang" thành công trình cầu)
  const daDung = new Set<number>();
  for (let i = parts.length - 2; i >= 0; i--) {
    const cum = COMPOUND_TOKENS[parts[i] + parts[i + 1]];
    if (cum) {
      khop.push({ discipline: cum, token: `${parts[i]} ${parts[i + 1]}` });
      daDung.add(i).add(i + 1);
    }
  }
  // Mã đơn — ưu tiên đoạn ở giữa/cuối (ISO 19650: Dự án_Khởi tạo_Đơn vị_Bộ môn_Tầng_Loại)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (daDung.has(i)) continue;
    const nhom = NAME_TOKENS.find(({ tokens }) => tokens.includes(parts[i]));
    if (nhom) khop.push({ discipline: nhom.discipline, token: parts[i] });
  }
  // Tên vừa có bộ môn (kết cấu, kiến trúc, MEP...) vừa có loại công trình (cầu, hầm, nhà ga) → bộ môn thắng
  return khop.find((k) => BO_MON_CHUYEN_NGANH.includes(k.discipline)) || khop[0] || null;
};

const BO_MON_CHUYEN_NGANH: BimDiscipline[] = ['KIEN_TRUC', 'KET_CAU', 'MEP', 'THONG_TIN_TIN_HIEU'];

/** Đếm loại thực thể IFC trong đoạn văn bản STEP */
export const countIfcEntities = (text: string, counts: Record<string, number> = {}) => {
  const re = /=\s*(IFC[A-Z0-9]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const type = m[1];
    if (ENTITY_WEIGHTS[type]) counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
};

/** Kết hợp tên file + thống kê thực thể → bộ môn (kèm hệ thống MEP con nếu là cơ điện) */
export const decideDiscipline = (fileName: string, counts: Record<string, number>): DisciplineDetection | null => {
  const kq = decideDisciplineCore(fileName, counts);
  if (kq && kq.discipline === 'MEP') {
    const system = detectMepSystem(fileName, counts);
    if (system) return { ...kq, system };
  }
  return kq;
};

const decideDisciplineCore = (fileName: string, counts: Record<string, number>): DisciplineDetection | null => {
  const scores = {} as Record<BimDiscipline, number>;
  let total = 0;
  for (const [type, n] of Object.entries(counts)) {
    for (const [d, w] of Object.entries(ENTITY_WEIGHTS[type] || {})) {
      scores[d as BimDiscipline] = (scores[d as BimDiscipline] || 0) + n * (w as number);
      total += n * (w as number);
    }
  }
  const ranked = (Object.entries(scores) as [BimDiscipline, number][]).sort((a, b) => b[1] - a[1]);
  const byName = detectFromFileName(fileName);

  const top = ranked[0];
  const share = top && total > 0 ? top[1] / total : 0;
  const topTypes = Object.entries(counts)
    .filter(([t]) => top && (ENTITY_WEIGHTS[t]?.[top[0]] ?? 0) > 0)
    .sort((a, b) => b[1] * (ENTITY_WEIGHTS[b[0]]?.[top![0]] ?? 0) - a[1] * (ENTITY_WEIGHTS[a[0]]?.[top![0]] ?? 0))
    .slice(0, 3)
    .map(([t, n]) => `${t.replace(/^IFC/, '')} ×${formatNumber(n, 2)}`)
    .join(', ');

  // Công trình đặc thù (cầu/hầm/tuyến) nhận diện bằng thực thể không gian → ưu tiên tuyệt đối
  if (top && ['CAU', 'HAM', 'DUONG_RAY'].includes(top[0]) && share >= 0.3) {
    return { discipline: top[0], confidence: Math.min(0.95, 0.6 + share / 2), reason: `nội dung có ${topTypes}` };
  }

  if (byName && top && byName.discipline === top[0]) {
    return {
      discipline: byName.discipline,
      confidence: 0.95,
      reason: `tên file có mã "${byName.token}" và nội dung chủ yếu ${topTypes}`,
    };
  }
  // Nội dung áp đảo (≥ 65%) thắng tên file; tên file thắng khi nội dung không rõ ràng
  if (top && total >= 20 && share >= 0.65) {
    return {
      discipline: top[0],
      confidence: Math.min(0.9, share),
      reason: `${Math.round(share * 100)}% cấu kiện thuộc ${LABELS[top[0]].toLowerCase()} (${topTypes})${byName ? `; tên file gợi ý "${byName.token}" nhưng nội dung không khớp` : ''}`,
    };
  }
  if (byName) {
    return { discipline: byName.discipline, confidence: 0.75, reason: `tên file có mã bộ môn "${byName.token}"` };
  }
  // Nhiều bộ môn cùng lúc → mô hình tổng hợp
  if (top && total >= 20) {
    const second = ranked[1];
    if (second && second[1] / total >= 0.25) {
      return {
        discipline: 'TOAN_THE',
        confidence: 0.6,
        reason: `mô hình gồm nhiều bộ môn (${LABELS[top[0]]} ${Math.round(share * 100)}%, ${LABELS[second[0]]} ${Math.round((second[1] / total) * 100)}%)`,
      };
    }
    return {
      discipline: top[0],
      confidence: share,
      reason: `${Math.round(share * 100)}% cấu kiện thuộc ${LABELS[top[0]].toLowerCase()} (${topTypes})`,
    };
  }
  return null;
};

const CHUNK = 6 * 1024 * 1024;

/** Lấy mẫu nội dung: file .ifc đọc 5 đoạn rải đều; file nén đọc luồng giải nén ~40MB đầu */
const sampleText = async (file: File): Promise<string> => {
  const isZip = /\.(ifczip|zip)$/i.test(file.name);
  const decoder = new TextDecoder('latin1');

  if (!isZip) {
    if (file.size <= CHUNK * 5) return decoder.decode(await file.arrayBuffer());
    const parts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Math.floor(((file.size - CHUNK) * i) / 4);
      parts.push(decoder.decode(await file.slice(start, start + CHUNK).arrayBuffer()));
    }
    return parts.join('\n');
  }

  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const entry = Object.values(zip.files).find((f) => !f.dir && /\.ifc$/i.test(f.name));
  if (!entry) return '';
  const LIMIT = 40 * 1024 * 1024;
  return new Promise<string>((resolve) => {
    const chunks: string[] = [];
    let size = 0;
    let done = false;
    // internalStream có trong JSZip nhưng thiếu trong khai báo kiểu
    const stream = (entry as any).internalStream('uint8array');
    const finish = () => {
      if (done) return;
      done = true;
      try {
        stream.pause();
      } catch {
        // ignore
      }
      resolve(chunks.join(''));
    };
    stream
      .on('data', (data: Uint8Array) => {
        if (done) return;
        chunks.push(decoder.decode(data, { stream: true }));
        size += data.length;
        if (size >= LIMIT) finish();
      })
      .on('error', finish)
      .on('end', finish)
      .resume();
  });
};

/** Nhận diện bộ môn cho file người dùng chọn (chạy trên trình duyệt) */
export const detectDiscipline = async (file: File): Promise<DisciplineDetection | null> => {
  let counts: Record<string, number> = {};
  try {
    counts = countIfcEntities(await sampleText(file));
  } catch (err) {
    console.warn('[BIM] Không đọc được nội dung để nhận diện bộ môn:', err);
  }
  return decideDiscipline(file.name, counts);
};
