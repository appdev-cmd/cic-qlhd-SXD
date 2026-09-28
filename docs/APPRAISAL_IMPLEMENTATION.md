# Kết quả triển khai thẩm định BCNCKT

Ngày 27/09/2026. Triển khai sau khi người dùng phê duyệt kế hoạch và yêu cầu thêm bộ hồ sơ mẫu đầu vào/đầu ra.

## Phạm vi sử dụng ngay

Mở http://localhost:3008/appraisal. Bộ mẫu và các hồ sơ tự tạo được lưu cục bộ, có thể nộp file, xem bằng chứng, xác nhận dữ liệu, chạy kiểm tra, ghi đánh giá và xuất tài liệu. Hồ sơ tạo từ tab BCNCKT của dự án được liên kết bằng `projectId`.

1. Tạo hồ sơ, chọn địa phương công trình và thời điểm đánh giá. Phạm vi phòng ban lấy từ tài khoản; địa phương công trình không tự đổi quyền truy cập.
2. Nộp tờ trình. Văn bản được nhận diện xuất hiện trong danh mục đề xuất có trích dẫn. Chuyên viên xác nhận hoặc thêm thủ công khi chưa nhận diện. Việc dẫn tên không thay thế nộp bản gốc.
3. Nộp các bộ tài liệu đúng thành phần; kết quả cũ/dự thảo tham khảo chọn vai trò tham khảo.
4. Xem và xác nhận dữ liệu quan trọng. Bộ trích xuất nhãn chưa bao quát mọi cách trình bày; trường không tìm được không được suy đoán.
5. Chạy kiểm tra đầu vào. Chế độ đối chiếu tham khảo là lựa chọn riêng. Mỗi nhận xét nêu nguồn hoặc dữ liệu thiếu; kiểm tra số học không thay thế kết luận tuân thủ.
6. Ghi đánh giá và giải trình. Bản bổ sung tạo phiên bản mới, kết quả cũ cần chạy lại. Đánh giá lượt cũ không tự chuyển thành phê duyệt lượt mới.
7. Xuất dự thảo. Hoàn tất rà soát nội bộ yêu cầu xử lý nhận xét và dữ liệu chờ xác nhận; chưa phải ký hoặc ban hành.

## Kiến trúc thực tế

| Thành phần | Vị trí và trách nhiệm |
|---|---|
| Web React/Vite | `src/pages/AppraisalPage.tsx`, `src/pages/projects/appraisal/AppraisalWorkspace.tsx`, cổng 3008 |
| Core NestJS | `services/core/main.ts`, cổng 3001, chuyển tiếp JWT và token nội bộ đến worker |
| Worker FastAPI | `ai/app/main.py`, cổng 8000, tiếp nhận, công việc nền và xuất file |
| Đọc tài liệu | `ingestion.py`, PDF/DOCX/TXT, đoạn nguồn, cảnh báo chữ ký/PDF phục hồi/scan |
| OCR tùy chọn | `ocr.py`, Tesseract cục bộ; giữ nguyên bản gốc |
| Bộ quy tắc | `rules.py`, Decimal, kiểm tra nhất quán và yêu cầu chuyên ngành |
| Adapter mô hình | `provider.py`, Responses API có schema chặt, `store=false`, chỉ gửi trích đoạn khi người dùng bật AI |
| Lưu trữ | `store.py`, SQLite dùng thử hoặc Supabase JWT/RLS/private Storage |
| Xuất tài liệu | `reporting.py`, DOCX/PDF A4, lề 30/20/22/20 mm, Times New Roman |

Chế độ dùng thử chỉ chấp nhận hostname localhost/127.0.0.1. File gốc và SQLite nằm trong `.appraisal-data/`, được bỏ qua khi quản lý Git. Danh sách phân trang 100 hồ sơ; bộ lọc giao diện áp dụng trang đang xem.

Mô hình chỉ xem tối đa 55.000 ký tự trích đoạn và tạo tối đa 8 đề xuất; nếu bị cắt phạm vi sẽ có thông báo. Nguồn trích dẫn được kiểm tra tồn tại, chuyên viên vẫn phải kiểm tra nguồn có thực sự hỗ trợ nhận xét. Không gửi API key xuống trình duyệt.

## Bộ mẫu được giao

Gói `output/appraisal/bo-ho-so-mau-bcnckt.zip`:

| Nhóm | Nội dung |
|---|---|
| Đầu vào lần đầu | 14 tài liệu: TTR, PL01–PL07, KT01–KT05, NL01; mỗi tài liệu DOCX/PDF |
| Đầu vào bổ sung | KT03, KT05, NL01 phiên bản 2; mỗi tài liệu DOCX/PDF |
| Đầu ra lần đầu | report, supplement, suspension, notice, decision; mỗi loại DOCX/PDF và JSON đầy đủ |
| Đầu ra sau bổ sung | Cùng 5 loại và JSON đầy đủ |
| Quản lý gói | Hướng dẫn, manifest, SHA-256 và kết quả tóm tắt |

Tổng 54 file văn bản: 34 bản đầu vào và 20 bản đầu ra. Tất cả có nhãn mô phỏng; phiếu pháp lý không phải văn bản nhà nước giả lập. Nhân sự/chứng chỉ dùng mã SAMPLE. Khảo sát/TKCS cung cấp dữ liệu thử, không phải bộ thiết kế để thi công.

Kết quả được tính từ tài liệu mẫu qua cùng quy trình tiếp nhận. Lần đầu có chênh diện tích 411 m² và khác mã chứng chỉ/năm tiêu chuẩn. Lần bổ sung thống nhất giá trị mẫu; tổng đầu tư trước/sau đều 217.230.000.000 đồng, tiết kiệm ròng 0 đồng. Bể hữu ích và kích thước ngoài không đủ kết luận PCCC. Các phạm vi chuyên ngành vẫn cần chuyên viên.

Chạy `pnpm samples:build` để tái tạo gói. Các file gốc Hương Xuân không bị sửa. Báo cáo đóng gói sử dụng quy tắc, chưa gọi mô hình AI.

## Chuyển sang Supabase

Chưa áp dụng migration lên DB cloud; môi trường hiện tại dùng thử cục bộ. Các bước cho môi trường nghiệp vụ:

1. Áp dụng migration nền nếu chưa có, rồi `supabase/migrations/20260927000002_appraisal_workspace.sql` trên staging.
2. Quản trị DB gán `profiles.province_id`, `department`, `role`, `is_active`. Migration thu hồi quyền ghi profile trực tiếp của anon/authenticated để ngăn tự đổi quyền. Nếu cần tự cập nhật thông tin cá nhân, dùng RPC riêng chỉ cho phép các trường không liên quan phân quyền.
3. Cấu hình `APPRAISAL_MODE=supabase`, URL/anon key Supabase phía server và URL/anon key public phía web. Không đưa service-role key xuống trình duyệt.
4. Đăng nhập tài khoản nghiệp vụ. RLS lọc theo tỉnh/phòng ban và vai trò; bucket `appraisal-originals` riêng tư. Worker sử dụng JWT người dùng khi gọi REST/Storage.
5. Kiểm thử tài khoản chéo tỉnh/phòng ban và quyền lãnh đạo trên staging trước khi tiếp nhận hồ sơ thật. Chưa xác nhận migration/RLS trên cloud.

RPC dùng revision để chống ghi đè, ngăn sửa lịch sử audit đã có; lưu sự kiện và lượt phân tích vào `appraisal_audit_logs`/`appraisal_ai_logs`. Các bảng này chỉ đọc theo phạm vi hồ sơ. MVP lưu aggregate JSONB; chưa chuyển danh mục cũ sang mô hình này.

## Cấu hình AI và OCR

- Đã kết nối Vertex AI và chuyển cấu hình hiện tại sang Gemini 3.8 Flash (global), từ cấu hình tham khảo từ dự án qlda-ddcn-ht-selfhost. Đã nhận phản hồi kết nối và lưu 6 đề xuất AI trên một hồ sơ mô phỏng; chi tiết tại [VERTEX_AI_CONNECTION.md](VERTEX_AI_CONNECTION.md). Người dùng bật Phân tích thêm bằng mô hình AI để gửi trích đoạn. OpenAI vẫn là lựa chọn cấu hình khác, chưa được kích hoạt.
- OCR cần Tesseract với bộ ngôn ngữ vie và eng; đặt `TESSERACT_CMD` nếu executable chưa có trong PATH. Môi trường hiện tại chưa phát hiện OCR. Nhánh OCR được kiểm tra bằng phản hồi giả lập, chưa đo độ chính xác scan tiếng Việt thực tế.
- Tệp tối đa 18 MB, 300 trang, 1,5 triệu ký tự. OCR tối đa 2 trang scan/tệp, 20 giây/trang. Scan dài cần chia nhỏ hoặc bổ sung lớp chữ.
- Chữ ký PDF chỉ được ghi nhận có dấu hiệu/chưa xác minh; không kết luận xác thực từ tên `_signed`.

## Bằng chứng kiểm tra

- TypeScript/Vite build đã qua; còn cảnh báo bundle ứng dụng lớn hơn 500 kB.
- Bộ kiểm tra API/worker: số học, tiết kiệm 0 đồng, nguồn trích dẫn, tờ trình thật nhận đủ 7 mã pháp lý, tách tham khảo/đầu vào, giữ bản gốc, trùng file, revision, số thập phân, hết hiệu lực, chặn hoàn tất khi chưa rà soát, A4, nguồn AI giả, phân trang/job nền và OCR chưa xác minh.
- Trình duyệt: nạp mẫu, bảng chi phí, mở panel/form, Escape giữ dữ liệu chưa lưu, danh sách xuất dự thảo; dữ liệu giữ sau tải lại.
- Render 27 DOCX bằng LibreOffice và 27 PDF, tổng 113 trang kiểm tra bố cục; kiểm tra kích thước A4 của PDF.

## Phần còn lại của lộ trình

### Tổ chức hồ sơ theo dự án (27/09/2026)

#### Bộ mẫu đầy đủ cho danh mục dự án

- Chạy `pnpm samples:projects` để nạp mẫu vào kho demo cục bộ. Script lấy trực tiếp mã và thông tin từ `MOCK_PROJECTS`, không duy trì một danh mục mã dự án khác.
- Đã nạp 26 dự án × 3 nghiệp vụ × 2 lần nộp = **156 hồ sơ**. BCNCKT có 390 tài liệu, cấp phép có 208 tài liệu, hậu kiểm/nghiệm thu có 208 tài liệu: tổng **806 tệp TXT UTF-8** có nội dung, tải được bản gốc. Mỗi hồ sơ được gắn `projectId`, `projectName`, `projectCode`, loại nghiệp vụ và số lần nộp.
- Lần đầu BCNCKT thiếu danh mục năng lực và lệch phép cộng chi phí 1 triệu đồng; lần bổ sung cung cấp danh mục và sửa phép cộng. Cả hai lần chạy bộ quy tắc trên tài liệu mẫu, có trích xuất, nhận xét và bản tóm tắt; chưa xác nhận hợp lệ pháp lý.
- Hồ sơ cấp phép có đơn đề nghị, danh mục đính kèm, thuyết minh danh mục bản vẽ và phiếu xử lý. Hồ sơ hậu kiểm có đề nghị kiểm tra, danh mục quản lý chất lượng, thuyết minh danh mục hoàn công và phiếu xử lý. Lần đầu yêu cầu bổ sung, lần sau tiếp nhận giải trình; không tạo giấy phép hoặc thông báo nghiệm thu đã ban hành.
- Các kịch bản độc lập và có nhãn mô phỏng, không xác nhận tiến độ thật của dự án. Ngày trình mô phỏng đều sau 01/07/2026. Các tệp thuyết minh không thay thế bản vẽ hoặc chứng cứ hiện trường.
- Bộ nạp chỉ cho chạy trong `APPRAISAL_MODE=demo`, dùng UUID xác định theo dự án/nghiệp vụ/lần nộp và giao dịch ghi đồng thời hồ sơ với tệp. Hồ sơ đã tồn tại được giữ nguyên, kể cả khi người dùng đã chỉnh sửa; không gán lại hoặc xóa hồ sơ cũ.
- Có thể đọc nội dung tài liệu và giải trình ngay trong hồ sơ cấp phép/hậu kiểm. Bảng danh sách hiển thị số tài liệu mỗi hồ sơ.

- Quản lý Dự án có ba phân hệ con: `/projects/appraisal`, `/projects/permits`, `/projects/inspections`. Đường dẫn `/appraisal` cũ chuyển đến phân hệ BCNCKT; đường dẫn `/dossiers/{id}` vẫn mở đúng loại hồ sơ.
- Mỗi phân hệ liệt kê các lần nộp của tất cả dự án trong phạm vi quyền; ba tab trong chi tiết dự án dùng cùng dữ liệu, lọc theo mã dự án và loại nghiệp vụ ở máy chủ trước khi phân trang 100 dòng.
- Hồ sơ mới chọn dự án hoặc tự nhận dự án từ tab đang mở. Mỗi dự án có thể có nhiều lần nộp độc lập. Hồ sơ cũ chưa liên kết vẫn được giữ và có thao tác Gắn dự án; thay đổi liên kết có lịch sử và làm mất hiệu lực kết quả kiểm tra cũ.
- Cấp phép và hậu kiểm có tiếp nhận tài liệu, tải bản gốc, phiên bản và lịch sử riêng. Các nhóm tài liệu chỉ phục vụ lưu trữ, chưa phải checklist pháp lý đầy đủ cho hai nghiệp vụ này. API chặn áp dụng bộ phân tích và mẫu xuất BCNCKT cho hồ sơ khác loại.
- Danh mục chọn dự án dùng cùng dữ liệu minh họa `MOCK_PROJECTS` với trang Quản lý Dự án hiện tại. Hồ sơ và tài liệu được lưu qua adapter đang cấu hình; việc tích hợp danh mục dự án thật vẫn thuộc giai đoạn chuyển đổi dữ liệu.
- Thay đổi đợt này được biên dịch TypeScript/Vite; không chạy thêm bộ kiểm thử tự động hoặc kiểm thử giao diện.

Đây là MVP cục bộ có adapter triển khai. Chưa có kho RAG pháp lý đầy đủ được chuyên viên duyệt, trích xuất tự do mọi cấu trúc, XLSX/CAD/BIM, tính toán kết cấu/PCCC chuyên ngành, xác minh mật mã chữ ký, tích hợp DVC/ký số/ban hành. Job dùng thread pool một process, chưa có Redis/retry bền vững/đa máy; công việc dang dở sau restart được ghi gián đoạn và cần chạy lại.

Các phần trên và kiểm thử nghiệp vụ độc lập trên nhiều dự án cần hoàn thiện trước khi thẩm định chính thức. Bộ mẫu không chứng minh độ chính xác tổng quát.

## Bổ sung pháp lý theo chỉ đạo sau 01/07/2026

- Đã nghiên cứu điều khoản trọng tâm của Luật 135/2025, NĐ 217, NĐ 206 và các văn bản liên quan; báo cáo chi tiết tại `LEGAL_REVIEW_POST_2026_07.md`. Kiểm kê 187 tệp có SHA-256, cờ bản chuyển đổi/dự thảo/tên sai; không tự công nhận toàn bộ kho còn hiệu lực.
- `legal.py`: bộ chọn chế độ và phạm vi; 16 mục đối chiếu NĐ 217 (15 mục từ Điều 35 và danh sách mã chứng chỉ theo Mẫu 01). Có xác nhận điều kiện và liên kết nhiều nhóm chứng cứ, audit, vô hiệu kết quả cũ.
- `draft_templates.py`: khung Mẫu 03 có sáu phần, Mẫu 09 có 19 nhóm thông tin, Mẫu 15/16 phân biệt bổ sung thành phần và lỗi trong quá trình thẩm định. Mẫu 07/08 chưa được tự soạn cho phạm vi khác.
- Bộ mẫu trình mới giả lập ngày 27/09/2026; không thay hồ sơ Hương Xuân gốc. Lần đầu 87 trường/45 nhận xét; sau bổ sung 115 trường tính cả lịch sử/41 nhận xét. Checklist pháp lý còn các mục chờ xác định và thiếu chứng cứ, không coi bộ mẫu là hồ sơ đủ điều kiện.
- 23 ca kiểm tra API/worker/pháp lý đã qua. TypeScript/Vite build đã qua sau sửa thư viện xem PDF; còn cảnh báo kích thước bundle.
- Trình xem PDF dùng PDF.js tải riêng, vẽ canvas theo trang trong khung A4 cố định; có vừa chiều rộng/100%, trang trước/sau. Đã kiểm tra hiển thị thực tế trong trình duyệt của ứng dụng.
