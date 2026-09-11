"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, ChevronDown, Plus } from 'lucide-react';
import { smartSearchFilter, smartSearchScore, sortBySearchRelevance, prepareSearchQuery } from '@/lib/smartSearch';

export interface Option {
    id: string;
    name: string;
    subText?: string;
    badge?: string;
    badgeColor?: string;
    searchText?: string;
    /** Giật cấp thụt vào dành cho biến thể / mục con */
    indent?: boolean;
    icon?: React.ReactNode;
}

export interface SearchableSelectProps {
    value: string | null;
    onChange: (id: string | null, option?: Option) => void;
    /** Async search handler (optional if static options is provided) */
    onSearch?: (query: string) => Promise<Option[]>;
    /** Static options array (optional if onSearch is provided) */
    options?: Option[];
    placeholder?: string;
    label?: React.ReactNode;
    required?: boolean;
    disabled?: boolean;
    initialOptions?: Option[];
    getDisplayValue?: (id: string) => string | undefined;
    /** Gọi khi bấm nút thêm mới — nhận luôn từ khóa đang gõ để form con điền sẵn */
    onAddNew?: (query?: string) => void;
    addNewLabel?: string;
    extraActions?: { label: string; onClick: () => void; icon?: React.ReactNode; className?: string }[];
    size?: 'sm' | 'md';
    /** Minimum width for dropdown (default: 280px) */
    dropdownMinWidth?: number;
    className?: string;
    /** Custom content rendered at the bottom of the dropdown (e.g., inline text input for "Khác...") */
    renderFooter?: React.ReactNode | ((helpers: { close: () => void }) => React.ReactNode);
    /** Hide the search input in the dropdown (useful when there are very few options) */
    hideSearch?: boolean;
}

const optionFields = (opt: Option): Array<string | null | undefined> => [opt.name, opt.searchText, opt.subText, opt.badge];

/** Gom danh sách phẳng thành các nhóm: 1 mục cha + các mục con thụt cấp ngay sau nó */
function groupOptions(options: Option[]): Option[][] {
    const groups: Option[][] = [];
    for (const opt of options) {
        if (!opt.indent || groups.length === 0) groups.push([opt]);
        else groups[groups.length - 1].push(opt);
    }
    return groups;
}

/**
 * Lọc + xếp hạng danh sách lựa chọn, GIỮ NGUYÊN cấu trúc cây.
 *
 * Với danh sách có mục con thụt cấp (ví dụ Sản phẩm gốc → các biến thể):
 *   • Nhóm nào có ít nhất 1 thành viên khớp thì giữ lại.
 *   • Trong nhóm, nếu CÓ mục con khớp thì chỉ giữ đúng những mục con đó
 *     (gõ "enjicad network" không hiện kèm bản Standalone);
 *     nếu chỉ mỗi mục cha khớp thì giữ toàn bộ mục con để người dùng chọn tiếp.
 *   • Xếp hạng theo NHÓM để mục con không bị tách rời khỏi mục cha.
 */
function filterAndRankOptions(options: Option[], query: string, filterOut: boolean): Option[] {
    const q = prepareSearchQuery(query);
    if (q.isEmpty) return options;

    const hasTree = options.some(o => o.indent);
    if (!hasTree) {
        return filterOut
            ? smartSearchFilter(options, query, optionFields)
            : sortBySearchRelevance(options, query, optionFields);
    }

    const ranked: Array<{ items: Option[]; score: number; index: number }> = [];
    groupOptions(options).forEach((group, index) => {
        const [parent, ...children] = group;
        const parentScore = smartSearchScore(query, ...optionFields(parent));
        const matchedChildren = children.filter(c => smartSearchScore(query, ...optionFields(c)) > 0);
        const bestChildScore = matchedChildren.reduce(
            (max, c) => Math.max(max, smartSearchScore(query, ...optionFields(c))), 0);

        if (parentScore === 0 && matchedChildren.length === 0) {
            if (filterOut) return;                       // cả nhóm không liên quan
            ranked.push({ items: group, score: 0, index });
            return;
        }
        // Có mục con khớp thì chỉ hiện đúng mục con đó; không thì giữ nguyên cả nhóm
        const items = matchedChildren.length > 0 ? [parent, ...matchedChildren] : group;
        ranked.push({ items, score: Math.max(parentScore, bestChildScore), index });
    });

    ranked.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return ranked.flatMap(r => r.items);
}

/**
 * Searchable select with support for both static options & async search.
 * Supports Vietnamese diacritics removal for smart matching.
 * Dropdown rendered via Portal to avoid clipping by overflow containers.
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
    value,
    onChange,
    onSearch,
    options: staticOptions,
    placeholder = 'Chọn...',
    label,
    required = false,
    disabled = false,
    initialOptions = [],
    getDisplayValue,
    onAddNew,
    addNewLabel = 'Thêm mới',
    extraActions,
    size = 'md',
    dropdownMinWidth = 280,
    className = '',
    renderFooter,
    hideSearch = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [asyncOptions, setAsyncOptions] = useState<Option[]>(initialOptions);
    const [isLoading, setIsLoading] = useState(false);
    const [displayValue, setDisplayValue] = useState<string>('');
    const [selectedOption, setSelectedOption] = useState<Option | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<any>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ top: 0, left: 0, width: 280 });

    // Determine the source of options
    const allOptions = useMemo(() => {
        return staticOptions || asyncOptions;
    }, [staticOptions, asyncOptions]);

    // Client-side filtered options: Display & filter strictly on base options if provided
    const filteredOptions = useMemo(() => {
        const q = query.trim();

        // 1. Khi có onSearch và người dùng đã gõ từ khóa: ưu tiên hiển thị kết quả từ async search
        if (onSearch && q.length >= 2) {
            return filterAndRankOptions(asyncOptions, q, false);
        }

        const baseOptions = (staticOptions && staticOptions.length > 0) ? staticOptions : initialOptions;

        // 2. Nếu có danh sách có sẵn (baseOptions) và không ở chế độ async search đang có kết quả:
        if (baseOptions && baseOptions.length > 0) {
            if (!q) return baseOptions;
            // Tìm kiếm thông minh: không dấu, đa từ khóa rời rạc, hỗ trợ viết tắt
            // ("Cty CP CIC" / "công nghệ CIC" đều ra "Công ty Cổ phần Công nghệ và Tư vấn CIC")
            // và sắp xếp kết quả sát nghĩa nhất lên đầu danh sách.
            return filterAndRankOptions(baseOptions, q, true);
        }

        // 3. Dự phòng nếu chỉ dùng asyncOptions
        if (!q) return asyncOptions;

        // Kết quả async do server trả về: giữ nguyên tập kết quả, chỉ xếp lại theo độ khớp
        // (danh sách dạng cây thì xếp theo nhóm để mục con không rời khỏi mục cha)
        return filterAndRankOptions(asyncOptions, q, false);
    }, [onSearch, asyncOptions, staticOptions, initialOptions, query]);

    // Update display value when value changes
    useEffect(() => {
        let newDisplay = '';
        let newOption: Option | null = selectedOption;

        if (value !== undefined && value !== null && value !== '') {
            if (getDisplayValue) {
                const customDisplay = getDisplayValue(value);
                if (customDisplay) {
                    newDisplay = customDisplay;
                }
            }

            if (!newDisplay) {
                if (selectedOption && selectedOption.id === value) {
                    newDisplay = selectedOption.name;
                } else {
                    const searchList = staticOptions || (asyncOptions.length ? asyncOptions : initialOptions);
                    const found = searchList.find(o => o.id === value) || initialOptions.find(o => o.id === value);
                    if (found) {
                        newOption = found;
                        newDisplay = found.name;
                    } else if (selectedOption && selectedOption.name) {
                        newDisplay = selectedOption.name;
                    } else {
                        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
                        newDisplay = isUuid ? 'Đang tải...' : value;
                    }
                }
            }
        } else {
            newOption = null;
            newDisplay = '';
        }

        if (displayValue !== newDisplay) {
            setDisplayValue(newDisplay);
        }
        if (selectedOption?.id !== newOption?.id || selectedOption?.name !== newOption?.name) {
            setSelectedOption(newOption);
        }
    }, [value, staticOptions, asyncOptions, initialOptions, getDisplayValue]);

    // Async sync of initial options
    useEffect(() => {
        const base = (staticOptions && staticOptions.length > 0) ? staticOptions : initialOptions;
        if (onSearch && (!query || query.length < 2)) {
            const isDifferent = base.length !== asyncOptions.length ||
                base.some((opt, idx) => opt.id !== asyncOptions[idx]?.id || opt.name !== asyncOptions[idx]?.name);
            if (isDifferent) {
                setAsyncOptions(base);
            }
        }
    }, [onSearch, staticOptions, initialOptions, query, asyncOptions]);

    // Auto-focus search input when opened
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        } else {
            setQuery('');
        }
    }, [isOpen]);

    // Calculate dropdown position
    const updatePosition = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const width = Math.max(rect.width, dropdownMinWidth);
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;
            const dropdownHeight = 350;
            const gap = 4;

            let top: number | undefined = undefined;
            let bottom: number | undefined = undefined;

            if (rect.bottom + gap + dropdownHeight > viewportH && rect.top - gap - dropdownHeight > 0) {
                bottom = viewportH - rect.top + gap;
            } else {
                top = rect.bottom + gap;
            }

            let left = rect.left;
            if (left + width > viewportW - 8) {
                left = viewportW - width - 8;
            }
            left = Math.max(8, left);

            setDropdownPos({ top, bottom, left, width });
        }
    }, [dropdownMinWidth]);

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
    }, [isOpen, updatePosition]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                containerRef.current && !containerRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Handle query change for search
    const handleQueryChange = useCallback((newQuery: string) => {
        setQuery(newQuery);

        if (!onSearch) return;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (newQuery.length < 2) {
            const base = (staticOptions && staticOptions.length > 0) ? staticOptions : initialOptions;
            setAsyncOptions(base);
            return;
        }

        setIsLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const results = await onSearch(newQuery);
                setAsyncOptions(results);
            } catch (err) {
                console.error('[SearchableSelect] Search error:', err);
                setAsyncOptions([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);
    }, [onSearch, initialOptions]);

    const handleSelect = (option: Option) => {
        setSelectedOption(option);
        onChange(option.id, option);
        setDisplayValue(option.name);
        setIsOpen(false);
        setQuery('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedOption(null);
        onChange(null);
        setDisplayValue('');
        setQuery('');
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {label && (
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
            )}

            {/* Display Button */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-slate-200/50 dark:bg-slate-900 border border-slate-300/50 dark:border-slate-700/60 rounded-lg text-left text-sm font-medium transition-all ${
                    size === 'sm' ? 'px-3 py-2' : 'px-4 py-3'
                } ${
                    disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-indigo-300 dark:hover:border-indigo-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30'
                } ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/30' : ''}`}
            >
                <span className={`truncate ${displayValue ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                    {displayValue || placeholder}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {value && !disabled && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={handleClear}
                            onKeyDown={(e) => e.key === 'Enter' && handleClear(e as any)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                            <X size={14} className="text-slate-400" />
                        </span>
                    )}
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown via Portal */}
            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    data-portal-dropdown="true"
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        bottom: dropdownPos.bottom,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        zIndex: 9999,
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                    {/* Search Input */}
                    {!hideSearch && (
                    <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => handleQueryChange(e.target.value)}
                                placeholder={(onSearch && !(staticOptions?.length || initialOptions?.length)) ? "Gõ tìm kiếm (ít nhất 2 ký tự)..." : "Gõ để tìm kiếm..."}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none transition-colors"
                            />
                            {isLoading && (
                                <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" />
                            )}
                        </div>
                    </div>
                    )}

                    {/* Options List */}
                    <div className="max-h-64 overflow-y-auto p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-slate-400">
                                {onSearch && query.length < 2 && !(staticOptions?.length || initialOptions?.length) ? 'Nhập để tìm kiếm...' : 'Không tìm thấy kết quả'}
                            </div>
                        ) : (
                            filteredOptions.map((option) => {
                                const isIndent = !!option.indent;
                                const isSelected = value === option.id;

                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleSelect(option)}
                                        className={`text-left transition-all ${
                                            isIndent
                                                ? `w-[calc(100%-1rem)] ml-4 pl-5 pr-3 py-1.5 my-0.5 border-l-2 border-indigo-400 dark:border-indigo-500 rounded-r-md ${
                                                    isSelected
                                                        ? 'bg-indigo-100/70 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'bg-slate-50/60 dark:bg-slate-800/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300'
                                                }`
                                                : `w-full px-3.5 py-2 my-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                                    isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                                                }`
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {option.icon}
                                                <p className={`truncate ${
                                                    isIndent
                                                        ? (isSelected ? 'text-xs font-bold text-indigo-700 dark:text-indigo-300' : 'text-xs font-semibold text-slate-700 dark:text-slate-200')
                                                        : (isSelected ? 'text-sm font-bold text-indigo-600 dark:text-indigo-400' : 'text-sm font-bold text-slate-800 dark:text-slate-100')
                                                }`}>
                                                    {option.name}
                                                </p>
                                            </div>
                                            {option.badge && (
                                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                                                    option.badgeColor || (option.badge.includes('Cá nhân') ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300')
                                                }`}>
                                                    {option.badge}
                                                </span>
                                            )}
                                        </div>
                                        {option.subText && (
                                            <p className={`mt-0.5 truncate ${
                                                isIndent
                                                    ? 'text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pl-0.5'
                                                    : 'text-xs text-slate-400'
                                            }`}>
                                                {option.subText}
                                            </p>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Add New Button / Extra Actions */}
                    {(onAddNew || (extraActions && extraActions.length > 0)) && (
                        <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-1.5">
                            {onAddNew && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(false);
                                        onAddNew(query.trim());
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                                >
                                    <Plus size={14} />
                                    {addNewLabel?.replace(/^\+\s*/, '')}
                                </button>
                            )}
                            {extraActions?.map((act, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(false);
                                        act.onClick();
                                    }}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-colors cursor-pointer ${
                                        act.className || 'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400'
                                    }`}
                                >
                                    {act.icon || <Plus size={14} />}
                                    {act.label?.replace(/^\+\s*/, '')}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Custom Footer Content (e.g., inline text input) */}
                    {renderFooter && (
                        <div className="border-t border-slate-100 dark:border-slate-800 p-2">
                            {typeof renderFooter === 'function' ? renderFooter({ close: () => setIsOpen(false) }) : renderFooter}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default SearchableSelect;
