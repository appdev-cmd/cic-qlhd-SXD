import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Định dạng số tiền sang VNĐ chuẩn
 * Ví dụ: 12500000000 -> 12.500.000.000 VNĐ
 */
export function formatCurrency(amount: number | string | undefined | null): string {
  if (amount == null || amount === '') return '0 VNĐ';
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
  if (isNaN(num)) return '0 VNĐ';
  return num.toLocaleString('vi-VN') + ' VNĐ';
}

/**
 * Định dạng số tỷ đồng rút gọn
 * Ví dụ: 12500000000 -> 12,50 tỷ
 */
export function formatBillion(amount: number | undefined | null): string {
  if (!amount) return '0 tỷ';
  const bil = amount / 1_000_000_000;
  return bil.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
}

/**
 * Định dạng ngày tháng theo chuẩn Việt Nam dd/MM/yyyy
 */
export function formatDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Định dạng ngày giờ dd/MM/yyyy HH:mm
 */
export function formatDateTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return String(dateStr);
  }
}
