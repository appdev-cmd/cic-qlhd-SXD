// Tải tệp IFC từ Storage thẳng xuống đĩa theo luồng: tiến trình cha không giữ tệp trong bộ nhớ
// (trước: download() → Blob → Uint8Array, hai bản sao toàn bộ tệp trong heap 1,5 GB).
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JobError, classifyError, fromHttpStatus } from './errors';

export interface DownloadResult {
  bytes: number;
  ms: number;
}

/** Tải một URL về tệp, kiểm tra giới hạn kích thước trong lúc tải (không tin Content-Length). */
export async function downloadUrlToFile(
  url: string,
  dest: string,
  options: {
    maxBytes?: number;
    onProgress?: (bytes: number, total: number | null) => void;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<DownloadResult> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { signal: options.signal, headers: options.headers });
  } catch (err) {
    throw classifyError(err);
  }
  if (!response.ok || !response.body) {
    throw fromHttpStatus(response.status, `Không tải được tệp từ kho (HTTP ${response.status})`);
  }
  const total = Number(response.headers.get('content-length')) || null;
  const max = options.maxBytes ?? Number.POSITIVE_INFINITY;
  if (total && total > max)
    throw new JobError(
      'FILE_TOO_LARGE',
      `Tệp ${Math.round(total / 1048576)} MB vượt giới hạn ${Math.round(max / 1048576)} MB`,
    );
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      if (bytes > max) return done(new JobError('FILE_TOO_LARGE', `Tệp vượt giới hạn ${Math.round(max / 1048576)} MB`));
      options.onProgress?.(bytes, total);
      done(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream),
      meter,
      fs.createWriteStream(dest),
    );
  } catch (err) {
    fs.rmSync(dest, { force: true });
    throw classifyError(err);
  }
  return { bytes, ms: Date.now() - started };
}

/** Tải object Storage qua URL có chữ ký (service role) về đĩa. */
export async function downloadObjectToFile(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string,
  dest: string,
  options: { maxBytes?: number; onProgress?: (bytes: number, total: number | null) => void } = {},
): Promise<DownloadResult> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600);
  if (error || !data?.signedUrl) {
    const status =
      Number((error as { statusCode?: string | number } | null)?.statusCode) ||
      (/not found/i.test(error?.message || '') ? 404 : 500);
    throw fromHttpStatus(status, `Không tạo được liên kết tải ${objectPath}: ${error?.message || 'không có URL'}`);
  }
  return downloadUrlToFile(data.signedUrl, dest, options);
}

/** Tải tệp từ đĩa lên Storage theo luồng (không đọc cả tệp vào bộ nhớ). */
export async function uploadFileToObject(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string,
  file: string,
  contentType = 'application/octet-stream',
): Promise<number> {
  const size = fs.statSync(file).size;
  const { error } = await supabase.storage.from(bucket).upload(
    objectPath,
    fs.createReadStream(file) as unknown as Blob,
    {
      contentType,
      upsert: true,
      duplex: 'half',
    } as never,
  );
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode) || 500;
    throw fromHttpStatus(status, `Lỗi tải .frag lên kho: ${error.message}`);
  }
  return size;
}
