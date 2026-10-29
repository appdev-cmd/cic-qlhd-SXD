/// <reference lib="webworker" />
// G9: mặt đứng và mái ngoài luồng giao diện.
import { buildObstacleBvh, sampleTopSurfaces } from './sunHours';
import { irradianceSteps, openToSky, sampleFacades, skyView, surfaceSun, withRoof, type SurfacePoints } from './facade';
import type { FacadeWorkerRequest, FacadeWorkerResponse } from './facadeWorkerTypes';

const post = (msg: FacadeWorkerResponse, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = (event: MessageEvent<FacadeWorkerRequest>) => {
  const r = event.data;
  try {
    post({ type: 'progress', phase: 'bvh', done: 0, total: 1 });
    const all = buildObstacleBvh(r.obstacleParts);
    const building = buildObstacleBvh(r.buildingParts);
    post({ type: 'progress', phase: 'mau', done: 0, total: 1 });
    const facade = sampleFacades(r.buildingParts, all.bvh, r.step, Math.round(r.maxPoints * 0.75));
    // Mái: bề mặt trên cùng của riêng công trình, nhìn thẳng lên trời được (bỏ sàn hầm dưới đất bối cảnh)
    const bb = {
      min: [Infinity, Infinity, Infinity] as [number, number, number],
      max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
    };
    for (const part of r.buildingParts)
      for (let i = 0; i + 2 < part.length; i += 3)
        for (let k = 0; k < 3; k++) {
          if (part[i + k] < bb.min[k]) bb.min[k] = part[i + k];
          if (part[i + k] > bb.max[k]) bb.max[k] = part[i + k];
        }
    const top = sampleTopSurfaces(
      building.bvh,
      Number.isFinite(bb.min[0]) ? bb : r.box,
      r.step,
      Math.round(r.maxPoints * 0.25),
    );
    const keep = openToSky(all.bvh, top.points, top.count);
    const roofPts = new Float32Array(keep.length * 3);
    keep.forEach((p, i) => roofPts.set(top.points.subarray(p * 3, p * 3 + 3), i * 3));
    const s: SurfacePoints = withRoof(facade, { points: roofPts, count: keep.length, step: top.step });
    if (!s.count) throw new Error('Không tìm thấy mặt đứng hay mái nhìn ra trời trên công trình đang hiện.');

    post({ type: 'progress', phase: 'bau_troi', done: 0, total: 1 });
    const sky = skyView(all.bvh, s);
    post({ type: 'progress', phase: 'nang', done: 0, total: 1 });
    const steps = irradianceSteps(r.date, r.stepMinutes, r.lat, r.lon, r.north, r.epw);
    const sun = surfaceSun(all.bvh, s, sky.svf, steps, r.stepMinutes / 60, r.hourWindow);

    let annual: Float32Array | null = null;
    if (r.annual && keep.length) {
      // Chỉ điểm mái: 12 ngày đại diện, nhân số ngày của tháng
      const roofIdx = [...Array(s.count).keys()].filter((p) => s.kind[p] === 1);
      const roof: SurfacePoints = {
        points: Float32Array.from(roofIdx.flatMap((p) => [s.points[p * 3], s.points[p * 3 + 1], s.points[p * 3 + 2]])),
        normals: Float32Array.from(roofIdx.flatMap(() => [0, 1, 0])),
        area: Float32Array.from(roofIdx.map((p) => s.area[p])),
        kind: new Uint8Array(roofIdx.length).fill(1),
        count: roofIdx.length,
      };
      const roofSvf = Float32Array.from(roofIdx.map((p) => sky.svf[p]));
      const year = Number(r.date.slice(0, 4));
      const sum = new Float32Array(roof.count);
      for (let m = 1; m <= 12; m++) {
        post({ type: 'progress', phase: 'nam', done: m - 1, total: 12 });
        const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
        const st = irradianceSteps(`${year}-${String(m).padStart(2, '0')}-21`, 60, r.lat, r.lon, r.north, r.epw);
        const res = surfaceSun(all.bvh, roof, roofSvf, st, 1);
        for (let i = 0; i < roof.count; i++) sum[i] += (res.irradiation[i] * days) / 1000;
      }
      annual = new Float32Array(s.count);
      roofIdx.forEach((p, i) => (annual![p] = sum[i]));
    }
    const out = {
      type: 'done' as const,
      points: s.points,
      normals: s.normals,
      area: s.area,
      kind: s.kind,
      count: s.count,
      vsc: sky.vsc,
      svf: sky.svf,
      hours: sun.hours,
      irradiation: sun.irradiation,
      annual,
      triangles: all.triangles,
    };
    post(out, [
      s.points.buffer,
      s.normals.buffer,
      s.area.buffer,
      s.kind.buffer,
      sky.vsc.buffer,
      sky.svf.buffer,
      sun.hours.buffer,
      sun.irradiation.buffer,
      ...(annual ? [annual.buffer] : []),
    ]);
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
