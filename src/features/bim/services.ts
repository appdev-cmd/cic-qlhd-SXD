import { apiRequest, apiResponse, type Page } from '../../services/apiClient';
import type { BimModel, BimViewpoint } from './types/bim.types';
import type { ExtractedElement, ExtractResult } from '../../../worker/bim-converter/extractElements';

export type Model = BimModel & { revision: number };
export type ElementRow = ExtractedElement;
export type QuantityRow = {
  category: string;
  storey: string;
  count: number;
  volume: number | null;
  area: number | null;
  length: number | null;
  missing_volume: number;
};
export type Note = {
  id: string;
  revision: number;
  kind: 'view' | 'issue';
  name: string;
  description: string;
  status: 'open' | 'resolved';
  viewpoint: BimViewpoint | null;
  actor: string;
  updatedAt: string;
};
export type HistoryRow = { id: string; at: string; actor: string; action: string; detail: string; modelName: string };
const base = '/bim';
const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  apiRequest<T>(base + path, { method: 'POST', body: JSON.stringify(body), signal });
export const bimService = {
  models: (project: string) => apiRequest<Model[]>(`${base}/projects/${encodeURIComponent(project)}/models`),
  elements: (
    id: string,
    options: { search: string; category: string; storey: string; offset: number },
    signal?: AbortSignal,
  ) =>
    apiRequest<Page<ElementRow>>(
      `${base}/models/${id}/elements?${new URLSearchParams(Object.entries(options).map(([k, v]) => [k, String(v)]))}`,
      { signal },
    ),
  summary: (id: string) => apiRequest<QuantityRow[]>(`${base}/models/${id}/summary`),
  notes: (id: string) => apiRequest<Note[]>(`${base}/models/${id}/notes`),
  saveNote: (id: string, note: Partial<Note>) => post(`${'/models/' + id}/notes`, note),
  archive: (model: Model) => post(`/models/${model.id}/archive`, { revision: model.revision }),
  history: (project: string, offset: number) =>
    apiRequest<{ items: HistoryRow[]; total: number }>(
      `${base}/projects/${encodeURIComponent(project)}/history?offset=${offset}`,
    ),
  async download(model: Model, kind: 'ifc' | 'frag') {
    const response = await apiResponse(`${base}/models/${model.id}/files/${kind}`);
    saveBlob(
      await response.blob(),
      kind === 'ifc' ? model.file_name : model.file_name.replace(/\.ifc(zip)?$/i, '.frag'),
    );
  },
};
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvBlob(rows: (string | number | null)[][]) {
  return new Blob(
    [
      '\ufeff',
      rows
        .map((row) =>
          row
            .map(
              (cell) =>
                `"${String(cell ?? '')
                  .replace(/^[=+@-]/, "'$&")
                  .replace(/"/g, '""')}"`,
            )
            .join(';'),
        )
        .join('\r\n'),
    ],
    { type: 'text/csv;charset=utf-8' },
  );
}
const sha = async (data: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((v) => v.toString(16).padStart(2, '0')).join('');
function convert(bytes: Uint8Array, progress: (message: string) => void, signal: AbortSignal) {
  return new Promise<{ extracted: ExtractResult; frag: Uint8Array }>((resolve, reject) => {
    const worker = new Worker(new URL('./lib/convert.worker.ts', import.meta.url), { type: 'module' });
    const stop = () => {
      worker.terminate();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException('Đã hủy chuyển đổi', 'AbortError'));
    };
    const timer = setTimeout(() => {
      stop();
      reject(Error('Chuyển đổi vượt 10 phút. Thử tệp IFC nhỏ hơn.'));
    }, 600_000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') progress(data.message);
      else {
        stop();
        data.type === 'done' ? resolve(data) : reject(Error(data.message));
      }
    };
    worker.onerror = () => {
      stop();
      reject(Error('Worker IFC không khởi động được. Kiểm tra tệp WASM và trình duyệt.'));
    };
    worker.postMessage({ bytes, origin: window.location.origin }, [bytes.buffer]);
  });
}
export async function importIfc(
  project: string,
  file: File,
  discipline: string,
  previousId: string,
  progress: (message: string) => void,
  signal: AbortSignal,
) {
  if (!/\.ifc(zip)?$/i.test(file.name) || file.size > 200 * 1024 * 1024)
    throw Error('Chọn tệp IFC/IFCZIP tối đa 200 MB.');
  const original = await file.arrayBuffer();
  const converted = await convert(new Uint8Array(original.slice(0)), progress, signal);
  if (!converted.extracted.elements.length) throw Error('IFC không chứa cấu kiện để nhập.');
  const files = { ifc: original, frag: converted.frag.buffer as ArrayBuffer };
  const manifest = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([kind, bytes]) => [kind, { size: bytes.byteLength, sha256: await sha(bytes) }]),
    ),
  );
  progress('Đang đăng ký mô hình và phiên bản…');
  const model = await post<Model>(
    `/projects/${encodeURIComponent(project)}/models`,
    {
      file_name: file.name,
      discipline,
      previous_id: previousId || null,
      files: manifest,
      element_count: converted.extracted.elements.length,
      ifc_schema: converted.extracted.schema,
    },
    signal,
  );
  try {
    for (const [kind, bytes] of Object.entries(files)) {
      for (let offset = 0, part = 0; offset < bytes.byteLength; offset += 1024 * 1024, part++) {
        signal.throwIfAborted();
        progress(`Đang lưu ${kind.toUpperCase()} · ${Math.round((offset / bytes.byteLength) * 100)}%`);
        const chunk = new Uint8Array(bytes.slice(offset, offset + 1024 * 1024));
        let binary = '';
        for (let i = 0; i < chunk.length; i += 8192) binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
        await post(`/models/${model.id}/files/${kind}/${part}`, { data: btoa(binary) }, signal);
      }
    }
    const rows = converted.extracted.elements;
    for (let offset = 0; offset < rows.length; offset += 100) {
      progress(`Đang lưu cấu kiện · ${Math.min(offset + 100, rows.length)}/${rows.length}`);
      await post(`/models/${model.id}/elements`, { items: rows.slice(offset, offset + 100) }, signal);
    }
    progress('Đang kiểm tra tính đầy đủ và mã SHA-256…');
    return await post<Model>(`/models/${model.id}/finalize`, {}, signal);
  } catch (error) {
    // Retain failed imports as an explicit incomplete model, never display them as ready.
    throw error;
  }
}
