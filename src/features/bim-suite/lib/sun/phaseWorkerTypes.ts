// Messages of phaseSun.worker.ts (prebuilt into public/bim/workers by prepare:drawings).
import type { Box3Like } from './sunHours';
import { BIM_WORKER_URLS } from '../fragmentsWorker';

export interface PhaseWorkerRequest {
  contextParts: Float32Array[];
  buildingParts: Float32Array[];
  /** Mốc tiến độ của từng phần công trình (0 = mốc đầu). */
  buildingStages: number[];
  stageCount: number;
  box: Box3Like;
  step: number;
  maxPoints: number;
  dirs: ([number, number, number] | null)[];
  stepHours: number;
}

export type PhaseWorkerResponse =
  | { type: 'progress'; phase: 'bvh' | 'grid' | 'rays'; done: number; total: number }
  | {
      type: 'done';
      points: Float32Array;
      count: number;
      step: number;
      base: Float32Array;
      hours: Float32Array;
      triangles: number;
    }
  | { type: 'error'; message: string };

/** Chạy worker nắng theo mốc tiến độ; trả về hàm hủy. */
export function runPhaseWorker(req: PhaseWorkerRequest, onMessage: (msg: PhaseWorkerResponse) => void): () => void {
  const worker = new Worker(BIM_WORKER_URLS.phaseSun, { type: 'module' });
  worker.onmessage = (e: MessageEvent<PhaseWorkerResponse>) => {
    onMessage(e.data);
    if (e.data.type !== 'progress') worker.terminate();
  };
  worker.onerror = (e) => {
    onMessage({ type: 'error', message: e.message || 'Worker nắng theo tiến độ lỗi.' });
    worker.terminate();
  };
  worker.postMessage(
    req,
    [...req.contextParts, ...req.buildingParts].map((p) => p.buffer as ArrayBuffer),
  );
  return () => worker.terminate();
}
