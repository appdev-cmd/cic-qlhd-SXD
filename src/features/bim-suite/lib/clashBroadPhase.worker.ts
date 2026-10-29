// features/bim/lib/clashBroadPhase.worker.ts
// Web Worker dò va chạm pha rộng (khung bao) ngoài luồng giao diện.
// Nhận: { jobId, a: PackedBoxes, b: PackedBoxes | null, options } (b = null: dò trong một mô hình)
// Gửi:  { jobId, type: 'progress', done, total } … rồi { jobId, type: 'done', result } hoặc { jobId, type: 'error', message }
import { createClashScanner, unpackBoxes, type PackedBoxes } from './clashDetection';

interface BroadPhaseJob {
  jobId: number;
  a: PackedBoxes;
  b: PackedBoxes | null;
  options: { tolerance?: number; maxResults?: number; sameSet?: boolean };
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<BroadPhaseJob>) => {
  const { jobId, a, b, options } = e.data;
  try {
    const setA = unpackBoxes(a);
    const setB = b ? unpackBoxes(b) : setA;
    let last = 0;
    const scanner = createClashScanner(setA, setB, {
      ...options,
      sameSet: options.sameSet ?? !b,
      onProgress: (done, total) => {
        // Báo tiến độ tối đa ~ mỗi 2% để không làm nghẽn kênh tin nhắn
        if (done === total || done - last >= Math.max(500, total / 50)) {
          last = done;
          ctx.postMessage({ jobId, type: 'progress', done, total });
        }
      },
    });
    scanner.step(Number.MAX_SAFE_INTEGER);
    ctx.postMessage({ jobId, type: 'done', result: scanner.result() });
  } catch (err) {
    ctx.postMessage({ jobId, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
