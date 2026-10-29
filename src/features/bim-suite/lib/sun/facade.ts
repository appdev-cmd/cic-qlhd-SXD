// G9: mặt đứng và mái: giờ nắng, ánh sáng bầu trời (gần đúng VSC), bức xạ mặt trời, tiềm năng điện mặt trời trên mái.
// Phân tích sơ bộ giai đoạn đầu như Forma: dò tia qua BVH tam giác thật; không thay mô phỏng chiếu sáng, năng lượng đạt chuẩn.
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { solarPosition, sunDirection, vnTime } from './solar';

const LIFT = 0.05;

export interface SurfacePoints {
  /** x, y, z (đã nhấc khỏi bề mặt theo pháp tuyến) */
  points: Float32Array;
  /** pháp tuyến hướng ra ngoài */
  normals: Float32Array;
  /** diện tích đại diện của mỗi điểm, m² */
  area: Float32Array;
  /** 0 = mặt đứng, 1 = mái */
  kind: Uint8Array;
  count: number;
  /** Chỉ số phần hình học (trong `parts` đưa vào sampleFacades) sinh ra điểm; dùng để biết cấu kiện nguồn */
  src?: Int32Array;
}

let rngState = 1;
const rng = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/** Hướng thử "nhìn ra trời": lệch lên 10°/35°/60°, sang hai bên ±40° so với pháp tuyến. */
function escapes(bvh: MeshBVH, p: THREE.Vector3, n: THREE.Vector3, ray: THREE.Ray): boolean {
  const side = new THREE.Vector3(-n.z, 0, n.x).normalize();
  for (const elev of [10, 35, 60]) {
    for (const az of [0, -40, 40]) {
      const e = (elev * Math.PI) / 180,
        a = (az * Math.PI) / 180;
      const h = new THREE.Vector3()
        .copy(n)
        .multiplyScalar(Math.cos(a))
        .addScaledVector(side, Math.sin(a))
        .setY(0)
        .normalize();
      ray.direction
        .copy(h)
        .multiplyScalar(Math.cos(e))
        .add(new THREE.Vector3(0, Math.sin(e), 0))
        .normalize();
      ray.origin.copy(p).addScaledVector(n, LIFT);
      if (!bvh.raycastFirst(ray, THREE.DoubleSide)) return true;
    }
  }
  return false;
}

/**
 * Điểm mẫu trên mặt đứng ngoài của công trình: tam giác gần thẳng đứng (|ny| < 0,35), số điểm theo diện tích (bước `step` m),
 * giữ mặt nhìn được ra trời (bỏ mặt trong nhà, khe kín). Pháp tuyến đảo chiều nếu phía kia mới là phía ngoài.
 */
export function sampleFacades(
  parts: Float32Array[],
  obstacles: MeshBVH,
  step: number,
  maxPoints: number,
  seed = 7,
): SurfacePoints {
  rngState = seed;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    n = new THREE.Vector3(),
    p = new THREE.Vector3();
  const tris: { o: number; part: Float32Array; area: number; pi: number }[] = [];
  let total = 0;
  for (const [pi, part] of parts.entries()) {
    for (let o = 0; o + 9 <= part.length; o += 9) {
      a.fromArray(part, o);
      b.fromArray(part, o + 3);
      c.fromArray(part, o + 6);
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const area = n.length() / 2;
      if (area < 1e-4) continue;
      n.normalize();
      if (Math.abs(n.y) > 0.35) continue;
      tris.push({ o, part, area, pi });
      total += area;
    }
  }
  // Nhiều tam giác đứng nằm trong nhà (vách ngăn, ống MEP) sẽ bị loại ở bước nhìn ra trời: lấy dư ứng viên gấp 4 rồi mới cắt
  const spacing = Math.max(step, Math.sqrt(total / Math.max(maxPoints * 4, 1)));
  const pts: number[] = [],
    nrm: number[] = [],
    ar: number[] = [],
    srcs: number[] = [];
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  for (const t of tris) {
    const expected = t.area / (spacing * spacing);
    let k = Math.floor(expected);
    if (rng() < expected - k) k++;
    if (!k) continue;
    a.fromArray(t.part, t.o);
    b.fromArray(t.part, t.o + 3);
    c.fromArray(t.part, t.o + 6);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize().setY(0).normalize();
    for (let i = 0; i < k; i++) {
      let u = rng(),
        v = rng();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      p.copy(a).addScaledVector(ab, u).addScaledVector(ac, v);
      let out = n.clone();
      if (!escapes(obstacles, p, out, ray)) {
        out = n.clone().negate();
        if (!escapes(obstacles, p, out, ray)) continue;
      }
      pts.push(p.x + out.x * LIFT, p.y, p.z + out.z * LIFT);
      nrm.push(out.x, 0, out.z);
      ar.push(t.area / k);
      srcs.push(t.pi);
    }
  }
  let count = ar.length;
  if (count > maxPoints) {
    // Cắt đều, dồn diện tích đại diện cho điểm còn lại
    const keepEvery = count / maxPoints;
    const P: number[] = [],
      N: number[] = [],
      A: number[] = [],
      S: number[] = [];
    for (let i = 0; i < maxPoints; i++) {
      const j = Math.floor(i * keepEvery);
      P.push(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]);
      N.push(nrm[j * 3], 0, nrm[j * 3 + 2]);
      A.push(ar[j] * keepEvery);
      S.push(srcs[j]);
    }
    count = maxPoints;
    return {
      points: Float32Array.from(P),
      normals: Float32Array.from(N),
      area: Float32Array.from(A),
      kind: new Uint8Array(count),
      count,
      src: Int32Array.from(S),
    };
  }
  return {
    points: Float32Array.from(pts),
    normals: Float32Array.from(nrm),
    area: Float32Array.from(ar),
    kind: new Uint8Array(count),
    count,
    src: Int32Array.from(srcs),
  };
}

/** Điểm mái nhìn thẳng lên trời được (bỏ sàn hầm nằm dưới đất bối cảnh, chỗ dưới mái che). */
export function openToSky(obstacles: MeshBVH, points: Float32Array, count: number): number[] {
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const keep: number[] = [];
  for (let p = 0; p < count; p++) {
    ray.origin.set(points[p * 3], points[p * 3 + 1] + LIFT, points[p * 3 + 2]);
    if (!obstacles.raycastFirst(ray, THREE.DoubleSide)) keep.push(p);
  }
  return keep;
}

/** Gộp mặt đứng và mái (mái: điểm lưới bề mặt trên cùng của công trình, pháp tuyến hướng lên). */
export function withRoof(
  facade: SurfacePoints,
  roof: { points: Float32Array; count: number; step: number } | null,
): SurfacePoints {
  if (!roof?.count) return facade;
  const count = facade.count + roof.count;
  const points = new Float32Array(count * 3),
    normals = new Float32Array(count * 3),
    area = new Float32Array(count),
    kind = new Uint8Array(count);
  points.set(facade.points);
  normals.set(facade.normals);
  area.set(facade.area);
  kind.set(facade.kind);
  points.set(roof.points, facade.count * 3);
  for (let i = facade.count; i < count; i++) {
    normals[i * 3 + 1] = 1;
    area[i] = roof.step * roof.step;
    kind[i] = 1;
  }
  return { points, normals, area, kind, count };
}

/** Hướng đều trên vòm trời (Fibonacci), cao độ > 0. */
export function skyDirections(n = 145): [number, number, number][] {
  const out: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) / n; // đều theo y trên bán cầu → đều theo góc khối
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}

/** Độ chói trời u ám CIE: L(cao độ) ∝ (1 + 2 sin h) / 3. */
const cie = (sinAlt: number) => (1 + 2 * sinAlt) / 3;

export interface SkyResult {
  /** Tỷ lệ bầu trời nhìn thấy (gần đúng VSC, %): độ rọi trời u ám CIE lên mặt phẳng điểm so với mặt ngang không che. Mặt đứng không che ≈ 39–40%. */
  vsc: Float32Array;
  /** Hệ số nhìn trời đẳng hướng (0–1): mặt ngang không che = 1, mặt đứng không che = 0,5. Dùng cho bức xạ khuếch tán. */
  svf: Float32Array;
}

export function skyView(obstacles: MeshBVH, s: SurfacePoints, dirs = skyDirections()): SkyResult {
  const vsc = new Float32Array(s.count),
    svf = new Float32Array(s.count);
  let horizontal = 0;
  for (const d of dirs) horizontal += d[1] * cie(d[1]);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  for (let p = 0; p < s.count; p++) {
    const nx = s.normals[p * 3],
      ny = s.normals[p * 3 + 1],
      nz = s.normals[p * 3 + 2];
    let w = 0,
      iso = 0;
    for (const d of dirs) {
      const cos = nx * d[0] + ny * d[1] + nz * d[2];
      if (cos <= 0) continue;
      ray.origin
        .set(s.points[p * 3], s.points[p * 3 + 1], s.points[p * 3 + 2])
        .addScaledVector(new THREE.Vector3(nx, ny, nz), LIFT);
      ray.direction.set(d[0], d[1], d[2]);
      if (obstacles.raycastFirst(ray, THREE.DoubleSide)) continue;
      w += cos * cie(d[1]);
      iso += cos;
    }
    vsc[p] = (w / horizontal) * 100;
    svf[p] = (2 * iso) / dirs.length;
  }
  return { vsc, svf };
}

/** Bức xạ trực xạ pháp tuyến trời quang (W/m²): mô hình Meinel với khối không khí Kasten–Young. Gần đúng, chỉ khi không có tệp khí hậu. */
export function clearSkyDni(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0;
  const am = 1 / (Math.sin((altitudeDeg * Math.PI) / 180) + 0.50572 * Math.pow(altitudeDeg + 6.07995, -1.6364));
  return 1353 * Math.pow(0.7, Math.pow(am, 0.678));
}

export interface Irradiance {
  dni: number;
  dhi: number;
}
export interface IrradianceStep {
  hour: number;
  dir: [number, number, number] | null;
  altitude: number;
  irr: Irradiance;
}

/** Các bước thời gian của một ngày kèm bức xạ: theo tệp EPW (giờ chuẩn địa phương) nếu có, không thì trời quang (khuếch tán = 10% trực xạ). */
export function irradianceSteps(
  date: string,
  stepMinutes: number,
  lat: number,
  lon: number,
  north: number,
  epw: EpwData | null,
): IrradianceStep[] {
  const step = stepMinutes / 60;
  const [, m, d] = date.split('-').map(Number);
  const out: IrradianceStep[] = [];
  for (let h = step / 2; h < 24; h += step) {
    const pos = solarPosition(vnTime(date, h), lat, lon);
    const dir = pos.altitude > 0 ? sunDirection(pos.azimuth, pos.altitude, north) : null;
    let irr: Irradiance;
    if (epw) {
      const row = epw.hours.get(`${m}-${d}-${Math.min(24, Math.floor(h) + 1)}`);
      irr = row ? { dni: row.dni, dhi: row.dhi } : { dni: 0, dhi: 0 };
    } else {
      const dni = clearSkyDni(pos.altitude);
      irr = { dni, dhi: 0.1 * dni };
    }
    if (!dir && irr.dhi <= 0) continue;
    out.push({ hour: h, dir, altitude: pos.altitude, irr });
  }
  return out;
}

export interface SurfaceSun {
  /** giờ nắng trực tiếp trong khung giờ đã chọn */
  hours: Float32Array;
  /** bức xạ trong ngày, Wh/m² (trực xạ có che + khuếch tán × hệ số nhìn trời); bỏ qua phản xạ mặt đất */
  irradiation: Float32Array;
}

/** Giờ nắng và bức xạ theo ngày của từng điểm. Mặt trời phải ở phía trước mặt (n·d > 0) và tia tới không bị chặn. */
export function surfaceSun(
  obstacles: MeshBVH,
  s: SurfacePoints,
  svf: Float32Array,
  steps: IrradianceStep[],
  stepHours: number,
  hourWindow: [number, number] = [0, 24],
): SurfaceSun {
  const hours = new Float32Array(s.count),
    irradiation = new Float32Array(s.count);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  for (const st of steps) {
    const inWindow = st.hour >= hourWindow[0] && st.hour <= hourWindow[1];
    for (let p = 0; p < s.count; p++) {
      let e = st.irr.dhi * svf[p];
      if (st.dir) {
        const cos = s.normals[p * 3] * st.dir[0] + s.normals[p * 3 + 1] * st.dir[1] + s.normals[p * 3 + 2] * st.dir[2];
        if (cos > 0.02) {
          ray.origin.set(s.points[p * 3], s.points[p * 3 + 1], s.points[p * 3 + 2]);
          ray.origin.x += s.normals[p * 3] * LIFT;
          ray.origin.y += s.normals[p * 3 + 1] * LIFT;
          ray.origin.z += s.normals[p * 3 + 2] * LIFT;
          ray.direction.set(st.dir[0], st.dir[1], st.dir[2]);
          if (!obstacles.raycastFirst(ray, THREE.DoubleSide)) {
            e += st.irr.dni * cos;
            if (inWindow) hours[p] += stepHours;
          }
        }
      }
      irradiation[p] += e * stepHours;
    }
  }
  return { hours, irradiation };
}

/** Hướng mặt đứng theo pháp tuyến (Bắc thật = −Z của trình xem quay `north` độ). */
export type Orientation = 'Bắc' | 'Đông' | 'Nam' | 'Tây';
export function orientationOf(nx: number, nz: number, north = 0): Orientation {
  // phương vị của pháp tuyến tính từ Bắc thật, theo chiều kim đồng hồ
  const az = ((Math.atan2(nx, -nz) * 180) / Math.PI - north + 720) % 360;
  return az < 45 || az >= 315 ? 'Bắc' : az < 135 ? 'Đông' : az < 225 ? 'Nam' : 'Tây';
}

export interface OrientationStat {
  huong: Orientation | 'Mái';
  dien_tich: number;
  gio_nang: number;
  vsc: number | null;
  buc_xa: number;
}
export function orientationStats(s: SurfacePoints, sun: SurfaceSun, sky: SkyResult, north = 0): OrientationStat[] {
  const acc = new Map<string, { a: number; h: number; v: number; e: number }>();
  for (let p = 0; p < s.count; p++) {
    const k = s.kind[p] === 1 ? 'Mái' : orientationOf(s.normals[p * 3], s.normals[p * 3 + 2], north);
    const x = acc.get(k) ?? { a: 0, h: 0, v: 0, e: 0 };
    const w = s.area[p];
    x.a += w;
    x.h += sun.hours[p] * w;
    x.v += sky.vsc[p] * w;
    x.e += sun.irradiation[p] * w;
    acc.set(k, x);
  }
  const order = ['Bắc', 'Đông', 'Nam', 'Tây', 'Mái'];
  return order
    .filter((k) => acc.has(k))
    .map((k) => {
      const x = acc.get(k)!;
      return {
        huong: k as OrientationStat['huong'],
        dien_tich: Math.round(x.a),
        gio_nang: Math.round((x.h / x.a) * 100) / 100,
        vsc: k === 'Mái' ? null : Math.round((x.v / x.a) * 10) / 10,
        buc_xa: Math.round(x.e / x.a),
      };
    });
}

/** Tiềm năng điện mặt trời trên mái: diện tích mái × bức xạ năm × hiệu suất tấm × hệ số hiệu năng (giả định nêu rõ). */
export const PV_ASSUMPTION = { hieu_suat: 0.2, he_so_he_thong: 0.8, ty_le_lap: 0.6 } as const;
export function roofPv(annualKwhPerM2: number, roofArea: number, a = PV_ASSUMPTION) {
  const area = roofArea * a.ty_le_lap;
  return {
    dien_tich_lap: Math.round(area),
    kwh_nam: Math.round(annualKwhPerM2 * area * a.hieu_suat * a.he_so_he_thong),
  };
}

// ── Tệp khí hậu EPW (EnergyPlus Weather) ──
export interface EpwData {
  location: string;
  lat: number | null;
  lon: number | null;
  tz: number | null;
  source: string;
  hours: Map<string, { dni: number; dhi: number; ghi: number }>;
}
/** Đọc EPW: dòng LOCATION, 8 dòng tiêu đề, rồi 8760 dòng giờ (tháng, ngày, giờ 1–24; GHI cột 14, DNI cột 15, DHI cột 16, tính từ 1). */
export function parseEpw(text: string): EpwData {
  const lines = text.split(/\r?\n/);
  const loc = (lines[0] ?? '').split(',');
  if (loc[0]?.trim().toUpperCase() !== 'LOCATION') throw new Error('Không phải tệp EPW (thiếu dòng LOCATION).');
  const hours = new Map<string, { dni: number; dhi: number; ghi: number }>();
  for (const line of lines.slice(8)) {
    const f = line.split(',');
    if (f.length < 16) continue;
    const m = Number(f[1]),
      d = Number(f[2]),
      h = Number(f[3]);
    const ghi = Number(f[13]),
      dni = Number(f[14]),
      dhi = Number(f[15]);
    if (!m || !d || !h || ![ghi, dni, dhi].every(Number.isFinite)) continue;
    hours.set(`${m}-${d}-${h}`, { ghi, dni: dni >= 9999 ? 0 : dni, dhi: dhi >= 9999 ? 0 : dhi });
  }
  if (hours.size < 24) throw new Error('Tệp EPW không có dữ liệu giờ.');
  const num = (s: string | undefined) => (s && Number.isFinite(Number(s)) ? Number(s) : null);
  return {
    location: [loc[1], loc[2], loc[3]].filter(Boolean).join(', '),
    lat: num(loc[6]),
    lon: num(loc[7]),
    tz: num(loc[8]),
    source: (loc[4] ?? '').trim(),
    hours,
  };
}
