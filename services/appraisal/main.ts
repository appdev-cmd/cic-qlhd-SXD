import { createWorkerApp } from './app.js';
import { resumeLocalJobs } from './jobs.js';
import ports from '../../config/runtime-ports.json' with { type: 'json' };
const server = createWorkerApp().listen(ports.worker, '127.0.0.1', () => {
  console.log(`Node Worker: 127.0.0.1:${ports.worker}`);
  void resumeLocalJobs().catch(() => console.error('Chưa phục hồi được hàng đợi; sẽ thử lại.'));
});
const recovery = setInterval(() => {
  void resumeLocalJobs().catch(() => console.error('Chưa phục hồi được hàng đợi.'));
}, 30_000);
recovery.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    clearInterval(recovery);
    server.close(() => process.exit());
  });
