"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, X, FileText, CheckCircle2, Shield, Stamp } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export type A4DocType = 'MAU_03_KET_QUA' | 'MAU_01_TO_TRINH' | 'GPXD' | 'MAU_14_DAU_DONG';

interface A4DocumentPreviewProps {
  dossier: any;
  onClose: () => void;
}

export const A4DocumentPreview: React.FC<A4DocumentPreviewProps> = ({ dossier, onClose }) => {
  const [docType, setDocType] = useState<A4DocType>('MAU_03_KET_QUA');

  const project = dossier?.project || {
    name: 'Trường Tiểu học Thanh Xương, Huyện Điện Biên',
    investor: 'Ban Quản lý dự án huyện Điện Biên',
    location: 'Xã Thanh Xương, Huyện Điện Biên, Tỉnh Điện Biên',
    totalInvestment: 15000000000,
    projectGroup: 'GROUP_C',
    constructionGrade: 'GRADE_III',
    constructionType: 'Công trình dân dụng (Giáo dục)',
  };

  const code = dossier?.code || 'SXD-DB-2026-0001';
  const currentDate = new Date();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[9990] flex flex-col bg-slate-900/80 backdrop-blur-sm overflow-hidden text-slate-900">
      {/* Top Toolbar */}
      <div className="h-14 bg-slate-900 text-white border-b border-slate-700 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-orange-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Xem trước Văn bản Thẩm định & In ấn Chuẩn A4</h3>
            <p className="text-[11px] text-slate-400">Nghị định 30/2020/NĐ-CP & Nghị định 217/2026/NĐ-CP (Khổ 210mm × 297mm)</p>
          </div>
        </div>

        {/* Document Type Switcher */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setDocType('MAU_03_KET_QUA')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              docType === 'MAU_03_KET_QUA' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            Mẫu số 03 (Kết quả TĐ)
          </button>
          <button
            type="button"
            onClick={() => setDocType('MAU_01_TO_TRINH')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              docType === 'MAU_01_TO_TRINH' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            Mẫu số 01 (Tờ trình)
          </button>
          <button
            type="button"
            onClick={() => setDocType('GPXD')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              docType === 'GPXD' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            Giấy phép XD (GPXD)
          </button>
          <button
            type="button"
            onClick={() => setDocType('MAU_14_DAU_DONG')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              docType === 'MAU_14_DAU_DONG' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            Mẫu số 14 (Dấu bản vẽ)
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            size="sm"
            className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            <Printer className="h-4 w-4" /> In văn bản (A4)
          </Button>
          <Button
            onClick={handlePrint}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-white border-slate-700 hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> Xuất PDF
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container with Zoom/Center Canvas */}
      <div className="flex-1 overflow-y-auto p-8 flex justify-center items-start bg-slate-950/90 print:p-0 print:bg-white print:m-0">
        {/* A4 Paper Box - Cố định kích thước cứng chuẩn 210mm x 297mm theo quy chuẩn AGENTS.md */}
        <div
          id="a4-printable-document"
          style={{
            width: '210mm',
            height: '297mm',
            maxHeight: '297mm',
            boxSizing: 'border-box',
            overflow: 'hidden',
            paddingLeft: '30mm',
            paddingRight: '20mm',
            paddingTop: '22mm',
            paddingBottom: '20mm',
          }}
          className="bg-white shadow-2xl relative font-serif text-[13px] leading-[1.35] text-black print:shadow-none print:w-full print:h-full print:m-0"
        >
          {/* ======================= MẪU SỐ 03: KẾT QUẢ THẨM ĐỊNH BCNCKT ======================= */}
          {docType === 'MAU_03_KET_QUA' && (
            <div className="flex flex-col h-full justify-between">
              <div>
                {/* Header: Cơ quan ban hành & Quốc hiệu */}
                <div className="flex justify-between items-start pb-4 border-b border-black">
                  <div className="text-center w-[45%]">
                    <p className="font-bold text-[12px] uppercase">ỦY BAN NHÂN DÂN</p>
                    <p className="font-bold text-[12px] uppercase">TỈNH ĐIỆN BIÊN</p>
                    <p className="font-bold text-[13px] uppercase underline underline-offset-4 mt-0.5">SỞ XÂY DỰNG</p>
                    <p className="text-[12px] mt-2">Số: {code ? code.replace('SXD-DB-', '') : '128'}/TB-SXD</p>
                  </div>
                  <div className="text-center w-[53%]">
                    <p className="font-bold text-[12px] uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="font-bold text-[12px] underline underline-offset-4 mt-0.5">Độc lập - Tự do - Hạnh phúc</p>
                    <p className="italic text-[12px] mt-2">Điện Biên, ngày {currentDate.getDate()} tháng {currentDate.getMonth() + 1} năm {currentDate.getFullYear()}</p>
                  </div>
                </div>

                {/* Tiêu đề văn bản */}
                <div className="text-center my-4">
                  <h1 className="font-bold text-[15px] uppercase">THÔNG BÁO</h1>
                  <h2 className="font-bold text-[14px]">Kết quả thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng</h2>
                  <p className="italic text-[12px] mt-1">Dự án: {project.name}</p>
                </div>

                {/* Kính gửi */}
                <p className="mb-2 text-[13px]">
                  <strong className="font-semibold">Kính gửi:</strong> {project.investor}
                </p>

                {/* Căn cứ pháp lý */}
                <div className="text-[12px] italic space-y-1 mb-3">
                  <p>Căn cứ Luật Xây dựng năm 2025;</p>
                  <p>Căn cứ Nghị định số 217/2026/NĐ-CP của Chính phủ quy định chi tiết một số điều về quản lý dự án ĐTXD;</p>
                  <p>Căn cứ Nghị định số 10/2021/NĐ-CP ngày 09/02/2021 của Chính phủ về quản lý chi phí đầu tư xây dựng;</p>
                  <p>Căn cứ Tờ trình số 01/TTr-BQLDA ngày 01/03/2026 của {project.investor},</p>
                </div>

                {/* Nội dung kết quả thẩm định */}
                <div className="space-y-2 text-[12.5px]">
                  <p className="font-bold">I. THÔNG TIN CHUNG DỰ ÁN</p>
                  <div className="grid grid-cols-2 gap-x-4 pl-3">
                    <p>1. Tên dự án: <strong>{project.name}</strong></p>
                    <p>2. Nhóm dự án: <strong>{project.projectGroup}</strong></p>
                    <p>3. Chủ đầu tư: <strong>{project.investor}</strong></p>
                    <p>4. Cấp công trình: <strong>{project.constructionGrade}</strong></p>
                    <p className="col-span-2">5. Địa điểm xây dựng: {project.location}</p>
                    <p className="col-span-2">6. Tổng mức đầu tư đề nghị: <strong>{formatCurrency(project.totalInvestment)}</strong></p>
                  </div>

                  <p className="font-bold mt-2">II. KẾT LUẬN THẨM ĐỊNH CỦA SỞ XÂY DỰNG</p>
                  <p className="pl-3 text-justify">
                    1. Về sự phù hợp quy hoạch và điều kiện an toàn: Hồ sơ thiết kế cơ sở tuân thủ quy chuẩn quy hoạch <strong>QCVN 01:2021/BXD</strong> và an toàn phòng cháy chữa cháy theo <strong>QCVN 06:2022/BXD</strong>.
                  </p>
                  <p className="pl-3 text-justify">
                    2. Về tổng mức đầu tư: Đã rà soát theo Thông tư 12/2021/TT-BXD, chuẩn xác dự phòng phí. Giá trị thẩm định đủ điều kiện để Người quyết định đầu tư xem xét phê duyệt dự án.
                  </p>
                  <p className="pl-3 text-justify font-bold text-blue-900">
                    KẾT LUẬN: ĐỦ ĐIỀU KIỆN ĐỂ PHÊ DUYỆT BÁO CÁO NGHIÊN CỨU KHẢ THI.
                  </p>
                </div>
              </div>

              {/* Phần Chữ ký & Nơi nhận */}
              <div className="flex justify-between items-end pt-4 border-t border-slate-300">
                <div className="text-[10.5px] w-[50%]">
                  <p className="font-bold">Nơi nhận:</p>
                  <p>- Như trên;</p>
                  <p>- UBND tỉnh Điện Biên (b/c);</p>
                  <p>- Ban Giám đốc Sở;</p>
                  <p>- Lưu: VT, QLXD ({code}).</p>
                </div>
                <div className="text-center w-[45%]">
                  <p className="font-bold text-[12px] uppercase">KT. GIÁM ĐỐC</p>
                  <p className="font-bold text-[12px] uppercase">PHÓ GIÁM ĐỐC</p>
                  <div className="h-14 flex items-center justify-center relative">
                    <div className="border border-red-500 rounded p-1 text-[10px] text-red-600 font-sans font-bold flex items-center gap-1">
                      <Stamp className="h-4 w-4" />
                      <span>ĐÃ KÝ SỐ BỞI SỞ XÂY DỰNG ĐIỆN BIÊN</span>
                    </div>
                  </div>
                  <p className="font-bold text-[13px]">Nguyễn Thành Trung</p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= MẪU SỐ 01: TỜ TRÌNH ĐỀ NGHỊ THẨM ĐỊNH ======================= */}
          {docType === 'MAU_01_TO_TRINH' && (
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="flex justify-between items-start pb-4 border-b border-black">
                  <div className="text-center w-[48%]">
                    <p className="font-bold text-[12px] uppercase">{project.investor.toUpperCase()}</p>
                    <p className="text-[12px] mt-1">Số: 01/TTr-BQLDA</p>
                  </div>
                  <div className="text-center w-[50%]">
                    <p className="font-bold text-[12px] uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="font-bold text-[12px] underline underline-offset-4 mt-0.5">Độc lập - Tự do - Hạnh phúc</p>
                    <p className="italic text-[12px] mt-2">Điện Biên, ngày 01 tháng 03 năm 2026</p>
                  </div>
                </div>

                <div className="text-center my-4">
                  <h1 className="font-bold text-[15px] uppercase">TỜ TRÌNH</h1>
                  <h2 className="font-bold text-[13px]">Về việc đề nghị thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng</h2>
                  <p className="italic text-[12px] mt-1">Dự án: {project.name}</p>
                </div>

                <p className="mb-2 text-[13px]">
                  <strong className="font-semibold">Kính gửi:</strong> Sở Xây dựng tỉnh Điện Biên
                </p>

                <div className="text-[12px] italic space-y-1 mb-3">
                  <p>Căn cứ Luật Xây dựng năm 2025;</p>
                  <p>Căn cứ Nghị định số 217/2026/NĐ-CP của Chính phủ quy định chi tiết một số điều về quản lý dự án ĐTXD;</p>
                  <p>Căn cứ Quyết định chủ trương đầu tư dự án số 142/QĐ-UBND của UBND tỉnh Điện Biên,</p>
                </div>

                <div className="space-y-2 text-[12.5px]">
                  <p className="text-justify">
                    {project.investor} kính trình Sở Xây dựng tỉnh Điện Biên thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng công trình với các nội dung chính sau:
                  </p>
                  <div className="pl-3 space-y-1.5">
                    <p>1. Tên dự án: <strong>{project.name}</strong></p>
                    <p>2. Người quyết định đầu tư: <strong>UBND tỉnh Điện Biên</strong></p>
                    <p>3. Mục tiêu đầu tư: Đáp ứng nhu cầu học tập, giảng dạy đạt chuẩn quốc gia.</p>
                    <p>4. Địa điểm xây dựng: {project.location}</p>
                    <p>5. Loại, cấp công trình: {project.constructionType}, {project.constructionGrade}</p>
                    <p>6. Tổng mức đầu tư dự kiến: <strong>{formatCurrency(project.totalInvestment)}</strong></p>
                    <p>7. Nguồn vốn đầu tư: Vốn ngân sách Nhà nước</p>
                    <p>8. Thời gian thực hiện: Năm 2026 - 2027</p>
                  </div>
                  <p className="text-justify mt-3">
                    Kính đề nghị Sở Xây dựng tỉnh Điện Biên xem xét, thẩm định theo đúng quy định hiện hành.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-300">
                <div className="text-[10.5px] w-[50%]">
                  <p className="font-bold">Nơi nhận:</p>
                  <p>- Như trên;</p>
                  <p>- Lưu: VT, BQLDA.</p>
                </div>
                <div className="text-center w-[45%]">
                  <p className="font-bold text-[12px] uppercase">ĐẠI DIỆN CHỦ ĐẦU TƯ</p>
                  <p className="font-bold text-[12px] uppercase">GIÁM ĐỐC BAN QLDA</p>
                  <div className="h-14 flex items-center justify-center">
                    <span className="italic text-slate-400 text-xs">(Ký, ghi rõ họ tên và đóng dấu)</span>
                  </div>
                  <p className="font-bold text-[13px]">Vũ Đình Trọng</p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= GIẤY PHÉP XÂY DỰNG (GPXD) ======================= */}
          {docType === 'GPXD' && (
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="flex justify-between items-start pb-4 border-b border-black">
                  <div className="text-center w-[45%]">
                    <p className="font-bold text-[12px] uppercase">ỦY BAN NHÂN DÂN</p>
                    <p className="font-bold text-[12px] uppercase">TỈNH ĐIỆN BIÊN</p>
                    <p className="font-bold text-[13px] uppercase underline underline-offset-4 mt-0.5">SỞ XÂY DỰNG</p>
                    <p className="text-[12px] mt-2">Số: 01/GPXD-SXD</p>
                  </div>
                  <div className="text-center w-[53%]">
                    <p className="font-bold text-[12px] uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p className="font-bold text-[12px] underline underline-offset-4 mt-0.5">Độc lập - Tự do - Hạnh phúc</p>
                    <p className="italic text-[12px] mt-2">Điện Biên, ngày 05 tháng 03 năm 2026</p>
                  </div>
                </div>

                <div className="text-center my-4">
                  <h1 className="font-bold text-[16px] uppercase">GIẤY PHÉP XÂY DỰNG</h1>
                  <p className="italic text-[12px]">(Sử dụng cho công trình cấp I, cấp II)</p>
                </div>

                <div className="space-y-2 text-[12.5px]">
                  <p>1. Cấp cho: <strong>{project.investor}</strong></p>
                  <p>2. Được phép xây dựng công trình: <strong>{project.name}</strong></p>
                  <p>3. Địa điểm xây dựng: <strong>{project.location}</strong></p>
                  <p>4. Cốt nền xây dựng công trình: +0.450m so với cốt mặt đường hoàn thiện.</p>
                  <p>5. Mật độ xây dựng: 55.4% | Hệ số sử dụng đất: 1.8 lần</p>
                  <p>6. Chỉ giới đường đỏ, khoảng lùi: Đúng theo hồ sơ MBQH được duyệt.</p>
                  <p>7. Chiều cao công trình: 15.6m | Số tầng: 04 tầng</p>
                  <p>8. Giấy phép này có hiệu lực khởi công trong thời hạn 12 tháng kể từ ngày cấp.</p>
                </div>
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-300">
                <div className="text-[10.5px] w-[50%]">
                  <p className="font-bold">Nơi nhận:</p>
                  <p>- Chủ đầu tư;</p>
                  <p>- UBND huyện/thị sở tại;</p>
                  <p>- Thanh tra Sở XD (để hậu kiểm);</p>
                  <p>- Lưu: VT, QLXD.</p>
                </div>
                <div className="text-center w-[45%]">
                  <p className="font-bold text-[12px] uppercase">GIÁM ĐỐC SỞ XÂY DỰNG</p>
                  <div className="h-16 flex items-center justify-center">
                    <div className="border border-red-600 rounded p-1 text-[10px] text-red-600 font-sans font-bold flex items-center gap-1">
                      <Stamp className="h-4 w-4" />
                      <span>SỞ XÂY DỰNG ĐIỆN BIÊN - ĐÃ KÝ</span>
                    </div>
                  </div>
                  <p className="font-bold text-[13px]">Lê Thành Đô</p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= MẪU SỐ 14: DẤU THẨM ĐỊNH ĐÓNG BẢN VẼ ======================= */}
          {docType === 'MAU_14_DAU_DONG' && (
            <div className="flex flex-col h-full justify-center items-center">
              <div className="text-center mb-6">
                <h2 className="text-base font-bold uppercase text-slate-800">Mẫu con dấu thẩm định thiết kế xây dựng</h2>
                <p className="text-xs text-slate-500">Mẫu số 14 - Phụ lục I ban hành kèm theo Nghị định 217/2026/NĐ-CP</p>
              </div>

              {/* Hộp con dấu chuẩn theo Nghị định 217/2026 */}
              <div className="w-[120mm] border-2 border-red-600 rounded-lg p-4 bg-red-50/20 text-red-700 font-sans">
                <div className="text-center border-b-2 border-red-600 pb-2 mb-2">
                  <p className="font-bold text-[13px] uppercase">SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN</p>
                  <p className="font-black text-[15px] uppercase tracking-wider text-red-800">ĐÃ THẨM ĐỊNH THIẾT KẾ</p>
                </div>
                <div className="text-[12px] space-y-1.5 py-1">
                  <p>Công trình: <strong>{project.name}</strong></p>
                  <p>Kèm theo Văn bản số: <strong>{code ? code.replace('SXD-DB-', '') : '128'}/TB-SXD</strong></p>
                  <p>Ngày tháng năm: <strong>{formatDate(currentDate)}</strong></p>
                  <div className="flex justify-between pt-4 mt-2 border-t border-dashed border-red-300">
                    <div className="text-center w-1/2">
                      <p className="text-[11px] font-bold">NGƯỜI THẨM ĐỊNH</p>
                      <p className="text-[10px] italic mt-6">(Ký và ghi rõ họ tên)</p>
                      <p className="font-semibold text-xs mt-1">Phạm Hoàng Sơn</p>
                    </div>
                    <div className="text-center w-1/2">
                      <p className="text-[11px] font-bold">THỦ TRƯỞNG CƠ QUAN</p>
                      <p className="text-[10px] italic mt-6">(Ký tên, đóng dấu)</p>
                      <p className="font-semibold text-xs mt-1">Nguyễn Thành Trung</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic mt-6 max-w-md text-center">
                * Con dấu này được đóng trực tiếp vào góc dưới bên phải khung tên của từng bản vẽ thiết kế xây dựng được thẩm định.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default A4DocumentPreview;
