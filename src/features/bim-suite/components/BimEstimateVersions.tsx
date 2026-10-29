import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BimCostRow, BimModel } from '@/features/bim-suite/types/bim.types';
import { useBimEstimates } from '../hooks/useBimPlan';
import { BimCostService } from '../services/BimCostService';
import { COST_ISSUES, formatVnd, UNIT_LABELS } from '../lib/costing';
import { getIfcLabel } from '../lib/ifcLabels';

export const BimEstimateVersions: React.FC<{
  projectId: string;
  models: BimModel[];
  rows: BimCostRow[];
  canEdit?: boolean;
}> = ({ projectId, models, rows, canEdit }) => {
  const query = useBimEstimates(projectId),
    cache = useQueryClient();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('Dự toán tham khảo');
  const [tax, setTax] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const snapshot = query.data?.find((s) => s.id === selected);
  const demo = models.some((m) => /DEMO/i.test(m.file_name));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await BimCostService.saveEstimate({
        project_id: projectId,
        name: name.trim(),
        models: models.map(({ id, file_name, phien_ban, discipline }) => ({
          id,
          file_name,
          phien_ban,
          discipline,
        })),
        rows,
        status: 'draft',
        tax_percent: tax,
        source: `quantity_summary${demo ? ' · DEMO tham khảo' : ''}`,
      });
      await cache.invalidateQueries({ queryKey: ['bim-cost'] });
      setSelected(saved.id);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phiên bản');
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      await BimCostService.approveEstimate(snapshot.id);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không phê duyệt được');
    } finally {
      setBusy(false);
    }
  };
  const subtotal = snapshot?.rows.reduce((s, r) => s + (r.thanh_tien ?? 0), 0) ?? 0;
  const missing = snapshot?.rows.filter((r) => r.thanh_tien === null).length ?? 0;
  const pages = Math.max(1, Math.ceil((snapshot?.rows.length ?? 0) / 50));
  const index = Math.min(page, pages - 1);
  return (
    <details className="mt-2 rounded-lg border p-2 text-2xs">
      <summary className="cursor-pointer font-semibold">
        Phiên bản dự toán dùng chung ({query.data?.length ?? 0})
      </summary>
      {query.error ? (
        <p role="alert" className="text-rose-600">
          {query.error.message}{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Thử lại
          </button>
        </p>
      ) : (
        <>
          {canEdit && (
            <div className="space-y-1 py-2">
              <BimInput
                aria-label="Tên phiên bản dự toán"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-1 rounded border bg-white dark:bg-slate-900"
              />
              <label className="flex gap-2 items-center">
                Thuế VAT theo cấu hình (%)
                <BimInput
                  aria-label="Thuế VAT dự toán"
                  type="number"
                  min={0}
                  max={100}
                  value={tax}
                  onChange={(e) => setTax(Number(e.target.value))}
                  className="w-16 p-1 rounded border bg-white dark:bg-slate-900"
                />
              </label>
              <button
                type="button"
                disabled={busy || !rows.length || !name.trim() || !Number.isFinite(tax) || tax < 0 || tax > 100}
                onClick={save}
                className="text-primary-600 disabled:opacity-50"
              >
                {busy ? 'Đang lưu…' : 'Lưu phiên bản từ dữ liệu hiện tại'}
              </button>
              <p className="text-2xs text-slate-500">
                Giữ nguyên các dòng tính, nguồn và phiên bản mô hình tại thời điểm lưu. Dữ liệu thiếu vẫn được ghi rõ.
              </p>
            </div>
          )}
          <BimSelect
            aria-label="Xem phiên bản dự toán"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPage(0);
            }}
            className="w-full border rounded p-1 bg-white dark:bg-slate-900"
          >
            <option value="">Chọn phiên bản đã lưu</option>
            {query.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.status === 'approved' ? 'Đã duyệt' : 'Bản nháp'} ·{' '}
                {formatDateTime(new Date(s.created_at))}
              </option>
            ))}
          </BimSelect>
          {snapshot && (
            <div className="space-y-1 mt-2">
              <p>
                {snapshot.source} · {snapshot.models.map((m) => `${m.file_name} v${m.phien_ban || 1}`).join(' · ')}
              </p>
              <p className="font-semibold">
                Phần đã tính {formatVnd(subtotal)} · VAT {snapshot.tax_percent}% · sau thuế{' '}
                {formatVnd(subtotal * (1 + Number(snapshot.tax_percent) / 100))}
              </p>
              <p>
                {missing ? `${missing} dòng chưa tính được — tổng chưa đầy đủ` : 'Đã tính đủ các dòng của phiên bản'}
              </p>
              {canEdit && snapshot.status === 'draft' && (
                <button
                  type="button"
                  disabled={busy || !!missing || /DEMO/i.test(snapshot.source)}
                  onClick={approve}
                  className="text-emerald-700 disabled:opacity-50"
                  data-tooltip="Cần quyền phê duyệt dự án và dữ liệu đã xác nhận"
                >
                  Phê duyệt và khóa phiên bản
                </button>
              )}
              <div className="max-h-56 overflow-auto">
                <BimTable className="w-full text-2xs">
                  <thead>
                    <tr>
                      <th className="text-left">Công tác · vị trí</th>
                      <th>Khối lượng</th>
                      <th>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rows.slice(index * 50, (index + 1) * 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td>
                          {getIfcLabel(r.loai_cau_kien)} · {r.phan_doan_tang}
                        </td>
                        <td>
                          {r.khoi_luong ?? '—'} {r.don_vi ? UNIT_LABELS[r.don_vi] : ''}
                        </td>
                        <td>
                          {r.issue
                            ? COST_ISSUES[r.issue]
                            : r.thanh_tien !== null
                              ? formatVnd(r.thanh_tien)
                              : 'Chưa tính'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </BimTable>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={!index} onClick={() => setPage(index - 1)}>
                  Trước
                </button>
                <span>
                  {index + 1}/{pages}
                </span>
                <button type="button" disabled={index + 1 >= pages} onClick={() => setPage(index + 1)}>
                  Sau
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-rose-600">
          {error}
        </p>
      )}
    </details>
  );
};
