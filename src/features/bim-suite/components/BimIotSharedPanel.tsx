import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Shared IoT alerts and IoT work orders of a project: acknowledge, operator workflow (status, assignee, notes),
// raise a work order from an alert, open the asset / work order in the asset workspace. Ported from cic-hud
// BimIotSharedPanel; the work-order editor (BimAssetWorkspace) is reached through onOpenWorkOrder / onOpenAsset
// callbacks instead of being imported here.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, ClipboardList, Crosshair, Loader2, RefreshCw } from 'lucide-react';
import { useBimIot } from '../hooks/useBimIot';
import { BimService } from '../services/BimService';
import { BimIotService, type IotAlertStatus, type SharedIotAlert } from '../services/BimIotService';
import { BimIotAlertHistory } from './BimIotAlertHistory';
import { iotDateTime, WORK_ORDER_STATUS_LABELS } from '../lib/iotTypes';

export const ALERT_STATUS_LABELS: Record<IotAlertStatus, string> = {
  open: 'Đang mở',
  acknowledged: 'Đã xác nhận',
  suppressed: 'Tạm ẩn',
  closed: 'Đã đóng',
};
export const alertStatus = (alert: SharedIotAlert): IotAlertStatus =>
  alert.status ?? (alert.resolved_at ? 'closed' : alert.acknowledged_at ? 'acknowledged' : 'open');
const isActive = (alert: SharedIotAlert) => ['open', 'acknowledged'].includes(alertStatus(alert));

const button =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs text-txt-secondary hover:border-primary-500 disabled:opacity-50 aria-pressed:border-primary-600 aria-pressed:bg-primary-50 aria-pressed:text-primary-700 dark:border-slate-600 dark:text-slate-200 dark:aria-pressed:bg-slate-800';
const field = 'rounded border border-border px-1 py-1 dark:border-slate-600 dark:bg-slate-900';

export interface BimIotSharedPanelProps {
  projectId: string;
  /** Project write access (useBimAccess().canWrite); readers only see the alerts. */
  canEdit?: boolean;
  onLocateGuid: (guid: string) => void;
  onOpenAsset: (assetId: string) => void;
  /** Open the work order in the asset workspace; without it only the asset is opened. */
  onOpenWorkOrder?: (orderId: string, assetId: string) => void;
  /** Alerts tab first (default) or the IoT work orders. */
  initialTab?: 'alerts' | 'orders';
}

export function BimIotSharedPanel({
  projectId,
  canEdit,
  onLocateGuid,
  onOpenAsset,
  onOpenWorkOrder,
  initialTab = 'alerts',
}: BimIotSharedPanelProps) {
  const shared = useBimIot(projectId);
  const [tab, setTab] = useState<'alerts' | 'orders'>(initialTab);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const writable = !!canEdit && !shared.isError;
  const people = useQuery({
    queryKey: ['bim-project-people', projectId],
    queryFn: () => BimService.getProjectPeople(projectId),
    enabled: writable,
    staleTime: 300_000,
  });
  const assetIds = [...new Set((shared.data?.alerts ?? []).map((a) => a.asset_id))].sort();
  const assets = useQuery({
    queryKey: ['bim-iot', 'assets', projectId, assetIds.join(',')],
    queryFn: () => BimIotService.assets(projectId, assetIds),
    enabled: assetIds.length > 0,
    staleTime: 60_000,
  });
  const run = async (task: () => Promise<unknown>) => {
    if (!writable || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await task();
      await shared.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không lưu được thay đổi.');
    } finally {
      setBusy(false);
    }
  };
  const openOrder = (orderId: string, assetId: string) =>
    onOpenWorkOrder ? onOpenWorkOrder(orderId, assetId) : onOpenAsset(assetId);
  const raiseOrder = async (alert: SharedIotAlert) => {
    const existing = shared.data?.orders.find((o) => o.iot_source_alert_id === alert.id);
    if (existing) return openOrder(existing.id, existing.asset_id);
    await run(async () => {
      const order = await BimIotService.createOrder(alert.id);
      setMessage(`Đã lập phiếu “${order.title}”.`);
      setTab('orders');
    });
  };
  if (shared.isPending)
    return (
      <p role="status" className="flex items-center gap-2 p-3 text-xs text-txt-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải cảnh báo IoT…
      </p>
    );
  if (shared.isError && !shared.data)
    return (
      <p role="alert" className="p-3 text-xs text-rose-600">
        {shared.error.message}{' '}
        <button type="button" className="underline" onClick={() => void shared.refetch()}>
          Tải lại
        </button>
      </p>
    );
  const state = shared.data!;
  const shown = state.alerts.filter((alert) => statusFilter === 'all' || isActive(alert));
  return (
    <div className="space-y-3 text-xs text-txt-secondary dark:text-slate-200">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={tab === 'alerts'} className={button} onClick={() => setTab('alerts')}>
          Cảnh báo ({state.alerts.length})
        </button>
        <button type="button" aria-pressed={tab === 'orders'} className={button} onClick={() => setTab('orders')}>
          Phiếu IoT ({state.orders.length})
        </button>
        <button
          type="button"
          className={button}
          disabled={shared.isFetching}
          onClick={() => void shared.refresh()}
          aria-label="Đồng bộ cảnh báo IoT"
        >
          <RefreshCw className={`h-3 w-3 ${shared.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {message && (
        <p role="status" className="rounded bg-amber-50 p-2 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      {shared.isError && (
        <p role="alert" className="text-rose-600">
          Mất đồng bộ: {shared.error.message}. Tạm khóa ghi.
        </p>
      )}
      {!canEdit && (
        <p className="text-2xs text-txt-muted">
          Bạn có quyền xem. Xác nhận cảnh báo và lập phiếu yêu cầu quyền chỉnh sửa dự án.
        </p>
      )}
      {tab === 'alerts' && (
        <section className="space-y-2" aria-label="Cảnh báo IoT">
          <div className="flex gap-1 text-2xs" role="group" aria-label="Lọc trạng thái cảnh báo">
            <button
              type="button"
              aria-pressed={statusFilter === 'active'}
              className={button}
              onClick={() => setStatusFilter('active')}
            >
              Cần xử lý ({state.alerts.filter(isActive).length})
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === 'all'}
              className={button}
              onClick={() => setStatusFilter('all')}
            >
              Tất cả ({state.alerts.length})
            </button>
          </div>
          {shown.map((alert) => {
            const asset = assets.data?.find((a) => a.asset_id === alert.asset_id);
            const point = state.points.find((p) => p.id === alert.point_id);
            const order = state.orders.find((o) => o.iot_source_alert_id === alert.id);
            return (
              <article
                key={alert.id}
                className="space-y-2 rounded-xl border border-border bg-bg-surface p-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="flex items-start gap-1 font-semibold text-txt-primary dark:text-white">
                    <AlertTriangle
                      className={`h-3.5 w-3.5 shrink-0 ${alert.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'}`}
                    />
                    {alert.name}
                  </h4>
                  <span className="shrink-0 text-2xs">
                    {ALERT_STATUS_LABELS[alertStatus(alert)]}
                    {alert.resolved_at ? ' · tín hiệu đã hồi phục' : ''}
                  </span>
                </div>
                <p className="text-2xs text-txt-muted">
                  {asset?.asset_name || point?.name || alert.asset_id} · mở {iotDateTime(alert.opened_at)}
                  {alert.resolved_at ? ` · hồi phục ${iotDateTime(alert.resolved_at)}` : ''}
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={button}
                    disabled={!point?.global_id}
                    onClick={() => point?.global_id && onLocateGuid(point.global_id)}
                  >
                    <Crosshair className="h-3 w-3" />
                    Định vị BIM
                  </button>
                  <button type="button" className={button} onClick={() => onOpenAsset(alert.asset_id)}>
                    Sổ thiết bị
                  </button>
                  {!alert.acknowledged_at && (
                    <button
                      type="button"
                      className={button}
                      disabled={!writable || busy}
                      onClick={() => void run(() => BimIotService.acknowledge(alert))}
                    >
                      <Check className="h-3 w-3" />
                      Xác nhận
                    </button>
                  )}
                  <button
                    type="button"
                    className={button}
                    disabled={busy || (!writable && !order)}
                    onClick={() => void raiseOrder(alert)}
                  >
                    <ClipboardList className="h-3 w-3" />
                    {order ? 'Mở phiếu' : 'Lập phiếu bảo trì'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-2xs">
                  <label className="flex flex-col">
                    Trạng thái xử lý
                    <BimSelect
                      aria-label={`Trạng thái cảnh báo ${alert.name}`}
                      disabled={!writable || busy}
                      value={alertStatus(alert)}
                      onChange={(e) =>
                        void run(() =>
                          BimIotService.updateAlert(alert, {
                            status: e.target.value as IotAlertStatus,
                            notes: notes[alert.id] ?? alert.notes ?? undefined,
                          }),
                        )
                      }
                      className={field}
                    >
                      {(Object.keys(ALERT_STATUS_LABELS) as IotAlertStatus[]).map((key) => (
                        <option key={key} value={key}>
                          {ALERT_STATUS_LABELS[key]}
                        </option>
                      ))}
                    </BimSelect>
                  </label>
                  <label className="flex flex-col">
                    Người xử lý
                    <BimSelect
                      aria-label={`Người xử lý cảnh báo ${alert.name}`}
                      disabled={!writable || busy}
                      value={alert.assignee_id || ''}
                      onChange={(e) =>
                        void run(() => BimIotService.updateAlert(alert, { assignee_id: e.target.value || null }))
                      }
                      className={field}
                    >
                      <option value="">Chưa giao</option>
                      {(people.data || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.ten || p.email}
                        </option>
                      ))}
                      {alert.assignee_id && !people.data?.some((p) => p.id === alert.assignee_id) && (
                        <option value={alert.assignee_id}>Người đã được giao</option>
                      )}
                    </BimSelect>
                  </label>
                  <textarea
                    aria-label={`Ghi chú cảnh báo ${alert.name}`}
                    className={`col-span-2 px-2 ${field}`}
                    rows={2}
                    placeholder="Ghi chú xử lý (bắt buộc khi tạm ẩn hoặc đóng)"
                    disabled={!writable || busy}
                    value={notes[alert.id] ?? alert.notes ?? ''}
                    onChange={(e) => setNotes({ ...notes, [alert.id]: e.target.value })}
                  />
                  {writable && notes[alert.id] !== undefined && notes[alert.id] !== (alert.notes ?? '') && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await BimIotService.updateAlert(alert, { notes: notes[alert.id] });
                          setNotes((current) => {
                            const next = { ...current };
                            delete next[alert.id];
                            return next;
                          });
                        })
                      }
                    >
                      Lưu ghi chú
                    </button>
                  )}
                </div>
                <BimIotAlertHistory project={projectId} alert={alert.id} />
              </article>
            );
          })}
          {!shown.length && (
            <p className="rounded-xl border border-dashed border-border p-4 text-txt-muted dark:border-slate-600">
              {state.alerts.length
                ? 'Không có cảnh báo cần xử lý. Chọn “Tất cả” để xem cảnh báo đã đóng.'
                : 'Chưa có cảnh báo. Cảnh báo do iot-ingest mở theo quy tắc ngưỡng của từng điểm đo (thời gian duy trì, ngưỡng đóng, một sự cố mở cho mỗi quy tắc).'}
            </p>
          )}
        </section>
      )}
      {tab === 'orders' && (
        <section className="space-y-2" aria-label="Phiếu bảo trì từ cảnh báo IoT">
          {state.orders.map((order) => (
            <article
              key={order.id}
              className="space-y-1 rounded-xl border border-border bg-bg-surface p-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <b className="text-txt-primary dark:text-white">{order.title}</b>
              <p className="text-2xs text-txt-muted">
                {WORK_ORDER_STATUS_LABELS[order.status] ?? order.status} · {order.assignee_name || 'Chưa phân công'}
                {order.due_date ? ` · hạn ${order.due_date}` : ''}
              </p>
              <div className="flex flex-wrap gap-1">
                <button type="button" className={button} onClick={() => openOrder(order.id, order.asset_id)}>
                  <ClipboardList className="h-3 w-3" />
                  Mở phiếu
                </button>
                <button type="button" className={button} onClick={() => onOpenAsset(order.asset_id)}>
                  Sổ thiết bị
                </button>
              </div>
            </article>
          ))}
          {!state.orders.length && (
            <p className="rounded-xl border border-dashed border-border p-4 text-txt-muted dark:border-slate-600">
              Chưa có phiếu bảo trì lập từ cảnh báo IoT.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
