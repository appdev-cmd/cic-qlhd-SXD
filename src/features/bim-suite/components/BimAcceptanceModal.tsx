import {BimOverlay} from '@/features/bim-suite/adapters/controls';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimAcceptanceModal.tsx
// Tra cứu & lập biên bản nghiệm thu (BBNT) gắn với cấu kiện BIM 3D (Mục 14 CV 3219)

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ClipboardCheck, CheckCircle2, AlertCircle, Calendar, MapPin, FileText, Plus, Loader2 } from 'lucide-react';
import { useBimAcceptanceRecords, useCreateBimAcceptance, useAddBimLinks } from '../hooks/useBim';
import { formatDate } from '@/features/bim-suite/adapters/utils';

interface BimAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  guid: string;
  elementName?: string;
  projectId: string;
  workId?: string;
  modelId?: string;
  canEdit?: boolean;
  currentUserName?: string;
  /** Nghiệm thu theo nhóm: các GUID còn lại cùng được gắn vào biên bản */
  extraGuids?: string[];
  groupElements?: { modelId: string; guid: string }[];
}

const CAP_LABEL: Record<string, string> = {
  cong_viec: 'Nghiệm thu công việc',
  giai_doan: 'Nghiệm thu giai đoạn',
  hoan_thanh: 'Nghiệm thu hoàn thành',
};

const inputCls =
  'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';

export const BimAcceptanceModal: React.FC<BimAcceptanceModalProps> = ({
  isOpen,
  onClose,
  guid,
  elementName,
  projectId,
  workId,
  modelId,
  canEdit = false,
  currentUserName,
  extraGuids,
  groupElements,
}) => {
  const groupGuids = [...new Set([guid, ...(extraGuids || [])].filter(Boolean))];
  const isGroup = groupGuids.length > 1;
  const { data: records = [], isLoading } = useBimAcceptanceRecords(guid);
  const createMutation = useCreateBimAcceptance(projectId);
  const addLinks = useAddBimLinks(projectId);
  const savedRecord = useRef<{ ma_nghiem_thu: string; ten_nghiem_thu: string } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    cap_nghiem_thu: 'cong_viec',
    ten_nghiem_thu: elementName
      ? `${elementName.startsWith('Nghiệm thu ') ? '' : 'Nghiệm thu '}${elementName}${(extraGuids?.length || 0) > 0 ? ` và ${extraGuids!.length} cấu kiện khác` : ''}`
      : '',
    ngay_nghiem_thu: new Date().toISOString().split('T')[0],
    dia_diem: '',
    ket_luan: '',
    noi_dung_danh_gia: '',
  });

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !form.ten_nghiem_thu.trim()) return;
    setSubmitError('');
    try {
      const record =
        savedRecord.current ||
        (await createMutation.mutateAsync({
          ma_du_an: projectId,
          ma_hang_muc: workId || null,
          cap_nghiem_thu: form.cap_nghiem_thu,
          ten_nghiem_thu: form.ten_nghiem_thu.trim(),
          ngay_nghiem_thu: form.ngay_nghiem_thu || null,
          dia_diem: form.dia_diem || null,
          ket_luan: form.ket_luan || null,
          noi_dung_danh_gia: form.noi_dung_danh_gia || null,
          bim_guid: guid,
          bim_model_id: modelId || null,
          tao_boi: currentUserName || null,
        }));
      if (record?.ma_nghiem_thu) {
        savedRecord.current = record;
        // Nghiệm thu nhóm: gắn biên bản cho toàn bộ cấu kiện đang chọn
        await addLinks.mutateAsync(
          (groupElements?.length ? groupElements : groupGuids.map((g) => ({ guid: g, modelId: modelId || '' }))).map(
            (element) => ({
              project_id: projectId,
              model_id: element.modelId || null,
              global_id: element.guid,
              loai_doi_tuong: 'nghiem_thu' as const,
              doi_tuong_id: String(record.ma_nghiem_thu),
              ten_hien_thi: record.ten_nghiem_thu,
              created_by: currentUserName || null,
            }),
          ),
        );
      }
      setCreating(false);
      savedRecord.current = null;
    } catch (error) {
      setSubmitError(
        `${savedRecord.current ? 'Biên bản đã được tạo; bấm lưu để thử gắn lại cấu kiện. ' : ''}${error instanceof Error ? error.message : 'Không lưu được biên bản.'}`,
      );
    }
  };

  return createPortal(
    <BimOverlay onClose={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isGroup ? `Nghiệm thu nhóm ${groupGuids.length} cấu kiện` : 'Hồ sơ nghiệm thu cấu kiện'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {elementName || 'Cấu kiện'} · <span className="font-mono">{guid}</span>
                {isGroup && (
                  <span className="ml-1 text-violet-600 dark:text-violet-400">
                    +{groupGuids.length - 1} cấu kiện khác
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          {creating && (
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950 space-y-3 text-xs"
            >
              <p className="font-bold text-slate-800 dark:text-slate-100">
                {isGroup
                  ? `Lập biên bản nghiệm thu cho ${groupGuids.length} cấu kiện đang chọn`
                  : 'Lập biên bản nghiệm thu mới cho cấu kiện'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Cấp nghiệm thu</span>
                  <BimSelect
                    value={form.cap_nghiem_thu}
                    onChange={(e) => setForm({ ...form, cap_nghiem_thu: e.target.value })}
                    className={inputCls}
                  >
                    {Object.entries(CAP_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </BimSelect>
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Ngày nghiệm thu</span>
                  <BimInput
                    type="date"
                    value={form.ngay_nghiem_thu}
                    onChange={(e) => setForm({ ...form, ngay_nghiem_thu: e.target.value })}
                    className={inputCls}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Tên biên bản *</span>
                <BimInput
                  required
                  value={form.ten_nghiem_thu}
                  onChange={(e) => setForm({ ...form, ten_nghiem_thu: e.target.value })}
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Địa điểm / lý trình</span>
                  <BimInput
                    value={form.dia_diem}
                    onChange={(e) => setForm({ ...form, dia_diem: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Kết luận</span>
                  <BimSelect
                    value={form.ket_luan}
                    onChange={(e) => setForm({ ...form, ket_luan: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Chờ nghiệm thu</option>
                    <option value="dat">Đạt</option>
                    <option value="dat_co_dieu_kien">Đạt có điều kiện</option>
                    <option value="khong_dat">Không đạt</option>
                  </BimSelect>
                </label>
              </div>
              <label className="block space-y-1">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Nội dung đánh giá</span>
                <textarea
                  rows={3}
                  value={form.noi_dung_danh_gia}
                  onChange={(e) => setForm({ ...form, noi_dung_danh_gia: e.target.value })}
                  className={inputCls}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                >
                  Hủy
                </button>
                {submitError && (
                  <p role="alert" className="text-xs text-rose-600">
                    {submitError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={createMutation.isPending || addLinks.isPending}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 disabled:opacity-60 dark:bg-emerald-600"
                >
                  {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Lưu biên bản
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Đang tải danh sách biên bản nghiệm thu...</div>
          ) : records.length === 0 && !creating ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Chưa có biên bản nghiệm thu gắn với cấu kiện này</p>
              <p className="text-xs mt-1">
                Lập biên bản ngay tại đây hoặc gán mã GUID khi lập biên bản ở tab Thi công.
              </p>
            </div>
          ) : (
            records.map((rec: any) => (
              <div
                key={rec.ma_nghiem_thu}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300">
                    {CAP_LABEL[rec.cap_nghiem_thu] || 'Nghiệm thu'}
                  </span>
                  {rec.ket_luan === 'dat' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đạt yêu cầu
                    </span>
                  )}
                  {rec.ket_luan === 'dat_co_dieu_kien' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-md">
                      <AlertCircle className="w-3.5 h-3.5" /> Đạt có điều kiện
                    </span>
                  )}
                  {rec.ket_luan === 'khong_dat' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded-md">
                      <AlertCircle className="w-3.5 h-3.5" /> Không đạt
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-2">{rec.ten_nghiem_thu}</h4>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200/50 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Ngày NT:{' '}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {rec.ngay_nghiem_thu ? formatDate(rec.ngay_nghiem_thu) : '-'}
                      </strong>
                    </span>
                  </div>
                  {rec.dia_diem && (
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{rec.dia_diem}</span>
                    </div>
                  )}
                </div>
                {rec.noi_dung_danh_gia && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                    <strong>Nội dung:</strong> {rec.noi_dung_danh_gia}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tổng số: <strong>{records.length}</strong> biên bản
          </span>
          <div className="flex gap-2">
            {canEdit && !creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium dark:bg-emerald-600"
              >
                <Plus className="w-3.5 h-3.5" /> Lập biên bản mới
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </BimOverlay>,
    document.body,
  );
};
