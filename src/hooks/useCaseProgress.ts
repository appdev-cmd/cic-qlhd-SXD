import { useEffect, useRef } from 'react';
import { appraisalService as api } from '../services/appraisalService';
import type { Dossier } from '../types/appraisal';

const FIRST_DELAY = 1500;
const MAX_DELAY = 5000;

/**
 * Polls the lightweight /progress endpoint while a job runs and loads the full
 * submission only when its revision or job state changes. Backs off while
 * nothing changes and pauses while the tab is hidden.
 */
export function useCaseProgress(
  dossier: Dossier | null | undefined,
  onUpdate: (next: Dossier) => void,
  onError?: (message: string) => void,
  enabled = true,
) {
  const handlers = useRef({ onUpdate, onError });
  handlers.current = { onUpdate, onError };
  const running = dossier?.job?.status === 'running';
  useEffect(() => {
    if (!enabled || !dossier || !running) return;
    let live = true;
    let delay = FIRST_DELAY;
    let revision = dossier.revision;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.hidden) {
        timer = setTimeout(tick, MAX_DELAY);
        return;
      }
      try {
        const progress = await api.progress(dossier.id);
        if (!live) return;
        handlers.current.onError?.('');
        if (progress.revision !== revision || progress.job?.status !== 'running') {
          revision = progress.revision;
          const next = await api.get(dossier.id);
          if (live) handlers.current.onUpdate(next);
          delay = FIRST_DELAY;
        } else {
          delay = Math.min(Math.round(delay * 1.5), MAX_DELAY);
        }
      } catch {
        if (live) handlers.current.onError?.('Chưa lấy được tiến trình mới nhất. Hệ thống đang thử kết nối lại; không cần bấm chạy thêm.');
      } finally {
        if (live) timer = setTimeout(tick, delay);
      }
    };
    timer = setTimeout(tick, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [dossier?.id, running, enabled]);
}
