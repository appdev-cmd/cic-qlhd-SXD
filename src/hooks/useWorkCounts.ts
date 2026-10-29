import { useEffect, useState } from 'react';
import { appraisalService } from '../services/appraisalService';
import type { ProcedureId } from '../layouts/navigation';

export interface WorkCount {
  overdue: number;
  dueSoon: number;
  supplementOverdue: number;
}
export type WorkCounts = Record<ProcedureId, WorkCount>;

const PROCEDURES: ProcedureId[] = ['bcnckt', 'gpxd', 'nghiem_thu'];
const REFRESH_MS = 5 * 60 * 1000;

let cached: { at: number; value: WorkCounts } | null = null;
let inflight: Promise<WorkCounts> | null = null;
const listeners = new Set<(value: WorkCounts) => void>();

async function total(procedure: ProcedureId, sla: string) {
  const page = await appraisalService.page({ procedure, sla, limit: 1, offset: 0 });
  return page.total || 0;
}

async function load(): Promise<WorkCounts> {
  const entries = await Promise.all(
    PROCEDURES.map(
      async (p) =>
        [
          p,
          {
            overdue: await total(p, 'overdue'),
            dueSoon: await total(p, 'due_soon'),
            supplementOverdue: await total(p, 'supplement_overdue'),
          },
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as WorkCounts;
}

function refresh(force = false) {
  if (!force && cached && Date.now() - cached.at < REFRESH_MS) return Promise.resolve(cached.value);
  inflight ??= load()
    .then((value) => {
      cached = { at: Date.now(), value };
      listeners.forEach((l) => l(value));
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Số hồ sơ cần chú ý theo từng nghiệp vụ (quá hạn, sắp đến hạn, quá hạn bổ sung) — dùng cho
 * số đếm trên menu và chuông báo hạn. Tính khi mở trang, làm mới sau mỗi thao tác ghi
 * (sự kiện `appraisal:changed`) và mỗi 5 phút; không gửi email/SMS.
 */
export function useWorkCounts() {
  const [counts, setCounts] = useState<WorkCounts | null>(cached?.value ?? null);
  useEffect(() => {
    let alive = true;
    const update = (value: WorkCounts) => alive && setCounts(value);
    listeners.add(update);
    refresh().then(update, () => undefined);
    const onChange = () => void refresh(true).catch(() => undefined);
    window.addEventListener('appraisal:changed', onChange);
    const timer = window.setInterval(() => void refresh(true).catch(() => undefined), REFRESH_MS);
    return () => {
      alive = false;
      listeners.delete(update);
      window.removeEventListener('appraisal:changed', onChange);
      window.clearInterval(timer);
    };
  }, []);
  return counts;
}

export function urgentTotal(count?: WorkCount) {
  return count ? count.overdue + count.dueSoon + count.supplementOverdue : 0;
}
