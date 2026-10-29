// Tải mô hình IFC lên kho bim-models: băm SHA-256 và nén ZIP trong Web Worker, tải lên tiếp tục được
// (TUS, khúc 6 MB của Supabase Storage) có tiến độ và thử lại; dự phòng tải thường có thử lại khi máy chủ
// không bật TUS.
import * as tus from 'tus-js-client';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/features/bim-suite/adapters/supabase';
import { sha256Blob } from './sha256';
import { BIM_WORKER_URLS } from './fragmentsWorker';

export type UploadPhase = 'hash' | 'zip' | 'upload' | 'register' | 'convert' | 'cleanup';
export interface UploadProgress {
  phase: UploadPhase;
  /** 0–100 trong bước hiện tại */
  percent: number;
  bytesSent?: number;
  bytesTotal?: number;
  message?: string;
}
export type ProgressFn = (progress: UploadProgress) => void;

const abortError = () => Object.assign(new Error('Đã hủy tải lên'), { name: 'AbortError' });

let workerSeq = 0;
/** Chạy một việc trong worker riêng; hủy được bằng AbortSignal (terminate worker). */
function runInWorker<T>(
  message: { op: 'hash'; file: Blob } | { op: 'zip'; file: Blob; name: string },
  onPercent?: (p: number) => void,
  signal?: AbortSignal,
): Promise<T> | null {
  let worker: Worker;
  try {
    if (typeof Worker === 'undefined') return null;
    worker = new Worker(BIM_WORKER_URLS.upload, { type: 'module' });
  } catch {
    return null;
  }
  const id = ++workerSeq;
  return new Promise<T>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(abortError());
    };
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ id: number; type: string; percent?: number; result?: T; message?: string }>,
    ) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') onPercent?.(msg.percent ?? 0);
      else {
        signal?.removeEventListener('abort', stop);
        worker.terminate();
        if (msg.type === 'done') resolve(msg.result as T);
        else reject(new Error(msg.message || 'Worker lỗi'));
      }
    };
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', stop);
      worker.terminate();
      reject(new Error(event.message || 'Worker lỗi'));
    };
    worker.postMessage({ id, ...message });
  });
}

/** SHA-256 đầy đủ của tệp (dùng cho chống trùng ở máy chủ). */
export async function hashFile(file: Blob, onProgress?: ProgressFn, signal?: AbortSignal): Promise<string> {
  const report = (percent: number) => onProgress?.({ phase: 'hash', percent });
  const viaWorker = runInWorker<string>({ op: 'hash', file }, report, signal);
  if (viaWorker) {
    try {
      return await viaWorker;
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      // Worker không tải được (môi trường cũ) → băm trên luồng chính theo khúc.
    }
  }
  return sha256Blob(file, (done, total) => {
    if (signal?.aborted) throw abortError();
    report(total ? (done / total) * 100 : 100);
  });
}

/** Nén tệp IFC thành .ifczip trong worker; trả null nếu không nén được (tải tệp gốc). */
export async function zipIfcFile(file: File, onProgress?: ProgressFn, signal?: AbortSignal): Promise<Blob | null> {
  const report = (percent: number) => onProgress?.({ phase: 'zip', percent });
  const viaWorker = runInWorker<Blob>({ op: 'zip', file, name: file.name }, report, signal);
  try {
    if (viaWorker) return await viaWorker;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(file.name, file);
    return await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, streamFiles: true },
      (m) => report(m.percent),
    );
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    console.warn('[BIM Upload] Không nén được, tải tệp gốc:', error);
    return null;
  }
}

const TUS_CHUNK = 6 * 1024 * 1024; // Supabase Storage yêu cầu đúng 6 MB mỗi khúc
export const TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000];

const storageEndpoint = () => {
  const base = supabaseUrl;
  return `${base.replace(/\/$/, '')}/storage/v1/upload/resumable`;
};

/** Lỗi do máy chủ không hỗ trợ TUS (khác lỗi mạng/quyền) → chuyển sang tải thường. */
export const isTusUnsupported = (error: unknown) => {
  const status = (error as { originalResponse?: { getStatus?: () => number } })?.originalResponse?.getStatus?.();
  return status === 404 || status === 405 || status === 501;
};

/**
 * Tải lên tiếp tục được. Dấu vết phiên TUS lưu trong localStorage theo tệp: tải lại trang rồi chọn
 * cùng tệp sẽ tiếp tục từ khúc đã xong. Không ghi đè tệp đã có (x-upsert=false).
 */
export async function resumableUpload(options: {
  bucket: string;
  path: string;
  file: Blob;
  contentType: string;
  onProgress?: ProgressFn;
  signal?: AbortSignal;
}): Promise<void> {
  const { bucket, path, file, contentType, onProgress, signal } = options;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn; hãy đăng nhập lại để tải mô hình.');
  const report = (sent: number, total: number) =>
    onProgress?.({ phase: 'upload', percent: total ? (sent / total) * 100 : 100, bytesSent: sent, bytesTotal: total });

  try {
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: storageEndpoint(),
        retryDelays: TUS_RETRY_DELAYS,
        chunkSize: TUS_CHUNK,
        headers: { authorization: `Bearer ${token}`, apikey: supabaseAnonKey, 'x-upsert': 'false' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: '3600' },
        onProgress: report,
        onSuccess: () => resolve(),
        onError: (error) => reject(error),
      });
      const abort = () => {
        void upload.abort(true);
        reject(abortError());
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      upload
        .findPreviousUploads()
        .then((previous) => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        })
        .catch(() => upload.start());
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError' || !isTusUnsupported(error)) {
      throw new Error(`Lỗi tải tệp lên máy chủ: ${(error as Error).message || String(error)}`);
    }
    await uploadWithRetry({ bucket, path, file, contentType, onProgress, signal });
  }
}

/** Dự phòng: một lượt upload, thử lại 3 lần với độ trễ tăng dần cho lỗi mạng / 5xx. */
export async function uploadWithRetry(
  options: {
    bucket: string;
    path: string;
    file: Blob;
    contentType: string;
    onProgress?: ProgressFn;
    signal?: AbortSignal;
  },
  delays = [1000, 4000, 10000],
): Promise<void> {
  const { bucket, path, file, contentType, onProgress, signal } = options;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    onProgress?.({ phase: 'upload', percent: 0, bytesSent: 0, bytesTotal: file.size });
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, cacheControl: '3600', upsert: false });
    if (!error) {
      onProgress?.({ phase: 'upload', percent: 100, bytesSent: file.size, bytesTotal: file.size });
      return;
    }
    const status = Number((error as { statusCode?: string | number }).statusCode);
    const retryable = !status || status >= 500 || status === 408 || status === 429;
    if (!retryable || attempt >= delays.length) throw new Error(`Lỗi tải tệp lên máy chủ: ${error.message}`);
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}
