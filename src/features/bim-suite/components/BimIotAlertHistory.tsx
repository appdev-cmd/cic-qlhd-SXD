'use client';
// Audit trail of one IoT alert (bim_iot_alert_events): who acknowledged, assigned, suppressed or closed it.
// Ported from cic-hud without the dataset/data_kind scope; actor names from facility_actor_names.
import React, { useState } from 'react';
import { useIotActorNames, useIotAlertEvents } from '../hooks/useBimIot';
import { iotDateTime } from '../lib/iotTypes';

const STATUS_TEXT: Record<string, string> = {
  open: 'Mở lại',
  acknowledged: 'Đã xác nhận',
  suppressed: 'Tạm ẩn',
  closed: 'Đã đóng',
};
/** Describe an event: status / assignee / notes changes against the previous version first. */
export function describeAlertEvent(event: {
  action?: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
}) {
  const before = event.before_data || {};
  const after = event.after_data || {};
  const parts: string[] = [];
  if (event.action === 'imported_or_opened') parts.push('Ghi nhận cảnh báo');
  if (before.status !== undefined && after.status !== before.status && typeof after.status === 'string')
    parts.push(STATUS_TEXT[after.status] || String(after.status));
  else if (event.action === 'acknowledged') parts.push('Đã xác nhận');
  if (before.assignee_id !== after.assignee_id && event.before_data)
    parts.push(after.assignee_id ? 'Giao người xử lý' : 'Bỏ người xử lý');
  if (before.notes !== after.notes && event.before_data && after.notes)
    parts.push(`Ghi chú: ${String(after.notes).slice(0, 120)}`);
  return parts.length ? parts.join(' · ') : 'Cập nhật';
}

export function BimIotAlertHistory({ project, alert }: { project: string; alert: string }) {
  const [open, setOpen] = useState(false);
  const query = useIotAlertEvents(project, alert, open);
  const names = useIotActorNames(
    project,
    (query.data || []).map((event) => event.actor_id),
  );
  return (
    <details className="mt-2 text-2xs text-txt-muted" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">Lịch sử xử lý cảnh báo</summary>
      {open &&
        (query.isPending ? (
          <p>Đang tải lịch sử…</p>
        ) : query.error ? (
          <p role="alert" className="text-rose-600">
            {query.error.message}
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {query.data.map((event) => (
              <li key={event.id}>
                {iotDateTime(event.created_at)} · {describeAlertEvent(event)} ·{' '}
                {event.actor_id ? names.data?.get(event.actor_id) || 'Tài khoản dự án' : 'Nguồn dữ liệu'}
              </li>
            ))}
            {!query.data.length && <li>Chưa có sự kiện.</li>}
          </ul>
        ))}
      {open && <p className="mt-1">Tối đa 50 sự kiện gần nhất · giờ Việt Nam</p>}
    </details>
  );
}
