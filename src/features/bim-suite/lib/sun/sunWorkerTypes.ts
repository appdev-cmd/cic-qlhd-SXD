// Messages of sun.worker.ts (prebuilt into public/bim/workers by prepare:drawings).
import type { Box3Like } from './sunHours';
import { BIM_WORKER_URLS } from '../fragmentsWorker';

export interface SunWorkerRequest {
  parts: Float32Array[];
  box: Box3Like;
  step: number;
  maxPoints: number;
  dirs: ([number, number, number] | null)[];
  stepHours: number;
}

export type SunWorkerResponse =
  | { type: 'progress'; phase: 'bvh' | 'grid' | 'rays'; done: number; total: number }
  | {
      type: 'done';
      points: Float32Array;
      count: number;
      step: number;
      groundY: number;
      lit: Uint8Array;
      hours: Float32Array;
      triangles: number;
    }
  | { type: 'error'; message: string };

/** Chạy worker phân tích nắng; trả về hàm hủy. */
export function runSunWorker(req: SunWorkerRequest, onMessage: (msg: SunWorkerResponse) => void): () => void {
  const worker = new Worker(BIM_WORKER_URLS.sun, { type: 'module' });
  worker.onmessage = (e: MessageEvent<SunWorkerResponse>) => {
    onMessage(e.data);
    if (e.data.type !== 'progress') worker.terminate();
  };
  worker.onerror = (e) => {
    onMessage({ type: 'error', message: e.message || 'Worker phân tích nắng lỗi.' });
    worker.terminate();
  };
  worker.postMessage(
    req,
    req.parts.map((p) => p.buffer as ArrayBuffer),
  );
  return () => worker.terminate();
}
