import React, { useState } from 'react';
import { Bot, Search, BookOpen, Sparkles, ExternalLink, ShieldCheck, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

export function LegalAiPage() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([
    {
      title: 'Điều 32. Thẩm quyền thẩm định Báo cáo nghiên cứu khả thi của cơ quan chuyên môn về xây dựng',
      document: 'Nghị định số 217/2026/NĐ-CP của Chính phủ',
      effectDate: 'Có hiệu lực từ 15/05/2026',
      summary:
        'Quy định cơ quan chuyên môn về xây dựng thuộc UBND cấp tỉnh (Sở Xây dựng) thẩm định BCNCKT đối với dự án đầu tư công, dự án PPP trên địa bàn tỉnh (trừ dự án cấp xã quyết định đầu tư và dự án cấp đặc biệt), và dự án đầu tư kinh doanh có công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng theo Phụ lục IV.',
      badge: 'Thẩm quyền Sở XD',
    },
    {
      title: 'Điều 38. Nội dung, kết quả thẩm định Báo cáo nghiên cứu khả thi',
      document: 'Nghị định số 217/2026/NĐ-CP của Chính phủ',
      effectDate: 'Có hiệu lực từ 15/05/2026',
      summary:
        'Quy định chi tiết 06 nội dung Sở Xây dựng phải thẩm tra: Sự phù hợp quy hoạch 1/500; Đấu nối hạ tầng ngoài hàng rào; Danh mục và sự tuân thủ QCVN, TCVN; An toàn kết cấu chịu lực; Giải pháp thiết kế PCCC (thỏa thuận Công an); Thẩm định Tổng mức đầu tư dự án đầu tư công/PPP theo NĐ 206/2026.',
      badge: 'Nội dung thẩm định',
    },
    {
      title: 'Điều 53. Thẩm quyền cấp giấy phép xây dựng',
      document: 'Nghị định số 217/2026/NĐ-CP của Chính phủ',
      effectDate: 'Có hiệu lực từ 15/05/2026',
      summary:
        'Sở Xây dựng cấp giấy phép xây dựng cho các công trình cấp I, cấp II trên địa bàn tỉnh. UBND cấp xã cấp giấy phép xây dựng cho công trình cấp III, IV và nhà ở riêng lẻ.',
      badge: 'Cấp phép GPXD',
    },
  ]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ─── HERO SEARCH PHÁP LUẬT ─── */}
      <div className="p-8 rounded-2xl border border-primary-500/20 bg-gradient-to-b from-primary-500/10 to-surface shadow-card text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs font-bold border border-primary-500/20">
          <Sparkles size={14} />
          <span>Trợ lý RAG Pháp quy Xây dựng Thông minh</span>
        </div>

        <h2 className="text-2xl font-bold text-ink">
          Tra cứu Pháp luật & Quy chuẩn Kỹ thuật Xây dựng
        </h2>
        <p className="text-xs text-ink-muted max-w-2xl mx-auto">
          Tra cứu ngôn ngữ tự nhiên về Luật Xây dựng 2025, NĐ 217/2026, NĐ 206/2026, NĐ 207/2026, các quy chuẩn QCVN và văn bản chỉ đạo của UBND tỉnh Điện Biên có trích dẫn chính xác.
        </p>

        {/* Ô tìm kiếm lớn */}
        <div className="relative max-w-2xl mx-auto mt-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập câu hỏi pháp lý (VD: Thẩm quyền Sở Xây dựng theo NĐ 217, Thời hạn SLA nhóm B...)"
            className="w-full pl-12 pr-28 py-3.5 rounded-xl border border-border bg-surface text-sm text-ink outline-none shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold transition-colors shadow-xs"
          >
            Tra cứu
          </button>
        </div>
      </div>

      {/* ─── KẾT QUẢ TRA CỨU CÓ CĂN CỨ ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <BookOpen size={16} className="text-primary-500" />
            <span>Văn bản & Điều khoản Trích dẫn Trọng tâm</span>
          </h3>
          <span className="text-2xs text-ink-muted font-medium">CSDL Văn bản đã được số hóa</span>
        </div>

        <div className="space-y-3">
          {searchResults.map((res, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl border border-border bg-surface shadow-card hover:border-primary-400/60 transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-3xs font-bold px-2 py-0.5 rounded bg-primary-500/10 text-primary-600 uppercase">
                    {res.badge}
                  </span>
                  <h4 className="text-sm font-bold text-ink mt-1 hover:text-primary-600 cursor-pointer transition-colors">
                    {res.title}
                  </h4>
                  <p className="text-2xs font-semibold text-ink-secondary mt-0.5">
                    {res.document} • <span className="text-emerald-600">{res.effectDate}</span>
                  </p>
                </div>

                <button
                  type="button"
                  className="p-2 rounded-lg border border-border bg-subtle hover:bg-surface text-ink-muted hover:text-primary-600 transition-colors shrink-0"
                >
                  <ExternalLink size={14} />
                </button>
              </div>

              <p className="text-xs text-ink-muted leading-relaxed text-justify">{res.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
