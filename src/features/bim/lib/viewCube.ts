// features/bim/lib/viewCube.ts
// Khối lập phương điều hướng: đổi hướng camera (quaternion three.js) sang transform CSS 3D

import * as THREE from 'three';

/** Hướng khối lập phương = nghịch đảo hướng camera */
export const quaternionToCss = (q: [number, number, number, number]) => {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3]).invert());
  // CSS có trục Y hướng xuống, three.js hướng lên → lấy đối xứng qua trục Y (S·R·S) để mặt TRÊN nằm trên
  const e = m.elements.map((n, i) => {
    const row = i % 4;
    const col = Math.floor(i / 4);
    return row < 3 && col < 3 && (row === 1) !== (col === 1) ? -n : n;
  });
  return `matrix3d(${e.map((n) => Number(n.toFixed(6))).join(',')})`;
};

// ------------------------------------------------------------
// Bấm cạnh và góc: mỗi mặt chia lưới 3×3 — ô giữa là mặt, ô cạnh là cạnh, ô góc là góc (26 hướng)
// ------------------------------------------------------------

export type Vec3 = [number, number, number];
export type CubeFace = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';

/**
 * Hệ trục của từng mặt theo toạ độ thế giới three.js (Y lên): n = pháp tuyến ra ngoài, right = chiều sang phải
 * của mặt khi nhìn thẳng vào nó, down = chiều xuống của mặt. Suy từ transform CSS của mặt (rotateX/rotateY
 * rồi translateZ) và phép đối xứng trục Y giữa CSS và three.js.
 */
export const CUBE_FACE_BASIS: Record<CubeFace, { n: Vec3; right: Vec3; down: Vec3 }> = {
  front: { n: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  right: { n: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  back: { n: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
  left: { n: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  top: { n: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  bottom: { n: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
};

/** Hướng nhìn (từ tâm ra camera, thành phần −1/0/1) của ô (cột, hàng) 0..2 trên một mặt */
export const cubeCellDirection = (face: CubeFace, col: number, row: number): Vec3 => {
  const { n, right, down } = CUBE_FACE_BASIS[face];
  const dc = col - 1;
  const dr = row - 1;
  return [0, 1, 2].map((i) => n[i] + right[i] * dc + down[i] * dr) as Vec3;
};

/** Loại ô: mặt (1 thành phần khác 0), cạnh (2), góc (3) */
export const cubeDirectionKind = (dir: Vec3): 'face' | 'edge' | 'corner' => {
  const k = dir.filter((v) => v !== 0).length;
  return k === 1 ? 'face' : k === 2 ? 'edge' : 'corner';
};

/** Nhãn tiếng Việt của hướng, VD "Góc trên, trước, phải" */
export const cubeDirectionLabel = (dir: Vec3): string => {
  const parts: string[] = [];
  if (dir[1] > 0) parts.push('trên');
  if (dir[1] < 0) parts.push('dưới');
  if (dir[2] > 0) parts.push('trước');
  if (dir[2] < 0) parts.push('sau');
  if (dir[0] > 0) parts.push('phải');
  if (dir[0] < 0) parts.push('trái');
  const kind = cubeDirectionKind(dir);
  return `${kind === 'face' ? 'Mặt' : kind === 'edge' ? 'Cạnh' : 'Góc'} ${parts.join(', ')}`;
};

/** Toàn bộ hướng khác nhau mà khối lập phương bấm được (26) */
export const allCubeDirections = (): Vec3[] => {
  const seen = new Map<string, Vec3>();
  (Object.keys(CUBE_FACE_BASIS) as CubeFace[]).forEach((face) => {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const d = cubeCellDirection(face, col, row);
        seen.set(d.join(','), d);
      }
    }
  });
  return [...seen.values()];
};

/**
 * Vị trí camera nhìn vào tâm theo hướng `dir` ở khoảng cách `distance`. Nhìn thẳng trên/dưới lệch rất nhỏ theo Z
 * để camera-controls không gặp điểm kỳ dị (trục lên trùng hướng nhìn).
 */
export const cameraPositionFor = (center: Vec3, dir: Vec3, distance: number): Vec3 => {
  const d: Vec3 = dir[0] === 0 && dir[2] === 0 ? [0, Math.sign(dir[1]) || 1, 0.0001] : [dir[0], dir[1], dir[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [center[0] + (d[0] / l) * distance, center[1] + (d[1] / l) * distance, center[2] + (d[2] / l) * distance];
};
