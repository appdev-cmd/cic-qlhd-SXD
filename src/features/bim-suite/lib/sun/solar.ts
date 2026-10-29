// Vị trí mặt trời (thuật toán NOAA, sai số khoảng 0,01° cho 1800–2100) và hướng tia nắng trong hệ toạ độ trình xem.
// Trình xem: trục Y hướng lên; hướng Bắc của trình xem là −Z, Đông là +X (nhìn từ trên xuống, chiều kim đồng hồ).

const RAD = Math.PI / 180;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** Toạ độ giả định khi dự án chưa có vị trí và mô hình không có toạ độ IfcSite: trung tâm Hà Nội. */
export const DEFAULT_LOCATION = { lat: 21.0285, lon: 105.8542, label: 'Hà Nội (vị trí giả định)' } as const;

export type LocationSource = 'du_an' | 'mo_hinh' | 'mac_dinh';
export interface SiteLocation {
  lat: number;
  lon: number;
  /** Góc Bắc thật so với −Z của trình xem, độ. */
  north: number;
  source: LocationSource;
  /** Mô tả nguồn để hiển thị (giả định phải nói rõ). */
  label: string;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Vị trí dùng cho phân tích: toạ độ đã lưu của dự án, rồi toạ độ IfcSite của mô hình đã xử lý xong,
 * cuối cùng vị trí giả định Hà Nội. Góc Bắc thật lấy từ hồ sơ dự án (mặc định 0).
 */
export function resolveSiteLocation(
  saved: { vi_do: number | null; kinh_do: number | null; goc_bac_thuc: number | null } | null,
  models: {
    file_name?: string | null;
    status?: string | null;
    georef?: { latitude?: number | null; longitude?: number | null } | null;
  }[] = [],
): SiteLocation {
  const { vi_do: lat, kinh_do: lon, goc_bac_thuc: n } = saved ?? {};
  const north = finite(n) ? n : 0;
  if (finite(lat) && finite(lon)) return { lat, lon, north, source: 'du_an', label: 'Vị trí dự án' };
  for (const m of models) {
    const mLat = m.georef?.latitude,
      mLon = m.georef?.longitude;
    if (m.status === 'ready' && finite(mLat) && finite(mLon))
      return {
        lat: mLat,
        lon: mLon,
        north,
        source: 'mo_hinh',
        label: `Toạ độ IfcSite của mô hình ${m.file_name ?? ''}`.trim(),
      };
  }
  return {
    lat: DEFAULT_LOCATION.lat,
    lon: DEFAULT_LOCATION.lon,
    north,
    source: 'mac_dinh',
    label: DEFAULT_LOCATION.label,
  };
}
/** Giờ Việt Nam: UTC+7, không đổi giờ mùa hè. */
export const VN_OFFSET_HOURS = 7;

export interface SolarPosition {
  /** Góc phương vị, độ, từ Bắc thật theo chiều kim đồng hồ (0 = Bắc, 90 = Đông). */
  azimuth: number;
  /** Độ cao mặt trời so với chân trời, độ (đã hiệu chỉnh khúc xạ khí quyển gần đúng). */
  altitude: number;
  /** Xích vĩ mặt trời, độ. */
  declination: number;
}

/** Vị trí mặt trời tại một thời điểm (UTC) và vị trí (độ WGS84, kinh độ Đông dương). */
export function solarPosition(at: Date, lat: number, lon: number): SolarPosition {
  const jd = at.getTime() / 86_400_000 + 2_440_587.5;
  const t = (jd - 2_451_545) / 36_525;
  const l0 = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360);
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const trueSolar = mod(utcMinutes + eot + 4 * lon, 1440);
  const hourAngle = trueSolar / 4 - 180;
  const phi = lat * RAD;
  const ha = hourAngle * RAD;
  const cosZen = Math.min(
    1,
    Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)),
  );
  let altitude = 90 - Math.acos(cosZen) / RAD;
  // Khúc xạ gần đúng (Bennett) khi mặt trời trên chân trời
  if (altitude > -0.575) altitude += 1.02 / Math.tan((altitude + 10.3 / (altitude + 5.11)) * RAD) / 60;
  const azimuth = mod(
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180,
    360,
  );
  return { azimuth, altitude, declination: decl / RAD };
}

/**
 * Vector đơn vị chỉ về phía mặt trời trong hệ trình xem.
 * `northOffset`: góc Bắc thật so với −Z của trình xem, độ, chiều kim đồng hồ nhìn từ trên xuống.
 */
export function sunDirection(azimuth: number, altitude: number, northOffset = 0): [number, number, number] {
  const a = (azimuth + northOffset) * RAD;
  const h = altitude * RAD;
  const horizontal = Math.cos(h);
  return [Math.sin(a) * horizontal, Math.sin(h), -Math.cos(a) * horizontal];
}

/** Thời điểm UTC của một giờ địa phương Việt Nam. `date` dạng yyyy-mm-dd, `hour` có thể lẻ (6.25 = 6:15). */
export function vnTime(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + (hour - VN_OFFSET_HOURS) * 3_600_000);
}

export interface SunStep {
  /** Giờ địa phương (6.5 = 6:30). */
  hour: number;
  azimuth: number;
  altitude: number;
  /** Hướng về mặt trời trong hệ trình xem; null khi mặt trời dưới chân trời. */
  dir: [number, number, number] | null;
}

/** Các bước thời gian trong ngày (giờ Việt Nam) kèm vị trí mặt trời. Bước ở giữa mỗi khoảng để cộng giờ nắng không lệch. */
export function daySteps(
  date: string,
  fromHour: number,
  toHour: number,
  stepMinutes: number,
  lat: number,
  lon: number,
  northOffset = 0,
): SunStep[] {
  const step = stepMinutes / 60;
  const out: SunStep[] = [];
  for (let h = fromHour + step / 2; h < toHour - 1e-9; h += step) {
    const p = solarPosition(vnTime(date, h), lat, lon);
    out.push({
      hour: h,
      azimuth: p.azimuth,
      altitude: p.altitude,
      dir: p.altitude > 0 ? sunDirection(p.azimuth, p.altitude, northOffset) : null,
    });
  }
  return out;
}

/** Mốc ngày hay dùng khi xem nắng (năm của ngày được chọn). */
export const SUN_DATE_PRESETS = [
  { key: 'xuan_phan', label: 'Xuân phân', md: '03-20' },
  { key: 'ha_chi', label: 'Hạ chí', md: '06-21' },
  { key: 'thu_phan', label: 'Thu phân', md: '09-23' },
  { key: 'dong_chi', label: 'Đông chí', md: '12-22' },
] as const;

export const formatHour = (h: number) => {
  const total = Math.round(h * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
