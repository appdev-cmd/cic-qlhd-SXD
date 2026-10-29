// features/bim/lib/vietnameseBimMap.ts
// Từ điển ánh xạ nghiệp vụ chuyên sâu Cấu kiện BIM tiếng Việt ↔ Lớp chuẩn openBIM IFC & Tên cấu kiện phần mềm (Revit/Tekla)
// Đảm bảo AI và người dùng tìm kiếm tự nhiên bằng tiếng Việt ("các cột", "dầm", "toàn bộ sàn", "vách kính", "ống nước"...)
// đều khớp 100% với dữ liệu bóc tách trong CSDL.

export const normalizeVi = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export interface BimCategoryMapping {
  /** Tên tiếng Việt chuẩn có dấu (chuẩn TCVN / Nghị định 217/2026/NĐ-CP) */
  canonicalVi: string;
  /** Các lớp IFC tương ứng trong database (viết hoa chuẩn) */
  ifcClasses: string[];
  /** Các từ đồng nghĩa, biến thể số nhiều, tiếng lóng công trường tiếng Việt */
  synonyms: string[];
  /** Các mẫu tên tiếng Anh thường gặp do Revit / Tekla / ArchiCAD xuất ra */
  namePatterns: string[];
  /** Bộ môn chính */
  discipline: 'KET_CAU' | 'KIEN_TRUC' | 'MEP' | 'TOAN_THE';
}

export const VIETNAMESE_BIM_CATEGORIES: Record<string, BimCategoryMapping> = {
  cot: {
    canonicalVi: 'Cột / Trụ chịu lực',
    ifcClasses: ['IFCCOLUMN', 'IFCCOLUMNTYPE'],
    synonyms: [
      'cot',
      'cac cot',
      'nhung cot',
      'toan bo cot',
      'he thong cot',
      'tru',
      'cac tru',
      'cot chiu luc',
      'cot be tong',
      'cot thep',
      'cot tron',
      'cot vuong',
      'tru cau',
      'pillar',
      'column',
      'columns',
      'col',
    ],
    namePatterns: ['column', 'col', 'cot', 'tru', 'conc_col', 'steel_col'],
    discipline: 'KET_CAU',
  },
  dam: {
    canonicalVi: 'Dầm / Giằng kết cấu',
    ifcClasses: ['IFCBEAM', 'IFCMEMBER', 'IFCBEAMTYPE'],
    synonyms: [
      'dam',
      'cac dam',
      'nhung dam',
      'toan bo dam',
      'he thong dam',
      'giang',
      'cac giang',
      'dam chinh',
      'dam phu',
      'dam san',
      'dam mong',
      'dam be tong',
      'dam thep',
      'beam',
      'beams',
      'girder',
      'framing',
      'joist',
    ],
    namePatterns: ['beam', 'girder', 'framing', 'dam', 'giang', 'm_framing'],
    discipline: 'KET_CAU',
  },
  san: {
    canonicalVi: 'Sàn / Bản mặt cầu / Bản đáy',
    ifcClasses: ['IFCSLAB', 'IFCSLABTYPE'],
    synonyms: [
      'san',
      'cac san',
      'nhung san',
      'toan bo san',
      'he thong san',
      'ban san',
      'tam san',
      'mat san',
      'san be tong',
      'san lau',
      'ban mat cau',
      'slab',
      'slabs',
      'floor',
      'floors',
    ],
    namePatterns: ['slab', 'floor', 'san', 'ban_san'],
    discipline: 'KET_CAU',
  },
  tuong: {
    canonicalVi: 'Tường / Vách ngăn',
    ifcClasses: ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLTYPE'],
    synonyms: [
      'tuong',
      'cac tuong',
      'nhung tuong',
      'toan bo tuong',
      'he thong tuong',
      'vach',
      'cac vach',
      'vach ngan',
      'tuong gach',
      'tuong be tong',
      'tuong bao',
      'wall',
      'walls',
      'basic wall',
    ],
    namePatterns: ['wall', 'tuong', 'vach', 'basic_wall'],
    discipline: 'KIEN_TRUC',
  },
  vach_kinh: {
    canonicalVi: 'Tường kính / Vách kính mặt dựng',
    ifcClasses: ['IFCCURTAINWALL'],
    synonyms: [
      'vach kinh',
      'cac vach kinh',
      'tuong kinh',
      'mat dung',
      'mat dung kinh',
      'curtain wall',
      'curtainwall',
      'glazing',
    ],
    namePatterns: ['curtain', 'glaz', 'vach_kinh', 'kinh'],
    discipline: 'KIEN_TRUC',
  },
  mong: {
    canonicalVi: 'Móng / Bệ mố trụ',
    ifcClasses: ['IFCFOOTING', 'IFCFOOTINGTYPE'],
    synonyms: [
      'mong',
      'cac mong',
      'be mong',
      'dai mong',
      'mong don',
      'mong bang',
      'mong be',
      'be mo',
      'be tru',
      'footing',
      'foundation',
      'pad foundation',
      'strip foundation',
    ],
    namePatterns: ['footing', 'foundation', 'mong', 'be_mong', 'dai_mong'],
    discipline: 'KET_CAU',
  },
  coc: {
    canonicalVi: 'Cọc bê tông / Cọc khoan nhồi',
    ifcClasses: ['IFCPILE', 'IFCPILETYPE'],
    synonyms: ['coc', 'cac coc', 'coc khoan nhoi', 'coc ep', 'coc ly tam', 'he coc', 'pile', 'piles'],
    namePatterns: ['pile', 'coc', 'bore_pile'],
    discipline: 'KET_CAU',
  },
  cua_di: {
    canonicalVi: 'Cửa đi',
    ifcClasses: ['IFCDOOR', 'IFCDOORTYPE'],
    synonyms: ['cua di', 'cac cua di', 'cua', 'cac cua', 'cua phong', 'cua ra vao', 'cua chong chay', 'door', 'doors'],
    namePatterns: ['door', 'cua_di', 'cua'],
    discipline: 'KIEN_TRUC',
  },
  cua_so: {
    canonicalVi: 'Cửa sổ',
    ifcClasses: ['IFCWINDOW', 'IFCWINDOWTYPE'],
    synonyms: ['cua so', 'cac cua so', 'o cua so', 'window', 'windows'],
    namePatterns: ['window', 'cua_so'],
    discipline: 'KIEN_TRUC',
  },
  cau_thang: {
    canonicalVi: 'Cầu thang / Vế thang',
    ifcClasses: ['IFCSTAIR', 'IFCSTAIRFLIGHT'],
    synonyms: [
      'cau thang',
      'cac cau thang',
      'thang',
      'cac thang',
      've thang',
      'bac thang',
      'stair',
      'stairs',
      'stairflight',
      'staircase',
    ],
    namePatterns: ['stair', 'thang', 'flight'],
    discipline: 'KIEN_TRUC',
  },
  lan_can: {
    canonicalVi: 'Lan can / Tay vịn / Hàng rào',
    ifcClasses: ['IFCRAILING', 'IFCRAILINGTYPE'],
    synonyms: ['lan can', 'cac lan can', 'tay vin', 'hang rao', 'railing', 'railings', 'handrail'],
    namePatterns: ['railing', 'lan_can', 'handrail'],
    discipline: 'KIEN_TRUC',
  },
  mai: {
    canonicalVi: 'Mái công trình',
    ifcClasses: ['IFCROOF'],
    synonyms: ['mai', 'cac mai', 'mai nha', 'mai don', 'mai che', 'mai san', 'roof', 'roofs'],
    namePatterns: ['roof', 'mai'],
    discipline: 'KIEN_TRUC',
  },
  ong_nuoc: {
    canonicalVi: 'Đoạn ống cấp thoát nước / PCCC',
    ifcClasses: ['IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCFLOWSEGMENT', 'IFCFLOWFITTING'],
    synonyms: [
      'ong',
      'cac ong',
      'duong ong',
      'ong nuoc',
      'ong cap nuoc',
      'ong thoat nuoc',
      'ong pccc',
      'ong thep',
      'pipe',
      'pipes',
      'piping',
      'pipe segment',
      'pipe fitting',
    ],
    namePatterns: ['pipe', 'ong', 'plumb', 'drain', 'pccc'],
    discipline: 'MEP',
  },
  ong_gio: {
    canonicalVi: 'Ống thông gió / Cút tê ống gió',
    ifcClasses: ['IFCDUCTSEGMENT', 'IFCDUCTFITTING'],
    synonyms: [
      'ong gio',
      'cac ong gio',
      'duong ong gio',
      'thong gio',
      'hut mui',
      'dieu hoa',
      'duct',
      'ducts',
      'ductwork',
    ],
    namePatterns: ['duct', 'ong_gio', 'vent'],
    discipline: 'MEP',
  },
  thiet_bi_mep: {
    canonicalVi: 'Thiết bị đầu cuối / Van / Bơm / Quạt',
    ifcClasses: ['IFCFLOWTERMINAL', 'IFCVALVE', 'IFCPUMP', 'IFCFAN', 'IFCFLOWCONTROLLER'],
    synonyms: [
      'thiet bi',
      'van',
      'cac van',
      'may bom',
      'bom',
      'quat',
      'mieng gio',
      'dau phun',
      'valve',
      'pump',
      'fan',
      'terminal',
      'sprinkler',
    ],
    namePatterns: ['valve', 'pump', 'fan', 'terminal', 'sprinkler', 'van', 'bom'],
    discipline: 'MEP',
  },
  dien_chieu_sang: {
    canonicalVi: 'Thiết bị chiếu sáng / Đèn / Máng cáp / Tủ điện',
    ifcClasses: [
      'IFCLIGHTFIXTURE',
      'IFCDISTRIBUTIONBOARD',
      'IFCCABLESEGMENT',
      'IFCCABLECARRIERSEGMENT',
      'IFCDISTRIBUTIONCONTROLELEMENT',
      'IFCSWITCHINGDEVICE',
      'IFCTRANSFORMER',
      'IFCELECTRICMOTOR',
    ],
    synonyms: [
      'dien',
      'he thong dien',
      'den',
      'cac den',
      'chieu sang',
      'tu dien',
      'mang cap',
      'thang cap',
      'day dien',
      'day cap',
      'cong tac',
      'o cam',
      'tram bien ap',
      'light',
      'lighting',
      'cable',
      'panelboard',
    ],
    namePatterns: ['light', 'den', 'cable', 'tray', 'panel', 'dien', 'switch'],
    discipline: 'MEP',
  },
  tam_thep: {
    canonicalVi: 'Bản thép / Tấm thép / Thanh liên kết',
    ifcClasses: ['IFCPLATE', 'IFCMEMBER', 'IFCELEMENTASSEMBLY'],
    synonyms: [
      'ban thep',
      'cac ban thep',
      'tam thep',
      'thanh giang',
      'ban ma',
      'khung thep',
      'plate',
      'member',
      'truss',
    ],
    namePatterns: ['plate', 'member', 'ban_thep', 'ban_ma'],
    discipline: 'KET_CAU',
  },
};

/** Loại bỏ các từ dừng, tiền tố câu hỏi hoặc hành động thường gặp của người dùng */
export const stripVietnameseActionWords = (text: string): string => {
  let s = normalizeVi(text);
  // Loại bỏ nội dung trong ngoặc đơn/kép như (cô lập giúp tôi), [xem giúp]
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // Loại bỏ dấu câu đặc biệt
  s = s.replace(/[,;:.?!~]/g, ' ');
  // Loại bỏ các cụm vị trí ngữ cảnh
  s = s.replace(/\b(tren\s+mo\s+hinh|trong\s+mo\s+hinh|toan\s+cong\s+trinh|toan\s+bo|cua\s+du\s+an)\b/g, ' ');
  // Loại bỏ các tiền tố hành động
  s = s.replace(/^(hay\s+|xin\s+|lam\s+on\s+|vui\s+long\s+)/g, '');
  s = s.replace(
    /^(chi\s+hien|hien\s+thi|cho\s+toi\s+xem|co\s+lap|co\s+lap\s+giup\s+toi|xem|tim|loc|bat|mo|to\s+mau|x-ray|nhin\s+xuyen\s+thau)\s+/g,
    '',
  );
  // Loại bỏ hậu tố phụ trợ
  s = s.replace(/\s+(giup\s+toi|giup|nhe|di|duoc\s+khong)$/g, '');
  return s.replace(/\s+/g, ' ').trim();
};

export interface BimCategoryMatch {
  key: string;
  mapping: BimCategoryMapping;
  /** Cụm từ đồng nghĩa đã khớp (dạng không dấu, chữ thường) */
  phrase: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tìm nhóm cấu kiện khớp dài nhất trong câu (không phân biệt dấu, hoa/thường).
 * Dùng chung cho tìm kiếm cây, tìm kiếm CSDL và gợi ý giá trị bộ chọn.
 */
export function matchBimCategory(text: string): BimCategoryMatch | null {
  const norm = normalizeVi(text).replace(/\s+/g, ' ');
  if (!norm) return null;
  let best: BimCategoryMatch | null = null;
  for (const [key, mapping] of Object.entries(VIETNAMESE_BIM_CATEGORIES)) {
    for (const syn of mapping.synonyms) {
      const phrase = normalizeVi(syn);
      if (best && phrase.length <= best.phrase.length) continue;
      const re = new RegExp(`(^|\\s)${escapeRegex(phrase).replace(/\s+/g, '\\s+')}(\\s|$)`);
      if (re.test(norm)) best = { key, mapping, phrase };
    }
  }
  return best;
}

/** Gợi ý giá trị tiếng Việt cho trường `loai_cau_kien` từ lớp IFC (VD IFCCOLUMN → "Cột / Trụ chịu lực") */
export function categoryForIfcClass(ifcClass: string): BimCategoryMapping | null {
  const cls = String(ifcClass || '').toUpperCase();
  return Object.values(VIETNAMESE_BIM_CATEGORIES).find((c) => c.ifcClasses.includes(cls)) || null;
}

export interface ResolvedBimQuery {
  /** Danh sách IFC classes để lọc chính xác trong `loai_cau_kien` */
  ifcClasses: string[] | null;
  /** Danh sách từ khóa tên (English / tiếng Việt) để tìm bổ sung */
  namePatterns: string[];
  /** Tên danh mục tiếng Việt chuẩn hóa */
  canonicalVi: string | null;
  /** Từ khóa riêng còn lại (VD "C1", "1100x1100", "tầng 1") sau khi đã tách bỏ loại cấu kiện */
  residualKeyword: string | null;
  /** Bộ môn liên quan nếu suy đoán được */
  discipline?: 'KET_CAU' | 'KIEN_TRUC' | 'MEP' | 'TOAN_THE';
}

/**
 * Hàm phân tích thông minh: nhận vào `loai_cau_kien` và/hoặc `keyword` (thậm chí người dùng gõ lẫn lộn).
 * Tự động ánh xạ sang chuẩn IFC và tách từ khóa phụ.
 */
export function resolveBimElementQuery(args: { loai_cau_kien?: unknown; keyword?: unknown }): ResolvedBimQuery {
  const rawCat = String(args.loai_cau_kien ?? '').trim();
  const rawKw = String(args.keyword ?? '').trim();

  // 1. Kiểm tra nếu truyền thẳng lớp IFC chuẩn (VD IFCCOLUMN)
  if (rawCat && /^ifc/i.test(rawCat)) {
    const cls = rawCat.toUpperCase();
    const entry = Object.values(VIETNAMESE_BIM_CATEGORIES).find((c) => c.ifcClasses.includes(cls));
    return {
      ifcClasses: entry ? entry.ifcClasses : [cls],
      namePatterns: entry ? entry.namePatterns : [],
      canonicalVi: entry ? entry.canonicalVi : cls,
      residualKeyword: rawKw && !/^ifc/i.test(rawKw) ? rawKw : null,
      discipline: entry?.discipline,
    };
  }

  // 2. Gom các chuỗi đầu vào để bóc tách từ ngữ tiếng Việt
  const textToScan = [rawCat, rawKw].filter(Boolean).join(' ');
  if (!textToScan) {
    return {
      ifcClasses: null,
      namePatterns: [],
      canonicalVi: null,
      residualKeyword: null,
    };
  }

  const norm = normalizeVi(textToScan);
  const stripped = stripVietnameseActionWords(norm);

  // 3. Quét qua từ điển danh mục cấu kiện
  let bestMatchKey: string | null = null;
  let bestMatchScore = 0;
  let matchedPhrase = '';

  for (const [key, item] of Object.entries(VIETNAMESE_BIM_CATEGORIES)) {
    for (const syn of item.synonyms) {
      const synNorm = normalizeVi(syn);
      // Khớp chính xác hoàn toàn chuỗi
      if (stripped === synNorm || norm === synNorm) {
        if (synNorm.length > bestMatchScore) {
          bestMatchScore = synNorm.length + 10;
          bestMatchKey = key;
          matchedPhrase = synNorm;
        }
      }
      // Khớp từ độc lập nằm trong câu (sử dụng word boundary)
      const regex = new RegExp(`(^|\\s)${synNorm.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
      if (regex.test(stripped) || regex.test(norm)) {
        if (synNorm.length > bestMatchScore) {
          bestMatchScore = synNorm.length;
          bestMatchKey = key;
          matchedPhrase = synNorm;
        }
      }
    }
  }

  if (bestMatchKey) {
    const matched = VIETNAMESE_BIM_CATEGORIES[bestMatchKey];
    // Tách từ khóa còn lại (nếu người dùng gõ "cột C1" -> residualKeyword là "C1")
    let residual = stripped
      .replace(new RegExp(matchedPhrase.replace(/\s+/g, '\\s+'), 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Loại bỏ các từ rác / từ dừng còn sót lại
    residual = residual
      .replace(/^(cac|nhung|toan bo|he thong|tat ca|loai|cau kien)\s+/g, '')
      .replace(/\s+(tren mo hinh|trong mo hinh|cua du an|giup toi|nhe|di)$/g, '')
      .trim();

    // Nếu residual chỉ trùng lại với các từ đồng nghĩa của nhóm cấu kiện này thì xóa bỏ
    if (residual && matched.synonyms.some((s) => normalizeVi(s) === residual)) {
      residual = '';
    }

    return {
      ifcClasses: matched.ifcClasses,
      namePatterns: matched.namePatterns,
      canonicalVi: matched.canonicalVi,
      residualKeyword: residual || null,
      discipline: matched.discipline,
    };
  }

  // 4. Nếu không khớp từ điển định sẵn, giữ nguyên từ khóa để tìm kiếm text tự do
  return {
    ifcClasses: null,
    namePatterns: [],
    canonicalVi: null,
    residualKeyword: rawKw || rawCat || null,
  };
}
