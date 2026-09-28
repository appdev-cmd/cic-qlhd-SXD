# Tiến độ triển khai tối ưu — 28/09/2026

## 1. Trạng thái

Người dùng đã duyệt `implementation_plan.md` bằng tin nhắn **“ok”**. Đã triển khai gói quyền dữ liệu, nền tảng runtime, gallery, bảng, dữ liệu demo, tối ưu truy vấn demo và adapter AI. **Chưa hoàn tất toàn bộ các gate A–F**; các phần còn lại được ghi tại mục 5.

Các thay đổi có sẵn ở launcher/Core được đối chiếu. Theo yêu cầu đổi cổng của người dùng, bộ cổng hiện đọc từ `config/runtime-ports.json`; `pnpm dev` khởi động cả ba dịch vụ. Migration anonymous cũ giữ nguyên như lịch sử; migration khắc phục mới đã áp vào cloud thử nghiệm. Credential và backup nằm ngoài repository.

## 2. Thay đổi đã thực hiện

| Phần | Kết quả |
| --- | --- |
| Quyền cloud | Bỏ 22 policy `anon_dev_read`; thu hồi quyền RPC backend của anonymous/client; kiểm tra lại Auth, RLS và Storage |
| Runtime | Đọc cấu hình riêng, kết nối DB bằng login không superuser/BYPASSRLS; TLS verify-full với CA Supabase; preflight cổng và readiness |
| Baseline | Schema 22 bảng, 32 hàm, 33 policy, 5 sequence; đã chạy trên PostgreSQL cách ly với tiền đề Auth/Storage mô phỏng |
| Backup/restore | Backup riêng 22 bảng/1.818 dòng; khôi phục cục bộ, đối soát toàn bộ bản ghi theo kiểu SQL và kiểm tra 29 khóa ngoại |
| Gallery | Lưu metadata/bản gốc, hash, CAS revision, private Storage, audit; modal con và dữ liệu chưa lưu được bảo vệ |
| Bảng và kho văn bản | Resize/sort bảng dự án và TT39; dự án sort trước phân trang tại server; kho văn bản có trang tiếp theo, giữ lựa chọn đã chọn |
| UI | AutoTableTooltip dùng Tooltip chung; bỏ HTML title/native select/date còn được scanner phát hiện; state riêng theo tài khoản/tỉnh/phòng; chỉnh ngày dd/mm/yyyy cũ |
| Demo | Danh mục fixture được truy vấn SQLite; dashboard phân biệt hồ sơ gốc/lần nộp; bảng tóm tắt đồng bộ bằng trigger cùng giao dịch |
| API/AI | Dùng API client chung; adapter provider chung cho BCNCKT và tra cứu pháp luật; chọn trích đoạn theo ngân sách và hiển thị coverage/provenance |
| A4 | Render 14 trang DOCX mẫu; sửa hàng bảng bị tách trang, render lại hai phiếu rà soát; không thay đổi nội dung căn cứ pháp lý |
| CI | Bổ sung workflow lint/typecheck/build/unit test và dựng baseline trên PostgreSQL 17; chưa chạy workflow trên GitHub |

### Phạm vi dữ liệu cloud đã thay đổi

- Áp `20260928000002_close_anonymous_access.sql` và `20260928000003_project_gallery.sql`, ghi ledger.
- Thêm cột `projects.images_revision`, hàm gallery và bucket private.
- Tạo login DB cục bộ riêng và bốn tài khoản staging riêng theo vai trò; không gửi email, không đổi mật khẩu tài khoản hiện hữu.
- Đối soát trước/sau việc đóng quyền anonymous: hash/count các bảng nghiệp vụ không đổi; ledger tăng theo migration.
- Dự án/ảnh tạm của kiểm thử gallery đã xóa đúng phạm vi kiểm thử.

## 3. Bằng chứng kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm build` | Đạt TypeScript frontend và build Vite |
| `pnpm typecheck:core` | Đạt |
| `pnpm lint:ui` | 0 vi phạm trong các quy tắc scanner đang kiểm tra |
| `pnpm test:appraisal` | 66/66 đạt, gồm test mất kết nối provider và nhất quán projection khi rollback |
| `verify_access_hardening.py` | Anon bị chặn; bốn role đăng nhập/đọc đúng scope; RPC backend bị chặn với client; actor không tồn tại đọc 0 dòng |
| Scope âm tính | Tỉnh khác/phòng khác/inactive bị helper scope từ chối trong giao dịch rollback; chưa thay thế mọi kịch bản E2E qua Data API |
| `verify_gallery_cloud.py` | Reload giữ ảnh, tải đúng bytes/hash, CAS 409, director 403, anonymous không tải được bản gốc, audit resolve tên |
| Readiness qua FastAPI TestClient | HTTP 200; cloud ready, DB connected; modelConfigured=false, ocrAvailable=false |
| Runtime và đăng nhập trình duyệt | Worker 8200 → Core 8201 → Web 8208 sẵn sàng; runtime qua Web HTTP 200; chuyên viên đăng nhập và tải 64 hồ sơ BCNCKT |
| Cổng bận và boundary | Chạy thêm `pnpm dev` bị từ chối, không đổi cổng; readiness có token HTTP 200, Origin lạ và Worker không có internal token HTTP 403 |
| Baseline cách ly | 22 bảng/33 policy/5 sequence; RLS bật, anon bị chặn, hàm scope/ngày làm việc chạy được |
| Restore cách ly | 22 bảng/1.818 dòng khớp, 29 FK hợp lệ; chỉ mô phỏng Auth user ID, chưa restore Storage hoặc credential Auth |
| Truy hồi điều khoản | 14/14 câu hỏi có nguồn kỳ vọng trong bộ trích đoạn; không đo độ đúng diễn giải AI |
| DOCX | LibreOffice render 7 mẫu/14 trang; phiếu có bảng đã render lại, giữ hàng nguyên trang và lặp header |

Scanner UI hiện kiểm tra HTML title, native select, input date và toLocaleDateString. Kết quả 0 không đồng nghĩa đã kiểm tra tự động đủ dark mode, EntityLink, guard và thứ tự filter ở mọi màn hình.

## 4. Đo hiệu năng có thể tái lập

`python scripts/benchmark_appraisal.py`: SQLite cách ly, 10.000 lần nộp/5.000 hồ sơ gốc, mỗi lần nộp có văn bản nguồn mô phỏng; 7 lượt đo. Dữ liệu được dọn sau phép đo.

| Truy vấn | Median trước bảng tóm tắt | Median sau |
| --- | ---: | ---: |
| Trang đầu 50 dòng, tìm không dấu/sort tên | 686,77 ms | 44,55 ms |
| Trang cuối 50 dòng | 834,83 ms | 82,53 ms |
| Dashboard | 2.215,45 ms | 16,53 ms |

Payload trang 50 dòng: 27.123 byte; không chứa tài liệu/trích đoạn. Paging, số đếm và không trùng trang đều được xác nhận. Đây là số đo truy vấn demo trên máy hiện tại, chưa phải latency HTTP hoặc benchmark cloud/đa người dùng. Bảng tóm tắt có backfill dữ liệu cũ và trigger insert/update/delete; rollback phải giữ cả payload và tóm tắt nhất quán.

## 5. Các gate còn lại

| Gate | Phần cần làm tiếp | Điều kiện phụ thuộc |
| --- | --- | --- |
| A | Kiểm thử mọi quyền ghi/assignment/inactive qua API; nâng cấp/rollback đầy đủ; restore Auth/Storage | Môi trường Supabase cách ly và chính sách backup Auth/Storage |
| B | Khởi động và đăng nhập qua gateway đã đạt trên bộ cổng mới; còn các kịch bản lỗi/restart và demo toàn bộ phân hệ | Runtime cloud đã hoạt động; AI/OCR thật chưa sẵn sàng |
| C | E2E backdrop/ESC/modal lồng nhau, reload gallery, sort/filter/paging; rà dark mode và EntityLink toàn bộ; đồng bộ SLA/workflow | Runtime hoạt động; liên kết ID danh mục cho dữ liệu TT39 còn thiếu |
| D | Sinh contract API/types; tách routes/service/repository tiếp; benchmark cloud/queue, lease/restart, cleanup/spool và quan sát vận hành | Runtime và DB kiểm thử tải lớn |
| E | AI thật, OCR thật, quota/token/chi phí, corpus/version, đánh giá có nhãn chuyên viên; nghiệm thu nội dung mẫu | Credential/model chưa cấu hình, Tesseract vie+eng chưa sẵn sàng, cần chuyên viên |
| F | Chạy CI từ xa, browser E2E/UAT, phục hồi toàn hệ thống và ký xác nhận thử nghiệm | Các gate trên và người phụ trách nghiệm thu |

Một số tên trong TT39 chưa có ID danh mục thật; hiện chỉ mở EntityLink khi có ID liên kết từ nhà thầu của dự án. Không tạo URL/ID từ tên. Việc bỏ nhãn “đồng bộ CSDL quốc gia” và “đã ký số” không xác minh giúp màn hình phản ánh đúng nguồn dữ liệu đang lưu.

## 6. Cổng ổn định và kết nối đã khắc phục

Nguyên nhân màn hình không kết nối: Web cũ vẫn hoạt động nhưng Core/Worker chưa chạy; Windows chặn cổng Worker 8000 trong dải dành riêng 7972–8071. Người dùng đã yêu cầu chọn cổng mới và dùng một địa chỉ ổn định.

Đã chuyển sang địa chỉ chung **http://localhost:8208/projects/appraisal**, Core 8201 và Worker 8200 nội bộ. Cổng cố định từ một file cấu hình, kiểm tra trước khi chạy và không tự nhảy cổng. `pnpm dev` chờ từng dịch vụ sẵn sàng; API qua Web đã trả HTTP 200. Đăng nhập chuyên viên và tải dữ liệu cloud thành công trên trình duyệt. Build, core typecheck, lint UI và 66 unit test chạy lại đạt sau thay đổi.

PostgreSQL kiểm thử đã dừng sau khi đối soát restore. AI/OCR thật và các gate còn lại vẫn theo mục 5; môi trường hiện tại phục vụ thử nghiệm.

Xem [ma trận quyền](SECURITY_MATRIX.md) và [hướng dẫn vận hành](RUNBOOK_2026_09_28.md).
