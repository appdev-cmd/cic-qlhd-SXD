// Messages of facade.worker.ts (prebuilt into public/bim/workers by prepare:drawings).
import type { Box3Like } from './sunHours';
import { BIM_WORKER_URLS } from '../fragmentsWorker';
import type { EpwData } from './facade';

export interface FacadeWorkerRequest {
  /** Mọi vật cản (công trình + khối bối cảnh) */
  obstacleParts: Float32Array[];
  /** Riêng công trình: lấy mẫu mặt đứng và mái */
  buildingParts: Float32Array[];
  box: Box3Like;
  step: number;
  maxPoints: number;
  date: string;
  lat: number;
  lon: number;
  north: number;
  stepMinutes: number;
  hourWindow: [number, number];
  epw: EpwData | null;
  /** Ước tính bức xạ năm trên mái bằng 12 ngày đại diện (ngày 21 mỗi tháng) */
  annual: boolean;
}

export type FacadeWorkerResponse =
  | { type: 'progress'; phase: 'bvh' | 'mau' | 'bau_troi' | 'nang' | 'nam'; done: number; total: number }
  | {
      type: 'done';
      points: Float32Array;
      normals: Float32Array;
      area: Float32Array;
      kind: Uint8Array;
      count: number;
      vsc: Float32Array;
      svf: Float32Array;
      hours: Float32Array;
      irradiation: Float32Array;
      /** kWh/m²/năm cho điểm mái (0 với mặt đứng); null khi không ước tính năm */
      annual: Float32Array | null;
      triangles: number;
    }
  | { type: 'error'; message: string };

export function runFacadeWorker(req: FacadeWorkerRequest, onMessage: (msg: FacadeWorkerResponse) => void): () => void {
  const worker = new Worker(BIM_WORKER_URLS.facade, { type: 'module' });
  worker.onmessage = (e: MessageEvent<FacadeWorkerResponse>) => {
    onMessage(e.data);
    if (e.data.type !== 'progress') worker.terminate();
  };
  worker.onerror = (e) => {
    onMessage({ type: 'error', message: e.message || 'Worker mặt đứng lỗi.' });
    worker.terminate();
  };
  // Không chuyển quyền bộ đệm: phần công trình nằm trong cả hai danh sách
  worker.postMessage(req);
  return () => worker.terminate();
}
