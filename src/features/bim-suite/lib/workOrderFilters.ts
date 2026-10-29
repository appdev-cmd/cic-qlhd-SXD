// Filters and due/SLA state of maintenance work orders ("My work"), by Vietnam date.
import type { MaintenanceOrder, OrderPriority, OrderStatus, OrderWorkType } from '../services/FacilityOpsService';

export const ORDER_STATES: Record<OrderStatus, string> = {
  open: 'Mới tạo',
  assigned: 'Đã giao',
  in_progress: 'Đang thực hiện',
  review: 'Chờ xác nhận',
  completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy',
};
export const PRIORITY_LABELS: Record<OrderPriority, string> = {
  critical: 'Khẩn cấp',
  high: 'Cao',
  normal: 'Bình thường',
  low: 'Thấp',
};
export const PRIORITY_ORDER: Record<OrderPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
export const WORK_TYPE_LABELS: Record<OrderWorkType, string> = {
  sua_chua: 'Sửa chữa',
  dinh_ky: 'Định kỳ',
  kiem_tra: 'Kiểm tra',
};
export const FAILURE_CODES: { code: string; label: string }[] = [
  { code: 'CO_KHI', label: 'Hỏng cơ khí' },
  { code: 'DIEN', label: 'Sự cố điện' },
  { code: 'RO_RI', label: 'Rò rỉ' },
  { code: 'TAC_NGHEN', label: 'Tắc nghẽn' },
  { code: 'DIEU_KHIEN', label: 'Lỗi điều khiển' },
  { code: 'MON_HAO_MON', label: 'Mòn, hết tuổi thọ' },
  { code: 'NGUOI_DUNG', label: 'Do người sử dụng' },
  { code: 'KHAC', label: 'Khác' },
];
export const DUE_SOON_DAYS = 3;
export const vnDate = (at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(at);
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export type DueState = 'overdue' | 'due_soon' | 'later' | 'closed';
export const isClosed = (order: Pick<MaintenanceOrder, 'status'>) =>
  order.status === 'completed' || order.status === 'cancelled';
export function orderDueState(order: Pick<MaintenanceOrder, 'status' | 'due_date'>, today = vnDate()): DueState {
  if (isClosed(order)) return 'closed';
  const days = dayDiff(today, order.due_date.slice(0, 10));
  if (days < 0) return 'overdue';
  return days <= DUE_SOON_DAYS ? 'due_soon' : 'later';
}
export function dueText(order: Pick<MaintenanceOrder, 'status' | 'due_date'>, today = vnDate()) {
  const days = dayDiff(today, order.due_date.slice(0, 10));
  if (isClosed(order)) return 'Đã kết thúc';
  if (days < 0) return `Quá hạn ${-days} ngày`;
  if (days === 0) return 'Đến hạn hôm nay';
  return `Còn ${days} ngày`;
}
export type SlaState = 'none' | 'ok' | 'at_risk' | 'breached' | 'met';
export function slaState(
  order: Pick<MaintenanceOrder, 'status' | 'sla_due_at' | 'completed_at'>,
  now = Date.now(),
): SlaState {
  if (!order.sla_due_at) return 'none';
  const due = Date.parse(order.sla_due_at);
  if (order.status === 'completed')
    return order.completed_at && Date.parse(order.completed_at) <= due ? 'met' : 'breached';
  if (order.status === 'cancelled') return 'none';
  if (now > due) return 'breached';
  return due - now <= 4 * 3600000 ? 'at_risk' : 'ok';
}
export const SLA_LABELS: Record<SlaState, string> = {
  none: 'Chưa đặt SLA',
  ok: 'Trong SLA',
  at_risk: 'Sắp vượt SLA',
  breached: 'Vượt SLA',
  met: 'Đạt SLA',
};

export interface MyWorkFilter {
  due: 'all' | 'overdue' | 'due_soon';
  status: 'active' | 'all' | OrderStatus;
}
export function filterMyOrders<T extends MaintenanceOrder>(orders: T[], filter: MyWorkFilter, today = vnDate()): T[] {
  return orders
    .filter((order) =>
      filter.status === 'all' ? true : filter.status === 'active' ? !isClosed(order) : order.status === filter.status,
    )
    .filter((order) => filter.due === 'all' || orderDueState(order, today) === filter.due)
    .sort((a, b) => {
      const closed = Number(isClosed(a)) - Number(isClosed(b));
      return (
        closed ||
        a.due_date.localeCompare(b.due_date) ||
        PRIORITY_ORDER[a.priority ?? 'normal'] - PRIORITY_ORDER[b.priority ?? 'normal'] ||
        a.title.localeCompare(b.title, 'vi')
      );
    });
}
export function myWorkCounts(orders: MaintenanceOrder[], today = vnDate()) {
  const active = orders.filter((order) => !isClosed(order));
  return {
    active: active.length,
    overdue: active.filter((order) => orderDueState(order, today) === 'overdue').length,
    dueSoon: active.filter((order) => orderDueState(order, today) === 'due_soon').length,
  };
}
/** Assets with an open order past its due date. */
export function overdueAssetIds(
  orders: Pick<MaintenanceOrder, 'asset_id' | 'status' | 'due_date'>[],
  today = vnDate(),
): Set<string> {
  return new Set(orders.filter((o) => !isClosed(o) && o.due_date.slice(0, 10) < today).map((o) => o.asset_id));
}
