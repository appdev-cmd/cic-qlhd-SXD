// features/bim/lib/narrowPhaseClient.ts
// Chạy kiểm tra pha hẹp trong Web Worker theo lô (giao diện không bị đứng khi dò hàng nghìn cặp).
// Trình duyệt không hỗ trợ worker → chạy trên luồng chính, chia nhịp như trước.
import { meshesClash, NarrowResult } from './narrowPhase';
import { BIM_WORKER_URLS } from './fragmentsWorker';

export interface NarrowPair {
  a: Float32Array;
  b: Float32Array;
}

export const runNarrowPhase = async (
  pairs: NarrowPair[],
  onProgress?: (done: number, total: number) => void,
  batchSize = 40,
  signal?: AbortSignal,
): Promise<{ kind: NarrowResult['kind']; truncated: boolean }[]> => {
  const out: { kind: NarrowResult['kind']; truncated: boolean }[] = new Array(pairs.length);
  let worker: Worker | null;
  try {
    worker = typeof Worker !== 'undefined' ? new Worker(BIM_WORKER_URLS.narrowPhase, { type: 'module' }) : null;
  } catch {
    worker = null;
  }

  for (let start = 0; start < pairs.length; start += batchSize) {
    // Hủy giữa chừng: dừng worker và báo lỗi AbortError cho người gọi
    if (signal?.aborted) {
      worker?.terminate();
      const err = new Error('Đã hủy dò va chạm');
      err.name = 'AbortError';
      throw err;
    }
    const slice = pairs.slice(start, start + batchSize);
    if (worker) {
      const w = worker;
      const results = await new Promise<{ i: number; kind: NarrowResult['kind']; truncated: boolean }[]>(
        (resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Worker không phản hồi')), 30000);
          w.onmessage = (e) => {
            clearTimeout(timer);
            resolve(e.data.results);
          };
          w.onerror = (err) => {
            clearTimeout(timer);
            reject(err);
          };
          w.postMessage({ jobId: start, pairs: slice.map((p, k) => ({ i: start + k, a: p.a, b: p.b })) });
        },
      ).catch(() => null);
      if (results && results.length === slice.length) {
        results.forEach((r) => (out[r.i] = { kind: r.kind, truncated: r.truncated }));
      } else {
        // Worker lỗi giữa chừng → phần còn lại chạy trên luồng chính
        w.terminate();
        worker = null;
        slice.forEach((p, k) => {
          const r = meshesClash(p.a, p.b, { tolerance: 0 });
          out[start + k] = { kind: r.kind, truncated: r.truncated };
        });
      }
    } else {
      slice.forEach((p, k) => {
        const r = meshesClash(p.a, p.b, { tolerance: 0 });
        out[start + k] = { kind: r.kind, truncated: r.truncated };
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    onProgress?.(Math.min(start + batchSize, pairs.length), pairs.length);
  }
  worker?.terminate();
  return out;
};
