// features/bim/lib/minimap.ts
// Bản đồ mặt bằng thu nhỏ khi đi bộ trong công trình: vẽ lát cắt ngang tại cao độ mắt từ khung bao
// cấu kiện (tường, cột cắt qua cao độ mắt đậm; sàn ngay dưới chân nhạt), kèm vị trí và hướng nhìn camera.
// Hệ trục Fragments: Y hướng lên → mặt bằng là mặt phẳng XZ.

export interface MinimapExtent {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface MinimapTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Đặt khung mặt bằng vừa canvas, giữ tỉ lệ, chừa lề */
export const fitExtent = (ext: MinimapExtent, width: number, height: number, pad = 8): MinimapTransform => {
  const w = Math.max(ext.maxX - ext.minX, 1e-6);
  const d = Math.max(ext.maxZ - ext.minZ, 1e-6);
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / d);
  return {
    scale,
    offsetX: (width - w * scale) / 2 - ext.minX * scale,
    offsetY: (height - d * scale) / 2 - ext.minZ * scale,
  };
};

export const worldToMap = (t: MinimapTransform, x: number, z: number) => ({
  x: x * t.scale + t.offsetX,
  y: z * t.scale + t.offsetY,
});

export const mapToWorld = (t: MinimapTransform, px: number, py: number) => ({
  x: (px - t.offsetX) / t.scale,
  z: (py - t.offsetY) / t.scale,
});

/**
 * Phân loại khung bao theo cao độ mắt `eye`:
 *  - 'cat': cấu kiện cắt qua dải [eye - 1.2, eye + 0.2] (tường, cột, cửa) → vẽ đậm
 *  - 'san': cấu kiện mỏng nằm ngay dưới chân (mặt trên trong [eye - 2.4, eye - 0.9]) → vẽ nhạt
 *  - null : bỏ qua
 * `boxes` là mảng phẳng [minX,minY,minZ,maxX,maxY,maxZ, ...].
 */
export const classifyBox = (boxes: Float32Array, i: number, eye: number): 'cat' | 'san' | null => {
  const minY = boxes[i + 1];
  const maxY = boxes[i + 4];
  if (minY <= eye + 0.2 && maxY >= eye - 1.2) return 'cat';
  if (maxY <= eye - 0.9 && maxY >= eye - 2.4 && maxY - minY < 1.2) return 'san';
  return null;
};

/** Vẽ mặt bằng lát cắt lên canvas (lớp nền, vẽ lại khi đổi tầng) */
export const drawPlan = (
  ctx: CanvasRenderingContext2D,
  boxes: Float32Array,
  eye: number,
  t: MinimapTransform,
  dark: boolean,
) => {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, width, height);
  const floors: number[] = [];
  const cuts: number[] = [];
  for (let i = 0; i < boxes.length; i += 6) {
    const kind = classifyBox(boxes, i, eye);
    if (kind === 'cat') cuts.push(i);
    else if (kind === 'san') floors.push(i);
  }
  const rect = (i: number) => {
    const a = worldToMap(t, boxes[i], boxes[i + 2]);
    const b = worldToMap(t, boxes[i + 3], boxes[i + 5]);
    return [a.x, a.y, Math.max(b.x - a.x, 0.8), Math.max(b.y - a.y, 0.8)] as const;
  };
  ctx.fillStyle = dark ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)';
  floors.forEach((i) => ctx.fillRect(...rect(i)));
  ctx.fillStyle = dark ? 'rgba(226,232,240,0.85)' : 'rgba(30,41,59,0.8)';
  cuts.forEach((i) => ctx.fillRect(...rect(i)));
  return { floors: floors.length, cuts: cuts.length };
};

/** Vị trí + hình quạt hướng nhìn của camera */
export const drawCamera = (
  ctx: CanvasRenderingContext2D,
  t: MinimapTransform,
  pos: { x: number; z: number },
  dir: { x: number; z: number },
) => {
  const p = worldToMap(t, pos.x, pos.z);
  const angle = Math.atan2(dir.z, dir.x);
  ctx.save();
  ctx.fillStyle = 'rgba(37,99,235,0.25)';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, 28, angle - 0.55, angle + 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};
