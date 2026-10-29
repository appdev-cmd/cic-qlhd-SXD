// Điểm móc quét virus trước khi chuyển đổi. Dùng cùng giao thức clamd INSTREAM với
// selfhost/api/src/routes/scan-virus.js (Edge Function scan-virus chỉ là điểm chặn fail-closed).
//   BIM_SCAN_MODE=off       (mặc định) bỏ qua, ghi "skipped" vào số liệu job
//   BIM_SCAN_MODE=clamav    quét; máy quét không sẵn sàng → bỏ qua có ghi chú
//   BIM_SCAN_MODE=required  quét bắt buộc; máy quét không sẵn sàng → lỗi tạm thời (thử lại sau)
// Có virus → lỗi vĩnh viễn VIRUS, không chuyển đổi.
import * as fs from 'fs';
import * as net from 'net';
import { JobError } from './errors';

export type ScanMode = 'off' | 'clamav' | 'required';
export interface ScanResult {
  status: 'clean' | 'skipped';
  engine: string | null;
  ms: number;
  note?: string;
}

export const scanMode = (value = process.env.BIM_SCAN_MODE): ScanMode =>
  value === 'clamav' || value === 'required' ? value : 'off';

/** Gửi tệp tới clamd theo khúc (INSTREAM) đọc thẳng từ đĩa. */
export function clamdScanFile(
  file: string,
  host: string,
  port: number,
  timeoutMs = 120_000,
): Promise<{ clean: boolean; signature: string | null; limit?: boolean }> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(port, host);
    let reply = '';
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error('clamd timeout')));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      const stream = fs.createReadStream(file, { highWaterMark: 64 * 1024 });
      stream.on('data', (chunk: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length, 0);
        if (!sock.write(Buffer.concat([len, chunk]))) {
          stream.pause();
          sock.once('drain', () => stream.resume());
        }
      });
      stream.on('end', () => sock.write(Buffer.alloc(4)));
      stream.on('error', (err) => sock.destroy(err));
    });
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => {
      const out = reply.replace(/\0+$/, '').trim();
      if (out.endsWith('OK')) resolve({ clean: true, signature: null });
      else if (/size limit exceeded/i.test(out)) resolve({ clean: true, signature: null, limit: true });
      else if (out.includes('FOUND'))
        resolve({ clean: false, signature: out.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '') });
      else reject(new Error(`clamd phản hồi lạ: ${out}`));
    });
    sock.on('error', reject);
  });
}

export async function scanBeforeConvert(file: string, mode: ScanMode = scanMode()): Promise<ScanResult> {
  const started = Date.now();
  if (mode === 'off') return { status: 'skipped', engine: null, ms: 0, note: 'BIM_SCAN_MODE=off' };
  const host = process.env.CLAMAV_HOST || 'clamav';
  const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
  try {
    const result = await clamdScanFile(file, host, port);
    if (!result.clean)
      throw new JobError('VIRUS', `Phát hiện mã độc trong tệp IFC (${result.signature}); không chuyển đổi.`);
    if (result.limit) {
      if (mode === 'required')
        throw new JobError(
          'SCANNER_UNAVAILABLE',
          'Tệp vượt giới hạn quét của clamd (StreamMaxLength); tăng giới hạn hoặc tắt BIM_SCAN_MODE=required.',
          { kind: 'permanent' },
        );
      return { status: 'skipped', engine: 'clamav', ms: Date.now() - started, note: 'vượt StreamMaxLength của clamd' };
    }
    return { status: 'clean', engine: 'clamav', ms: Date.now() - started };
  } catch (err) {
    if (err instanceof JobError) throw err;
    if (mode === 'required')
      throw new JobError('SCANNER_UNAVAILABLE', `Không quét được virus: ${(err as Error).message}`, {
        kind: 'transient',
      });
    return {
      status: 'skipped',
      engine: 'clamav',
      ms: Date.now() - started,
      note: `máy quét không sẵn sàng: ${(err as Error).message}`,
    };
  }
}
