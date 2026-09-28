# Báo cáo rà soát full stack — 27/09/2026

**Phạm vi:** mã nguồn tại `D:\01_Projects\cic-qlhd-SXD`, runtime cục bộ và Supabase cloud do người dùng cung cấp. Chỉ đọc và lập tài liệu. Không chạy migration, sửa quyền, ghi dữ liệu cloud, gọi AI phân tích mới hoặc chạy bộ test/build trong đợt này.

## 1. Kết luận

Đã có MVP xử lý BCNCKT và kết nối Vertex AI. Các thành phần hiện chưa tạo thành một hệ thống production thống nhất: giao diện còn dùng mock, hồ sơ mới lưu ở SQLite demo, cloud có schema nghiệp vụ từ đợt trước và quyền phát triển đang mở rộng. Cần xử lý quyền và hợp nhất dữ liệu trước khi đưa hồ sơ thật vào hệ thống.

Các mức bằng chứng:

- **Cloud:** đọc catalog, định nghĩa hàm, quyền hiệu lực, số lượng bản ghi bằng Management API với truy vấn chỉ đọc.
- **Mã nguồn:** đọc implementation và migration trong repo; không khẳng định mọi đoạn đã chạy trên cloud.
- **Runtime:** health cục bộ và số lượng SQLite chỉ đọc; trạng thái kết nối AI là kết quả kiểm tra đã lưu trước đó.
- **Chưa đánh giá:** khai thác lỗ hổng thực tế, tải, chất lượng OCR/AI trên tập chuẩn, vận hành production, ký số và các hệ thống ngoài.

Không lưu mật khẩu, publishable key hoặc management token vào báo cáo. Chưa dùng mật khẩu database vì Management API đã đủ cho việc đọc metadata.

## 2. Hai nguồn dữ liệu đang tách rời

### 2.1. Máy cục bộ

Health Core trả `mode=demo`, provider Vertex, model `gemini-3.8-flash`, `ocrAvailable=false`. Trạng thái kết nối lưu gần nhất là connected, lúc 10:53:54 ngày 27/09/2026 theo giờ +07; kiểm tra này không chứa hồ sơ. Chưa chạy đánh giá đầu cuối mô hình 3.8 trong đợt rà soát.

| Nghiệp vụ | Hồ sơ/lần nộp | Tài liệu |
| --- | ---: | ---: |
| BCNCKT | 57 | 452 |
| GPXD | 52 | 208 |
| Hậu kiểm/nghiệm thu | 52 | 208 |
| Tổng | 161 | 868 |

Bộ seed mới có 156 lần nộp liên kết 26 dự án; đây là dữ liệu mô phỏng, chưa phải thống kê hồ sơ tiếp nhận chính thức.

### 2.2. Cloud Supabase được cung cấp

Project ref: `cekaigfnriatarytvymb`. Không đọc nội dung hồ sơ/cá nhân; chỉ thống kê số lượng và metadata cần cho kế hoạch.

| Bảng | Số bản ghi |
| --- | ---: |
| `projects` | 26 |
| `organizations` | 32 |
| `personnel` | 40 |
| `staff_users` | 9 |
| `profiles` | 0 |
| `material_prices` | 5 |
| `project_documents` | 0 |
| `audit_logs` | 0 |
| `ai_logs` | 0 |

- Cloud có 15 bảng public, 2 view lịch sử dùng `security_invoker=true`; có các hàm dashboard, ngày làm việc và chuyển trạng thái. Cần kế thừa sau khi rà quyền và nghiệp vụ, không xây lại toàn bộ một cách mù quáng.
- Chưa có `appraisal_cases`, `appraisal_audit_logs`, `appraisal_ai_logs`, `save_appraisal_case`; `profiles` chưa có `province_id` mà worker cloud đang yêu cầu.
- Storage chưa có bucket. Do đó cloud hiện chưa đáp ứng adapter hồ sơ mới.
- Migration ledger đang ở `public.schema_migrations`, gồm initial schema và ba migration ngày 26/09: `schema_v2_core`, `dev_open_access`, `workflow_sla`.
- Repo hiện chỉ có migration initial và `20260927000002_appraisal_workspace.sql`. Ba migration cloud nói trên không có trong thư mục migration đang làm việc. Cần tìm bản gốc hoặc dựng baseline được review; không chạy lại migration bằng phỏng đoán.
- Chưa xác minh nguồn gốc/thực chất của các bản ghi cloud. Không mặc nhiên coi 26 dự án cloud là dữ liệu thật chỉ vì có số lượng bằng bộ mock.

## 3. Phát hiện ưu tiên

### C01 — P0 — Quyền phát triển rộng đang tồn tại trên cloud

**Bằng chứng cloud:** 13 bảng có policy `dev_open_access`, roles `anon` và `authenticated`, command `ALL`, điều kiện `USING true` / `WITH CHECK true`. Catalog quyền hiệu lực xác nhận cả hai role có SELECT/INSERT/UPDATE/DELETE và USAGE schema. Bao gồm projects, organizations, personnel, staff_users, project_documents, audit_logs, ai_logs và các bảng nghiệp vụ khác.

`public.schema_migrations` chưa bật RLS, đồng thời hai role có các quyền CRUD. `profiles` có RLS nhưng không có policy trong inventory; không kết luận bảng này mở chỉ vì grant rộng — không có policy cho role thông thường sẽ chặn truy cập.

**Tác động:** cấu hình DB cho phép truy cập/ghi dữ liệu nghiệp vụ và lịch sử ngoài phạm vi người dùng dự kiến. Chưa thực hiện thao tác khai thác hay sửa dữ liệu để chứng minh; chưa có bằng chứng đã xảy ra truy cập trái phép.

**Hướng xử lý:** thu hồi quyền không cần thiết, bỏ policy dev đúng bảng, tạo scope/role/assignment policy; bảo vệ migration ledger và lịch sử khỏi client; kiểm tra cả view/RPC/Storage. Giữ service accounts có quyền riêng. Đây là điều kiện trước khi tiếp nhận dữ liệu thật.

### C02 — P0 — RPC chuyển trạng thái cloud tin danh tính từ client

**Bằng chứng cloud:** `transition_dossier(...)` là `SECURITY DEFINER`, lấy `v_actor` từ `request.headers ->> 'x-actor-id'`, tra role trong `staff_users`. Cả `anon` và `authenticated` có EXECUTE. Định nghĩa đọc được không xác thực actor bằng `auth.uid()`, không kiểm tra tỉnh/phòng và active actor. `refresh_sla_status()` cũng có EXECUTE cho hai role.

**Tác động:** người gọi có thể khai danh tính cán bộ qua header để đi vào nhánh quyền nghiệp vụ. C01 còn cho phép sửa chính bảng `staff_users`; sửa UI đơn thuần không khắc phục được.

**Hướng xử lý:** ánh xạ Supabase Auth UUID với hồ sơ cán bộ; danh tính lấy từ token đã xác thực, xác nhận active/tenant/department/assignment trong DB; bỏ header làm nguồn quyền; thu hẹp EXECUTE. Rà các chuyển bước ký/phát hành và tách admin kỹ thuật khỏi người ký nghiệp vụ.

### C03 — P0/P1 — Cloud, migration repo và identity chưa khớp

**Bằng chứng:** mục 2.2; 9 `staff_users` nhưng 0 `profiles`; worker `actor_for()` đọc `profiles.province_id`; không có bảng/bucket hồ sơ mới. Schema cloud đã có `province_code`, workflow, holidays, search_text nhưng repo mới chưa thể hiện đầy đủ lịch sử đó.

**Tác động:** chỉ điền URL/key hoặc đổi APPRAISAL_MODE sang cloud chưa đủ để vận hành. Có thể lỗi schema/quyền hoặc tạo hai bộ dữ liệu và identity.

**Hướng xử lý:** lập baseline schema thực tế, thống nhất identity và scope, map dữ liệu cũ, bổ sung migration tương thích có đối soát và rollback. Chưa áp migration trong đợt này.

### S01 — P0 — RPC hồ sơ mới trong repo nhận toàn bộ payload

**Bằng chứng mã nguồn:** `supabase/migrations/20260927000002_appraisal_workspace.sql:47`, `:62`, `:90`, `:108`. Function có kiểm tra actor/scope/revision/audit prefix, nhưng nhận toàn bộ JSON do caller cung cấp và cấp EXECUTE authenticated. Kiểm tra trường dùng `<>` chưa an toàn khi key thiếu sinh NULL; guard leadership chỉ áp khi `finalReview` mới khác null. Nội dung runs/findings/status không được ràng buộc đầy đủ như thao tác FastAPI.

**Tác động:** nếu triển khai nguyên trạng, caller có phạm vi có thể bỏ qua nhiều kiểm tra nghiệp vụ, giả/sửa payload kết quả hoặc xóa review; audit table có actor thật nhưng phần nội dung event vẫn do payload cung cấp. Không kết luận đã có lỗi này trên cloud vì function hiện chưa tồn tại ở đó.

**Hướng xử lý:** RPC theo command nhỏ, field allowlist và transition; trường bắt buộc dùng kiểm tra null-safe; kết quả AI chỉ do worker ghi; snapshot/review đã duyệt bất biến; audit sinh ở server. Bổ sung ca kiểm thử gọi trực tiếp RPC sau khi duyệt triển khai.

### D01 — P1 — UI và danh mục hồ sơ còn phụ thuộc mock

**Bằng chứng:** `src/pages/ProjectsPage.tsx:20`, `src/pages/AppraisalPage.tsx:19`, `:64`, `:71`, `:83`; Dashboard/Organizations/Personnel/GIS/Documents cũng import dữ liệu mẫu. AppraisalPage chọn/mở dự án dựa vào `MOCK_PROJECTS`; dự án cloud mới ngoài catalog chưa được xử lý thống nhất.

**Hướng xử lý:** API danh mục phân quyền và resolver EntityLink; cùng repository cho danh sách tổng, panel dự án và form tạo/liên kết. Bảo toàn dữ liệu mô phỏng trong môi trường demo riêng.

### D02 — P1 — Fallback mock che lỗi và mapper tự điền dữ liệu nghiệp vụ

**Bằng chứng:** `src/services/projectService.ts:14` truy vấn select toàn cột không phân trang; lỗi hoặc rỗng trả mock. Mapper trộn dữ liệu cloud với mock, mặc định nhóm/cấp/ngày/chủ đầu tư; `getById` tải danh sách rồi tìm. Organization/personnel service có mô hình tương tự.

**Hướng xử lý:** phân biệt lỗi/rỗng/demo, truy vấn đúng ID, projection và paging DB, mapper có schema; dữ liệu chưa rõ giữ null/unknown. Không dùng `||` làm mất số 0 hợp lệ.

### D03 — P1 — Gắn dự án chưa kiểm tra nguồn dữ liệu chính

**Bằng chứng:** `ai/app/main.py:151` nhận projectId/name/code từ client rồi cập nhật; schema hồ sơ JSON chưa có FK dự án.

**Hướng xử lý:** server resolve dự án, kiểm tra scope, FK và trạng thái; đổi liên kết phải audit và làm hết hiệu lực kết quả liên quan. Không gộp các lần nộp chỉ theo tên.

### P01 — P1 — Bộ lọc/sort chưa áp dụng toàn bộ hồ sơ

**Bằng chứng:** `ai/app/store.py:56` phân trang 100 payload, đã lọc procedure/project; bộ lọc tìm kiếm/trạng thái/ngày và sort còn xử lý trang đang tải ở frontend. Store lấy toàn bộ JSON chứa tài liệu, đoạn trích, runs và audit rồi mới tạo summary.

**Hướng xử lý:** query parameter chuẩn, WHERE/sort/paging/count trong DB; projection danh sách; tải tab/lịch sử theo yêu cầu; index theo scope và bộ lọc thật.

### J01 — P1 — Job phụ thuộc tiến trình; GET có thể sửa hồ sơ

**Bằng chứng:** `ai/app/main.py:20` executor 2 thread và active_jobs trong RAM; `:159` GET hồ sơ coi job không có trong set là interrupted và ghi lại. Restart/multiple workers không có lease chung. Worker giữ Store/token người dùng trong tác vụ.

**Hướng xử lý:** job/outbox/lease bền vững, idempotency, worker identity giới hạn, revision/snapshot; GET chỉ đọc. Cancel phải diễn đạt đúng việc request model đã gửi có thể vẫn tốn chi phí.

### F01 — P1 — Upload đồng bộ và có cửa sổ tệp mồ côi

**Bằng chứng:** `ai/app/main.py:204` đọc tệp đồng bộ, lưu tệp trước khi save hồ sơ CAS; upload base64 qua JSON và Core proxy. Giới hạn định dạng/dung lượng/giải nén đã có là điểm cần giữ.

**Hướng xử lý:** upload session, finalize, parse/OCR job, dọn object mồ côi, giới hạn tài nguyên parser và kiểm tra tệp độc hại; Storage private và quyền theo hồ sơ.

### A01 — P1/P2 — Chưa có đánh giá chất lượng AI và truy hồi đầy đủ

**Bằng chứng:** `ai/app/provider.py:59` dừng chọn đoạn khi vượt 55.000 ký tự; tối đa 8 nhận xét; xác thực ID nguồn có thật nhưng chưa xác thực tự động rằng nguồn hỗ trợ nhận xét. Runtime báo OCR chưa sẵn sàng. Câu trả lời LegalAiPage/AiChatWidget còn dữ liệu dựng sẵn.

**Hướng xử lý:** giữ Gemini 3.8 Flash; snapshot/token budget/truy hồi theo nội dung; OCR theo trang; trường quan trọng do chuyên viên xác nhận; đánh giá bằng tập chuẩn; telemetry token/cost/latency và provenance version. Trạng thái probe thành công không đồng nghĩa nghiệp vụ đã được nghiệm thu.

### L01 — P0/P1 — Ngày hiệu lực và nguồn pháp lý chưa thống nhất

**Bằng chứng:** `src/pages/LegalAiPage.tsx:11`, `:19`, `:27` viết hiệu lực NĐ 217 là 15/05/2026. Nguồn chính thức ghi ban hành 19/06/2026, hiệu lực 01/07/2026: [Cổng văn bản Chính phủ](https://vanban.chinhphu.vn/?classid=1&docid=218509&pageid=27160&typegroupid=4).

**Hướng xử lý:** registry pháp lý được duyệt dùng chung; rà cả tóm tắt nội dung và mẫu, không chỉ sửa ngày. Kế thừa nghiên cứu kho văn bản nhưng không coi toàn bộ bản chuyển đổi đã được kiểm chứng. Áp dụng chỉ đạo sau 01/07 và quản lý chuyển tiếp riêng.

### W01 — P1 — Ba nghiệp vụ chưa đầy đủ quy trình riêng

**Bằng chứng:** GPXD/nghiệm thu dùng workspace tiếp nhận chung; BCNCKT có review/rules chuyên biệt. Cloud có state machine cũ ở cấp `projects`, trong khi mô hình mới quản lý nhiều lần nộp theo nghiệp vụ.

**Hướng xử lý:** đưa workflow xuống hồ sơ/lần nộp, quy trình riêng và liên kết kết quả giai đoạn trước. Rà SLA cloud hiện tại: deadline do caller truyền, một bộ đếm bổ sung/gia hạn chưa đủ biểu diễn các nhánh và điều kiện pháp lý. Các hàm ngày làm việc/dashboard hiện có phải rà và tái sử dụng khi đúng.

### U01 — P1/P2 — Chuẩn UI và auth chưa xuyên suốt

**Bằng chứng:** App.tsx chưa có auth guard toàn ứng dụng; AppLayout còn danh tính dựng sẵn; SettingsPage hiển thị trạng thái DVC Online bằng text tĩnh. AppraisalPage và ProjectDetailSlidePanel import vòng. MasterTable cũ và DossierGrid mới có mức hỗ trợ bảng khác nhau. Một số HTML title và màu cứng còn tồn tại; phép đếm pattern không được coi là toàn bộ vi phạm vì `title` cũng có thể là prop component.

**Hướng xử lý:** AuthProvider, đăng xuất thật, cache theo account, resolver panel trung tâm, UI chuẩn chung, tooltips/guards/resize/sort/filter persistence/dark/theme; lazy-load PDF/GIS/charts và dữ liệu tab.

### O01 — P1/P2 — Chưa có chuỗi vận hành tái lập trong repo

**Bằng chứng:** Core hiện là proxy trong `services/core/main.ts`; chưa có module nghiệp vụ/DTO/OpenAPI tại đó. `tsconfig.json` strict false và chỉ include src; chưa typecheck Core riêng. Package scripts chưa có lint/UI/CI chuẩn; chưa thấy `.github/workflows`. Python requirements có khoảng phiên bản, chưa có khóa dependency đầy đủ.

**Hướng xử lý:** giữ stack và port hiện tại, thêm module/API contract, lock/venv, CI, container, liveness/readiness, log/metrics, budget AI, backup cả DB+tệp và phục hồi. Chưa có số đo tải để hứa mức tối ưu đạt được.

## 4. Những điểm đã làm đúng cần giữ

- File gốc, hash và version; các kết quả máy có nguồn và nhãn cần chuyên viên xác nhận.
- Revision chống ghi đè; thay dữ liệu khiến kết quả cũ cần rà lại; không tự biến model thành người phê duyệt.
- Các trang mẫu và hồ sơ mô phỏng đã liên kết cùng dự án; ba nghiệp vụ được đặt trong Quản lý dự án.
- Cloud RLS đã bật ở phần lớn bảng, view lịch sử là security invoker; cần sửa policy/grant chứ không suy ra RLS chưa tồn tại.
- Worker cloud hiện có kiểm tra Supabase JWT và profile; Core là proxy mỏng không đồng nghĩa toàn luồng không có auth.
- Credential Vertex ngoài repo, prompt có hướng dẫn chống làm theo chỉ dẫn trong tài liệu, xử lý lỗi có hạn chế lộ chi tiết; cần tiếp tục tách identity ứng dụng khi vận hành thật.
- Khung DOCX/PDF A4 và UI theme tokens/guard/grid mới là nền tảng dùng lại.

## 5. Giới hạn và công việc tiếp theo

Không sửa ngay các phát hiện P0 vì người dùng yêu cầu lập kế hoạch và quy tắc Plan-First yêu cầu chờ review. Chưa kiểm thử ghi dữ liệu trái quyền hay xác nhận có người đã khai thác cấu hình này. Kế hoạch triển khai phải đưa C01/C02/C03 và S01 thành gate đầu tiên, có backup, kiểm thử quyền và rollback.

Xem [kế hoạch triển khai](D:/01_Projects/cic-qlhd-SXD/implementation_plan.md) để biết kiến trúc đích, file cần sửa, giai đoạn và tiêu chí nghiệm thu. Bản kế hoạch BCNCKT cũ đã được lưu nguyên trạng trong `docs/plans/20260927-ke-hoach-bcnckt-truoc-ra-soat-full-stack.md`.
