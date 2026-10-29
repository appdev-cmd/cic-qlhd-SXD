import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimSectionPanel.tsx
// Bảng điều khiển mặt cắt đơn và hộp cắt. Vị trí lưu theo MÉT trong hệ toạ độ của cảnh (không theo tỉ lệ
// hộp bao) nên nạp thêm mô hình không làm trôi mặt cắt; có ô nhập số, chọn tầng, cắt qua cấu kiện đang chọn
// và canh mặt cắt theo một mặt bấm trên mô hình.

import React, { useEffect, useMemo, useState } from 'react';
import { Scissors, X, FlipVertical2, RotateCcw, Move3D, Focus, MousePointerClick, Layers, Loader2 } from 'lucide-react';
import {
  AXES,
  AXIS_INDEX,
  defaultSectionState,
  sectionRange,
  sliderStep,
  type BimSectionState,
  type BoxRange,
  type SceneBounds,
  type SectionAxis,
} from '../lib/sectionState';

export type { BimSectionState } from '../lib/sectionState';

// Fragments dùng Y hướng lên: Y ↔ cao độ (Z của IFC), Z ↔ trục Y của IFC
const AXIS_LABELS: Record<SectionAxis, string> = {
  x: 'Trục X',
  y: 'Cao độ (Z)',
  z: 'Trục Y',
};

const fmt = (v: number) => formatNumber(v, 2);
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Ô nhập số theo mét: sửa tự do, áp khi rời ô hoặc Enter; để trống = không giới hạn (nếu cho phép) */
const MetreInput: React.FC<{
  value: number | null;
  placeholder?: string;
  allowEmpty?: boolean;
  label: string;
  step: number;
  onCommit: (value: number | null) => void;
}> = ({ value, placeholder, allowEmpty, label, step, onCommit }) => {
  const [draft, setDraft] = useState(value === null ? '' : String(Number(value.toFixed(3))));
  useEffect(() => setDraft(value === null ? '' : String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const text = draft.trim().replace(',', '.');
    if (!text) {
      if (allowEmpty) onCommit(null);
      else setDraft(value === null ? '' : String(Number(value.toFixed(3))));
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n)) onCommit(n);
    else setDraft(value === null ? '' : String(Number(value.toFixed(3))));
  };
  return (
    <BimInput
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = value ?? Number(placeholder?.replace(',', '.') ?? 0);
          if (Number.isFinite(base)) onCommit(Number((base + (e.key === 'ArrowUp' ? step : -step)).toFixed(3)));
        }
      }}
      className="w-20 px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-mono text-2xs text-slate-800 dark:text-slate-100"
    />
  );
};

interface BimSectionPanelProps {
  state: BimSectionState;
  sceneBox: SceneBounds | null;
  onChange: (state: BimSectionState) => void;
  onClose: () => void;
  /** Bật tay kéo mặt cắt ngay trên mô hình 3D */
  dragOnModel?: boolean;
  onToggleDragOnModel?: () => void;
  /** Cắt qua cấu kiện đang chọn: mặt cắt qua tâm, hoặc hộp cắt bao quanh có lề */
  onCutAtSelection?: () => void;
  selectionCount?: number;
  /** Canh mặt cắt theo một mặt bấm trên mô hình */
  onAlignToFace?: () => void;
  aligning?: boolean;
  /** Tầng gộp từ các mô hình đang nạp */
  storeys?: string[];
  /** Cắt theo tầng; trả thông báo lỗi nếu không xác định được cao độ */
  onPickStorey?: (name: string, offset: number) => Promise<string | null>;
}

export const BimSectionPanel: React.FC<BimSectionPanelProps> = ({
  state,
  sceneBox,
  onChange,
  onClose,
  dragOnModel,
  onToggleDragOnModel,
  onCutAtSelection,
  selectionCount = 0,
  onAlignToFace,
  aligning,
  storeys = [],
  onPickStorey,
}) => {
  const [storey, setStorey] = useState('');
  const [storeyOffset, setStoreyOffset] = useState(1.2);
  const [storeyBusy, setStoreyBusy] = useState(false);
  const [storeyError, setStoreyError] = useState<string | null>(null);

  const update = (patch: Partial<BimSectionState>) => onChange({ ...state, ...patch });

  const planeRange = useMemo(() => sectionRange(state, sceneBox), [state.axis, state.normal, sceneBox]);
  const span = planeRange ? planeRange[1] - planeRange[0] : 0;
  const step = sliderStep(span);

  const axisBounds = (axis: SectionAxis): [number, number] | null => {
    if (!sceneBox) return null;
    const i = AXIS_INDEX[axis];
    return [sceneBox.min[i], sceneBox.max[i]];
  };

  const setBox = (axis: SectionAxis, range: BoxRange) => update({ box: { ...state.box, [axis]: range } });

  const pickStorey = async () => {
    if (!storey || !onPickStorey) return;
    setStoreyBusy(true);
    setStoreyError(null);
    try {
      setStoreyError(await onPickStorey(storey, storeyOffset));
    } finally {
      setStoreyBusy(false);
    }
  };

  const toggleBtn = (active: boolean) =>
    `w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border ${
      active
        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold'
        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
    }`;

  return (
    <div
      className="absolute top-3 left-3 z-20 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-2xl bg-white/95 dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl text-xs"
      role="region"
      aria-label="Mặt cắt mô hình"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <Scissors className="w-4 h-4 text-primary-600" /> Mặt cắt mô hình
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onChange({ ...defaultSectionState(sceneBox, state.mode), outline: state.outline, caps: state.caps })
            }
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            data-tooltip="Đặt lại"
            aria-label="Đặt lại mặt cắt"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            data-tooltip="Tắt mặt cắt"
            aria-label="Tắt mặt cắt"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900" role="tablist">
          {(
            [
              ['plane', 'Mặt cắt đơn'],
              ['box', 'Hộp cắt'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={state.mode === m}
              onClick={() => update({ mode: m })}
              className={`py-1 rounded-md font-medium transition-colors ${
                state.mode === m
                  ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-300 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!sceneBox && <p className="text-slate-400">Chưa có hình học mô hình để cắt.</p>}

        {state.mode === 'plane' ? (
          <>
            <div className="grid grid-cols-4 gap-1">
              {AXES.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={!state.normal && state.axis === a}
                  onClick={() => {
                    const bounds = axisBounds(a);
                    update({ axis: a, normal: null, position: bounds ? (bounds[0] + bounds[1]) / 2 : state.position });
                  }}
                  className={`py-1 rounded-md border text-2xs ${
                    !state.normal && state.axis === a
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {AXIS_LABELS[a]}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!!state.normal}
                disabled={!onAlignToFace}
                onClick={onAlignToFace}
                data-tooltip="Bấm một mặt trên mô hình để đặt mặt cắt trùng mặt đó"
                className={`py-1 rounded-md border text-2xs disabled:opacity-40 ${
                  state.normal || aligning
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {aligning ? 'Đang chờ…' : 'Theo mặt'}
              </button>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400 mb-1">
                <span>Vị trí cắt (m)</span>
                <MetreInput
                  label="Vị trí mặt cắt theo mét"
                  value={state.position}
                  step={step}
                  onCommit={(v) => v !== null && update({ position: v })}
                />
              </div>
              <BimInput
                type="range"
                min={planeRange ? round(planeRange[0], step) - step : 0}
                max={planeRange ? round(planeRange[1], step) + step : 1}
                step={step}
                value={state.position}
                disabled={!planeRange}
                onChange={(e) => update({ position: Number(e.target.value) })}
                className="w-full accent-primary-600"
                aria-label="Vị trí mặt cắt"
              />
              {planeRange && (
                <div className="flex justify-between text-2xs text-slate-400 font-mono">
                  <span>{fmt(planeRange[0])} m</span>
                  <span>{fmt(planeRange[1])} m</span>
                </div>
              )}
            </div>
          </>
        ) : (
          AXES.map((a) => {
            const bounds = axisBounds(a);
            const [lo, hi] = state.box[a];
            const loValue = lo ?? bounds?.[0] ?? 0;
            const hiValue = hi ?? bounds?.[1] ?? 1;
            const axisStep = bounds ? sliderStep(bounds[1] - bounds[0]) : 0.01;
            return (
              <div key={a}>
                <div className="flex items-center justify-between gap-1 text-slate-500 dark:text-slate-400 mb-1">
                  <span className="shrink-0">{AXIS_LABELS[a]}</span>
                  <span className="flex items-center gap-1">
                    <MetreInput
                      label={`${AXIS_LABELS[a]} tối thiểu (m)`}
                      value={lo}
                      allowEmpty
                      step={axisStep}
                      placeholder={bounds ? fmt(bounds[0]) : ''}
                      onCommit={(v) => setBox(a, [v === null ? null : Math.min(v, hiValue - 0.01), hi])}
                    />
                    <span>→</span>
                    <MetreInput
                      label={`${AXIS_LABELS[a]} tối đa (m)`}
                      value={hi}
                      allowEmpty
                      step={axisStep}
                      placeholder={bounds ? fmt(bounds[1]) : ''}
                      onCommit={(v) => setBox(a, [lo, v === null ? null : Math.max(v, loValue + 0.01)])}
                    />
                  </span>
                </div>
                {bounds && (
                  <div className="flex items-center gap-2">
                    <BimInput
                      type="range"
                      min={bounds[0]}
                      max={bounds[1]}
                      step={axisStep}
                      value={loValue}
                      onChange={(e) => {
                        const v = Math.min(Number(e.target.value), hiValue - 0.01);
                        setBox(a, [v <= bounds[0] + axisStep / 2 ? null : v, hi]);
                      }}
                      className="w-full accent-primary-600"
                      aria-label={`${AXIS_LABELS[a]} tối thiểu`}
                    />
                    <BimInput
                      type="range"
                      min={bounds[0]}
                      max={bounds[1]}
                      step={axisStep}
                      value={hiValue}
                      onChange={(e) => {
                        const v = Math.max(Number(e.target.value), loValue + 0.01);
                        setBox(a, [lo, v >= bounds[1] - axisStep / 2 ? null : v]);
                      }}
                      className="w-full accent-primary-600"
                      aria-label={`${AXIS_LABELS[a]} tối đa`}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}

        {onPickStorey && storeys.length > 0 && (
          <div className="space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
            <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <Layers className="w-3.5 h-3.5" /> {state.mode === 'plane' ? 'Cắt ngang theo tầng' : 'Hộp cắt một tầng'}
            </label>
            <div className="flex items-center gap-1.5">
              <BimSelect
                aria-label="Chọn tầng để cắt"
                value={storey}
                onChange={(e) => setStorey(e.target.value)}
                className="flex-1 min-w-0 px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              >
                <option value="">Chọn tầng…</option>
                {storeys.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </BimSelect>
              <button
                type="button"
                onClick={pickStorey}
                disabled={!storey || storeyBusy}
                className="px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 flex items-center gap-1"
              >
                {storeyBusy && <Loader2 className="w-3 h-3 animate-spin" />} Cắt
              </button>
            </div>
            {state.mode === 'plane' && (
              <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                <span>Cao hơn mặt sàn (m)</span>
                <MetreInput
                  label="Độ cao cắt trên mặt sàn (m)"
                  value={storeyOffset}
                  step={0.1}
                  onCommit={(v) => v !== null && v >= 0 && setStoreyOffset(v)}
                />
              </div>
            )}
            {storeyError && (
              <p role="alert" className="text-rose-600 dark:text-rose-400 leading-snug">
                {storeyError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {onCutAtSelection && (
            <button
              type="button"
              onClick={onCutAtSelection}
              disabled={selectionCount === 0}
              className={`${toggleBtn(false)} disabled:opacity-40`}
            >
              <Focus className="w-3.5 h-3.5" />
              {state.mode === 'plane' ? 'Cắt qua cấu kiện đang chọn' : 'Hộp cắt bao cấu kiện đang chọn'}
            </button>
          )}
          {onToggleDragOnModel && (
            <button type="button" onClick={onToggleDragOnModel} className={toggleBtn(!!dragOnModel)}>
              <Move3D className="w-3.5 h-3.5" />
              {state.mode === 'plane'
                ? dragOnModel
                  ? 'Đang bật tay kéo trên mô hình'
                  : 'Kéo mặt cắt trên mô hình'
                : dragOnModel
                  ? 'Đang bật: kéo 6 mặt hộp trên mô hình'
                  : 'Kéo 6 mặt hộp trên mô hình'}
            </button>
          )}
          {state.mode === 'plane' && (
            <button type="button" onClick={() => update({ flip: !state.flip })} className={toggleBtn(false)}>
              <FlipVertical2 className="w-3.5 h-3.5" /> Đảo phía giữ lại
            </button>
          )}
          {state.mode === 'plane' && onAlignToFace && state.normal && (
            <p className="flex items-start gap-1.5 text-2xs text-slate-500 dark:text-slate-400">
              <MousePointerClick className="w-3.5 h-3.5 shrink-0 mt-px" /> Mặt cắt đang canh theo mặt đã bấm; chọn một
              trục để quay về cắt thẳng.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-slate-600 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <BimInput
                type="checkbox"
                className="accent-rose-600"
                checked={state.outline !== false}
                onChange={(e) => update({ outline: e.target.checked })}
              />
              Tô viền đỏ tại chỗ cắt
            </label>
            <label
              className="flex items-center gap-2 cursor-pointer"
              data-tooltip="Tô kín mặt cắt của từng cấu kiện bằng vân gạch chéo, màu theo bộ môn"
            >
              <BimInput
                type="checkbox"
                className="accent-slate-600"
                checked={state.caps !== false}
                onChange={(e) => update({ caps: e.target.checked })}
              />
              Nắp cắt
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
