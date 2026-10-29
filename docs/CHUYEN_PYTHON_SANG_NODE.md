# Chuyển backend Python sang Node.js/TypeScript

Yêu cầu: thay toàn bộ Python trong dự án bằng Node.js/TypeScript; OCR dùng AI, không phụ thuộc Tesseract.

## Trạng thái thực tế

**Chưa hoàn thành chuyển toàn bộ.** Backend sản xuất vẫn dùng entry `api/index.py`; launcher cục bộ vẫn khởi động worker Python. Chưa đổi cấu hình Vercel hoặc đẩy phần chuyển đổi chưa hoàn tất lên main.

Đã bổ sung backend TypeScript tại `services/appraisal/`:

- `auth.ts`: xác thực người dùng qua Supabase Auth, đọc profile đang hoạt động và phạm vi tỉnh/phòng; không dùng JWT chưa xác minh làm danh tính.
- `database.ts`: PostgreSQL qua `pg`, TLS kiểm chứng chứng chỉ, danh tính tài khoản đặt trong từng giao dịch, rollback và loại kết nối hỏng khỏi pool.
- `sqlite.ts`: tương thích bảng hồ sơ/tệp/hàng đợi cũ; giữ projection danh sách, trigger và truy vết hồ sơ bổ sung cũ. Chưa chuyển repository nghiệp vụ sử dụng projection này.
- `provider.ts`: adapter OpenAI Responses và Vertex, kiểm tra JSON theo schema, không chấp nhận kết quả bị cắt hoặc sai cấu trúc.
- `ocr.ts`: AI đọc một trang PDF mỗi lần, ghi nguồn trang, SHA-256 bản gốc và trạng thái chưa xác nhận. Không gọi Tesseract.
- `ingestion.ts`: đọc PDF có lớp chữ, DOCX, TXT; giới hạn dung lượng, chống DOCX giải nén quá lớn; gắn nguồn và cảnh báo cho OCR. Chưa chuyển trích xuất facts/checklist từ Python.
- `domain.ts`: ngày theo múi giờ Việt Nam, vô hiệu hóa kết quả cũ, giữ subtype khi lưu lịch sử phiếu, lựa chọn tài liệu mới nhất. Chưa chuyển toàn bộ từ vựng và hàm tạo hồ sơ.
- `bim-suite.ts`: tra cứu định mức, kiểm tra phạm vi workspace và trợ lý BIM có nguồn/audit; hỗ trợ hai nhà cung cấp AI. Chưa chuyển API BIM lưu tệp theo chunk của phân hệ cũ.
- `app.ts`: composition Express cho các route đã chuyển (runtime, health, readiness, định mức, trợ lý BIM, kiểm tra mô hình AI) và gateway cùng nguồn. **Chưa phải entry thay thế toàn bộ API hiện hành.**

## Bằng chứng kiểm tra

- `pnpm test:backend:node`: 20 bài kiểm thử thành công.
- `pnpm typecheck:core`: thành công, bao gồm backend mới.
- `pnpm test:web`: 35 bài kiểm thử thành công.
- `pnpm test:appraisal`: 148 bài kiểm thử backend hiện hành thành công; đây là kiểm tra hồi quy bản Python, không phải bằng chứng đã chuyển chúng sang Node.
- Đăng nhập bằng tài khoản chuyên viên thật, truy vấn bằng role database không có superuser/bypassrls: Node đọc đúng workspace và **12 mô hình / 38.739 cấu kiện**.
- OCR đã kiểm thử bằng phản hồi AI giả lập có kiểm tra schema và nguồn. Chưa kiểm thử OCR gọi nhà cung cấp thật: máy cục bộ không có cấu hình AI; biến môi trường AI trên Vercel thuộc loại sensitive và không trả giá trị để tải xuống.
- Chưa kiểm thử ghi/mở lại dữ liệu qua API Node trên Vercel, vì chưa chuyển entry triển khai.

Lệnh kiểm tra cloud chỉ đọc, dùng tài khoản thử nghiệm trong cấu hình riêng ngoài repository:

```powershell
$env:APPRAISAL_NODE_CLOUD_VERIFY='1'
node --import tsx scripts/verify-node-backend.ts --database-only
```

Bỏ `--database-only` khi môi trường chạy đã có nhà cung cấp AI; script dùng PDF kiểm thử tự tạo, không gửi hồ sơ thật.

## Công việc còn lại trước khi cắt Python

1. Chuyển đầy đủ repository, lọc/phân trang/sort, optimistic concurrency, chuỗi bổ sung, workflow, SLA, thẩm quyền và nghiệp vụ BCNCKT/GPXD/nghiệm thu. Không bỏ qua các điều kiện chặn phê duyệt hiện có.
2. Chuyển toàn bộ route, upload tài liệu, trích facts/checklist, hàng đợi bền vững, hủy công việc và lưu kết quả OCR/AI kèm audit. Không lưu access token người dùng trong hàng đợi.
3. Chuyển sinh PDF/DOCX, đóng dấu, gallery, hồ sơ mẫu, tra cứu pháp lý và các công cụ quản trị Python. Kiểm tra khổ A4, lề, dấu tiếng Việt và nguồn trích dẫn.
4. Chuyển 148 kiểm thử nghiệp vụ và công cụ export OpenAPI/kiểm tra schema sang Node; so sánh hợp đồng API và kết quả với bản hiện hành.
5. Đổi launcher sang Node, giữ cổng Worker 8200/Core 8201/Web 8208; đổi entry Vercel, danh sách file bundle và CI. Sau khi hoàn tất mới bỏ requirements, Python runtime và mã Python.
6. Kiểm thử bản preview Vercel: đăng nhập, phân quyền, tải IFC thật, chuyển đổi 3D, lưu/mở lại mô hình và góc nhìn, nộp hồ sơ, OCR AI thật, xử lý nghiệp vụ và xuất tài liệu. Sau khi đạt mới push main để deploy.

Không xóa dữ liệu Supabase hoặc tệp IFC trong quá trình chuyển. Thay đổi đang có của người dùng ở `ai/app/demo_summary.py` được giữ nguyên; phần projection Node đã đưa logic truy vết hồ sơ bổ sung vào cùng schema.
