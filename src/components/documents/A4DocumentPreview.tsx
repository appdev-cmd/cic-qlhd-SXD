import React, { useRef } from 'react';
import { Printer, Download, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

export interface A4DocumentPreviewProps {
  title?: string;
  documentNumber?: string;
  projectName?: string;
  investorName?: string;
  date?: string;
  content: React.ReactNode;
  isSigned?: boolean;
  signerName?: string;
  signerTitle?: string;
  onPrint?: () => void;
  onExportPdf?: () => void;
  className?: string;
}

export function A4DocumentPreview({
  title = 'THÔNG BÁO KẾT QUẢ THẨM ĐỊNH',
  documentNumber = '182/SXD-QLXD',
  projectName = 'Dự án Xây dựng Trụ sở làm việc...',
  investorName = 'Ban Quản lý dự án chuyên ngành tỉnh Điện Biên',
  date = 'Ngày 25 tháng 09 năm 2026',
  content,
  isSigned = false,
  signerName = 'Nguyễn Văn Hùng',
  signerTitle = 'Phó Giám đốc Sở',
  onPrint,
  onExportPdf,
  className,
}: A4DocumentPreviewProps) {
  const documentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  return (
    <div className={cn('flex flex-col items-center gap-4 py-4 w-full', className)}>
      {/* ─── Thanh công cụ Thao tác In & Xuất ─── */}
      <div className="flex items-center justify-between w-full max-w-[210mm] px-4 py-2 rounded-xl bg-surface border border-border shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-ink">Khổ giấy A4 Tiêu chuẩn (Nghị định 30/2020/NĐ-CP)</span>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="In ấn theo tỷ lệ 100% chuẩn A4" placement="top">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-xs font-medium text-ink transition-colors"
            >
              <Printer size={14} />
              <span>In văn bản</span>
            </button>
          </Tooltip>

          <Tooltip content="Xuất PDF dự thảo" placement="top">
            <button
              type="button"
              onClick={onExportPdf || handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <Download size={14} />
              <span>Xuất PDF</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ─── Khung Trang In A4 Khóa Cứng (210mm × 297mm) ─── */}
      <div
        ref={documentRef}
        style={{
          width: '210mm',
          height: '297mm',
          maxHeight: '297mm',
          paddingTop: '22mm',
          paddingBottom: '20mm',
          paddingLeft: '30mm',
          paddingRight: '20mm',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        className="relative bg-white text-black shadow-2xl border border-slate-300 font-a4 flex flex-col justify-between"
      >
        {/* Quốc hiệu & Tiêu ngữ */}
        <div>
          <div className="flex justify-between items-start text-xs leading-tight border-b-2 border-transparent pb-3">
            <div className="text-center w-[45%]">
              <p className="font-normal uppercase text-slate-800">ỦY BAN NHÂN DÂN TỈNH ĐIỆN BIÊN</p>
              <p className="font-bold uppercase text-slate-900">SỞ XÂY DỰNG</p>
              <div className="w-24 h-[1px] bg-slate-800 mx-auto my-1" />
              <p className="font-normal text-slate-700 italic">Số: {documentNumber}</p>
            </div>

            <div className="text-center w-[50%]">
              <p className="font-bold uppercase text-slate-900">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
              <p className="font-bold text-slate-900 underline decoration-1 underline-offset-4">
                Độc lập - Tự do - Hạnh phúc
              </p>
              <div className="w-32 h-[1px] bg-slate-800 mx-auto my-1" />
              <p className="font-normal text-slate-700 italic text-[11px] mt-1">Điện Biên, {date}</p>
            </div>
          </div>

          {/* Tiêu đề Văn bản */}
          <div className="text-center my-6">
            <h2 className="text-base font-bold uppercase text-slate-900">{title}</h2>
            <p className="text-xs font-semibold text-slate-800 mt-1 italic">
              V/v Thẩm định Báo cáo NCKT dự án: {projectName}
            </p>
            <p className="text-xs font-normal text-slate-700 mt-0.5">Kính gửi: {investorName}</p>
          </div>

          {/* Nội dung chính văn bản */}
          <div className="text-xs leading-relaxed text-justify text-slate-800 space-y-3">
            {content}
          </div>
        </div>

        {/* Chân trang & Chữ ký số */}
        <div className="pt-4 border-t border-slate-200 flex justify-between items-end text-xs">
          <div className="text-[10px] text-slate-600 leading-tight w-[45%]">
            <p className="font-bold text-slate-700">Nơi nhận:</p>
            <p>- Như trên;</p>
            <p>- UBND tỉnh Điện Biên (b/c);</p>
            <p>- Giám đốc Sở (b/c);</p>
            <p>- Lưu: VT, QLXD.</p>
          </div>

          <div className="text-center w-[45%]">
            <p className="font-bold uppercase text-slate-900">KT. GIÁM ĐỐC</p>
            <p className="font-bold uppercase text-slate-900">{signerTitle}</p>

            {isSigned ? (
              <div className="my-2 p-2 rounded border border-rose-300 bg-rose-50 text-rose-700 text-center inline-block">
                <div className="flex items-center justify-center gap-1 font-bold text-[10px]">
                  <CheckCircle2 size={12} className="text-rose-600" />
                  <span>KÝ BỞI: SỞ XÂY DỰNG ĐIỆN BIÊN</span>
                </div>
                <p className="text-[9px] text-slate-600">{date}</p>
              </div>
            ) : (
              <div className="h-16 flex items-center justify-center italic text-slate-400 text-2xs">
                (Chờ ký số điện tử)
              </div>
            )}

            <p className="font-bold text-slate-900 mt-1">{signerName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
