// Chạy convertJob trong tiến trình con với giới hạn thời gian (có thể kill khi treo).
// Dùng tiến trình con thay vì worker_threads: web-ifc trong worker thread (Node 20) chạy chậm bất thường
// ở bước tính hình học, còn tiến trình con có môi trường giống hệt tiến trình chính.
// Vào/ra qua đĩa: cha truyền đường dẫn IFC (đã tải theo luồng), con trả .frag trên đĩa + bản tóm tắt nhỏ.
import { fork } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { JobSummary } from './convertJob';
import type { StagingTarget } from './staging';
import { JobError, classifyError } from './errors';

export type { JobSummary } from './convertJob';

export interface JobOutput {
  summary: JobSummary;
  /** .frag trên đĩa; người gọi tải lên rồi gọi cleanup() */
  fragPath: string;
  /** Có khi chạy không kèm job (kiểm thử): cấu kiện dạng NDJSON */
  elementsPath: string | null;
  /** topology.json (mạng kết nối MEP) nếu mô hình có cổng hoặc hệ thống */
  topologyPath: string | null;
  workDir: string;
  cleanup: () => void;
}

/**
 * Thời gian tối đa: 10 phút + 1 phút cho mỗi 5MB dữ liệu IFC (tối đa 120 phút).
 * File nén ước tính giãn ~5 lần; bước ước tính khối lượng từ hình học là phần tốn thời gian nhất.
 */
export const jobTimeoutMs = (bytes: number, compressed = false) => {
  const estimated = compressed ? bytes * 5 : bytes;
  return Math.min(120, 10 + Math.ceil(estimated / (5 * 1024 * 1024))) * 60 * 1000;
};

const here = path.dirname(fileURLToPath(import.meta.url));

export const runConvertJob = (
  inputPath: string,
  name: string,
  onProgress: (percent: number, message: string) => void,
  options: { timeoutMs?: number; job?: StagingTarget | null } = {},
): Promise<JobOutput> =>
  new Promise((resolve, reject) => {
    const compressed = /\.(ifczip|zip)$/i.test(name);
    const timeoutMs = options.timeoutMs ?? jobTimeoutMs(fs.statSync(inputPath).size, compressed);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-job-'));
    const cleanup = () => fs.rmSync(workDir, { recursive: true, force: true });
    const args = [inputPath, workDir, name, ...(options.job ? [JSON.stringify(options.job)] : [])];

    const child = fork(path.join(here, 'convertJob.ts'), args, {
      execArgv: ['--import', 'tsx', `--max-old-space-size=${process.env.BIM_JOB_HEAP_MB || 4608}`],
      // NODE_OPTIONS của tiến trình cha (heap nhỏ) không được đè lên heap của tiến trình con
      env: {
        ...process.env,
        NODE_OPTIONS: (process.env.NODE_OPTIONS || '').replace(/--max-old-space-size=\d+/g, '').trim(),
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });

    let settled = false;
    const finish = (ok: boolean, fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      if (!ok) cleanup();
      fn();
    };

    const timer = setTimeout(() => {
      const minutes = Math.max(1, Math.round(timeoutMs / 60000));
      finish(false, () => reject(new JobError('TIMEOUT', `Quá thời gian xử lý (${minutes} phút)`)));
    }, timeoutMs);

    child.on(
      'message',
      (msg: { type?: string; percent?: number; message?: string; error?: unknown; summary?: JobSummary }) => {
        if (msg?.type === 'progress') onProgress(msg.percent ?? 0, msg.message ?? '');
        else if (msg?.type === 'error') finish(false, () => reject(classifyError(msg.error)));
        else if (msg?.type === 'done' && msg.summary) {
          const elementsPath = path.join(workDir, 'elements.ndjson');
          finish(true, () =>
            resolve({
              summary: msg.summary!,
              fragPath: path.join(workDir, 'model.frag'),
              elementsPath: fs.existsSync(elementsPath) ? elementsPath : null,
              topologyPath: fs.existsSync(path.join(workDir, 'topology.json'))
                ? path.join(workDir, 'topology.json')
                : null,
              workDir,
              cleanup,
            }),
          );
        }
      },
    );
    child.on('error', (err) => finish(false, () => reject(classifyError(err))));
    child.on('exit', (code, signal) => {
      if (!settled)
        finish(false, () =>
          reject(
            new JobError(
              'CHILD_CRASH',
              `Tiến trình xử lý dừng bất thường (mã ${code ?? signal}) – có thể thiếu bộ nhớ`,
            ),
          ),
        );
    });
  });
