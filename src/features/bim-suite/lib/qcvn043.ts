import { formatNumber, formatDateTime } from '@/lib/utils';
// Preliminary check against QCVN 04-3:2026/BXD (Thông tư 61/2026/TT-BXD of 30/7/2026, in force 01/02/2027, replaces
// QCVN 09:2017/BXD); table values checked against the text in src/lib/legalSearchIndex.json. A model review aid only.

export const QCVN043 = {
  ten: 'QCVN 04-3:2026/BXD',
  van_ban: 'Thông tư 61/2026/TT-BXD ngày 30/7/2026',
  hieu_luc: '2027-02-01',
  /** 1.1.1: tổng diện tích sàn từ 2.500 m² */
  dien_tich_ap_dung_m2: 2500,
  /** 2.1.2 a */
  r0_tuong_min: 0.56,
  r0_mai_min: 1.0,
  /** 2.1.2 c (đường thay thế) */
  ottv_tuong_max: 60,
  ottv_mai_max: 25,
  /** 2.1.2 b: kính mái */
  shgc_kinh_mai_max: 0.3,
} as const;

export type FacadeColumn = 'bac' | 'nam' | 'khac';
export const COLUMN_LABELS: Record<FacadeColumn, string> = {
  bac: 'Hướng Bắc',
  nam: 'Hướng Nam',
  khac: 'Các hướng còn lại',
};

/** Bảng 1: SHGC tối đa theo WWR (%) của từng mặt đứng. */
export const SHGC_TABLE: { wwr: number; bac: number; nam: number; khac: number }[] = [
  { wwr: 20, bac: 0.9, nam: 0.9, khac: 0.8 },
  { wwr: 30, bac: 0.64, nam: 0.7, khac: 0.58 },
  { wwr: 40, bac: 0.5, nam: 0.56, khac: 0.46 },
  { wwr: 50, bac: 0.4, nam: 0.45, khac: 0.38 },
  { wwr: 60, bac: 0.33, nam: 0.39, khac: 0.32 },
  { wwr: 70, bac: 0.27, nam: 0.33, khac: 0.27 },
  { wwr: 80, bac: 0.23, nam: 0.28, khac: 0.23 },
  { wwr: 90, bac: 0.2, nam: 0.25, khac: 0.2 },
  { wwr: 100, bac: 0.17, nam: 0.22, khac: 0.17 },
];

/** SHGC tối đa (Bảng 1, nội suy tuyến tính theo công thức A.2). Làm tròn xuống 2 chữ số như ví dụ Phụ lục A (0,796 → 0,79).
 * WWR dưới 20% lấy dòng 20%; `a` là hệ số che nắng (Bảng 2, 3), mặc định 1. */
export function maxShgc(wwrPct: number, col: FacadeColumn, a = 1): number {
  const t = SHGC_TABLE;
  const w = Math.min(100, Math.max(20, wwrPct));
  let v = t[t.length - 1][col];
  for (let i = 0; i + 1 < t.length; i++) {
    if (w >= t[i].wwr && w <= t[i + 1].wwr) {
      v = t[i][col] + ((w - t[i].wwr) * (t[i + 1][col] - t[i][col])) / (t[i + 1].wwr - t[i].wwr);
      break;
    }
  }
  return Math.floor(v * a * 100 + 1e-9) / 100;
}

/** 8 mặt đứng theo phương vị pháp tuyến (độ, từ Bắc thật theo chiều kim đồng hồ). Bắc, Nam: ±22,5° quanh trục chính (2.1.2 b). */
export const FACADES = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'] as const;
export type Facade = (typeof FACADES)[number];
export const facadeOf = (azimuthDeg: number): Facade =>
  FACADES[Math.floor((((azimuthDeg % 360) + 360 + 22.5) % 360) / 45)];
export const columnOf = (f: Facade): FacadeColumn => (f === 'Bắc' ? 'bac' : f === 'Nam' ? 'nam' : 'khac');
/** Phương vị pháp tuyến (x, z trình xem) so với Bắc thật; Bắc thật = −Z trình xem quay `north` độ (cùng quy ước phân tích nắng). */
export const normalAzimuth = (nx: number, nz: number, north = 0) =>
  ((((Math.atan2(nx, -nz) * 180) / Math.PI - north) % 360) + 360) % 360;

/** Lớp IFC được tính là phần xuyên sáng / không xuyên sáng của vỏ; lớp khác (cây, bó vỉa, MEP, đồ đạc) không tính. */
export const GLAZING_CLASSES = new Set(['IFCCURTAINWALL', 'IFCWINDOW', 'IFCPLATE']);
export const OPAQUE_CLASSES = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCCOVERING',
  'IFCCOLUMN',
  'IFCSLAB',
  'IFCBEAM',
  'IFCDOOR',
]);
export type EnvelopeKind = 'kinh' | 'dac' | null;
export function envelopeKind(ifcClass: string | null | undefined, name?: string | null): EnvelopeKind {
  const c = (ifcClass ?? '').toUpperCase();
  if (/SITE/i.test(name ?? '')) return null;
  if (GLAZING_CLASSES.has(c)) return 'kinh';
  if (OPAQUE_CLASSES.has(c)) return 'dac';
  return null;
}

export interface FacadeSample {
  azimuth: number;
  area: number;
  kind: Exclude<EnvelopeKind, null>;
}
export interface FacadeWwr {
  mat: Facade;
  cot: FacadeColumn;
  dien_tich: number;
  dien_tich_kinh: number;
  wwr: number;
  shgc_toi_da: number;
}

/** WWR từng mặt đứng (2.1.2 b, "WWR tính cho từng mặt đứng") và SHGC tối đa tương ứng. Bỏ mặt có tổng diện tích < `minArea` m². */
export function facadeWwr(samples: FacadeSample[], minArea = 20): FacadeWwr[] {
  const acc = new Map<Facade, { a: number; g: number }>();
  for (const s of samples) {
    const f = facadeOf(s.azimuth);
    const x = acc.get(f) ?? { a: 0, g: 0 };
    x.a += s.area;
    if (s.kind === 'kinh') x.g += s.area;
    acc.set(f, x);
  }
  return FACADES.filter((f) => (acc.get(f)?.a ?? 0) >= minArea).map((f) => {
    const { a, g } = acc.get(f)!;
    const wwr = Math.round((g / a) * 1000) / 10;
    return {
      mat: f,
      cot: columnOf(f),
      dien_tich: Math.round(a),
      dien_tich_kinh: Math.round(g),
      wwr,
      shgc_toi_da: maxShgc(wwr, columnOf(f)),
    };
  });
}

/** Bảng 6: COP tối thiểu của chiller (kW/kW). Chiller piston giải nhiệt nước theo yêu cầu của chiller xoắn ốc, trục vít. */
export const CHILLER_TYPES = {
  gio: 'Giải nhiệt gió, chạy điện',
  truc_vit: 'Xoắn ốc, trục vít, piston giải nhiệt nước',
  ly_tam: 'Ly tâm, giải nhiệt nước',
  hap_thu_gio_1: 'Hấp thụ giải nhiệt gió, 1 cấp',
  hap_thu_nuoc_1: 'Hấp thụ giải nhiệt nước, 1 cấp',
  hap_thu_2: 'Hấp thụ 2 cấp (đốt gián tiếp hoặc trực tiếp)',
} as const;
export type ChillerType = keyof typeof CHILLER_TYPES;
export function minChillerCop(type: ChillerType, capacityKw: number | null): number | null {
  switch (type) {
    case 'gio':
      return 2.8;
    case 'hap_thu_gio_1':
      return 0.6;
    case 'hap_thu_nuoc_1':
      return 0.7;
    case 'hap_thu_2':
      return 1.0;
    case 'truc_vit':
      if (capacityKw === null) return null;
      return capacityKw < 264 ? 4.51 : capacityKw < 528 ? 4.53 : capacityKw < 1055 ? 5.17 : 5.67;
    case 'ly_tam':
      if (capacityKw === null) return null;
      return capacityKw < 1055 ? 5.55 : capacityKw < 2110 ? 6.11 : 6.17;
  }
}

/** Bảng 7: mật độ công suất chiếu sáng tối đa (W/m²). Chung cư được thay bằng thiết bị dán nhãn năng lượng. */
export const LPD_LIMITS = {
  van_phong: { label: 'Văn phòng làm việc', lpd: 11 },
  khach_san: { label: 'Khách sạn', lpd: 11 },
  benh_vien: { label: 'Bệnh viện', lpd: 13 },
  truong_hoc: { label: 'Trường học', lpd: 12 },
  thuong_mai: { label: 'Trung tâm thương mại', lpd: 16 },
  chung_cu: { label: 'Nhà chung cư', lpd: 8 },
} as const;
export type BuildingType = keyof typeof LPD_LIMITS;

export type CheckStatus = 'dat' | 'khong_dat' | 'chua_co';
export const CHECK_LABELS: Record<CheckStatus, string> = {
  dat: 'Đạt',
  khong_dat: 'Không đạt',
  chua_co: 'Chưa có dữ liệu',
};
/** Màu trạng thái dành riêng (đạt / không đạt / chưa có), luôn kèm biểu tượng và chữ. */
export const STATUS_COLOR: Record<CheckStatus, string> = { dat: '#16a34a', khong_dat: '#dc2626', chua_co: '#94a3b8' };
export interface CheckRow {
  ma: string;
  noi_dung: string;
  dieu: string;
  yeu_cau: string;
  thuc_te: string;
  trang_thai: CheckStatus;
  ghi_chu?: string;
}

/** Thông số thiết kế nhập theo dự án (bảng bim_6d_qcvn_dau_vao), mọi giá trị có thể null = chưa có nguồn. */
export interface QcvnInputs {
  loai_cong_trinh: BuildingType | null;
  shgc_kinh: number | null;
  u_tuong: number | null;
  r0_tuong: number | null;
  u_mai: number | null;
  r0_mai: number | null;
  chiller_loai: ChillerType | null;
  chiller_cong_suat_kw: number | null;
  chiller_cop: number | null;
  lpd_thiet_ke: number | null;
  nguon: string | null;
}

const n2 = (v: number, d = 2) => formatNumber(v, d);
/** R0 lấy trực tiếp, hoặc 1/U khi chỉ có hệ số truyền nhiệt (đã gồm nhiệt trở bề mặt). */
export const r0Of = (r0: number | null, u: number | null) => (r0 != null ? r0 : u != null && u > 0 ? 1 / u : null);

export interface QcvnContext {
  dien_tich_san: number | null;
  so_thang_dien: number;
  facades: FacadeWwr[] | null;
  nguon?: Partial<Record<keyof QcvnInputs, 'mo_hinh' | 'du_an'>>;
}
const SRC_LABEL = { mo_hinh: 'theo mô hình', du_an: 'theo thông số dự án' } as const;

/** Lập bảng kiểm tra; thiếu dữ liệu ghi "Chưa có dữ liệu", không suy ra Đạt. */
export function qcvnChecklist(input: QcvnInputs, ctx: QcvnContext): CheckRow[] {
  const rows: CheckRow[] = [];
  const area = ctx.dien_tich_san;
  const src = (...keys: (keyof QcvnInputs)[]) => {
    const k = keys.find((x) => ctx.nguon?.[x]);
    return k ? ` (${SRC_LABEL[ctx.nguon![k]!]})` : '';
  };
  rows.push({
    ma: '1.1',
    noi_dung: 'Thuộc phạm vi điều chỉnh',
    dieu: '1.1.1',
    yeu_cau: `Tổng diện tích sàn ≥ ${n2(QCVN043.dien_tich_ap_dung_m2, 0)} m²`,
    thuc_te: area == null ? 'chưa có diện tích sàn' : `${n2(area, 0)} m²`,
    trang_thai: area == null ? 'chua_co' : 'dat',
    ghi_chu: area != null && area < QCVN043.dien_tich_ap_dung_m2 ? 'Dưới 2.500 m²: không bắt buộc áp dụng.' : undefined,
  });
  const rw = r0Of(input.r0_tuong, input.u_tuong);
  rows.push({
    ma: '2.1.2a-T',
    noi_dung: 'Nhiệt trở tường bao che (phần không xuyên sáng)',
    dieu: '2.1.2 a',
    yeu_cau: `R0 ≥ ${n2(QCVN043.r0_tuong_min)} m²·K/W`,
    thuc_te: rw == null ? 'chưa có' : `${n2(rw)} m²·K/W${src('r0_tuong', 'u_tuong')}`,
    trang_thai: rw == null ? 'chua_co' : rw >= QCVN043.r0_tuong_min ? 'dat' : 'khong_dat',
  });
  const rm = r0Of(input.r0_mai, input.u_mai);
  rows.push({
    ma: '2.1.2a-M',
    noi_dung: 'Nhiệt trở mái (độ dốc < 15°)',
    dieu: '2.1.2 a',
    yeu_cau: `R0 ≥ ${n2(QCVN043.r0_mai_min)} m²·K/W`,
    thuc_te: rm == null ? 'chưa có' : `${n2(rm)} m²·K/W${src('r0_mai', 'u_mai')}`,
    trang_thai: rm == null ? 'chua_co' : rm >= QCVN043.r0_mai_min ? 'dat' : 'khong_dat',
  });
  if (!ctx.facades) {
    rows.push({
      ma: '2.1.2b',
      noi_dung: 'SHGC kính theo WWR từng mặt đứng',
      dieu: '2.1.2 b, Bảng 1',
      yeu_cau: 'SHGC ≤ giá trị Bảng 1',
      thuc_te: 'chưa tính WWR (chạy trên mô hình)',
      trang_thai: 'chua_co',
    });
  } else {
    for (const f of ctx.facades) {
      const s = input.shgc_kinh;
      rows.push({
        ma: `2.1.2b-${f.mat}`,
        noi_dung: `SHGC kính mặt ${f.mat} (WWR ${n2(f.wwr, 1)}%)`,
        dieu: '2.1.2 b, Bảng 1',
        yeu_cau: `SHGC ≤ ${n2(f.shgc_toi_da, 2)} (${COLUMN_LABELS[f.cot].toLowerCase()})`,
        thuc_te: s == null ? 'chưa có SHGC thiết kế' : `${n2(s, 2)}${src('shgc_kinh')}`,
        trang_thai: s == null ? 'chua_co' : s <= f.shgc_toi_da + 1e-9 ? 'dat' : 'khong_dat',
      });
    }
  }
  const copMin = input.chiller_loai ? minChillerCop(input.chiller_loai, input.chiller_cong_suat_kw) : null;
  rows.push({
    ma: '2.2.3a',
    noi_dung: input.chiller_loai
      ? `COP chiller: ${CHILLER_TYPES[input.chiller_loai].toLowerCase()}${input.chiller_cong_suat_kw ? `, ${n2(input.chiller_cong_suat_kw, 0)} kW` : ''}`
      : 'COP chiller',
    dieu: '2.2.3 a, Bảng 6',
    yeu_cau: copMin == null ? 'COP ≥ giá trị Bảng 6 theo loại, năng suất' : `COP ≥ ${n2(copMin)} kW/kW`,
    thuc_te: input.chiller_cop == null ? 'chưa có' : `${n2(input.chiller_cop)} kW/kW${src('chiller_cop')}`,
    trang_thai:
      copMin == null || input.chiller_cop == null ? 'chua_co' : input.chiller_cop >= copMin ? 'dat' : 'khong_dat',
  });
  const lim = input.loai_cong_trinh ? LPD_LIMITS[input.loai_cong_trinh] : null;
  rows.push({
    ma: '2.3.2.2',
    noi_dung: 'Mật độ công suất chiếu sáng',
    dieu: '2.3.2.2, Bảng 7',
    yeu_cau: lim ? `LPD ≤ ${lim.lpd} W/m² (${lim.label.toLowerCase()})` : 'LPD ≤ giá trị Bảng 7 theo loại công trình',
    thuc_te: input.lpd_thiet_ke == null ? 'chưa có' : `${n2(input.lpd_thiet_ke, 1)} W/m²${src('lpd_thiet_ke')}`,
    trang_thai: !lim || input.lpd_thiet_ke == null ? 'chua_co' : input.lpd_thiet_ke <= lim.lpd ? 'dat' : 'khong_dat',
    ghi_chu:
      input.loai_cong_trinh === 'chung_cu'
        ? 'Chung cư được dùng thiết bị chiếu sáng dán nhãn năng lượng thay cho LPD.'
        : undefined,
  });
  rows.push({
    ma: '2.5',
    noi_dung: 'Đo đếm, lưu dữ liệu điện tiêu thụ theo tháng',
    dieu: '2.5.1, 2.5.2',
    yeu_cau: 'Có công tơ, dữ liệu kWh từng tháng; sau 12 tháng xác định chỉ số theo TCVN 13472:2022',
    thuc_te: `${ctx.so_thang_dien}/12 tháng có số đo điện`,
    trang_thai: ctx.so_thang_dien >= 12 ? 'dat' : 'chua_co',
  });
  return rows;
}

// ── Năng lượng quy đổi và cơ sở sử dụng năng lượng trọng điểm ──
/** Thông tư 02/2014/TT-BCT, Phụ lục I: 1 kWh điện = 0,0001543 TOE. */
export const TOE_PER_KWH = 0.0001543;
/** Nghị định 30/2026/NĐ-CP, Điều 3: trụ sở, văn phòng, nhà ở, khách sạn, TTTM… từ 500 TOE/năm. */
export const KEY_USER_TOE_BUILDING = 500;
export function keyEnergyUser(kwhYear: number | null) {
  if (kwhYear == null) return null;
  const toe = kwhYear * TOE_PER_KWH;
  return { toe: Math.round(toe * 10) / 10, nguong: KEY_USER_TOE_BUILDING, trong_diem: toe >= KEY_USER_TOE_BUILDING };
}

// ── So với đường cơ sở EDGE (giảm ≥ 20% mỗi trụ cột) ──
export const EDGE_MIN_SAVING = 20;
export interface EdgeBaseline {
  eui: number | null;
  wui: number | null;
  vat_lieu_m2: number | null;
  nguon: string | null;
}
export interface EdgePillar {
  tru_cot: 'nang_luong' | 'nuoc' | 'vat_lieu';
  nhan: string;
  co_so: number | null;
  thuc_te: number | null;
  giam_pct: number | null;
  dat: boolean | null;
  don_vi: string;
}
export function edgeSavings(
  b: EdgeBaseline,
  actual: { eui: number | null; wui: number | null; carbon_ngam_m2: number | null },
): EdgePillar[] {
  const pillar = (
    tru_cot: EdgePillar['tru_cot'],
    nhan: string,
    co_so: number | null,
    thuc_te: number | null,
    don_vi: string,
  ): EdgePillar => {
    const giam = co_so && co_so > 0 && thuc_te != null ? Math.round(((co_so - thuc_te) / co_so) * 1000) / 10 : null;
    return {
      tru_cot,
      nhan,
      co_so,
      thuc_te,
      giam_pct: giam,
      dat: giam == null ? null : giam >= EDGE_MIN_SAVING,
      don_vi,
    };
  };
  return [
    pillar('nang_luong', 'Năng lượng vận hành', b.eui, actual.eui, 'kWh/m²·năm'),
    pillar('nuoc', 'Nước', b.wui, actual.wui, 'm³/m²·năm'),
    pillar('vat_lieu', 'Vật liệu (tạm theo carbon hàm chứa)', b.vat_lieu_m2, actual.carbon_ngam_m2, 'kgCO₂e/m²'),
  ];
}

// ── Sổ kiểm toán năng lượng, kiểm kê khí nhà kính ──
export const AUDIT_TYPES = {
  kiem_toan_nang_luong: {
    label: 'Kiểm toán năng lượng',
    chu_ky: 3,
    can_cu: 'Luật SDNLTK&HQ (sửa đổi 2025), Nghị định 30/2026/NĐ-CP: cơ sở trọng điểm kiểm toán định kỳ',
  },
  kiem_ke_khi_nha_kinh: {
    label: 'Kiểm kê khí nhà kính',
    chu_ky: 2,
    can_cu: 'Nghị định 06/2022/NĐ-CP: cơ sở thuộc danh mục kiểm kê định kỳ',
  },
  bao_cao_nang_luong: {
    label: 'Báo cáo, kế hoạch sử dụng năng lượng năm',
    chu_ky: 1,
    can_cu: 'Nghị định 30/2026/NĐ-CP, Điều 5',
  },
} as const;
export type AuditType = keyof typeof AUDIT_TYPES;
/** Hạn kế tiếp = ngày thực hiện + chu kỳ (năm); trạng thái so với hôm nay (yyyy-mm-dd). */
export function auditDue(
  ngay: string,
  chuKyNam: number,
  today: string,
): { han: string; con_ngay: number; trang_thai: 'qua_han' | 'sap_den' | 'con_han' } {
  const [y, m, d] = ngay.split('-').map(Number);
  const due = new Date(Date.UTC(y + chuKyNam, m - 1, d));
  const han = due.toISOString().slice(0, 10);
  const con = Math.round((due.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { han, con_ngay: con, trang_thai: con < 0 ? 'qua_han' : con <= 180 ? 'sap_den' : 'con_han' };
}

// ── Thông số lấy từ mô hình: Pset chuẩn IFC trong bim_elements.thuoc_tinh (psets của cấu kiện, kieu.psets của kiểu) ──
export type PsetMap = Record<string, Record<string, unknown> | null | undefined>;
/** Pset đọc cho rà năng lượng; giá trị trên cấu kiện ưu tiên hơn giá trị trên kiểu. */
export const ENERGY_PSETS = [
  'Pset_DoorWindowGlazingType',
  'Pset_WindowCommon',
  'Pset_CurtainWallCommon',
  'Pset_WallCommon',
  'Pset_RoofCommon',
  'Pset_SlabCommon',
  'Pset_ChillerTypeCommon',
  'Pset_LightFixtureTypeCommon',
] as const;
/** Lớp IFC cần đọc (IFC2x3 dùng IfcEnergyConversionDevice / IfcFlowTerminal kèm kiểu IfcChillerType / IfcLightFixtureType). */
export const ENERGY_CLASSES = [
  'IFCCURTAINWALL',
  'IFCWINDOW',
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCROOF',
  'IFCSLAB',
  'IFCCHILLER',
  'IFCLIGHTFIXTURE',
  'IFCENERGYCONVERSIONDEVICE',
  'IFCFLOWTERMINAL',
] as const;
export interface ModelElementInput {
  loai_cau_kien: string;
  dien_tich: number | null;
  psets: PsetMap | null;
  kieu_psets: PsetMap | null;
  /** thuoc_tinh.kieu.loai, vd. IFCCHILLERTYPE */
  kieu_loai: string | null;
  /** PredefinedType (thuoc_tinh.thong_tin['Loại định nghĩa sẵn']) */
  predefined: string | null;
}
export type EnergyRole = 'kinh' | 'tuong' | 'mai' | 'chiller' | 'den';
export interface ModelEnergyRow {
  vai_tro: EnergyRole;
  dien_tich: number | null;
  shgc: number | null;
  /** W/m²·K */
  u: number | null;
  cop: number | null;
  /** kW */
  cong_suat_lanh: number | null;
  /** kW */
  cong_suat_dien: number | null;
}
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** Giá trị thuộc tính: cấu kiện trước, kiểu sau; theo thứ tự [Pset, thuộc tính] đã cho. */
const prop = (el: ModelElementInput, ...pairs: [string, string][]): unknown => {
  for (const src of [el.psets, el.kieu_psets]) {
    for (const [pset, name] of pairs) {
      const v = src?.[pset]?.[name];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }
  return undefined;
};
const kw = (watts: unknown) => {
  const w = numOf(watts);
  return w == null ? null : w / 1000;
};

/** Đọc một cấu kiện thành dòng thông số năng lượng; null khi không thuộc vỏ ngoài / thiết bị cần rà.
 * Công suất (IfcPowerMeasure) theo W của IFC, đổi ra kW. */
export function energyRowFromElement(el: ModelElementInput): ModelEnergyRow | null {
  const c = el.loai_cau_kien.toUpperCase();
  const t = (el.kieu_loai ?? '').toUpperCase();
  const pre = (el.predefined ?? '').toUpperCase();
  const base = { dien_tich: el.dien_tich, shgc: null, u: null, cop: null, cong_suat_lanh: null, cong_suat_dien: null };
  if (c === 'IFCWINDOW' || c === 'IFCCURTAINWALL') {
    const common = c === 'IFCWINDOW' ? 'Pset_WindowCommon' : 'Pset_CurtainWallCommon';
    if (prop(el, [common, 'IsExternal']) === false) return null;
    return {
      ...base,
      vai_tro: 'kinh',
      shgc: numOf(prop(el, ['Pset_DoorWindowGlazingType', 'SolarHeatGainTransmittance'])),
      u: numOf(
        prop(el, [common, 'ThermalTransmittance'], ['Pset_DoorWindowGlazingType', 'ThermalTransmittanceSummer']),
      ),
    };
  }
  if (c === 'IFCWALL' || c === 'IFCWALLSTANDARDCASE') {
    if (prop(el, ['Pset_WallCommon', 'IsExternal']) !== true) return null;
    return { ...base, vai_tro: 'tuong', u: numOf(prop(el, ['Pset_WallCommon', 'ThermalTransmittance'])) };
  }
  if (c === 'IFCROOF' || (c === 'IFCSLAB' && pre === 'ROOF')) {
    const u = numOf(prop(el, ['Pset_RoofCommon', 'ThermalTransmittance'], ['Pset_SlabCommon', 'ThermalTransmittance']));
    return { ...base, vai_tro: 'mai', u };
  }
  if (c === 'IFCCHILLER' || t === 'IFCCHILLERTYPE') {
    return {
      ...base,
      vai_tro: 'chiller',
      cop: numOf(prop(el, ['Pset_ChillerTypeCommon', 'NominalEfficiency'])),
      cong_suat_lanh: kw(prop(el, ['Pset_ChillerTypeCommon', 'NominalCapacity'])),
    };
  }
  if (c === 'IFCLIGHTFIXTURE' || t === 'IFCLIGHTFIXTURETYPE') {
    return { ...base, vai_tro: 'den', cong_suat_dien: kw(prop(el, ['Pset_LightFixtureTypeCommon', 'TotalWattage'])) };
  }
  return null;
}

export interface EnvelopePart {
  so: number;
  so_co_u: number;
  /** U lớn nhất (bất lợi nhất) khi mọi cấu kiện có U */
  u_max: number | null;
}
export interface ModelEnergy {
  so_kinh: number;
  so_kinh_co_shgc: number;
  /** SHGC trung bình theo diện tích vách kính (mục 2.1.2 b, chú thích Bảng 1) */
  shgc: number | null;
  u_kinh: number | null;
  tuong: EnvelopePart;
  mai: EnvelopePart;
  chiller: { so: number; so_co_cop: number; cop_min: number | null; cong_suat_kw: number | null };
  den: { so: number; so_co_cong_suat: number; tong_kw: number | null };
}
export function modelEnergy(rows: ModelEnergyRow[]): ModelEnergy {
  const of = (r: EnergyRole) => rows.filter((x) => x.vai_tro === r);
  const glass = of('kinh');
  const weighted = (key: 'shgc' | 'u') => {
    const withV = glass.filter((g) => g[key] != null);
    if (!withV.length || withV.length < glass.length) return null;
    const w = (g: ModelEnergyRow) => (g.dien_tich && g.dien_tich > 0 ? g.dien_tich : 1);
    const total = withV.reduce((s, g) => s + w(g), 0);
    return Math.round((withV.reduce((s, g) => s + g[key]! * w(g), 0) / total) * 1000) / 1000;
  };
  const part = (r: EnergyRole): EnvelopePart => {
    const all = of(r);
    const withU = all.filter((x) => x.u != null && x.u > 0);
    return {
      so: all.length,
      so_co_u: withU.length,
      u_max: all.length && withU.length === all.length ? Math.max(...withU.map((x) => x.u!)) : null,
    };
  };
  const ch = of('chiller');
  const withCop = ch.filter((c) => c.cop != null);
  const worst = withCop.length ? withCop.reduce((a, b) => (b.cop! < a.cop! ? b : a)) : null;
  const lights = of('den');
  const lp = lights.filter((l) => l.cong_suat_dien != null);
  return {
    so_kinh: glass.length,
    so_kinh_co_shgc: glass.filter((g) => g.shgc != null).length,
    shgc: weighted('shgc'),
    u_kinh: weighted('u'),
    tuong: part('tuong'),
    mai: part('mai'),
    chiller: {
      so: ch.length,
      so_co_cop: withCop.length,
      cop_min: worst?.cop ?? null,
      cong_suat_kw: worst?.cong_suat_lanh ?? null,
    },
    den: {
      so: lights.length,
      so_co_cong_suat: lp.length,
      tong_kw:
        lights.length && lp.length === lights.length
          ? Math.round(lp.reduce((s, l) => s + l.cong_suat_dien!, 0) * 1000) / 1000
          : null,
    },
  };
}
export type ParamSource = 'mo_hinh' | 'du_an';
/** Ưu tiên thông số trong mô hình (đủ cho mọi cấu kiện), thiếu thì lấy thông số nhập theo dự án. */
export function effectiveInputs(
  inputs: QcvnInputs,
  model: ModelEnergy | null,
  floorArea: number | null,
): { values: QcvnInputs; nguon: Partial<Record<keyof QcvnInputs, ParamSource>> } {
  const values = { ...inputs };
  const nguon: Partial<Record<keyof QcvnInputs, ParamSource>> = {};
  const take = <K extends keyof QcvnInputs>(
    k: K,
    v: QcvnInputs[K] | null | undefined,
    replaces?: 'r0_tuong' | 'r0_mai',
  ) => {
    if (v == null) return;
    values[k] = v;
    nguon[k] = 'mo_hinh';
    // U from the model replaces a hand-entered R0 (r0Of prefers R0)
    if (replaces) values[replaces] = null;
  };
  take('shgc_kinh', model?.shgc);
  take('u_tuong', model?.tuong.u_max, 'r0_tuong');
  take('u_mai', model?.mai.u_max, 'r0_mai');
  take('chiller_cop', model?.chiller.so && model.chiller.so_co_cop === model.chiller.so ? model.chiller.cop_min : null);
  take('chiller_cong_suat_kw', model?.chiller.cop_min != null ? model.chiller.cong_suat_kw : null);
  take(
    'lpd_thiet_ke',
    model?.den.tong_kw != null && floorArea ? Math.round(((model.den.tong_kw * 1000) / floorArea) * 10) / 10 : null,
  );
  for (const k of Object.keys(values) as (keyof QcvnInputs)[])
    if (!nguon[k] && k !== 'nguon' && values[k] != null) nguon[k] = 'du_an';
  return { values, nguon };
}
