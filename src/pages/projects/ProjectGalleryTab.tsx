import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Maximize2,
} from 'lucide-react';
import type { Project, ProjectImage } from '../../types/project';
import { ApiError, apiRequest } from '../../services/apiClient';
import { appraisalService } from '../../services/appraisalService';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { EntityLink } from '../../components/ui/EntityLink';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  IconButton,
  Modal,
  Skeleton,
  confirm,
  toast,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFilterState } from '../../hooks/useFilterState';
import { cn } from '../../lib/utils';
import { contentPath, galleryImageDate, nextAfterRemoval, stepIndex } from './galleryUtils';

type GalleryImage = ProjectImage & { storagePath?: string; sha256?: string };
type Gallery = { images: GalleryImage[]; revision: number };
type BlobCache = Map<string, Promise<Blob>>;

const categories = [
  { value: 'phoi_canh', label: 'Phối cảnh 3D kiến trúc' },
  { value: 'hien_trang', label: 'Hiện trạng thực địa' },
  { value: 'ban_ve', label: 'Bản vẽ quy hoạch / Mặt bằng' },
  { value: 'tien_do', label: 'Tiến độ thi công' },
];
const initial = { title: '', url: '', category: 'phoi_canh', description: '', file: null as File | null };
const input =
  'w-full rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-900 px-3 py-2 text-sm text-ink dark:text-slate-100 placeholder:text-ink-muted dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60';

/**
 * Renders one gallery image. Stored originals need an authenticated fetch, so they are loaded
 * only once the tile scrolls near the viewport (or immediately when `eager`), shared through
 * `cache`, and every object URL is revoked when the image changes or the component unmounts.
 */
function GalleryImageView({
  image,
  cache,
  eager = false,
  className,
}: {
  image: GalleryImage;
  cache: BlobCache;
  eager?: boolean;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [source, setSource] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    setError(false);
    setLoaded(false);
    setSource('');
    if (!visible) return;
    if (!image.storagePath) {
      setSource(image.url);
      return;
    }
    let active = true;
    let objectUrl = '';
    let pending = cache.get(image.url);
    if (!pending) {
      pending = appraisalService.blob(contentPath(image.url));
      cache.set(image.url, pending);
      // A failed fetch must not poison the cache for the next attempt.
      pending.catch(() => cache.delete(image.url));
    }
    pending
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, image.url, image.storagePath, cache]);

  return (
    <div ref={holder} className={cn('relative overflow-hidden bg-subtle dark:bg-slate-950', className)}>
      {error ? (
        <div
          role="alert"
          className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 p-4 text-xs text-danger-700 dark:text-danger-300"
        >
          <ImageOff size={22} aria-hidden="true" />
          Không tải được ảnh.
        </div>
      ) : (
        <>
          {!loaded && <Skeleton variant="rectangular" className="absolute inset-0 h-full w-full" />}
          {source && (
            <img
              src={source}
              alt={image.title}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
              loading={eager ? 'eager' : 'lazy'}
              className={cn(
                'h-full w-full transition-opacity duration-200',
                eager ? 'object-contain' : 'object-cover',
                loaded ? 'opacity-100' : 'opacity-0',
              )}
            />
          )}
        </>
      )}
    </div>
  );
}

function GalleryTileSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
      <Skeleton variant="rectangular" className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-3">
        <Skeleton width="70%" />
        <Skeleton width="45%" height={12} />
      </div>
    </div>
  );
}

export function ProjectGalleryTab({ project }: { project: Project }) {
  const { mode, profile } = useAuth();
  const [gallery, setGallery] = useState<Gallery>({ images: project.images || [], revision: 1 });
  const [category, setCategory] = useFilterState('project-gallery-filter', { category: 'all' });
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  const [edit, setEdit] = useState({ title: '', category: 'phoi_canh', description: '' });
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const cache = useRef<BlobCache>(new Map()).current;
  const path = '/projects/' + encodeURIComponent(project.id) + '/images';

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<Gallery>(path)
      .then((result) => {
        if (active) {
          setGallery(result);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);

  const filtered = useMemo(
    () => gallery.images.filter((image) => category.category === 'all' || image.category === category.category),
    [gallery, category],
  );
  const index = filtered.findIndex((image) => image.id === selected);
  const activeImage = index >= 0 ? filtered[index] : undefined;
  const dirty =
    JSON.stringify({ ...form, file: form.file?.name || null }) !== JSON.stringify({ ...initial, file: null });
  const editDirty =
    !!editing &&
    JSON.stringify(edit) !==
      JSON.stringify({ title: editing.title, category: editing.category, description: editing.description || '' });
  // Same gate as the add button; the worker re-checks the role on every write.
  const canEdit = mode === 'demo' || ['officer', 'head_of_department', 'admin'].includes(profile?.role || '');

  const step = useCallback(
    (delta: number) => {
      if (filtered.length < 2 || index < 0) return;
      setSelected(filtered[stepIndex(index, delta, filtered.length)].id);
    },
    [filtered, index],
  );

  // ←/→ browse the lightbox; Esc is handled by Modal and closes only the top layer.
  useEffect(() => {
    if (!activeImage || editing || confirming) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeImage, editing, confirming, step]);

  const failed = (cause: unknown, title: string) => {
    const message = (cause as Error).message;
    toast.error(title, { description: message });
    // Someone else changed the gallery: reload so the next attempt uses the new revision.
    if (cause instanceof ApiError && cause.status === 409) setVersion((v) => v + 1);
  };

  const closeAdd = () => {
    if (!busy) {
      setAdding(false);
      setForm(initial);
      setError('');
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (
        form.file &&
        (form.file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(form.file.type))
      )
        throw new Error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.');
      const contentBase64 = form.file
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
            reader.readAsDataURL(form.file!);
          })
        : undefined;
      const result = await apiRequest<Gallery>(path, {
        method: 'POST',
        body: JSON.stringify({
          revision: gallery.revision,
          title: form.title,
          category: form.category,
          description: form.description,
          url: form.url,
          contentBase64,
        }),
      });
      setGallery(result);
      setAdding(false);
      setForm(initial);
      toast.success('Đã bổ sung ảnh tư liệu');
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof ApiError && cause.status === 409) setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (image: GalleryImage) => {
    setEdit({ title: image.title, category: image.category, description: image.description || '' });
    setEditing(image);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<Gallery>(path + '/' + encodeURIComponent(editing.id), {
        method: 'PATCH',
        body: JSON.stringify({ revision: gallery.revision, ...edit }),
      });
      setGallery(result);
      setEditing(null);
      toast.success('Đã cập nhật thông tin ảnh');
    } catch (cause) {
      failed(cause, 'Không lưu được thông tin ảnh');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: GalleryImage) => {
    if (busy) return;
    setConfirming(true);
    const ok = await confirm({
      title: 'Xóa ảnh khỏi thư viện?',
      description: `Ảnh "${image.title}" sẽ bị gỡ khỏi thư viện dự án. Thao tác này không hoàn tác được.`,
      confirmLabel: 'Xóa ảnh',
      tone: 'danger',
    });
    setConfirming(false);
    if (!ok) return;
    setBusy(true);
    try {
      const result = await apiRequest<Gallery>(
        path + '/' + encodeURIComponent(image.id) + '?revision=' + gallery.revision,
        { method: 'DELETE' },
      );
      if (selected === image.id)
        setSelected(
          nextAfterRemoval(
            filtered.map((i) => i.id),
            image.id,
          ),
        );
      cache.delete(image.url);
      setGallery(result);
      toast.success('Đã xóa ảnh khỏi thư viện');
    } catch (cause) {
      failed(cause, 'Không xóa được ảnh');
    } finally {
      setBusy(false);
    }
  };

  const download = async (image: GalleryImage) => {
    try {
      if (image.storagePath) await appraisalService.download(contentPath(image.url), image.title);
      else window.open(image.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      toast.error('Không tải được ảnh gốc', { description: (cause as Error).message });
    }
  };

  return (
    <section className="space-y-4 text-sm text-ink dark:text-slate-100">
      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-bold text-ink dark:text-slate-100">
            <Camera size={18} className="text-primary-600 dark:text-primary-300" aria-hidden="true" />
            Thư viện ảnh dự án & khảo sát
          </h3>
          <p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
            {gallery.images.length} ảnh tư liệu · Người bổ sung được ghi nhận theo tài khoản.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-60 max-w-full">
            <SearchableSelect
              value={category.category}
              onChange={(value) => {
                setCategory({ category: value });
                setSelected(null);
              }}
              options={[{ value: 'all', label: 'Tất cả ảnh' }, ...categories]}
            />
          </div>
          <IconButton
            icon={<RefreshCw size={16} />}
            aria-label="Tải lại thư viện"
            tooltip="Tải lại thư viện"
            variant="secondary"
            disabled={loading || busy}
            onClick={() => {
              cache.clear();
              setVersion((v) => v + 1);
            }}
          />
          {canEdit && (
            <Button size="sm" leftIcon={<Plus size={14} />} disabled={loading} onClick={() => setAdding(true)}>
              Bổ sung ảnh
            </Button>
          )}
        </div>
      </Card>

      {error && !adding && (
        <p
          role="alert"
          className="rounded-xl border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900 px-3 py-2 text-danger-700 dark:text-danger-200"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Đang tải thư viện ảnh">
          {Array.from({ length: 3 }).map((_, i) => (
            <GalleryTileSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Camera className="h-12 w-12" />}
            title={gallery.images.length ? 'Chưa có ảnh trong phân loại này' : 'Thư viện ảnh còn trống'}
            description={
              gallery.images.length
                ? 'Chọn phân loại khác hoặc "Tất cả ảnh" để xem toàn bộ tư liệu.'
                : 'Bổ sung ảnh phối cảnh, hiện trạng hoặc tiến độ để lưu tư liệu cho dự án.'
            }
            actionLabel={canEdit && !gallery.images.length ? 'Bổ sung ảnh' : undefined}
            onAction={canEdit ? () => setAdding(true) : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((image) => (
            <article
              key={image.id}
              className="group overflow-hidden rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <button
                type="button"
                className="relative block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                aria-label={'Xem ảnh: ' + image.title}
                onClick={() => setSelected(image.id)}
              >
                <GalleryImageView image={image} cache={cache} className="aspect-[4/3] w-full" />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 size={22} aria-hidden="true" />
                </span>
              </button>
              <div className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 truncate font-semibold text-ink dark:text-slate-100">{image.title}</h4>
                  {canEdit && (
                    <div className="-mr-1 -mt-1 flex shrink-0 gap-1">
                      <IconButton
                        size="sm"
                        icon={<Pencil size={14} />}
                        aria-label={'Sửa thông tin ảnh: ' + image.title}
                        tooltip="Sửa tiêu đề, phân loại, mô tả"
                        disabled={busy}
                        onClick={() => openEdit(image)}
                      />
                      <IconButton
                        size="sm"
                        icon={<Trash2 size={14} />}
                        aria-label={'Xóa ảnh: ' + image.title}
                        tooltip="Xóa ảnh"
                        className="hover:text-danger-600 dark:hover:text-danger-400"
                        disabled={busy}
                        onClick={() => remove(image)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted dark:text-slate-400">
                  <Badge variant="neutral" size="xs">
                    {image.categoryLabel}
                  </Badge>
                  <span>{galleryImageDate(image.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{image.author}</span>
                </div>
                {image.description && (
                  <p className="line-clamp-2 text-xs text-ink-secondary dark:text-slate-300">{image.description}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {activeImage && (
        <Modal
          heading={activeImage.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" size="xs">
                {activeImage.categoryLabel}
              </Badge>
              <span>
                {galleryImageDate(activeImage.date)} · {activeImage.author}
              </span>
            </span>
          }
          icon={<Camera size={20} />}
          size="full"
          onClose={() => setSelected(null)}
          footer={
            <>
              <span className="mr-auto text-xs text-ink-muted dark:text-slate-400">
                Ảnh {index + 1} / {filtered.length} · Dùng phím ← → để chuyển ảnh
              </span>
              {canEdit && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 size={14} />}
                    disabled={busy}
                    onClick={() => remove(activeImage)}
                  >
                    Xóa
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Pencil size={14} />}
                    disabled={busy}
                    onClick={() => openEdit(activeImage)}
                  >
                    Sửa thông tin
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download size={14} />}
                onClick={() => download(activeImage)}
              >
                Tải ảnh gốc
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl bg-slate-950 dark:bg-slate-950">
              <GalleryImageView
                key={activeImage.id}
                image={activeImage}
                cache={cache}
                eager
                className="h-[62vh] bg-slate-950 dark:bg-slate-950"
              />
              {filtered.length > 1 && (
                <>
                  <IconButton
                    icon={<ChevronLeft size={20} />}
                    aria-label="Ảnh trước"
                    tooltip="Ảnh trước (←)"
                    variant="secondary"
                    rounded
                    className="absolute left-3 top-1/2 -translate-y-1/2 shadow-dropdown"
                    onClick={() => step(-1)}
                  />
                  <IconButton
                    icon={<ChevronRight size={20} />}
                    aria-label="Ảnh sau"
                    tooltip="Ảnh sau (→)"
                    variant="secondary"
                    rounded
                    className="absolute right-3 top-1/2 -translate-y-1/2 shadow-dropdown"
                    onClick={() => step(1)}
                  />
                </>
              )}
            </div>
            {activeImage.description ? (
              <p className="leading-relaxed text-ink dark:text-slate-200">{activeImage.description}</p>
            ) : (
              <p className="text-ink-muted dark:text-slate-400">Chưa có mô tả cho ảnh này.</p>
            )}
            <p className="text-xs text-ink-muted dark:text-slate-400">
              Dự án: <EntityLink type="project" id={project.id} name={project.name} />
            </p>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          heading="Sửa thông tin ảnh"
          description="Chỉ sửa tiêu đề, phân loại và mô tả; tệp ảnh, người bổ sung và ngày giữ nguyên."
          icon={<Pencil size={18} />}
          size="md"
          dirty={editDirty || busy}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button
                type="submit"
                form="gallery-edit-form"
                loading={busy}
                loadingText="Đang lưu…"
                disabled={!editDirty}
              >
                Lưu thay đổi
              </Button>
            </>
          }
        >
          <form id="gallery-edit-form" onSubmit={saveEdit} className="space-y-4">
            <FormField label="Tiêu đề ảnh" required htmlFor="gallery-edit-title">
              <input
                id="gallery-edit-title"
                className={input}
                required
                maxLength={240}
                disabled={busy}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </FormField>
            <FormField label="Phân loại" required>
              <SearchableSelect
                disabled={busy}
                options={categories}
                value={edit.category}
                onChange={(value) => setEdit({ ...edit, category: value })}
              />
            </FormField>
            <FormField label="Mô tả" htmlFor="gallery-edit-description">
              <textarea
                id="gallery-edit-description"
                className={input}
                disabled={busy}
                maxLength={2000}
                rows={4}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </FormField>
          </form>
        </Modal>
      )}

      {adding && (
        <Modal
          heading="Bổ sung ảnh dự án / khảo sát"
          icon={<Plus size={18} />}
          size="md"
          dirty={dirty || busy}
          onClose={closeAdd}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={closeAdd}>
                Hủy
              </Button>
              <Button type="submit" form="gallery-add-form" loading={busy} loadingText="Đang lưu…">
                Lưu ảnh tư liệu
              </Button>
            </>
          }
        >
          <form id="gallery-add-form" onSubmit={save} className="space-y-4">
            <FormField label="Tiêu đề ảnh" required htmlFor="gallery-add-title">
              <input
                id="gallery-add-title"
                className={input}
                required
                maxLength={240}
                disabled={busy}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <FormField label="Phân loại" required>
              <SearchableSelect
                disabled={busy}
                options={categories}
                value={form.category}
                onChange={(value) => setForm({ ...form, category: value })}
              />
            </FormField>
            <FormField label="Tệp ảnh" hint="JPEG, PNG hoặc WebP; tối đa 5 MB." htmlFor="gallery-add-file">
              <input
                id="gallery-add-file"
                className={input}
                type="file"
                disabled={busy}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
            </FormField>
            <FormField label="Hoặc liên kết ảnh HTTPS" htmlFor="gallery-add-url">
              <input
                id="gallery-add-url"
                className={input}
                type="url"
                disabled={busy || !!form.file}
                required={!form.file}
                maxLength={2000}
                placeholder="https://…"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </FormField>
            <FormField label="Mô tả" htmlFor="gallery-add-description">
              <textarea
                id="gallery-add-description"
                className={input}
                disabled={busy}
                maxLength={2000}
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormField>
            {error && (
              <p role="alert" className="text-danger-700 dark:text-danger-300">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}
