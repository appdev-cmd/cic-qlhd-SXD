import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimSavedViewsPanel.tsx
// Góc nhìn lưu trữ: camera + mặt cắt + ẩn/cô lập + phép đo, dùng chung cho các bên tham gia dự án.
// Cập nhật góc nhìn (ghi đè trạng thái và ảnh), thẻ, sắp xếp, tìm kiếm và sao chép liên kết chia sẻ.

import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  X,
  Plus,
  Trash2,
  Loader2,
  Scissors,
  PenLine,
  RefreshCw,
  Link2,
  Tag,
  Ruler,
  Search,
  Check,
} from 'lucide-react';
import { BimMarkupEditor } from './BimMarkupEditor';
import { BimViewTour } from './BimViewTour';
import { BimSavedView, BimViewpoint } from '@/features/bim-suite/types/bim.types';
import { useBimSavedViews, useSaveBimView, useDeleteBimView } from '../hooks/useBim';
import { formatDate } from '@/features/bim-suite/adapters/utils';
import { useToast } from '@/features/bim-suite/adapters/toast';
import {
  SAVED_VIEW_SORTS,
  buildViewShareUrl,
  collectTags,
  filterViews,
  parseTags,
  sortViews,
  type SavedViewSort,
} from '../lib/savedViews';
import { updateSavedView, type SavedViewPatch } from '../lib/savedViewsApi';

interface BimSavedViewsPanelProps {
  projectId: string;
  modelId?: string;
  canEdit: boolean;
  currentUserName?: string;
  getViewpoint: () => BimViewpoint | null;
  captureThumbnail: () => string;
  onApply: (view: BimSavedView) => void | Promise<void>;
  /** Canvas khung 3D để quay video trình chiếu */
  getCanvas?: () => HTMLCanvasElement | null;
  onClose: () => void;
  /** Gốc của liên kết chia sẻ (mặc định window.location.origin) */
  shareOrigin?: string;
}

const shrink = async (src: string, width: number, quality: number) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, img.width);
  canvas.height = Math.round((img.height / img.width) * canvas.width) || Math.round(width * 0.56);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
};

/** Ảnh thu nhỏ: giảm kích thước để không phình CSDL */
const thumbnailOf = async (src: string | null | undefined) => {
  if (!src) return null;
  try {
    return await shrink(src, 240, 0.7);
  } catch {
    return null;
  }
};

export const BimSavedViewsPanel: React.FC<BimSavedViewsPanelProps> = ({
  projectId,
  modelId,
  canEdit,
  currentUserName,
  getViewpoint,
  captureThumbnail,
  onApply,
  onClose,
  shareOrigin,
  getCanvas,
}) => {
  const { data: views = [], isLoading } = useBimSavedViews(projectId, modelId);
  const saveMutation = useSaveBimView(projectId);
  const deleteMutation = useDeleteBimView(projectId);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SavedViewPatch }) => updateSavedView(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bim-saved-views', projectId] }),
    onError: (err: Error) => addToast({ type: 'error', title: 'Không cập nhật được góc nhìn', message: err.message }),
  });
  const [name, setName] = useState('');
  const [tagText, setTagText] = useState('');
  const [markupImage, setMarkupImage] = useState<string | null>(null);
  const [sort, setSort] = useState<SavedViewSort>('moi_nhat');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<{ id: string; text: string } | null>(null);

  const allTags = useMemo(() => collectTags(views), [views]);
  const shown = useMemo(
    () => sortViews(filterViews(views, { tag: tagFilter, query }), sort),
    [views, tagFilter, query, sort],
  );

  const handleSave = async (markup?: string) => {
    const state = getViewpoint();
    if (!state || !name.trim()) return;
    let thumbnail: string | null;
    let markupSmall: string | null = null;
    try {
      thumbnail = await thumbnailOf(markup || captureThumbnail());
      if (markup) markupSmall = await shrink(markup, 960, 0.8);
    } catch {
      thumbnail = null;
    }
    const tags = parseTags(tagText);
    await saveMutation.mutateAsync({
      project_id: projectId,
      model_id: modelId || null,
      name: name.trim(),
      state: markupSmall ? { ...state, markup: markupSmall } : state,
      thumbnail_url: thumbnail,
      created_by: currentUserName || null,
      // Chỉ gửi cột thẻ khi có thẻ: CSDL chưa chạy migration thẻ vẫn lưu được góc nhìn
      ...(tags.length ? { tags } : {}),
    });
    setName('');
    setTagText('');
  };

  /** Ghi đè góc nhìn bằng trạng thái hiện tại và chụp lại ảnh thu nhỏ (ghi chú vẽ tay cũ bị bỏ vì không còn khớp) */
  const handleUpdate = async (view: BimSavedView) => {
    setConfirmUpdate(null);
    const state = getViewpoint();
    if (!state) return;
    const thumbnail = await thumbnailOf(captureThumbnail());
    await updateMutation.mutateAsync({
      id: view.id,
      patch: { state, ...(thumbnail ? { thumbnail_url: thumbnail } : {}) },
    });
    addToast({
      type: 'success',
      title: 'Đã cập nhật góc nhìn',
      message: `“${view.name}” đã lưu theo trạng thái hiện tại.`,
    });
  };

  const handleSaveTags = async (view: BimSavedView, text: string) => {
    setEditingTags(null);
    await updateMutation.mutateAsync({ id: view.id, patch: { tags: parseTags(text) } });
  };

  const copyLink = async (view: BimSavedView) => {
    const url = buildViewShareUrl(shareOrigin ?? window.location.origin, projectId, view.id);
    try {
      await navigator.clipboard.writeText(url);
      addToast({
        type: 'success',
        title: 'Đã sao chép liên kết',
        message: 'Người nhận có quyền xem dự án sẽ mở đúng góc nhìn này.',
      });
    } catch {
      addToast({ type: 'info', title: 'Liên kết góc nhìn', message: url });
    }
  };

  return (
    <div
      className="absolute top-3 right-3 z-20 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-5.5rem)] flex flex-col rounded-2xl bg-white/95 dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl text-xs"
      role="region"
      aria-label="Góc nhìn đã lưu"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <Bookmark className="w-4 h-4 text-primary-600" /> Góc nhìn đã lưu
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          data-tooltip="Đóng"
          aria-label="Đóng góc nhìn đã lưu"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {canEdit && (
        <div className="p-2 space-y-1.5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex gap-1.5">
            <BimInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Tên góc nhìn hiện tại..."
              aria-label="Tên góc nhìn mới"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={!name.trim() || saveMutation.isPending}
              className="px-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white flex items-center gap-1"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setMarkupImage(captureThumbnail() || null)}
              disabled={!name.trim() || saveMutation.isPending}
              className="px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400 disabled:opacity-50"
              data-tooltip="Lưu kèm ghi chú vẽ trên ảnh (mũi tên, khoanh vùng, chữ)"
              aria-label="Lưu kèm ghi chú vẽ"
            >
              <PenLine className="w-3.5 h-3.5" />
            </button>
          </div>
          <BimInput
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Thẻ, cách nhau bằng dấu phẩy (VD: Họp tuần, MEP)"
            aria-label="Thẻ của góc nhìn mới"
            className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-2xs"
          />
        </div>
      )}
      {markupImage && (
        <BimMarkupEditor
          image={markupImage}
          title={`Ghi chú góc nhìn “${name.trim()}”`}
          onCancel={() => setMarkupImage(null)}
          onSave={(url) => {
            setMarkupImage(null);
            handleSave(url);
          }}
        />
      )}

      {views.length > 0 && (
        <div className="px-2 pt-2 space-y-1.5">
          <div className="flex gap-1.5">
            <label className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <BimInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm góc nhìn..."
                aria-label="Tìm góc nhìn"
                className="flex-1 min-w-0 bg-transparent outline-none text-slate-800 dark:text-slate-100"
              />
            </label>
            <BimSelect
              value={sort}
              onChange={(e) => setSort(e.target.value as SavedViewSort)}
              aria-label="Sắp xếp góc nhìn"
              className="px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              {SAVED_VIEW_SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </BimSelect>
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc theo thẻ">
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tagFilter === t}
                  onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                  className={`px-1.5 py-0.5 rounded-full border text-2xs ${
                    tagFilter === t
                      ? 'border-primary-500 bg-primary-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <BimViewTour views={shown} onApply={onApply} capture={captureThumbnail} getCanvas={getCanvas} />

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading ? (
          <div className="p-4 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
          </div>
        ) : views.length === 0 ? (
          <p className="p-4 text-center text-slate-400">Chưa có góc nhìn nào được lưu.</p>
        ) : shown.length === 0 ? (
          <p className="p-4 text-center text-slate-400">Không có góc nhìn khớp bộ lọc.</p>
        ) : (
          shown.map((v) => (
            <div
              key={v.id}
              data-testid="saved-view"
              className="group p-1.5 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-primary-400"
            >
              <div
                className="flex gap-2 cursor-pointer"
                onClick={() => onApply(v)}
                role="button"
                tabIndex={0}
                aria-label={`Áp góc nhìn ${v.name}`}
                onKeyDown={(e) => e.key === 'Enter' && onApply(v)}
              >
                <div className="w-20 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900">
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{v.name}</p>
                  <p className="text-2xs text-slate-400 truncate">
                    {v.created_by ? `${v.created_by} · ` : ''}
                    {formatDate(v.created_at)}
                    {v.updated_at && v.updated_at.slice(0, 16) !== v.created_at.slice(0, 16)
                      ? ` · sửa ${formatDate(v.updated_at)}`
                      : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2">
                    {!!v.state?.markup && (
                      <span className="inline-flex items-center gap-0.5 text-2xs text-rose-600 dark:text-rose-400">
                        <PenLine className="w-2.5 h-2.5" /> có ghi chú
                      </span>
                    )}
                    {!!v.state?.sectionPlanes?.length && (
                      <span className="inline-flex items-center gap-0.5 text-2xs text-primary-600 dark:text-primary-400">
                        <Scissors className="w-2.5 h-2.5" /> có mặt cắt
                      </span>
                    )}
                    {!!v.state?.measurements?.length && (
                      <span className="inline-flex items-center gap-0.5 text-2xs text-emerald-600 dark:text-emerald-400">
                        <Ruler className="w-2.5 h-2.5" /> {v.state.measurements.length} phép đo
                      </span>
                    )}
                    {(v.tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="text-2xs px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {editingTags?.id === v.id && (
                <div className="mt-1.5 flex gap-1">
                  <BimInput
                    autoFocus
                    value={editingTags.text}
                    onChange={(e) => setEditingTags({ id: v.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTags(v, editingTags.text);
                      if (e.key === 'Escape') setEditingTags(null);
                    }}
                    aria-label={`Thẻ của ${v.name}`}
                    placeholder="Thẻ, cách nhau bằng dấu phẩy"
                    className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveTags(v, editingTags.text)}
                    className="px-2 rounded-md bg-primary-600 text-white"
                    aria-label="Lưu thẻ"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="mt-1 flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  onClick={() => copyLink(v)}
                  className="p-1 rounded-md text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                  data-tooltip="Sao chép liên kết chia sẻ"
                  aria-label={`Sao chép liên kết góc nhìn ${v.name}`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingTags({ id: v.id, text: (v.tags ?? []).join(', ') })}
                      className="p-1 rounded-md text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      data-tooltip="Sửa thẻ"
                      aria-label={`Sửa thẻ góc nhìn ${v.name}`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                    {confirmUpdate === v.id ? (
                      <button
                        type="button"
                        onClick={() => handleUpdate(v)}
                        disabled={updateMutation.isPending}
                        className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-2xs font-semibold dark:bg-amber-500"
                      >
                        {updateMutation.isPending ? 'Đang lưu…' : 'Ghi đè bằng góc nhìn hiện tại?'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmUpdate(v.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                        data-tooltip="Cập nhật góc nhìn theo trạng thái hiện tại"
                        aria-label={`Cập nhật góc nhìn ${v.name}`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(v.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                      data-tooltip="Xóa góc nhìn"
                      aria-label={`Xóa góc nhìn ${v.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
