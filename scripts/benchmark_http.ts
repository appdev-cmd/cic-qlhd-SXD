/** Read-only runtime timings; no credentials in output. */
import { performance } from 'node:perf_hooks';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8208');
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
  throw new Error('Địa chỉ HTTP không hợp lệ.');
const durations: number[] = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  const response = await fetch(new URL('/api/appraisal/runtime', base), {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Runtime chưa sẵn sàng: ' + response.status);
  await response.arrayBuffer();
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
console.log(
  JSON.stringify({ requests: durations.length, medianMs: Math.round(durations[10]), p95Ms: Math.round(durations[18]) }),
);
