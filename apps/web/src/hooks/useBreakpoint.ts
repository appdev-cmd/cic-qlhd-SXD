import { useState, useEffect } from 'react';

/**
 * Breakpoint thống nhất cho toàn hệ thống — khớp với Tailwind config.
 * Dùng làm nguồn chân lý duy nhất thay cho việc rải rác `window.innerWidth < 768`.
 */
export const BREAKPOINTS = {
    sm: 640,   // điện thoại ngang
    md: 768,   // tablet dọc — mốc chuyển bảng ↔ card, sidebar drawer ↔ cố định
    lg: 1024,  // tablet ngang / desktop nhỏ
    xl: 1280,  // desktop
    '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** SSR-safe: lần render đầu (chưa có window) coi như desktop để tránh nhấp nháy layout. */
const getMatches = (query: string): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
};

/**
 * Trả về true khi viewport KHỚP media query.
 * @example const isWide = useMediaQuery('(min-width: 1024px)')
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => getMatches(query));

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        onChange(); // đồng bộ ngay lần mount (phòng giá trị khởi tạo SSR sai)
        // addEventListener('change') được hỗ trợ rộng rãi; fallback addListener cho Safari cũ.
        if (mql.addEventListener) {
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        } else {
            mql.addListener(onChange);
            return () => mql.removeListener(onChange);
        }
    }, [query]);

    return matches;
}

/**
 * true khi viewport < breakpoint (mặc định 'md' = 768px → điện thoại + tablet dọc nhỏ).
 * Đây là cách kiểm tra "có phải mobile" chuẩn cho toàn app.
 * @example const isMobile = useIsMobile();           // < 768
 * @example const isPhone  = useIsMobile('sm');        // < 640
 */
export function useIsMobile(below: Breakpoint = 'md'): boolean {
    return useMediaQuery(`(max-width: ${BREAKPOINTS[below] - 0.02}px)`);
}

/**
 * Tên breakpoint hiện tại của viewport ('xs' khi nhỏ hơn 'sm').
 * Dùng khi cần phân nhánh nhiều mức (vd chọn số cột theo từng dải).
 */
export function useBreakpoint(): 'xs' | Breakpoint {
    const isSm = useMediaQuery(`(min-width: ${BREAKPOINTS.sm}px)`);
    const isMd = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`);
    const isLg = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
    const isXl = useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`);
    const is2xl = useMediaQuery(`(min-width: ${BREAKPOINTS['2xl']}px)`);

    if (is2xl) return '2xl';
    if (isXl) return 'xl';
    if (isLg) return 'lg';
    if (isMd) return 'md';
    if (isSm) return 'sm';
    return 'xs';
}
