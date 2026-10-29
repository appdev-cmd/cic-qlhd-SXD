// Messages of envelope.worker.ts (prebuilt into public/bim/workers by prepare:drawings).
import { BIM_WORKER_URLS } from '../fragmentsWorker';

export interface EnvelopeWorkerRequest {
  obstacleParts: Float32Array[];
  envelopeParts: Float32Array[];
  step: number;
  maxPoints: number;
}
export type EnvelopeWorkerResponse =
  | { type: 'done'; normals: Float32Array; area: Float32Array; src: Int32Array; count: number }
  | { type: 'error'; message: string };

/** Chạy worker lấy mẫu vỏ công trình; trả về promise và hàm hủy. */
export function runEnvelopeWorker(req: EnvelopeWorkerRequest): {
  result: Promise<Extract<EnvelopeWorkerResponse, { type: 'done' }>>;
  cancel: () => void;
} {
  const worker = new Worker(BIM_WORKER_URLS.envelope, { type: 'module' });
  const result = new Promise<Extract<EnvelopeWorkerResponse, { type: 'done' }>>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<EnvelopeWorkerResponse>) => {
      worker.terminate();
      if (e.data.type === 'error') reject(new Error(e.data.message));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker vỏ công trình lỗi.'));
    };
  });
  worker.postMessage(req);
  return { result, cancel: () => worker.terminate() };
}
