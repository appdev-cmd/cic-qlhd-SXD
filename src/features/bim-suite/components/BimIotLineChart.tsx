'use client';
// Small responsive SVG line chart for IoT trends and history (replaces recharts in the cic-hud port): gaps at null
// values, optional threshold line, shaded alert ranges and a hover read-out. Labels are HTML so they do not stretch.
import React, { useMemo, useState } from 'react';
import { chartGeometry, nearestRow, type ChartRow } from '../lib/miniChart';

export interface BimIotLineChartProps {
  rows: ChartRow[];
  /** Accessible summary of the chart. */
  label: string;
  x?: [number, number];
  y?: [number, number];
  threshold?: number | null;
  /** Shaded time ranges (e.g. alert open → resolved). */
  ranges?: { from: number; to: number }[];
  step?: boolean;
  color?: string;
  heightClass?: string;
  formatX: (at: number) => string;
  formatY: (value: number) => string;
  /** Hover read-out text; defaults to formatY. */
  formatValue?: (value: number) => string;
}

export function BimIotLineChart({
  rows,
  label,
  x,
  y,
  threshold,
  ranges = [],
  step,
  color = 'var(--color-primary-600, #0d9488)',
  heightClass = 'h-40',
  formatX,
  formatY,
  formatValue,
}: BimIotLineChartProps) {
  const geometry = useMemo(() => chartGeometry(rows, { x, y, threshold, step }), [rows, x, y, threshold, step]);
  const [hover, setHover] = useState<number | null>(null);
  const span = geometry.x[1] - geometry.x[0];
  const fx = (at: number) => ((at - geometry.x[0]) / span) * 100;
  const fy = (v: number) => 100 - ((v - geometry.y[0]) / (geometry.y[1] - geometry.y[0])) * 100;
  const hovered = hover !== null ? rows[hover] : null;
  const xTicks = [0, 0.5, 1].map((f) => geometry.x[0] + f * span);
  return (
    <div className={`relative w-full ${heightClass}`} role="img" aria-label={label}>
      <div className="absolute bottom-4 left-0 top-0 w-10">
        {geometry.yTicks.map((t) => (
          <span
            key={t}
            className="absolute right-1 -translate-y-1/2 text-3xs tabular-nums text-txt-muted"
            style={{ top: `${fy(t)}%` }}
          >
            {formatY(t)}
          </span>
        ))}
      </div>
      <div
        className="absolute bottom-4 left-10 right-2 top-0"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const index = nearestRow(rows, geometry.x, (e.clientX - box.left) / Math.max(1, box.width));
          setHover(index >= 0 ? index : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {geometry.yTicks.map((t) => (
            <line
              key={t}
              x1={0}
              x2={100}
              y1={fy(t)}
              y2={fy(t)}
              stroke="currentColor"
              className="text-slate-300 dark:text-slate-700"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {ranges.map((r, i) => {
            const from = Math.max(0, fx(r.from));
            const to = Math.min(100, fx(r.to));
            return to > from ? (
              <rect key={i} x={from} width={to - from} y={0} height={100} fill="#f59e0b" fillOpacity={0.12} />
            ) : null;
          })}
          {geometry.threshold !== null && (
            <line
              x1={0}
              x2={100}
              y1={geometry.threshold}
              y2={geometry.threshold}
              stroke="#d97706"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {geometry.paths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {hovered && hovered.value !== null && (
            <line
              x1={fx(hovered.at)}
              x2={fx(hovered.at)}
              y1={0}
              y2={100}
              stroke="currentColor"
              className="text-slate-400"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {geometry.dots.map((dot, i) => (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${dot.cx}%`, top: `${dot.cy}%`, background: color }}
          />
        ))}
        {hovered && hovered.value !== null && (
          <span
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-bg-surface px-1.5 py-0.5 text-2xs text-txt-primary shadow dark:border-slate-600 dark:bg-slate-900"
            style={{ left: `${Math.min(85, Math.max(15, fx(hovered.at)))}%` }}
          >
            {formatX(hovered.at)} · {(formatValue ?? formatY)(hovered.value)}
          </span>
        )}
      </div>
      <div className="absolute bottom-0 left-10 right-2 h-4">
        {xTicks.map((t, i) => (
          <span
            key={i}
            className={`absolute text-3xs tabular-nums text-txt-muted ${i === 0 ? '' : i === 1 ? '-translate-x-1/2' : '-translate-x-full'}`}
            style={{ left: `${i * 50}%` }}
          >
            {formatX(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
