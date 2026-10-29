import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BimBoqService } from '../services/BimBoqService';
import type { BoqCodeMatch } from '../services/BimBoqService';
import type { BimModel } from '@/features/bim-suite/types/bim.types';

export function BimAutoLinkBoq({
  projectId,
  models,
  canEdit,
}: {
  projectId: string;
  models: BimModel[];
  canEdit?: boolean;
}) {
  const cache = useQueryClient();
  const contracts = useQuery({
    queryKey: ['bim-boq', 'contracts', projectId],
    queryFn: () => BimBoqService.contracts(projectId),
  });
  const [contract, setContract] = useState('');
  const [preview, setPreview] = useState<{ key: string; rows: BoqCodeMatch[] } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const ids = models
    .filter((m) => m.status === 'ready')
    .map((m) => m.id)
    .sort();
  const key = JSON.stringify([projectId, ids, contract]);
  const rows = preview?.key === key ? preview.rows : null;
  const run = async (apply: boolean) => {
    if (!contract || !canEdit || (apply && !rows?.length)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (apply) {
        const count = await BimBoqService.applyBoq(projectId, ids, [contract], rows!);
        setPreview(null);
        setMessage(`Đã gắn ${count} liên kết. Khối lượng được cập nhật tại Chi phí → BOQ.`);
        await Promise.all(
          ['bim-boq', 'bim-linked-guids', 'bim-links', 'bim-field-actual'].map((k) =>
            cache.invalidateQueries({ queryKey: [k] }),
          ),
        );
      } else setPreview({ key, rows: await BimBoqService.previewBoq(projectId, ids, [contract]) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể liên kết BOQ');
    } finally {
      setBusy(false);
    }
  };
  if (!canEdit) return null;
  return (
    <div className="p-2 rounded-lg border border-dashed border-slate-300 space-y-2">
      <b>Gắn BOQ theo mã phân loại IFC</b>
      <p className="text-2xs text-slate-500">
        Chỉ ghép mã trùng chính xác. Mã trùng nhiều dòng, đơn vị chưa hỗ trợ hoặc dòng BOQ thuộc nhiều mô hình được bỏ
        qua để gắn thủ công.
      </p>
      {contracts.error && <p role="alert">Không tải được hợp đồng: {contracts.error.message}</p>}
      <BimSelect
        aria-label="Hợp đồng gắn BOQ"
        className="w-full border rounded p-1 bg-white dark:bg-slate-900"
        value={contract}
        disabled={busy}
        onChange={(e) => {
          setContract(e.target.value);
          setPreview(null);
          setMessage('');
        }}
      >
        <option value="">Chọn hợp đồng</option>
        {contracts.data?.map((c) => (
          <option key={c.ma_hop_dong} value={c.ma_hop_dong}>
            {c.ten_hop_dong || c.ma_hop_dong}
          </option>
        ))}
      </BimSelect>
      <button
        type="button"
        disabled={busy || !contract || !ids.length}
        onClick={() => run(false)}
        className="border rounded px-2 py-1 disabled:opacity-50"
      >
        {busy ? 'Đang xử lý…' : 'Xem trước liên kết'}
      </button>
      {rows && (
        <>
          <p>{rows.length} liên kết mới phù hợp.</p>
          <div className="max-h-40 overflow-auto">
            {rows.slice(0, 50).map((r) => (
              <div key={`${r.model_id}:${r.global_id}:${r.ma_boq}`} className="py-1 border-b text-2xs">
                {r.code} · {r.name} ({r.unit})<br />
                <span className="text-slate-500">{r.global_id}</span>
              </div>
            ))}
            {rows.length > 50 && <p>Đang hiển thị 50/{rows.length} liên kết.</p>}
          </div>
          <button
            type="button"
            disabled={busy || !rows.length}
            onClick={() => run(true)}
            className="bg-primary-600 text-white rounded px-2 py-1 disabled:opacity-50"
          >
            Gắn {rows.length} liên kết đã xem trước
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-700">
          {message}
        </p>
      )}
    </div>
  );
}
