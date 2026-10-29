// Thay utils/format, utils/uiScale, utils/lazy, utils/postgrestFilter của cic-hud (cùng tên hàm mã BIM dùng).
import { lazy, type ComponentType } from 'react';
import { formatNumber } from '../../../lib/utils';

export function formatDate(value: string | Date | undefined | null): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** 1,25 tỷ · 350 tr · 12.000 VNĐ */
export function formatShortCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const value = Math.abs(amount);
  if (value >= 1_000_000_000) {
    const billions = value / 1_000_000_000;
    return `${sign}${formatNumber(billions, 3)} tỷ`;
  }
  if (value >= 1_000_000) return `${sign}${formatNumber(value / 1_000_000, 0)} tr`;
  return `${sign}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VNĐ`;
}

// cic-hud thu nhỏ cả trang bằng CSS zoom nên phải đổi px màn hình sang px CSS; BuildSIA không dùng zoom → tỷ lệ 1.
export const getUiZoom = () => 1;
export const toCssPx = (screenPx: number) => screenPx;
export const getCssRect = (element: Element) => element.getBoundingClientRect();
export const getViewportWidth = () => window.innerWidth;
export const getViewportHeight = () => window.innerHeight;
export const viewportCss = (value: string) => value;
export const onUiZoomChange = (listener: (zoom: number) => void) => {
  void listener;
  return () => {};
};

const chunkReloadKey = 'bim-chunk-reload-ts';
/** React.lazy, tải lại trang một lần (tối đa mỗi 20 giây) khi chunk cũ mất sau khi phát hành bản mới. */
export function lazyWithRetry<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(async (): Promise<{ default: ComponentType<P> }> => {
    try {
      return await load();
    } catch (error) {
      const message = error instanceof Error ? `${error.name} ${error.message}` : '';
      const chunkError = /ChunkLoadError|dynamically imported module|Importing a module script failed/.test(message);
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(chunkReloadKey) ?? 0);
      } catch {
        /* storage unavailable */
      }
      if (chunkError && Date.now() - last > 20_000) {
        try {
          sessionStorage.setItem(chunkReloadKey, String(Date.now()));
        } catch {
          /* storage unavailable */
        }
        window.location.reload();
        return { default: () => null };
      }
      throw error;
    }
  });
}

/** Đặt giá trị trong "..." theo cú pháp PostgREST để dấu phẩy, ngoặc trong từ khóa không làm vỡ `.or()`. */
export function quotePostgrestValue(value: string): string {
  return '"' + value.replace(/["\\]/g, (c) => '\\' + c) + '"';
}
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}
/** `ilikeAny(['name','code'], 'abc')` → `name.ilike."%abc%",code.ilike."%abc%"`; '' khi không có từ khóa. */
export function ilikeAny(columns: string[], term: string | null | undefined): string {
  if (!term) return '';
  const pattern = quotePostgrestValue(`%${escapeLikePattern(term)}%`);
  return columns.map((c) => `${c}.ilike.${pattern}`).join(',');
}
