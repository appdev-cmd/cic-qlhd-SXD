import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { matchesSmartSearch } from '../../lib/smartSearch';

export interface Option {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

export interface SearchableSelectProps {
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSearchChange?: (query:string)=>void;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Chọn một mục...',
  className,
  disabled = false,
  onSearchChange,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Lọc options dựa trên smart search
  const filteredOptions = onSearchChange ? options : options.filter(
    (opt) =>
      matchesSmartSearch(opt.label, searchQuery) ||
      (opt.sublabel && matchesSmartSearch(opt.sublabel, searchQuery))
  );
  useEffect(()=>{onSearchChange?.(searchQuery);},[searchQuery,onSearchChange]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative w-full text-sm', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between w-full min-h-[38px] px-3 py-1.5 rounded-lg border text-left transition-all',
          'bg-surface border-border hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
          disabled && 'opacity-50 cursor-not-allowed bg-subtle'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-ink-muted')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className={cn('ml-2 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[220px] max-h-64 rounded-xl border border-border bg-surface shadow-xl z-50 overflow-hidden flex flex-col animate-fade-in">
          <div className="p-2 border-b border-border bg-subtle relative flex items-center">
            <Search size={14} className="absolute left-4 text-ink-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Gõ tìm kiếm (có thể gõ tắt: sxd, cdt...)..."
              className="w-full pl-8 pr-7 py-1 text-xs rounded-md border border-border bg-surface text-ink outline-none focus:border-primary-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 text-ink-muted hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-ink-muted italic">
                Không tìm thấy kết quả phù hợp
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'flex items-center justify-between w-full px-3 py-2 text-xs rounded-md text-left transition-colors',
                      isSelected
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                        : 'text-ink hover:bg-subtle'
                    )}
                  >
                    <div className="flex flex-col truncate">
                      <span>{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-3xs text-ink-muted truncate">{opt.sublabel}</span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-primary-500 ml-2 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
