// features/bim/lib/clashBroadPhaseClient.ts
// Chạy dò va chạm pha rộng trong Web Worker: có tiến độ, hủy được (terminate), không chặn giao diện.
// Trình duyệt không có worker hoặc worker lỗi → chạy trên luồng chính theo từng lát nhỏ, nhường nhịp giữa các lát.
import { createClashScanner, packBoxes, type ClashBox, type ClashScanResult } from './clashDetection';
import { BIM_WORKER_URLS } from './fragmentsWorker';

export interface BroadPhaseOptions {
  tolerance?: number;
  maxResults?: number;
  /** Dò trong cùng một mô hình (A và B là một tập) */
  sameSet?: boolean;
}

export interface BroadPhaseRunControl {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Tạo worker (tiêm để kiểm thử) */
  createWorker?: () => Worker;
  /** Số cấu kiện A mỗi lát khi chạy trên luồng chính */
  sliceSize?: number;
}

export class ClashAbortError extends Error {
  constructor() {
    super('Đã hủy dò va chạm');
    this.name = 'AbortError';
  }
}

export const isAbortError = (e: unknown) => e instanceof Error && e.name === 'AbortError';

const defaultWorker = () => new Worker(BIM_WORKER_URLS.clashBroadPhase, { type: 'module' });

let jobCounter = 0;

/** Chạy trên luồng chính, mỗi lát ≤ sliceSize cấu kiện rồi nhường nhịp (setTimeout 0) */
export async function runBroadPhaseOnMainThread(
  setA: ClashBox[],
  setB: ClashBox[],
  options: BroadPhaseOptions,
  control: BroadPhaseRunControl = {},
): Promise<ClashScanResult> {
  const scanner = createClashScanner(setA, setB, { ...options, onProgress: control.onProgress });
  const slice = control.sliceSize ?? 1500;
  for (;;) {
    if (control.signal?.aborted) throw new ClashAbortError();
    if (scanner.step(slice)) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  return scanner.result();
}

export function runBroadPhase(
  setA: ClashBox[],
  setB: ClashBox[],
  options: BroadPhaseOptions = {},
  control: BroadPhaseRunControl = {},
): Promise<ClashScanResult> {
  if (control.signal?.aborted) return Promise.reject(new ClashAbortError());
  let worker: Worker | null;
  try {
    worker = control.createWorker ? control.createWorker() : typeof Worker !== 'undefined' ? defaultWorker() : null;
  } catch {
    worker = null;
  }
  if (!worker) return runBroadPhaseOnMainThread(setA, setB, options, control);

  const w = worker;
  const jobId = ++jobCounter;
  const sameSet = options.sameSet ?? setA === setB;
  return new Promise<ClashScanResult>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      settled = true;
      control.signal?.removeEventListener('abort', onAbort);
      w.terminate();
    };
    const fallback = () => {
      if (settled) return;
      finish();
      runBroadPhaseOnMainThread(setA, setB, { ...options, sameSet }, control).then(resolve, reject);
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(new ClashAbortError());
    };
    control.signal?.addEventListener('abort', onAbort);
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (settled || msg.jobId !== jobId) return;
      if (msg.type === 'progress') control.onProgress?.(msg.done, msg.total);
      else if (msg.type === 'done') {
        finish();
        resolve(msg.result as ClashScanResult);
      } else if (msg.type === 'error') fallback();
    };
    w.onerror = () => fallback();
    try {
      const a = packBoxes(setA);
      const b = sameSet ? null : packBoxes(setB);
      const transfer: Transferable[] = [a.ids.buffer, a.bounds.buffer];
      if (b) transfer.push(b.ids.buffer, b.bounds.buffer);
      w.postMessage({ jobId, a, b, options: { ...options, sameSet } }, transfer);
    } catch {
      fallback();
    }
  });
}
