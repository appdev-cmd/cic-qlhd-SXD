import { useEffect, useState } from 'react';
import { Tooltip } from './Tooltip';

/** Route delegated hover/focus through the same portal tooltip used by controls. */
export function AutoTableTooltip() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      setTarget(null);
    };
    const enter = (event: Event) => {
      clearTimeout(timer);
      const element =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tooltip],td,.truncate') : null;
      const content = element?.dataset.tooltip || element?.textContent?.trim();
      if (!element || !content || (!element.dataset.tooltip && element.scrollWidth <= element.clientWidth)) {
        setTarget(null);
        return;
      }
      timer = setTimeout(() => setTarget(element), 200);
    };
    document.addEventListener('pointerover', enter);
    document.addEventListener('focusin', enter);
    document.addEventListener('pointerout', clear);
    document.addEventListener('focusout', clear);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('focusin', enter);
      document.removeEventListener('pointerout', clear);
      document.removeEventListener('focusout', clear);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, []);
  return target ? (
    <Tooltip content={target.dataset.tooltip || target.textContent?.trim()} placement="top" anchor={target}>
      {null}
    </Tooltip>
  ) : null;
}
