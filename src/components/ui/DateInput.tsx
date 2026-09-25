import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';

export interface DateInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  className,
  disabled = false,
}: DateInputProps) {
  const [textValue, setTextValue] = useState(value ? formatDate(value) : '');

  useEffect(() => {
    setTextValue(value ? formatDate(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9/]/g, '');
    if (val.length === 2 && !val.includes('/')) val += '/';
    if (val.length === 5 && val.split('/').length === 2) val += '/';
    if (val.length > 10) val = val.substring(0, 10);
    setTextValue(val);

    if (val === '') {
      onChange('');
      return;
    }

    if (val.length === 10) {
      const parts = val.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
          onChange(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
      }
    }
  };

  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <input
        type="text"
        disabled={disabled}
        value={textValue}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={10}
        className={cn(
          'w-full pl-9 pr-3 py-1.5 rounded-lg border text-sm outline-none transition-all',
          'bg-surface border-border text-ink focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
          disabled && 'opacity-50 cursor-not-allowed bg-subtle'
        )}
      />
      <CalendarIcon size={15} className="absolute left-3 text-ink-muted pointer-events-none" />
    </div>
  );
}
