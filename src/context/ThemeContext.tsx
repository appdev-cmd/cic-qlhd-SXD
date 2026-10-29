import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  PALETTES,
  DEFAULT_PALETTE_ID,
  LEGACY_COLOR_MAP,
  PRIMARY_STEPS,
  getPalette,
  buildPrimaryScale,
  buildBrandTokens,
  hexToChannels,
  type PaletteId,
} from '../config/palettes';

export type Theme = 'nature' | 'light' | 'dark';
/** Bộ màu chủ đạo — xem config/palettes.ts (đồng bộ cic-hud) */
export type PrimaryColor = PaletteId;

export const PRIMARY_COLORS: {
  id: PrimaryColor;
  name: string;
  description: string;
  hex: string;
  accent: string;
  base: string;
}[] = PALETTES.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  hex: p.primary,
  accent: p.accent,
  base: p.sidebar,
}));

// Token bề mặt 3 chế độ — đồng bộ cic-hud (context/ThemeContext.tsx)
const THEME_TOKENS: Record<Theme, Record<string, string>> = {
  nature: {
    '--bg-app': '#F0ECE1',
    '--bg-surface': '#FCF9F2',
    '--bg-subtle': '#F5EFE6',
    '--bg-muted': '#EDE8DF',
    '--bg-elevated': '#FDFAF4',
    '--border-default': '#ece7de',
    '--border-subtle': '#e5dfd4',
    '--text-primary': '#1d1c1c',
    '--text-secondary': '#4a3426',
    '--text-muted': '#6d665f',
    '--text-placeholder': '#736b62',
    '--input-bg': '#FCF9F2',
    '--input-border': '#d6cfc4',
    '--bg-hover-row': '#F5EFE6',
    '--bg-active-row': '#EDE8DF',
    '--bg-stripe': '#F8F5EC',
    '--bg-overlay': 'rgba(45, 30, 10, 0.50)',
    '--ring-focus-offset': '#FCF9F2',
    '--shadow-card': '0 1px 2px 0 rgb(74 49 16 / 0.04), 0 1px 3px 0 rgb(74 49 16 / 0.06)',
    '--shadow-card-hover': '0 8px 20px -4px rgb(74 49 16 / 0.10), 0 4px 8px -4px rgb(74 49 16 / 0.06)',
    '--shadow-dropdown': '0 10px 15px -3px rgb(74 49 16 / 0.10), 0 4px 6px -4px rgb(74 49 16 / 0.06)',
    '--shadow-modal': '0 25px 50px -12px rgb(74 49 16 / 0.18)',
    '--scrollbar-thumb': '#d6cfc4',
    '--scrollbar-thumb-hover': '#b8b0a3',
  },
  light: {
    '--bg-app': '#f1f5f9',
    '--bg-surface': '#ffffff',
    '--bg-subtle': '#f8fafc',
    '--bg-muted': '#f1f5f9',
    '--bg-elevated': '#ffffff',
    '--border-default': '#e2e8f0',
    '--border-subtle': '#f1f5f9',
    '--text-primary': '#0f172a',
    '--text-secondary': '#334155',
    '--text-muted': '#64748b',
    '--text-placeholder': '#6b7280',
    '--input-bg': '#ffffff',
    '--input-border': '#e2e8f0',
    '--bg-hover-row': '#f8fafc',
    '--bg-active-row': '#f1f5f9',
    '--bg-stripe': '#fafbfc',
    '--bg-overlay': 'rgba(15, 23, 42, 0.45)',
    '--ring-focus-offset': '#ffffff',
    '--shadow-card': '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
    '--shadow-card-hover': '0 8px 20px -4px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.06)',
    '--shadow-dropdown': '0 10px 15px -3px rgb(15 23 42 / 0.10), 0 4px 6px -4px rgb(15 23 42 / 0.06)',
    '--shadow-modal': '0 25px 50px -12px rgb(15 23 42 / 0.20)',
    '--scrollbar-thumb': '#cbd5e1',
    '--scrollbar-thumb-hover': '#94a3b8',
  },
  dark: {
    '--bg-app': '#0f1117',
    '--bg-surface': '#1f2332',
    '--bg-subtle': '#1a1e2e',
    '--bg-muted': '#252a3b',
    '--bg-elevated': '#252a3b',
    '--border-default': '#38425d',
    '--border-subtle': '#2a3246',
    '--text-primary': '#f8fafc',
    '--text-secondary': '#e2e8f0',
    '--text-muted': '#94a3b8',
    '--text-placeholder': '#7c8aa0',
    '--input-bg': '#1a1e2e',
    '--input-border': '#262b3b',
    '--bg-hover-row': '#252a3b',
    '--bg-active-row': '#2a3147',
    '--bg-stripe': '#1c2030',
    '--bg-overlay': 'rgba(0, 0, 0, 0.65)',
    '--ring-focus-offset': '#1f2332',
    '--shadow-card': '0 1px 3px 0 rgb(0 0 0 / 0.45), 0 0 0 1px rgb(255 255 255 / 0.08)',
    '--shadow-card-hover': '0 10px 15px -3px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.12)',
    '--shadow-dropdown': '0 10px 15px -3px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.10)',
    '--shadow-modal': '0 25px 50px -12px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.04)',
    '--scrollbar-thumb': '#2e3548',
    '--scrollbar-thumb-hover': '#3d4560',
  },
};

const PALETTE_STORAGE_KEY = 'buildappraisal:palette_id';

/** Đọc bộ màu đã lưu; lựa chọn của bộ 9 màu cũ (`primaryColor`) được chuyển sang bộ gần nhất. */
function readSavedPalette(): PrimaryColor {
  try {
    const saved = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (PALETTES.some((p) => p.id === saved)) return saved as PrimaryColor;
    const legacy = localStorage.getItem('primaryColor');
    if (legacy && LEGACY_COLOR_MAP[legacy]) return LEGACY_COLOR_MAP[legacy];
  } catch {
    // localStorage bị chặn → dùng mặc định
  }
  return DEFAULT_PALETTE_ID;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.remove('theme-nature', 'theme-light', 'theme-dark');
  root.classList.add(`theme-${theme}`);
  root.dataset.theme = theme;
  Object.entries(THEME_TOKENS[theme]).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/**
 * Áp bộ màu: thang `--color-primary-N` (kênh "r g b" cho Tailwind `<alpha-value>`),
 * `--color-primary` (hex) và nhóm `--brand-*` cho khung (menu trái, màu nhấn).
 */
function applyPalette(color: PrimaryColor, isDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const palette = getPalette(color);
  const scale = buildPrimaryScale(palette);
  PRIMARY_STEPS.forEach((step, i) => {
    root.style.setProperty(`--color-primary-${step}`, hexToChannels(scale[i]));
    root.style.setProperty(`--color-primary-${step}-rgb`, hexToChannels(scale[i]));
  });
  root.style.setProperty('--color-primary', scale[5]);
  root.style.setProperty('--ring-focus', scale[isDark ? 3 : 5]);
  Object.entries(buildBrandTokens(palette, isDark)).forEach(([key, hex]) => {
    root.style.setProperty(`--brand-${key}`, hex);
    root.style.setProperty(`--brand-${key}-rgb`, hexToChannels(hex));
  });
  root.dataset.palette = palette.id;
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  primaryColor: PrimaryColor;
  setPrimaryColor: (c: PrimaryColor) => void;
  zoom: number;
  setZoom: (z: number) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'nature',
  setTheme: () => {},
  toggleTheme: () => {},
  primaryColor: DEFAULT_PALETTE_ID,
  setPrimaryColor: () => {},
  zoom: 100,
  setZoom: () => {},
});

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage bị chặn → chỉ áp trong phiên
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('theme') || localStorage.getItem('buildappraisal-theme');
      if (saved === 'dark' || saved === 'light' || saved === 'nature') return saved;
    } catch {
      // ignore
    }
    return 'nature'; // Mặc định: Bảo vệ mắt (nền cát ấm)
  });

  const [primaryColor, setPrimaryColorState] = useState<PrimaryColor>(readSavedPalette);

  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('appZoom'));
      if (Number.isFinite(saved) && saved >= 90 && saved <= 120) return saved;
    } catch {
      // ignore
    }
    return 100;
  });

  // useLayoutEffect: áp màu trước lần vẽ đầu để menu và nút không nháy màu mặc định.
  // Chế độ Tối làm sẫm nền menu nên áp lại bộ màu khi đổi chế độ.
  useLayoutEffect(() => {
    applyTheme(theme);
    applyPalette(primaryColor, theme === 'dark');
  }, [theme, primaryColor]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${zoom}%`;
    }
  }, [zoom]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist('theme', t);
    persist('buildappraisal-theme', t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'nature' ? 'light' : prev === 'light' ? 'dark' : 'nature';
      persist('theme', next);
      persist('buildappraisal-theme', next);
      return next;
    });
  }, []);

  const setPrimaryColor = useCallback((c: PrimaryColor) => {
    setPrimaryColorState(c);
    persist(PALETTE_STORAGE_KEY, c);
    try {
      localStorage.removeItem('primaryColor');
    } catch {
      // ignore
    }
  }, []);

  const setZoom = useCallback((z: number) => {
    const clamped = Math.max(90, Math.min(120, z));
    setZoomState(clamped);
    persist('appZoom', String(clamped));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        primaryColor,
        setPrimaryColor,
        zoom,
        setZoom,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
