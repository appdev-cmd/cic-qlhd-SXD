
/**
 * Bộ lọc SVG Glow & Hiệu ứng Chiều sâu cho Recharts (Đồng bộ 100% cic-ibst)
 */
export function ChartDefs() {
  return (
    <defs>
      {/* ── Drop Shadow & Glow Filters ── */}
      <filter id="glowKyKet" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.45" />
      </filter>
      <filter id="glowDoanhThu" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#10b981" floodOpacity="0.45" />
      </filter>
      <filter id="glowDongTien" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#00668c" floodOpacity="0.45" />
      </filter>
      <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#6366f1" floodOpacity="0.5" />
      </filter>
      <filter id="glowDarkLine" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#334155" floodOpacity="0.6" />
      </filter>
      <filter id="shadowBar" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.2" />
      </filter>
      <filter id="pieGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.25" />
      </filter>

      {/* ── Area Fill Gradients ── */}
      <linearGradient id="colorLuyKeKyKet" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
        <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id="colorLuyKeDoanhThu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
        <stop offset="60%" stopColor="#10b981" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id="colorLuyKeDongTien" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#00668c" stopOpacity={0.6} />
        <stop offset="60%" stopColor="#00668c" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#00668c" stopOpacity={0.0} />
      </linearGradient>

      {/* ── Gradients cho các thanh Bar ── */}
      <linearGradient id="grad-primary" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3995b8" />
        <stop offset="100%" stopColor="#00668c" />
      </linearGradient>
      <linearGradient id="grad-success" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="grad-warning" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id="grad-danger" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f87171" />
        <stop offset="100%" stopColor="#dc2626" />
      </linearGradient>
    </defs>
  );
}
