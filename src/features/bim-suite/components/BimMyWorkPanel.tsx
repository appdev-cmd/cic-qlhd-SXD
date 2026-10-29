import { BimOverlay } from '@/features/bim-suite/adapters/controls';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// "Việc của tôi": orders assigned to the signed-in account, filters (overdue / due soon / status) and the phone-friendly
// completion flow: checklist, result, field photos (fieldPhoto), parts and an explicit confirmation. No hand-drawn
// signature (dropped in B3): the confirmation is recorded with the account and the server time.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, ClipboardList, Crosshair, Loader2, X } from 'lucide-react';
import { useAuth } from '../adapters/context';
import { useMyWorkOrders, useVnToday } from '../hooks/useFacilityOps';
import {
  FacilityOpsService,
  type FacilityDocument,
  type MaintenanceOrder,
  type OrderStatus,
} from '../services/FacilityOpsService';
import type { FacilityAsset } from '../services/facilityAssetService';
import { readFieldPhoto, dataUrlToBlob } from '../lib/fieldPhoto';
import {
  FAILURE_CODES,
  ORDER_STATES,
  PRIORITY_LABELS,
  SLA_LABELS,
  WORK_TYPE_LABELS,
  dueText,
  filterMyOrders,
  myWorkCounts,
  orderDueState,
  slaState,
  type MyWorkFilter,
} from '../lib/workOrderFilters';
import { BimOrderParts } from './BimOrderParts';

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-2xs ${active ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-secondary dark:border-slate-600 dark:text-slate-300'}`;
const dueTone: Record<string, string> = {
  overdue: 'text-rose-600',
  due_soon: 'text-amber-600',
  later: 'text-txt-muted',
  closed: 'text-emerald-700',
};
const input =
  'mt-1 w-full min-w-0 rounded-xl border border-border bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const primary = 'rounded-xl bg-primary-600 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50';

interface Props {
  projectId: string;
  canWrite?: boolean;
  assets: FacilityAsset[];
  onLocateGuid?: (guid: string) => void;
  initialOrderId?: string | null;
}

export const BimMyWorkPanel: React.FC<Props> = ({ projectId, canWrite, assets, onLocateGuid, initialOrderId }) => {
  const orders = useMyWorkOrders(projectId);
  const [filter, setFilter] = useState<MyWorkFilter>({ due: 'all', status: 'active' });
  const [openId, setOpenId] = useState<string | null>(null);
  const today = useVnToday();
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.asset_id, asset])), [assets]);
  const list = useMemo(() => filterMyOrders(orders.data || [], filter, today), [orders.data, filter, today]);
  const counts = useMemo(() => myWorkCounts(orders.data || [], today), [orders.data, today]);
  // Deep link (?bimOrder=…): open once when the order is in the list.
  const seenDeep = useRef<string | null>(null);
  const deepFound = !!initialOrderId && !!orders.data?.some((order) => order.id === initialOrderId);
  useEffect(() => {
    if (!deepFound || !initialOrderId || seenDeep.current === initialOrderId) return;
    seenDeep.current = initialOrderId;
    const timer = window.setTimeout(() => setOpenId(initialOrderId), 0);
    return () => window.clearTimeout(timer);
  }, [deepFound, initialOrderId]);
  const opened = orders.data?.find((order) => order.id === openId) || null;

  if (!orders.userId) return <p className="p-3 text-xs text-txt-muted">Cần đăng nhập để xem việc được giao.</p>;
  return (
    <section aria-label="Việc của tôi" className="space-y-2 text-xs text-txt-secondary dark:text-slate-200">
      <header className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary-600" />
        <h3 className="font-semibold text-txt-primary dark:text-white">Việc của tôi</h3>
        <span className="text-2xs text-txt-muted">
          {counts.active} phiếu đang mở · {orders.live ? 'đồng bộ tức thời' : 'đồng bộ định kỳ'}
        </span>
      </header>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc theo hạn">
        <button
          type="button"
          aria-pressed={filter.due === 'all'}
          className={chip(filter.due === 'all')}
          onClick={() => setFilter({ ...filter, due: 'all' })}
        >
          Tất cả
        </button>
        <button
          type="button"
          aria-pressed={filter.due === 'overdue'}
          className={chip(filter.due === 'overdue')}
          onClick={() => setFilter({ ...filter, due: 'overdue' })}
        >
          Quá hạn ({counts.overdue})
        </button>
        <button
          type="button"
          aria-pressed={filter.due === 'due_soon'}
          className={chip(filter.due === 'due_soon')}
          onClick={() => setFilter({ ...filter, due: 'due_soon' })}
        >
          Sắp đến hạn ({counts.dueSoon})
        </button>
        <BimSelect
          aria-label="Lọc theo trạng thái phiếu"
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value as MyWorkFilter['status'] })}
          className="rounded-full border border-border bg-white px-2 py-1 text-2xs dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="active">Đang mở</option>
          <option value="all">Mọi trạng thái</option>
          {(['assigned', 'in_progress', 'review', 'completed', 'cancelled'] as const).map((status) => (
            <option key={status} value={status}>
              {ORDER_STATES[status]}
            </option>
          ))}
        </BimSelect>
      </div>
      {orders.isLoading ? (
        <p className="flex items-center gap-2 p-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải việc được giao…
        </p>
      ) : orders.error ? (
        <p role="alert" className="text-rose-600">
          Không tải được việc được giao: {orders.error.message}{' '}
          <button type="button" className="underline" onClick={() => void orders.refetch()}>
            Thử lại
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-txt-muted">
          {orders.data?.length
            ? 'Không có phiếu phù hợp bộ lọc.'
            : 'Chưa có phiếu nào được giao cho bạn trong dự án này.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((order) => {
            const asset = assetById.get(order.asset_id);
            const due = orderDueState(order, today);
            const sla = slaState(order);
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(order.id)}
                  aria-label={`Mở phiếu ${order.title}`}
                  className="w-full rounded-xl border border-border p-3 text-left hover:border-primary-500 dark:border-slate-700"
                >
                  <span className="flex items-start justify-between gap-2">
                    <b className="line-clamp-2 text-txt-primary dark:text-white">{order.title}</b>
                    <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-0.5 text-2xs dark:bg-slate-800">
                      {ORDER_STATES[order.status]}
                    </span>
                  </span>
                  <span className="mt-1 block text-2xs text-txt-muted">
                    {asset?.asset_name || order.asset_id}
                    {asset?.asset_code ? ` · ${asset.asset_code}` : ''}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-2xs">
                    <span className={dueTone[due]}>{dueText(order, today)}</span>
                    <span>{WORK_TYPE_LABELS[order.work_type ?? 'sua_chua']}</span>
                    <span className={order.priority === 'critical' || order.priority === 'high' ? 'text-rose-600' : ''}>
                      Ưu tiên {PRIORITY_LABELS[order.priority ?? 'normal'].toLowerCase()}
                    </span>
                    {sla === 'breached' || sla === 'at_risk' ? (
                      <span className="text-rose-600">{SLA_LABELS[sla]}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {opened && (
        <MyOrderSheet
          key={opened.id}
          order={opened}
          asset={assetById.get(opened.asset_id)}
          canWrite={canWrite}
          onLocateGuid={onLocateGuid}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
};

const MyOrderSheet: React.FC<{
  order: MaintenanceOrder;
  asset?: FacilityAsset;
  canWrite?: boolean;
  onLocateGuid?: (guid: string) => void;
  onClose: () => void;
}> = ({ order, asset, canWrite, onLocateGuid, onClose }) => {
  const { currentUser } = useAuth();
  const cache = useQueryClient();
  const [base, setBase] = useState(order);
  const [checklist, setChecklist] = useState(order.checklist);
  const [result, setResult] = useState(order.result || '');
  const [attachments, setAttachments] = useState<FacilityDocument[]>(order.attachments || []);
  const [labor, setLabor] = useState(order.labor_hours == null ? '' : String(order.labor_hours));
  const [downtime, setDowntime] = useState(order.downtime_minutes == null ? '' : String(order.downtime_minutes));
  const [failure, setFailure] = useState(order.failure_code || '');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = base.status === 'in_progress';
  const photos = attachments.filter((item) => item.kind === 'photo');
  const corrective = (base.work_type ?? 'sua_chua') === 'sua_chua';
  const guid = asset?.bim_element_id;

  const refresh = async (saved: MaintenanceOrder) => {
    setBase(saved);
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['bim-my-orders', saved.project_id] }),
      cache.invalidateQueries({ queryKey: ['bim-work-orders', saved.project_id] }),
      cache.invalidateQueries({ queryKey: ['bim-facility-assets', saved.project_id] }),
      cache.invalidateQueries({ queryKey: ['facility-kpi', saved.project_id] }),
    ]);
  };
  const run = async (label: string, task: () => Promise<MaintenanceOrder | void>) => {
    setBusy(label);
    setError(null);
    try {
      const saved = await task();
      if (saved) await refresh(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phiếu');
    } finally {
      setBusy(null);
    }
  };
  const fields = () => ({
    result: result.trim(),
    checklist,
    attachments,
    labor_hours: labor === '' ? null : Number(labor.replace(',', '.')),
    ...(corrective
      ? { downtime_minutes: downtime === '' ? null : Math.round(Number(downtime)), failure_code: failure || null }
      : {}),
  });
  const addPhotos = (files: File[]) =>
    run('photo', async () => {
      const next = [...attachments];
      for (const file of files.slice(0, 6)) {
        const shot = await readFieldPhoto(file);
        next.push(
          await FacilityOpsService.uploadOrderFile(
            base,
            dataUrlToBlob(shot.photo),
            `Ảnh hiện trường ${formatDateTime(new Date())}`,
            shot.gps,
          ),
        );
      }
      setAttachments(next);
    });
  const submit = (target: Extract<OrderStatus, 'review' | 'completed'>) =>
    run(target, async () => {
      if (checklist.some((item) => !item.done)) throw new Error('Chưa hoàn tất checklist.');
      if (!result.trim()) throw new Error('Cần ghi kết quả thực hiện.');
      if (!photos.length) throw new Error('Cần ít nhất một ảnh hiện trường.');
      if (!confirmed) throw new Error('Đánh dấu xác nhận đã thực hiện trước khi gửi.');
      // Confirmation instead of a drawn signature; the server should stamp signed_by / signed_at (client time is a fallback).
      const signature = { confirmed: true, name: currentUser?.name ?? null, signed_at: new Date().toISOString() };
      return FacilityOpsService.assigneeSave(base, { ...fields(), signature, status: target });
    });
  return (
    <BimOverlay onClose={onClose}>
      <header className="flex items-start gap-2 border-b border-border p-3 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold">{base.title}</h4>
          <p className="text-xs text-txt-muted">
            {asset?.asset_name || base.asset_id} · {ORDER_STATES[base.status]} · hạn {base.due_date}
          </p>
        </div>
        {guid && onLocateGuid && (
          <button
            type="button"
            aria-label="Định vị thiết bị trên BIM"
            className="rounded-lg border border-border p-2"
            onClick={() => onLocateGuid(guid)}
          >
            <Crosshair className="h-4 w-4" />
          </button>
        )}
        <button type="button" aria-label="Đóng phiếu" className="rounded-lg border border-border p-2" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {order.version > base.version && (
          <p role="status" className="rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-50">
            Phiếu vừa được cập nhật ở nơi khác.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setBase(order);
                setChecklist(order.checklist);
                setResult(order.result || '');
                setAttachments(order.attachments || []);
                setError(null);
              }}
            >
              Tải bản mới
            </button>
          </p>
        )}
        {base.status === 'assigned' && (
          <button
            type="button"
            disabled={!!busy}
            className={`${primary} w-full`}
            onClick={() => void run('start', () => FacilityOpsService.assigneeSave(base, { status: 'in_progress' }))}
          >
            {busy === 'start' ? 'Đang bắt đầu…' : 'Bắt đầu thực hiện'}
          </button>
        )}
        <fieldset disabled={!working || !!busy} className="space-y-4">
          <div className="space-y-1">
            <p className="font-semibold">Checklist</p>
            {checklist.map((item, i) => (
              <label
                key={i}
                className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 dark:border-slate-700"
              >
                <BimInput
                  type="checkbox"
                  className="h-5 w-5"
                  checked={item.done}
                  onChange={(e) =>
                    setChecklist(checklist.map((c, j) => (j === i ? { ...c, done: e.target.checked } : c)))
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
            {!checklist.length && <p className="text-xs text-txt-muted">Phiếu không có checklist.</p>}
          </div>
          <label className="block">
            Kết quả thực hiện
            <textarea
              aria-label="Kết quả thực hiện"
              rows={3}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className={input}
            />
          </label>
          <div className="space-y-2">
            <p className="font-semibold">Ảnh hiện trường ({photos.length})</p>
            <label
              className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border ${!working ? 'opacity-50' : ''}`}
            >
              <Camera className="h-4 w-4" />
              {busy === 'photo' ? 'Đang tải ảnh…' : 'Chụp hoặc chọn ảnh'}
              <BimInput
                aria-label="Ảnh hiện trường"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length) void addPhotos(files);
                }}
              />
            </label>
            <ul className="space-y-1 text-xs">
              {photos.map((photo, i) => (
                <li key={`${photo.url}-${i}`} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-primary-700 underline"
                    onClick={() =>
                      void FacilityOpsService.documentUrl(photo)
                        .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không mở được ảnh'))
                    }
                  >
                    {photo.title}
                  </button>
                  {photo.gps && <span className="text-txt-muted">{photo.gps}</span>}
                  <button
                    type="button"
                    aria-label={`Bỏ ${photo.title}`}
                    className="text-txt-muted"
                    onClick={() => setAttachments(attachments.filter((item) => item !== photo))}
                  >
                    Bỏ
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              Giờ công
              <BimInput
                aria-label="Giờ công"
                inputMode="decimal"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
                className={input}
              />
            </label>
            {corrective && (
              <label>
                Thời gian dừng (phút)
                <BimInput
                  aria-label="Thời gian dừng máy (phút)"
                  inputMode="numeric"
                  value={downtime}
                  onChange={(e) => setDowntime(e.target.value)}
                  className={input}
                />
              </label>
            )}
            {corrective && (
              <label className="col-span-2">
                Mã hỏng
                <BimSelect
                  aria-label="Mã hỏng"
                  value={failure}
                  onChange={(e) => setFailure(e.target.value)}
                  className={input}
                >
                  <option value="">Chưa xác định</option>
                  {FAILURE_CODES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </BimSelect>
              </label>
            )}
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 dark:border-slate-700">
            <BimInput
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              Tôi xác nhận đã thực hiện công việc theo phiếu. Hệ thống ghi tài khoản{' '}
              <b>{currentUser?.name || 'hiện tại'}</b> và thời điểm máy chủ.
            </span>
          </label>
        </fieldset>
        <BimOrderParts order={base} canEdit={working && !busy} />
        {base.signature && (
          <p className="text-xs text-txt-muted">
            Đã xác nhận: {base.signature.name || 'người thực hiện'}
            {base.signature.signed_at ? ` · ${formatDateTime(new Date(base.signature.signed_at))}` : ''}
          </p>
        )}
        {base.status === 'review' && (
          <p className="rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-50">
            Đã gửi xác nhận. {canWrite ? '' : 'Người quản lý dự án sẽ xác nhận hoàn tất.'}
          </p>
        )}
        {base.status === 'completed' && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-50">
            <CheckCircle2 className="h-4 w-4" />
            Đã hoàn tất ngày {base.completed_on}; lịch bảo trì kế tiếp đã cập nhật.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 p-2 text-rose-700 dark:bg-rose-50">
            {error}
          </p>
        )}
      </div>
      {(working || (base.status === 'review' && canWrite)) && (
        <footer className="grid grid-cols-2 gap-2 border-t border-border p-3 dark:border-slate-700">
          {working && (
            <button
              type="button"
              disabled={!!busy}
              className="rounded-xl border border-border py-3"
              onClick={() => void run('save', () => FacilityOpsService.assigneeSave(base, fields()))}
            >
              {busy === 'save' ? 'Đang lưu…' : 'Lưu tạm'}
            </button>
          )}
          {working && !canWrite && (
            <button type="button" disabled={!!busy} className={primary} onClick={() => void submit('review')}>
              {busy === 'review' ? 'Đang gửi…' : 'Gửi xác nhận'}
            </button>
          )}
          {working && canWrite && (
            <button type="button" disabled={!!busy} className={primary} onClick={() => void submit('completed')}>
              {busy === 'completed' ? 'Đang hoàn tất…' : 'Hoàn tất'}
            </button>
          )}
          {base.status === 'review' && canWrite && (
            <button
              type="button"
              disabled={!!busy}
              className={`${primary} col-span-2`}
              onClick={() => void run('confirm', () => FacilityOpsService.saveOrder(base, { status: 'completed' }))}
            >
              Xác nhận hoàn tất
            </button>
          )}
        </footer>
      )}
    </BimOverlay>
  );
};
