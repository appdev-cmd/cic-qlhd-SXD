// Geometry for the small SVG line charts of the IoT views (replaces recharts): domains, ticks and path segments
// that break at null values (missing/stale/bad data is a gap, never joined or drawn as 0).

export interface ChartRow {
  at: number;
  value: number | null;
}
export interface ChartGeometry {
  x: [number, number];
  y: [number, number];
  /** SVG path data per continuous segment, in a 0..100 × 0..100 box (y down). */
  paths: string[];
  /** Single isolated points (segment of length 1), drawn as dots. */
  dots: { cx: number; cy: number }[];
  yTicks: number[];
  /** Threshold position in the 0..100 box, or null when outside / not set. */
  threshold: number | null;
}

/** Round tick values ("nice numbers") covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export function chartGeometry(
  rows: ChartRow[],
  options: { x?: [number, number]; y?: [number, number]; threshold?: number | null; step?: boolean } = {},
): ChartGeometry {
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null && Number.isFinite(v));
  const times = rows.map((r) => r.at);
  const x: [number, number] = options.x ?? [Math.min(...times), Math.max(...times)];
  if (!(x[1] > x[0])) x[1] = x[0] + 1;
  let y: [number, number];
  if (options.y) y = options.y;
  else {
    const extra = options.threshold != null ? [options.threshold] : [];
    let lo = Math.min(...values, ...extra);
    let hi = Math.max(...values, ...extra);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
    if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.08;
    y = [lo - pad, hi + pad];
  }
  const px = (at: number) => ((at - x[0]) / (x[1] - x[0])) * 100;
  const py = (v: number) => 100 - ((v - y[0]) / (y[1] - y[0])) * 100;
  const paths: string[] = [];
  const dots: { cx: number; cy: number }[] = [];
  let segment: { cx: number; cy: number }[] = [];
  const flush = () => {
    if (segment.length === 1) dots.push(segment[0]);
    else if (segment.length > 1) {
      let d = `M${segment[0].cx.toFixed(2)},${segment[0].cy.toFixed(2)}`;
      for (let i = 1; i < segment.length; i++) {
        const p = segment[i];
        if (options.step) d += `H${p.cx.toFixed(2)}`;
        d += `${options.step ? 'V' : `L${p.cx.toFixed(2)},`}${p.cy.toFixed(2)}`;
      }
      paths.push(d);
    }
    segment = [];
  };
  for (const row of [...rows].sort((a, b) => a.at - b.at)) {
    if (row.value === null || !Number.isFinite(row.value)) flush();
    else segment.push({ cx: px(row.at), cy: py(row.value) });
  }
  flush();
  const threshold =
    options.threshold != null && options.threshold >= y[0] && options.threshold <= y[1] ? py(options.threshold) : null;
  return { x, y, paths, dots, yTicks: niceTicks(y[0], y[1]), threshold };
}

/** Index of the row nearest to a horizontal fraction (0..1) of the chart, for hover read-outs. */
export function nearestRow(rows: ChartRow[], x: [number, number], fraction: number): number {
  const at = x[0] + Math.max(0, Math.min(1, fraction)) * (x[1] - x[0]);
  let best = -1;
  let distance = Infinity;
  rows.forEach((row, index) => {
    const d = Math.abs(row.at - at);
    if (row.value !== null && d < distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}
