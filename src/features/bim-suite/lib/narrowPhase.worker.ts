// features/bim/lib/narrowPhase.worker.ts
// Web Worker kiểm tra va chạm pha hẹp (lưới tam giác) ngoài luồng giao diện.
// Nhận: { jobId, pairs: [{ i, a: Float32Array, b: Float32Array }] } → trả { jobId, results: [{ i, kind, truncated }] }
import { meshesClash } from './narrowPhase';

self.onmessage = (e: MessageEvent<{ jobId: number; pairs: { i: number; a: Float32Array; b: Float32Array }[] }>) => {
  const { jobId, pairs } = e.data;
  const results = pairs.map(({ i, a, b }) => {
    const r = meshesClash(a, b, { tolerance: 0 });
    return { i, kind: r.kind, truncated: r.truncated };
  });
  (self as unknown as Worker).postMessage({ jobId, results });
};
