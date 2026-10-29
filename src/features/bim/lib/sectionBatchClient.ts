import { processSectionBatch, type SectionBatch, type SectionBatchResult } from './sectionBatch';
import { BIM_WORKER_URLS } from './fragmentsWorker';

/** A pending CPU job can be terminated immediately when the section changes. */
export class SectionBatchClient {
  private worker: Worker | null = null;
  private reject: ((error: Error) => void) | null = null;
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    this.reject?.(new DOMException('Mặt cắt đã thay đổi.', 'AbortError'));
    this.reject = null;
  }
  async run(input: SectionBatch): Promise<SectionBatchResult> {
    if (typeof Worker === 'undefined') return processSectionBatch(input);
    this.worker ??= new Worker(BIM_WORKER_URLS.sectionBatch, { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      worker.onmessage = (event: MessageEvent<{ result?: SectionBatchResult; error?: string }>) => {
        this.reject = null;
        if (event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error ?? 'Kết quả mặt cắt không hợp lệ.'));
      };
      worker.onerror = () => {
        this.reject = null;
        worker.terminate();
        this.worker = null;
        reject(new Error('Worker mặt cắt đã dừng.'));
      };
      // readTriangles returns fresh arrays, not buffers owned by Fragments.
      worker.postMessage(
        input,
        input.triangles.map((mesh) => mesh.buffer as ArrayBuffer),
      );
    });
  }
}
