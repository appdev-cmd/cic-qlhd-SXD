// Tiện ích dựng/giải phóng đối tượng Three.js dùng chung cho đo đạc, mặt cắt, ghim va chạm
import * as THREE from 'three';

export const isCoarsePointer = () => {
  try {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
};

export const makeLine = (points: THREE.Vector3[], color: string, dashed = false) => {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, depthTest: false, dashSize: 0.15, gapSize: 0.1 })
    : new THREE.LineBasicMaterial({ color, depthTest: false });
  const line = new THREE.Line(geom, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 998;
  return line;
};

export const disposeObject = (object: THREE.Object3D | null | undefined) => {
  object?.traverse((o: any) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
};
