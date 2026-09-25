import React, { useState, useMemo } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Eye,
  Download,
  Calendar,
  User,
  Tag,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Sparkles,
  Camera,
  Layers,
  CheckCircle2,
  UploadCloud,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { Tooltip } from '../../components/ui/Tooltip';
import type { Project, ProjectImage } from '../../data/mockData';

interface ProjectGalleryTabProps {
  project: Project;
}

export function ProjectGalleryTab({ project }: ProjectGalleryTabProps) {
  const [images, setImages] = useState<ProjectImage[]>(project.images || []);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form thêm ảnh mới
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<ProjectImage['category']>('phoi_canh');
  const [newAuthor, setNewAuthor] = useState('Đoàn Thẩm định Sở Xây dựng Điện Biên');
  const [newDescription, setNewDescription] = useState('');

  // Lọc theo danh mục
  const filteredImages = useMemo(() => {
    if (selectedCategory === 'all') return images;
    return images.filter((img) => img.category === selectedCategory);
  }, [images, selectedCategory]);

  // Thống kê số lượng theo danh mục
  const counts = useMemo(() => {
    return {
      all: images.length,
      phoi_canh: images.filter((i) => i.category === 'phoi_canh').length,
      hien_trang: images.filter((i) => i.category === 'hien_trang').length,
      ban_ve: images.filter((i) => i.category === 'ban_ve').length,
      tien_do: images.filter((i) => i.category === 'tien_do').length,
    };
  }, [images]);

  // Điều hướng Lightbox
  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lightboxIndex !== null && filteredImages.length > 0) {
      setLightboxIndex((lightboxIndex - 1 + filteredImages.length) % filteredImages.length);
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lightboxIndex !== null && filteredImages.length > 0) {
      setLightboxIndex((lightboxIndex + 1) % filteredImages.length);
    }
  };

  const handleAddNewImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const fallbackUrl =
      newUrl.trim() ||
      'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80';

    const categoryLabels: Record<ProjectImage['category'], string> = {
      phoi_canh: 'Phối cảnh 3D',
      hien_trang: 'Hiện trạng thực địa',
      ban_ve: 'Bản vẽ quy hoạch',
      tien_do: 'Tiến độ thực địa',
    };

    const newImg: ProjectImage = {
      id: `img-${Date.now()}`,
      url: fallbackUrl,
      thumbnailUrl: fallbackUrl,
      title: newTitle.trim(),
      category: newCategory,
      categoryLabel: categoryLabels[newCategory],
      date: new Date().toLocaleDateString('vi-VN'),
      author: newAuthor.trim() || 'Cán bộ thụ lý Sở Xây dựng',
      description: newDescription.trim() || 'Ảnh khảo sát bổ sung phục vụ công tác thẩm định dự án.',
    };

    setImages([newImg, ...images]);
    setIsAddModalOpen(false);
    setNewTitle('');
    setNewUrl('');
    setNewDescription('');
  };

  const activeLightboxImage = lightboxIndex !== null ? filteredImages[lightboxIndex] : null;

  return (
    <div className="space-y-5 text-xs pb-10">
      {/* ─── BANNER GIỚI THIỆU THƯ VIỆN HÌNH ẢNH & KHẢO SÁT THỰC ĐỊA ─── */}
      <div className="p-4 rounded-xl border border-border bg-gradient-to-r from-subtle/80 via-surface to-subtle/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-sm">
            <Camera size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-ink text-sm">Thư viện Ảnh Phối cảnh & Khảo sát Thực địa</h3>
              <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                {images.length} hình ảnh tư liệu
              </span>
            </div>
            <p className="text-2xs text-ink-muted mt-0.5">
              Hệ thống lưu trữ ảnh phối cảnh 3D kiến trúc, ảnh chụp hiện trạng mặt bằng, bản vẽ quy hoạch và nhật ký kiểm tra hiện trường
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-2xs transition-all shadow-xs"
        >
          <Plus size={14} />
          <span>Bổ sung ảnh mới</span>
        </button>
      </div>

      {/* ─── THANH LỌC DANH MỤC ẢNH ─── */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5',
              selectedCategory === 'all'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink hover:bg-surface border border-border'
            )}
          >
            <Layers size={13} />
            <span>Tất cả</span>
            <span className={cn('px-1.5 py-0.2 rounded-full text-3xs', selectedCategory === 'all' ? 'bg-white/20' : 'bg-surface border border-border')}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('phoi_canh')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5',
              selectedCategory === 'phoi_canh'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink hover:bg-surface border border-border'
            )}
          >
            <Sparkles size={13} className="text-blue-400" />
            <span>Phối cảnh 3D</span>
            <span className={cn('px-1.5 py-0.2 rounded-full text-3xs', selectedCategory === 'phoi_canh' ? 'bg-white/20' : 'bg-surface border border-border')}>
              {counts.phoi_canh}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('hien_trang')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5',
              selectedCategory === 'hien_trang'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink hover:bg-surface border border-border'
            )}
          >
            <Camera size={13} className="text-amber-400" />
            <span>Hiện trạng thực địa</span>
            <span className={cn('px-1.5 py-0.2 rounded-full text-3xs', selectedCategory === 'hien_trang' ? 'bg-white/20' : 'bg-surface border border-border')}>
              {counts.hien_trang}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('ban_ve')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5',
              selectedCategory === 'ban_ve'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink hover:bg-surface border border-border'
            )}
          >
            <Tag size={13} className="text-emerald-400" />
            <span>Bản vẽ quy hoạch</span>
            <span className={cn('px-1.5 py-0.2 rounded-full text-3xs', selectedCategory === 'ban_ve' ? 'bg-white/20' : 'bg-surface border border-border')}>
              {counts.ban_ve}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('tien_do')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5',
              selectedCategory === 'tien_do'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink hover:bg-surface border border-border'
            )}
          >
            <Layers size={13} className="text-purple-400" />
            <span>Tiến độ thực địa</span>
            <span className={cn('px-1.5 py-0.2 rounded-full text-3xs', selectedCategory === 'tien_do' ? 'bg-white/20' : 'bg-surface border border-border')}>
              {counts.tien_do}
            </span>
          </button>
        </div>

        <div className="text-2xs text-ink-muted flex items-center gap-1.5">
          <span>Hiển thị:</span>
          <span className="font-semibold text-ink">{filteredImages.length}</span>
          <span>trên tổng {images.length} tư liệu</span>
        </div>
      </div>

      {/* ─── LƯỚI DANH SÁCH ẢNH DỰ ÁN ─── */}
      {filteredImages.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-3 bg-surface">
          <ImageIcon className="mx-auto text-ink-muted opacity-40" size={40} />
          <div>
            <p className="font-bold text-ink">Chưa có hình ảnh trong danh mục này</p>
            <p className="text-2xs text-ink-muted mt-1">
              Bạn có thể bấm nút "Bổ sung ảnh mới" để thêm tư liệu hình ảnh hoặc ảnh khảo sát hiện trường
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-subtle border border-border text-ink hover:bg-surface text-2xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus size={13} />
            <span>Tải ảnh lên ngay</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredImages.map((img, index) => {
            const isCover = img.isPrimary || index === 0;

            return (
              <div
                key={img.id}
                className="group relative rounded-xl border border-border bg-surface overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 flex flex-col"
              >
                {/* Khung ảnh */}
                <div
                  className="relative aspect-[16/10] overflow-hidden bg-slate-900 cursor-pointer"
                  onClick={() => setLightboxIndex(index)}
                >
                  <img
                    src={img.url}
                    alt={img.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                  {/* Badge danh mục */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-3xs font-semibold backdrop-blur-md border shadow-xs flex items-center gap-1',
                        img.category === 'phoi_canh'
                          ? 'bg-blue-600/90 text-white border-blue-400/30'
                          : img.category === 'hien_trang'
                          ? 'bg-amber-600/90 text-white border-amber-400/30'
                          : img.category === 'ban_ve'
                          ? 'bg-emerald-600/90 text-white border-emerald-400/30'
                          : 'bg-purple-600/90 text-white border-purple-400/30'
                      )}
                    >
                      {img.categoryLabel}
                    </span>
                    {isCover && (
                      <span className="px-1.5 py-0.5 rounded-md text-3xs font-bold bg-amber-400 text-slate-950 border border-amber-300 shadow-xs">
                        Ảnh chính
                      </span>
                    )}
                  </div>

                  {/* Nút phóng to nổi khi hover */}
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Tooltip content="Xem phóng to toàn màn hình" placement="left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(index);
                        }}
                        className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all"
                      >
                        <Maximize2 size={13} />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Tiêu đề ngắn nổi trên chân ảnh */}
                  <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
                    <p className="font-bold text-xs line-clamp-1 drop-shadow-sm">{img.title}</p>
                  </div>
                </div>

                {/* Thông tin mô tả kỹ thuật của ảnh */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5 bg-surface">
                  <p className="text-2xs text-ink-secondary line-clamp-2 leading-relaxed">
                    {img.description || 'Ảnh tư liệu hồ sơ thẩm định.'}
                  </p>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-3xs text-ink-muted">
                    <div className="flex items-center gap-1 truncate max-w-[65%]">
                      <User size={11} className="shrink-0" />
                      <span className="truncate">{img.author}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Calendar size={11} />
                      <span>{img.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── LIGHTBOX MODAL: XEM ẢNH PHÓNG TO TOÀN MÀN HÌNH ─── */}
      {activeLightboxImage && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 text-white animate-in fade-in duration-200"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Header Lightbox */}
          <div className="flex items-center justify-between gap-4 z-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-md bg-white/10 border border-white/20 text-xs font-semibold">
                {activeLightboxImage.categoryLabel}
              </span>
              <div>
                <h4 className="font-bold text-sm text-white drop-shadow-sm">{activeLightboxImage.title}</h4>
                <p className="text-2xs text-white/70">
                  {project.name} • {project.code}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-2xs text-white/60 mr-2">
                Ảnh {lightboxIndex + 1} / {filteredImages.length}
              </span>
              <a
                href={activeLightboxImage.url}
                target="_blank"
                rel="noreferrer"
                download
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/20"
                title="Tải ảnh gốc"
              >
                <Download size={15} />
              </a>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/20"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Vùng hiển thị ảnh chính & Nút Prev/Next */}
          <div
            className="relative flex-1 flex items-center justify-center my-3 overflow-hidden select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút Prev */}
            {filteredImages.length > 1 && (
              <button
                type="button"
                onClick={handlePrevImage}
                className="absolute left-2 sm:left-4 z-20 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all hover:scale-110"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {/* Ảnh lớn */}
            <div className="max-w-5xl max-h-[75vh] flex items-center justify-center p-2">
              <img
                src={activeLightboxImage.url}
                alt={activeLightboxImage.title}
                className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-2xl border border-white/10 transition-all"
              />
            </div>

            {/* Nút Next */}
            {filteredImages.length > 1 && (
              <button
                type="button"
                onClick={handleNextImage}
                className="absolute right-2 sm:right-4 z-20 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all hover:scale-110"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>

          {/* Footer Lightbox: Thông tin chi tiết */}
          <div
            className="z-10 p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 max-w-3xl mx-auto w-full text-center space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-white/90 leading-relaxed font-medium">
              {activeLightboxImage.description || 'Không có mô tả bổ sung.'}
            </p>
            <div className="flex items-center justify-center gap-4 text-3xs text-white/60 pt-1">
              <span>Đơn vị ghi nhận: {activeLightboxImage.author}</span>
              <span>•</span>
              <span>Thời gian: {activeLightboxImage.date}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL BỔ SUNG ẢNH MỚI CHO DỰ ÁN ─── */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center">
                  <UploadCloud size={16} />
                </div>
                <div>
                  <h4 className="font-bold text-ink text-sm">Bổ sung Ảnh Dự án / Khảo sát Thực địa</h4>
                  <p className="text-3xs text-ink-muted">Tải ảnh hoặc dán liên kết ảnh tư liệu cho dự án</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-subtle flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAddNewImage} className="space-y-3.5">
              <div>
                <label className="block text-2xs font-semibold text-ink mb-1">
                  Tiêu đề hình ảnh <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phối cảnh góc chính trục đường đôi 24m..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-subtle text-ink text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-semibold text-ink mb-1">Phân loại ảnh</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ProjectImage['category'])}
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-subtle text-ink text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="phoi_canh">Phối cảnh 3D kiến trúc</option>
                    <option value="hien_trang">Hiện trạng thực địa khu đất</option>
                    <option value="ban_ve">Bản vẽ quy hoạch / Mặt bằng</option>
                    <option value="tien_do">Tiến độ thi công công trường</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-ink mb-1">Đơn vị / Người chụp</label>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-subtle text-ink text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-ink mb-1">URL Hình ảnh (hoặc ảnh mẫu có sẵn)</label>
                <input
                  type="url"
                  placeholder="https://... (để trống sẽ tự động lấy ảnh phối cảnh tiêu chuẩn)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-subtle text-ink text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <p className="text-3xs text-ink-muted mt-1">
                  Gợi ý: Có thể dán link ảnh từ hệ thống lưu trữ đám mây hoặc cổng DVC tỉnh Điện Biên.
                </p>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-ink mb-1">Ghi chú & Mô tả kỹ thuật</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả góc nhìn, cao độ cốt san nền, hiện trạng giải phóng mặt bằng..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-subtle text-ink text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-ink text-2xs font-semibold"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-2xs font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 size={13} />
                  <span>Lưu ảnh tư liệu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
