// features/bim/lib/basemap.ts
// Nền bản đồ OpenStreetMap dưới mô hình: đổi khung mặt bằng (mét, gốc = toạ độ IfcSite) sang ô bản đồ và ghép ảnh.
// Quy ước trình xem: X hướng Đông, −Z hướng Bắc (IFC Y = Bắc → Fragments Z = −Y).

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const R = 6378137;

export const lonToTileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tileXToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileYToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Độ lệch (mét) Đông/Bắc của (lat, lon) so với gốc (lat0, lon0) — xấp xỉ phẳng cục bộ */
export const metersFromOrigin = (lat0: number, lon0: number, lat: number, lon: number) => ({
  east: ((lon - lon0) * Math.PI * R * Math.cos((lat0 * Math.PI) / 180)) / 180,
  north: ((lat - lat0) * Math.PI * R) / 180,
});

export const originToLatLon = (lat0: number, lon0: number, east: number, north: number) => ({
  lat: lat0 + (north / R) * (180 / Math.PI),
  lon: lon0 + (east / (R * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI),
});

/** Chọn mức zoom sao cho vùng cần phủ ≤ maxTiles ô mỗi chiều */
export const pickZoom = (lat0: number, lon0: number, halfSizeM: number, maxTiles = 6) => {
  for (let z = 19; z >= 3; z--) {
    const a = originToLatLon(lat0, lon0, -halfSizeM, halfSizeM);
    const b = originToLatLon(lat0, lon0, halfSizeM, -halfSizeM);
    const nx = Math.floor(lonToTileX(b.lon, z)) - Math.floor(lonToTileX(a.lon, z)) + 1;
    const ny = Math.floor(latToTileY(b.lat, z)) - Math.floor(latToTileY(a.lat, z)) + 1;
    if (nx <= maxTiles && ny <= maxTiles) return z;
  }
  return 3;
};

/**
 * Ghép ảnh nền OSM phủ khung mặt bằng quanh gốc (lat0, lon0).
 * Trả ảnh (data URL) và khung mét tương ứng trong hệ trình xem (minX..maxX Đông, minZ..maxZ = −Bắc).
 */
export const buildOsmGround = async (
  lat0: number,
  lon0: number,
  halfSizeM: number,
  tileUrl = OSM_TILE_URL,
): Promise<{ url: string; minX: number; minZ: number; maxX: number; maxZ: number; zoom: number }> => {
  const z = pickZoom(lat0, lon0, halfSizeM);
  const nw = originToLatLon(lat0, lon0, -halfSizeM, halfSizeM);
  const se = originToLatLon(lat0, lon0, halfSizeM, -halfSizeM);
  const x0 = Math.floor(lonToTileX(nw.lon, z));
  const x1 = Math.floor(lonToTileX(se.lon, z));
  const y0 = Math.floor(latToTileY(nw.lat, z));
  const y1 = Math.floor(latToTileY(se.lat, z));
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * size;
  canvas.height = (y1 - y0 + 1) * size;
  const ctx = canvas.getContext('2d')!;
  const loads: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      loads.push(
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, (x - x0) * size, (y - y0) * size, size, size);
            resolve();
          };
          img.onerror = () => reject(new Error('Không tải được ô bản đồ (mạng chặn máy chủ bản đồ?)'));
          img.src = tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
        }),
      );
    }
  }
  await Promise.all(loads);
  // Ghi chú bản quyền OSM
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(canvas.width - 190, canvas.height - 18, 190, 18);
  ctx.fillStyle = '#334155';
  ctx.font = '11px sans-serif';
  ctx.fillText('© OpenStreetMap contributors', canvas.width - 184, canvas.height - 5);

  const tl = metersFromOrigin(lat0, lon0, tileYToLat(y0, z), tileXToLon(x0, z));
  const br = metersFromOrigin(lat0, lon0, tileYToLat(y1 + 1, z), tileXToLon(x1 + 1, z));
  return {
    url: canvas.toDataURL('image/jpeg', 0.85),
    minX: tl.east,
    maxX: br.east,
    minZ: -tl.north,
    maxZ: -br.north,
    zoom: z,
  };
};
