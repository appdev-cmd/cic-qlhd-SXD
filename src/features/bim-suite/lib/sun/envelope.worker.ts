/// <reference lib="webworker" />
// Vỏ công trình (QCVN 04-3): lấy mẫu mặt đứng ngoài, trả pháp tuyến, diện tích, phần hình học nguồn của từng điểm.
import { buildObstacleBvh } from './sunHours';
import { sampleFacades } from './facade';
import type { EnvelopeWorkerRequest, EnvelopeWorkerResponse } from './envelopeWorkerTypes';

self.onmessage = (event: MessageEvent<EnvelopeWorkerRequest>) => {
  const r = event.data;
  try {
    const all = buildObstacleBvh(r.obstacleParts);
    const s = sampleFacades(r.envelopeParts, all.bvh, r.step, r.maxPoints);
    const src = s.src ?? new Int32Array(0);
    (self as DedicatedWorkerGlobalScope).postMessage(
      { type: 'done', normals: s.normals, area: s.area, src, count: s.count } satisfies EnvelopeWorkerResponse,
      [s.normals.buffer, s.area.buffer, src.buffer],
    );
  } catch (e) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    } satisfies EnvelopeWorkerResponse);
  }
};
