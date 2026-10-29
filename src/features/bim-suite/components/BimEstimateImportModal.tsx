import {BimOverlay} from '@/features/bim-suite/adapters/controls';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimEstimateImportModal.tsx
// Nhập đơn giá 5D từ file dự toán Excel: đọc bảng, gợi ý ánh xạ loại cấu kiện (theo quy tắc; AI ở giai đoạn sau), người dùng xác nhận.

import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileSpreadsheet, Upload, Sparkles, Loader2, Check } from 'lucide-react';
import { BimQuantitySummaryRow, BimUnitPrice } from '@/features/bim-suite/types/bim.types';
import { EstimateRow, parseEstimateSheetDetailed } from '../lib/estimateImport';
import { getIfcLabel } from '../lib/ifcLabels';
import { BIM_AI_ENABLED, suggestCostMapping } from '@/features/bim-suite/adapters/ai';
import { readFirstSheet } from '../lib/xlsxRead';
import { BimCostService } from '../services/BimCostService';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  projectId: string;
  quantities: BimQuantitySummaryRow[];
  prices: BimUnitPrice[];
  onClose: () => void;
}

export const BimEstimateImportModal: React.FC<Props> = ({ projectId, quantities, prices, onClose }) => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<{ row: number; reason: string }[]>([]);
  const [rows, setRows] = useState<EstimateRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => {
    const map = new Map<string, { soLuong: number; vatLieu: Set<string> }>();
    quantities.forEach((q) => {
      const c = map.get(q.loai_cau_kien) || { soLuong: 0, vatLieu: new Set<string>() };
      c.soLuong += q.so_luong;
      if (q.vat_lieu) c.vatLieu.add(q.vat_lieu);
      map.set(q.loai_cau_kien, c);
    });
    return [...map.entries()].sort((a, b) => b[1].soLuong - a[1].soLuong);
  }, [quantities]);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const data = await readFirstSheet(file);
      const result = parseEstimateSheetDetailed(
        data as unknown[][],
        categories.map(([c]) => c),
      );
      const parsed: EstimateRow[] = result.rows;
      setRejected(result.rejected);
      if (!parsed.length) throw new Error('Không tìm thấy bảng dự toán có cột Nội dung công việc / Đơn vị / Đơn giá.');
      setRows(parsed);
      setPicked(new Set(parsed.filter((r) => r.loai_cau_kien && r.don_vi).map((r) => r.index)));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file');
    }
  };

  const update = (index: number, patch: Partial<EstimateRow>) =>
    setRows((prev) => prev?.map((r) => (r.index === index ? { ...r, ...patch, nguon_goi_y: 'tay' } : r)) ?? prev);

  const aiSuggest = async () => {
    if (!rows) return;
    const pending = rows.filter((r) => r.don_vi && !r.loai_cau_kien).slice(0, 80);
    if (!pending.length) {
      addToast({ type: 'info', message: 'Mọi dòng đã có gợi ý ánh xạ.' });
      return;
    }
    setAiBusy(true);
    try {
      const out = await suggestCostMapping(
        pending.map((r) => ({ index: r.index, maHieu: r.ma_hieu, ten: r.ten, donVi: r.don_vi_goc })),
        categories.map(([loai, c]) => ({ loai, soLuong: c.soLuong, vatLieu: [...c.vatLieu] })),
      );
      const valid = new Set(categories.map(([c]) => c));
      setRows(
        (prev) =>
          prev?.map((r) => {
            const s = out.find((o) => o.index === r.index);
            if (!s || !s.loai_cau_kien || !valid.has(s.loai_cau_kien)) return r;
            return {
              ...r,
              loai_cau_kien: s.loai_cau_kien,
              vat_lieu: s.vat_lieu,
              nguon_goi_y: 'ai',
              ly_do: `AI (${Math.round((s.do_tin_cay || 0) * 100)}%): ${s.ly_do}`,
            };
          }) ?? prev,
      );
      setPicked(
        (prev) =>
          new Set([...prev, ...out.filter((o) => o.loai_cau_kien && valid.has(o.loai_cau_kien)).map((o) => o.index)]),
      );
      addToast({
        type: 'success',
        message: `AI đã gợi ý ${out.filter((o) => o.loai_cau_kien).length}/${pending.length} dòng — kiểm tra lại trước khi nhập.`,
      });
    } catch (e) {
      addToast({ type: 'error', title: 'AI chưa gợi ý được', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!rows) return;
    const list = rows.filter((r) => picked.has(r.index) && r.loai_cau_kien && r.don_vi);
    const keys = new Set<string>();
    for (const row of list) {
      const key = [row.loai_cau_kien?.trim().toUpperCase(), (row.vat_lieu || '').trim().toLowerCase(), row.don_vi].join(
        '|',
      );
      if (keys.has(key)) {
        setError(`Trùng loại/vật liệu/đơn vị tại dòng ${row.index}. Bỏ chọn một trong các dòng trùng trước khi nhập.`);
        return;
      }
      keys.add(key);
      if (!Number.isFinite(row.don_gia) || row.don_gia < 0) {
        setError(`Đơn giá không hợp lệ tại dòng ${row.index}`);
        return;
      }
    }
    setSaving(true);
    try {
      const ok = await BimCostService.importPrices(
        projectId,
        list.map((r) => ({
          loai_cau_kien: r.loai_cau_kien!,
          vat_lieu: r.vat_lieu || null,
          ma_dinh_muc: r.ma_hieu || null,
          don_vi: r.don_vi!,
          don_gia: r.don_gia,
          ghi_chu: `Nhập từ ${fileName}: ${r.ten}`.slice(0, 500),
        })),
      );
      queryClient.invalidateQueries({ queryKey: ['bim-unit-prices', projectId] });
      addToast({ type: 'success', message: `Đã nhập ${ok} đơn giá vào bảng đơn giá dự án.` });
      onClose();
    } catch (e: any) {
      addToast({ type: 'error', message: `Chưa lưu dòng nào. Lỗi: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  const cell = 'px-1.5 py-1 border-b border-slate-100 dark:border-slate-700 align-top';

  return createPortal(
    <BimOverlay onClose={onClose}>
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 text-xs">
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Nhập đơn giá từ file dự toán Excel</h3>
            <p className="text-slate-500">
              Đọc cột Mã hiệu · Nội dung công việc · Đơn vị · Đơn giá, quy đổi đơn vị (100m² → m², tấn → kg) và ánh xạ
              sang loại cấu kiện trong mô hình.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 dark:bg-emerald-600"
          >
            <Upload className="w-3.5 h-3.5" /> Chọn file Excel dự toán
          </button>
          <BimInput
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) readFile(f);
            }}
          />
          {fileName && <span className="text-slate-500 truncate">{fileName}</span>}
          <span className="flex-1" />
          {rows && BIM_AI_ENABLED && (
            <button
              type="button"
              onClick={aiSuggest}
              disabled={aiBusy}
              className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 flex items-center gap-1.5 disabled:opacity-60"
            >
              {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI gợi
              ý các dòng chưa ánh xạ
            </button>
          )}
        </div>
        {rejected.length > 0 && (
          <details className="text-xs text-amber-700 p-2">
            <summary>{rejected.length} dòng bị loại trong sheet đã đọc</summary>
            {rejected.map((r) => (
              <p key={r.row}>
                Dòng {r.row}: {r.reason}
              </p>
            ))}
          </details>
        )}
        {error && <p className="px-4 py-2 text-rose-600">{error}</p>}

        <div className="flex-1 overflow-auto">
          {!rows ? (
            <p className="p-8 text-center text-slate-400">
              Chọn file dự toán (.xlsx) để bắt đầu. Mô hình hiện có {categories.length} loại cấu kiện có khối lượng.
            </p>
          ) : (
            <BimTable className="w-full">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500 text-left">
                <tr>
                  <th className={cell}>
                    <BimInput
                      type="checkbox"
                      className="accent-emerald-600"
                      checked={
                        picked.size > 0 && picked.size === rows.filter((r) => r.loai_cau_kien && r.don_vi).length
                      }
                      onChange={(e) =>
                        setPicked(
                          e.target.checked
                            ? new Set(rows.filter((r) => r.loai_cau_kien && r.don_vi).map((r) => r.index))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className={cell}>Mã hiệu</th>
                  <th className={cell}>Nội dung công việc</th>
                  <th className={cell}>Đơn vị</th>
                  <th className={`${cell} text-right`}>Đơn giá (quy đổi)</th>
                  <th className={cell}>Loại cấu kiện trong mô hình</th>
                  <th className={cell}>Lọc vật liệu</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className={picked.has(r.index) ? '' : 'opacity-60'}>
                    <td className={cell}>
                      <BimInput
                        type="checkbox"
                        className="accent-emerald-600"
                        disabled={!r.loai_cau_kien || !r.don_vi}
                        checked={picked.has(r.index)}
                        onChange={(e) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.index);
                            else next.delete(r.index);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className={`${cell} font-mono whitespace-nowrap`}>{r.ma_hieu}</td>
                    <td className={cell}>
                      <span className="block text-slate-800 dark:text-slate-100">{r.ten}</span>
                      {r.ly_do && (
                        <span
                          className={`block text-2xs ${r.nguon_goi_y === 'ai' ? 'text-violet-500' : 'text-slate-400'}`}
                        >
                          {r.ly_do}
                        </span>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {r.don_vi_goc}
                      {r.don_vi && r.don_vi_goc.replace(/\s/g, '').toLowerCase() !== r.don_vi && (
                        <span className="text-slate-400"> → {r.don_vi}</span>
                      )}
                    </td>
                    <td className={`${cell} text-right tabular-nums whitespace-nowrap`}>
                      {formatNumber(r.don_gia, 2)}
                    </td>
                    <td className={cell}>
                      <BimSelect
                        value={r.loai_cau_kien || ''}
                        disabled={!r.don_vi}
                        onChange={(e) => {
                          update(r.index, { loai_cau_kien: e.target.value || null });
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (e.target.value) next.add(r.index);
                            else next.delete(r.index);
                            return next;
                          });
                        }}
                        className="w-full max-w-[200px] px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="">— không lấy từ mô hình —</option>
                        {categories.map(([c, info]) => (
                          <option key={c} value={c}>
                            {getIfcLabel(c)} ({formatNumber(info.soLuong, 2)})
                          </option>
                        ))}
                      </BimSelect>
                    </td>
                    <td className={cell}>
                      <BimInput
                        value={r.vat_lieu || ''}
                        onChange={(e) => update(r.index, { vat_lieu: e.target.value || null })}
                        placeholder="mọi vật liệu"
                        className="w-24 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </BimTable>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <span className="flex-1 text-slate-500">
            {rows
              ? `${picked.size}/${rows.length} dòng sẽ được nhập (trùng loại + vật liệu + đơn vị sẽ ghi đè đơn giá cũ)`
              : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!picked.size || saving}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 dark:bg-emerald-600"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Nhập vào bảng đơn
            giá
          </button>
        </div>
      </div>
    </BimOverlay>,
    document.body,
  );
};
