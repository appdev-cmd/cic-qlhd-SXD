"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipState {
    visible: boolean;
    text: string;
    top: number;
    left: number;
    placement: 'top' | 'bottom';
}

/**
 * AutoTableTooltip — Hệ thống Tooltip Tự động Toàn năng (Global Tooltip System)
 * 
 * QUY TẮC HIỂN THỊ CHUẨN ERP:
 * 1. Triệt tiêu hoàn toàn Tooltip nền đen mặc định của trình duyệt (Browser Native Title Tooltip).
 * 2. KHÔNG hiện tooltip đối với các nội dung đã hiển thị đầy đủ 100% trên màn hình.
 * 3. CHỈ hiện tooltip khi:
 *    - Văn bản thực sự bị cắt ngắn / che mất 1 phần (Overflow: scrollWidth > clientWidth hoặc scrollHeight > clientHeight với line-clamp/overflow hidden).
 *    - Hoặc nút Icon-only / nhãn có thông tin giải thích bổ sung KHÁC BIỆT hẳn so với text hiển thị.
 * 4. Vị trí hiển thị: Chuẩn PHÍA TRÊN BÊN TRÁI (Top-Left placement) glassmorphism.
 */
export const AutoTableTooltip: React.FC = () => {
    const [tooltip, setTooltip] = useState<TooltipState>({
        visible: false,
        text: '',
        top: 0,
        left: 0,
        placement: 'top',
    });

    const currentElRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        // Kiểm tra xem 1 phần tử hoặc các phần tử liên quan có bị che mờ do phân quyền hay không
        const isElementMasked = (target: HTMLElement | null, candidate: HTMLElement | null): boolean => {
            if (!target && !candidate) return false;
            const nodes = [target, candidate];

            for (const startNode of nodes) {
                let el: HTMLElement | null = startNode;
                while (el && el !== document.body) {
                    if (el.getAttribute('data-masked') === 'true' || el.getAttribute('data-is-masked') === 'true') {
                        return true;
                    }

                    const className = typeof el.className === 'string' ? el.className : '';
                    if (
                        className.includes('blur') ||
                        (className.includes('aria-hidden') && className.includes('select-none'))
                    ) {
                        return true;
                    }

                    const titleVal = (
                        el.getAttribute('data-suppressed-title') ||
                        el.getAttribute('title') ||
                        el.getAttribute('data-tooltip') ||
                        ''
                    ).toLowerCase();

                    if (titleVal.includes('che mờ') || titleVal.includes('phân quyền') || titleVal.includes('bảo mật')) {
                        return true;
                    }

                    el = el.parentElement;
                }
            }

            if (candidate) {
                const maskedChild = candidate.querySelector('[data-masked="true"], [class*="blur"]');
                if (maskedChild) return true;
            }

            return false;
        };

        // Tự động gỡ thuộc tính `title` để trình duyệt KHÔNG BAO GIỜ hiện native black tooltip ở góc dưới phải
        const suppressTitleOnElement = (el: HTMLElement) => {
            const existingTitle = el.getAttribute('title');
            if (existingTitle) {
                if (!isElementMasked(el, null)) {
                    el.setAttribute('data-suppressed-title', existingTitle);
                }
                el.removeAttribute('title');
            }
        };

        const hideTooltip = () => {
            if (currentElRef.current) {
                setTooltip(prev => (prev.visible ? { ...prev, visible: false } : prev));
                currentElRef.current = null;
            }
        };

        // Kiểm tra xem 1 phần tử có bị tràn/cắt ngắn (Overflow) hay không
        const checkElementOverflow = (el: HTMLElement | null): boolean => {
            if (!el) return false;

            // 1. Tràn chiều ngang (Horizontal Overflow): scrollWidth > clientWidth (+2px buffer cho subpixel rendering)
            const hasHorizontalOverflow = el.scrollWidth > el.clientWidth + 2;

            // 2. Tràn chiều dọc (Vertical Overflow): CHỈ áp dụng khi có overflow: hidden hoặc class line-clamp
            const style = window.getComputedStyle(el);
            const isClamped =
                (style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '' && style.webkitLineClamp !== undefined) ||
                el.classList.contains('line-clamp-1') ||
                el.classList.contains('line-clamp-2') ||
                el.classList.contains('line-clamp-3');

            const hasOverflowStyle = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden';

            const hasVerticalOverflow = (isClamped || hasOverflowStyle) && (el.scrollHeight > el.clientHeight + 2);

            return hasHorizontalOverflow || hasVerticalOverflow;
        };

        // Tìm chính xác phần tử mang văn bản bị cắt ngắn (không leo lên container scrollable chung)
        const findOverflowElement = (target: HTMLElement, candidate: HTMLElement): HTMLElement | null => {
            // A. Kiểm tra target trực tiếp
            if (checkElementOverflow(target)) return target;

            // B. Kiểm tra candidate
            if (candidate !== target && checkElementOverflow(candidate)) return candidate;

            // C. Kiểm tra các thẻ con trực tiếp mang class truncate / line-clamp
            const truncatedChildren = candidate.querySelectorAll<HTMLElement>('.truncate, .line-clamp-1, .line-clamp-2, .line-clamp-3, [data-tooltip-auto]');
            for (let i = 0; i < truncatedChildren.length; i++) {
                if (checkElementOverflow(truncatedChildren[i])) {
                    return truncatedChildren[i];
                }
            }

            // D. Kiểm tra thẻ bọc gần nhất nếu là TD/TH hoặc có class truncate
            let parent = target.parentElement;
            while (parent && parent !== document.body && (parent.tagName === 'TD' || parent.tagName === 'TH' || parent.classList.contains('truncate'))) {
                if (checkElementOverflow(parent)) {
                    return parent;
                }
                if (parent === candidate) break;
                parent = parent.parentElement;
            }

            return null;
        };

        // Kiểm tra xem title có mang thông tin giải thích bổ sung khác biệt hay không
        const isSupplementaryTitle = (rawTitle: string, visibleText: string): boolean => {
            const cleanRaw = rawTitle.trim();
            const cleanVis = visibleText.trim();

            if (!cleanRaw) return false;

            // Nếu title là nhãn điều hướng mặc định ("Xem chi tiết...") -> Không phải thông tin bổ sung
            if (cleanRaw.startsWith('Xem chi tiết')) return false;

            // Nếu visible text rỗng (Icon-only button) -> Title là thông tin bổ sung hữu ích
            if (cleanVis.length === 0) return true;

            const rawNorm = cleanRaw.toLowerCase().replace(/\s+/g, ' ');
            const visNorm = cleanVis.toLowerCase().replace(/\s+/g, ' ');

            // Title trùng khớp 100% với text hiển thị -> Không phải thông tin bổ sung
            if (rawNorm === visNorm) return false;

            // Title chỉ là bản sao hoặc bao hàm visNorm với độ dài tương đương -> Không hiện ngoại trừ khi bị che
            if (visNorm.length > 0 && rawNorm.includes(visNorm) && rawNorm.length <= visNorm.length + 3) {
                return false;
            }

            return true;
        };

        const isAvatarElement = (el: HTMLElement | null): boolean => {
            if (!el) return false;
            return !!el.closest(
                '.avatar, [data-avatar], [data-no-tooltip], .no-auto-tooltip, ' +
                '[class*="avatar"], [class*="Avatar"], [class*="userAvatar"], [class*="UserAvatar"], ' +
                'img[src*="avatar"], img[alt*="Avatar"], img[alt*="avatar"]'
            );
        };

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // Bỏ qua HOÀN TOÀN tất cả các Avatar và phần tử bị che mờ do phân quyền
            if (isAvatarElement(target) || isElementMasked(target, null)) {
                hideTooltip();
                return;
            }

            // 1. Quét & Gỡ bỏ ngay lập tức thuộc tính `title` của target và tất cả các thẻ cha gần nhất
            let titleNode: HTMLElement | null = target;
            while (titleNode && titleNode !== document.body) {
                if (titleNode.hasAttribute('title')) {
                    suppressTitleOnElement(titleNode);
                }
                titleNode = titleNode.parentElement;
            }

            // Bỏ qua phần tử có [data-no-tooltip], .no-auto-tooltip, hoặc các ô nhập dữ liệu input/textarea/select
            if (target.closest('[data-no-tooltip], .no-auto-tooltip, input, textarea, select')) {
                hideTooltip();
                return;
            }

            // 2. Tìm phần tử mục tiêu chứa thông tin tooltip
            const titleEl = target.closest('[data-suppressed-title], [data-tooltip]') as HTMLElement | null;
            let candidate = titleEl || (target.closest('.truncate, .line-clamp-1, .line-clamp-2, .line-clamp-3, [data-tooltip-auto], td, th') as HTMLElement | null);

            if (!candidate || isElementMasked(target, candidate)) {
                hideTooltip();
                return;
            }

            // Nếu candidate chứa quá nhiều thẻ con phức tạp mà không có title trực tiếp -> tìm thẻ con có title hoặc truncate
            if (!candidate.hasAttribute('data-suppressed-title') && candidate.querySelectorAll('div, p, span, a').length > 4) {
                const innerCandidate = target.closest('.truncate, .line-clamp-1, .line-clamp-2, .line-clamp-3, [data-tooltip-auto], [data-suppressed-title]') as HTMLElement | null;
                if (innerCandidate && !isElementMasked(target, innerCandidate)) {
                    candidate = innerCandidate;
                } else {
                    hideTooltip();
                    return;
                }
            }

            // 3. Đánh giá xem phần tử có thực sự bị tràn (Overflow) hoặc có Title bổ sung hay không
            const overflowEl = findOverflowElement(target, candidate);
            const rawTitleText = (
                candidate.getAttribute('data-suppressed-title') ||
                candidate.getAttribute('data-tooltip') ||
                target.getAttribute('data-suppressed-title') ||
                target.getAttribute('data-tooltip') ||
                candidate.closest('[data-suppressed-title]')?.getAttribute('data-suppressed-title') ||
                candidate.closest('[data-tooltip]')?.getAttribute('data-tooltip') ||
                ''
            ).trim();

            const visibleText = (candidate.innerText || candidate.textContent || '').trim().replace(/\s+/g, ' ');

            const hasOverflow = !!overflowEl;
            const hasSupplementary = isSupplementaryTitle(rawTitleText, visibleText);

            // NGUYÊN TẮC CỐT LÕI: KHÔNG hiện tooltip nếu văn bản đã hiển thị đầy đủ VÀ không phải là title giải thích bổ sung!
            if (!hasOverflow && !hasSupplementary) {
                hideTooltip();
                return;
            }

            // 4. Lấy nội dung văn bản chuẩn để hiển thị trong Tooltip
            let cleanText = '';
            if (hasSupplementary) {
                cleanText = rawTitleText;
            } else if (hasOverflow) {
                // Ưu tiên rawTitleText nếu dài hơn visibleText (trường hợp data-tooltip chứa bản rõ), ngược lại lấy text từ overflowEl
                if (rawTitleText && rawTitleText.length >= visibleText.length && !rawTitleText.startsWith('Xem chi tiết')) {
                    cleanText = rawTitleText;
                } else if (overflowEl) {
                    cleanText = (overflowEl.innerText || overflowEl.textContent || '').trim().replace(/\s+/g, ' ');
                }
            }

            // Kiểm tra an toàn: Nếu cleanText trùng với visibleText mà KHÔNG bị overflow -> KHÔNG HIỆN
            if (!cleanText || cleanText.length < 2) {
                hideTooltip();
                return;
            }

            if (!hasOverflow && cleanText.trim().toLowerCase() === visibleText.trim().toLowerCase()) {
                hideTooltip();
                return;
            }

            // Giới hạn độ dài Tooltip tối đa 300 ký tự
            if (cleanText.length > 300) {
                cleanText = cleanText.substring(0, 297) + '...';
            }

            currentElRef.current = candidate;

            const rect = candidate.getBoundingClientRect();
            
            // Tính toán vị trí PHÍA TRÊN BÊN TRÁI (Top-Left placement) theo VIEWPORT chuẩn cho position: fixed (KHÔNG cộng window.scrollY)
            const spaceAbove = rect.top;
            const placement: 'top' | 'bottom' = spaceAbove < 45 ? 'bottom' : 'top';

            const top = placement === 'bottom'
                ? rect.bottom + 6
                : rect.top - 6;

            // Đặt lề trái khớp với lề trái của phần tử (rect.left) theo Viewport (KHÔNG cộng window.scrollX)
            const left = Math.max(12, Math.min(window.innerWidth - 320, rect.left));

            setTooltip({
                visible: true,
                text: cleanText,
                top,
                left,
                placement,
            });
        };

        const handleMouseOut = (e: MouseEvent) => {
            const related = e.relatedTarget as HTMLElement | null;
            if (currentElRef.current) {
                if (!related || !currentElRef.current.contains(related)) {
                    hideTooltip();
                }
            }
        };

        const handleScroll = () => {
            hideTooltip();
        };

        document.body.addEventListener('mouseover', handleMouseOver, { passive: true });
        document.body.addEventListener('mouseout', handleMouseOut, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            document.body.removeEventListener('mouseover', handleMouseOver);
            document.body.removeEventListener('mouseout', handleMouseOut);
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    if (!tooltip.visible || !tooltip.text) return null;

    // Phía trên bên trái (Top-Left): translate(0, -100%)
    // Phía dưới bên trái (Bottom-Left): translate(0, 0)
    const transformStyle = tooltip.placement === 'bottom'
        ? 'translate(0, 0)'
        : 'translate(0, -100%)';

    // Tách dòng nếu văn bản có ký tự xuống dòng \n
    const lines = tooltip.text.split('\n');

    return createPortal(
        <div
            className="fixed z-[999999] pointer-events-none max-w-xs sm:max-w-md rounded-lg bg-slate-900/95 dark:bg-slate-800/95 text-slate-100 text-xs px-3 py-1.5 shadow-2xl border border-slate-700/60 dark:border-slate-600/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 leading-relaxed font-medium break-words"
            style={{
                top: tooltip.top,
                left: tooltip.left,
                transform: transformStyle,
            }}
        >
            {lines.length > 1 ? (
                <div className="space-y-0.5">
                    {lines.map((line, idx) => (
                        <p key={idx} className={idx === 0 ? "font-bold text-white border-b border-slate-700/50 pb-0.5 mb-0.5" : "text-slate-300"}>
                            {line}
                        </p>
                    ))}
                </div>
            ) : (
                <span>{tooltip.text}</span>
            )}
        </div>,
        document.body
    );
};

export default AutoTableTooltip;

