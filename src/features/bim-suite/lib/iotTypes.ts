import { formatNumber, formatDateTime } from '@/lib/utils';
// IoT catalog types and value formatting shared by the live dashboard, alert panels and the gateway simulator.
// Ported from cic-hud lib/iotDemo.ts without the demo dataset, replay helpers or HUD Tower catalog.
import { formatDate } from '@/features/bim-suite/adapters/utils';
import { withinOfficeHours } from './iotTime';

export type IotValue = number | boolean | null;
export type IotAlarmOperator = 'gt' | 'lt' | 'offhours_gt' | 'offline' | 'quality_bad';

/** Equipment that carries one or more IoT devices (row of bim_assets + BIM anchor of its points). */
export interface IotAsset {
  asset_id: string;
  asset_name: string;
  category: string;
  location: string;
  model_id: string;
  global_id: string;
  express_id: number;
  /** Tower/block parsed from the location ("Tháp A"), used to group floors. */
  tower: string;
  status?: string;
  next_maintenance?: string | null;
  bim_anchor_note?: string;
}
export interface IotPoint {
  point_id: string;
  asset_id: string;
  device_id: string;
  metric: string;
  name: string;
  unit: string;
  value_type: 'number' | 'boolean';
  stale_after_seconds: number;
}
export interface IotRule {
  rule_id: string;
  point_id: string;
  device_id: string;
  name: string;
  operator: IotAlarmOperator;
  threshold: number | null;
  clear_threshold: number | null;
  hold_seconds: number;
  clear_hold_seconds: number;
  severity: string;
}
export interface IotDevice {
  device_id: string;
  asset_id: string;
  code: string;
}
export interface IotOfficeSchedule {
  start_hour: number;
  end_hour: number;
  weekdays: number[];
}
/** Everything the live dashboard needs for one project, built from the gateway tables (iotGatewayCatalog). */
export interface IotCatalog {
  project_id: string;
  assets: IotAsset[];
  points: IotPoint[];
  devices: IotDevice[];
  alarm_rules: IotRule[];
  office_schedule: IotOfficeSchedule;
}

/** facility_work_orders.status labels (same values as the asset workspace). */
export type IotWorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'cancelled';
export const WORK_ORDER_STATUS_LABELS: Record<IotWorkOrderStatus, string> = {
  open: 'Mới tạo',
  assigned: 'Đã giao',
  in_progress: 'Đang xử lý',
  review: 'Chờ kiểm tra',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

/** Equipment categories (iot_devices.category / bim_assets.category); unknown codes are shown as-is. */
export const CATEGORY_LABELS: Record<string, string> = {
  CHILLER: 'Chiller',
  AHU: 'AHU',
  PANEL: 'Điện tầng',
  TANK: 'Nước',
  AIR: 'Không khí & tiện nghi',
  ROOM: 'Phòng họp',
  LIGHTING: 'Chiếu sáng',
  WATER_ZONE: 'Nước & rò rỉ',
  SERVER: 'Phòng máy chủ',
  UPS: 'Nguồn dự phòng',
  ELEVATOR: 'Thang máy',
  PUMP: 'Bơm nước',
  POWER: 'Chất lượng điện',
  GARAGE: 'Thông gió hầm',
  FIRE_READINESS: 'Sẵn sàng PCCC',
  OTHER: 'Khác',
};

/** UCUM-style units sent by gateways → display labels. */
export const unitLabel = (unit: string) =>
  ({
    Cel: '°C',
    'kW.h': 'kWh',
    'm3/h': 'm³/h',
    'ug/m3': 'µg/m³',
    person: 'người',
    'person/5min': 'lượt/5 phút',
    lift: 'thang',
    car: 'thang',
    'car/5min': 'xe/5 phút',
    'cycle/5min': 'chu kỳ/5 phút',
    min: 'phút',
    s: 'giây',
    h: 'giờ',
    '1': '',
  })[unit] ?? unit;

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** dd/mm/yyyy hh:mm in Vietnam time. */
export const iotDateTime = (value: number | string) => {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  const day = formatDate(new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  return `${day} ${parts.hour}:${parts.minute}`;
};
/** hh:mm in Vietnam time. */
export const iotClock = (value: number) => timeFormat.format(new Date(value));
export const numberLabel = (value: number, digits = 1) => formatNumber(value, digits);

const BOOLEAN_STATES: Record<string, [string, string]> = {
  leak_detected: ['Khô ráo', 'Phát hiện nước'],
  door_open: ['Đóng', 'Mở'],
  booked: ['Chưa đặt', 'Đã đặt'],
  light_on: ['Tắt', 'Bật'],
  route_clear: ['Cần kiểm tra', 'Thông thoáng'],
  valve_open: ['Đóng', 'Mở'],
  on_bypass: ['Bình thường', 'Đang bypass'],
  fault: ['Không lỗi', 'Có lỗi'],
  controller_fault: ['Không lỗi', 'Có lỗi'],
  supervision_fault: ['Bình thường', 'Lỗi giám sát'],
};
export function valueLabel(value: IotValue, point: Pick<IotPoint, 'value_type' | 'unit' | 'metric'>): string {
  if (value === null) return '—';
  if (point.value_type === 'boolean') return (BOOLEAN_STATES[point.metric] ?? ['Dừng', 'Đang chạy'])[value ? 1 : 0];
  return `${numberLabel(Number(value), point.metric === 'power_factor' ? 3 : 1)} ${unitLabel(point.unit)}`.trim();
}

export function isOfficeHour(data: Pick<IotCatalog, 'office_schedule'>, at: number) {
  return withinOfficeHours(data.office_schedule, at);
}
