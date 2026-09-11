"use client";

import React, { useState, useRef, useEffect } from 'react';

interface DateInputProps {
    value: string; // YYYY-MM-DD
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
}

/**
 * Custom date input that always displays dd/mm/yyyy format.
 * Internally stores YYYY-MM-DD for DB compatibility.
 * Calendar icon button opens native date picker.
 */
const DateInput: React.FC<DateInputProps> = ({ value, onChange, placeholder = 'dd/mm/yyyy', className = '', readOnly = false }) => {
    const hiddenRef = useRef<HTMLInputElement>(null);

    // Convert YYYY-MM-DD → dd/mm/yyyy for display
    const formatDisplay = (isoDate: string): string => {
        if (!isoDate) return '';
        const parts = isoDate.split('-');
        if (parts.length !== 3) return isoDate;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    // Convert dd/mm/yyyy → YYYY-MM-DD for storage
    const parseDisplay = (display: string): string => {
        const clean = display.replace(/[^0-9/]/g, '');
        const parts = clean.split('/');
        if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return '';
    };

    const [displayValue, setDisplayValue] = useState(formatDisplay(value));

    useEffect(() => {
        setDisplayValue(formatDisplay(value));
    }, [value]);

    // Auto-format as user types: add slashes at positions 2 and 5
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(/[^0-9/]/g, '');

        // Auto-insert slashes
        if (raw.length === 2 && !raw.includes('/')) raw += '/';
        if (raw.length === 5 && raw.split('/').length === 2) raw += '/';

        // Limit length
        if (raw.length > 10) raw = raw.slice(0, 10);

        setDisplayValue(raw);

        // Try to parse complete date
        const iso = parseDisplay(raw);
        if (iso) {
            onChange(iso);
        } else if (raw === '') {
            onChange('');
        }
    };

    // Open native date picker when clicking calendar icon
    const openPicker = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        hiddenRef.current?.showPicker?.();
        hiddenRef.current?.focus();
    };

    // Handle native picker selection
    const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const iso = e.target.value;
        onChange(iso);
        setDisplayValue(formatDisplay(iso));
    };

    const defaultInputStyle = "w-full px-3 py-1.5 pr-8 text-sm rounded-lg border border-slate-300/50 dark:border-slate-700/60 bg-slate-200/50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors";
    const combinedClassName = `${defaultInputStyle} ${className}`.trim();

    return (
        <div className="relative inline-block">
            <input
                type="text"
                value={displayValue}
                onChange={handleTextChange}
                placeholder={placeholder}
                className={combinedClassName}
                maxLength={10}
                readOnly={readOnly}
            />
            {/* Calendar icon button to open native picker */}
            <button
                type="button"
                onClick={openPicker}
                disabled={readOnly}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                tabIndex={-1}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
            </button>
            {/* Hidden native date input for calendar popup — positioned off-screen */}
            <input
                ref={hiddenRef}
                type="date"
                value={value}
                onChange={handlePickerChange}
                className="absolute w-0 h-0 opacity-0 overflow-hidden dark:[color-scheme:dark]"
                style={{ left: 'calc(100% - 32px)', top: '50%' }}
                tabIndex={-1}
            />
        </div>
    );

};

export default DateInput;
