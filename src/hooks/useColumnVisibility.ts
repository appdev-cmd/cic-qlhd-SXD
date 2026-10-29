import { useFilterState } from './useFilterState';
import { toggleHidden } from '../lib/dataTable';

/**
 * Persisted show/hide state for table columns (scoped localStorage via useFilterState).
 * `hideableIds` lists the columns the user may hide; at least one of them always stays visible.
 */
export function useColumnVisibility(
  key: string,
  hideableIds: readonly string[],
  defaultHidden: readonly string[] = [],
) {
  const [stored, setStored] = useFilterState<string[]>(key, [...defaultHidden]);
  const hidden = Array.isArray(stored) ? stored.filter((id) => hideableIds.includes(id)) : [];
  return {
    hidden,
    isVisible: (id: string) => !hidden.includes(id),
    toggle: (id: string) => setStored(toggleHidden(hidden, id, hideableIds)),
    reset: () => setStored([...defaultHidden]),
  };
}
