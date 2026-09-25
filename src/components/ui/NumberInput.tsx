import React from 'react';
import { cn } from '../../lib/utils';

export interface NumberInputProps {
  value: number | string | undefined | null;
  onChange: (value: number) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
  disabled?: boolean;
}

export function NumberInput({
  value,
  onChange,
  placeholder = '0',
  suffix = 'VNĐ',
  className,
  disabled = false,
}: NumberInputProps) {
  const formatDisplay = (val: number | string | undefined | null) => {
    if (val == null || val === '') return '';
    const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : val;
    if (isNaN(num)) return '';
    return num.toLocaleString('vi-VN');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    const numVal = rawVal === '' ? 0 : parseInt(rawVal, 10);
    onChange(numVal);
  };

  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <input
        type="text"
        disabled={disabled}
        value={formatDisplay(value)}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-1.5 rounded-lg border text-sm text-right pr-14 outline-none transition-all font-mono',
          'bg-surface border-border text-ink focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
          disabled && 'opacity-50 cursor-not-allowed bg-subtle'
        )}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-semibold text-ink-muted pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
