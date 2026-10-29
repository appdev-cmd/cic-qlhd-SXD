import type { ExtractResult } from '../../../../worker/bim-converter/extractElements';
import type { TopologyResult } from '../../../../worker/bim-converter/extractTopology';

export interface IfcConversionData {
  fragBytes: Uint8Array;
  extraction: ExtractResult;
  topology: TopologyResult;
}
export function runIfcConversion(
  bytes: Uint8Array,
  wasmUrl: string,
  onProgress: (percent: number, message: string) => void,
  signal: AbortSignal,
): Promise<IfcConversionData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/bim/workers/ifcConvert.worker.js', { type: 'module' });
    let finished = false;
    const finish = (error?: Error, data?: IfcConversionData) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(data!);
    };
    const abort = () => finish(new DOMException('Đã dừng chuyển đổi IFC.', 'AbortError'));
    const timeout = setTimeout(
      () => finish(new Error('Chuyển đổi IFC vượt quá thời gian cho phép. Hãy kiểm tra tệp và thử lại.')),
      20 * 60_000,
    );
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'progress') onProgress(data.percent, data.message);
      else if (data.type === 'error') finish(new Error(data.message));
      else if (data.type === 'done') finish(undefined, data);
    };
    worker.onerror = (event) => finish(new Error(event.message || 'Không khởi động được worker chuyển đổi IFC.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    worker.postMessage({ bytes, wasmUrl }, [bytes.buffer as ArrayBuffer]);
  });
}
