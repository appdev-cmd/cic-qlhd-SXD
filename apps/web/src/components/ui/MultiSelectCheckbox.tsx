"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { smartSearchFilter } from '@/lib/smartSearch';

export interface MultiSelectOption {
  id: string;
  label: string;
}
export type Option = MultiSelectOption;

type Accent = 'sky' | 'orange';

const ACCENT_STYLES: Record<Accent, {
  chip: string;
  chipRemove: string;
  trigger: string;
  triggerOpen: string;
  checkbox: string;
}> = {
  sky: {
    chip: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
    chipRemove: 'hover:bg-sky-200 dark:hover:bg-sky-800',
    trigger: 'hover:border-sky-400 dark:hover:border-sky-500 focus:border-sky-500',
    triggerOpen: 'border-sky-500 dark:border-sky-500',
    checkbox: 'text-sky-500 accent-sky-500 focus:ring-sky-500',
  },
  orange: {
    chip: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    chipRemove: 'hover:bg-orange-200 dark:hover:bg-orange-800',
    trigger: 'hover:border-orange-400 dark:hover:border-orange-500 focus:border-orange-500',
    triggerOpen: 'border-orange-500 dark:border-orange-500',
    checkbox: 'text-orange-500 accent-orange-500 focus:ring-orange-500',
  },
};

export interface MultiSelectCheckboxProps {
  options: Option[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Color theme for chips/borders/checkboxes. Defaults to 'sky'. */
  accent?: Accent;
  /** Show a search box inside the dropdown. Auto-enabled when options.length > 8 if left undefined. */
  searchable?: boolean;
}

const MultiSelectCheckbox: React.FC<MultiSelectCheckboxProps> = ({
  options,
  selectedIds,
  onChange,
  placeholder = 'Chọn...',
  disabled = false,
  accent = 'sky',
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 200 });

  const styles = ACCENT_STYLES[accent];
  const showSearch = searchable ?? options.length > 8;

  const filteredOptions = useMemo(() => {
    // Tìm kiếm thông minh: không dấu, đa từ khóa, viết tắt; kết quả sát nhất lên đầu
    return smartSearchFilter(options, search, opt => [opt.label]);
  }, [options, search]);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const top = rect.bottom + 4;
      setDropdownPos({ top, left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Reset the in-dropdown search whenever the dropdown closes
  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const removeOption = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onChange(selectedIds.filter(selectedId => selectedId !== id));
  };

  const selectedOptions = options.filter(opt => selectedIds.includes(opt.id));

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-left text-sm font-medium transition-all min-h-[42px]
          ${disabled ? 'opacity-50 cursor-not-allowed' : `focus:outline-none ${styles.trigger}`}
          ${isOpen ? styles.triggerOpen : ''}
        `}
      >
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0 pr-2">
          {selectedOptions.length === 0 ? (
            <span className="text-slate-400 mt-0.5">{placeholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <div
                key={opt.id}
                className={`flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-sm text-xs font-normal ${styles.chip}`}
              >
                <span>{opt.label}</span>
                <div
                  onClick={(e) => removeOption(e, opt.id)}
                  className={`rounded-sm p-0.5 transition-colors cursor-pointer ${styles.chipRemove}`}
                >
                  <X size={12} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedIds.length > 0 && !disabled && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <X size={14} className="text-slate-400" />
            </div>
          )}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          data-portal-dropdown="true"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        >
          {showSearch && (
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm..."
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">
                {options.length === 0 ? 'Không có dữ liệu' : 'Không khớp kết quả'}
              </div>
            ) : (
              filteredOptions.map(option => (
                <label
                  key={option.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(option.id)}
                    onChange={() => toggleOption(option.id)}
                    className={`w-4 h-4 rounded border-slate-300 dark:border-slate-600 focus:ring-offset-0 dark:bg-slate-800 ${styles.checkbox}`}
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{option.label}</span>
                </label>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export { MultiSelectCheckbox };
export default MultiSelectCheckbox;
