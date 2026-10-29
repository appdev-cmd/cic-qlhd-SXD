import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTheme, PRIMARY_COLORS } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

/** Ô màu: nền tối của bộ (màu menu trái) + chấm màu nhấn ở góc — giống cic-hud. */
function Swatch({ base, accent, active }: { base: string; accent: string; active?: boolean }) {
  return (
    <span
      className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/5 dark:border-white/10"
      style={{ backgroundColor: base }}
    >
      {active && <Check className="h-3.5 w-3.5 text-white dark:text-white" strokeWidth={3} />}
      <span
        className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-surface dark:border-slate-800"
        style={{ backgroundColor: accent }}
      />
    </span>
  );
}

/**
 * Chọn bộ màu chủ đạo (12 bộ hai tông — src/config/palettes.ts, đồng bộ cic-hud).
 * Thu gọn: chỉ hiện bộ đang chọn; bấm để mở danh sách.
 */
export function PalettePicker({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { primaryColor, setPrimaryColor } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const current = PRIMARY_COLORS.find((c) => c.id === primaryColor) ?? PRIMARY_COLORS[0];

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Chọn bộ màu chủ đạo"
        className="flex w-full items-center gap-2.5 rounded-lg bg-muted dark:bg-slate-800 px-2 py-1.5 text-left transition-colors hover:bg-subtle dark:hover:bg-slate-700 cursor-pointer"
      >
        <Swatch base={current.base} accent={current.accent} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-ink dark:text-slate-100">{current.name}</span>
          <span className="block truncate text-2xs text-ink-muted dark:text-slate-400">{current.description}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-muted dark:text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div role="listbox" aria-label="Danh sách bộ màu chủ đạo" className="max-h-72 space-y-0.5 overflow-y-auto pt-1">
          {PRIMARY_COLORS.map((c) => {
            const active = c.id === primaryColor;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => setPrimaryColor(c.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer',
                  active ? 'bg-primary-50 dark:bg-slate-800' : 'hover:bg-muted dark:hover:bg-slate-800',
                )}
              >
                <Swatch base={c.base} accent={c.accent} active={active} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-ink dark:text-slate-100">{c.name}</span>
                  <span className="block truncate text-2xs text-ink-muted dark:text-slate-400">{c.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
