/**
 * Formatters and text normalization utilities ported from CIC ERP
 * Standardized for Appraisal and Construction Management (Sở Xây dựng tỉnh Điện Biên)
 */

export function removeDiacritics(str?: string | null): string {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

export function toSlug(str: string): string {
    return removeDiacritics(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
}

export function generateSlug(str: string): string {
    return removeDiacritics(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function getTodayLocalDateString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function formatDate(date?: Date | string | number | null, fallback: string = '—'): string {
    if (!date) return fallback;
    try {
        const d = typeof date === 'object' ? date : new Date(date);
        if (isNaN(d.getTime())) return fallback;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return fallback;
    }
}

export function formatDateShort(date?: Date | string | number | null, fallback: string = '—'): string {
    if (!date) return fallback;
    try {
        const d = typeof date === 'object' ? date : new Date(date);
        if (isNaN(d.getTime())) return fallback;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}`;
    } catch {
        return fallback;
    }
}

export function formatDateTime(date?: Date | string | number | null, fallback: string = '—'): string {
    if (!date) return fallback;
    try {
        const d = typeof date === 'object' ? date : new Date(date);
        if (isNaN(d.getTime())) return fallback;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
        return fallback;
    }
}

export function formatCurrency(amount: number | string | null | undefined): string {
    if (amount === null || amount === undefined || amount === '') return '0 VNĐ';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0 VNĐ';
    return new Intl.NumberFormat('vi-VN').format(num) + ' VNĐ';
}

export const formatVND = formatCurrency;

export function formatNumber(val: number | string | null | undefined): string {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('vi-VN').format(num);
}

export function parseFormattedNumber(val: string): number {
    if (!val) return 0;
    const cleaned = val.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
}
