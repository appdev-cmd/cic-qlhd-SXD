import { useEffect } from 'react';
const locks = new Set<symbol>();
export function useChildFormGuard(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol();
    locks.add(id);
    document.body.dataset.modalOpen = 'true';
    return () => {
      locks.delete(id);
      if (!locks.size) delete document.body.dataset.modalOpen;
    };
  }, [isOpen]);
}
