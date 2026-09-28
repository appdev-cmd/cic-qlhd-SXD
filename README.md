# BuildAppraisal AI

Ứng dụng hỗ trợ tiếp nhận và rà soát hồ sơ BCNCKT với bằng chứng nguồn, xác nhận của chuyên viên và xuất dự thảo A4.

**Hướng dẫn sử dụng:** [Quy trình thẩm định có hỗ trợ AI — hướng dẫn chi tiết theo vai trò](docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md).

**Trạng thái demo:** Đã hoàn thiện đợt đối chiếu pháp lý và biểu mẫu `2026-07.v2`, 52 phiếu mẫu liên kết dự án. Xem [kết quả rà soát và phạm vi xác nhận](docs/LEGAL_FORMS_DEMO_REVIEW_2026_09_27.md). Domain, production và SMTP để sau theo yêu cầu.

**Cập nhật 28/09/2026:** Đã khắc phục quyền anonymous cloud, bổ sung gallery bền vững, dữ liệu demo và tối ưu truy vấn. Xem [bằng chứng kiểm thử và các gate còn lại](docs/IMPLEMENTATION_DELIVERY_2026_09_28.md), [ma trận quyền](docs/SECURITY_MATRIX.md) và [runbook](docs/RUNBOOK_2026_09_28.md). Theo yêu cầu người dùng, đã đổi bộ cổng để tránh dải Windows dành riêng: Web/API dùng chung địa chỉ 8208, Core/Worker dùng cổng nội bộ 8201/8200. Đã đăng nhập và tải hồ sơ cloud qua trình duyệt; AI/OCR thật chưa sẵn sàng. Thông tin provider ở các bàn giao ngày 27/09 là trạng thái lịch sử.

## Chạy trên máy

Yêu cầu Node.js 22 trở lên, pnpm và Python 3.11 trở lên. Script tự tìm Python đi kèm Codex; máy khác có thể đặt APPRAISAL_PYTHON.

```powershell
pnpm install
pnpm setup:appraisal
pnpm samples:build
pnpm dev
```

Mở **http://localhost:8208/projects/appraisal**. Một lệnh `pnpm dev` khởi động cả Worker, Core và Web theo thứ tự; chỉ báo sẵn sàng sau khi API qua Web trả HTTP 200. Giữ terminal chạy, dùng Ctrl+C để dừng cả bộ. `pnpm dev:appraisal` là tên lệnh tương đương; không chạy cả hai cùng lúc.

Cổng cố định đọc từ `config/runtime-ports.json`, không tự nhảy sang cổng khác khi bị chiếm. Trong chế độ `demo`, chọn **Nạp mẫu lần đầu** hoặc **Nạp mẫu đã bổ sung**. Trong chế độ `cloud`, đăng nhập bằng tài khoản đã được cấp profile. Gói tài liệu ở `output/appraisal/bo-ho-so-mau-bcnckt.zip`.

## Kiến trúc thực tế

| Thành phần | Công nghệ và vị trí | Cổng |
|---|---|---|
| Web và API công khai trên máy | React 19, Vite, TypeScript, Tailwind tại src/; proxy `/api/appraisal` | 8208 |
| Core nội bộ | NestJS tại services/core/, chỉ loopback | 8201 |
| Worker nội bộ | FastAPI tại ai/app/, chỉ loopback | 8200 |
| Lưu dùng thử | SQLite và bản gốc trong .appraisal-data/ | — |
| Lưu nghiệp vụ | Supabase Auth, PostgreSQL với RLS, private Storage và signed upload | — |

Repository hiện tại chưa phải Turborepo/Next.js. Redis, Prisma và vector database chưa được triển khai. Dashboard, danh mục, bản đồ và kho văn bản đã đọc dữ liệu cloud theo quyền; môi trường này vẫn phục vụ thử nghiệm.

## Chức năng hiện có

- Nộp PDF/DOCX/TXT; SHA-256, bản gốc, phiên bản và vai trò tài liệu.
- Nhận diện danh mục văn bản pháp lý trong tờ trình; chuyên viên xác nhận thành phần.
- Trích trường theo nhãn, xem nguồn, xác nhận/loại bỏ dữ liệu.
- Kiểm tra đủ hồ sơ, nhất quán chứng chỉ/tiêu chuẩn, tổng 7 khoản chi phí, chênh lệch cơ cấu, diện tích sàn và mật độ/hệ số.
- Adapter Responses API trả đề xuất có nguồn khi cấu hình mô hình và người dùng bật AI.
- Công việc nền, hủy/chạy lại, kiểm soát revision, lịch sử, ý kiến/giải trình và đánh giá chuyên viên.
- Xuất báo cáo, yêu cầu bổ sung, tạm dừng, thông báo rà soát, khung quyết định bằng DOCX/PDF A4 và JSON.
- Bộ mẫu gồm 17 tài liệu đầu vào, 10 đầu ra; mỗi tài liệu có DOCX/PDF, tổng 54 file văn bản.

## Cấu hình

Mặc định APPRAISAL_MODE=demo, dữ liệu lưu cục bộ. OPENAI_API_KEY và OPENAI_MODEL chỉ đặt phía server; không dùng tiền tố VITE_. Chưa cấu hình vẫn dùng được bộ quy tắc, giao diện hiển thị đúng trạng thái.

OCR tiếng Việt dùng Tesseract vie+eng, chạy qua hàng đợi khi bấm Đọc OCR: tối đa 300 trang, 18 MB và 15 phút/công việc. Bản gốc giữ nguyên; dữ liệu trích xuất cần chuyên viên xác nhận. Cấu hình TESSERACT_CMD, TESSDATA_PREFIX, APPRAISAL_OCR_SPOOL ở runtime riêng.

Xem [phạm vi triển khai và phần còn lại](docs/APPRAISAL_IMPLEMENTATION.md), [kế hoạch](implementation_plan.md) và [hướng dẫn bộ mẫu](output/appraisal/HUONG-DAN.md).

### Cloud thử nghiệm sau triển khai G0–G1

Đã kết nối nguồn dự án/hồ sơ dùng chung, đăng nhập toàn app, tải tệp trực tiếp có kiểm tra hash, phân trang server và hàng đợi bền vững. Có 161 hồ sơ/868 tài liệu đã đối soát, gắn với danh mục 26 dự án. Vertex vẫn dùng Gemini 3.8 Flash.

Xem [bàn giao, kiểm thử, đăng nhập và vận hành](docs/G0_G1_DELIVERY_2026_09_27.md). Mật khẩu, runtime DB và credential Vertex nằm ngoài repo. Đây là môi trường thử nghiệm; các chức năng còn lại và điều kiện nghiệm thu production được liệt kê trong tài liệu.

## Kiểm tra

Hướng dẫn mới nhất: [bản demo Sở Xây dựng, kịch bản theo vai trò và phần còn lại](docs/DEMO_SXD_2026_09_27.md). Đã bổ sung phân công/quy trình nội bộ, phiếu A4, hỏi đáp pháp luật có nguồn bằng Vertex Gemini 3.8 Flash. SMTP và production được hoãn theo yêu cầu người dùng.

Đợt bổ sung mới: [52 phiếu GPXD/nghiệm thu, CRUD danh mục, OCR nền, bản đồ ngoại tuyến và bộ mẫu](docs/DEMO_COMPLETION_2026_09_27.md). Bộ mẫu ở `output/appraisal/bo-mau-gpxd-nghiem-thu.zip`.

```powershell
pnpm build
pnpm test:appraisal
```

Kiểm tra dùng dữ liệu cục bộ cách ly. Adapter mô hình/OCR dùng phản hồi giả lập; gọi mô hình thật và kiểm thử RLS cloud cần môi trường đã cấu hình.

## Quy trình sau 01/07/2026

Tab Căn cứ pháp lý đối chiếu Điều 35 NĐ 217 và danh sách chứng chỉ theo Mẫu 01; mỗi điều kiện áp dụng và bằng chứng cần chuyên viên xác nhận. Bộ mẫu dùng ngày trình giả lập 27/09/2026. Khung Mẫu 03/09/15/16 xuất A4; trình xem PDF.js hiển thị trực tiếp từng trang.

Xem [báo cáo nghiên cứu pháp lý](docs/LEGAL_REVIEW_POST_2026_07.md) và [kiểm kê 187 tệp nguồn](docs/legal-corpus-inventory.json).
