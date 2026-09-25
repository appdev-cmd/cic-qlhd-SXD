import { useState } from 'react';
import { History, PlusCircle, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatDateTime } from '../../lib/utils';
import { useAuditLogs } from '../../hooks/useData';
import type { AuditEntityTable, AuditLogEntry } from '../../data-access/auditLogs';
import { STATUS_LABELS } from '../ui/StatusBadge';
import { WORKFLOW_STATE_LABELS } from '../../lib/workflow';

/** Nhãn tiếng Việt cho các trường dữ liệu — tuyệt đối không hiển thị tên cột / ID thô. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Tên dự án',
  name: 'Tên',
  full_name: 'Họ và tên',
  code: 'Mã',
  investment_cost: 'Tổng mức đầu tư',
  estimated_savings: 'Kinh phí tiết giảm',
  investor_id: 'Chủ đầu tư',
  investor_name: 'Chủ đầu tư',
  lead_reviewer_name: 'Chuyên viên thụ lý',
  lead_reviewer_staff_id: 'Chuyên viên thụ lý',
  sla_status: 'Trạng thái SLA',
  workflow_state: 'Bước xử lý',
  received_date: 'Ngày nhận đủ hồ sơ hợp lệ',
  supplement_count: 'Số lần yêu cầu bổ sung',
  extension_count: 'Số lần gia hạn',
  paused_at: 'Ngày tạm dừng',
  status: 'Trạng thái',
  stage: 'Giai đoạn',
  deadline: 'Hạn trả kết quả',
  submission_date: 'Ngày tiếp nhận',
  location_district: 'Địa bàn',
  group_type: 'Nhóm dự án',
  grade: 'Cấp công trình',
  field: 'Lĩnh vực',
  department: 'Phòng chuyên môn',
  fire_safety_status: 'Trạng thái PCCC',
  planning_compliance: 'Phù hợp quy hoạch',
  standard_compliance: 'Tuân thủ quy chuẩn',
  cert_number: 'Số chứng chỉ',
  cert_grade: 'Hạng chứng chỉ',
  cert_expiry: 'Ngày hết hạn chứng chỉ',
  phone: 'Số điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
  legal_rep: 'Người đại diện',
  tax_code: 'Mã số thuế',
  standard_price: 'Giá công bố',
  market_price: 'Giá thị trường',
};

/** Các cột kỹ thuật không hiển thị trong lịch sử */
const HIDDEN_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'search_text', 'tt39_data', 'appraisal_data', 'images', 'contractors',
  'investor_id', 'lead_reviewer_staff_id', 'designer_id', 'auditor_id', 'lead_reviewer_id', 'org_id',
  'lat', 'lng', 'metadata', 'province_code',
]);

const MONEY_FIELDS = new Set(['investment_cost', 'estimated_savings', 'standard_price', 'market_price']);
const DATE_FIELDS = new Set(['deadline', 'submission_date', 'cert_expiry', 'received_date', 'paused_at']);

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.has(field)) return formatCurrency(Number(value));
  if (DATE_FIELDS.has(field)) return formatDate(String(value));
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (field === 'workflow_state' && typeof value === 'string') return WORKFLOW_STATE_LABELS[value as keyof typeof WORKFLOW_STATE_LABELS] ?? value;
  if (typeof value === 'string' && STATUS_LABELS[value]) return STATUS_LABELS[value];
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value);
}

function EntryRow({ entry }: { entry: AuditLogEntry }) {
  const fields = (entry.changedFields.length ? entry.changedFields : Object.keys(entry.newData ?? {})).filter(
    (f) => !HIDDEN_FIELDS.has(f) && FIELD_LABELS[f]
  );
  const Icon = entry.action === 'insert' ? PlusCircle : entry.action === 'delete' ? Trash2 : Pencil;
  const actionLabel = entry.action === 'insert' ? 'Tạo mới' : entry.action === 'delete' ? 'Xóa' : 'Cập nhật';

  return (
    <li className="relative pl-7 pb-3 last:pb-0">
      <span className="absolute left-2 top-5 bottom-0 w-px bg-border dark:bg-slate-800" aria-hidden="true" />
      <span
        className={cn(
          'absolute left-0 top-0.5 w-4 h-4 rounded-full flex items-center justify-center',
          entry.action === 'insert' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
          entry.action === 'update' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
          entry.action === 'delete' && 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
        )}
      >
        <Icon size={10} />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 text-2xs">
        <span className="font-bold text-ink">{entry.actorName}</span>
        {entry.actorTitle && <span className="text-ink-muted">({entry.actorTitle})</span>}
        <span className="text-ink-secondary">{actionLabel}</span>
        <span className="text-ink-muted ml-auto font-mono">{formatDateTime(entry.createdAt)}</span>
      </div>
      {entry.action === 'update' && fields.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {fields.map((f) => (
            <li key={f} className="text-2xs text-ink-secondary">
              <span className="font-semibold text-ink">{FIELD_LABELS[f]}:</span>{' '}
              <span className="line-through text-ink-muted">{formatValue(f, entry.oldData?.[f])}</span>
              {' → '}
              <span className="text-ink">{formatValue(f, entry.newData?.[f])}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Tab/khối "Lịch sử thay đổi" nhúng trong panel chi tiết thực thể (đọc audit_logs đã resolve tên).
 */
export function AuditHistoryTab({
  table,
  recordId,
  compact = false,
}: {
  table: AuditEntityTable;
  recordId: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const { data = [], isLoading, error } = useAuditLogs(table, recordId);

  return (
    <div className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="font-bold text-ink text-xs flex items-center gap-1.5">
          <History size={15} className="text-primary-600 dark:text-primary-400" />
          Lịch sử thay đổi dữ liệu ({data.length})
        </span>
        <ChevronDown size={14} className={cn('text-ink-muted transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded &&
        (isLoading ? (
          <p className="text-2xs text-ink-muted">Đang tải lịch sử...</p>
        ) : error ? (
          <p className="text-2xs text-rose-600 dark:text-rose-400">{(error as Error).message}</p>
        ) : data.length === 0 ? (
          <p className="text-2xs text-ink-muted italic">Chưa có thay đổi nào được ghi nhận kể từ khi khởi tạo dữ liệu.</p>
        ) : (
          <ul>
            {data.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        ))}
    </div>
  );
}
