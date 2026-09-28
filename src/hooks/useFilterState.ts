import { useEffect, useState } from 'react';
import { useStorageScope } from '../context/AuthContext';
export function useFilterState<T>(key: string, initial: T) {
  const scope = useStorageScope();
  const storageKey = `appraisal:${scope}:${key}`;
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null') ?? initial;
    } catch {
      return initial;
    }
  };
  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key: storageKey, value: read() }));
  const value = state.key === storageKey ? state.value : read();
  useEffect(() => {
    if (state.key !== storageKey) setState({ key: storageKey, value: read() });
  }, [storageKey, state.key]);
  useEffect(() => {
    if (state.key !== storageKey) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state.value));
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [storageKey, state]);
  const setValue: React.Dispatch<React.SetStateAction<T>> = (next) =>
    setState((previous) => ({
      key: storageKey,
      value:
        typeof next === 'function'
          ? (next as (value: T) => T)(previous.key === storageKey ? previous.value : read())
          : next,
    }));
  return [value, setValue] as const;
}
