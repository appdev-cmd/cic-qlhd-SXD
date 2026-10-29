import * as THREE from 'three';
import type CameraControls from 'camera-controls';

export function fitCameraToBox(controls: CameraControls, box: THREE.Box3, smooth: boolean) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
    const dir = new THREE.Vector3(0.58, 0.44, 0.68).normalize();
    const dist = Math.max(size.y * 1.35, sphere.radius * 1.12, 10);
    // Establish the isometric direction, then let camera-controls account for
    // the actual FOV and viewport aspect. A radius multiplier alone crops
    // wide site models, especially with the information panel open.
    controls
      .setLookAt(
        center.x + dir.x * dist,
        center.y + dir.y * dist,
        center.z + dir.z * dist,
        center.x,
        center.y,
        center.z,
        false,
      )
      .catch(() => undefined);
    controls.fitToSphere(new THREE.Sphere(sphere.center, sphere.radius * 1.06), smooth).catch(() => undefined);
  } else {
    controls
      .fitToBox(box, smooth, { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1 })
      .catch(() => undefined);
  }
}
