import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Preventive maintenance plans: per asset or asset category, cycle, lead days, checklist template, default assignee.
// The daily job (pg_cron when installed) raises orders; "Sinh phiếu đến hạn" runs it now (no duplicate period).
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useConfirm } from '@/features/bim-suite/adapters/ui';
import { useFacilityPeople, usePmPlans } from '../hooks/useFacilityOps';
import { FacilityOpsService, type PmPlan, type PmPlanDraft } from '../services/FacilityOpsService';
import { ASSET_CATEGORIES, type FacilityAsset } from '../services/facilityAssetService';
import { PRIORITY_LABELS, vnDate } from '../lib/workOrderFilters';

const field =
  'mt-1 w-full min-w-0 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';

const emptyDraft = (projectId: string): PmPlanDraft => ({
  project_id: projectId,
  name: 'Bảo trì định kỳ',
  asset_id: null,
  asset_category: 'HVAC',
  cycle_days: 30,
  lead_days: 7,
  start_on: vnDate(),
  checklist_template: ['Kiểm tra tình trạng', 'Vệ sinh thiết bị', 'Chạy thử và ghi nhận kết quả'],
  default_assignee_id: null,
  priority: 'normal',
  active: true,
});

export const BimPmPlansPanel: React.FC<{ projectId: string; canWrite?: boolean; assets: FacilityAsset[] }> = ({
  projectId,
  canWrite,
  assets,
}) => {
  const plans = usePmPlans(projectId);
  const cache = useQueryClient();
  const confirm = useConfirm();
  const people = useFacilityPeople(projectId, !!canWrite);
  const [editing, setEditing] = useState<(PmPlanDraft & { id?: string; version?: number }) | null>(null);
  const [checklistText, setChecklistText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const assetName = useMemo(
    () => new Map(assets.map((a) => [a.asset_id, `${a.asset_name}${a.asset_code ? ` · ${a.asset_code}` : ''}`])),
    [assets],
  );
  const activeAssets = useMemo(() => assets.filter((a) => a.status !== 'Retired'), [assets]);
  const run = async (task: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await task();
      await cache.invalidateQueries({ queryKey: ['facility-pm-plans', projectId] });
      if (text) setMessage({ tone: 'ok', text });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Không lưu được kế hoạch' });
    } finally {
      setBusy(false);
    }
  };
  const open = (plan?: PmPlan) => {
    const draft = plan ? { ...plan } : emptyDraft(projectId);
    setEditing(draft);
    setChecklistText(draft.checklist_template.join('\n'));
  };
  const save = () =>
    run(async () => {
      if (!editing) return;
      const checklist = checklistText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (!editing.name.trim()) throw new Error('Cần tên kế hoạch.');
      if (!editing.asset_id && !editing.asset_category) throw new Error('Chọn thiết bị hoặc nhóm thiết bị.');
      if (!(editing.cycle_days >= 1)) throw new Error('Chu kỳ tối thiểu 1 ngày.');
      const { id, version, ...rest } = editing;
      const draft: PmPlanDraft = {
        project_id: rest.project_id,
        name: rest.name.trim(),
        asset_id: rest.asset_id,
        asset_category: rest.asset_category,
        cycle_days: rest.cycle_days,
        lead_days: rest.lead_days,
        start_on: rest.start_on,
        checklist_template: checklist,
        default_assignee_id: rest.default_assignee_id,
        priority: rest.priority,
        active: rest.active,
      };
      await FacilityOpsService.savePlan({ ...draft, id, version });
      setEditing(null);
      return 'Đã lưu kế hoạch bảo trì định kỳ.';
    });
  const toggle = (plan: PmPlan) =>
    run(async () => {
      await FacilityOpsService.savePlan({
        id: plan.id,
        version: plan.version,
        project_id: plan.project_id,
        name: plan.name,
        asset_id: plan.asset_id,
        asset_category: plan.asset_category,
        cycle_days: plan.cycle_days,
        lead_days: plan.lead_days,
        start_on: plan.start_on,
        checklist_template: plan.checklist_template,
        default_assignee_id: plan.default_assignee_id,
        priority: plan.priority,
        active: !plan.active,
      });
      return plan.active ? 'Đã tạm dừng kế hoạch.' : 'Đã bật lại kế hoạch.';
    });
  const remove = async (plan: PmPlan) => {
    const ok = await confirm({
      title: 'Xóa kế hoạch bảo trì?',
      message: `Kế hoạch "${plan.name}" sẽ bị xóa. Kế hoạch đã sinh phiếu chỉ có thể tạm dừng.`,
      confirmText: 'Xóa',
      variant: 'danger',
    });
    if (ok)
      await run(async () => {
        await FacilityOpsService.deletePlan(plan.id);
        return 'Đã xóa kế hoạch.';
      });
  };
  const generate = () =>
    run(async () => {
      const result = await FacilityOpsService.generatePm(projectId);
      await cache.invalidateQueries({ queryKey: ['bim-work-orders', projectId] });
      await cache.invalidateQueries({ queryKey: ['bim-my-orders', projectId] });
      const errors = result.loi?.length
        ? ` ${result.loi.length} lỗi: ${result.loi
            .slice(0, 3)
            .map((e) => e.loi)
            .join('; ')}`
        : '';
      return `Ngày ${result.ngay}: sinh ${result.phieu_moi} phiếu mới, đã giao ${result.da_giao}.${errors}`;
    });
  return (
    <section aria-label="Bảo trì định kỳ" className="space-y-2 text-xs text-txt-secondary dark:text-slate-200">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary-600" />
        <h3 className="font-semibold text-txt-primary dark:text-white">Bảo trì định kỳ</h3>
        <span className="flex-1" />
        {canWrite && (
          <button type="button" disabled={busy} className={btn} onClick={() => open()}>
            <Plus className="h-3 w-3" /> Thêm kế hoạch
          </button>
        )}
        {canWrite && (
          <button type="button" disabled={busy} className={primary} onClick={() => void generate()}>
            Sinh phiếu đến hạn
          </button>
        )}
      </header>
      <p className="text-2xs text-txt-muted">
        Phiếu được lập theo ngày Việt Nam khi còn số ngày lập trước hạn; mỗi kỳ chỉ một phiếu. Kỳ sau tính từ ngày hoàn
        tất thực tế.
      </p>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-rose-600' : 'text-emerald-700'}
        >
          {message.text}
        </p>
      )}
      {plans.isLoading ? (
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải kế hoạch…
        </p>
      ) : plans.error ? (
        <p role="alert" className="text-rose-600">
          {plans.error.message}
        </p>
      ) : !plans.data?.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
          Chưa có kế hoạch bảo trì định kỳ.
        </p>
      ) : (
        <ul className="space-y-1">
          {plans.data.map((plan) => (
            <li
              key={plan.id}
              className={`rounded-xl border border-border p-2 dark:border-slate-700 ${plan.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <b className="text-txt-primary dark:text-white">{plan.name}</b>
                  <p className="text-2xs text-txt-muted">
                    {plan.asset_id ? assetName.get(plan.asset_id) || plan.asset_id : `Nhóm ${plan.asset_category}`} ·
                    mỗi {plan.cycle_days} ngày · lập trước {plan.lead_days} ngày · kỳ đầu {plan.start_on} · ưu tiên{' '}
                    {PRIORITY_LABELS[plan.priority].toLowerCase()}
                    {plan.active ? '' : ' · Tạm dừng'}
                  </p>
                </div>
                {canWrite && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-txt-muted hover:text-primary-600"
                      aria-label={`Sửa ${plan.name}`}
                      onClick={() => open(plan)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={busy} className={btn} onClick={() => void toggle(plan)}>
                      {plan.active ? 'Tạm dừng' : 'Bật lại'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-txt-muted hover:text-rose-600"
                      aria-label={`Xóa ${plan.name}`}
                      onClick={() => void remove(plan)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && canWrite && (
        <form
          aria-label="Kế hoạch bảo trì"
          className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            Tên kế hoạch
            <BimInput
              aria-label="Tên kế hoạch"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className={field}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              Áp dụng cho
              <BimSelect
                aria-label="Phạm vi kế hoạch"
                value={editing.asset_id !== null ? 'asset' : 'category'}
                className={field}
                onChange={(e) =>
                  setEditing(
                    e.target.value === 'asset'
                      ? { ...editing, asset_id: activeAssets[0]?.asset_id ?? '', asset_category: null }
                      : { ...editing, asset_id: null, asset_category: 'HVAC' },
                  )
                }
              >
                <option value="category">Nhóm thiết bị</option>
                <option value="asset">Một thiết bị</option>
              </BimSelect>
            </label>
            {editing.asset_id !== null ? (
              <label>
                Thiết bị
                <BimSelect
                  aria-label="Thiết bị của kế hoạch"
                  value={editing.asset_id || ''}
                  onChange={(e) => setEditing({ ...editing, asset_id: e.target.value })}
                  className={field}
                >
                  {activeAssets.map((asset) => (
                    <option key={asset.asset_id} value={asset.asset_id}>
                      {assetName.get(asset.asset_id)}
                    </option>
                  ))}
                </BimSelect>
              </label>
            ) : (
              <label>
                Nhóm
                <BimSelect
                  aria-label="Nhóm thiết bị của kế hoạch"
                  value={editing.asset_category || ''}
                  onChange={(e) => setEditing({ ...editing, asset_category: e.target.value })}
                  className={field}
                >
                  {ASSET_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </BimSelect>
              </label>
            )}
            <label>
              Chu kỳ (ngày)
              <BimInput
                aria-label="Chu kỳ (ngày)"
                type="number"
                min={1}
                value={editing.cycle_days}
                onChange={(e) => setEditing({ ...editing, cycle_days: Number(e.target.value) })}
                className={field}
              />
            </label>
            <label>
              Lập phiếu trước (ngày)
              <BimInput
                aria-label="Lập phiếu trước (ngày)"
                type="number"
                min={0}
                value={editing.lead_days}
                onChange={(e) => setEditing({ ...editing, lead_days: Number(e.target.value) })}
                className={field}
              />
            </label>
            <label>
              Kỳ đầu tiên
              <BimInput
                aria-label="Ngày đến hạn kỳ đầu"
                type="date"
                value={editing.start_on}
                onChange={(e) => setEditing({ ...editing, start_on: e.target.value })}
                className={field}
              />
            </label>
            <label>
              Ưu tiên
              <BimSelect
                aria-label="Ưu tiên phiếu định kỳ"
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: e.target.value as PmPlan['priority'] })}
                className={field}
              >
                {(Object.keys(PRIORITY_LABELS) as PmPlan['priority'][]).map((key) => (
                  <option key={key} value={key}>
                    {PRIORITY_LABELS[key]}
                  </option>
                ))}
              </BimSelect>
            </label>
            <label className="col-span-2">
              Người thực hiện mặc định
              <BimSelect
                aria-label="Người thực hiện mặc định"
                value={editing.default_assignee_id || ''}
                onChange={(e) => setEditing({ ...editing, default_assignee_id: e.target.value || null })}
                className={field}
              >
                <option value="">Chưa giao (phiếu ở trạng thái Mới tạo)</option>
                {(people.data || []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </BimSelect>
            </label>
          </div>
          <label className="block">
            Checklist mẫu (mỗi dòng một việc)
            <textarea
              aria-label="Checklist mẫu"
              rows={4}
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2">
            <BimInput
              type="checkbox"
              checked={editing.active}
              onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
            />
            Đang áp dụng
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primary}>
              Lưu kế hoạch
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => setEditing(null)}>
              Hủy
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
