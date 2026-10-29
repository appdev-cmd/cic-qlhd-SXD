import {formatDate as sxdFormatDate} from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
'use client';
// Handover checklist per system (plus items of one asset), linked to acceptance records (bim_nghiem_thu) and
// handover documents. The database blocks "handed over" while required items are open (facility_handover_gate).
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useHandoverItems } from '../hooks/useFacilityOps';
import { FacilityOpsService, type HandoverItem } from '../services/FacilityOpsService';
import type { FacilityAsset, FacilityDocument } from '../services/facilityAssetService';
import { HANDOVER_ITEMS_KEY } from '../services/BimHandoverPackageService';

/** Asset fields the checklist needs. */
export type HandoverAsset = Pick<
  FacilityAsset,
  'asset_id' | 'system_name' | 'category' | 'bim_element_id' | 'documents'
>;

export const HANDOVER_TEMPLATE: Pick<HandoverItem, 'label' | 'kind' | 'required'>[] = [
  { label: 'Biên bản nghiệm thu hệ thống', kind: 'acceptance', required: true },
  { label: 'Hồ sơ hướng dẫn vận hành và bảo trì (O&M)', kind: 'document', required: true },
  { label: 'Chứng chỉ xuất xưởng, CO/CQ', kind: 'document', required: true },
  { label: 'Phiếu bảo hành của nhà cung cấp', kind: 'document', required: true },
  { label: 'Chạy thử, nghiệm thu vận hành có tải', kind: 'check', required: true },
  { label: 'Đào tạo nhân sự vận hành', kind: 'check', required: true },
  { label: 'Bàn giao phụ tùng, dụng cụ kèm theo', kind: 'check', required: false },
];
const KIND_LABELS: Record<HandoverItem['kind'], string> = {
  acceptance: 'Biên bản nghiệm thu',
  document: 'Hồ sơ',
  check: 'Kiểm tra',
};
const VERDICT: Record<string, string> = { dat: 'Đạt', dat_co_dieu_kien: 'Đạt có điều kiện', khong_dat: 'Không đạt' };

export const assetSystem = (asset: Pick<HandoverAsset, 'system_name' | 'category'>) =>
  asset.system_name?.trim() || asset.category || 'Chưa phân loại';

export function handoverProgress(items: Pick<HandoverItem, 'required' | 'done'>[]) {
  const required = items.filter((item) => item.required);
  return {
    total: items.length,
    required: required.length,
    done: required.filter((item) => item.done).length,
    ready: items.length > 0 && required.every((item) => item.done),
  };
}

export function BimHandoverPanel({
  projectId,
  asset,
  canWrite,
}: {
  projectId: string;
  asset: HandoverAsset;
  canWrite?: boolean;
}) {
  const cache = useQueryClient();
  const query = useHandoverItems(projectId);
  const acceptance = useQuery({
    queryKey: ['facility-acceptance-records', projectId],
    queryFn: () => FacilityOpsService.acceptanceRecords(projectId),
    enabled: !!canWrite,
    staleTime: 60000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const system = assetSystem(asset);
  const items = useMemo(
    () =>
      (query.data || []).filter(
        (item) => item.asset_id === asset.asset_id || (!item.asset_id && item.system_name === system),
      ),
    [query.data, asset.asset_id, system],
  );
  const progress = handoverProgress(items);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await cache.invalidateQueries({ queryKey: HANDOVER_ITEMS_KEY(projectId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được checklist bàn giao');
    } finally {
      setBusy(false);
    }
  };
  const addTemplate = () =>
    run(() =>
      FacilityOpsService.addHandoverItems(
        HANDOVER_TEMPLATE.map((item, i) => ({
          ...item,
          project_id: projectId,
          system_name: system,
          asset_id: null,
          seq: i + 1,
        })),
      ),
    );
  const upload = (item: HandoverItem, file: File) =>
    run(async () => {
      const document = await FacilityOpsService.uploadDocument(projectId, asset.asset_id, file);
      await FacilityOpsService.updateHandoverItem(item, { document });
    });
  const openDocument = (doc: FacilityDocument) =>
    void FacilityOpsService.documentUrl(doc)
      .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không mở được tệp'));

  return (
    <section
      aria-label="Checklist bàn giao"
      className="space-y-2 rounded-xl border border-border p-3 text-xs dark:border-slate-700"
    >
      <header className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary-700" aria-hidden />
        <b>Checklist bàn giao · hệ thống {system}</b>
        <span
          className={`ml-auto rounded px-2 py-0.5 ${progress.ready ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-50' : 'bg-amber-50 text-amber-800 dark:bg-amber-50'}`}
        >
          {progress.total === 0
            ? 'Chưa có checklist'
            : progress.ready
              ? 'Đủ điều kiện bàn giao'
              : `Đạt ${progress.done}/${progress.required} mục bắt buộc`}
        </span>
      </header>
      <p className="text-2xs text-txt-muted">
        Mục theo hệ thống áp dụng cho mọi thiết bị cùng hệ thống. Trạng thái &quot;Đã bàn giao&quot; chỉ lưu được khi
        mọi mục bắt buộc đạt.
      </p>
      {query.isLoading ? (
        <p role="status">Đang tải checklist…</p>
      ) : query.error ? (
        <p role="alert" className="text-rose-600">
          {query.error.message}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="space-y-1 rounded-lg border border-border p-2 dark:border-slate-700">
              <div className="flex items-start gap-2">
                <BimInput
                  type="checkbox"
                  aria-label={`Đạt: ${item.label}`}
                  checked={item.done}
                  disabled={!canWrite || busy}
                  onChange={(e) =>
                    void run(() => FacilityOpsService.updateHandoverItem(item, { done: e.target.checked }))
                  }
                />
                <span className="flex-1">
                  {item.label}
                  {item.required ? '' : ' (không bắt buộc)'}
                  <span className="block text-2xs text-txt-muted">
                    {KIND_LABELS[item.kind]}
                    {item.asset_id ? ' · riêng thiết bị này' : ''}
                    {item.done_at ? ` · đạt ${sxdFormatDate(new Date(item.done_at))}` : ''}
                  </span>
                </span>
                {canWrite && (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-txt-muted hover:text-rose-600"
                    aria-label={`Xóa mục ${item.label}`}
                    onClick={() => void run(() => FacilityOpsService.removeHandoverItem(item.id))}
                  >
                    Xóa
                  </button>
                )}
              </div>
              {item.kind === 'acceptance' && (
                <BimSelect
                  aria-label={`Biên bản cho ${item.label}`}
                  disabled={!canWrite || busy}
                  value={item.acceptance_id || ''}
                  onChange={(e) =>
                    void run(() =>
                      FacilityOpsService.updateHandoverItem(item, {
                        acceptance_id: e.target.value || null,
                        done: false,
                      }),
                    )
                  }
                  className="w-full rounded border border-border px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="">Chọn biên bản nghiệm thu</option>
                  {(acceptance.data || []).map((record) => (
                    <option key={record.ma_nghiem_thu} value={record.ma_nghiem_thu}>
                      {record.ten_nghiem_thu || record.ma_nghiem_thu.slice(0, 8)} ·{' '}
                      {VERDICT[record.ket_luan ?? ''] ?? 'Chờ kết luận'}
                      {record.bim_guid && record.bim_guid === asset.bim_element_id ? ' · gắn thiết bị này' : ''}
                    </option>
                  ))}
                  {item.acceptance_id && !acceptance.data?.some((r) => r.ma_nghiem_thu === item.acceptance_id) && (
                    <option value={item.acceptance_id}>Biên bản đã liên kết</option>
                  )}
                </BimSelect>
              )}
              {item.kind === 'document' && (
                <div className="flex flex-wrap items-center gap-2">
                  {item.document ? (
                    <button
                      type="button"
                      className="text-primary-700 underline"
                      onClick={() => openDocument(item.document!)}
                    >
                      {item.document.title}
                    </button>
                  ) : (
                    <span className="text-txt-muted">
                      {asset.documents?.length
                        ? `Dùng hồ sơ thiết bị (${asset.documents.length} tệp) hoặc tải tệp riêng`
                        : 'Chưa có hồ sơ'}
                    </span>
                  )}
                  {canWrite && (
                    <label className="cursor-pointer text-primary-700">
                      Tải tệp
                      <BimInput
                        type="file"
                        className="sr-only"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
                        aria-label={`Tệp cho ${item.label}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void upload(item, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {!items.length && !query.isLoading && (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-primary-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
              onClick={() => void addTemplate()}
            >
              Tạo checklist mẫu cho hệ thống
            </button>
          )}
          <BimInput
            aria-label="Mục bàn giao riêng"
            placeholder="Thêm mục riêng cho thiết bị này"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={busy || !label.trim()}
            className="rounded-lg border border-border px-2 py-1 dark:border-slate-600"
            onClick={() =>
              void run(async () => {
                await FacilityOpsService.addHandoverItems([
                  {
                    project_id: projectId,
                    system_name: system,
                    asset_id: asset.asset_id,
                    label: label.trim(),
                    kind: 'check',
                    required: true,
                    seq: items.length + 1,
                  },
                ]);
                setLabel('');
              })
            }
          >
            Thêm
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
}
