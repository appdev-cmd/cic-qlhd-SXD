import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Links one acceptance record (bim_nghiem_thu) to an "acceptance" item of the handover checklist. Meant for
// BimAcceptanceModal after a record is saved; data loads only when the section is opened.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHandoverItems } from '../hooks/useFacilityOps';
import { FacilityOpsService } from '../services/FacilityOpsService';
import { HANDOVER_ITEMS_KEY } from '../services/BimHandoverPackageService';

export interface BimHandoverLinkProps {
  projectId: string;
  /** bim_nghiem_thu.ma_nghiem_thu */
  acceptanceId: string;
  /** Record concluded "đạt" or "đạt có điều kiện": the item is marked done too. */
  passed: boolean;
}

function Linker({ projectId, acceptanceId, passed }: BimHandoverLinkProps) {
  const items = useHandoverItems(projectId);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const candidates = (items.data || []).filter((item) => item.kind === 'acceptance');
  const link = async (id: string) => {
    const item = candidates.find((c) => c.id === id);
    if (!item) return;
    setBusy(true);
    setMessage(null);
    try {
      await FacilityOpsService.updateHandoverItem(item, { acceptance_id: acceptanceId, done: passed });
      await cache.invalidateQueries({ queryKey: HANDOVER_ITEMS_KEY(projectId) });
      setMessage({
        tone: 'ok',
        text: passed
          ? 'Đã gắn biên bản và đánh dấu mục đạt.'
          : 'Đã gắn biên bản; mục chỉ đạt khi biên bản kết luận đạt.',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Không gắn được biên bản' });
    } finally {
      setBusy(false);
    }
  };
  if (items.isLoading) return <p className="text-xs text-txt-muted">Đang tải checklist bàn giao…</p>;
  if (items.error)
    return (
      <p role="alert" className="text-xs text-rose-600">
        {items.error.message}
      </p>
    );
  if (!candidates.length)
    return (
      <p className="text-xs text-txt-muted">
        Chưa có mục biên bản nghiệm thu trong checklist bàn giao. Tạo checklist ở hồ sơ tài sản, phần Bàn giao.
      </p>
    );
  return (
    <div className="space-y-1">
      <BimSelect
        aria-label="Mục bàn giao cần biên bản"
        disabled={busy}
        defaultValue=""
        onChange={(e) => e.target.value && void link(e.target.value)}
        className="w-full rounded-lg border border-border px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
      >
        <option value="">Chọn mục bàn giao…</option>
        {candidates.map((item) => (
          <option key={item.id} value={item.id}>
            {item.system_name} · {item.label}
            {item.acceptance_id === acceptanceId
              ? ' (đang dùng biên bản này)'
              : item.acceptance_id
                ? ' (đã có biên bản khác)'
                : ''}
          </option>
        ))}
      </BimSelect>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`text-xs ${message.tone === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export function BimHandoverLink(props: BimHandoverLinkProps) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-2 text-xs" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-primary-700">Gắn vào checklist bàn giao</summary>
      {open && (
        <div className="mt-1">
          <Linker {...props} />
        </div>
      )}
    </details>
  );
}
