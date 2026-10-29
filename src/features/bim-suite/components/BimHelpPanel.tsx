import { BimOverlay, BimGuide } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimHelpPanel.tsx
// Hướng dẫn sử dụng nhanh tab Mô hình BIM: quy trình làm việc, công cụ, phím tắt

import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Keyboard, Workflow, Lightbulb } from 'lucide-react';

interface BimHelpPanelProps {
  onClose: () => void;
}

const STEPS: { title: string; body: string }[] = [
  {
    title: '1. Đưa mô hình lên hệ thống',
    body: 'Bấm “Tải lên IFC”, chọn tệp .ifc xuất từ Revit / ArchiCAD / Tekla. Hệ thống tự nhận diện bộ môn và phần mềm tạo lập, sau đó chuyển đổi sang định dạng xem nhanh và bóc tách cấu kiện. Tải lại cùng công trình ở lần sau bằng nút “Tải lên phiên bản mới” để giữ chuỗi phiên bản và so sánh thay đổi.',
  },
  {
    title: '2. Xem và tra cứu cấu kiện',
    body: 'Bấm vào cấu kiện trên mô hình để xem thuộc tính, bộ số lượng (Qto), vật liệu, kiểu và phân loại. Giữ chuột phải rồi kéo để lia mô hình. Giữ Shift + kéo chuột trái hoặc bật nút quét chọn để chọn nhiều cấu kiện bằng khung chữ nhật (quét chạm Crossing từ phải sang trái hoặc quét trọn Window từ trái sang phải). Giữ Ctrl khi quét để cộng dồn đối tượng.',
  },
  {
    title: '3. Gắn hồ sơ và nghiệm thu',
    body: 'Trong tab Thuộc tính, gắn tài liệu từ tủ hồ sơ dự án, lập biên bản nghiệm thu, hoặc gắn công việc tiến độ để phục vụ mô phỏng tiến độ. Chọn nhiều cấu kiện rồi bấm nút Nghiệm thu trên thanh công cụ để lập một biên bản cho cả nhóm.',
  },
  {
    title: '4. Phối hợp và xử lý vướng mắc',
    body: 'Chụp màn hình kèm góc nhìn để tạo vướng mắc (BCF), giao việc cho đơn vị xử lý và đặt hạn. Vướng mắc chưa xử lý được ghim ngay trên mô hình. Có thể xuất/nhập tệp BCF 2.1 để trao đổi với tư vấn dùng phần mềm khác.',
  },
  {
    title: '5. Kiểm tra và báo cáo',
    body: 'Tab Phân tích cho biết bức tranh tổng thể, chấm điểm chất lượng thông tin mô hình, bóc tách chi phí theo bảng đơn giá dự án và xuất báo cáo Word. Dùng nút Dò va chạm để sàng lọc điểm giao cắt giữa các bộ môn trước khi họp phối hợp.',
  },
];

const TOOLS: { name: string; desc: string }[] = [
  {
    name: 'Ghép mô hình',
    desc: 'Tích chọn nhiều mô hình trong danh sách để xem liên bộ môn; lệch gốc toạ độ thì chỉnh ở biểu tượng dịch chuyển.',
  },
  {
    name: 'Lọc',
    desc: 'Lọc theo loại cấu kiện, tầng hoặc tắt cả một mô hình; áp lên mọi mô hình đang ghép (danh sách gộp từ tất cả mô hình).',
  },
  {
    name: 'Mặt cắt',
    desc: 'Vị trí cắt tính theo mét (nạp thêm mô hình không làm trôi mặt cắt), nhập số trực tiếp, chọn tầng, cắt qua cấu kiện đang chọn, canh mặt cắt theo một mặt bấm trên mô hình, viền đỏ tại chỗ cắt; kéo tay cắt hoặc 6 mặt hộp ngay trên mô hình.',
  },
  {
    name: 'Đo đạc',
    desc: 'Khoảng cách, cao độ, diện tích, góc, độ dốc, vuông góc tới mặt; đoạn xem trước khi đặt điểm, giữ Shift để khóa trục, Backspace bỏ điểm cuối, nút × trên nhãn để xóa từng phép đo. Đo khoảng hở giữa 2 cấu kiện và kích thước hộp bao. Phép đo được lưu cùng góc nhìn và vướng mắc. Trên điện thoại: chạm để xem điểm bắt rồi bấm “Đặt điểm”.',
  },
  {
    name: 'Chọn tương tự',
    desc: 'Bấm phải (hoặc nhấn giữ trên điện thoại) vào cấu kiện → chọn mọi cấu kiện cùng loại, cùng vật liệu hoặc cùng tầng trên tất cả mô hình đang mở. Cô lập áp lên mọi mô hình.',
  },
  {
    name: 'Bộ chọn thông minh',
    desc: 'Lọc theo bất kỳ thuộc tính / Pset (VD cột bê tông B25 tầng 2), lưu lại dùng chung; tô màu theo giá trị thuộc tính bất kỳ.',
  },
  {
    name: 'So sánh phiên bản',
    desc: 'Tô màu thay đổi, hai khung song song hoặc thanh trượt trước/sau với camera đồng bộ; AI tóm tắt thay đổi.',
  },
  {
    name: 'Dò va chạm',
    desc: 'Sàng lọc khung bao rồi kiểm tra lưới tam giác thật, phân loại thật/giả, lưu phiên và chạy lại khi có phiên bản mới.',
  },
  {
    name: 'IDS & ISO 19650',
    desc: 'Kiểm tra mô hình theo file .ids của Chủ đầu tư; quản lý trạng thái Đang thực hiện → Chia sẻ → Phát hành có người duyệt.',
  },
  {
    name: 'Hiện trường',
    desc: 'Nhãn QR dán tại cấu kiện, chụp ảnh hiện trường tạo vướng mắc, bản vẽ PDF mở cạnh mô hình, bản đồ nền / ảnh flycam.',
  },
  {
    name: 'Dữ liệu IFC & BOQ',
    desc: 'Phân tích → Dữ liệu: kiểm tra chất lượng theo bộ môn hoặc người nộp. Người có quyền sửa chọn hợp đồng, xem trước mã IFC khớp BOQ rồi áp dụng. Mã trùng nhiều dòng được giữ lại để gắn thủ công.',
  },
  {
    name: 'Báo cáo tuần',
    desc: 'Phân tích → Tuần: tổng hợp mô hình, vướng mắc, va chạm, nghiệm thu và lượt sử dụng. Người có quyền sửa lập báo cáo; thành viên có quyền đọc xem và sao chép nội dung.',
  },
  {
    name: 'Ngoại tuyến',
    desc: 'Bấm Ngoại tuyến → Tải sẵn tổ hợp đang xem trước khi mất mạng. Giữ tab BIM mở để xoay, đo và cắt mô hình; chưa hỗ trợ đóng rồi mở lại toàn bộ ứng dụng khi mất mạng.',
  },
  {
    name: 'Tô màu',
    desc: 'Theo loại, nghiệm thu, hồ sơ, phiên bản hoặc tiến độ hiện trường. Tiến độ hiện trường lấy nhật ký đã được TVGS xác nhận, nghiệm thu và WBS thi công; mô phỏng tiến độ hiển thị theo ngày được chọn.',
  },
  {
    name: 'Góc nhìn lưu',
    desc: 'Lưu góc nhìn kèm mặt cắt, ẩn/cô lập và phép đo; gắn thẻ, sắp xếp, cập nhật lại theo hiện trạng và sao chép liên kết để gửi người khác mở đúng góc nhìn.',
  },
  {
    name: 'AI',
    desc: 'Hỏi bằng tiếng Việt về khối lượng, vật liệu, cấu kiện; AI có thể cô lập, tô màu, cắt và đưa camera tới cấu kiện giúp bạn.',
  },
];

const SHORTCUTS: [string, string][] = [
  ['Chuột giữa (kéo)', 'Lia camera (Pan)'],
  ['Chuột phải (kéo)', 'Lia camera (Pan)'],
  ['Shift + Chuột trái (kéo)', 'Quét chọn nhiều cấu kiện'],
  ['Chuột phải (click)', 'Menu ngữ cảnh cấu kiện'],
  ['Nhấn giữ (cảm ứng)', 'Menu ngữ cảnh cấu kiện'],
  ['Chuột trái (kéo)', 'Xoay camera (Orbit)'],
  ['Cuộn chuột', 'Phóng to / Thu nhỏ (Zoom)'],
  ['F', 'Xem toàn bộ mô hình'],
  ['I', 'Cô lập cấu kiện đang chọn'],
  ['H', 'Ẩn cấu kiện đang chọn'],
  ['Shift + H', 'Hiện lại tất cả'],
  ['G', 'Bật/tắt chế độ xuyên thấu'],
  ['C', 'Bật/tắt mặt cắt'],
  ['M', 'Đo khoảng cách'],
  ['Enter', 'Khép vùng khi đo diện tích'],
  ['Shift (khi đo)', 'Khóa trục X / Y / cao độ'],
  ['Backspace', 'Bỏ điểm đo cuối / phép đo cuối'],
  ['Mũi tên', 'Xoay camera (khung mô hình đang chọn)'],
  ['Shift + mũi tên', 'Lia camera'],
  ['W / S', 'Tiến / lùi'],
  ['A / D · Q / E', 'Lia trái phải · hạ nâng'],
  ['Enter (khung mô hình)', 'Chọn cấu kiện ở giữa khung'],
  ['[ / ]', 'Chuyển giữa các cấu kiện đang chọn'],
  ['Esc', 'Bỏ chọn / thoát chế độ đang dùng'],
  ['Ctrl + click', 'Chọn thêm cấu kiện'],
  ['Nháy đúp', 'Phóng tới cấu kiện'],
];

export const BimHelpPanel: React.FC<BimHelpPanelProps> = ({ onClose }) =>
  createPortal(
    <BimOverlay onClose={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Hướng dẫn sử dụng mô hình BIM</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khai thác mô hình thông tin công trình theo Mục 14 CV 3219/BQLDAĐS-KHCN
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          <section>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
              <Workflow className="w-4 h-4 text-primary-600" /> Quy trình làm việc
            </h4>
            <div className="space-y-2">
              {STEPS.map((s) => (
                <div
                  key={s.title}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700"
                >
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{s.title}</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-500" /> Công cụ hay dùng
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {TOOLS.map((t) => (
                <div key={t.name} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{t.name}</p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400 leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
              <Keyboard className="w-4 h-4 text-violet-600" /> Phím tắt
            </h4>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {SHORTCUTS.map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 py-1 border-b border-dashed border-slate-100 dark:border-slate-700"
                >
                  <span className="text-slate-600 dark:text-slate-300">{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 font-mono text-2xs text-slate-600 dark:text-slate-200 whitespace-nowrap">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          <BimGuide
            href="/app/bim/huong-dan"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 p-3 rounded-xl border border-primary-200 dark:border-primary-900 bg-primary-50/60 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold hover:underline"
          >
            <BookOpen className="w-4 h-4" /> Hướng dẫn xuất IFC chuẩn cho tư vấn (Revit · Tekla · ArchiCAD) — mở / in
            PDF
          </BimGuide>

          <p className="text-2xs text-slate-400 leading-relaxed">
            Lưu ý số liệu: khối lượng lấy từ bộ số lượng (Quantity Set) trong tệp IFC. Cấu kiện không khai báo bộ số
            lượng sẽ được ước tính từ hình học mô hình và được ghi rõ là số ước tính — cần đối chiếu hồ sơ thiết kế
            trước khi dùng cho thanh quyết toán.
          </p>
        </div>
      </div>
    </BimOverlay>,
    document.body,
  );
