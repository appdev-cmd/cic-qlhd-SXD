// Field photos: scaled to at most 1600 px (JPEG 85%) plus the GPS position when the user allows it.
// B3's field panel uploads raw files, so this helper is new to BuildSIA (ported from cic-hud).

export interface FieldPhoto {
  /** JPEG data URL */
  photo: string;
  /** "lat, lng (±m)" or null without a position */
  gps: string | null;
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
}
/** Current position (if allowed); null when unavailable or timed out. */
export const readGeolocation = (timeout = 6000): Promise<GeoFix | null> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: Number(p.coords.latitude.toFixed(6)),
          lng: Number(p.coords.longitude.toFixed(6)),
          accuracy: Math.round(p.coords.accuracy),
        }),
      () => resolve(null),
      { timeout, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
export const formatGeo = (fix: GeoFix | null) => (fix ? `${fix.lat}, ${fix.lng} (±${fix.accuracy} m)` : null);

export const readFieldPhoto = async (file: File): Promise<FieldPhoto> => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const photo = canvas.toDataURL('image/jpeg', 0.85);
  return { photo, gps: formatGeo(await readGeolocation()) };
};

/** data URL → Blob for upload to the project's private bucket. */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [head, body = ''] = dataUrl.split(',', 2);
  const type = head.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bytes = atob(body);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type });
};
