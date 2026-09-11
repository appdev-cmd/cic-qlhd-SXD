"use client";

import React from 'react';
import { cn, formatNumber, parseFormattedNumber } from '@/lib/utils';

export interface NumberInputProps {
    value?: number | string | null;
    onChange: (value: number) => void;
    placeholder?: string;
    className?: string;
    min?: number;
    max?: number;
    disabled?: boolean;
    id?: string;
    name?: string;
    required?: boolean;
    suffix?: string | null;
    showFormattedHint?: boolean;
    autoFocus?: boolean;
}

/**
 * Input component cho số với định dạng dấu chấm phân tách hàng nghìn
 * Mặc định hiển thị nhãn "VNĐ" nền mờ căn phải ô nhập liệu
 * Hiển thị: 1.000.000 VNĐ
 * Lưu trữ: 1000000
 */
const NumberInput: React.FC<NumberInputProps> = ({
    value,
    onChange,
    placeholder = '0',
    className = '',
    min,
    max,
    disabled = false,
    id,
    name,
    required = false,
    suffix = 'VNĐ',
    showFormattedHint = false,
    autoFocus = false,
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;

        // Loại bỏ tất cả ký tự không phải số
        const numericValue = parseFormattedNumber(inputValue);

        // Validate min/max
        if (min !== undefined && numericValue < min) return;
        if (max !== undefined && numericValue > max) return;

        onChange(numericValue);
    };

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const displayValue = (numValue !== undefined && numValue !== null && !isNaN(numValue) && numValue !== 0) 
        ? formatNumber(numValue) 
        : '';

    const paddingRightClass = suffix ? (suffix.length > 2 ? "pr-12" : "pr-9") : "";

    return (
        <div className="relative inline-block w-full">
            <input
                type="text"
                inputMode="numeric"
                id={id}
                name={name}
                value={displayValue}
                onChange={handleChange}
                placeholder={placeholder}
                disabled={disabled}
                required={required}
                autoFocus={autoFocus}
                className={cn(
                    "w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    className,
                    paddingRightClass
                )}
            />
            {suffix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 dark:text-slate-500 pointer-events-none select-none uppercase tracking-wider">
                    {suffix}
                </span>
            )}
            {showFormattedHint && numValue !== undefined && numValue !== null && numValue > 0 && (
                <p className="text-xs text-slate-400 mt-1">{formatNumber(numValue)} VNĐ</p>
            )}
        </div>
    );
};

export const CurrencyInput = NumberInput;
export default NumberInput;

