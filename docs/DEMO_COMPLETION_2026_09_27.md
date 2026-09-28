# Bàn giao đợt hoàn thiện demo — 27/09/2026

**Cập nhật pháp lý/biểu mẫu 27/09/2026:** Đã đối chiếu nguồn chính thức, triển khai checklist 13 loại thủ tục, sửa dự thảo và nâng cấp 52 phiếu mẫu. [Kết quả và giới hạn xác nhận](LEGAL_FORMS_DEMO_REVIEW_2026_09_27.md).

## 1. Chức năng đã bổ sung

| Nhóm | Nội dung |
| --- | --- |
| GPXD | 10 loại thủ tục; checklist; điều kiện áp dụng; dẫn chứng; nhận xét; thông tin chi tiết và khung dự thảo PDF/DOCX |
| Nghiệm thu | Hoàn thành / có điều kiện / một phần; phiếu kiểm tra; ngày, thành phần và ghi nhận hiện trường; tồn tại, phụ trách, hạn và tài liệu khắc phục |
| Quy trình | Chặn trình khi chưa rà soát; chặn đề xuất đủ điều kiện khi thiếu tài liệu hoặc còn tồn tại; sửa dữ liệu làm hết hiệu lực phiếu và lưu lịch sử |
| Danh mục | Tạo/sửa tổ chức, cá nhân, giá vật liệu; quyền trưởng phòng/quản trị theo tỉnh tại API và RLS; revision chống ghi đè; nhật ký |
| OCR | Tesseract vie+eng; đọc PDF scan ở cả ba nghiệp vụ; hàng đợi bền vững, hủy và revision; giữ hash bản gốc; dữ liệu trích xuất chưa xác nhận |
| Bản đồ | Nền Natural Earth ngoại tuyến, tọa độ dự án và liên kết panel; tùy chọn OpenStreetMap khi mạng cho phép |
| Hiệu năng | Tách React, Supabase, bản đồ và trình đọc PDF; gói ứng dụng chính khoảng 105 kB trước gzip; hết cảnh báo chunk chính lớn |
| Đánh giá nguồn | 10 tình huống truy hồi điều khoản; kết quả 10/10 trong top 6; nút đánh giá trong Cài đặt hệ thống |

Đã lưu **52 phiếu mô phỏng: 26 GPXD + 26 nghiệm thu**, gắn **26 dự án**, tại lần nộp mới nhất. Kết luận đều chờ rà soát; lần nộp trước được giữ nguyên. Migration `20260927000010_catalog_commands.sql` đã áp dụng sau giao dịch thử rollback và được ghi ledger.

## 2. Trình diễn

1. Mở `http://localhost:3008`, đăng nhập nhanh **Trưởng phòng**.
2. Mở GPXD hoặc Nghiệm thu, chọn **Lần 02 → Cập nhật phiếu**; chọn thủ tục, dẫn chứng, nhận xét, kết luận.
3. Với nghiệm thu, thêm tồn tại hoặc cập nhật khắc phục. Xác nhận đã khắc phục cần tài liệu và giải trình.
4. Tải **Phiếu PDF/DOCX**, **Dự thảo PDF/DOCX**, **Biên bản hiện trường**. Các loại này cũng có tại **Văn bản & In ấn A4**.
5. Vào Tổ chức / Cá nhân / Giá vật liệu để **Thêm mới, Sửa, Lịch sử**. Chuyên viên chỉ xem danh mục; trưởng phòng/quản trị được cập nhật.
6. Nộp `output/appraisal/gpxd-nghiem-thu/ho-so-scan-mau.pdf` vào hồ sơ đang xử lý; chọn ở mục OCR rồi bấm **Đọc OCR**. Sau đó đối chiếu bản gốc và xác nhận lại dữ liệu/phiếu chuyên môn.
7. Vào **Cài đặt → Đánh giá kho nguồn**; mở **Bản đồ** để dùng nền ngoại tuyến.

## 3. Tệp bàn giao

- `output/appraisal/bo-mau-gpxd-nghiem-thu.zip`: 5 loại đầu ra × PDF/DOCX, 1 PDF scan, 1 hướng dẫn.
- `output/appraisal/gpxd-nghiem-thu/`: tệp đã giải nén.
- `output/appraisal/procedure-demo-manifest.json`: 52 hồ sơ đã bổ sung.
- `output/appraisal/legal-retrieval-evaluation.json`: kết quả truy hồi và hash nguồn.
- Bộ BCNCKT trước đó: `output/appraisal/bo-ho-so-mau-bcnckt.zip`.

## 4. Căn cứ và giới hạn

GPXD đối chiếu Điều 55–64 NĐ 217/2026 và [Phụ lục II bản gốc](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/pl217.pdf): khung Mẫu 03/04/05 theo thủ tục. Cấp lại là chuẩn bị bản sao giấy phép cũ theo Điều 64. Nghiệm thu đối chiếu Điều 24–28 và Phụ lục VI–VIII NĐ 207/2026 trong kho pháp lý. Đầu ra là **khung dự thảo phục vụ rà soát**, chưa phải biểu mẫu được Sở nghiệm thu nghiệp vụ; cán bộ phải xác nhận thẩm quyền, điều kiện và mẫu đúng loại công trình trước khi ban hành.

OCR giới hạn 18 MB, 300 trang, 20 giây/trang, 15 phút/công việc, raster tối đa 12 triệu pixel/trang. Chỉ nhận dạng trang ít chữ; chưa xử lý chuyên sâu bảng, bản vẽ, trang xoay/mờ. Spool ở thư mục riêng trên máy, không lưu JWT; triển khai nhiều máy cần kho công việc dùng chung. Chưa nghiệm thu tập scan lớn.

10/10 đo **tìm đúng điều khoản**, không chứng minh diễn giải AI đúng 100%. Bộ 20 hồ sơ/150 trang có nhãn chuyên viên, precision/recall và nghiệm thu pháp lý trong kế hoạch cần chuyên gia tham gia.

Máy phân giải `tile.openstreetmap.org` về loopback nên nền đường phố chưa dùng được. Natural Earth 1:50 triệu hỗ trợ demo ngoại tuyến, không thay bản đồ địa chính/quy hoạch chính thức. Không đổi DNS hoặc cơ chế chặn mạng của máy.

## 5. Bằng chứng đợt này

- TypeScript/Vite build thành công; các chunk tách riêng dưới 500 kB, PDF worker tải riêng.
- API đã lưu 52 phiếu trên cloud; đầu ra mẫu lấy qua API có xác thực từ dữ liệu đang lưu.
- Sáu PDF xuất/scan có kích thước A4 595 × 842 pt; đã render xem bố cục dự thảo.
- Tesseract đã nhận dạng tiếng Việt các trang phụ lục PDF gốc.
- Bộ đánh giá truy hồi 10/10 có kết quả JSON.
- Sau khi người dùng yêu cầu tiếp tục kiểm thử, đã chạy lại: **48/48 kiểm thử đạt**, các script cloud/workflow/danh mục/OCR đạt; Vertex thực tế và OCR 21 trang có kết quả lưu. Xem [báo cáo kiểm thử](DEMO_REGRESSION_2026_09_27.md) và [phiếu duyệt nghiệp vụ](PHIEU_DUYET_NGHIEP_VU_DEMO.md).

## 6. Giai đoạn sử dụng chính thức

Theo yêu cầu người dùng, **SMTP, domain và máy chủ production để sau**. Các gate vận hành thật còn: chuyên viên duyệt kho pháp lý/biểu mẫu; đánh giá OCR/AI có nhãn; ký số/cấp số/phát hành; SLA/lịch nghỉ và ủy quyền nghiệp vụ; tích hợp giá/quy hoạch/dịch vụ công; hạn mức chi phí, giám sát/CI, tải và phục hồi. Không coi bản demo là đã đạt toàn bộ G2–G5 production.
