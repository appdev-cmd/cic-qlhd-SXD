/// <reference lib="webworker" />
// Chạy phân tích nắng ngoài luồng giao diện: dựng BVH, lấy mẫu bề mặt trên cùng, dò tia theo từng bước thời gian.
import { buildObstacleBvh, sampleTopSurfaces, sunHoursFromLit, sunlitMatrix } from './sunHours';
import type { SunWorkerRequest, SunWorkerResponse } from './sunWorkerTypes';

const post = (msg: SunWorkerResponse, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = (event: MessageEvent<SunWorkerRequest>) => {
  const req = event.data;
  try {
    post({ type: 'progress', phase: 'bvh', done: 0, total: 1 });
    const { bvh, triangles } = buildObstacleBvh(req.parts);
    post({ type: 'progress', phase: 'grid', done: 0, total: 1 });
    const grid = sampleTopSurfaces(bvh, req.box, req.step, req.maxPoints);
    let last = 0;
    const lit = sunlitMatrix(bvh, grid, req.dirs, {
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - last > 150 || done === total) {
          last = now;
          post({ type: 'progress', phase: 'rays', done, total });
        }
      },
    });
    const hours = sunHoursFromLit(lit, grid.count, req.dirs.length, req.stepHours);
    post(
      {
        type: 'done',
        points: grid.points,
        count: grid.count,
        step: grid.step,
        groundY: grid.groundY,
        lit,
        hours,
        triangles,
      },
      [grid.points.buffer, lit.buffer, hours.buffer],
    );
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
