/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── Primary teal scale (đồng bộ cic-ibst & qlda-ddcn-ht) ───
        primary: {
          DEFAULT: 'rgb(var(--color-primary-500) / <alpha-value>)',
          light: 'rgb(var(--color-primary-400) / <alpha-value>)',
          dark: 'rgb(var(--color-primary-700) / <alpha-value>)',
          subtle: 'rgb(var(--color-primary-100) / <alpha-value>)',
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
        },
        // ─── Accent đỏ cờ ───
        accent: {
          DEFAULT: '#AE1E23',
          light: '#D42A30',
          dark: '#8B181C',
          bg: '#fde3e3',
          50: '#fef2f2',
          100: '#fde3e3',
        },
        gold: {
          DEFAULT: '#D4A017',
          dark: '#B8860B',
          200: '#F0D68A',
          300: '#E4C45A',
          400: '#D4A843',
        },
        success: '#10b981',
        warning: {
          DEFAULT: '#f59e0b',
          200: '#fde68a',
          400: '#fbbf24',
        },
        danger: '#ef4444',
        info: '#3b82f6',
        // ─── Theme-aware surfaces (Nature — nền cát ấm & Dark Fintech Matte Navy) ───
        page: 'var(--bg-app)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        muted: 'var(--bg-muted)',
        elevated: 'var(--bg-elevated)',
        border: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        bg: {
          app: 'var(--bg-app)',
          surface: 'var(--bg-surface)',
          subtle: 'var(--bg-subtle)',
          muted: 'var(--bg-muted)',
          elevated: 'var(--bg-elevated)',
        },
        txt: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          placeholder: 'var(--text-placeholder)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        a4: ['Times New Roman', 'Times', 'serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        dropdown: 'var(--shadow-dropdown)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'slide-left': 'slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
