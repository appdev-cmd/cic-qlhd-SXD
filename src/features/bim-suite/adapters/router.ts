import {useCallback,useEffect,useRef,useState} from 'react';
export {useParams,useSearchParams} from 'react-router-dom';
/** Tab đồng bộ với tham số URL (đọc URL → sessionStorage → mặc định), ghi bằng replaceState. */
export function useTabSearchParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[],
  paramName = 'tab',
): [T, (tab: T) => void] {
  const storageKey = typeof window === 'undefined' ? '' : `tab_${window.location.pathname}_${paramName}`;
  const [active, setActive] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultTab;
    const fromUrl = new URLSearchParams(window.location.search).get(paramName) as T | null;
    if (fromUrl && validTabs.includes(fromUrl)) return fromUrl;
    try {
      const stored = sessionStorage.getItem(storageKey) as T | null;
      if (stored && validTabs.includes(stored)) return stored;
    } catch {
      /* storage unavailable */
    }
    return defaultTab;
  });
  const activeRef = useRef(active);
  const write = useCallback(
    (tab: T) => {
      const url = new URL(window.location.href);
      if (url.searchParams.get(paramName) !== tab) {
        url.searchParams.set(paramName, tab);
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
      }
      try {
        sessionStorage.setItem(storageKey, tab);
      } catch {
        /* storage unavailable */
      }
    },
    [paramName, storageKey],
  );
  useEffect(() => write(activeRef.current), [write]);
  useEffect(() => {
    const sync = () => {
      const value = new URLSearchParams(window.location.search).get(paramName) as T | null;
      const next = value && validTabs.includes(value) ? value : defaultTab;
      activeRef.current = next;
      setActive(next);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [defaultTab, paramName, validTabs]);
  const change = useCallback(
    (tab: T) => {
      activeRef.current = tab;
      setActive(tab);
      write(tab);
    },
    [write],
  );
  return [active, change];
}
