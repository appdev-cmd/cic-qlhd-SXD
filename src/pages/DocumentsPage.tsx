import React, { useState } from 'react';
import { A4DocumentPreview } from '../components/documents/A4DocumentPreview';
import { FileText, Printer, Download, CheckCircle2, Stamp } from 'lucide-react';
import { cn } from '../lib/utils';
import { MOCK_PROJECTS } from '../data/mockData';

export function DocumentsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<'mau_03' | 'gpxd' | 'mau_14'>('mau_03');
  const project = MOCK_PROJECTS[0];

  return (
    <div className="space-y-4">
      {/* ─── THANH CHỌN BIỂU MẪU HÀNH CHÍNH ─── */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedTemplate('mau_03')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              selectedTemplate === 'mau_03'
                ? 'bg-primary-500 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink'
            )}
          >
            <FileText size={14} />
            <span>Mẫu số 03 (Kết quả Thẩm định)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTemplate('gpxd')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              selectedTemplate === 'gpxd'
                ? 'bg-primary-500 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink'
            )}
          >
            <CheckCircle2 size={14} />
            <span>Giấy phép Xây dựng Điện tử</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTemplate('mau_14')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
              selectedTemplate === 'mau_14'
                ? 'bg-primary-500 text-white shadow-xs'
                : 'bg-subtle text-ink-secondary hover:text-ink'
            )}
          >
            <Stamp size={14} />
            <span>Mẫu số 14 (Dấu Thẩm định Bản vẽ)</span>
          </button>
        </div>

        <span className="text-2xs font-semibold text-ink-muted">
          Khổ giấy A4 Tiêu chuẩn (210 × 297 mm) • NĐ 30/2020/NĐ-CP
        </span>
      </div>

      {/* ─── XEM TRƯỚC VĂN BẢN TRÊN KHUNG A4 KHÓA CỨNG ─── */}
      {selectedTemplate === 'mau_03' && (
        <A4DocumentPreview
          title="THÔNG BÁO KẾT QUẢ THẨM ĐỊNH"
          documentNumber="182/SXD-QLXD"
          projectName={project.name}
          investorName={project.investorName}
          date="Ngày 25 tháng 09 năm 2026"
          isSigned={true}
          signerName="Nguyễn Văn Hùng"
          signerTitle="Phó Giám đốc Sở"
          content={
            <>
              <p>
                Căn cứ Luật Xây dựng số 135/2025/QH15; Nghị định số 217/2026/NĐ-CP của Chính phủ quy định chi tiết một số điều của Luật Xây dựng về quản lý dự án đầu tư xây dựng;
              </p>
              <p>
                Sau khi xem xét Tờ trình số 42/TTr-BQLDA ngày 12/09/2026 của {project.investorName} về việc đề nghị thẩm định Báo cáo nghiên cứu khả thi dự án {project.name};
              </p>
              <p className="font-bold">SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN THÔNG BÁO KẾT QUẢ THẨM ĐỊNH NHƯ SAU:</p>
              <p>
                <strong>I. THÔNG TIN DỰ ÁN:</strong> Dự án nhóm B, công trình dân dụng cấp II; địa điểm tại {project.location}. Tổng mức đầu tư thẩm định là: <strong>385.000.000.000 VNĐ</strong>.
              </p>
              <p>
                <strong>II. KẾT QUẢ THẨM ĐỊNH CÁC NỘI DUNG:</strong>
              </p>
              <p>
                1. Sự phù hợp quy hoạch: Thiết kế cơ sở tuân thủ quy hoạch chi tiết tỷ lệ 1/500 đã được phê duyệt về mật độ xây dựng (38.5%), tầng cao (05 tầng), chỉ giới xây dựng.
              </p>
              <p>
                2. Quy chuẩn kỹ thuật: Áp dụng đầy đủ QCVN 01:2021/BXD, QCVN 02:2022/BXD, QCVN 06:2022/BXD, TCVN 5575:2024. Giải pháp nền móng cọc khoan nhồi bảo đảm an toàn chịu lực.
              </p>
              <p>
                3. Phòng cháy chữa cháy: Đã có văn bản thỏa thuận số 452/PC07 của Phòng Cảnh sát PCCC & CNCH Công an tỉnh Điện Biên.
              </p>
              <p>
                <strong>III. KẾT LUẬN:</strong> Báo cáo nghiên cứu khả thi đầu tư xây dựng dự án <strong>ĐỦ ĐIỀU KIỆN ĐỂ NGƯỜI QUYẾT ĐỊNH ĐẦU TƯ PHÊ DUYỆT</strong>. Yêu cầu Chủ đầu tư thực hiện bước thiết kế sau TKCS theo đúng khoản 5 Điều 26 Luật Xây dựng 2025.
              </p>
            </>
          }
        />
      )}

      {selectedTemplate === 'gpxd' && (
        <A4DocumentPreview
          title="GIẤY PHÉP XÂY DỰNG"
          documentNumber="28/GPXD-SXD"
          projectName="Khu Trung tâm Thương mại, Dịch vụ & Khách sạn Quốc tế Mường Lay Plaza"
          investorName="Công ty CP Đầu tư & Phát triển Đô thị Tây Bắc"
          date="Ngày 25 tháng 09 năm 2026"
          isSigned={true}
          signerName="Nguyễn Văn Hùng"
          signerTitle="Phó Giám đốc Sở"
          content={
            <>
              <p>Căn cứ Luật Xây dựng số 135/2025/QH15;</p>
              <p>Căn cứ Nghị định số 217/2026/NĐ-CP của Chính phủ quy định về cấp giấy phép xây dựng;</p>
              <p className="font-bold uppercase text-center my-2">SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN CẤP GIẤY PHÉP XÂY DỰNG CHO:</p>
              <p>1. Tên chủ đầu tư: Công ty CP Đầu tư & Phát triển Đô thị Tây Bắc.</p>
              <p>2. Được phép xây dựng công trình: Trung tâm Thương mại & Khách sạn Mường Lay Plaza (Cấp II).</p>
              <p>3. Địa điểm xây dựng: Phường Na Lay, Thị xã Mường Lay, Tỉnh Điện Biên.</p>
              <p>4. Các chỉ tiêu kỹ thuật được cấp phép: Cốt nền xây dựng công trình ±0.00; Diện tích xây dựng tầng 1: 3.200 m²; Chiều cao công trình: 32.5 m (09 tầng); Chỉ giới lùi xây dựng: 6.0 m.</p>
              <p>5. Giấy phép này có hiệu lực khởi công xây dựng trong thời hạn 12 tháng kể từ ngày cấp.</p>
            </>
          }
        />
      )}

      {selectedTemplate === 'mau_14' && (
        <div className="flex flex-col items-center justify-center p-8 bg-surface rounded-2xl border border-border shadow-card space-y-4">
          <h4 className="text-sm font-bold text-ink uppercase">Mẫu số 14: Mẫu Dấu Xác nhận Thẩm định Đóng lên Bản vẽ PDF</h4>
          <p className="text-xs text-ink-muted text-center max-w-md">
            Theo Nghị định số 217/2026/NĐ-CP, con dấu điện tử được hệ thống AI tự động chèn vào góc phải khung tên của từng trang bản vẽ thiết kế PDF.
          </p>

          {/* Mô phỏng Con dấu Mẫu 14 chuẩn */}
          <div className="w-80 p-4 border-2 border-dashed border-rose-600 rounded-xl bg-rose-50/40 text-rose-700 font-a4 text-center space-y-1">
            <p className="font-bold text-xs uppercase">SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN</p>
            <p className="font-bold text-sm uppercase">ĐÃ THẨM ĐỊNH THIẾT KẾ CƠ SỞ</p>
            <p className="text-2xs">Kèm theo Thông báo số: <strong>182/SXD-QLXD</strong></p>
            <p className="text-2xs">Ngày 25 tháng 09 năm 2026</p>
            <div className="pt-2 border-t border-rose-300 flex items-center justify-center gap-1 font-bold text-2xs">
              <CheckCircle2 size={13} className="text-rose-600" />
              <span>CHỮ KÝ SỐ CƠ QUAN HỢP LỆ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
