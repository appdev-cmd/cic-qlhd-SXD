// ============================================================
// BỘ MÀU CHỦ ĐẠO — đồng bộ nguyên giá trị với dự án cic-hud (config/palettes.ts)
// Mỗi bộ = nền tối trầm (sidebar, hero) + màu nhấn ánh kim ấm + màu chủ đạo trầm.
// Khi sửa giá trị, sửa đồng thời ở cic-hud để hai dự án giữ cùng bộ màu.
// Mặc định của Sở Xây dựng: "Lam công vụ" (teal #00668c — màu thương hiệu cũ).
// ============================================================

export type PaletteId =
  | 'hud'
  | 'congvu'
  | 'teal'
  | 'navy'
  | 'graphite'
  | 'forest'
  | 'plum'
  | 'son'
  | 'cham'
  | 'go'
  | 'reu'
  | 'vang';

export interface Palette {
  id: PaletteId;
  name: string;
  description: string;
  /** Chủ đạo: nút chính, liên kết, viền focus (= primary-500 / 600 / 700) */
  primary: string;
  hover: string;
  deep: string;
  /** Nền nhạt: băng thông báo, ô chọn (= primary-50 / 100, border = primary-200) */
  soft: string;
  softLight: string;
  softStrong: string;
  border: string;
  /** Màu nhấn ánh kim */
  accent: string;
  sidebar: string;
  sidebarActive: string;
  sidebarPanel: string;
  sidebarPanelBorder: string;
  sidebarStatus: string;
  sidebarStatusDot: string;
  logo: string;
  heroStart: string;
  heroMiddle: string;
  heroEnd: string;
  heroLabel: string;
  heroCopy: string;
  navActiveText: string;
  bannerText: string;
  toast: string;
}

export const DEFAULT_PALETTE_ID: PaletteId = 'congvu';

export const PALETTES: Palette[] = [
  {
    id: 'hud',
    name: 'HUD',
    description: 'Đỏ HUD · trung tính',
    primary: '#b5222c',
    hover: '#9b1c26',
    deep: '#7d1825',
    soft: '#fff1f2',
    softLight: '#fff8f8',
    softStrong: '#ffe4e6',
    border: '#efb8bd',
    accent: '#f2b2b7',
    sidebar: '#241e25',
    sidebarActive: '#912934',
    sidebarPanel: '#3a2933',
    sidebarPanelBorder: '#65414c',
    sidebarStatus: '#efced2',
    sidebarStatusDot: '#e4848c',
    logo: '#ee2e32',
    heroStart: '#531626',
    heroMiddle: '#762436',
    heroEnd: '#a52d3b',
    heroLabel: '#f2c9cd',
    heroCopy: '#efdae0',
    navActiveText: '#ffffff',
    bannerText: '#a32836',
    toast: '#531626',
  },
  {
    id: 'congvu',
    name: 'Lam công vụ',
    description: 'Lam ngọc · vàng đồng',
    primary: '#00668c',
    hover: '#00557a',
    deep: '#004a6b',
    soft: '#eef6fa',
    softLight: '#f7fbfd',
    softStrong: '#dfeef5',
    border: '#b6d6e4',
    accent: '#c9a25a',
    sidebar: '#0e2633',
    sidebarActive: '#1d4659',
    sidebarPanel: '#173646',
    sidebarPanelBorder: '#33566a',
    sidebarStatus: '#e3c897',
    sidebarStatusDot: '#d4a957',
    logo: '#c9a25a',
    heroStart: '#0e3346',
    heroMiddle: '#0b5874',
    heroEnd: '#0a7398',
    heroLabel: '#ead3a5',
    heroCopy: '#d6e9f1',
    navActiveText: '#ffffff',
    bannerText: '#2f6a85',
    toast: '#12384b',
  },
  {
    id: 'teal',
    name: 'Xanh ngọc',
    description: 'Tươi sáng · hiện đại',
    // qa-si-xd dùng #0c887a (chữ trắng chỉ đạt 4,36:1) → sẫm nhẹ để đạt WCAG AA 4,5:1
    primary: '#0b7f72',
    hover: '#087365',
    deep: '#0c6a62',
    soft: '#f0faf7',
    softLight: '#f8fcfa',
    softStrong: '#e7f5f1',
    border: '#bce7de',
    accent: '#34d1b9',
    sidebar: '#122a3b',
    sidebarActive: '#1c4650',
    sidebarPanel: '#1a394b',
    sidebarPanelBorder: '#355364',
    sidebarStatus: '#9cd6ca',
    sidebarStatusDot: '#49d8bc',
    logo: '#16a696',
    heroStart: '#12484e',
    heroMiddle: '#0e686a',
    heroEnd: '#128875',
    heroLabel: '#b2eee3',
    heroCopy: '#d0ebe7',
    navActiveText: '#eafff9',
    bannerText: '#39756d',
    toast: '#1c3d47',
  },
  {
    id: 'navy',
    name: 'Navi sẫm',
    description: 'Xanh đậm · vàng đồng',
    primary: '#1c4d75',
    hover: '#163e60',
    deep: '#173a59',
    soft: '#f0f5fa',
    softLight: '#f7fafd',
    softStrong: '#e8f0f8',
    border: '#bfd2e5',
    accent: '#c28b38',
    sidebar: '#11233e',
    sidebarActive: '#244566',
    sidebarPanel: '#1b3b59',
    sidebarPanelBorder: '#365573',
    sidebarStatus: '#e2c48f',
    sidebarStatusDot: '#d8a34f',
    logo: '#c28b38',
    heroStart: '#11233e',
    heroMiddle: '#173959',
    heroEnd: '#235077',
    heroLabel: '#ead0a0',
    heroCopy: '#d9e7f1',
    navActiveText: '#ffffff',
    bannerText: '#335979',
    toast: '#112b46',
  },
  {
    id: 'graphite',
    name: 'Than chì',
    description: 'Trung tính · điểm đồng',
    primary: '#425365',
    hover: '#344454',
    deep: '#293949',
    soft: '#f3f5f7',
    softLight: '#fafbfc',
    softStrong: '#e9eef2',
    border: '#cbd5de',
    accent: '#c79962',
    sidebar: '#202b37',
    sidebarActive: '#394b5e',
    sidebarPanel: '#2d3b49',
    sidebarPanelBorder: '#4c5c69',
    sidebarStatus: '#e6c59e',
    sidebarStatusDot: '#d5a772',
    logo: '#b88a57',
    heroStart: '#202b37',
    heroMiddle: '#304254',
    heroEnd: '#466178',
    heroLabel: '#ebcba5',
    heroCopy: '#e1e9f0',
    navActiveText: '#ffffff',
    bannerText: '#4a6172',
    toast: '#263544',
  },
  {
    id: 'forest',
    name: 'Lục bảo sẫm',
    description: 'Trầm ấm · vàng nhạt',
    primary: '#236a59',
    hover: '#1a5749',
    deep: '#174c40',
    soft: '#f0f7f4',
    softLight: '#f8fbf9',
    softStrong: '#e2f0ea',
    border: '#b7d9ca',
    accent: '#d4ad6c',
    sidebar: '#112f2b',
    sidebarActive: '#245147',
    sidebarPanel: '#1b4038',
    sidebarPanelBorder: '#3a6255',
    sidebarStatus: '#e2c998',
    sidebarStatusDot: '#d4ad6c',
    logo: '#b79154',
    heroStart: '#12352f',
    heroMiddle: '#1e5649',
    heroEnd: '#2e7861',
    heroLabel: '#ecd2a2',
    heroCopy: '#dcefe6',
    navActiveText: '#ffffff',
    bannerText: '#356958',
    toast: '#173e35',
  },
  {
    id: 'plum',
    name: 'Tím mận',
    description: 'Tinh tế · vàng hồng',
    primary: '#704d72',
    hover: '#5c3e5e',
    deep: '#523955',
    soft: '#f8f4f8',
    softLight: '#fcf9fc',
    softStrong: '#f1e8f1',
    border: '#ddc8de',
    accent: '#d4aa88',
    sidebar: '#2c2334',
    sidebarActive: '#503d56',
    sidebarPanel: '#3a2e43',
    sidebarPanelBorder: '#5e5065',
    sidebarStatus: '#edcfb5',
    sidebarStatusDot: '#d4aa88',
    logo: '#b98775',
    heroStart: '#30253a',
    heroMiddle: '#563f61',
    heroEnd: '#785b7b',
    heroLabel: '#f0d3bf',
    heroCopy: '#f1e4f0',
    navActiveText: '#ffffff',
    bannerText: '#755677',
    toast: '#382b40',
  },
  {
    id: 'son',
    name: 'Đỏ son',
    description: 'Đỏ trầm · vàng kim',
    primary: '#9b2c2c',
    hover: '#842424',
    deep: '#6f1f1f',
    soft: '#fbf3f2',
    softLight: '#fdf9f8',
    softStrong: '#f5e3e1',
    border: '#e5c2be',
    accent: '#d8ad5b',
    sidebar: '#2d1416',
    sidebarActive: '#522629',
    sidebarPanel: '#3d1c1e',
    sidebarPanelBorder: '#63393b',
    sidebarStatus: '#ecd09a',
    sidebarStatusDot: '#d8ad5b',
    logo: '#c99a4b',
    heroStart: '#331618',
    heroMiddle: '#5e2224',
    heroEnd: '#8a3330',
    heroLabel: '#f0d6a6',
    heroCopy: '#f3e1df',
    navActiveText: '#ffffff',
    bannerText: '#8a3a36',
    toast: '#3b1a1c',
  },
  {
    id: 'cham',
    name: 'Chàm đêm',
    description: 'Chàm sâu · vàng kim',
    primary: '#3f4b8c',
    hover: '#343f78',
    deep: '#2c3566',
    soft: '#f2f3fa',
    softLight: '#f9f9fd',
    softStrong: '#e5e7f4',
    border: '#c3c8e6',
    accent: '#d6b25e',
    sidebar: '#171b36',
    sidebarActive: '#2e3561',
    sidebarPanel: '#222849',
    sidebarPanelBorder: '#444b72',
    sidebarStatus: '#e6cf9b',
    sidebarStatusDot: '#d6b25e',
    logo: '#c7a14f',
    heroStart: '#1a1f3e',
    heroMiddle: '#2c3566',
    heroEnd: '#46549a',
    heroLabel: '#ecd7a6',
    heroCopy: '#e1e4f3',
    navActiveText: '#ffffff',
    bannerText: '#46518f',
    toast: '#20264a',
  },
  {
    id: 'go',
    name: 'Gỗ trầm',
    description: 'Nâu gỗ · vàng mật',
    primary: '#7b5434',
    hover: '#67462b',
    deep: '#573b24',
    soft: '#f9f5f1',
    softLight: '#fcfaf8',
    softStrong: '#f1e7dd',
    border: '#dfcab6',
    accent: '#e0b465',
    sidebar: '#2a1f17',
    sidebarActive: '#4c3a2c',
    sidebarPanel: '#382a20',
    sidebarPanelBorder: '#5d4a3c',
    sidebarStatus: '#ecd3a2',
    sidebarStatusDot: '#e0b465',
    logo: '#c49a52',
    heroStart: '#2e2219',
    heroMiddle: '#523b28',
    heroEnd: '#7d5a3a',
    heroLabel: '#f0d8aa',
    heroCopy: '#f1e7dd',
    navActiveText: '#ffffff',
    bannerText: '#74553a',
    toast: '#34271d',
  },
  {
    id: 'reu',
    name: 'Rêu ô liu',
    description: 'Xanh rêu · vàng đồng',
    primary: '#556b3b',
    hover: '#475a31',
    deep: '#3c4c29',
    soft: '#f4f7f0',
    softLight: '#fafbf8',
    softStrong: '#e7eedd',
    border: '#c8d6b6',
    accent: '#cfa65a',
    sidebar: '#1d2416',
    sidebarActive: '#36432a',
    sidebarPanel: '#283120',
    sidebarPanelBorder: '#4b5841',
    sidebarStatus: '#e5cc98',
    sidebarStatusDot: '#cfa65a',
    logo: '#b8954f',
    heroStart: '#20281a',
    heroMiddle: '#3a4a2b',
    heroEnd: '#5a7140',
    heroLabel: '#ead2a2',
    heroCopy: '#e5ecdc',
    navActiveText: '#ffffff',
    bannerText: '#566b40',
    toast: '#263020',
  },
  {
    // Vàng tươi không đạt 4,5:1 với chữ trắng → nút dùng vàng hoàng thổ đậm, vàng tươi để làm màu nhấn
    id: 'vang',
    name: 'Hoàng kim',
    description: 'Vàng hoàng thổ · nhấn kim sa',
    primary: '#8a6410',
    hover: '#745410',
    deep: '#5f450d',
    soft: '#fbf6e9',
    softLight: '#fdfbf4',
    softStrong: '#f5ebcf',
    border: '#e7d39c',
    accent: '#e8b931',
    sidebar: '#211c0e',
    sidebarActive: '#463a18',
    sidebarPanel: '#302812',
    sidebarPanelBorder: '#574a26',
    sidebarStatus: '#f3d98a',
    sidebarStatusDot: '#e8b931',
    logo: '#d4a72c',
    heroStart: '#2a2210',
    heroMiddle: '#5c4712',
    heroEnd: '#8a6a14',
    heroLabel: '#f6dc8a',
    heroCopy: '#f3ead0',
    navActiveText: '#ffffff',
    bannerText: '#7a5a0e',
    toast: '#3a2f12',
  },
];

/** Lựa chọn của bộ 9 màu cũ → bộ mới gần nhất (giữ lựa chọn của người dùng khi nâng cấp) */
export const LEGACY_COLOR_MAP: Record<string, PaletteId> = {
  teal: 'congvu',
  cyan: 'teal',
  emerald: 'forest',
  blue: 'navy',
  indigo: 'cham',
  violet: 'plum',
  rose: 'son',
  red: 'son',
  amber: 'vang',
};

export function getPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID) ?? PALETTES[0];
}

// ── Màu ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Trộn màu `a` với `b` theo tỷ lệ `t` (0 = a, 1 = b) */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

/** "r g b" — dùng cho biến `-rgb` (Tailwind `<alpha-value>`) */
export function hexToChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

/** Độ sáng tương đối WCAG */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Tỷ lệ tương phản WCAG giữa hai màu */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const PRIMARY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * Thang primary 50–900 dựng từ các màu đã thiết kế của bộ:
 * 50 = soft, 100 = soft-strong, 200 = border, 500/600/700 = primary/hover/deep;
 * 300/400 nội suy về trắng, 800/900 sẫm dần từ deep.
 */
export function buildPrimaryScale(p: Palette): string[] {
  return [
    p.soft,
    p.softStrong,
    p.border,
    mixHex(p.primary, '#ffffff', 0.5),
    mixHex(p.primary, '#ffffff', 0.25),
    p.primary,
    p.hover,
    p.deep,
    mixHex(p.deep, '#000000', 0.3),
    mixHex(p.deep, '#000000', 0.55),
  ];
}

/**
 * Biến `--brand-*` cho khung ứng dụng. Ở chế độ Tối, nền sidebar/hero sẫm thêm
 * để tách lớp với nền ứng dụng tối; màu nhấn và chữ giữ nguyên.
 */
export function buildBrandTokens(p: Palette, isDark: boolean): Record<string, string> {
  const shade = (hex: string) => (isDark ? mixHex(hex, '#000000', 0.2) : hex);
  return {
    sidebar: shade(p.sidebar),
    'sidebar-active': shade(p.sidebarActive),
    'sidebar-panel': shade(p.sidebarPanel),
    'sidebar-border': shade(p.sidebarPanelBorder),
    'sidebar-status': p.sidebarStatus,
    'sidebar-status-dot': p.sidebarStatusDot,
    accent: p.accent,
    logo: p.logo,
    'hero-start': shade(p.heroStart),
    'hero-middle': shade(p.heroMiddle),
    'hero-end': shade(p.heroEnd),
    'hero-label': p.heroLabel,
    'hero-copy': p.heroCopy,
    'nav-active-text': p.navActiveText,
    'banner-text': p.bannerText,
    toast: p.toast,
  };
}
