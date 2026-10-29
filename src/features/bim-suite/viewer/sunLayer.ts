// Phân tích nắng trong trình xem: lấy vật cản (tam giác thật, gồm cả khối bối cảnh) và vẽ lớp phủ giờ nắng / bóng đổ.
import * as THREE from 'three';
import { categoryItemIds } from './geometry';
import type { ViewerHandleDeps } from './imperativeHandle';
import type { BimSunOverlay, BimViewerRef } from './types';

const OVERLAY_NAME = '__bimSunOverlay';
/** Không phải vật thể che nắng: không gian, lỗ mở, chú giải, lưới trục, phần tử ảo. */
const NON_PHYSICAL = ['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT'].map(
  (c) => new RegExp(`^${c}$`, 'i'),
);

const OSM_NAME = '__bimOsmContext';

export const createSunApi = ({
  ctx,
  core,
  geometry,
}: ViewerHandleDeps): Pick<BimViewerRef, 'getSunObstacles' | 'setSunOverlay' | 'setContextMasses'> => {
  const { loadedRef, visibilityRef, colorHiddenRef, worldRef } = ctx;
  const { settleUpdate, sceneBox } = core;
  const { readTriangles } = geometry;

  const removeOverlay = () => {
    const scene = worldRef.current?.scene.three;
    const old = scene?.getObjectByName(OVERLAY_NAME);
    if (!scene || !old) return;
    scene.remove(old);
    old.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  };

  return {
    getSunObstacles: async (opts) => {
      const parts: Float32Array[] = [];
      const meta: { modelId: string; localId: number; context: boolean }[] = [];
      let items = 0;
      const plan: { modelId: string; ids: number[] }[] = [];
      for (const [modelId, m] of loadedRef.current) {
        const withGeometry = await m.getItemsIdsWithGeometry();
        const nonPhysical = new Set(await categoryItemIds(m, NON_PHYSICAL));
        const state = visibilityRef.current.get(modelId);
        const guids = opts?.excludeGuids?.[modelId];
        const excluded = new Set<number>(
          guids?.length ? (await m.getLocalIdsByGuids(guids)).filter((x): x is number => typeof x === 'number') : [],
        );
        const withContext = opts?.includeContext !== false;
        const colorHidden = colorHiddenRef.current.get(modelId);
        // Khối bối cảnh (contextOnly) vẫn che nắng; chỉ bỏ cấu kiện người dùng đang ẩn và lớp chú giải
        const ids = withGeometry.filter(
          (id) =>
            !nonPhysical.has(id) &&
            !excluded.has(id) &&
            (withContext || !state?.contextOnly?.has(id)) &&
            !colorHidden?.has(id) &&
            !(state?.isolated && !state.isolated.has(id)) &&
            !state?.hidden.has(id) &&
            !state?.filterHidden?.has(id) &&
            !state?.classificationHidden?.has(id) &&
            !state?.annotationHidden?.has(id),
        );
        plan.push({ modelId, ids });
      }
      const total = plan.reduce((s, p) => s + p.ids.length, 0);
      let done = 0;
      const BATCH = 400;
      for (const { modelId, ids } of plan) {
        for (let i = 0; i < ids.length; i += BATCH) {
          if (opts?.isCancelled?.()) return { parts, meta, items, box: null };
          const tris = await readTriangles(modelId, ids.slice(i, i + BATCH), opts?.isCancelled);
          const contextIds = visibilityRef.current.get(modelId)?.contextOnly;
          for (const [localId, t] of tris)
            if (t.length >= 9) {
              parts.push(t);
              meta.push({ modelId, localId, context: !!contextIds?.has(localId) });
              items++;
            }
          done += Math.min(BATCH, ids.length - i);
          opts?.onProgress?.(done, total);
        }
      }
      // Khối bối cảnh OpenStreetMap (G10) đang hiện cũng che nắng; gửi bản sao vì worker nhận quyền bộ đệm
      const osm = worldRef.current?.scene.three.getObjectByName(OSM_NAME) as THREE.Mesh | undefined;
      const osmTris = osm?.visible ? (osm.userData.tris as Float32Array | undefined) : undefined;
      if (opts?.includeContext !== false && osmTris?.length) {
        parts.push(osmTris.slice());
        meta.push({ modelId: OSM_NAME, localId: -1, context: true });
        items++;
      }
      const box = sceneBox();
      return {
        parts,
        meta,
        items,
        box:
          box && !box.isEmpty()
            ? { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
            : null,
      };
    },

    setSunOverlay: (overlay: BimSunOverlay | null) => {
      removeOverlay();
      const world = worldRef.current;
      if (!overlay || !world || overlay.count === 0) {
        settleUpdate();
        return;
      }
      const group = new THREE.Group();
      group.name = OVERLAY_NAME;
      const quad = new THREE.PlaneGeometry(overlay.cell * 0.94, overlay.cell * 0.94);
      quad.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: overlay.opacity ?? 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.InstancedMesh(quad, material, overlay.count);
      const m4 = new THREE.Matrix4();
      const color = new THREE.Color();
      const up = new THREE.Vector3(0, 1, 0),
        nrm = new THREE.Vector3(),
        q = new THREE.Quaternion(),
        pos = new THREE.Vector3(),
        one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < overlay.count; i++) {
        pos.set(overlay.points[i * 3], overlay.points[i * 3 + 1], overlay.points[i * 3 + 2]);
        if (overlay.normals) {
          // Ô vuông nằm ngang (pháp tuyến +Y) xoay về pháp tuyến của điểm
          q.setFromUnitVectors(
            up,
            nrm.set(overlay.normals[i * 3], overlay.normals[i * 3 + 1], overlay.normals[i * 3 + 2]).normalize(),
          );
          m4.compose(pos, q, one);
        } else m4.makeTranslation(pos.x, pos.y, pos.z);
        mesh.setMatrixAt(i, m4);
        color.setRGB(overlay.colors[i * 3], overlay.colors[i * 3 + 1], overlay.colors[i * 3 + 2], THREE.SRGBColorSpace);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      group.add(mesh);

      // Tia chỉ hướng mặt trời từ tâm vùng phân tích
      if (overlay.sun) {
        const box = sceneBox();
        if (box && !box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const r = box.getSize(new THREE.Vector3()).length() * 0.45;
          const dir = new THREE.Vector3(...overlay.sun).normalize();
          const sunPos = center.clone().addScaledVector(dir, r);
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([center, sunPos]),
            new THREE.LineDashedMaterial({ color: '#cf5720', dashSize: r / 30, gapSize: r / 45, depthTest: false }),
          );
          line.computeLineDistances();
          line.renderOrder = 3;
          const sun = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(r / 40, 1.5), 16, 12),
            new THREE.MeshBasicMaterial({ color: '#f29a6c', depthTest: false }),
          );
          sun.position.copy(sunPos);
          sun.renderOrder = 3;
          group.add(line, sun);
        }
      }
      world.scene.three.add(group);
      settleUpdate();
    },

    setContextMasses: (tris: Float32Array | null, opts?: { visible?: boolean }) => {
      const world = worldRef.current;
      if (!world) return;
      const scene = world.scene.three;
      const old = scene.getObjectByName(OSM_NAME) as THREE.Mesh | undefined;
      if (old && (tris === null || old.userData.tris !== tris)) {
        scene.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
      if (tris?.length) {
        let mesh = scene.getObjectByName(OSM_NAME) as THREE.Mesh | undefined;
        if (!mesh) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(tris, 3));
          geometry.computeVertexNormals();
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshLambertMaterial({
              color: '#cbd5e1',
              transparent: true,
              opacity: 0.9,
              side: THREE.DoubleSide,
            }),
          );
          mesh.name = OSM_NAME;
          mesh.userData.tris = tris;
          scene.add(mesh);
        }
        mesh.visible = opts?.visible !== false;
      }
      settleUpdate();
    },
  };
};
