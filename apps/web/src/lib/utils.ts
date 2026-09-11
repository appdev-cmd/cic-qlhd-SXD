import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  try {
    return format(new Date(date), "dd/MM/yyyy", { locale: vi });
  } catch {
    return "";
  }
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  try {
    return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: vi });
  } catch {
    return "";
  }
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "0 VNĐ";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0 VNĐ";
  return new Intl.NumberFormat("vi-VN").format(num) + " VNĐ";
}

export function formatNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("vi-VN").format(num);
}

export function parseFormattedNumber(val: string): number {
  if (!val) return 0;
  // Bỏ tất cả ký tự không phải số
  const cleaned = val.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : 0;
}

