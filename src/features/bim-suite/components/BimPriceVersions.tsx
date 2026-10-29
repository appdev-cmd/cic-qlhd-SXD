import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/features/bim-suite/adapters/supabase';
import type { BimUnitPrice } from '@/features/bim-suite/types/bim.types';
import { readAllRows } from '../lib/readAllRows';
import { BimCostService } from '../services/BimCostService';
interface PriceSet {
  id: string;
  name: string;
  effective_date: string;
  source: string;
  tinh_thanh?: string | null;
  ky_cong_bo?: string | null;
  rows: BimUnitPrice[];
  created_at: string;
}
const db = supabase as any;
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const BimPriceVersions: React.FC<{
  projectId: string;
  prices: BimUnitPrice[];
  canEdit?: boolean;
}> = ({ projectId, prices, canEdit }) => {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['bim-price-sets', projectId],
    queryFn: () =>
      readAllRows<PriceSet>((from, to, count) =>
        db
          .from('bim_unit_price_sets')
          .select('*', count ? { count: 'exact' } : undefined)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
  });
  const [name, setName] = useState('Bảng đơn giá'),
    [source, setSource] = useState(''),
    [date, setDate] = useState(localDate),
    [province, setProvince] = useState(''),
    [period, setPeriod] = useState(''),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const edition = query.data?.find((s) => s.id === selected),
    cls = 'w-full border rounded p-1 bg-white dark:bg-slate-900';
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await db
        .from('bim_unit_price_sets')
        .insert({
          project_id: projectId,
          name: name.trim(),
          effective_date: date,
          source: source.trim(),
          rows: prices,
          // Đơn giá theo tỉnh và kỳ công bố (migration 20261023110000); chỉ gửi khi có nhập.
          ...(province.trim() ? { tinh_thanh: province.trim() } : {}),
          ...(period.trim() ? { ky_cong_bo: period.trim() } : {}),
        })
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      await query.refetch();
      setSelected(result.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được bảng giá');
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!edition) return;
    setBusy(true);
    setError(null);
    try {
      await BimCostService.importPrices(
        projectId,
        edition.rows.map(({ id: _id, created_at: _at, updated_at: _updated, ...price }) => price),
      );
      await cache.invalidateQueries({ queryKey: ['bim-unit-prices', projectId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không áp dụng được bảng giá');
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    if (!edition) return;
    const lines = [
      ['Dự án', projectId],
      ['Phiên bản', edition.id, edition.name],
      ['Ngày hiệu lực', edition.effective_date],
      ['Nguồn', edition.source],
      ['Tỉnh/thành', edition.tinh_thanh || ''],
      ['Kỳ công bố', edition.ky_cong_bo || ''],
      ['Loại IFC', 'Vật liệu', 'Đơn vị', 'Đơn giá VND', 'Mã định mức'],
      ...edition.rows.map((r) => [r.loai_cau_kien, r.vat_lieu || '', r.don_vi, r.don_gia, r.ma_dinh_muc || '']),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ['\uFEFF' + lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `don-gia-${edition.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="my-2 border rounded-lg p-2 text-2xs">
      <summary className="font-semibold cursor-pointer">
        Phiên bản đơn giá & ngày hiệu lực ({query.data?.length ?? 0})
      </summary>
      {query.isLoading ? (
        <p>Đang tải bảng giá…</p>
      ) : query.error ? (
        <p role="alert">
          {query.error.message}
          <button onClick={() => void query.refetch()}>Thử lại</button>
        </p>
      ) : (
        <div className="space-y-2 pt-2">
          {canEdit && (
            <>
              <BimInput
                aria-label="Tên phiên bản đơn giá"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cls}
              />
              <BimInput
                aria-label="Nguồn đơn giá"
                placeholder="Nguồn / quyết định / tệp đơn giá đã xác nhận"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={cls}
              />
              <div className="grid grid-cols-2 gap-1">
                <BimInput
                  aria-label="Tỉnh, thành phố của đơn giá"
                  placeholder="Tỉnh/thành (VD: Hà Nội)"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className={cls}
                />
                <BimInput
                  aria-label="Kỳ công bố đơn giá"
                  placeholder="Kỳ công bố (VD: Quý III/2026)"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className={cls}
                />
              </div>
              <label>
                Ngày hiệu lực
                <BimInput
                  aria-label="Ngày hiệu lực đơn giá"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cls}
                />
              </label>
              <button
                disabled={busy || !prices.length || !name.trim() || !source.trim() || !date}
                onClick={() => void save()}
                className="text-primary-600 disabled:opacity-50"
              >
                Lưu bản chốt {prices.length} đơn giá hiện tại
              </button>
            </>
          )}
          <BimSelect
            aria-label="Phiên bản đơn giá đã lưu"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={cls}
          >
            <option value="">Chọn bảng giá</option>
            {query.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · hiệu lực {s.effective_date}
                {s.tinh_thanh ? ` · ${s.tinh_thanh}` : ''}
                {s.ky_cong_bo ? ` · ${s.ky_cong_bo}` : ''}
              </option>
            ))}
          </BimSelect>
          {edition && (
            <>
              <p>
                {edition.source} · {edition.rows.length} đơn giá · chốt{' '}
                {formatDateTime(new Date(edition.created_at))}
              </p>
              <button onClick={exportCsv} className="text-primary-600">
                Xuất bảng giá CSV
              </button>
              {canEdit && (
                <>
                  <p>
                    Áp dụng sẽ cập nhật các khóa loại/vật liệu/đơn vị trong bản chốt; các khóa khác giữ nguyên. Dự toán
                    đã lưu giữ nguyên giá tại thời điểm chốt.
                  </p>
                  <button
                    disabled={busy || edition.effective_date > localDate()}
                    onClick={() => void apply()}
                    className="text-primary-600 disabled:opacity-50"
                  >
                    Áp dụng bảng giá vào dữ liệu hiện tại
                  </button>
                </>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-rose-600">
              {error}
            </p>
          )}
        </div>
      )}
    </details>
  );
};
