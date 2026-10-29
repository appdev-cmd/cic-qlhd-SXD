import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadEnvironment } from './environment.mjs';
import { probePort } from './runtime_ports.mjs';
import ports from '../config/runtime-ports.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '..');
loadEnvironment(root);
const workerPort = String(ports.worker);
if (
  new Set(Object.values(ports)).size !== 3 ||
  Object.values(ports).some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)
)
  throw new Error('Cấu hình cổng không hợp lệ hoặc trùng nhau.');
const env = {
  ...process.env,
  APPRAISAL_INTERNAL_TOKEN: process.env.APPRAISAL_INTERNAL_TOKEN || randomBytes(32).toString('hex'),
  APPRAISAL_WORKER_PORT: workerPort,
};
const command = process.argv[2] || 'dev';
if (command === 'dev' && ['cloud', 'supabase'].includes(env.APPRAISAL_MODE)) {
  const missing = ['APPRAISAL_DATABASE_URL'].filter((key) => !env[key]);
  if (!(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) missing.push('SUPABASE_URL');
  if (!(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) throw new Error(`Thiếu cấu hình cloud: ${missing.join(', ')}. Dùng file runtime.env riêng.`);
}
if (command === 'test') {
  // Unit tests must never inherit a live provider or cloud persistence configuration.
  env.APPRAISAL_MODE = 'demo';
  env.AI_PROVIDER = 'openai';
  delete env.APPRAISAL_DATABASE_URL;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_MODEL;
}
const children = [];
let stopping = false;
const start = (bin, args) => {
  const p = spawn(bin, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  p.on('error', (e) => {
    console.error(e.message);
    stop();
    process.exitCode = 1;
  });
  if (command === 'dev')
    p.on('exit', (code) => {
      if (!stopping) {
        process.exitCode = code || 1;
        stop();
      }
    });
  children.push(p);
  return p;
};
function stop() {
  stopping = true;
  for (const p of children) if (!p.killed) p.kill();
}
process.on('SIGINT', () => {
  stop();
  process.exit();
});
process.on('SIGTERM', () => {
  stop();
  process.exit();
});
if (command === 'dev') {
  try {
    for (const [name, number] of Object.entries(ports)) {
      const port = await probePort(number);
      if (!port.available)
        throw new Error(
          port.code === 'EACCES'
            ? `Windows chặn cổng ${number} (${name}); chưa khởi động dịch vụ.`
            : `Cổng ${number} (${name}) đang được sử dụng. Không tự đổi cổng; kiểm tra phiên đang chạy.`,
        );
    }
    // APPRAISAL_READY_TIMEOUT_MS overrides every step; otherwise a cold Vite start gets more time than the APIs.
    const configured = Number(process.env.APPRAISAL_READY_TIMEOUT_MS);
    const timeout = (fallback) => (Number.isFinite(configured) && configured > 0 ? configured : fallback);
    const ready = async (label, url, limit, headers = {}) => {
      const deadline = Date.now() + limit;
      while (Date.now() < deadline && !stopping) {
        try {
          const response = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
          if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (stopping) throw new Error(`Đã dừng trong khi chờ ${label}.`);
      throw new Error(
        `${label} chưa sẵn sàng sau ${Math.round(limit / 1000)} giây (${url}). ` +
          'Kiểm tra log phía trên; có thể tăng thời gian chờ bằng biến APPRAISAL_READY_TIMEOUT_MS.',
      );
    };
    start(process.execPath, ['--import', 'tsx', 'services/appraisal/main.ts']);
    await ready(`AI Worker (cổng ${ports.worker})`, `http://127.0.0.1:${ports.worker}/v1/runtime`, timeout(30_000), {
      'x-internal-token': env.APPRAISAL_INTERNAL_TOKEN,
    });
    start(process.execPath, ['--import', 'tsx', 'services/core/main.ts']);
    await ready(
      `Core API (cổng ${ports.core})`,
      `http://127.0.0.1:${ports.core}/api/appraisal/runtime`,
      timeout(30_000),
    );
    start(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js')]);
    await ready(`Web (cổng ${ports.web})`, `http://127.0.0.1:${ports.web}/api/appraisal/runtime`, timeout(90_000));
    console.log(
      `Sẵn sàng: http://localhost:${ports.web}/projects/appraisal • Web/API chung cổng ${ports.web}. Dừng cả bộ bằng Ctrl+C.`,
    );
  } catch (error) {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  }
} else if (command === 'seed') {
  const p = start(process.execPath, ['--import', 'tsx', 'scripts/seed_project_submissions.ts']);
  p.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  if (command === 'setup') {
    console.log('Backend dùng Node.js 24; chạy pnpm install để cài phụ thuộc.');
    process.exit();
  }
  const args =
    command === 'samples'
      ? ['--import', 'tsx', 'scripts/build_appraisal_samples.ts']
      : ['--import', 'tsx', '--test', 'services/appraisal/**/*.test.ts'];
  const p = start(process.execPath, args);
  p.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
