# Kết quả kiểm thử bản demo — 27/09/2026

## Phạm vi đã thực hiện

Kiểm thử phiên bản sau khi bổ sung danh mục, phiếu GPXD/nghiệm thu và OCR nền. Theo yêu cầu người dùng, domain, production và SMTP tiếp tục để sau.

| Hạng mục | Kết quả và bằng chứng |
| --- | --- |
| Kiểm thử tự động | **48/48 đạt**, `pnpm test:appraisal`; gồm 15 ca mới về phiếu chuyên môn, vòng đời OCR, dẫn chứng AI và hạn mức gọi |
| Biên dịch | `pnpm build` đạt; TypeScript và Vite; chỉ tạo bản build cục bộ |
| Cloud và bảo mật | `scripts/verify_cloud_staging.py` đạt: xác thực, chống giả mạo header, RLS, phân trang, signed upload, hash, CAS, lần bổ sung, giữ nguyên lần nộp trước |
| Quy trình vai trò | `scripts/verify_demo_workflows.py` đạt: phân công, trình, quyền lãnh đạo, khóa sau rà soát, mở lại có lịch sử, PDF/DOCX A4 |
| Danh mục | Tạo/sửa cả tổ chức, cá nhân, giá vật liệu; từ chối chuyên viên/lãnh đạo Sở ghi danh mục; từ chối chèn tỉnh trái phép; chống revision cũ; có nhật ký người thực hiện |
| OCR cloud thực tế | Nộp PDF chỉ có ảnh → xếp hàng → đọc 11 đoạn và 3 trường chưa xác nhận trong khoảng **29,2 giây**; giữ nguyên bytes/hash bản gốc; hết hiệu lực phiếu cũ; dọn spool sau hoàn tất |
| OCR trên tài liệu Hương Xuân | Raster trực tiếp **21 trang / 2 PDF** rồi nhận dạng vie+eng; **21/21 trang có chữ**; mất khoảng **46,5 giây** trên máy này |
| Vertex thực tế | Luồng workflow có câu hỏi BCNCKT; đánh giá thêm 3 tình huống GPXD, nghiệm thu và thiếu hồ sơ. Trả về `gemini-3.8-flash`, nguồn có thật, trích dẫn khớp nguyên văn |
| Giao diện | Đăng nhập nhanh trưởng phòng; danh sách có hồ sơ liên kết dự án; lịch sử hiện “Cập nhật”; Escape mở cảnh báo, “Tiếp tục nhập” giữ nguyên dữ liệu |

Tệp kết quả:

- `output/appraisal/new-features-regression.json`
- `output/appraisal/ocr-real-documents-evaluation.json`
- `output/appraisal/ocr-real-documents/`: nội dung OCR theo trang để đối chiếu.
- `output/appraisal/live-legal-ai-evaluation.json`: câu hỏi, câu trả lời, nguồn và hash phục vụ duyệt nghiệp vụ.
- `output/appraisal/export-format-regression.json`: kích thước A4 của 6 PDF và 5 DOCX trong bộ mẫu.
- `output/appraisal/unit-regression.log`: kết quả chạy 48 kiểm thử.

Các hồ sơ, danh mục và object Storage tạo riêng cho kiểm thử đã được xóa theo đúng ID của lần chạy. Hồ sơ mẫu và dữ liệu người dùng được giữ nguyên.

Đối soát sau dọn dữ liệu: **26 dự án, 161 lần nộp**; số hồ sơ/tổ chức/cá nhân/giá vật liệu QA tạm đều bằng 0. Bộ truy hồi điều khoản chạy lại đạt **10/10**. Endpoint kiểm tra kết nối trả trạng thái **connected** cho Vertex `gemini-3.8-flash`.

## Lỗi đã sửa

1. Nhật ký danh mục nhận `insert/update` dạng chữ thường từ DB nhưng giao diện so sánh chữ hoa, dẫn đến hiển thị nhầm “Xóa”. Đã chuẩn hóa nhãn thao tác; kiểm tra API và giao diện sau sửa.
2. OCR trước đây chỉ hiện trạng thái đang chạy. Đã thêm thông báo hoàn tất, thất bại, đã hủy hoặc gián đoạn để người trình diễn biết bước tiếp theo.
3. Đồng bộ **52 phiếu mẫu GPXD/nghiệm thu**: tên chủ đầu tư và cấp công trình lấy từ dự án liên kết thay cho chữ mẫu chung. Chỉ thay trường còn giữ giá trị khởi tạo, có bản sao trước sửa, lưu qua API với revision/audit và giữ kết luận chờ rà soát. Kết quả ở `output/appraisal/demo-project-alignment.json`. Khi trình diễn, xuất từ phiếu hiện tại để lấy thông tin mới nhất.

Trong quá trình viết kiểm thử đã sửa hai kỳ vọng sai của bộ kiểm thử: PDF scan mẫu mang tên “Công trình trường học mô phỏng”; câu hỏi về nội dung/trình tự kiểm tra nghiệm thu dùng điều khoản đã ghi trong bộ truy hồi hiện có. Kết quả đạt ở trên thuộc lần chạy sau khi sửa các kỳ vọng này.

## Cách đọc số liệu OCR/AI

- Độ tương đồng văn bản OCR với lớp chữ sẵn có trung bình **0,9613**; chuỗi số khớp **203/207**. Đây là phép so sánh kỹ thuật, **không phải chứng nhận độ chính xác 96,13% hoặc 98,07%**. Lớp chữ gốc cũng có khoảng trắng, lỗi font và chuỗi số bị tách. Báo cáo lưu các chuỗi khác nhau theo trang để rà soát.
- Hai PDF gốc có phần đầu bất thường; trình đọc phục hồi được. File gốc được giữ nguyên; không xác nhận hiệu lực chữ ký số.
- Bộ Hương Xuân có ngày văn bản trước 01/07/2026, chỉ dùng đánh giá đọc/trích xuất. Việc đọc được văn bản cũ không tự động xác nhận chế độ pháp lý sau 01/07/2026 cho hồ sơ đó.
- 3 tình huống gọi Vertex đều qua kiểm tra cấu trúc và trích dẫn. Với tình huống chưa nộp hồ sơ, câu trả lời nêu không thể xác nhận đủ điều kiện. Đây là quan sát trên các ca đã chạy, không bảo đảm mọi câu trả lời tương lai đúng.
- Kiểm thử từ chối dẫn chứng giả, trích sai, JSON lỗi và nguồn rỗng dùng mô hình giả lập trong unit test. Thử hủy/xung đột revision/mất DB của OCR cũng dùng fixture; luồng OCR hoàn tất được chạy thật qua cloud.
- Chưa có bộ 20 hồ sơ / 150 trang được chuyên viên gán nhãn; chưa đo precision/recall nghiệp vụ trên bộ đó.

## Bàn giao demo

Các luồng kỹ thuật nêu trên đã đạt phạm vi kiểm thử. Có thể dùng để trình diễn quy trình với dữ liệu mô phỏng. Phiếu duyệt nghiệp vụ ở `docs/PHIEU_DUYET_NGHIEP_VU_DEMO.md` dành cho chuyên viên xác nhận nguồn luật, phạm vi áp dụng, điều kiện và biểu mẫu. Trạng thái hiện tại là **chờ chuyên viên rà soát**, không tự đánh dấu đã được Sở nghiệm thu.
