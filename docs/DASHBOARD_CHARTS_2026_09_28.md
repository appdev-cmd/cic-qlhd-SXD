# Bổ sung biểu đồ Dashboard — 28/09/2026

## Giao diện

- Bốn thẻ tổng quan: dự án, hồ sơ gốc, lần nộp và tài liệu; chú thích rõ cách đếm.
- Xu hướng tiếp nhận: cột chồng theo ba nghiệp vụ, đường nét đứt và nhãn tổng; chọn 6/12 tháng hoặc toàn bộ lịch sử, chọn tháng để xem số chi tiết. Khoảng thời gian tính từ tháng cuối có dữ liệu, không dự báo tháng tương lai.
- Cơ cấu trạng thái: biểu đồ vòng kèm số lượng và tỷ trọng của từng trạng thái, giữ nhãn trạng thái có số lượng 0.
- Khối lượng nghiệp vụ: thanh tỷ trọng trên tổng lần nộp, mỗi nghiệp vụ một màu nhất quán với biểu đồ tháng.
- Xếp hạng dự án: tối đa sáu dự án theo số lần nộp, hiển thị cả số hồ sơ gốc. Thanh dài nhất ứng với dự án đứng đầu; tên dùng EntityLink mở panel.
- Tooltip dùng component chung, hỗ trợ điểm neo SVG. Màu biểu đồ có token riêng cho nền sáng/tối; không dùng tooltip HTML hoặc popover riêng.
- Màn hình nhỏ tự thu gọn sidebar, giảm padding và rút gọn breadcrumb để nội dung dashboard không bị ép hẹp. Khi trở lại desktop giữ lựa chọn thu gọn ban đầu.

## Dữ liệu và cách diễn giải

API `/api/appraisal/dashboard` bổ sung `statuses`, `top_projects` và số lần nộp từng nghiệp vụ trong mỗi tháng. Cloud tổng hợp bằng SQL trong giao dịch có actor/RLS; demo tổng hợp từ projection SQLite. Không tải toàn bộ hồ sơ về trình duyệt để tính biểu đồ.

Mỗi lần nộp, kể cả bổ sung, được tính riêng. Trạng thái phản ánh từng lần nộp đã lưu, không phải số hồ sơ gốc đang xử lý mới nhất. Tháng dựa trên ngày tạo lần nộp; dữ liệu nhập lại có thể làm thay đổi phân bố tháng. Số lượng tăng không được diễn giải thành hiệu suất, đúng hạn SLA hay kết quả phê duyệt. Tháng trống giữa hai tháng có dữ liệu được hiển thị bằng 0; trạng thái/nghiệp vụ chưa biết được gộp vào nhóm khác.

## Kiểm chứng

- Build TypeScript/Vite đạt; lint UI 0 vi phạm; 67/67 unit test đạt.
- Test mới đối soát tổng tháng/trạng thái/nghiệp vụ, lọc mẫu/thật, hồ sơ bổ sung cùng gốc, dự án chưa liên kết và thứ tự xếp hạng.
- Kiểm tra API cloud qua cổng 8208 cho bốn vai trò: ba vai trò chuyên môn thấy 181 lần nộp, quản trị thấy 219; tổng các nhóm khớp tổng API, xếp hạng giới hạn 6 dự án.
- Kiểm tra xử lý tháng trống, sắp xếp thời gian, dữ liệu rỗng và nghiệp vụ khác ở frontend.
- Trình duyệt: chọn tháng 07/2026 của chuyên viên cho BCNCKT 10, GPXD 8, nghiệm thu 7, tổng 25; chế độ tối đọc được biểu đồ; kiểm tra breakpoint 1440px và 390px. Ở 390px, main rộng 314px, biểu đồ tháng rộng 242px, không tràn ngang.

File chính: `CloudDashboard.tsx`, `dashboardData.ts`, `dashboard.css`, `catalog.py`, `demo_catalog.py`, `Tooltip.tsx`, `AppLayout.tsx` và test hỗ trợ.
