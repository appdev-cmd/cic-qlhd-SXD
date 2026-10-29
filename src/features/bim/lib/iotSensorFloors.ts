// Trường vị trí của thiết bị dùng để xác định tầng (cic-hud: IotAsset trong iotDemo.ts).
type IotAsset = { location: string; tower: string };

export interface IotSensorFloor {
  key: string;
  label: string;
  building: string;
  level: number;
  count: number;
}

/** Use the equipment's actual location label, never its code (A01 may be on the roof). */
export function sensorFloor(asset: Pick<IotAsset, 'location' | 'tower'>): Omit<IotSensorFloor, 'count'> | null {
  const raw = asset.location.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();
  // "Tháp B2" là tên tháp, không phải tầng hầm B2: tách tên tháp trước khi dò tầng hầm.
  const tower = raw.match(/\bthap\s+([a-z0-9]+)\b/)?.[1];
  const text = tower ? raw.replace(/\bthap\s+[a-z0-9]+\b/, ' ') : raw;
  const basement = text.match(/\b(?:ham\s*(?:b\s*)?|b)0*(\d+)\b/);
  if (basement) {
    const number = Number(basement[1]);
    return {
      key: `basement:B${number}`,
      label: `Hầm B${number}`,
      building: '',
      level: -number,
    };
  }
  const match = text.match(/\b(?:tang\s*|t)0*(\d+)\b/);
  if (!match) return null;
  const number = Number(match[1]);
  const building = (tower ?? asset.tower ?? '').toUpperCase();
  return {
    key: `${building || 'building'}:T${number}`,
    label: `${building ? `Tháp ${building} · ` : ''}Tầng ${number}`,
    building,
    level: number,
  };
}

export function sensorFloorOptions(assets: IotAsset[]): IotSensorFloor[] {
  const floors = new Map<string, IotSensorFloor>();
  for (const asset of assets) {
    const floor = sensorFloor(asset);
    const entry = floor ?? {
      key: 'unknown',
      label: 'Chưa xác định tầng',
      building: '~',
      level: 0,
    };
    const previous = floors.get(entry.key);
    floors.set(entry.key, { ...entry, count: (previous?.count ?? 0) + 1 });
  }
  return [...floors.values()].sort(
    (a, b) => a.building.localeCompare(b.building, 'vi', { numeric: true }) || a.level - b.level,
  );
}
