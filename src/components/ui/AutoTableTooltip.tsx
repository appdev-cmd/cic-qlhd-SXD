import { useEffect, useRef, useState } from 'react';
import { computeTooltipCoords, TooltipBubble } from './Tooltip';

const TRUNCATION_SELECTOR = 'td, th, .truncate, [class*="line-clamp-"], [data-auto-tooltip]';

function isTruncated(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

/**
 * Tự động hiển thị tooltip kính mờ cho ô bảng / văn bản bị cắt ngắn (ellipsis, line-clamp).
 * Gắn một lần ở gốc ứng dụng. Bỏ qua phần tử đã có <Tooltip> riêng.
 */
export function AutoTableTooltip() {
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('[data-has-tooltip]')) return;
      const el = target.closest<HTMLElement>(TRUNCATION_SELECTOR);
      if (!el || el === current.current) return;

      clear();
      current.current = el;
      timer.current = setTimeout(() => {
        const text = (el.dataset.autoTooltip || el.innerText || '').trim();
        if (!text || !isTruncated(el)) return;
        const { top, left } = computeTooltipCoords(el.getBoundingClientRect(), 'top');
        setTip({ text: text.length > 400 ? `${text.slice(0, 400)}…` : text, top, left });
      }, 350);
    };

    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (current.current && related && current.current.contains(related)) return;
      clear();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', clear, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return tip ? <TooltipBubble content={tip.text} top={tip.top} left={tip.left} placement="top" /> : null;
}
