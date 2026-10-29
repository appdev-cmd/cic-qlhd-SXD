import { BimOverlay } from '@/features/bim-suite/adapters/controls';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimUploadModal.tsx
// Hộp thoại tải lên nhiều mô hình IFC/IFCzip cùng lúc (mỗi file ≤ 500MB).
// Mỗi file được tự động: nhận diện bộ môn (tên file + thống kê cấu kiện IFC), phát hiện trùng với mô hình
// đã có trong dự án, và gợi ý "phiên bản mới của" mô hình cùng tên.

import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_NAMING_TEMPLATE, checkCdeName } from '../lib/cdeNaming';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  UploadCloud,
  FileBox,
  AlertCircle,
  CheckCircle2,
  Loader2,
  TrainTrack,
  Sparkles,
  Trash2,
  Copy,
  History,
} from 'lucide-react';
import { BimDiscipline, BimModel } from '@/features/bim-suite/types/bim.types';
import { disciplineLabels } from '../lib/ifcLabels';
import { BimService } from '../services/BimService';
import { detectDiscipline, DisciplineDetection, matchExistingModel } from '../lib/detectDiscipline';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { UploadProgress } from '../lib/bimUpload';

interface BimUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  workId?: string;
  onSuccess?: () => void;
  /** Các mô hình hiện có (để chọn "phiên bản mới của") */
  existingModels?: BimModel[];
  /** Mặc định chọn mô hình này làm phiên bản trước (áp cho file đầu tiên) */
  defaultPreviousModelId?: string | null;
  uploadedBy?: string;
}

type TrangThai = 'phan_tich' | 'san_sang' | 'trung' | 'dang_tai' | 'xong' | 'loi';

interface FileItem {
  id: string;
  file: File;
  trangThai: TrangThai;
  detection: DisciplineDetection | null;
  discipline: BimDiscipline;
  /** Người dùng đã tự chọn bộ môn → không ghi đè bằng kết quả nhận diện */
  tuChon: boolean;
  previousModelId: string;
  /** Gợi ý phiên bản trước từ tên file (để hiển thị lý do) */
  goiYPhienBan: boolean;
  versionNote: string;
  trungVoi?: string;
  /** SHA-256 đầy đủ (worker) — máy chủ chống trùng theo giá trị này */
  hash?: string;
  /** Tiến độ bước hiện tại: băm, nén, tải lên (tiếp tục được), tạo bản ghi */
  tienDo?: UploadProgress;
  loi?: string;
}

const PHASE_LABEL: Record<UploadProgress['phase'], string> = {
  hash: 'Đang băm kiểm tra trùng',
  zip: 'Đang nén trong nền',
  upload: 'Đang tải lên',
  register: 'Đang tạo bản ghi',
  convert: 'Đang chuyển đổi 3D (.frag) & trích xuất cấu kiện',
  cleanup: 'Đang dọn tệp lỗi',
};

const MAX_SIZE = 500 * 1024 * 1024;
const PHAN_TICH_DONG_THOI = 2;

const mb = (n: number) => formatNumber(n / 1024 / 1024, 1);

const CHIP: Record<TrangThai, { label: string; cls: string }> = {
  phan_tich: { label: 'Đang phân tích', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  san_sang: { label: 'Sẵn sàng', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  trung: { label: 'Đã có trong dự án', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  dang_tai: {
    label: 'Đang nén & tải lên',
    cls: 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300',
  },
  xong: { label: 'Đã tải lên', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  loi: { label: 'Lỗi', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

export const BimUploadModal: React.FC<BimUploadModalProps> = ({
  isOpen,
  onClose,
  projectId,
  workId,
  onSuccess,
  existingModels = [],
  defaultPreviousModelId = null,
  uploadedBy,
}) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [items, setItems] = useState<FileItem[]>([]);
  // Tiêu chuẩn đặt tên riêng của dự án thuộc hồ sơ BIM dự án (giai đoạn B4); tạm dùng mẫu mặc định ISO 19650.
  const bimProfile = null as { tieu_chuan_dat_ten?: string | null } | null;
  const nonStandardNames = items.filter((it) =>
    checkCdeName(it.file.name.replace(/\.(ifc|ifczip|zip)$/i, ''), bimProfile?.tieu_chuan_dat_ten),
  ).length;
  const [dragActive, setDragActive] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [thongBao, setThongBao] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const hangDoiRef = useRef<string[]>([]);
  const dangChayRef = useRef(0);
  const itemsRef = useRef<FileItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  itemsRef.current = items;

  useEffect(() => {
    if (isOpen) {
      setItems([]);
      setThongBao([]);
      hangDoiRef.current = [];
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const capNhat = (id: string, patch: Partial<FileItem> | ((it: FileItem) => Partial<FileItem>)) =>
    setItems((ds) =>
      ds.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)),
    );

  // ── Phân tích từng file: nhận diện bộ môn, kiểm tra trùng, gợi ý phiên bản ──────────────
  const phanTich = async (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    let hash: string | undefined;
    const [detection, trung] = await Promise.all([
      detectDiscipline(it.file).catch(() => null),
      BimService.fileFingerprint(it.file, (p) => capNhat(id, { tienDo: p }))
        .then((fp) => {
          hash = fp;
          return BimService.findDuplicateModel(projectId, fp);
        })
        .catch(() => null),
    ]);
    capNhat(id, (cur) => ({
      detection,
      hash,
      tienDo: undefined,
      discipline: cur.tuChon || cur.previousModelId || !detection ? cur.discipline : detection.discipline,
      trungVoi: trung ? `${trung.file_name} (v${trung.phien_ban ?? 1})` : undefined,
      trangThai: trung ? 'trung' : 'san_sang',
    }));
  };

  const chayHangDoi = () => {
    while (dangChayRef.current < PHAN_TICH_DONG_THOI && hangDoiRef.current.length) {
      const id = hangDoiRef.current.shift()!;
      dangChayRef.current++;
      phanTich(id).finally(() => {
        dangChayRef.current--;
        chayHangDoi();
      });
    }
  };

  const themFile = (files: FileList | File[]) => {
    const loi: string[] = [];
    const moi: FileItem[] = [];
    const daCo = new Set(itemsRef.current.map((x) => `${x.file.name}|${x.file.size}`));
    Array.from(files).forEach((file, i) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'ifc' && ext !== 'ifczip' && ext !== 'zip') {
        loi.push(`${file.name}: chỉ nhận định dạng .ifc, .ifczip hoặc .zip`);
        return;
      }
      if (file.size > MAX_SIZE) {
        loi.push(`${file.name}: ${mb(file.size)} MB vượt giới hạn 500 MB`);
        return;
      }
      const khoa = `${file.name}|${file.size}`;
      if (daCo.has(khoa)) {
        loi.push(`${file.name}: đã có trong danh sách`);
        return;
      }
      daCo.add(khoa);

      // Gợi ý phiên bản: nút "tải phiên bản mới" (file đầu) hoặc trùng tên với mô hình đã có
      const macDinh =
        itemsRef.current.length === 0 && i === 0 && defaultPreviousModelId
          ? existingModels.find((m) => m.id === defaultPreviousModelId) || null
          : null;
      const khopTen = macDinh ? null : matchExistingModel(file.name, existingModels);
      const truoc = macDinh || khopTen;
      moi.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        trangThai: 'phan_tich',
        detection: null,
        discipline: truoc?.discipline || 'TOAN_THE',
        tuChon: false,
        previousModelId: truoc?.id || '',
        goiYPhienBan: !!khopTen,
        versionNote: '',
      });
    });
    setThongBao(loi);
    if (!moi.length) return;
    itemsRef.current = [...itemsRef.current, ...moi];
    setItems(itemsRef.current);
    hangDoiRef.current.push(...moi.map((x) => x.id));
    chayHangDoi();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!dangTai && e.dataTransfer.files?.length) themFile(e.dataTransfer.files);
  };

  // ── Tải lên lần lượt (tránh nén nhiều file lớn cùng lúc làm tràn bộ nhớ trình duyệt) ───
  // Tệp trùng (cùng SHA-256 với mô hình chưa xóa) bị máy chủ từ chối nên không đưa vào hàng tải.
  const canTai = items.filter((x) => x.trangThai === 'san_sang' || x.trangThai === 'loi');
  const dangPhanTich = items.some((x) => x.trangThai === 'phan_tich');

  const handleUpload = async () => {
    if (!canTai.length || dangTai) return;
    setDangTai(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let ok = 0;
    let hong = 0;
    for (const it of canTai) {
      if (controller.signal.aborted) break;
      capNhat(it.id, { trangThai: 'dang_tai', loi: undefined, tienDo: undefined });
      const truoc = existingModels.find((m) => m.id === it.previousModelId) || null;
      try {
        await BimService.uploadModel(projectId, it.file, it.discipline, workId, {
          uploadedBy,
          previousModel: truoc,
          versionNote: it.versionNote.trim() || undefined,
          fileHash: it.hash,
          signal: controller.signal,
          onProgress: (p) => capNhat(it.id, { tienDo: p }),
        });
        capNhat(it.id, { trangThai: 'xong', tienDo: undefined });
        ok++;
      } catch (err: any) {
        capNhat(it.id, {
          trangThai: 'loi',
          tienDo: undefined,
          loi:
            err?.name === 'AbortError'
              ? 'Đã dừng; chọn lại để tiếp tục từ phần đã tải.'
              : err?.message || 'Không tải lên được',
        });
        hong++;
      }
    }
    setDangTai(false);
    abortRef.current = null;
    queryClient.invalidateQueries({ queryKey: ['bim-models', projectId] });
    if (ok) {
      addToast({
        title: `Đã tải lên & chuyển đổi ${ok} mô hình`,
        message: hong
          ? `${hong} file lỗi — xem chi tiết trong danh sách.`
          : 'Mô hình 3D (.frag) và cấu kiện đã sẵn sàng hiển thị.',
        type: hong ? 'warning' : 'success',
      });
      onSuccess?.();
    } else if (hong) {
      addToast({
        title: 'Tải lên thất bại',
        message: `${hong} file lỗi — xem chi tiết trong danh sách.`,
        type: 'error',
      });
    }
    if (ok && !hong) onClose();
  };

  const tongDungLuong = items.reduce((s, x) => s + x.file.size, 0);
  const nhom = items.reduce<Record<string, number>>((acc, x) => {
    acc[x.discipline] = (acc[x.discipline] || 0) + 1;
    return acc;
  }, {});

  return (
    <BimOverlay onClose={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400">
              <TrainTrack className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Tải lên mô hình BIM (IFC)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chọn một hoặc nhiều file — hệ thống tự nhận diện bộ môn cho từng file
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={dangTai}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            data-tooltip="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm overflow-y-auto">
          {/* Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl text-center transition-all ${items.length ? 'p-4' : 'p-7'} ${
              dragActive
                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-900'
            }`}
          >
            <BimInput
              ref={inputRef}
              type="file"
              id="ifc-upload"
              accept=".ifc,.ifczip,.zip"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) themFile(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
              disabled={dangTai}
            />
            <label
              htmlFor="ifc-upload"
              className={`block ${dangTai ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <UploadCloud className={`${items.length ? 'w-7 h-7' : 'w-10 h-10'} mx-auto text-primary-500 mb-1.5`} />
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                Kéo thả các file IFC vào đây hoặc{' '}
                <span className="text-primary-600 dark:text-primary-400 hover:underline">chọn từ máy tính</span>
              </p>
              <p className="text-2xs text-slate-400 mt-1">
                Chọn được nhiều file một lúc · .ifc, .ifczip · tối đa 500 MB mỗi file
              </p>
            </label>
          </div>

          {thongBao.length > 0 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 space-y-0.5">
              {thongBao.map((t) => (
                <p key={t} className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {t}
                </p>
              ))}
            </div>
          )}

          {/* Danh sách file */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {items.length} file · {mb(tongDungLuong)} MB
                </span>
                {Object.entries(nhom).map(([d, n]) => (
                  <span key={d} className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700">
                    {disciplineLabels[d] || d}: {n}
                  </span>
                ))}
                {dangPhanTich && (
                  <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Đang nhận diện bộ môn...
                  </span>
                )}
              </div>

              {items.map((it) => {
                const truoc = existingModels.find((m) => m.id === it.previousModelId) || null;
                const khoa = dangTai || it.trangThai === 'xong' || it.trangThai === 'dang_tai';
                const chip = CHIP[it.trangThai];
                return (
                  <div
                    key={it.id}
                    className={`p-3 rounded-xl border ${
                      it.trangThai === 'loi'
                        ? 'border-rose-200 dark:border-rose-900'
                        : it.trangThai === 'trung'
                          ? 'border-amber-200 dark:border-amber-900'
                          : 'border-slate-200 dark:border-slate-700'
                    } bg-white dark:bg-slate-900`}
                  >
                    <div className="flex items-start gap-2.5">
                      <FileBox className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate"
                            data-tooltip={it.file.name}
                          >
                            {it.file.name}
                          </p>
                          <span className="text-2xs text-slate-400 shrink-0">{mb(it.file.size)} MB</span>
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block">
                            <span className="block text-2xs uppercase tracking-wide text-slate-400 mb-0.5">Bộ môn</span>
                            <BimSelect
                              value={it.discipline}
                              disabled={khoa || !!truoc}
                              data-tooltip={truoc ? 'Phiên bản mới giữ bộ môn của mô hình gốc' : undefined}
                              onChange={(e) =>
                                capNhat(it.id, { discipline: e.target.value as BimDiscipline, tuChon: true })
                              }
                              className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 disabled:opacity-60"
                            >
                              {Object.entries(disciplineLabels).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </BimSelect>
                          </label>
                          <label className="block">
                            <span className="block text-2xs uppercase tracking-wide text-slate-400 mb-0.5">
                              Loại tải lên
                            </span>
                            <BimSelect
                              value={it.previousModelId}
                              disabled={khoa}
                              onChange={(e) => {
                                const m = existingModels.find((x) => x.id === e.target.value);
                                capNhat(it.id, (cur) => ({
                                  previousModelId: e.target.value,
                                  goiYPhienBan: false,
                                  discipline: m
                                    ? m.discipline
                                    : cur.tuChon || !cur.detection
                                      ? cur.discipline
                                      : cur.detection.discipline,
                                }));
                              }}
                              className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 disabled:opacity-60"
                            >
                              <option value="">Mô hình mới</option>
                              {existingModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  Phiên bản mới của: {m.file_name} (v{m.phien_ban ?? 1})
                                </option>
                              ))}
                            </BimSelect>
                          </label>
                        </div>

                        {/* Kết quả nhận diện / gợi ý */}
                        {it.trangThai === 'phan_tich' ? (
                          <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Đang đọc nội dung file để nhận diện bộ môn...
                          </p>
                        ) : truoc ? (
                          <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-violet-600 dark:text-violet-400">
                            <History className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>
                              {it.goiYPhienBan ? 'Trùng tên với mô hình đã có — ' : ''}sẽ lưu thành v
                              {(truoc.phien_ban ?? 1) + 1} của “{truoc.file_name}”, giữ bộ môn{' '}
                              {disciplineLabels[truoc.discipline] || truoc.discipline}.
                            </span>
                          </p>
                        ) : it.detection ? (
                          <p
                            className={`mt-1.5 flex items-start gap-1.5 text-2xs ${it.detection.discipline === it.discipline ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500'}`}
                          >
                            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>
                              Tự nhận diện: <strong>{disciplineLabels[it.detection.discipline]}</strong>
                              {it.detection.system ? ` – ${it.detection.system}` : ''} (
                              {Math.round(it.detection.confidence * 100)}%) · {it.detection.reason}
                              {it.detection.discipline !== it.discipline && !khoa && (
                                <button
                                  type="button"
                                  className="ml-1 text-primary-600 dark:text-primary-400 hover:underline"
                                  onClick={() =>
                                    capNhat(it.id, { discipline: it.detection!.discipline, tuChon: false })
                                  }
                                >
                                  Dùng gợi ý
                                </button>
                              )}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1.5 text-2xs text-slate-400">
                            Không nhận diện được bộ môn từ file, vui lòng chọn thủ công.
                          </p>
                        )}

                        {truoc && !khoa && (
                          <BimInput
                            value={it.versionNote}
                            onChange={(e) => capNhat(it.id, { versionNote: e.target.value })}
                            placeholder="Ghi chú thay đổi của phiên bản (VD: cập nhật theo thiết kế BVTC điều chỉnh)"
                            className="mt-1.5 w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                          />
                        )}

                        {it.trangThai === 'trung' && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-amber-700 dark:text-amber-400">
                            <Copy className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>
                              File giống hệt mô hình đã tải: {it.trungVoi}. Máy chủ không nhận tệp trùng; hãy xóa mô
                              hình cũ nếu muốn tải lại.
                            </span>
                          </p>
                        )}
                        {it.tienDo && (it.trangThai === 'dang_tai' || it.trangThai === 'phan_tich') && (
                          <div
                            className="mt-1.5"
                            role="progressbar"
                            aria-label={`Tiến độ ${it.file.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(it.tienDo.percent)}
                          >
                            <div className="flex justify-between text-2xs text-slate-500">
                              <span>{it.tienDo.message || PHASE_LABEL[it.tienDo.phase]}</span>
                              <span className="tabular-nums">
                                {it.tienDo.bytesTotal
                                  ? `${mb(it.tienDo.bytesSent || 0)}/${mb(it.tienDo.bytesTotal)} MB · `
                                  : ''}
                                {Math.round(it.tienDo.percent)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div
                                className="h-full bg-primary-500 transition-[width]"
                                style={{ width: `${Math.min(100, Math.max(0, it.tienDo.percent))}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {it.trangThai === 'loi' && it.loi && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {it.loi}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-2xs font-semibold flex items-center gap-1 ${chip.cls}`}
                        >
                          {it.trangThai === 'dang_tai' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {it.trangThai === 'xong' && <CheckCircle2 className="w-3 h-3" />}
                          {chip.label}
                        </span>
                        {!khoa && (
                          <button
                            type="button"
                            onClick={() => {
                              hangDoiRef.current = hangDoiRef.current.filter((x) => x !== it.id);
                              setItems((ds) => ds.filter((x) => x.id !== it.id));
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            data-tooltip="Bỏ file này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {nonStandardNames > 0 && (
            <p
              role="status"
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-2xs text-amber-800 dark:text-amber-200"
            >
              {nonStandardNames} tệp chưa đặt tên theo tiêu chuẩn (
              {bimProfile?.tieu_chuan_dat_ten || DEFAULT_NAMING_TEMPLATE}). Mô hình vẫn tải lên vùng WIP; cần đặt lại
              tên trong Quản lý BIM → Kho mô hình &amp; CDE trước khi chia sẻ.
            </p>
          )}
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-2xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>
              <strong>Lưu ý:</strong> Các file được băm, nén (chạy nền, không đứng trình duyệt) và tải lên lần lượt theo
              từng khúc 6 MB; mất mạng thì tự thử lại, đóng trang rồi chọn lại cùng file sẽ tiếp tục phần đã tải. Sau
              khi tải, máy chủ tự chuyển đổi hình học mô hình sang định dạng xem nhanh và bóc tách cấu kiện, khối lượng
              — mất từ vài chục giây tới vài phút mỗi mô hình.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-2xs text-slate-500 dark:text-slate-400">
            {items.length > 0 && `${canTai.length}/${items.length} file sẽ được tải lên`}
          </span>
          <div className="flex items-center gap-2">
            {dangTai && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="px-4 py-2 border border-rose-200 text-rose-600 rounded-xl text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                Dừng tải
              </button>
            )}
            <button
              onClick={onClose}
              disabled={dangTai}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
            >
              {items.some((x) => x.trangThai === 'xong') ? 'Đóng' : 'Hủy'}
            </button>
            <button
              onClick={handleUpload}
              disabled={!canTai.length || dangTai || dangPhanTich}
              className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              data-tooltip={dangPhanTich ? 'Chờ nhận diện xong bộ môn của các file' : undefined}
            >
              {dangTai && <Loader2 className="w-4 h-4 animate-spin" />}
              {dangTai
                ? 'Đang tải lên...'
                : canTai.length && canTai.every((x) => x.trangThai === 'loi')
                  ? `Thử lại ${canTai.length} file lỗi`
                  : canTai.length > 1
                    ? `Tải lên ${canTai.length} mô hình`
                    : 'Bắt đầu chuyển đổi'}
            </button>
          </div>
        </div>
      </div>
    </BimOverlay>
  );
};
