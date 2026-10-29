import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// Workspace tab "Tài sản" (ACC Build › Assets): asset register bound to model elements, work orders, my work, PM plans,
// QR inspection rounds, fault diagnoses, IFC/CSV/COBie import and operations KPI. BimAssetRecord is the asset record
// (info & documents, diagnosis, work orders, handover, history) opened from the register, the viewer side panel or a
// deep link (?bimAsset / ?bimOrder / ?bimRoute). cic-hud: the record was BimAssetWorkspace (a modal inside the BIM
// tab) and the register lived in BimOperationsPanel; here both are one project workspace tab.
import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarClock,
  ClipboardList,
  Crosshair,
  FileSpreadsheet,
  Loader2,
  Plus,
  QrCode,
  Route,
  Search,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import qrcode from 'qrcode-generator';
import { Modal } from '@/features/bim-suite/adapters/ui';
import { useBimAccess } from '@/features/bim-suite/adapters/context';
import {
  ASSET_CATEGORIES,
  createAsset,
  getProjectAssets,
  type FacilityAsset,
  type FacilityAssetInsert,
} from '../services/facilityAssetService';
import type { BimModel } from '../types/bim.types';
import {
  FacilityOpsService,
  type FacilityDocument,
  type FacilityPerson,
  type MaintenanceOrder,
  type OrderPriority,
  type OrderStatus,
  type OrderWorkType,
} from '../services/FacilityOpsService';
import { BimService } from '../services/BimService';
import { formatVnd } from '../lib/costing';
import {
  useActorNames,
  useFacilityAssets,
  useFacilityFloors,
  useFacilityPeople,
  useFacilitySpaces,
  useVnToday,
  useWorkOrders,
} from '../hooks/useFacilityOps';
import {
  FAILURE_CODES,
  ORDER_STATES,
  PRIORITY_LABELS,
  SLA_LABELS,
  WORK_TYPE_LABELS,
  dueText,
  isClosed,
  orderDueState,
  overdueAssetIds,
  slaState,
} from '../lib/workOrderFilters';
import {
  MAINT_STATES,
  MAINT_STATE_KEYS,
  assetDeepLink,
  daysToNext,
  maintDueText,
  maintState,
  readFacilityDeepLink,
  type MaintState,
} from '../lib/maintenance';
import { BimOrderParts } from './BimOrderParts';
import { BimOpsKpiCards } from './BimOpsKpiCards';
import { BimFaultDiagnosisPanel } from './BimFaultDiagnosisPanel';
import { BimHandoverPanel } from './BimHandoverPanel';

const BimMyWorkPanel = lazy(() => import('./BimMyWorkPanel').then((m) => ({ default: m.BimMyWorkPanel })));
const BimPmPlansPanel = lazy(() => import('./BimPmPlansPanel').then((m) => ({ default: m.BimPmPlansPanel })));
const BimInspectionRoundsPanel = lazy(() =>
  import('./BimInspectionRoundsPanel').then((m) => ({ default: m.BimInspectionRoundsPanel })),
);
const BimAssetImportPanel = lazy(() =>
  import('./BimAssetImportPanel').then((m) => ({ default: m.BimAssetImportPanel })),
);

const GUID = /^[0-9A-Za-z_$]{22}$/;
const field =
  'mt-1 w-full min-w-0 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const label = 'block text-xs font-semibold text-txt-secondary dark:text-slate-300';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';
const card = 'rounded-2xl border border-border bg-bg-surface p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const chip = (active: boolean) =>
  `whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs ${active ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-muted hover:border-slate-300 dark:border-slate-600'}`;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const Field: React.FC<{
  label: string;
  value?: string | number | null;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}> = ({ label: text, value, onChange, type = 'text', disabled }) => (
  <label className={label}>
    {text}
    <BimInput
      aria-label={text}
      type={type}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={field}
    />
  </label>
);

const Documents: React.FC<{
  project: string;
  asset: string;
  items: FacilityDocument[];
  onChange: (items: FacilityDocument[]) => void;
  canEdit?: boolean;
}> = ({ project, asset, items, onChange, canEdit }) => {
  const [title, setTitle] = useState(''),
    [url, setUrl] = useState(''),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      onChange([...items, await FacilityOpsService.uploadDocument(project, asset, file)]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (item: FacilityDocument) => {
    setError(null);
    try {
      window.open(await FacilityOpsService.documentUrl(item), '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(errorText(e));
    }
  };
  const add = () => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Chỉ nhận liên kết http/https.');
      onChange([...items, { title: title.trim() || 'Tài liệu', url: parsed.href }]);
      setUrl('');
      setTitle('');
      setError(null);
    } catch (e) {
      setError(e instanceof TypeError ? 'Liên kết không hợp lệ' : errorText(e));
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-txt-primary dark:text-white">Tài liệu và ảnh đính kèm</p>
      {items.map((d, i) => (
        <div key={`${d.url}-${i}`} className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => void open(d)}
            className="flex-1 truncate text-left text-primary-700 underline"
          >
            {d.title}
            {d.kind === 'photo' && d.gps ? ` · ${d.gps}` : ''}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-txt-muted"
              aria-label={`Gỡ liên kết ${d.title}`}
            >
              Gỡ
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <label className="block text-xs">
            {busy ? 'Đang tải tệp…' : 'Tải PDF, ảnh hoặc Word (tối đa 20 MB)'}
            <BimInput
              aria-label="Tệp hồ sơ thiết bị"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
              className="block text-xs"
            />
          </label>
          <div className="flex gap-2">
            <BimInput
              aria-label="Tên tài liệu liên kết"
              placeholder="Tên tài liệu"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
            />
            <BimInput
              aria-label="URL tài liệu"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={field}
            />
            <button type="button" disabled={!url.trim() || busy} onClick={add} className={btn}>
              Thêm
            </button>
          </div>
          <p className="text-2xs text-txt-muted">
            Lưu thiết bị/phiếu để ghi nhận đính kèm. Tệp tải lên nằm trong kho riêng của dự án.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
};

const ORDER_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }[]>> = {
  open: [
    { status: 'assigned', label: 'Giao xử lý' },
    { status: 'cancelled', label: 'Hủy phiếu' },
  ],
  assigned: [
    { status: 'in_progress', label: 'Bắt đầu thực hiện' },
    { status: 'cancelled', label: 'Hủy phiếu' },
  ],
  in_progress: [
    { status: 'review', label: 'Gửi xác nhận' },
    { status: 'cancelled', label: 'Hủy phiếu' },
  ],
  review: [
    { status: 'completed', label: 'Xác nhận hoàn tất' },
    { status: 'in_progress', label: 'Yêu cầu làm lại' },
  ],
};

export const FacilityOrderEditor: React.FC<{
  order: MaintenanceOrder;
  people: FacilityPerson[];
  canEdit?: boolean;
  onSaved: () => Promise<void>;
}> = ({ order, people, canEdit, onSaved }) => {
  const [base, setBase] = useState(order),
    [draft, setDraft] = useState<Partial<MaintenanceOrder>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [reopenReason, setReopenReason] = useState('');
  const data = { ...base, ...draft };
  const history = useQuery({
    queryKey: ['bim-order-events', order.project_id, order.id, order.version],
    queryFn: () => FacilityOpsService.orderEvents(order.project_id, order.id),
  });
  const editable = !!canEdit && !isClosed(base);
  const actorNames = useActorNames(
    order.project_id,
    (history.data || []).map((event) => event.actor_id),
  );
  const save = async (status?: OrderStatus) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await FacilityOpsService.saveOrder(base, { ...draft, ...(status ? { status } : {}) });
      setBase(saved);
      setDraft({});
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const reopen = async () => {
    setBusy(true);
    setError(null);
    try {
      await FacilityOpsService.reopen(base, reopenReason.trim());
      setReopenReason('');
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const disabled = !editable || busy;
  return (
    <section className="space-y-3 rounded-xl border border-border p-3 text-xs dark:border-slate-700">
      <p className="text-2xs uppercase tracking-wide text-txt-muted">
        {base.iot_source_alert_id ? 'Phiếu từ cảnh báo IoT' : 'Phiếu bảo trì'} · dùng chung trong dự án
      </p>
      {order.version > base.version && (
        <p role="status" className="rounded bg-amber-50 p-2 text-amber-800 dark:bg-amber-50">
          Phiếu đã được tài khoản khác cập nhật.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setBase(order);
              setDraft({});
              setError(null);
            }}
          >
            Tải bản mới
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <b className="text-txt-primary dark:text-white">{base.title}</b>
        <span className="rounded bg-bg-subtle px-1.5 dark:bg-slate-900">{ORDER_STATES[base.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Người xử lý
          <BimSelect
            aria-label="Người xử lý phiếu"
            disabled={disabled}
            value={data.assignee_id || ''}
            onChange={(e) => {
              const person = people.find((p) => p.id === e.target.value);
              setDraft({ ...draft, assignee_id: person?.id || null, assignee_name: person?.name || null });
            }}
            className={field}
          >
            <option value="">Chọn thành viên dự án</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {data.assignee_id && !people.some((p) => p.id === data.assignee_id) && (
              <option value={data.assignee_id}>{data.assignee_name || 'Người đã được giao'}</option>
            )}
          </BimSelect>
        </label>
        <Field
          label="Hạn phiếu bảo trì"
          type="date"
          value={data.due_date}
          disabled={disabled}
          onChange={(due_date) => setDraft({ ...draft, due_date })}
        />
        <label className={label}>
          Mức ưu tiên
          <BimSelect
            aria-label="Mức ưu tiên phiếu"
            disabled={disabled}
            value={data.priority || 'normal'}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as OrderPriority })}
            className={field}
          >
            {(Object.keys(PRIORITY_LABELS) as OrderPriority[]).map((key) => (
              <option key={key} value={key}>
                {PRIORITY_LABELS[key]}
              </option>
            ))}
          </BimSelect>
        </label>
        <label className={label}>
          Loại việc
          <BimSelect
            aria-label="Loại việc"
            disabled={disabled}
            value={data.work_type || 'sua_chua'}
            onChange={(e) => setDraft({ ...draft, work_type: e.target.value as OrderWorkType })}
            className={field}
          >
            {(Object.keys(WORK_TYPE_LABELS) as OrderWorkType[]).map((key) => (
              <option key={key} value={key}>
                {WORK_TYPE_LABELS[key]}
              </option>
            ))}
          </BimSelect>
        </label>
        <Field
          label="Hạn SLA"
          type="datetime-local"
          disabled={disabled}
          value={data.sla_due_at ? toLocalInput(data.sla_due_at) : ''}
          onChange={(v) => setDraft({ ...draft, sla_due_at: v ? new Date(v).toISOString() : null })}
        />
        <p className="self-end text-2xs text-txt-muted">
          {SLA_LABELS[slaState(data)]}
          {data.pm_due_on ? ` · phiếu định kỳ kỳ ${data.pm_due_on}` : ''}
          {data.reopened_from ? ' · mở lại từ phiếu trước' : ''}
        </p>
        <Field
          label="Giờ công"
          type="number"
          value={data.labor_hours}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, labor_hours: v === '' ? null : Number(v) })}
        />
        <Field
          label="Thời gian dừng máy (phút)"
          type="number"
          value={data.downtime_minutes}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, downtime_minutes: v === '' ? null : Math.round(Number(v)) })}
        />
        <label className={`${label} col-span-2`}>
          Mã hỏng
          <BimSelect
            aria-label="Mã hỏng phiếu"
            disabled={disabled}
            value={data.failure_code || ''}
            onChange={(e) => setDraft({ ...draft, failure_code: e.target.value || null })}
            className={field}
          >
            <option value="">Chưa xác định</option>
            {FAILURE_CODES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
            {data.failure_code && !FAILURE_CODES.some((item) => item.code === data.failure_code) && (
              <option value={data.failure_code}>{data.failure_code}</option>
            )}
          </BimSelect>
        </label>
      </div>
      <div className="space-y-1">
        {data.checklist.map((item, i) => (
          <label key={i} className="flex items-center gap-2">
            <BimInput
              type="checkbox"
              checked={item.done}
              disabled={disabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  checklist: data.checklist.map((c, j) => (j === i ? { ...c, done: e.target.checked } : c)),
                })
              }
            />
            {item.label}
          </label>
        ))}
      </div>
      <label className={label}>
        Kết quả thực hiện
        <textarea
          aria-label="Kết quả bảo trì"
          value={data.result || ''}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, result: e.target.value })}
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Chi phí bảo trì (VND)"
          type="number"
          value={data.cost}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, cost: v === '' ? null : Number(v) })}
        />
        <Field
          label="Ngày hoàn tất thực tế"
          type="date"
          value={data.completed_on}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, completed_on: v || null })}
        />
      </div>
      <Documents
        project={base.project_id}
        asset={base.asset_id}
        items={data.attachments}
        onChange={(attachments) => setDraft({ ...draft, attachments })}
        canEdit={editable && !busy}
      />
      <BimOrderParts order={base} canEdit={editable && !busy} />
      {base.signature && (
        <p className="text-txt-muted">
          Người thực hiện xác nhận: {base.signature.name || 'đã xác nhận'}
          {base.signature.signed_at ? ` · ${formatDateTime(new Date(base.signature.signed_at))}` : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setBase(order);
              setDraft({});
              setError(null);
            }}
          >
            Tải lại phiếu
          </button>
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className={btn}>
            Lưu nội dung
          </button>
          {ORDER_ACTIONS[base.status]?.map((action) => (
            <button
              type="button"
              key={action.status}
              disabled={busy}
              onClick={() => void save(action.status)}
              className={primary}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {canEdit && isClosed(base) && (
        <div className="flex flex-wrap items-center gap-2">
          <BimInput
            aria-label="Lý do mở lại phiếu"
            placeholder="Lý do mở lại (ví dụ: còn rung sau bảo dưỡng)"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            className={`${field} mt-0 flex-1`}
          />
          <button
            type="button"
            disabled={busy || reopenReason.trim().length < 5}
            className={btn}
            onClick={() => void reopen()}
          >
            Mở lại thành phiếu mới
          </button>
        </div>
      )}
      {base.status === 'completed' && (
        <p className="text-emerald-700">
          Đã xác nhận ngày {base.completed_on}; lịch bảo trì kế tiếp được cập nhật theo chu kỳ. Chi phí{' '}
          {base.cost === null ? 'chưa khai báo' : formatVnd(Number(base.cost))}.
        </p>
      )}
      <details>
        <summary className="cursor-pointer">Lịch sử phiếu ({history.data?.length ?? 0})</summary>
        {history.isLoading ? (
          <p>Đang tải…</p>
        ) : history.error ? (
          <p role="alert">{history.error.message}</p>
        ) : (
          history.data?.map((event) => (
            <p key={event.id} className="border-b border-border py-1 dark:border-slate-700">
              {formatDateTime(new Date(event.created_at))} · {ORDER_STATES[event.action as OrderStatus] || event.action}{' '}
              · {event.actor_id ? actorNames.data?.get(event.actor_id) || 'Tài khoản dự án' : 'Hệ thống (lịch bảo trì)'}
              {event.after_data.assignee_name ? ` · giao ${String(event.after_data.assignee_name)}` : ''}
            </p>
          ))
        )}
      </details>
    </section>
  );
};

type RecordTab = 'info' | 'diagnosis' | 'orders' | 'handover' | 'history';
const RECORD_TABS: { key: RecordTab; label: string }[] = [
  { key: 'info', label: 'Thông tin & hồ sơ' },
  { key: 'diagnosis', label: 'Chẩn đoán & sửa' },
  { key: 'orders', label: 'Phiếu bảo trì' },
  { key: 'handover', label: 'Bàn giao' },
  { key: 'history', label: 'Lịch sử thiết bị' },
];

export interface BimAssetRecordProps {
  projectId: string;
  /** Existing asset; null = new asset (prefilled from `selected`). */
  asset: FacilityAsset | null;
  models: BimModel[];
  canEdit?: boolean;
  /** Element selected in the viewer, used to prefill a new asset. */
  selected?: { guid?: string | null; modelId?: string | null; name?: string | null } | null;
  initialTab?: RecordTab;
  initialOrderId?: string | null;
  onLocateGuid?: (guid: string) => void;
  onClose: () => void;
}

/** Asset record modal: info and documents, diagnosis, work orders, handover checklist, history. */
export const BimAssetRecord: React.FC<BimAssetRecordProps> = ({
  projectId,
  asset: initial,
  models,
  canEdit,
  selected,
  initialTab,
  initialOrderId,
  onLocateGuid,
  onClose,
}) => {
  const [asset, setAsset] = useState(initial);
  const [form, setForm] = useState<Partial<FacilityAsset>>(
    () =>
      initial || {
        project_id: projectId,
        asset_name: selected?.name || '',
        asset_code: selected?.guid ? `TS-${selected.guid.slice(0, 6).toUpperCase()}` : '',
        bim_element_id: selected?.guid || null,
        model_id: selected?.modelId || null,
        status: 'Active',
        condition: 'Good',
        handover_status: 'unknown',
        documents: [],
      },
  );
  const [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<RecordTab>(
      initialTab ?? (initialOrderId ? 'orders' : initial?.status === 'Broken' ? 'diagnosis' : 'info'),
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState(initialOrderId || ''),
    [orderTitle, setOrderTitle] = useState('Bảo trì'),
    [due, setDue] = useState(() =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
    ),
    [checklist, setChecklist] = useState('Kiểm tra tình trạng\nVệ sinh thiết bị\nChạy thử và ghi nhận kết quả'),
    [orderPriority, setOrderPriority] = useState<OrderPriority>('normal'),
    [orderType, setOrderType] = useState<OrderWorkType>('sua_chua');
  const floors = useFacilityFloors(projectId);
  const spaces = useFacilitySpaces(projectId);
  const cache = useQueryClient();
  const orders = useWorkOrders(projectId, asset?.asset_id, !!asset);
  const people = useFacilityPeople(projectId, !!canEdit);
  const history = useQuery({
    queryKey: ['bim-asset-events', projectId, asset?.asset_id, asset?.updated_at],
    queryFn: () => FacilityOpsService.assetEvents(projectId, asset!.asset_id),
    enabled: !!asset && tab === 'history',
  });
  const change = (patch: Partial<FacilityAsset>) => {
    setForm((p) => ({ ...p, ...patch }));
    setDirty(true);
  };
  const guid = form.bim_element_id;
  const binding = useQuery({
    queryKey: ['bim-asset-binding', projectId, guid],
    queryFn: () => BimService.findModelForGuid(projectId, guid!),
    enabled: !form.model_id && !!guid && GUID.test(guid),
    staleTime: 60000,
  });
  const boundModel = form.model_id || binding.data?.model_id || null;
  const reloadAsset = async () => {
    await cache.invalidateQueries({ queryKey: ['bim-facility-assets', projectId] });
    const list = await cache.fetchQuery({
      queryKey: ['bim-facility-assets', projectId],
      queryFn: () => getProjectAssets(projectId),
    });
    return list.find((a) => a.asset_id === asset?.asset_id);
  };
  const refreshOrders = async () => {
    await cache.invalidateQueries({ queryKey: ['bim-work-orders', projectId] });
    const current = await reloadAsset();
    if (current && !dirty) {
      setAsset(current);
      setForm(current);
    }
  };
  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!form.asset_name?.trim() || !form.asset_code?.trim())
        throw new Error('Cần tên và mã tài sản duy nhất trong dự án.');
      if (form.bim_element_id && (!GUID.test(form.bim_element_id) || !boundModel))
        throw new Error('Chọn mô hình nguồn và GUID IFC hợp lệ để gắn thiết bị.');
      const { asset_id: _id, project_id: _project, created_at: _created, updated_at: _updated, ...fields } = form;
      void _id;
      void _project;
      void _created;
      void _updated;
      const payload = {
        ...fields,
        model_id: boundModel,
        asset_name: form.asset_name.trim(),
        asset_code: form.asset_code.trim(),
        location:
          form.location ||
          [form.location_building, form.location_floor, form.location_room].filter(Boolean).join(' · ') ||
          null,
      };
      const saved = asset
        ? await FacilityOpsService.saveAsset(asset, payload, reason)
        : await createAsset({
            category: null,
            manufacturer: null,
            model: null,
            contractor: null,
            purchase_cost: null,
            warranty_provider: null,
            install_date: null,
            warranty_expiry: null,
            last_maintenance: null,
            next_maintenance: null,
            maintenance_cycle_days: null,
            notes: null,
            bim_element_id: null,
            status: 'Active',
            condition: 'Good',
            ...payload,
            project_id: projectId,
          } as FacilityAssetInsert);
      setAsset(saved);
      setForm(saved);
      setDirty(false);
      setReason('');
      await cache.invalidateQueries({ queryKey: ['bim-facility-assets', projectId] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const createOrder = async () => {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      if (!orderTitle.trim() || !due) throw new Error('Cần tên phiếu và hạn xử lý.');
      const saved = await FacilityOpsService.createOrder({
        project_id: projectId,
        asset_id: asset.asset_id,
        title: orderTitle.trim(),
        due_date: due,
        priority: orderPriority,
        work_type: orderType,
        checklist: checklist
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text) => ({ label: text, done: false })),
      });
      await cache.invalidateQueries({ queryKey: ['bim-work-orders', projectId] });
      setOrderId(saved.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const downloadQr = () => {
    if (!asset) return;
    const code = qrcode(0, 'M');
    code.addData(assetDeepLink(projectId, asset.asset_id, asset.bim_element_id), 'Byte');
    code.make();
    const blob = new Blob([code.createSvgTag({ cellSize: 5, margin: 4, scalable: true })], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = href;
    a.download = `QR-${asset.asset_code || asset.asset_id}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  };
  const selectedOrder = orders.data?.find((o) => o.id === orderId);
  const assetGuid = asset?.bim_element_id;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={asset ? `Thiết bị · ${asset.asset_name}` : 'Thêm thiết bị vận hành'}
      description="Thông tin, bàn giao, bảo trì và hồ sơ thiết bị dùng chung theo dự án."
      size="full"
      closeOnOverlay={false}
    >
      <div className="space-y-3 text-xs">
        <nav className="flex flex-wrap items-center gap-2">
          {RECORD_TABS.filter((item) => item.key !== 'diagnosis' || !!asset).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={'doc-button ' + (tab === item.key ? 'doc-primary' : '')}
            >
              {item.label}
            </button>
          ))}
          <span className="flex-1" />
          {asset && (
            <button type="button" onClick={downloadQr} className={btn}>
              <QrCode className="h-3 w-3" /> Tải mã QR
            </button>
          )}
          {assetGuid && onLocateGuid && (
            <button type="button" onClick={() => onLocateGuid(assetGuid)} className={btn}>
              <Crosshair className="h-3 w-3" /> Xem trên BIM
            </button>
          )}
        </nav>
        {!canEdit && (
          <p className="text-txt-muted">Chế độ xem. Cần quyền cập nhật dự án để sửa thiết bị và xử lý bảo trì.</p>
        )}
        {error && (
          <p role="alert" className="text-rose-600">
            {error}{' '}
            {asset && (
              <button
                type="button"
                className="underline"
                onClick={async () => {
                  const current = await reloadAsset();
                  if (current) {
                    setAsset(current);
                    setForm(current);
                    setDirty(false);
                    setError(null);
                  }
                }}
              >
                Tải lại thiết bị
              </button>
            )}
          </p>
        )}
        {tab === 'diagnosis' && asset && (
          <BimFaultDiagnosisPanel
            projectId={projectId}
            assetId={asset.asset_id}
            assets={[asset]}
            canWrite={canEdit}
            guid={asset.bim_element_id}
            onLocateGuid={onLocateGuid}
            onOpenOrders={() => setTab('orders')}
          />
        )}
        {tab === 'info' && (
          <>
            <fieldset disabled={!canEdit || busy} className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Mã tài sản" value={form.asset_code} onChange={(asset_code) => change({ asset_code })} />
              <Field label="Tên thiết bị" value={form.asset_name} onChange={(asset_name) => change({ asset_name })} />
              <label className={label}>
                Nhóm thiết bị
                <BimSelect
                  aria-label="Nhóm thiết bị"
                  value={form.category || ''}
                  onChange={(e) => change({ category: e.target.value || null })}
                  className={field}
                >
                  <option value="">Chọn nhóm</option>
                  {ASSET_CATEGORIES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                  {form.category && !(ASSET_CATEGORIES as readonly string[]).includes(form.category) && (
                    <option>{form.category}</option>
                  )}
                </BimSelect>
              </label>
              <label className={label}>
                Tầng (theo mô hình)
                <BimSelect
                  aria-label="Tầng thiết bị"
                  value={form.floor_key || ''}
                  className={field}
                  onChange={(e) => change({ floor_key: e.target.value || null, space_code: null })}
                >
                  <option value="">{floors.data?.length ? 'Chưa gắn tầng' : 'Chưa đồng bộ tầng từ IFC'}</option>
                  {(floors.data || []).map((f) => (
                    <option key={f.floor_key} value={f.floor_key}>
                      {f.name}
                    </option>
                  ))}
                </BimSelect>
              </label>
              <label className={label}>
                Phòng / không gian
                <BimSelect
                  aria-label="Phòng thiết bị"
                  value={form.space_code || ''}
                  disabled={!form.floor_key}
                  className={field}
                  onChange={(e) => change({ space_code: e.target.value || null })}
                >
                  <option value="">Chưa gắn phòng</option>
                  {(spaces.data || [])
                    .filter((sp) => sp.floor_key === form.floor_key)
                    .map((sp) => (
                      <option key={sp.space_code} value={sp.space_code}>
                        {sp.name ? `${sp.name} · ${sp.space_code}` : sp.space_code}
                      </option>
                    ))}
                </BimSelect>
              </label>
              <Field
                label="Hệ thống"
                value={form.system_name}
                onChange={(system_name) => change({ system_name: system_name || null })}
              />
              <Field
                label="Số serial"
                value={form.serial_number}
                onChange={(serial_number) => change({ serial_number: serial_number || null })}
              />
              <Field label="Mô tả vị trí" value={form.location} onChange={(location) => change({ location })} />
              <Field
                label="Hãng sản xuất"
                value={form.manufacturer}
                onChange={(manufacturer) => change({ manufacturer })}
              />
              <Field label="Mã thiết bị / model" value={form.model} onChange={(model) => change({ model })} />
              <label className={label}>
                Trạng thái hoạt động
                <BimSelect
                  aria-label="Trạng thái hoạt động"
                  value={form.status || 'Active'}
                  onChange={(e) => change({ status: e.target.value as FacilityAsset['status'] })}
                  className={field}
                >
                  <option value="Active">Hoạt động</option>
                  <option value="Maintenance">Đang bảo trì</option>
                  <option value="Broken">Hỏng</option>
                  <option value="Retired">Ngừng sử dụng</option>
                </BimSelect>
              </label>
              <label className={label}>
                Bàn giao
                <BimSelect
                  aria-label="Trạng thái bàn giao"
                  value={form.handover_status || 'unknown'}
                  onChange={(e) => change({ handover_status: e.target.value as FacilityAsset['handover_status'] })}
                  className={field}
                >
                  <option value="unknown">Chưa có thông tin</option>
                  <option value="pending">Chưa bàn giao</option>
                  <option value="handed_over">Đã bàn giao (cần checklist đạt)</option>
                </BimSelect>
              </label>
              <Field
                label="Ngày bàn giao"
                type="date"
                value={form.handover_date}
                onChange={(handover_date) => change({ handover_date: handover_date || null })}
              />
              <Field
                label="Ngày lắp đặt"
                type="date"
                value={form.install_date}
                onChange={(v) => change({ install_date: v || null })}
              />
              <Field
                label="Bảo hành đến"
                type="date"
                value={form.warranty_expiry}
                onChange={(v) => change({ warranty_expiry: v || null })}
              />
              <Field
                label="Đơn vị bảo hành"
                value={form.warranty_provider}
                onChange={(warranty_provider) => change({ warranty_provider })}
              />
              <Field
                label="Nhà thầu cung cấp"
                value={form.contractor}
                onChange={(contractor) => change({ contractor })}
              />
              <Field
                label="Chi phí mua sắm (VND)"
                type="number"
                value={form.purchase_cost}
                onChange={(v) => change({ purchase_cost: v === '' ? null : Number(v) })}
              />
              <Field
                label="Chu kỳ bảo trì (ngày)"
                type="number"
                value={form.maintenance_cycle_days}
                onChange={(v) => change({ maintenance_cycle_days: v === '' ? null : Number(v) })}
              />
              <Field
                label="Lịch bảo trì kế tiếp"
                type="date"
                value={form.next_maintenance}
                onChange={(v) => change({ next_maintenance: v || null })}
              />
              <Field label="Lý do cập nhật / thay lịch" value={reason} onChange={setReason} />
              <label className={label}>
                Mô hình BIM nguồn
                <BimSelect
                  aria-label="Mô hình thiết bị"
                  value={boundModel || ''}
                  onChange={(e) => change({ model_id: e.target.value || null })}
                  className={field}
                >
                  <option value="">Chưa gắn mô hình</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.file_name} · v{m.phien_ban || 1}
                    </option>
                  ))}
                </BimSelect>
              </label>
              <Field
                label="GUID cấu kiện thiết bị"
                value={form.bim_element_id}
                onChange={(v) => change({ bim_element_id: v.trim() || null })}
              />
              <label className={`${label} col-span-2 md:col-span-3`}>
                Ghi chú / thông số
                <textarea
                  aria-label="Ghi chú thiết bị"
                  value={form.notes || ''}
                  onChange={(e) => change({ notes: e.target.value })}
                  className={field}
                />
              </label>
            </fieldset>
            <Documents
              project={projectId}
              asset={asset?.asset_id || 'draft'}
              items={form.documents || []}
              onChange={(documents) => change({ documents })}
              canEdit={canEdit && !busy}
            />
            {canEdit && (
              <button
                type="button"
                disabled={busy || (!dirty && !!asset)}
                onClick={() => void save()}
                className={primary}
              >
                {busy ? 'Đang lưu…' : 'Lưu thiết bị'}
              </button>
            )}
          </>
        )}
        {tab === 'orders' &&
          (!asset ? (
            <p>Lưu thiết bị trước khi tạo phiếu bảo trì.</p>
          ) : (
            <>
              <p>
                Thiết bị {asset.asset_code} · Chu kỳ {asset.maintenance_cycle_days ?? 'chưa thiết lập'} ngày
              </p>
              {canEdit && asset.status !== 'Retired' && (
                <details className="rounded-lg border border-border p-3 dark:border-slate-700">
                  <summary className="cursor-pointer font-semibold">Tạo phiếu bảo trì</summary>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <Field label="Tên phiếu bảo trì" value={orderTitle} onChange={setOrderTitle} />
                    <Field label="Hạn xử lý phiếu mới" type="date" value={due} onChange={setDue} />
                    <label className={label}>
                      Mức ưu tiên
                      <BimSelect
                        aria-label="Mức ưu tiên phiếu mới"
                        value={orderPriority}
                        onChange={(e) => setOrderPriority(e.target.value as OrderPriority)}
                        className={field}
                      >
                        {(Object.keys(PRIORITY_LABELS) as OrderPriority[]).map((key) => (
                          <option key={key} value={key}>
                            {PRIORITY_LABELS[key]}
                          </option>
                        ))}
                      </BimSelect>
                    </label>
                    <label className={label}>
                      Loại việc
                      <BimSelect
                        aria-label="Loại việc phiếu mới"
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as OrderWorkType)}
                        className={field}
                      >
                        {(Object.keys(WORK_TYPE_LABELS) as OrderWorkType[]).map((key) => (
                          <option key={key} value={key}>
                            {WORK_TYPE_LABELS[key]}
                          </option>
                        ))}
                      </BimSelect>
                    </label>
                    <label className={`${label} col-span-2`}>
                      Checklist (mỗi dòng một việc)
                      <textarea
                        aria-label="Checklist phiếu mới"
                        value={checklist}
                        onChange={(e) => setChecklist(e.target.value)}
                        className={field}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createOrder()}
                    className={`${primary} mt-2`}
                  >
                    Tạo phiếu
                  </button>
                </details>
              )}
              {people.error && (
                <p role="alert" className="text-rose-600">
                  Không tải được người xử lý: {people.error.message}
                </p>
              )}
              {orders.isLoading ? (
                <p>Đang tải phiếu…</p>
              ) : orders.error ? (
                <p role="alert">
                  {orders.error.message}{' '}
                  <button type="button" className="underline" onClick={() => void orders.refetch()}>
                    Thử lại
                  </button>
                </p>
              ) : (
                <>
                  <BimSelect
                    aria-label="Chọn phiếu bảo trì"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className={field}
                  >
                    <option value="">Chọn phiếu ({orders.data?.length ?? 0})</option>
                    {orders.data?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title} · {ORDER_STATES[o.status]} · {o.due_date}
                      </option>
                    ))}
                  </BimSelect>
                  {selectedOrder && (
                    <FacilityOrderEditor
                      key={selectedOrder.id}
                      order={selectedOrder}
                      people={people.data || []}
                      canEdit={canEdit}
                      onSaved={refreshOrders}
                    />
                  )}
                </>
              )}
            </>
          ))}
        {tab === 'handover' &&
          (!asset ? (
            <p>Lưu thiết bị trước khi lập checklist bàn giao.</p>
          ) : (
            <BimHandoverPanel
              projectId={projectId}
              asset={{
                ...asset,
                system_name: form.system_name ?? asset.system_name,
                category: form.category ?? asset.category,
              }}
              canWrite={canEdit}
            />
          ))}
        {tab === 'history' &&
          (!asset ? (
            <p>Thiết bị chưa được lưu.</p>
          ) : history.isLoading ? (
            <p>Đang tải lịch sử…</p>
          ) : history.error ? (
            <p role="alert">{history.error.message}</p>
          ) : (
            <div className="space-y-2">
              {!history.data?.length && <p>Chưa có thay đổi được ghi nhận.</p>}
              {history.data?.map((event) => (
                <div key={event.id} className="rounded border border-border p-2 dark:border-slate-700">
                  <b>{formatDateTime(new Date(event.created_at))}</b>
                  <p>{event.reason || 'Cập nhật thông tin thiết bị'}</p>
                  <p className="text-txt-muted">
                    Hoạt động: {String(event.after_data.status ?? '—')} · Bảo trì kế tiếp:{' '}
                    {String(event.after_data.next_maintenance || 'chưa có lịch')}
                  </p>
                </div>
              ))}
            </div>
          ))}
      </div>
    </Modal>
  );
};

type Section = 'register' | 'orders' | 'mywork' | 'pm' | 'rounds' | 'faults' | 'import';
const SECTIONS: [Section, string, typeof Boxes][] = [
  ['register', 'Sổ tài sản', Boxes],
  ['orders', 'Phiếu bảo trì', Wrench],
  ['mywork', 'Việc của tôi', ClipboardList],
  ['pm', 'Bảo trì định kỳ', CalendarClock],
  ['rounds', 'Tuyến kiểm tra QR', Route],
  ['faults', 'Chẩn đoán hỏng hóc', Stethoscope],
  ['import', 'Nhập IFC / CSV / COBie', FileSpreadsheet],
];
type SortKey = 'state' | 'name' | 'place' | 'group' | 'due';
const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'state', label: '', className: 'w-6' },
  { key: 'name', label: 'Thiết bị', className: '' },
  { key: 'place', label: 'Vị trí', className: 'w-[20%]' },
  { key: 'group', label: 'Nhóm', className: 'w-[14%]' },
  { key: 'due', label: 'Bảo trì kế tiếp', className: 'w-[18%]' },
];
const EMPTY_ASSETS: FacilityAsset[] = [];
const EMPTY_ORDERS: MaintenanceOrder[] = [];

export interface BimAssetWorkspaceProps {
  projectId: string;
  projectName?: string;
  /** Project models (ready versions) for IFC import and binding assets to elements. */
  models: BimModel[];
  /** Opens the viewer at an element (IFC GlobalId); omitted = no "Xem trên BIM" buttons. */
  onLocateGuid?: (guid: string) => void;
  /** Deep link values (bimAsset / bimRoute / bimOrder); defaults to the page query string. */
  deepLink?: { asset?: string | null; route?: string | null; order?: string | null };
}

/** Workspace tab "Tài sản". Access from useBimAccess(): writers edit, readers view. */
export function BimAssetWorkspace({ projectId, projectName, models, onLocateGuid, deepLink }: BimAssetWorkspaceProps) {
  const access = useBimAccess();
  const canWrite = access.canWrite;
  const [deep] = useState(
    () => deepLink ?? (typeof window === 'undefined' ? {} : readFacilityDeepLink(window.location.search)),
  );
  const [section, setSection] = useState<Section>(() => (deep.route ? 'rounds' : deep.order ? 'mywork' : 'register'));
  const assetsQuery = useFacilityAssets(projectId);
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const [record, setRecord] = useState<{ assetId: string | null; orderId?: string | null } | null>(() =>
    deep.asset && !deep.route ? { assetId: deep.asset } : null,
  );
  const recordAsset = record?.assetId ? assets.find((a) => a.asset_id === record.assetId) : null;
  const waitingForAsset = !!record?.assetId && !recordAsset;
  const openAsset = (assetId: string, orderId?: string | null) => setRecord({ assetId, orderId });
  const fallback = (
    <p role="status" className="flex items-center gap-2 p-4 text-xs text-txt-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Đang mở…
    </p>
  );
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Boxes className="h-4 w-4 text-primary-600" />
          <h2 className="text-sm font-bold text-txt-primary dark:text-white">Tài sản và vận hành</h2>
          <span className="text-2xs text-txt-muted">
            {formatNumber(assets.length, 2)} tài sản · {formatNumber(assets.filter((a) => a.bim_element_id).length, 2)}{' '}
            gắn mô hình
            {canWrite ? '' : ' · chế độ chỉ xem'}
          </span>
        </div>
        <BimOpsKpiCards projectId={projectId} showTrend />
      </div>
      <div role="tablist" aria-label="Mục tài sản" className="flex flex-wrap gap-1">
        {SECTIONS.map(([key, text, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={'doc-button ' + (section === key ? 'doc-primary' : '')}
            onClick={() => setSection(key)}
          >
            <Icon size={14} />
            {text}
          </button>
        ))}
      </div>
      <div className={card}>
        <Suspense fallback={fallback}>
          {section === 'register' ? (
            <AssetRegister
              projectId={projectId}
              assets={assets}
              loading={assetsQuery.isLoading}
              error={assetsQuery.error}
              canWrite={canWrite}
              onOpen={(id) => openAsset(id)}
              onCreate={() => setRecord({ assetId: null })}
              onLocateGuid={onLocateGuid}
            />
          ) : section === 'orders' ? (
            <OrderBoard projectId={projectId} assets={assets} canWrite={canWrite} onOpenAsset={openAsset} />
          ) : section === 'mywork' ? (
            <BimMyWorkPanel
              projectId={projectId}
              canWrite={canWrite}
              assets={assets}
              onLocateGuid={onLocateGuid}
              initialOrderId={deep.order}
            />
          ) : section === 'pm' ? (
            <BimPmPlansPanel projectId={projectId} canWrite={canWrite} assets={assets} />
          ) : section === 'rounds' ? (
            <BimInspectionRoundsPanel
              projectId={projectId}
              projectName={projectName}
              canWrite={canWrite}
              assets={assets}
              onLocateGuid={onLocateGuid}
              initialRouteId={deep.route}
              initialAssetId={deep.route ? deep.asset : null}
            />
          ) : section === 'faults' ? (
            <BimFaultDiagnosisPanel
              projectId={projectId}
              assets={assets}
              canWrite={canWrite}
              onLocateGuid={onLocateGuid}
              onOpenAsset={(id) => openAsset(id)}
            />
          ) : (
            <BimAssetImportPanel
              projectId={projectId}
              projectName={projectName}
              canWrite={canWrite}
              models={models}
              assets={assets}
              onLocateGuid={onLocateGuid}
            />
          )}
        </Suspense>
      </div>
      {record && waitingForAsset && assetsQuery.isSuccess && (
        <p role="status" className="text-xs text-amber-700">
          Không tìm thấy tài sản trong sổ của dự án.{' '}
          <button type="button" className="underline" onClick={() => setRecord(null)}>
            Bỏ qua
          </button>
        </p>
      )}
      {record && !waitingForAsset && (
        <BimAssetRecord
          key={record.assetId || 'new'}
          projectId={projectId}
          asset={recordAsset ?? null}
          models={models}
          canEdit={canWrite}
          initialOrderId={record.orderId}
          onLocateGuid={onLocateGuid}
          onClose={() => setRecord(null)}
        />
      )}
    </div>
  );
}

const placeOf = (a: FacilityAsset, floorName?: string) => {
  if (floorName) return `${floorName}${a.space_code ? ` · ${a.space_code}` : ''}`;
  return [a.location_floor, a.location_room].filter(Boolean).join(' · ') || a.location || '—';
};

function AssetRegister({
  projectId,
  assets,
  loading,
  error,
  canWrite,
  onOpen,
  onCreate,
  onLocateGuid,
}: {
  projectId: string;
  assets: FacilityAsset[];
  loading: boolean;
  error: Error | null;
  canWrite: boolean;
  onOpen: (assetId: string) => void;
  onCreate: () => void;
  onLocateGuid?: (guid: string) => void;
}) {
  const today = useVnToday();
  const floors = useFacilityFloors(projectId);
  const orders = useWorkOrders(projectId);
  const floorName = useMemo(() => new Map((floors.data || []).map((f) => [f.floor_key, f.name])), [floors.data]);
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<MaintState | 'all'>('all');
  const [group, setGroup] = useState('all');
  const [floor, setFloor] = useState('all');
  const [binding, setBinding] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'state', asc: true });
  const overdue = useMemo(() => overdueAssetIds(orders.data ?? EMPTY_ORDERS, today), [orders.data, today]);
  const rows = useMemo(() => {
    const at = new Date(`${today}T00:00:00`);
    return assets
      .filter((a) => binding === 'all' || (binding === 'linked' ? !!a.bim_element_id : !a.bim_element_id))
      .filter((a) => !overdueOnly || overdue.has(a.asset_id))
      .filter((a) => floor === 'all' || a.floor_key === floor)
      .map((asset) => ({ asset, state: maintState(asset, at), days: daysToNext(asset, at) }));
  }, [assets, binding, overdueOnly, overdue, floor, today]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(MAINT_STATE_KEYS.map((k) => [k, 0])) as Record<MaintState, number>;
    rows.forEach((r) => c[r.state]++);
    return c;
  }, [rows]);
  const groups = useMemo(() => [...new Set(assets.map((a) => a.category || 'Khác'))].sort(), [assets]);
  const floorOptions = useMemo(() => {
    const keys = new Map<string, number>();
    assets.forEach((a) => a.floor_key && keys.set(a.floor_key, (keys.get(a.floor_key) || 0) + 1));
    return [...keys].map(([key, count]) => ({ key, count, label: floorName.get(key) || key }));
  }, [assets, floorName]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => stateFilter === 'all' || r.state === stateFilter)
      .filter((r) => group === 'all' || (r.asset.category || 'Khác') === group)
      .filter(
        (r) =>
          !term ||
          `${r.asset.asset_name} ${r.asset.asset_code || ''} ${r.asset.location || ''} ${r.asset.manufacturer || ''} ${r.asset.model || ''} ${r.asset.serial_number || ''} ${r.asset.system_name || ''}`
            .toLowerCase()
            .includes(term),
      )
      .sort((a, b) => {
        const due = (a.days ?? 1e6) - (b.days ?? 1e6);
        const byName = a.asset.asset_name.localeCompare(b.asset.asset_name, 'vi');
        const cmp =
          sort.key === 'state'
            ? MAINT_STATES[a.state].order - MAINT_STATES[b.state].order || due
            : sort.key === 'due'
              ? due
              : sort.key === 'name'
                ? byName
                : sort.key === 'place'
                  ? placeOf(a.asset, floorName.get(a.asset.floor_key || '')).localeCompare(
                      placeOf(b.asset, floorName.get(b.asset.floor_key || '')),
                      'vi',
                      { numeric: true },
                    )
                  : (a.asset.category || '').localeCompare(b.asset.category || '', 'vi');
        return (sort.asc ? cmp : -cmp) || byName;
      });
  }, [rows, q, stateFilter, group, sort, floorName]);
  const at = new Date(`${today}T00:00:00`);

  return (
    <section aria-label="Sổ tài sản" className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-[9px] h-3.5 w-3.5 text-slate-400" />
          <BimInput
            aria-label="Tìm tài sản"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, mã tài sản, hãng, serial, hệ thống, vị trí…"
            className={`${field} mt-0 pl-8`}
          />
        </div>
        {canWrite && (
          <button type="button" className={primary} onClick={onCreate}>
            <Plus className="mr-1 inline h-3 w-3" />
            Thêm tài sản
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={chip(binding === 'all')} onClick={() => setBinding('all')}>
          Toàn bộ sổ ({assets.length})
        </button>
        <button type="button" className={chip(binding === 'linked')} onClick={() => setBinding('linked')}>
          Gắn mô hình ({assets.filter((a) => a.bim_element_id).length})
        </button>
        <button type="button" className={chip(binding === 'unlinked')} onClick={() => setBinding('unlinked')}>
          Chưa gắn mô hình ({assets.filter((a) => !a.bim_element_id).length})
        </button>
        <button
          type="button"
          className={chip(overdueOnly)}
          disabled={orders.isLoading || !!orders.error}
          onClick={() => setOverdueOnly((p) => !p)}
        >
          Phiếu quá hạn ({overdue.size} tài sản)
        </button>
        {floorOptions.length > 0 && (
          <BimSelect
            aria-label="Lọc theo tầng"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="rounded-full border border-border bg-white px-2 py-0.5 text-2xs dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="all">Mọi tầng</option>
            {floorOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} ({f.count})
              </option>
            ))}
          </BimSelect>
        )}
        <BimSelect
          aria-label="Lọc theo nhóm"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="rounded-full border border-border bg-white px-2 py-0.5 text-2xs dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="all">Mọi nhóm</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </BimSelect>
      </div>
      <div className="flex flex-wrap gap-1">
        {MAINT_STATE_KEYS.filter((k) => counts[k] > 0 || k === 'qua_han').map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStateFilter((s) => (s === k ? 'all' : k))}
            aria-pressed={stateFilter === k}
            className={`flex items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-2 text-2xs ${stateFilter === k ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500/40 dark:bg-primary-950' : 'border-border hover:border-slate-300 dark:border-slate-600'}`}
            data-tooltip={`Lọc: ${MAINT_STATES[k].label}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: MAINT_STATES[k].color }} />
            <b className="tabular-nums text-txt-primary dark:text-white">{counts[k]}</b>
            <span className="text-txt-muted">{MAINT_STATES[k].short}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border dark:border-slate-700">
        {loading ? (
          <p className="flex justify-center gap-2 p-6 text-txt-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải sổ tài sản…
          </p>
        ) : error ? (
          <p role="alert" className="p-4 text-center text-rose-600">
            Không tải được sổ tài sản: {error.message}
          </p>
        ) : !assets.length ? (
          <p className="p-4 text-center text-txt-muted">
            Dự án chưa có tài sản. {canWrite ? 'Thêm thủ công hoặc nhập từ mô hình IFC / CSV.' : ''}
          </p>
        ) : (
          <BimTable className="w-full min-w-[720px] table-fixed border-collapse text-2xs">
            <thead className="sticky top-0 z-10 bg-bg-subtle text-2xs uppercase tracking-wide text-txt-muted dark:bg-slate-900">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.className} border-b border-border px-1.5 py-1.5 text-left font-semibold`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort((s0) => ({ key: c.key, asc: s0.key === c.key ? !s0.asc : true }))}
                      className="flex items-center gap-0.5 hover:text-txt-primary"
                      data-tooltip={
                        c.key === 'state' ? 'Sắp xếp theo tình trạng' : `Sắp xếp theo ${c.label.toLowerCase()}`
                      }
                    >
                      {c.key === 'state' ? (
                        <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-400" />
                      ) : (
                        c.label
                      )}
                      {sort.key === c.key &&
                        (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                <th className="w-[14%] border-b border-border px-1.5 py-1.5 text-left font-semibold">Bàn giao</th>
                <th className="w-10 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-txt-muted">
                    Không có tài sản phù hợp bộ lọc.
                  </td>
                </tr>
              )}
              {filtered.map(({ asset: a, state }) => {
                const st = MAINT_STATES[state];
                const guid = a.bim_element_id;
                return (
                  <tr
                    key={a.asset_id}
                    onClick={() => onOpen(a.asset_id)}
                    className="cursor-pointer border-b border-border/60 hover:bg-bg-subtle dark:border-slate-700 dark:hover:bg-slate-900/50"
                  >
                    <td className="px-1.5 py-1.5 align-top">
                      <span
                        className="mt-0.5 block h-2.5 w-2.5 rounded-full"
                        style={{ background: st.color }}
                        data-tooltip={st.label}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onOpen(a.asset_id);
                        }}
                        className="block break-words text-left font-semibold text-txt-primary hover:text-primary-600 dark:text-white"
                      >
                        {a.asset_name}
                      </button>
                      <span className="block truncate text-2xs text-txt-muted">
                        {a.asset_code}
                        {a.system_name ? ` · ${a.system_name}` : ''}
                      </span>
                    </td>
                    <td className="truncate px-1.5 py-1.5 align-top" data-tooltip={a.location || ''}>
                      {placeOf(a, a.floor_key ? floorName.get(a.floor_key) : undefined)}
                    </td>
                    <td className="truncate px-1.5 py-1.5 align-top">{a.category || '—'}</td>
                    <td className="px-1.5 py-1.5 align-top">
                      <span className="block font-medium leading-tight" style={{ color: st.color }}>
                        {state === 'hong' || state === 'dang_bao_tri' || state === 'ngung_su_dung'
                          ? st.label
                          : maintDueText(a, at)}
                      </span>
                      <span className="block text-2xs text-txt-muted">{a.next_maintenance || '—'}</span>
                    </td>
                    <td className="px-1.5 py-1.5 align-top">
                      {a.handover_status === 'handed_over'
                        ? `Đã bàn giao${a.handover_date ? ` ${a.handover_date}` : ''}`
                        : a.handover_status === 'pending'
                          ? 'Chưa bàn giao'
                          : '—'}
                    </td>
                    <td className="px-0.5 py-1 align-top">
                      {guid && onLocateGuid && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onLocateGuid(guid);
                          }}
                          className="rounded-md p-1 text-txt-muted hover:text-primary-600"
                          aria-label={`Xem ${a.asset_name} trên mô hình`}
                          data-tooltip="Xem trên mô hình"
                        >
                          <Crosshair className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </BimTable>
        )}
      </div>
    </section>
  );
}

function OrderBoard({
  projectId,
  assets,
  canWrite,
  onOpenAsset,
}: {
  projectId: string;
  assets: FacilityAsset[];
  canWrite: boolean;
  onOpenAsset: (assetId: string, orderId?: string | null) => void;
}) {
  const orders = useWorkOrders(projectId);
  const people = useFacilityPeople(projectId, canWrite);
  const cache = useQueryClient();
  const today = useVnToday();
  const [status, setStatus] = useState<'active' | 'all' | OrderStatus>('active');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.asset_id, a])), [assets]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (orders.data ?? EMPTY_ORDERS)
      .filter((o) => (status === 'all' ? true : status === 'active' ? !isClosed(o) : o.status === status))
      .filter(
        (o) =>
          !term ||
          `${o.title} ${o.assignee_name || ''} ${assetById.get(o.asset_id)?.asset_name || ''} ${assetById.get(o.asset_id)?.asset_code || ''}`
            .toLowerCase()
            .includes(term),
      )
      .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || a.due_date.localeCompare(b.due_date));
  }, [orders.data, status, q, assetById]);
  const opened = orders.data?.find((o) => o.id === openId) || null;
  return (
    <section aria-label="Phiếu bảo trì" className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <BimInput
          aria-label="Tìm phiếu"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm phiếu, thiết bị, người xử lý…"
          className={`${field} mt-0 max-w-sm`}
        />
        <BimSelect
          aria-label="Lọc trạng thái phiếu"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={`${field} mt-0 w-auto`}
        >
          <option value="active">Đang mở</option>
          <option value="all">Mọi trạng thái</option>
          {(Object.keys(ORDER_STATES) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATES[s]}
            </option>
          ))}
        </BimSelect>
        <span className="text-2xs text-txt-muted">
          {list.length} phiếu · tạo phiếu mới trong hồ sơ thiết bị (Sổ tài sản)
        </span>
      </div>
      {orders.isLoading ? (
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải phiếu…
        </p>
      ) : orders.error ? (
        <p role="alert" className="text-rose-600">
          {orders.error.message}
        </p>
      ) : !list.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">Không có phiếu phù hợp.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border dark:border-slate-700">
          <BimTable className="w-full min-w-[720px] text-2xs">
            <thead className="bg-bg-subtle text-left text-2xs uppercase text-txt-muted dark:bg-slate-900">
              <tr>
                <th className="p-1.5">Phiếu</th>
                <th className="p-1.5">Thiết bị</th>
                <th className="p-1.5">Người xử lý</th>
                <th className="p-1.5">Hạn</th>
                <th className="p-1.5">Ưu tiên · loại</th>
                <th className="p-1.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const asset = assetById.get(o.asset_id);
                const due = orderDueState(o, today);
                return (
                  <tr
                    key={o.id}
                    className={`cursor-pointer border-t border-border hover:bg-bg-subtle dark:border-slate-700 ${openId === o.id ? 'bg-primary-50/60 dark:bg-primary-950' : ''}`}
                    onClick={() => setOpenId(openId === o.id ? null : o.id)}
                  >
                    <td className="p-1.5 font-semibold text-txt-primary dark:text-white">{o.title}</td>
                    <td className="p-1.5">
                      <button
                        type="button"
                        className="text-left text-primary-700 underline"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onOpenAsset(o.asset_id, o.id);
                        }}
                      >
                        {asset?.asset_name || o.asset_id}
                      </button>
                    </td>
                    <td className="p-1.5">{o.assignee_name || '—'}</td>
                    <td
                      className={`p-1.5 ${due === 'overdue' ? 'text-rose-600' : due === 'due_soon' ? 'text-amber-600' : ''}`}
                    >
                      {o.due_date} · {dueText(o, today)}
                    </td>
                    <td className="p-1.5">
                      {PRIORITY_LABELS[o.priority ?? 'normal']} · {WORK_TYPE_LABELS[o.work_type ?? 'sua_chua']}
                    </td>
                    <td className="p-1.5">{ORDER_STATES[o.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </BimTable>
        </div>
      )}
      {opened && (
        <FacilityOrderEditor
          key={opened.id}
          order={opened}
          people={people.data || []}
          canEdit={canWrite}
          onSaved={async () => {
            await cache.invalidateQueries({ queryKey: ['bim-work-orders', projectId] });
            await cache.invalidateQueries({ queryKey: ['bim-facility-assets', projectId] });
          }}
        />
      )}
    </section>
  );
}

export default BimAssetWorkspace;
