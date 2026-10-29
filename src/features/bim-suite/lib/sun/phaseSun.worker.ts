/// <reference lib="webworker" />
// G6: chạy nắng theo mốc tiến độ ngoài luồng giao diện.
import { buildObstacleBvh } from './sunHours';
import { buildStagedBvh, phaseSunHours, sampleContext } from './phaseSun';
import type { PhaseWorkerRequest, PhaseWorkerResponse } from './phaseWorkerTypes';

const post = (msg: PhaseWorkerResponse, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = (event: MessageEvent<PhaseWorkerRequest>) => {
  const req = event.data;
  try {
    post({ type: 'progress', phase: 'bvh', done: 0, total: 1 });
    if (!req.contextParts.length)
      throw new Error('Không có khối bối cảnh (nhà lân cận, mặt đất) để đánh giá ảnh hưởng.');
    const context = buildObstacleBvh(req.contextParts);
    const building = req.buildingParts.length ? buildStagedBvh(req.buildingParts, req.buildingStages) : null;
    post({ type: 'progress', phase: 'grid', done: 0, total: 1 });
    const grid = sampleContext(context.bvh, building, req.box, req.step, req.maxPoints);
    let last = 0;
    const r = phaseSunHours(context.bvh, building, grid, req.dirs, req.stageCount, req.stepHours, {
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - last > 150 || done === total) {
          last = now;
          post({ type: 'progress', phase: 'rays', done, total });
        }
      },
    });
    post(
      {
        type: 'done',
        points: grid.points,
        count: grid.count,
        step: grid.step,
        base: r.base,
        hours: r.hours,
        triangles: context.triangles + (building?.triangles ?? 0),
      },
      [grid.points.buffer, r.base.buffer, r.hours.buffer],
    );
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
