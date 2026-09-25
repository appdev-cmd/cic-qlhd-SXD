/**
 * Nhật ký thay đổi dữ liệu (audit_logs) — ghi tự động bằng trigger tại DB.
 * Ở chế độ demo, nhật ký được ghi trong bộ nhớ phiên làm việc.
 */
import { isDemoMode } from '../lib/dataMode';
import { requireSupabase } from '../lib/supabase';
import { unwrap } from './query';

export type AuditEntityTable = 'projects' | 'organizations' | 'personnel' | 'material_prices' | 'appraisal_disciplines';

export interface AuditLogEntry {
  id: number;
  tableName: AuditEntityTable | string;
  recordId: string;
  action: 'insert' | 'update' | 'delete';
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  changedFields: string[];
  actorId: string;
  actorName: string;
  actorTitle?: string;
  recordLabel?: string;
  createdAt: string;
}

const demoLog: AuditLogEntry[] = [];

export function recordDemoAudit(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>) {
  demoLog.unshift({ ...entry, id: demoLog.length + 1, createdAt: new Date().toISOString() });
}

export async function listAuditLogs(tableName: AuditEntityTable, recordId: string, limit = 100): Promise<AuditLogEntry[]> {
  if (isDemoMode) {
    return demoLog.filter((e) => e.tableName === tableName && e.recordId === recordId).slice(0, limit);
  }
  const result = await requireSupabase()
    .from('audit_logs_resolved')
    .select('*')
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(limit);
  const rows = unwrap(result, 'Không tải được lịch sử thay đổi') as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    tableName: String(r.table_name),
    recordId: String(r.record_id),
    action: r.action as AuditLogEntry['action'],
    oldData: (r.old_data as Record<string, unknown>) ?? null,
    newData: (r.new_data as Record<string, unknown>) ?? null,
    changedFields: (r.changed_fields as string[]) ?? [],
    actorId: String(r.actor_id),
    actorName: String(r.actor_name),
    actorTitle: (r.actor_title as string) ?? undefined,
    recordLabel: (r.record_label as string) ?? undefined,
    createdAt: String(r.created_at),
  }));
}
